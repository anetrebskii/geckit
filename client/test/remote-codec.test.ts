import { describe, expect, it } from 'vitest'
import { parseRemote, stringifyRemote } from '../src/shared/remote/codec'
import { requestOf } from '../src/shared/remote/protocol'
import type { RemoteRequest } from '../src/shared/remote/protocol'

describe('remote JSON codec', () => {
  it('preserves undefined method arguments rather than converting them to null', () => {
    const request: RemoteRequest = { type: 'core-call', id: 1, call: { method: 'chat:list', args: [undefined] } }
    const received = requestOf(stringifyRemote(request))
    expect(received).toEqual(request)
    if (received.type !== 'core-call') throw new Error('Wrong request')
    expect(received.call.args[0]).toBeUndefined()
  })

  it('carries recording bytes', () => {
    const bytes = new Uint8Array([0, 128, 255, 1])
    const request: RemoteRequest = { type: 'core-call', id: 2, call: { method: 'voice:videoPart', args: [bytes] } }
    expect(parseRemote(stringifyRemote(request))).toEqual(request)

  })

  it('carries Node Buffer results as Uint8Array-compatible bytes', () => {
    const request: RemoteRequest = { type: 'core-call', id: 4, call: { method: 'voice:videoPart', args: [Buffer.from([0, 128, 255])] } }
    const received = requestOf(stringifyRemote(request))
    if (received.type !== 'core-call' || received.call.method !== 'voice:videoPart') throw new Error('Wrong request')
    expect(received.call.args[0]).toBeInstanceOf(Uint8Array)
    expect([...received.call.args[0]]).toEqual([0, 128, 255])
  })
})
