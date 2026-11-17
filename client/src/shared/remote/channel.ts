import { assembler, framesOf, packed, SQUEEZE_FROM, unpacker } from '../pairing'
import type { LinkMessage } from '../pairing'
import type { RemoteChannel } from './protocol'
export interface RawChannel { send(text: string): void; sendBinary?(bytes: ArrayBuffer): void; hear(heard: (data: string | ArrayBuffer) => void): void; closed(closed: () => void): void; close(): void; buffered(): number; drain(ready: () => void): void }
export function remoteChannel(raw: RawChannel, binding: Promise<string>): RemoteChannel {
  let put = assembler()
  const unpack = unpacker()
  let chunks = 0
  let size = 0
  let at = Date.now()
  let sequence = 0
  let ended = false
  let squeeze = false
  // Deflating takes a moment either way, so what is sent, and what is heard, goes one message after another in the order it came.
  let sending = Promise.resolve()
  let hearing = Promise.resolve()
  const waiting: (string | ArrayBuffer)[] = []
  raw.closed(() => { ended = true; waiting.length = 0 })
  const drop = (reason: string): void => { if (ended) return; ended = true; waiting.length = 0; console.warn(`Remote channel closed: ${reason}`); raw.close() }
  const pump = (): void => {
    try {
      while (!ended && waiting.length > 0 && raw.buffered() < 1_000_000) {
        const next = waiting.shift() ?? ''
        if (typeof next === 'string') raw.send(next)
        else raw.sendBinary?.(next)
      }
    } catch (error) { drop(`sending failed: ${error instanceof Error ? error.message : String(error)}`) }
  }
  raw.drain(pump)
  const listeners: ((text: string) => void)[] = []
  const early: string[] = []
  const deliver = (message: LinkMessage | undefined, heard: (text: string) => void): void => {
    if (message === undefined) return
    chunks = 0; size = 0
    if (message.t !== 'tell' || message.channel !== 'remote-v2' || typeof message.value !== 'string') throw new Error('Invalid message')
    heard(message.value)
  }
  const receive = (heard: (text: string) => void): void => raw.hear((data) => {
    hearing = hearing.then(async () => {
      if (ended) return
      try {
        // A message cut off by a quiet link is dropped; one still arriving is not.
        if (Date.now() - at > 30_000) { put = assembler(); chunks = 0; size = 0 }
        at = Date.now()
        size += typeof data === 'string' ? data.length : data.byteLength
        chunks++
        if (chunks > 1024 || size > 9_000_000) throw new Error('Message too large')
        if (typeof data !== 'string') {
          if (data.byteLength < 8 || data.byteLength > 16_008) throw new Error('Invalid frame')
          deliver(await unpack(data), heard)
          return
        }
        const frame: unknown = JSON.parse(data)
        if (typeof frame !== 'object' || frame === null || !('m' in frame) || !Number.isSafeInteger(frame.m) || !('i' in frame) || typeof frame.i !== 'number' || !Number.isSafeInteger(frame.i) || frame.i < 0 || !('n' in frame) || typeof frame.n !== 'number' || !Number.isSafeInteger(frame.n) || frame.n <= frame.i || frame.n > 1024 || !('d' in frame) || typeof frame.d !== 'string' || frame.d.length > 16_000) throw new Error('Invalid frame')
        deliver(put(data), heard)
      } catch (error) { drop(`unreadable data: ${error instanceof Error ? error.message : String(error)}`) }
    })
  })
  receive((text) => { if (listeners.length === 0) { if (early.length >= 64) drop('too many messages before anyone listened'); else early.push(text) } else for (const hear of listeners) hear(text) })
  const queue = (frames: readonly (string | ArrayBuffer)[]): void => {
    if (ended) return
    if (waiting.length + frames.length > 8192) { drop(`${String(waiting.length)} frames were already waiting to be sent`); return }
    waiting.push(...frames)
    pump()
  }
  return {
    binding,
    send: (text) => {
      if (ended) return
      if (text.length > 8_000_000) { drop(`a message of ${String(text.length)} characters is over the limit`); return }
      const message: LinkMessage = { t: 'tell', channel: 'remote-v2', value: text }
      const m = sequence++
      if (!squeeze || text.length < SQUEEZE_FROM) { sending = sending.then(() => queue(framesOf(message, m))); return }
      sending = sending.then(async () => queue(await packed(message, m))).catch((error: unknown) => drop(`compressing failed: ${error instanceof Error ? error.message : String(error)}`))
    },
    onMessage: (heard) => { listeners.push(heard); for (const text of early.splice(0)) heard(text) },
    onClose: raw.closed,
    close: raw.close,
    compress: (on) => { squeeze = on && raw.sendBinary !== undefined },
  }
}
