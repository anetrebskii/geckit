import type { ChatSession, SessionImage, SessionItem, SessionItems } from './api'
import { pieceOf } from './pairing'
import type { Piece } from './pairing'
import { collapse, isPending, pendingLast, runKey } from './steps'

/**
 * How every client reads conversations from GeckIt, the desktop on this
 * computer, a desktop on another one and the phone alike: the end of a
 * conversation first and what is before it when asked, each run of steps one
 * line whose steps come when it is opened, pictures when they are looked at,
 * and the list as the rows that changed. A client on a link keeps what it read,
 * so it opens on that while the link is made.
 */

export interface ListChange { readonly changed: readonly ChatSession[]; readonly gone: readonly string[] }
export interface Found { readonly total: number; readonly hits: readonly string[] }

export interface DataLink {
  readonly call: <T>(name: string, ...args: unknown[]) => Promise<T>
  /** What the other side tells, as it told it. */
  readonly hear: (channel: string, said: (value: never) => void) => () => void
  /** Kept between launches under this name, on a client that reads over a link; nothing kept on this computer's own desktop. */
  readonly keeps?: { readonly prefix: string; readonly read: <T>(key: string) => Promise<T | undefined>; readonly keep: (key: string, value: unknown) => Promise<void> }
  /** Whether the link is down now, when what was kept is shown first. */
  readonly down?: () => boolean
}

// How much of a conversation is asked for when it opens, and how much more each time the person scrolls to its top.
export const TAIL = 60
export const EARLIER = 200
// Conversations kept, the ones opened last.
const KEPT_CHATS = 30
// What is kept is written this long after it last changed, not on every word of a reply.
const KEEP_AFTER = 1000
const STEP_REFRESH_WAIT = 2_000
const OWNED = ['chat:items', 'chat:sessions', 'chat:earlier'] as const
const itemsKey = (id: string): string => `items2:${id}`

/** A GeckIt from before a call was there says so, and the client does what it did then. */
export const unknown = (error: unknown): boolean => error instanceof Error && (error.message.includes('Unknown GeckIt method') || error.message.includes('No such call') || error.message.includes('No handler registered'))

export function clientData(link: DataLink) {
  const heard = new Map<string, Set<(value: never) => void>>()
  const told = (channel: string, value: unknown): void => { for (const one of heard.get(channel) ?? []) one(value as never) }
  // Whether the other side answers in pages; one from before that is asked for everything, and the page folds it here.
  let paged: Promise<boolean> | undefined
  const pages = (): Promise<boolean> => (paged ??= link.call<{ readonly can: readonly string[] }>('link:can', ['deflate', 'pictures', 'steps', 'sessionsChanged', 'find']).then(() => true, (error: unknown) => {
    if (unknown(error)) return false
    paged = undefined
    throw error
  }))

  const named = (key: string): string => `${link.keeps?.prefix ?? ''}:${key}`
  const settled = new Set<string>()
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const later = (key: string, value: () => unknown): void => {
    const keeps = link.keeps
    if (keeps === undefined) return
    clearTimeout(timers.get(key))
    timers.set(key, setTimeout(() => { timers.delete(key); void keeps.keep(named(key), value()) }, KEEP_AFTER))
  }
  /** Kept first when there is something kept and the other side has not been heard since, then told again as it has it. */
  async function keptFirst<T>(key: string, asked: () => Promise<T>, channel: string): Promise<T> {
    const fresh = asked().then((value) => { settled.add(key); later(key, () => value); return value })
    const keeps = link.keeps
    if (keeps === undefined || (settled.has(key) && link.down?.() !== true)) return fresh
    const kept = await keeps.read<T>(named(key))
    if (kept === undefined) return fresh
    void fresh.then((value) => told(channel, value)).catch(() => undefined)
    return kept
  }

  // The conversation open, as the page has it: kept as it changes, and brought up to date from the other side.
  let shown: { readonly id: string; items: Map<string, SessionItem>; left: number } | undefined
  let opened: string | undefined
  // The runs opened in the conversation on screen, which stay open as they grow and after the link is made again.
  let expanded = new Set<string>()
  let rows: readonly ChatSession[] | undefined

  const keepShown = (): void => {
    const now = shown
    if (now === undefined) return
    later(itemsKey(now.id), (): Piece => {
      const all = pendingLast([...now.items.values()])
      const items = all.slice(-Math.max(TAIL, all.filter(isPending).length))
      return { items, left: now.left + all.length - items.length }
    })
  }

  /** Asked in pages; a side that says what it can but has no such call is asked as before, from then on. */
  const paging = async <T,>(asked: () => Promise<T>, before: () => Promise<T>): Promise<T> => {
    if (!(await pages())) return before()
    try { return await asked() } catch (error) {
      if (!unknown(error)) throw error
      paged = Promise.resolve(false)
      return before()
    }
  }

  const tail = (id: string): Promise<Piece> => paging(() => link.call<Piece>('chat:turns', id, TAIL), async () => {
    const folded = pendingLast(collapse(await link.call<SessionItem[]>('chat:items', id)))
    return pieceOf(folded, undefined, Math.max(TAIL, folded.filter(isPending).length))
  })

  const stepsOf = (id: string, ids: readonly string[]): Promise<SessionItem[]> => paging(() => link.call<SessionItem[]>('chat:steps', id, ids), async () => {
    const wanted = new Set(ids)
    return (await link.call<SessionItem[]>('chat:items', id)).filter((item) => wanted.has(item.id))
  })

  const fillKnown = (items: readonly SessionItem[], have: ReadonlyMap<string, SessionItem>, openedRuns: Set<string>, found?: ReadonlyMap<string, SessionItem>): SessionItem[] =>
    items.flatMap((item) => {
      if (item.kind !== 'steps' || !openedRuns.has(item.id)) return [item]
      const steps = item.ids.flatMap((id) => have.get(id) ?? found?.get(id) ?? [])
      if (steps.length === item.ids.length) return steps
      openedRuns.delete(item.id)
      return [item]
    })

  /** Items with each run that is open put back as its steps, the ones the page has not got asked for. */
  const filled = async (id: string, items: readonly SessionItem[]): Promise<SessionItem[]> => {
    const openedRuns = expanded
    const wanted = items.filter((item) => item.kind === 'steps' && openedRuns.has(item.id))
    if (wanted.length === 0) return [...items]
    const now = shown
    const have = now?.id === id ? now.items : new Map<string, SessionItem>()
    const missing = wanted.flatMap((run) => (run.kind === 'steps' ? run.ids.filter((one) => !have.has(one)) : []))
    if (missing.length === 0) return fillKnown(items, have, openedRuns)
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<SessionItem[]>((resolve) => { timer = setTimeout(() => resolve([]), STEP_REFRESH_WAIT) })
    const details = await Promise.race([stepsOf(id, missing).catch(() => []), timeout]).finally(() => clearTimeout(timer))
    const found = new Map(details.map((item) => [item.id, item]))
    return shown === now ? fillKnown(items, have, openedRuns, found) : []
  }

  // What is told of the conversation on screen goes in the order it came, each open run filled in on the way.
  let telling = Promise.resolve()
  const tellItems = (said: SessionItems): void => {
    const now = shown
    telling = telling.then(async () => {
      if (now === undefined || shown !== now) return
      // A run open on the page that is sent again in its place goes back in its place: its steps are taken out with it and put back in order.
      const moved = said.items.flatMap((item) => (item.kind === 'steps' && expanded.has(item.id) && said.gone?.includes(item.id) === true ? item.ids : []))
      const gone = said.gone === undefined ? undefined : [...said.gone, ...moved]
      const items = await filled(said.id, said.items)
      if (shown !== now) return
      for (const one of gone ?? []) now.items.delete(one)
      for (const item of items) now.items.set(item.id, item)
      keepShown()
      told('chat:items', { ...said, items, ...(gone === undefined ? {} : { gone }) })
    }).catch(() => undefined)
  }

  /** The end of the open conversation as the other side has it now, put in place of the end the page has, what it had before that left alone. */
  const bringUp = (id: string): void => {
    const now = shown
    if (now?.id !== id) return
    void tail(id)
      .catch(async (error: Error) => {
        if (shown !== now) throw error
        return tail(id)
      })
      .then((said) => {
        if (shown !== now) return
        const piece = { ...said, items: fillKnown(said.items, now.items, expanded) }
        const order = [...now.items.keys()]
        const first = piece.items[0]
        const at = first === undefined ? -1 : order.indexOf(first.id)
        const from = at === -1 && first?.kind === 'steps' ? order.indexOf(first.ids[0] ?? '') : at
        // What the page has out of place is taken out too, so it goes back where the other side has it.
        const coming = new Set(piece.items.map((item) => item.id))
        const waiting = new Set([...now.items.values()].filter(isPending).map((item) => item.id))
        const staying = (from === -1 ? [] : order.slice(0, from)).filter((one) => !coming.has(one) && !waiting.has(one))
        const gone = [...new Set([...(from === -1 ? order : order.slice(from)), ...coming, ...waiting])]
        const items = new Map([...staying.map((one): [string, SessionItem] => [one, now.items.get(one) as SessionItem]), ...piece.items.map((item): [string, SessionItem] => [item.id, item])])
        shown = { id, items, left: Math.max(0, piece.left - staying.length) }
        telling = Promise.resolve()
        told('chat:items', { id, items: piece.items, gone } satisfies SessionItems)
        told('chat:earlier', { id, left: shown.left })
        keepShown()
      })
      .catch(() => undefined)
  }

  const refresh = (): void => {
    if (shown !== undefined) bringUp(shown.id)
  }

  const remembered = async (id: string): Promise<void> => {
    const keeps = link.keeps
    if (keeps === undefined) return
    const recent = (await keeps.read<string[]>(named('recent'))) ?? []
    const next = [id, ...recent.filter((one) => one !== id)]
    for (const gone of next.splice(KEPT_CHATS)) void keeps.keep(named(itemsKey(gone)), undefined)
    await keeps.keep(named('recent'), next)
  }

  link.hear('chat:items', (said: SessionItems) => {
    // An older side sends every conversation's lines; only the one on screen is the page's.
    if (shown?.id === said.id) tellItems(said)
  })
  link.hear('chat:sessions', (all: readonly ChatSession[]) => {
    rows = all
    later('list', () => all)
    told('chat:sessions', all)
  })
  link.hear('chat:sessionsChanged', (said: ListChange) => {
    if (rows === undefined) return
    const next = new Map(rows.map((row) => [row.id, row]))
    for (const id of said.gone) next.delete(id)
    for (const row of said.changed) next.set(row.id, row)
    rows = [...next.values()].sort((one, other) => other.at - one.at)
    later('list', () => rows)
    told('chat:sessions', rows)
  })

  return {
    /** The page's own listeners for what this owns; undefined for any other channel. */
    listen: (channel: string, said: (value: never) => void): (() => void) | undefined => {
      if (!(OWNED as readonly string[]).includes(channel)) return undefined
      let held = heard.get(channel)
      if (held === undefined) { held = new Set(); heard.set(channel, held) }
      held.add(said)
      return () => { held.delete(said) }
    },
    list: (root: string | undefined): Promise<ChatSession[]> =>
      root === undefined
        ? keptFirst('list', () => pages().catch(() => false).then(() => link.call<ChatSession[]>('chat:list', root)).then((all) => { rows = all; return all }), 'chat:sessions')
        : link.call<ChatSession[]>('chat:list', root),
    /** Which conversation is in front; behind another app nothing is, and what was open is still what is sent. */
    watching: (id: string | undefined): void => {
      if (id === undefined || id === opened) return
      opened = id
      void pages().then((yes) => (yes ? link.call('chat:watch', [id]) : undefined)).catch(() => undefined)
    },
    items: async (id: string): Promise<SessionItem[]> => {
      if (shown?.id !== id) expanded = new Set()
      if (opened !== id) {
        opened = id
        void pages().then((yes) => (yes ? link.call('chat:watch', [id]) : undefined)).catch(() => undefined)
      }
      void remembered(id)
      const kept = link.keeps === undefined ? undefined : await link.keeps.read<Piece>(named(itemsKey(id)))
      if (kept !== undefined) {
        shown = { id, items: new Map(kept.items.map((item) => [item.id, item])), left: kept.left }
        setTimeout(() => { told('chat:earlier', { id, left: kept.left }); bringUp(id) }, 0)
        return kept.items
      }
      const piece = await tail(id)
      shown = { id, items: new Map(piece.items.map((item) => [item.id, item])), left: piece.left }
      keepShown()
      setTimeout(() => told('chat:earlier', { id, left: piece.left }), 0)
      return piece.items
    },
    before: async (id: string, before: string): Promise<Piece> => {
      const piece = await paging(
        () => link.call<Piece>('chat:turnsBefore', id, before, EARLIER),
        async () => pieceOf(pendingLast(collapse(await link.call<SessionItem[]>('chat:items', id))), before, EARLIER),
      )
      const now = shown
      if (now?.id === id) {
        now.items = new Map([...piece.items.map((item): [string, SessionItem] => [item.id, item]), ...now.items])
        now.left = piece.left
      }
      return piece
    },
    steps: async (id: string, ids: readonly string[]): Promise<SessionItem[]> => {
      const first = ids[0]
      if (first === undefined) return []
      const run = runKey(first)
      const openedRuns = shown?.id === id ? expanded : undefined
      openedRuns?.add(run)
      let found: SessionItem[]
      try {
        found = await stepsOf(id, ids)
        if (found.length === 0) throw new Error('No steps returned')
      } catch (error) {
        openedRuns?.delete(run)
        throw error
      }
      const now = shown
      if (now?.id === id) {
        now.items = new Map([...now.items].flatMap(([key, item]): [string, SessionItem][] => (key === run ? found.map((one) => [one.id, one]) : [[key, item]])))
        keepShown()
      }
      return found
    },
    picture: async (ref: string, width: number): Promise<SessionImage | undefined> =>
      (await pages()) ? ((await link.call<SessionImage | null>('chat:picture', ref, width)) ?? undefined) : undefined,
    queuedPicture: async (id: string, queued: string, index: number, width: number): Promise<SessionImage | undefined> =>
      ((await link.call<SessionImage | null | undefined>('chat:queuedPicture', id, queued, index, width)) ?? undefined),
    /** Every message in the conversation holding the words, oldest first; an older side is searched in what is loaded. */
    find: async (id: string, words: string): Promise<Found | undefined> => ((await pages()) ? link.call<Found>('chat:find', id, words) : undefined),
    refresh,
    /** The link is made again: the list and the end of the conversation on screen as the other side has them now. */
    reconnected: (): void => {
      paged = undefined
      void pages().then((yes) => (yes && opened !== undefined ? link.call('chat:watch', [opened]) : undefined)).catch(() => undefined)
      void link.call<ChatSession[]>('chat:list', undefined).then((all) => { settled.add('list'); rows = all; told('chat:sessions', all) }).catch(() => undefined)
      refresh()
    },
  }
}

export type ClientData = ReturnType<typeof clientData>
