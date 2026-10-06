import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import { createInterface } from 'node:readline'
import WebSocket from 'ws'

import { planOnly } from './account'
import type { Held } from './claude'
import type { CodexEvent, Json, RpcId, RpcParams, RpcResults } from './codex-protocol'

export function codexEnvironment(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const kept = planOnly(env)
  for (const name of ['OPENAI_API_KEY', 'CODEX_API_KEY', 'OPENAI_BASE_URL', 'CODEX_THREAD_ID', 'CODEX_INTERNAL_ORIGINATOR_OVERRIDE']) delete kept[name]
  return kept
}

export function launchCodex(): Held {
  const env = codexEnvironment()
  const args = ['app-server', '--listen', 'stdio://', '-c', 'model_provider="openai"', '-c', 'forced_login_method="chatgpt"']
  if (process.platform === 'win32') {
    const key = Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH'
    for (const folder of (env[key] ?? '').split(delimiter)) {
      const script = join(folder, 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
      if (existsSync(script)) return spawn('node', [script, ...args], { cwd: homedir(), env, windowsHide: true, stdio: 'pipe' })
    }
  }
  return spawn('codex', args, { cwd: homedir(), env, windowsHide: true, stdio: 'pipe' })
}

export class CodexRpc {
  readonly #child: Held | undefined
  readonly #socket: WebSocket | undefined
  readonly #waiting = new Map<RpcId, { done: (line: string) => void; fail: (error: Error) => void }>()
  #next = 0
  #closed = false
  userAgent = ''
  readonly ready: Promise<void>

  constructor(launch: () => Held, event: (event: CodexEvent) => void, closed: (error: Error) => void) {
    let last = ''
    const failed = (error: Error): void => {
      if (this.#closed) return
      this.#closed = true
      for (const waiting of this.#waiting.values()) waiting.fail(error)
      this.#waiting.clear()
      closed(error)
    }
    const receive = (line: string): void => {
      try {
        const envelope = JSON.parse(line) as { id?: RpcId; method?: string }
        if (envelope.method !== undefined) {
          const message = JSON.parse(line) as CodexEvent
          event(message)
        } else if (envelope.id !== undefined) {
          const waiting = this.#waiting.get(envelope.id)
          this.#waiting.delete(envelope.id)
          waiting?.done(line)
        }
      } catch {
        return
      }
    }
    const socket = join(process.env['CODEX_HOME'] ?? join(homedir(), '.codex'), 'app-server-control', 'app-server-control.sock')
    if (launch === launchCodex && process.platform !== 'win32' && existsSync(socket)) {
      this.#socket = new WebSocket(`ws+unix://${socket}:/`)
      this.#socket.on('message', (data) => receive(data.toString()))
      this.#socket.on('error', failed)
      this.#socket.on('close', () => failed(new Error('Codex has disconnected.')))
    } else {
      this.#child = launch()
      this.#child.on('error', failed)
      this.#child.on('close', () => failed(new Error(last.trim() || 'Codex has stopped.')))
      this.#child.stdin.on('error', () => undefined)
      this.#child.stderr.on('data', (chunk: Buffer) => { last = `${last}${chunk.toString('utf8')}`.slice(-2000) })
      createInterface({ input: this.#child.stdout }).on('line', receive)
    }
    this.ready = this.request('initialize', { clientInfo: { name: 'geckit', title: 'GeckIt', version: '1.0.0' }, capabilities: { experimentalApi: true } }).then((result) => {
      this.userAgent = result.userAgent
      this.#write({ method: 'initialized' })
    })
    void this.ready.catch(() => undefined)
  }

  #write(message: object): void {
    if (this.#closed) return
    if (this.#socket !== undefined) {
      if (this.#socket.readyState === WebSocket.CONNECTING) this.#socket.once('open', () => this.#write(message))
      else if (this.#socket.readyState === WebSocket.OPEN) this.#socket.send(JSON.stringify(message))
    } else if (this.#child?.stdin.writable) this.#child.stdin.write(`${JSON.stringify(message)}\n`)
  }

  request<M extends keyof RpcParams>(method: M, params: RpcParams[M]): Promise<RpcResults[M]> {
    if (this.#closed) return Promise.reject(new Error('Codex has stopped.'))
    const id = ++this.#next
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#waiting.delete(id)
        reject(new Error(`Codex did not answer ${method}. Try again.`))
      }, 30_000)
      this.#waiting.set(id, {
        done: (line) => {
          clearTimeout(timer)
          const response = JSON.parse(line) as { result: RpcResults[M]; error?: { message: string } }
          if (response.error !== undefined) reject(new Error(response.error.message))
          else resolve(response.result)
        },
        fail: (error) => { clearTimeout(timer); reject(error) },
      })
      this.#write({ id, method, params })
    })
  }

  reply(id: RpcId, result: Json): void {
    this.#write({ id, result })
  }

  refuse(id: RpcId): void {
    this.#write({ id, error: { code: -32601, message: 'GeckIt does not support this Codex request.' } })
  }

  dispose(): void {
    if (this.#closed) return
    this.#closed = true
    const error = new Error('Codex has disconnected.')
    for (const waiting of this.#waiting.values()) waiting.fail(error)
    this.#waiting.clear()
    this.#socket?.terminate()
    this.#child?.stdin.end()
    this.#child?.kill()
  }
}
