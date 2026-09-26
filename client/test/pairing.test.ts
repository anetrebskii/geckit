import { describe, expect, it } from 'vitest'

import { assembler, FRAME, framesOf, newKey, packed, pairingLink, readPairing, roomOf, seal, SIGNAL, unpacker, unseal } from '../src/shared/pairing'
import type { LinkMessage } from '../src/shared/pairing'

describe('pairing', () => {
  it('reads back the link it writes', () => {
    const pairing = { key: newKey(), signal: SIGNAL }
    expect(readPairing(pairingLink(pairing))).toEqual(pairing)
  })

  it('takes no other code for a pairing', () => {
    expect(readPairing('https://example.com')).toBeUndefined()
    expect(readPairing('geckit://pair?k=short&s=https%3A%2F%2Fa.b')).toBeUndefined()
    expect(readPairing(`geckit://pair?k=${newKey()}&s=http%3A%2F%2Fa.b`)).toBeUndefined()
  })

  it('meets in a room that does not give the key away', async () => {
    const key = newKey()
    const room = await roomOf(key)
    expect(room).toMatch(/^[0-9a-f]{64}$/)
    expect(room).toBe(await roomOf(key))
    expect(room).not.toContain(key)
  })

  it('opens what it sealed, and nothing sealed with another key or changed', async () => {
    const key = newKey()
    const box = await seal(key, { sdp: 'v=0', at: 1 })
    expect(await unseal(key, box)).toEqual({ sdp: 'v=0', at: 1 })
    expect(await unseal(newKey(), box)).toBeUndefined()
    expect(await unseal(key, `${box.slice(0, -2)}AA`)).toBeUndefined()
  })

  it('sends a large message in pieces and puts it back together in any order', () => {
    const message = { t: 'tell', channel: 'chat:items', value: 'x'.repeat(FRAME * 2 + 5) } as const
    const frames = framesOf(message, 7)
    expect(frames).toHaveLength(3)
    const put = assembler()
    expect(put(frames[2]!)).toBeUndefined()
    expect(put(frames[0]!)).toBeUndefined()
    expect(put(frames[1]!)).toEqual(message)
  })
})

describe('deflated messages', () => {
  it('come back as they went, whole, from pieces in any order', async () => {
    const random = [...crypto.getRandomValues(new Uint8Array(30_000))].map((one) => one.toString(16).padStart(2, '0')).join('')
    const message: LinkMessage = { t: 'tell', channel: 'chat:items', value: { text: random, again: 'Hello '.repeat(5000) } }
    const pieces = await packed(message, 7)
    expect(pieces.length).toBeGreaterThan(1)
    expect(pieces.reduce((all, one) => all + one.byteLength, 0)).toBeLessThan(JSON.stringify(message).length)
    const unpack = unpacker()
    const heard: (LinkMessage | undefined)[] = []
    for (const piece of [...pieces].reverse()) heard.push(await unpack(piece))
    expect(heard.slice(0, -1).every((one) => one === undefined)).toBe(true)
    expect(heard.at(-1)).toEqual(message)
  })
})
