import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'

import type { HostConfig } from '../../shared/hosts'
import { lineSplitter } from './lines'
import { aliveScript, ATTACHED, attachInScript, attachOutScript, startScript, stopScript } from './run-script'
import { runOn, spawnOn, sshProblem } from './ssh'
import type { SshSetup } from './ssh'

/**
 * One conversation's `claude` running on a host, held from here as if it were
 * a process of this computer's: lines go in on `stdin`, lines come out on
 * `stdout`, and `close` is said once, when it has ended.
 *
 * What makes it more than an ssh is that the connection is not the process.
 * The run keeps going on the host when the connection drops (see
 * `run-script.ts`), and this reconnects by itself, reading on from the byte it
 * had reached, so nothing said meanwhile is lost and nothing is said twice.
 */

/** How long to wait before each try to reconnect, then every 30 s. */
export const RETRIES = [1_000, 2_000, 4_000, 8_000, 15_000]
const EVERY = 30_000

export const retryAfter = (tries: number): number => RETRIES[tries] ?? EVERY

export interface RunOptions {
  readonly host: () => HostConfig
  readonly setup: () => SshSetup
  readonly id: string
  readonly cwd: string
  readonly argv: readonly string[]
  /** Pick up a run already there, from this many bytes of its output, instead of starting one. */
  readonly attach?: number
  /** The bytes of output read so far, each time that grows, so a restart of GeckIt reads on from there. */
  readonly read?: (offset: number) => void
  /**
   * Where the earliest question Claude Code asked and nobody has answered yet
   * begins, or nothing: a restart reads on from there, so the card comes up
   * again rather than the conversation waiting on an answer it cannot see.
   * Cleared with `at`, the run's own offset right then, so a restart just
   * after the last one settles reads on from there rather than staying capped
   * at a question already answered.
   */
  readonly pending?: (offset: number | undefined, at?: number) => void
  /** The connection came up, or went. */
  readonly link?: (up: boolean) => void
  /** Reaches the host first: nothing where a conversation can run there, or why it cannot. */
  readonly ready?: () => Promise<string | undefined>
  /** A new run was started, rather than one picked up. */
  readonly started?: () => void
}

export class RemoteRun extends EventEmitter {
  readonly stdin: Writable
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly #options: RunOptions
  #offset: number
  #reader: ChildProcessWithoutNullStreams | undefined
  #writer: ChildProcessWithoutNullStreams | undefined
  /** Lines written while no connection could take them, sent in order once one can. */
  #waiting: Buffer[] = []
  #tries = 0
  #timer: NodeJS.Timeout | undefined
  #over = false
  #started = false
  /** Disconnected by hand: nothing reconnects until Connect. */
  #paused = false
  /** What `kill`'s own stop script settles to, for something that needs to know it is done there. */
  #stopped: Promise<void> | undefined
  /** Questions Claude Code asked and has had no answer to, by id, at the byte each began. */
  readonly #asked = new Map<string, number>()

  constructor(options: RunOptions) {
    super()
    this.#options = options
    this.#offset = options.attach ?? 0
    this.stdin = new Writable({
      write: (chunk: Buffer, _encoding, done) => {
        this.#write(chunk)
        done()
      },
      final: (done) => done(),
    })
    void this.#begin()
  }

  get offset(): number {
    return this.#offset
  }

  async #begin(): Promise<void> {
    const problem = await this.#options.ready?.()
    if (this.#over) return
    if (problem !== undefined) {
      this.stderr.write(problem)
      this.#end()
      return
    }
    let attach = this.#options.attach !== undefined
    if (attach) {
      const alive = await runOn(this.#options.host(), this.#options.setup(), aliveScript(this.#options.id), { timeout: 30_000 })
      if (this.#over) return
      // Gone while nobody was looking: what it wrote is in the conversation's file, and it is started again from there.
      if (alive.out.toString('utf8').trim() !== 'alive') {
        attach = false
        this.#offset = 0
      }
    }
    if (!attach) {
      const ran = await runOn(this.#options.host(), this.#options.setup(), startScript(this.#options.id, this.#options.cwd, this.#options.argv), { timeout: 60_000 })
      if (this.#over) return
      if (ran.code !== 0 || !ran.out.toString('utf8').includes('started')) {
        const why = ran.err === '' ? ran.out.toString('utf8').trim() : sshProblem(ran.err, this.#options.host().name, this.#options.host().user)
        this.stderr.write(why)
        this.#end()
        return
      }
      this.#options.started?.()
    }
    this.#started = true
    this.#read()
    this.#openWriter()
  }

  /** The reader: everything the run writes, from the byte reached, until it ends or the connection does. */
  #read(): void {
    if (this.#over) return
    const reader = spawnOn(this.#options.host(), this.#options.setup(), attachOutScript(this.#options.id, this.#offset))
    this.#reader = reader
    let first = true
    let ended = false
    const split = lineSplitter((line, bytes) => {
      if (first && line === ATTACHED) {
        first = false
        this.#tries = 0
        this.#options.link?.(true)
        return
      }
      first = false
      const began = this.#offset
      this.#offset += bytes
      this.#heard(line, began)
      if (line.startsWith('{"type":"geckit_exit"')) {
        ended = true
        this.#options.read?.(this.#offset)
        this.#end()
        return
      }
      this.stdout.write(`${line}\n`)
      this.#options.read?.(this.#offset)
    })
    reader.stdout.on('data', split)
    reader.stderr.on('data', (chunk: Buffer) => this.emit('sshError', chunk.toString('utf8')))
    reader.stdin.end()
    const lost = (): void => {
      if (this.#reader !== reader) return
      this.#reader = undefined
      if (ended || this.#over || this.#paused) return
      this.#options.link?.(false)
      this.#again()
    }
    reader.on('close', lost)
    reader.on('error', lost)
  }

  /** Tries again after a while, longer each time up to every 30 s. */
  #again(): void {
    clearTimeout(this.#timer)
    const wait = retryAfter(this.#tries)
    this.#tries += 1
    this.#timer = setTimeout(() => {
      this.#read()
      if (this.#writer === undefined) this.#openWriter()
    }, wait)
  }

  /** Stops reading and writing here while the run goes on there, for Disconnect. */
  pause(): void {
    if (this.#over) return
    this.#paused = true
    clearTimeout(this.#timer)
    const reader = this.#reader
    const writer = this.#writer
    this.#reader = undefined
    this.#writer = undefined
    reader?.kill()
    writer?.kill()
  }

  /** Tries at once, as Reconnect in the chip's menu and Connect do. */
  now(): void {
    this.#paused = false
    if (this.#over || this.#reader !== undefined || !this.#started) return
    this.#tries = 0
    clearTimeout(this.#timer)
    this.#read()
    if (this.#writer === undefined) this.#openWriter()
  }

  /**
   * Drops whatever connection is open and opens another at once, reading
   * `#options.host()` again rather than what an open connection was made
   * with: for a host edited to another address or account underneath a run
   * still going, so it moves to the new one instead of carrying on, however
   * briefly, against the old.
   */
  reconnect(): void {
    if (this.#over || this.#paused || !this.#started) return
    clearTimeout(this.#timer)
    this.#tries = 0
    const reader = this.#reader
    const writer = this.#writer
    this.#reader = undefined
    this.#writer = undefined
    reader?.kill()
    writer?.kill()
    this.#read()
    this.#openWriter()
  }

  /** The writer: what is sent goes into the run's input, over a connection of its own. */
  #openWriter(): void {
    if (this.#over || this.#paused || !this.#started || this.#writer !== undefined) return
    const writer = spawnOn(this.#options.host(), this.#options.setup(), attachInScript(this.#options.id))
    this.#writer = writer
    writer.stdin.on('error', () => undefined)
    writer.stdout.resume()
    writer.stderr.resume()
    // A line cut off by the last connection dropping mid-write is ended here, so the next one is whole.
    writer.stdin.write('\n')
    // Only reaching a live writer settles the questions these answer (see `#settle`): buffered here, they are not yet, so a quit before this moment still finds them outstanding and asks the card again.
    for (const chunk of this.#waiting.splice(0)) {
      writer.stdin.write(chunk)
      this.#settle(chunk)
    }
    const gone = (): void => {
      if (this.#writer === writer) this.#writer = undefined
      // What was being written when it went is the reader's business to notice; the next write opens another.
      if (this.#waiting.length > 0 && this.#reader !== undefined) this.#openWriter()
    }
    writer.on('close', gone)
    writer.on('error', gone)
  }

  /** Where the earliest question still asked and not answered begins, or the run's own offset once none is: told on so the offset kept for a restart is never capped behind one already settled (see `runs.ts`'s `pending`). */
  #tellPending(): void {
    const earliest = this.#asked.size === 0 ? undefined : Math.min(...this.#asked.values())
    this.#options.pending?.(earliest, earliest === undefined ? this.#offset : undefined)
  }

  /** Keeps the questions asked and not answered, and says where the earliest of them begins. Only a `can_use_tool` request is ever answered (see `claude-read.ts`); tracking any other subtype would pin the offset behind a request nobody will settle. */
  #heard(line: string, began: number): void {
    if (!line.startsWith('{"type":"control_')) return
    const said = readControl(line)
    if (said === undefined) return
    if (said.type === 'control_request') {
      if (requestSubtype(line) === 'can_use_tool') this.#asked.set(said.id, began)
    } else {
      this.#asked.delete(said.id)
    }
    this.#tellPending()
  }

  /** An answer going to Claude Code settles the question it answers, but only once it has actually reached a live writer (see `#openWriter` and the direct-write branch below): buffered while none is, it stays outstanding, so a quit before one opens does not move the offset past a request nothing has truly carried yet. */
  #settle(chunk: Buffer): void {
    for (const line of chunk.toString('utf8').split('\n')) {
      const said = line.startsWith('{"type":"control_response"') ? readControl(line) : undefined
      if (said === undefined || !this.#asked.delete(said.id)) continue
      this.#tellPending()
    }
  }

  #write(chunk: Buffer): void {
    if (this.#over) return
    const writer = this.#writer
    if (writer === undefined || writer.exitCode !== null || !writer.stdin.writable) {
      this.#waiting.push(Buffer.from(chunk))
      this.#openWriter()
      return
    }
    writer.stdin.write(chunk)
    this.#settle(chunk)
  }

  /** Stops the run on the host too. */
  kill(): boolean {
    if (this.#over) return false
    const host = this.#options.host()
    const setup = this.#options.setup()
    const id = this.#options.id
    this.#end()
    this.#stopped = runOn(host, setup, stopScript(id), { timeout: 30_000 }).then(() => undefined)
    return true
  }

  /** Settles once the stop script sent by `kill` has finished on the host, or at once where nothing was sent. */
  stopped(): Promise<void> {
    return this.#stopped ?? Promise.resolve()
  }

  /** Lets go of it here and leaves it running there, for GeckIt quitting. */
  leave(): void {
    if (this.#over) return
    this.#over = true
    clearTimeout(this.#timer)
    this.#reader?.kill()
    this.#writer?.kill()
  }

  #end(): void {
    if (this.#over) return
    this.#over = true
    clearTimeout(this.#timer)
    this.#reader?.kill()
    this.#writer?.stdin.end()
    this.#writer?.kill()
    this.stdout.end()
    this.stderr.end()
    this.emit('close', 0)
  }
}

/** A control line's type and the id of the question it asks, answers or takes back; nothing for any other line. */
export function readControl(line: string): { readonly type: string; readonly id: string } | undefined {
  try {
    const read = JSON.parse(line) as { type?: unknown; request_id?: unknown; response?: { request_id?: unknown } }
    const id = typeof read.request_id === 'string' ? read.request_id : typeof read.response?.request_id === 'string' ? read.response.request_id : undefined
    return typeof read.type === 'string' && id !== undefined ? { type: read.type, id } : undefined
  } catch {
    return undefined
  }
}

/** A control_request line's own subtype, which decides whether GeckIt will ever answer it (see `claude-read.ts`, where only `can_use_tool` becomes a card). */
function requestSubtype(line: string): string | undefined {
  try {
    const read = JSON.parse(line) as { request?: { subtype?: unknown } }
    return typeof read.request?.subtype === 'string' ? read.request.subtype : undefined
  } catch {
    return undefined
  }
}
