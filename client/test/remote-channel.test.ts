import { describe, expect, it } from 'vitest'

import { remoteChannel } from '../src/shared/remote/channel'
import type { RawChannel } from '../src/shared/remote/channel'

function pair(binary = true) {
  const hear: ((data: string | ArrayBuffer) => void)[] = []
  const wire = { text: 0, binary: 0 }
  const raw = (other: number): RawChannel => ({
    send: (text) => { wire.text++; hear[other]?.(text) },
    ...(binary ? { sendBinary: (bytes: ArrayBuffer) => { wire.binary++; hear[other]?.(bytes) } } : {}),
    hear: (heard) => { hear.push(heard) },
    closed: () => undefined,
    close: () => undefined,
    buffered: () => 0,
    drain: () => undefined,
  })
  const left = remoteChannel(raw(1), Promise.resolve(''))
  const right = remoteChannel(raw(0), Promise.resolve(''))
  return { left, right, wire }
}

const settle = (): Promise<void> => new Promise((done) => setTimeout(done, 20))

describe('the remote channel', () => {
  it('sends plainly until told to compress, then deflated, and hears both in order', async () => {
    const { left, right, wire } = pair()
    const heard: string[] = []
    right.onMessage((text) => heard.push(text))
    const big = JSON.stringify({ items: Array.from({ length: 400 }, (_one, index) => ({ id: `t${String(index)}`, text: 'the same words again and again' })) })
    left.send('first')
    left.send(big)
    await settle()
    expect(wire.binary).toBe(0)
    left.compress?.(true)
    left.send(big)
    left.send('short')
    await settle()
    expect(heard).toEqual(['first', big, big, 'short'])
    expect(wire.binary).toBeGreaterThan(0)
    expect(wire.binary).toBeLessThan(big.length / 16_000)
  })

  it('stays plain on a link that cannot carry binary', async () => {
    const { left, right, wire } = pair(false)
    const heard: string[] = []
    right.onMessage((text) => heard.push(text))
    left.compress?.(true)
    left.send('x'.repeat(5000))
    await settle()
    expect(heard).toEqual(['x'.repeat(5000)])
    expect(wire.binary).toBe(0)
  })
})
