import { afterEach, expect, it, vi } from 'vitest'

import { Secrets } from '../src/core/secrets'
import type { BrokerOps } from '../src/core/broker'

afterEach(() => { vi.useRealTimers() })

function fixture() {
  let state = 'sent'
  const collects: number[] = []
  const notices: string[] = []
  let saved: (() => void) | undefined
  let stopped = 0
  const broker = {
    list: () => Promise.resolve({ secrets: [] }),
    prepare: () => Promise.resolve({ brokerKey: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }),
    accept: () => Promise.resolve({ expiresAt: undefined }),
  } as unknown as BrokerOps & { run: never }
  const relay = (body: object): Promise<{ status: number; json: Record<string, unknown> }> => {
    const ask = body as { action: string }
    if (ask.action === 'open') return Promise.resolve({ status: 200, json: { expiresAt: Date.now() + 900_000 } })
    collects.push(Date.now())
    if (state !== 'saved') return Promise.resolve({ status: 200, json: { state } })
    state = 'collected'
    return Promise.resolve({ status: 200, json: { state: 'saved', ciphertext: {}, lifetime: 'once', user: '', device: '' } })
  }
  const secrets = new Secrets({ broker: () => broker, notify: (_task, title) => notices.push(title), relay, ready: (_owner, heard) => { saved = heard; return () => { stopped++ } } })
  return { secrets, collects, notices, save: () => { state = 'saved'; saved?.() }, stopped: () => stopped }
}

it('asks the relay once the saved note arrives, not every few seconds', async () => {
  vi.useFakeTimers()
  const f = fixture()
  await f.secrets.request({ name: 'api-key', kind: 'command', places: ['sh'], taskId: 't' })
  await vi.advanceTimersByTimeAsync(50_000)
  expect(f.collects.length).toBeLessThanOrEqual(1)
  f.save()
  await vi.advanceTimersByTimeAsync(10)
  expect(f.notices).toEqual(['api-key was entered'])
  expect(f.stopped()).toBe(1)
  f.secrets.dispose()
})

it('checks only once a minute while no note is heard', async () => {
  vi.useFakeTimers()
  const f = fixture()
  await f.secrets.request({ name: 'api-key', kind: 'command', places: ['sh'], taskId: 't' })
  await vi.advanceTimersByTimeAsync(61_000)
  expect(f.collects.length).toBe(1)
  f.secrets.dispose()
})
