import { afterEach, expect, it, vi } from 'vitest'

const written: unknown[] = []
vi.mock('firebase/firestore/lite', async (actual) => ({ ...(await actual<object>()), setDoc: (...args: unknown[]) => { written.push(args); return Promise.resolve() } }))

const { presence, relayExists } = await import('../src/shared/remote/signaling')

afterEach(() => { vi.unstubAllGlobals(); written.length = 0 })

it('writes no presence when the signal service has no relay, and keeps it when it has or does not say', async () => {
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({ iceServers: [], relay: false, turn: false }))))
  await presence({ key: 'k'.repeat(43), signal: 'https://no-relay.example' })
  expect(written).toHaveLength(0)
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({ iceServers: [], relay: false }))))
  expect(await relayExists({ key: 'k'.repeat(43), signal: 'https://old-function.example' })).toBe(true)
  vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify({ iceServers: [], relay: false, turn: true }))))
  await presence({ key: 'k'.repeat(43), signal: 'https://relay.example' })
  expect(written).toHaveLength(1)
})
