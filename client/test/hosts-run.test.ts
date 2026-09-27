import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

/**
 * A run's own ssh stood in for so nothing is really spawned: what matters
 * here is which control_request the run keeps waiting on, and that an answer
 * only settles the question it answers once it has truly reached a live
 * writer rather than the moment it is merely handed to `stdin`.
 */
vi.mock('../src/main/hosts/ssh', () => ({ runOn: vi.fn(), spawnOn: vi.fn(), sshProblem: vi.fn(() => 'problem') }))

import { ATTACHED } from '../src/main/hosts/run-script'
import { RemoteRun } from '../src/main/hosts/run'
import { runOn, spawnOn } from '../src/main/hosts/ssh'

const fakeHost = { id: 'devbox', name: 'devbox', address: 'devbox.local', user: 'leo', port: 22, auth: 'key' as const }

/** A fake reader: a real stream, so lines written to its stdout flow through the run's own line splitter as a real one's would. `stdout` is handed back typed as the real stream it is, since the child's own declared type only ever promises a `Readable`. */
function fakeReader(): { readonly child: ReturnType<typeof spawnOn>; readonly stdout: PassThrough } {
  const stdout = new PassThrough()
  const child = new EventEmitter()
  return {
    child: Object.assign(child, { stdout, stderr: new PassThrough(), stdin: new PassThrough(), exitCode: null, conn: 'c', kill: vi.fn(() => true) }) as unknown as ReturnType<typeof spawnOn>,
    stdout,
  }
}

/** A fake writer whose stdin's own `writable` is controlled from the test, so a call to `stdin.write` can be made to land while none is live. */
function fakeWriter(writable: { value: boolean }): { readonly child: ReturnType<typeof spawnOn>; readonly written: Buffer[] } {
  const written: Buffer[] = []
  const child = new EventEmitter()
  const stdin = {
    get writable() {
      return writable.value
    },
    write: (chunk: Buffer): boolean => {
      written.push(Buffer.from(chunk))
      return true
    },
    end: () => undefined,
    on: () => undefined,
  }
  return { child: Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough(), stdin, exitCode: null, conn: 'w', kill: vi.fn(() => true) }) as unknown as ReturnType<typeof spawnOn>, written }
}

/** Flushes the microtasks `#begin`'s own awaits need to reach `#read`/`#openWriter`. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

describe("a run's own control_request bookkeeping", () => {
  it('waits only on a can_use_tool request, since claude-read.ts never turns any other subtype into a card that gets answered', async () => {
    vi.mocked(runOn).mockReset()
    vi.mocked(spawnOn).mockReset()
    vi.mocked(runOn).mockResolvedValue({ code: 0, out: Buffer.from('alive'), err: '' })
    const { child: reader, stdout } = fakeReader()
    const writerWritable = { value: true }
    const { child: writer } = fakeWriter(writerWritable)
    vi.mocked(spawnOn).mockImplementation((_host, _setup, script) => (script.includes('"$d/in"') ? writer : reader))
    const pending = vi.fn()
    new RemoteRun({ host: () => fakeHost, setup: () => ({ env: {} }), id: 's-1', cwd: '/home/leo', argv: ['claude'], attach: 0, pending })
    await settle()

    stdout.write(`${ATTACHED}\n`)
    stdout.write(`${JSON.stringify({ type: 'control_request', request_id: 'r1', request: { subtype: 'can_use_tool' } })}\n`)
    await settle()
    expect(pending).toHaveBeenCalledWith(expect.any(Number), undefined)
    pending.mockClear()

    // A control_request of any other subtype is never answered (see claude-read.ts): tracking it too would pin the saved offset behind a request that never settles.
    stdout.write(`${JSON.stringify({ type: 'control_request', request_id: 'r2', request: { subtype: 'hook_callback' } })}\n`)
    await settle()
    // Still the earliest outstanding request is r1's own byte, unmoved by r2: the pending offset told is exactly what it was before, not r2's.
    expect(pending).not.toHaveBeenCalledWith(undefined, expect.anything())
  })
})

describe("settling a run's control_response", () => {
  it('settles the question an answer answers only once it has reached a live writer, not the moment it is merely queued for one', async () => {
    vi.mocked(runOn).mockReset()
    vi.mocked(spawnOn).mockReset()
    vi.mocked(runOn).mockResolvedValue({ code: 0, out: Buffer.from('alive'), err: '' })
    const { child: reader, stdout } = fakeReader()
    const firstWritable = { value: false }
    const first = fakeWriter(firstWritable)
    const secondWritable = { value: true }
    const second = fakeWriter(secondWritable)
    let writers = 0
    vi.mocked(spawnOn).mockImplementation((_host, _setup, script) => {
      if (!script.includes('"$d/in"')) return reader
      writers += 1
      return writers === 1 ? first.child : second.child
    })
    const pending = vi.fn()
    const run = new RemoteRun({ host: () => fakeHost, setup: () => ({ env: {} }), id: 's-1', cwd: '/home/leo', argv: ['claude'], attach: 0, pending })
    await settle()

    stdout.write(`${ATTACHED}\n`)
    stdout.write(`${JSON.stringify({ type: 'control_request', request_id: 'r1', request: { subtype: 'can_use_tool' } })}\n`)
    await settle()
    pending.mockClear()

    // The first writer is not truly live: the answer is only ever queued against it, never settled.
    const answer = `${JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: 'r1' } })}\n`
    run.stdin.write(Buffer.from(answer))
    await settle()
    expect(pending).not.toHaveBeenCalled()
    expect(first.written.some((chunk) => chunk.toString('utf8').includes('r1'))).toBe(false)

    // The first writer goes, and a live one opens in its place: only now does the buffered answer reach a writer and settle.
    first.child.emit('close')
    await settle()
    expect(second.written.some((chunk) => chunk.toString('utf8').includes('r1'))).toBe(true)
    expect(pending).toHaveBeenCalledWith(undefined, expect.any(Number))
  })
})
