import type { ChatSession, SessionImage, SessionItem, SessionItems } from '../shared/api'
import { pieceOf } from '../shared/pairing'
import type { Piece } from '../shared/pairing'
import { collapse, isPending, pendingLast, readPictureRef, withoutPictures } from '../shared/steps'

/**
 * What one client is sent, the same for the desktop on this computer, a desktop
 * on another one and the phone: a conversation's end first and the rest when
 * asked, each run of steps one line, pictures named rather than carried, the
 * list as the rows that changed, and the items only of what the client has open.
 */

export const CAN = ['deflate', 'pictures', 'steps', 'sessionsChanged', 'find'] as const
export type Can = (typeof CAN)[number]
export type Row = readonly [string, string]
export interface ListChange { readonly changed: readonly ChatSession[]; readonly gone: readonly string[] }
export interface Found { readonly total: number; readonly hits: readonly string[] }

export const TURNS = 60
export const EARLIER = 200
const ITEMS_EVERY = 100
const LIST_EVERY = 300
const WHOLE_KEPT = 8
const SCALED_KEPT = 60

export const rowsOf = (items: readonly SessionItem[]): Row[] => items.map((item) => [item.id, JSON.stringify(item)])

/** A conversation as a client that said what it can is sent it. */
export function foldFor(can: ReadonlySet<string>, id: string, items: readonly SessionItem[]): SessionItem[] {
  const named = can.has('pictures') ? items.map((item) => withoutPictures(id, item)) : [...items]
  return can.has('steps') ? pendingLast(collapse(named)) : pendingLast(named)
}

/** The end of a folded conversation, with every card and request still waiting in it however long that makes it. */
export const turnsOf = (folded: readonly SessionItem[], count: number): Piece => pieceOf(folded, undefined, Math.max(count, folded.filter(isPending).length))

/** What a client is sent of a conversation it has open: from the first line its copy differs at, all of it again, and what it had from there taken out. */
export function diffRows(sent: readonly Row[], now: readonly Row[]): { readonly items: SessionItem[]; readonly gone: string[] } {
  let from = 0
  while (from < now.length && from < sent.length && now[from]?.[0] === sent[from]?.[0] && now[from]?.[1] === sent[from]?.[1]) from++
  return { gone: sent.slice(from).map(([key]) => key), items: now.slice(from).map(([, row]) => JSON.parse(row) as SessionItem) }
}

export function diffList(sent: ReadonlyMap<string, string>, list: readonly ChatSession[]): { readonly change: ListChange; readonly rows: Map<string, string> } {
  const rows = new Map(list.map((row) => [row.id, JSON.stringify(row)]))
  return { rows, change: { changed: list.filter((row) => sent.get(row.id) !== rows.get(row.id)), gone: [...sent.keys()].filter((id) => !rows.has(id)) } }
}

/** The messages holding the words, oldest first, as Find in a conversation marks them. */
export function findIn(items: readonly SessionItem[], words: string): Found {
  const word = words.trim().toLowerCase()
  const hits = word === '' ? [] : items.flatMap((item) => ((item.kind === 'mine' || item.kind === 'theirs') && item.text.toLowerCase().includes(word) ? [item.id] : []))
  return { total: hits.length, hits }
}

export function pictureIn(items: readonly SessionItem[], ref: string): SessionImage | undefined {
  const named = readPictureRef(ref)
  if (named === undefined) return undefined
  const item = items.find((one) => one.id === named.item)
  return item?.kind === 'mine' || item?.kind === 'did' ? item.images?.[named.index] : undefined
}

export interface ViewSource {
  readonly items: (id: string) => Promise<SessionItem[]>
  readonly queuedPicture: (id: string, queued: string, index: number) => Promise<SessionImage | undefined>
  /** A picture at the width a client draws it; where nothing can scale, the picture itself. */
  readonly scale?: (image: SessionImage, width: number) => Promise<SessionImage>
  /** Whether this client may see a conversation; a device limited to some projects sees only theirs. */
  readonly allowed?: (id: string) => boolean | Promise<boolean>
}

export interface ViewEvent { readonly name: string; readonly args: readonly unknown[] }

export const VIEW_METHODS = ['link:can', 'chat:watch', 'chat:turns', 'chat:turnsBefore', 'chat:steps', 'chat:picture', 'chat:queuedPicture', 'chat:find'] as const
export type ViewMethod = (typeof VIEW_METHODS)[number]
export const isViewMethod = (name: string): name is ViewMethod => (VIEW_METHODS as readonly string[]).includes(name)

interface Changes { readonly items: Map<string, SessionItem>; readonly gone: Set<string> }

export function clientView(source: ViewSource, offered: readonly Can[], send: (event: ViewEvent) => void) {
  // A client that never said what it can is from before this, and is sent everything as it was.
  let can: Set<string> | undefined
  const viewed = new Set<string>()
  let watched = false
  const sentRows = new Map<string, Row[]>()
  let sentList: Map<string, string> | undefined
  const whole = new Map<string, Map<string, SessionItem>>()
  const reading = new Map<string, Changes & { readonly promise: Promise<SessionItem[]> }>()
  const gathered = new Map<string, Changes>()
  const scaled = new Map<string, Promise<SessionImage>>()
  let list: readonly ChatSession[] | undefined
  let itemsTimer: ReturnType<typeof setTimeout> | undefined
  let listTimer: ReturnType<typeof setTimeout> | undefined
  let ended = false

  const guard = async (id: string): Promise<void> => {
    if (source.allowed !== undefined && !(await source.allowed(id))) throw new Error('Conversation is outside this device scope.')
  }

  /** Read again when a client opens it: one continued in a terminal changes on disk without anything saying so. */
  const wholeOf = async (id: string, again = false): Promise<SessionItem[]> => {
    const pending = reading.get(id)
    if (pending !== undefined) return pending.promise
    const held = whole.get(id)
    if (held !== undefined && !again) return [...held.values()]
    const changes: Changes = { items: new Map(), gone: new Set() }
    const promise = source.items(id).then((read) => {
      const all = new Map(read.map((item) => [item.id, item]))
      for (const gone of changes.gone) all.delete(gone)
      for (const item of changes.items.values()) all.set(item.id, item)
      whole.delete(id)
      whole.set(id, all)
      if (whole.size > WHOLE_KEPT) whole.delete(whole.keys().next().value ?? '')
      return [...all.values()]
    }).finally(() => reading.delete(id))
    reading.set(id, { ...changes, promise })
    return promise
  }

  const fold = (id: string, items: readonly SessionItem[]): SessionItem[] => foldFor(can ?? new Set(), id, items)

  const sendItems = (): void => {
    itemsTimer = undefined
    if (ended) { gathered.clear(); return }
    for (const [id, held] of gathered) {
      if (can === undefined) {
        // A client from before it said what it can, that said which conversation it has open, is sent that one.
        if (watched && !viewed.has(id)) continue
        send({ name: 'chat:items', args: [{ id, items: [...held.items.values()], ...(held.gone.size > 0 ? { gone: [...held.gone] } : {}) } satisfies SessionItems] })
        continue
      }
      if (!viewed.has(id)) continue
      const sent = sentRows.get(id)
      const all = whole.get(id)
      // Until the client has read its end, what it is told would land after it; the end it reads has it.
      if (sent === undefined || all === undefined) continue
      const now = rowsOf(fold(id, [...all.values()]))
      const { items, gone } = diffRows(sent, now)
      sentRows.set(id, now)
      if (items.length > 0 || gone.length > 0) send({ name: 'chat:items', args: [{ id, items, ...(gone.length > 0 ? { gone } : {}) } satisfies SessionItems] })
    }
    gathered.clear()
  }

  const gather = (said: SessionItems): void => {
    const apply = (to: { delete: (id: string) => boolean; set: (id: string, item: SessionItem) => unknown }): void => {
      for (const id of said.gone ?? []) to.delete(id)
      for (const item of said.items) to.set(item.id, item)
    }
    const pending = reading.get(said.id)
    if (pending !== undefined) {
      apply(pending.items)
      for (const id of said.gone ?? []) pending.gone.add(id)
    }
    const all = whole.get(said.id)
    if (all !== undefined) apply(all)
    let held = gathered.get(said.id)
    if (held === undefined) {
      held = { items: new Map(), gone: new Set() }
      gathered.set(said.id, held)
    }
    for (const id of said.gone ?? []) {
      held.items.delete(id)
      held.gone.add(id)
    }
    for (const item of said.items) {
      held.items.delete(item.id)
      held.items.set(item.id, item)
    }
    itemsTimer ??= setTimeout(sendItems, ITEMS_EVERY)
  }

  const sendList = (): void => {
    listTimer = undefined
    if (ended || list === undefined) return
    if (can?.has('sessionsChanged') !== true || sentList === undefined) {
      send({ name: 'chat:sessions', args: [list] })
      if (can?.has('sessionsChanged') === true) sentList = diffList(new Map(), list).rows
      return
    }
    const { change, rows } = diffList(sentList, list)
    sentList = rows
    if (change.changed.length > 0 || change.gone.length > 0) send({ name: 'chat:sessionsChanged', args: [change] })
  }

  const pictureFor = async (ref: string, width: number): Promise<SessionImage | undefined> => {
    const named = readPictureRef(ref)
    if (named === undefined) return undefined
    await guard(named.session)
    const key = `${ref}\n${String(width)}`
    let held = scaled.get(key)
    if (held === undefined) {
      const image = pictureIn(await wholeOf(named.session), ref)
      if (image === undefined) return undefined
      held = source.scale === undefined ? Promise.resolve(image) : source.scale(image, width).catch(() => image)
      scaled.set(key, held)
      if (scaled.size > SCALED_KEPT) scaled.delete(scaled.keys().next().value ?? '')
    }
    return held
  }

  const methods = {
    'link:can': (asked: readonly string[]): { readonly can: readonly string[] } => {
      can = new Set(asked.filter((one) => (offered as readonly string[]).includes(one)))
      return { can: [...can] }
    },
    'chat:watch': (ids: readonly string[]): void => {
      watched = true
      viewed.clear()
      for (const id of ids) viewed.add(id)
      for (const id of sentRows.keys()) if (!viewed.has(id)) sentRows.delete(id)
    },
    'chat:turns': async (id: string, count: number = TURNS): Promise<Piece> => {
      if (source.allowed !== undefined) await guard(id)
      const folded = fold(id, await wholeOf(id, true))
      viewed.add(id)
      sentRows.set(id, rowsOf(folded))
      return turnsOf(folded, count)
    },
    'chat:turnsBefore': async (id: string, before: string, count: number = EARLIER): Promise<Piece> => {
      if (source.allowed !== undefined) await guard(id)
      return pieceOf(fold(id, await wholeOf(id)), before, count)
    },
    'chat:steps': async (id: string, ids: readonly string[]): Promise<SessionItem[]> => {
      if (source.allowed !== undefined) await guard(id)
      const wanted = new Set(ids)
      return (await wholeOf(id)).filter((item) => wanted.has(item.id)).map((item) => (can?.has('pictures') === true ? withoutPictures(id, item) : item))
    },
    'chat:picture': async (ref: string, width: number): Promise<SessionImage | null> => (await pictureFor(ref, width)) ?? null,
    'chat:queuedPicture': async (id: string, queued: string, index: number, width?: number): Promise<SessionImage | null> => {
      if (source.allowed !== undefined) await guard(id)
      const image = await source.queuedPicture(id, queued, index)
      if (image === undefined) return null
      return width === undefined || source.scale === undefined ? image : source.scale(image, width).catch(() => image)
    },
    'chat:find': async (id: string, words: string): Promise<Found> => {
      if (source.allowed !== undefined) await guard(id)
      return findIn(await wholeOf(id), words)
    },
  }

  return {
    methods,
    /** Answers a call this view owns; undefined for any other. */
    call: (name: string, args: readonly unknown[]): Promise<unknown> | undefined => {
      if (!isViewMethod(name)) return undefined
      const run = methods[name] as (...given: readonly unknown[]) => unknown
      // Started at once, so what is told right after a call lands after what the call set up.
      try { return Promise.resolve(run(...args)) } catch (error) { return Promise.reject(error instanceof Error ? error : new Error(String(error))) }
    },
    /** Takes in what happened; true when the view sends it on itself, as it should go to this client. */
    event: (event: ViewEvent): boolean => {
      if (event.name === 'chat:items') {
        gather(event.args[0] as SessionItems)
        return true
      }
      if (event.name === 'chat:sessions') {
        list = event.args[0] as readonly ChatSession[]
        listTimer ??= setTimeout(sendList, LIST_EVERY)
        return true
      }
      return false
    },
    /** Whether the client said what it can, which is when it is sent folded rows. */
    capable: (): boolean => can !== undefined,
    can: (one: Can): boolean => can?.has(one) === true,
    dispose: (): void => {
      ended = true
      clearTimeout(itemsTimer)
      clearTimeout(listTimer)
      gathered.clear()
      whole.clear()
      scaled.clear()
    },
  }
}

export type ClientView = ReturnType<typeof clientView>
