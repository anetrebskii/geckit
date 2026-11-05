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
  const pump = (): void => { try { while (!ended && waiting.length > 0 && raw.buffered() < 1_000_000) raw.send(waiting.shift() ?? '') } catch { ended = true; raw.close() } }
  raw.drain(pump)
  const listeners: ((text: string) => void)[] = []
  const early: string[] = []
  const receive = (heard: (text: string) => void): void => raw.hear((text) => {
      try {
        if (Date.now() - at > 30_000) { put = assembler(); chunks = 0; size = 0; at = Date.now() }
        const frame: unknown = JSON.parse(text)
        if (typeof frame !== 'object' || frame === null || !('m' in frame) || !Number.isSafeInteger(frame.m) || !('i' in frame) || typeof frame.i !== 'number' || !Number.isSafeInteger(frame.i) || frame.i < 0 || !('n' in frame) || typeof frame.n !== 'number' || !Number.isSafeInteger(frame.n) || frame.n <= frame.i || frame.n > 1024 || !('d' in frame) || typeof frame.d !== 'string' || frame.d.length > 16_000) throw new Error('Invalid frame')
        size += text.length; chunks++
        if (chunks > 1024 || size > 9_000_000) throw new Error('Message too large')
        const message = put(text)
        if (message === undefined) return
        chunks = 0; size = 0; at = Date.now()
        if (message.t !== 'tell' || message.channel !== 'remote-v2' || typeof message.value !== 'string') throw new Error('Invalid message')
        heard(message.value)
      } catch { raw.close() }
    })
  receive((text) => { if (listeners.length === 0) { if (early.length >= 4) raw.close(); else early.push(text) } else for (const hear of listeners) hear(text) })
  return {
    binding,
    send: (text) => {
      if (ended) return
      if (text.length > 8_000_000) { raw.close(); return }
      const frames = framesOf({ t: 'tell', channel: 'remote-v2', value: text }, sequence++)
      if (waiting.length + frames.length > 1024) { raw.close(); return }
      waiting.push(...frames)
      pump()
    },
    onMessage: (heard) => { listeners.push(heard); for (const text of early.splice(0)) heard(text) },
    onClose: raw.closed,
    close: raw.close,
  }
}
