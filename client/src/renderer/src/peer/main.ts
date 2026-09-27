import { listen } from '../link'
import type { Link } from '../link'
import type { ChatSession, SessionImage, SessionItem, SessionItems } from '../../../shared/api'
import { pieceOf } from '../../../shared/pairing'
import { collapse, readPictureRef, withoutPictures } from '../../../shared/steps'

/**
 * The hidden window the phones are answered in: main has no WebRTC, a window
 * does. Each call from a phone goes to main as the chat window's would, and
 * what main tells its windows goes to every phone.
 */

const links = new Set<Link>()
let trouble: string | undefined

// The screen, captured once for every phone watching it, and let go when the last one stops.
const watching = new Set<Link>()
let capture: Promise<MediaStreamTrack> | undefined

async function screenTrack(): Promise<MediaStreamTrack> {
  const source = await window.geckit.peer.screen()
  if (source.error !== undefined) throw new Error(source.error)
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: source.id, maxWidth: 2560, maxHeight: 1600, maxFrameRate: 15 },
    } as MediaTrackConstraints,
  })
  const track = stream.getVideoTracks()[0]
  if (track === undefined) throw new Error('The Mac gave no picture of its screen')
  // Encoded for sharp text rather than smooth motion.
  track.contentHint = 'text'
  return track
}

async function watch(link: Link): Promise<string | undefined> {
  try {
    capture ??= screenTrack()
    await link.share(await capture)
    watching.add(link)
    return undefined
  } catch (error) {
    capture = undefined
    return error instanceof Error ? error.message : String(error)
  }
}

function unwatch(link: Link): void {
  if (!watching.delete(link)) return
  void link.share(null).catch(() => undefined)
  if (watching.size > 0) return
  const held = capture
  capture = undefined
  void held?.then((track) => track.stop()).catch(() => undefined)
}

const said = (): void => window.geckit.peer.state(links.size, trouble)

// The conversation each phone has open; a phone from before it said so is sent every one.
const shows = new Map<Link, string>()

// A reply grows a word at a time and each step carries all of it, so what a phone is told is gathered and sent a few times a second, the latest of each.
const ITEMS_EVERY = 100
const LIST_EVERY = 300
const gathered = new Map<string, { readonly items: Map<string, SessionItem>; readonly gone: Set<string> }>()
let list: unknown
let itemsTimer: number | undefined
let listTimer: number | undefined

// A phone that can take them is sent a conversation as its messages and replies, each run of steps one line, and the steps when it opens the line.
// For that the whole of each conversation a phone has open is held here, as main tells it, and what each phone was last sent of it.
const whole = new Map<string, Map<string, SessionItem>>()
const views = new Map<Link, { readonly id: string; rows: (readonly [string, string])[] }>()
const WHOLE_KEPT = 8

const rowsOf = (items: readonly SessionItem[]): (readonly [string, string])[] => items.map((item) => [item.id, JSON.stringify(item)])

/** A conversation as a phone that can take it is sent it: each run of steps one line, and its pictures named rather than carried. */
// A phone from before it could ask for pictures by name is sent them whole.
const byName = new Set<Link>()
// A phone that folds steps asks for the end of what it opens, and lines sent unfolded before that would land after it.
const folding = new Set<Link>()
const forPhone = (link: Link, id: string, all: readonly SessionItem[]): SessionItem[] =>
  collapse(byName.has(link) ? all.map((item) => withoutPictures(id, item)) : all)

// A picture is drawn 220 points wide in the conversation and fills the screen when pressed, so it is sent at the width asked for, and no wider than it is.
const scaled = new Map<string, Promise<SessionImage>>()
const SCALED_KEPT = 60

async function scaledTo(image: SessionImage, width: number): Promise<SessionImage> {
  const raw = atob(image.data)
  const bitmap = await createImageBitmap(new Blob([Uint8Array.from(raw, (one) => one.charCodeAt(0))], { type: image.media }))
  const scale = Math.min(1, width / bitmap.width)
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(bitmap.width * scale)), Math.max(1, Math.round(bitmap.height * scale)))
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 })
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let text = ''
  for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  const data = btoa(text)
  return data.length < image.data.length ? { media: 'image/webp', data } : image
}

async function pictureFor(ref: string, width: number): Promise<SessionImage | undefined> {
  const named = readPictureRef(ref)
  if (named === undefined) return undefined
  const key = `${ref}\n${String(width)}`
  let held = scaled.get(key)
  if (held === undefined) {
    const item = (await wholeOf(named.session)).find((one) => one.id === named.item)
    const image = item?.kind === 'mine' || item?.kind === 'did' ? item.images?.[named.index] : undefined
    if (image === undefined) return undefined
    held = scaledTo(image, width).catch(() => image)
    scaled.set(key, held)
    if (scaled.size > SCALED_KEPT) scaled.delete(scaled.keys().next().value ?? '')
  }
  return held
}

/** Read again from main when a phone opens it: one continued in a terminal changes on disk without main saying so. */
async function wholeOf(id: string, again = false): Promise<SessionItem[]> {
  const held = whole.get(id)
  if (held !== undefined && !again) return [...held.values()]
  whole.delete(id)
  const all = (await window.geckit.peer.call('chat.items', [id])) as SessionItem[]
  whole.set(id, new Map(all.map((item) => [item.id, item])))
  if (whole.size > WHOLE_KEPT) whole.delete(whole.keys().next().value ?? '')
  return all
}

function sendItems(): void {
  itemsTimer = undefined
  for (const [id, held] of gathered) {
    const value: SessionItems = { id, items: [...held.items.values()], ...(held.gone.size > 0 ? { gone: [...held.gone] } : {}) }
    const all = whole.get(id)
    for (const link of links) {
      const shown = shows.get(link)
      if (shown !== undefined && shown !== id) continue
      const view = views.get(link)
      const folded = all === undefined ? undefined : rowsOf(forPhone(link, id, [...all.values()]))
      if (folded === undefined || view?.id !== id) {
        if (folding.has(link) && view?.id !== id) continue
        link.send({ t: 'tell', channel: 'chat:items', value })
        continue
      }
      // A reply is put back at the end under its own id once it is whole, so the order moves as well as the lines: from the first place
      // the phone's copy differs, all of it is sent again in order, and what it had from there is taken out first.
      let from = 0
      while (from < folded.length && from < view.rows.length && folded[from]?.[0] === view.rows[from]?.[0] && folded[from]?.[1] === view.rows[from]?.[1]) from++
      const gone = view.rows.slice(from).map(([key]) => key)
      const items = folded.slice(from).map(([, row]) => JSON.parse(row) as SessionItem)
      view.rows = folded
      if (items.length > 0 || gone.length > 0) {
        link.send({ t: 'tell', channel: 'chat:items', value: { id, items, ...(gone.length > 0 ? { gone } : {}) } })
      }
    }
  }
  gathered.clear()
}

function gather(said: SessionItems): void {
  const all = whole.get(said.id)
  if (all !== undefined) {
    for (const id of said.gone ?? []) all.delete(id)
    for (const item of said.items) all.set(item.id, item)
  }
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
  itemsTimer ??= window.setTimeout(sendItems, ITEMS_EVERY)
}

// The list runs to a hundred kilobytes and one row moves at a time, so a phone that can take them is sent the rows that changed.
const understood = new Set<Link>()
const sentRows = new Map<Link, Map<string, string>>()

function sendList(): void {
  listTimer = undefined
  const rows = new Map((list as readonly ChatSession[]).map((row) => [row.id, JSON.stringify(row)]))
  for (const link of links) {
    const sent = sentRows.get(link)
    if (!understood.has(link) || sent === undefined) {
      link.send({ t: 'tell', channel: 'chat:sessions', value: list })
      if (understood.has(link)) sentRows.set(link, rows)
      continue
    }
    const changed = (list as readonly ChatSession[]).filter((row) => sent.get(row.id) !== rows.get(row.id))
    const gone = [...sent.keys()].filter((id) => !rows.has(id))
    if (changed.length > 0 || gone.length > 0) link.send({ t: 'tell', channel: 'chat:sessionsChanged', value: { changed, gone } })
    sentRows.set(link, rows)
  }
}

window.geckit.peer.onTell((channel, value) => {
  if (channel === 'chat:items') return gather(value as SessionItems)
  if (channel === 'chat:sessions') {
    list = value
    listTimer ??= window.setTimeout(sendList, LIST_EVERY)
    return
  }
  for (const link of links) link.send({ t: 'tell', channel, value })
})

const joined = (link: Link): void => {
  links.add(link)
  said()
  link.onClose(() => {
    links.delete(link)
    shows.delete(link)
    views.delete(link)
    byName.delete(link)
    folding.delete(link)
    understood.delete(link)
    sentRows.delete(link)
    unwatch(link)
    said()
  })
  link.onMessage((message) => {
    if (message.t !== 'call') return
    // The screen is this window's to capture, not main's.
    if (message.name === 'screen.start') {
      void watch(link).then((error) => link.send({ t: 'reply', id: message.id, value: error ?? null }))
      return
    }
    if (message.name === 'link.can') {
      const can = message.args[0] as readonly string[]
      // Said back first and sent plainly, so the phone knows before anything deflated reaches it.
      link.send({ t: 'reply', id: message.id, value: { deflate: true } })
      if (can.includes('deflate')) link.compress(true)
      if (can.includes('pictures')) byName.add(link)
      if (can.includes('steps')) folding.add(link)
      if (can.includes('sessionsChanged')) {
        understood.add(link)
        // A phone that says what it can also says which conversation it opens, and until then has none open.
        if (!shows.has(link)) shows.set(link, '')
      }
      return
    }
    if (message.name === 'chat.watching') {
      const id = message.args[0]
      if (typeof id === 'string') shows.set(link, id)
      link.send({ t: 'reply', id: message.id, value: null })
      return
    }
    if (message.name === 'screen.stop') {
      unwatch(link)
      link.send({ t: 'reply', id: message.id, value: null })
      return
    }
    // A conversation runs to megabytes, most of it long past; the phone is sent its end, and what is before a line when it asks.
    if (message.name === 'chat.tail' || message.name === 'chat.before') {
      const [id, before, count] = message.name === 'chat.tail' ? [message.args[0], undefined, message.args[1]] : message.args
      void window.geckit.peer.call('chat.items', [id]).then(
        (value) => link.send({ t: 'reply', id: message.id, value: pieceOf(value as SessionItem[], before as string | undefined, count as number) }),
        (error: unknown) => link.send({ t: 'reply', id: message.id, error: error instanceof Error ? error.message : String(error) }),
      )
      return
    }
    if (message.name === 'chat.picture') {
      void pictureFor(message.args[0] as string, message.args[1] as number).then(
        (value) => link.send({ t: 'reply', id: message.id, value: value ?? null }),
        (error: unknown) => link.send({ t: 'reply', id: message.id, error: error instanceof Error ? error.message : String(error) }),
      )
      return
    }
    if (message.name === 'chat.queuedPicture') {
      const [id, queued, index, width] = message.args as [string, string, number, number]
      void window.geckit.peer
        .call('chat.queuedPicture', [id, queued, index])
        .then((image) => (image === undefined || image === null ? null : scaledTo(image as SessionImage, width).catch(() => image)))
        .then(
          (value) => link.send({ t: 'reply', id: message.id, value }),
          (error: unknown) => link.send({ t: 'reply', id: message.id, error: error instanceof Error ? error.message : String(error) }),
        )
      return
    }
    if (message.name === 'chat.turns' || message.name === 'chat.turnsBefore' || message.name === 'chat.steps') {
      const id = message.args[0] as string
      void wholeOf(id, message.name === 'chat.turns')
        .then((all) => {
          if (message.name === 'chat.steps') {
            const ids = new Set(message.args[1] as readonly string[])
            return all.filter((item) => ids.has(item.id)).map((item) => (byName.has(link) ? withoutPictures(id, item) : item))
          }
          const folded = forPhone(link, id, all)
          if (message.name === 'chat.turns') {
            views.set(link, { id, rows: rowsOf(folded) })
            return pieceOf(folded, undefined, message.args[1] as number)
          }
          return pieceOf(folded, message.args[1] as string, message.args[2] as number)
        })
        .then(
          (value) => link.send({ t: 'reply', id: message.id, value }),
          (error: unknown) => link.send({ t: 'reply', id: message.id, error: error instanceof Error ? error.message : String(error) }),
        )
      return
    }
    window.geckit.peer.call(message.name, message.args).then(
      (value) => link.send({ t: 'reply', id: message.id, value }),
      (error: unknown) => link.send({ t: 'reply', id: message.id, error: error instanceof Error ? error.message : String(error) }),
    )
  })
}

void window.geckit.peer.pairing().then((pairing) => {
  if (pairing === undefined) return
  listen(pairing, joined, (now) => {
    if (now === trouble) return
    trouble = now
    said()
  })
})
