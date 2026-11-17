import { assembler, framesOf } from '../pairing'
import type { RemoteChannel } from './protocol'
export interface RawChannel { send(text: string): void; hear(heard: (text: string) => void): void; closed(closed: () => void): void; close(): void; buffered(): number; drain(ready: () => void): void }
export function remoteChannel(raw: RawChannel, binding: Promise<string>): RemoteChannel {
  let put = assembler()
  let chunks = 0
  let size = 0
  let at = Date.now()
  let sequence = 0
  let ended = false
  const waiting: string[] = []
  raw.closed(() => { ended = true; waiting.length = 0 })
  const drop = (reason: string): void => { if (ended) return; ended = true; waiting.length = 0; console.warn(`Remote channel closed: ${reason}`); raw.close() }
  const pump = (): void => { try { while (!ended && waiting.length > 0 && raw.buffered() < 1_000_000) raw.send(waiting.shift() ?? '') } catch (error) { drop(`sending failed: ${error instanceof Error ? error.message : String(error)}`) } }
  raw.drain(pump)
  const listeners: ((text: string) => void)[] = []
  const early: string[] = []
  const receive = (heard: (text: string) => void): void => raw.hear((text) => {
      try {
        // A message cut off by a quiet link is dropped; one still arriving is not.
        if (Date.now() - at > 30_000) { put = assembler(); chunks = 0; size = 0 }
        at = Date.now()
        const frame: unknown = JSON.parse(text)
        if (typeof frame !== 'object' || frame === null || !('m' in frame) || !Number.isSafeInteger(frame.m) || !('i' in frame) || typeof frame.i !== 'number' || !Number.isSafeInteger(frame.i) || frame.i < 0 || !('n' in frame) || typeof frame.n !== 'number' || !Number.isSafeInteger(frame.n) || frame.n <= frame.i || frame.n > 1024 || !('d' in frame) || typeof frame.d !== 'string' || frame.d.length > 16_000) throw new Error('Invalid frame')
        size += text.length; chunks++
        if (chunks > 1024 || size > 9_000_000) throw new Error('Message too large')
        const message = put(text)
        if (message === undefined) return
        chunks = 0; size = 0
        if (message.t !== 'tell' || message.channel !== 'remote-v2' || typeof message.value !== 'string') throw new Error('Invalid message')
        heard(message.value)
      } catch (error) { drop(`unreadable data: ${error instanceof Error ? error.message : String(error)}`) }
    })
  receive((text) => { if (listeners.length === 0) { if (early.length >= 64) drop('too many messages before anyone listened'); else early.push(text) } else for (const hear of listeners) hear(text) })
  return {
    binding,
    send: (text) => {
      if (ended) return
      if (text.length > 8_000_000) { drop(`a message of ${String(text.length)} characters is over the limit`); return }
      const frames = framesOf({ t: 'tell', channel: 'remote-v2', value: text }, sequence++)
      if (waiting.length + frames.length > 8192) { drop(`${String(waiting.length)} frames were already waiting to be sent`); return }
      waiting.push(...frames)
      pump()
    },
    onMessage: (heard) => { listeners.push(heard); for (const text of early.splice(0)) heard(text) },
    onClose: raw.closed,
    close: raw.close,
  }
}
