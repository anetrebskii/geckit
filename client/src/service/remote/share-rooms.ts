import { assembler, framesOf, packed, SIGNAL, SQUEEZE_FROM, unpacker } from '../../shared/pairing'
import type { LinkMessage } from '../../shared/pairing'
import type { RawChannel } from '../../shared/remote/channel'
import type { LocalAsk } from '../../shared/local'
import type { Shares } from '../../main/shares'
import { nodeAnswer } from './transport'

type Answerer = Pick<Shares, 'about' | 'fetch' | 'read'>

interface Room {
  readonly stop: () => void
  readonly links: Set<RawChannel & { tell: (message: LinkMessage) => void }>
}

/** Each shared link has a room and key of its own, answered here by the service, so a link works with no desktop window, on a server too. */
export function shareRooms(shares: Answerer): { readonly keep: (rooms: readonly { readonly id: string; readonly key: string }[]) => void; readonly dispose: () => void } {
  const live = new Map<string, Room>()

  const joined = (id: string, raw: RawChannel): void => {
    const room = live.get(id)
    if (room === undefined) { raw.close(); return }
    const put = assembler()
    const unpack = unpacker()
    let next = 0
    let squeeze = false
    let sending = Promise.resolve()
    let hearing = Promise.resolve()
    const tell = (message: LinkMessage): void => {
      const m = next++
      sending = sending.then(async () => {
        const text = JSON.stringify(message)
        for (const frame of squeeze && text.length >= SQUEEZE_FROM ? await packed(message, m) : framesOf(message, m)) {
          if (typeof frame === 'string') raw.send(frame)
          else raw.sendBinary?.(frame)
        }
      }).catch(() => undefined)
    }
    const link = Object.assign(raw, { tell })
    room.links.add(link)
    raw.closed(() => room.links.delete(link))
    const answer = async (message: Extract<LinkMessage, { t: 'call' }>): Promise<void> => {
      if (message.name === 'link.can') {
        tell({ t: 'reply', id: message.id, value: { deflate: true } })
        if (Array.isArray(message.args[0]) && message.args[0].includes('deflate')) squeeze = raw.sendBinary !== undefined
        return
      }
      try {
        const value = message.name === 'share.about' ? shares.about(id)
          : message.name === 'share.fetch' ? await shares.fetch(id, message.args[0] as LocalAsk)
          : message.name === 'share.read' ? await shares.read(id, String(message.args[0] ?? ''))
          : undefined
        if (value === undefined) tell({ t: 'reply', id: message.id, error: 'Not shared' })
        else tell({ t: 'reply', id: message.id, value })
      } catch (error) { tell({ t: 'reply', id: message.id, error: error instanceof Error ? error.message : String(error) }) }
    }
    raw.hear((data) => {
      hearing = hearing.then(async () => {
        const message = typeof data === 'string' ? put(data) : await unpack(data)
        if (message?.t === 'call') void answer(message)
      }).catch(() => { raw.close() })
    })
  }

  const keep = (rooms: readonly { readonly id: string; readonly key: string }[]): void => {
    const wanted = new Map(rooms.map((room) => [room.id, room.key]))
    for (const [id, room] of live) {
      if (wanted.has(id)) continue
      live.delete(id)
      // Said first, so the page shows the link has ended rather than a lost connection.
      for (const link of room.links) link.tell({ t: 'tell', channel: 'share.ended', value: null })
      setTimeout(() => {
        for (const link of room.links) link.close()
        room.stop()
      }, 1000).unref()
    }
    for (const [id, key] of wanted) {
      if (live.has(id)) continue
      const links: Room['links'] = new Set()
      live.set(id, { links, stop: nodeAnswer({ key, signal: SIGNAL }, (raw) => joined(id, raw), () => undefined) })
    }
  }

  return { keep, dispose: () => keep([]) }
}
