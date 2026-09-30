import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { CORRECT_MODEL, correctKeeper, resultOf } from '../src/main/correct-session'

class Fake extends EventEmitter {
  readonly stdin = new PassThrough()
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly heard: string[] = []
  killed = false

  constructor(readonly args: readonly string[]) {
    super()
    this.stdin.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf8').split('\n')) if (line !== '') this.heard.push(line)
    })
  }

  kill(): boolean {
    this.killed = true
    return true
  }

  answer(result: string): void {
    this.stdout.write(`${JSON.stringify({ type: 'system', subtype: 'init' })}\n`)
    this.stdout.write(`${JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result })}\n`)
  }
}

const at = (started: readonly Fake[], index: number): Fake => {
  const one = started[index]
  if (one === undefined) throw new Error(`no process ${index}`)
  return one
}

const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

function keeper(now: () => Date = () => new Date(2026, 8, 30, 10), patience?: number) {
  const started: Fake[] = []
  const kept = correctKeeper(
    (args) => {
      const fake = new Fake(args)
      started.push(fake)
      return fake
    },
    now,
    patience,
  )
  return { kept, started }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('the session that holds a day of corrections', () => {
  it('is started at the first correction, on haiku, and answers each from its result line', async () => {
    const { kept, started } = keeper()
    expect(started).toHaveLength(0)
    const first = kept.ask('teh cat', 'Fix it.', '')
    await tick()
    expect(started).toHaveLength(1)
    expect(at(started, 0).args).toContain('stream-json')
    expect(at(started, 0).args.slice(at(started, 0).args.indexOf('--model'), at(started, 0).args.indexOf('--model') + 2)).toEqual([
      '--model',
      CORRECT_MODEL,
    ])
    expect(JSON.parse(at(started, 0).heard[0] ?? '')).toEqual({ type: 'user', message: { role: 'user', content: 'Fix it.\n\nteh cat' } })
    at(started, 0).answer('the cat')
    expect(await first).toEqual({ ok: true, text: 'the cat' })
  })

  it('sends a second correction only once the first is answered, to the same process', async () => {
    const { kept, started } = keeper()
    const first = kept.ask('one', 'Fix it.', '')
    const second = kept.ask('two', 'Fix it.', '')
    await tick()
    expect(at(started, 0).heard).toHaveLength(1)
    at(started, 0).answer('One.')
    expect(await first).toEqual({ ok: true, text: 'One.' })
    await tick()
    expect(at(started, 0).heard).toHaveLength(2)
    at(started, 0).answer('Two.')
    expect(await second).toEqual({ ok: true, text: 'Two.' })
    expect(started).toHaveLength(1)
  })

  it('is replaced by a fresh one at the first correction of a new day', async () => {
    let now = new Date(2026, 8, 30, 23, 59)
    const { kept, started } = keeper(() => now)
    const first = kept.ask('one', 'Fix it.', '')
    await tick()
    at(started, 0).answer('One.')
    await first
    now = new Date(2026, 9, 1, 0, 1)
    const second = kept.ask('two', 'Fix it.', '')
    await tick()
    expect(at(started, 0).killed).toBe(true)
    expect(started).toHaveLength(2)
    at(started, 1).answer('Two.')
    expect(await second).toEqual({ ok: true, text: 'Two.' })
  })

  it('is replaced when another model is picked', async () => {
    const { kept, started } = keeper()
    const first = kept.ask('one', 'Fix it.', '')
    await tick()
    at(started, 0).answer('One.')
    await first
    void kept.ask('two', 'Fix it.', 'sonnet')
    await tick()
    expect(at(started, 0).killed).toBe(true)
    expect(at(started, 1).args).toContain('sonnet')
  })

  it('reports a process that exited as the failed correction, and starts another for the next', async () => {
    const { kept, started } = keeper()
    const first = kept.ask('one', 'Fix it.', '')
    await tick()
    at(started, 0).stderr.write('Not logged in\n')
    await tick()
    at(started, 0).emit('close')
    expect(await first).toEqual({ ok: false, error: 'Not logged in' })
    const second = kept.ask('two', 'Fix it.', '')
    await tick()
    expect(started).toHaveLength(2)
    at(started, 1).answer('Two.')
    expect(await second).toEqual({ ok: true, text: 'Two.' })
  })

  it('takes down a process that did not answer in time and starts another for the next', async () => {
    const { kept, started } = keeper(undefined, 50)
    const first = kept.ask('one', 'Fix it.', '')
    expect(await first).toEqual({ ok: false, error: 'claude did not answer in time' })
    expect(at(started, 0).killed).toBe(true)
    const second = kept.ask('two', 'Fix it.', '')
    await tick()
    expect(started).toHaveLength(2)
    at(started, 1).answer('Two.')
    expect(await second).toEqual({ ok: true, text: 'Two.' })
  })

  it('is stopped when asked to', async () => {
    const { kept, started } = keeper()
    const first = kept.ask('one', 'Fix it.', '')
    await tick()
    at(started, 0).answer('One.')
    await first
    kept.stop()
    expect(at(started, 0).killed).toBe(true)
  })
})

describe('a result line', () => {
  it('is an error when the tool says so, and nothing when it is empty', () => {
    expect(resultOf(JSON.stringify({ type: 'result', is_error: true, result: 'Limit reached' }))).toEqual({ ok: false, error: 'Limit reached' })
    expect(resultOf(JSON.stringify({ type: 'result', is_error: false, result: '  ' }))).toEqual({ ok: false, error: 'It answered with nothing' })
  })

  it('is not read from any other line', () => {
    expect(resultOf(JSON.stringify({ type: 'assistant' }))).toBeUndefined()
    expect(resultOf('not json')).toBeUndefined()
    expect(resultOf('null')).toBeUndefined()
  })
})
