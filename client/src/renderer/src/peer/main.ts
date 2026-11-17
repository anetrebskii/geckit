import { listen } from '../link'
import type { Link } from '../link'
import type { SessionImage, SessionItem } from '../../../shared/api'
import { PAIR_AGAIN, pieceOf, SIGNAL } from '../../../shared/pairing'
import { CAN, clientView } from '../../../core/client-view'
import type { ClientView } from '../../../core/client-view'

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
  const stream = await navigator.mediaDevices
    .getUserMedia({
      audio: false,
      video: {
        mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: source.id, maxWidth: 2560, maxHeight: 1600, maxFrameRate: 15 },
      } as MediaTrackConstraints,
    })
    .catch((error: unknown) => {
      // macOS refuses to record a locked or sleeping screen, which Chrome reports only as a video source it could not start.
      if (error instanceof DOMException && error.name === 'NotReadableError') throw new Error('The host could not show its screen. If it is locked or asleep, wake and unlock it, then try again.')
      throw error
    })
  const track = stream.getVideoTracks()[0]
  if (track === undefined) throw new Error('The host gave no picture of its screen')
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

// A phone sent to the background says so, and a notice goes to it as a push from then on.
const away = new Set<Link>()
const here = (): void => void window.geckit.peer.call('push.here', [[...links].filter((one) => !away.has(one)).length]).catch(() => undefined)

// Each phone reads conversations as every client does, through a client view of its own: the end first, runs of steps as one line, pictures by name, the list as the rows that changed.
const views = new Map<Link, ClientView>()

// A picture is drawn 220 points wide in the conversation and fills the screen when pressed, so it is sent at the width asked for, and no wider than it is.
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

const viewFor = (link: Link): ClientView =>
  clientView(
    {
      items: async (id) => (await window.geckit.peer.call('chat.items', [id])) as SessionItem[],
      queuedPicture: async (id, queued, index) => ((await window.geckit.peer.call('chat.queuedPicture', [id, queued, index])) as SessionImage | null) ?? undefined,
      scale: scaledTo,
    },
    CAN,
    (event) => link.send({ t: 'tell', channel: event.name, value: event.args[0] }),
  )

window.geckit.peer.onTell((channel, value) => {
  const owned = [...views.values()].map((view) => view.event({ name: channel, args: [value] })).includes(true)
  if (owned) return
  for (const link of links) link.send({ t: 'tell', channel, value })
})

const joined = (link: Link): void => {
  links.add(link)
  const view = viewFor(link)
  views.set(link, view)
  said()
  here()
  link.onClose(() => {
    links.delete(link)
    away.delete(link)
    here()
    views.get(link)?.dispose()
    views.delete(link)
    unwatch(link)
    said()
  })
  link.onMessage((message) => {
    if (message.t !== 'call') return
    // A phone paired here the old way reads what this computer has; doing anything is for a phone paired again with geckit pair.
    if (!READ_ONLY.has(message.name)) {
      link.send({ t: 'reply', id: message.id, error: PAIR_AGAIN })
      return
    }
    // The screen is this window's to capture, not main's.
    if (message.name === 'screen.start') {
      void watch(link).then((error) => link.send({ t: 'reply', id: message.id, value: error ?? null }))
      return
    }
    if (message.name === 'link.can') {
      const can = message.args[0] as readonly string[]
      void view.call('link:can', [can])
      // Said back first and sent plainly, so the phone knows before anything deflated reaches it.
      link.send({ t: 'reply', id: message.id, value: { deflate: true, pairAgain: true } })
      if (can.includes('deflate')) link.compress(true)
      return
    }
    if (message.name === 'chat.watching') {
      const id = message.args[0]
      void view.call('chat:watch', [typeof id === 'string' ? [id] : []])
      link.send({ t: 'reply', id: message.id, value: null })
      return
    }
    if (message.name === 'push.away') {
      if (message.args[0] === true) away.add(link)
      else away.delete(link)
      here()
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
    const owned = view.call(message.name.replace('.', ':'), message.args)
    if (owned !== undefined) {
      owned.then(
        (value) => link.send({ t: 'reply', id: message.id, value: value ?? null }),
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

// What a phone paired the old way may still ask: reading the board, conversations, pictures and settings, and being told when it is away.
const READ_ONLY = new Set([
  'link.can', 'chat.watching', 'push.away', 'push.token', 'screen.stop', 'mac.version', 'local.fetch',
  'chat.watch', 'chat.list', 'chat.listStatus', 'chat.items', 'chat.tail', 'chat.before', 'chat.turns', 'chat.turnsBefore', 'chat.steps', 'chat.picture', 'chat.queuedPicture', 'chat.find',
  'chat.account', 'chat.models', 'chat.plan', 'chat.plans', 'chat.links', 'chat.waiting', 'chat.firstAsked', 'chat.exists', 'chat.git', 'chat.hidden',
  'chat.taskOutput', 'chat.search', 'chat.preparedDraft', 'chat.commands', 'chat.file', 'chat.files', 'chat.repo', 'chat.browsers',
  'settings.get', 'employees.list', 'manager.view', 'manager.history', 'lineup.state', 'speech.model', 'update.view', 'browser.state', 'channels.view',
  'hosts.list', 'hosts.prompts', 'hosts.running', 'hosts.working', 'hosts.conversations', 'shortcuts.runs', 'shortcuts.destinations',
])

// Each shared link has a room and key of its own, and a page joined there may ask only about that link.
const SHARE_CALLS = new Set(['share.about', 'share.fetch', 'share.read'])
const shareRooms = new Map<string, { readonly stop: () => void; readonly links: Set<Link> }>()

function shareJoined(id: string, link: Link): void {
  const room = shareRooms.get(id)
  if (room === undefined) return link.close()
  room.links.add(link)
  link.onClose(() => room.links.delete(link))
  link.onMessage((message) => {
    if (message.t !== 'call') return
    if (message.name === 'link.can') {
      link.send({ t: 'reply', id: message.id, value: { deflate: true } })
      if ((message.args[0] as readonly string[]).includes('deflate')) link.compress(true)
      return
    }
    if (!SHARE_CALLS.has(message.name)) return link.send({ t: 'reply', id: message.id, error: 'Not shared' })
    window.geckit.peer.share(id, message.name, message.args).then(
      (value) => link.send({ t: 'reply', id: message.id, value }),
      (error: unknown) => link.send({ t: 'reply', id: message.id, error: error instanceof Error ? error.message : String(error) }),
    )
  })
}

function keepShares(rooms: readonly { readonly id: string; readonly key: string }[]): void {
  const wanted = new Map(rooms.map((room) => [room.id, room.key]))
  for (const [id, room] of shareRooms) {
    if (wanted.has(id)) continue
    // Said first, so the page shows the link has ended rather than a lost connection; then closed whether it heard or not.
    // Stopping the room closes its connections, so it waits for that too.
    for (const link of room.links) link.send({ t: 'tell', channel: 'share.ended', value: null })
    window.setTimeout(() => {
      for (const link of room.links) link.close()
      room.stop()
    }, 1000)
    shareRooms.delete(id)
  }
  for (const [id, key] of wanted) {
    if (shareRooms.has(id)) continue
    const links = new Set<Link>()
    shareRooms.set(id, { stop: listen({ key, signal: SIGNAL }, (link) => shareJoined(id, link), () => undefined), links })
  }
}

// The service asks for pictures at the width a client draws them, and only a window can scale one.
window.geckit.peer.onScale?.((id, image, width) => {
  void scaledTo(image, width).then((scaled) => window.geckit.peer.scaled(id, scaled), () => window.geckit.peer.scaled(id, undefined))
})

window.geckit.peer.onShares(keepShares)
void window.geckit.peer.shares().then(keepShares)

void window.geckit.peer.pairing().then((pairing) => {
  if (pairing === undefined) return
  listen(pairing, joined, (now) => {
    if (now === trouble) return
    trouble = now
    said()
  })
})
