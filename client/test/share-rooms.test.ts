import { describe, expect, it, vi } from 'vitest'

import { assembler, framesOf } from '../src/shared/pairing'
import type { LinkMessage } from '../src/shared/pairing'
import type { RawChannel } from '../src/shared/remote/channel'

const answered = new Map<string, (raw: RawChannel) => void>()
const stopped: string[] = []
vi.mock('../src/service/remote/transport', () => ({
  nodeAnswer: (pairing: { readonly key: string }, opened: (raw: RawChannel) => void) => {
    answered.set(pairing.key, opened)
    return () => stopped.push(pairing.key)
  },
}))

const { shareRooms } = await import('../src/service/remote/share-rooms')

function page() {
  const sent: LinkMessage[] = []
  const put = assembler()
  let hear: (data: string | ArrayBuffer) => void = () => undefined
  const raw: RawChannel = { send: (text) => { const message = put(text); if (message !== undefined) sent.push(message) }, hear: (heard) => { hear = heard }, closed: () => undefined, close: () => undefined, buffered: () => 0, drain: () => undefined }
  let m = 0
  return { raw, sent, say: (message: LinkMessage) => { for (const frame of framesOf(message, m++)) hear(frame) } }
}

describe('shared link rooms in the service', () => {
  it('answers a link page only about its own link, and tells it when the link ends', async () => {
    const calls: unknown[][] = []
    const rooms = shareRooms({
      about: (id) => { calls.push(['about', id]); return { kind: 'file', title: 'report.html', expiresAt: 1 } },
      fetch: () => Promise.reject(new Error('no')),
      read: (id, path) => { calls.push(['read', id, path]); return Promise.resolve({ kind: 'none', why: 'x' }) },
    })
    rooms.keep([{ id: 'link-1', key: 'link-key' }])
    const one = page()
    answered.get('link-key')?.(one.raw)
    one.say({ t: 'call', id: 1, name: 'chat.items', args: ['any'] })
    one.say({ t: 'call', id: 2, name: 'share.about', args: [] })
    one.say({ t: 'call', id: 3, name: 'share.read', args: ['a.txt'] })
    await vi.waitFor(() => expect(one.sent).toHaveLength(3))
    expect(one.sent).toEqual([
      { t: 'reply', id: 1, error: 'Not shared' },
      { t: 'reply', id: 2, value: { kind: 'file', title: 'report.html', expiresAt: 1 } },
      { t: 'reply', id: 3, value: { kind: 'none', why: 'x' } },
    ])
    expect(calls).toEqual([['about', 'link-1'], ['read', 'link-1', 'a.txt']])
    rooms.keep([])
    await vi.waitFor(() => expect(one.sent).toContainEqual({ t: 'tell', channel: 'share.ended', value: null }))
  })
})
