import { listen } from '../link'
import type { Link } from '../link'
import type { SessionImage } from '../../../shared/api'
import { PAIR_AGAIN, SIGNAL } from '../../../shared/pairing'
import { tabVideoSender } from './tab-video'

/**
 * The hidden window with WebRTC that main lacks: it scales pictures for the
 * service, serves shared links, and still answers the old phone link.
 *
 * Obsolete: the old phone link (Settings, Phone, before spec 035). A phone now
 * pairs with the service and does everything through it; this link is kept
 * only so the phone can watch and work this computer's screen, until that
 * moves onto the server path. Every other call is refused with PAIR_AGAIN.
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

// Obsolete: the old phone link, answering only what the screen needs.
const joined = (link: Link): void => {
  links.add(link)
  said()
  link.onClose(() => {
    links.delete(link)
    unwatch(link)
    said()
  })
  link.onMessage((message) => {
    if (message.t !== 'call') return
    if (!SCREEN_ONLY.has(message.name)) {
      link.send({ t: 'reply', id: message.id, error: PAIR_AGAIN })
      return
    }
    // The screen is this window's to capture, not main's.
    if (message.name === 'screen.start') {
      void watch(link).then((error) => link.send({ t: 'reply', id: message.id, value: error ?? null }))
      return
    }
    if (message.name === 'screen.stop') {
      unwatch(link)
      link.send({ t: 'reply', id: message.id, value: null })
      return
    }
    if (message.name === 'link.can') {
      link.send({ t: 'reply', id: message.id, value: { pairAgain: true } })
      return
    }
    window.geckit.peer.call(message.name, message.args).then(
      (value) => link.send({ t: 'reply', id: message.id, value }),
      (error: unknown) => link.send({ t: 'reply', id: message.id, error: error instanceof Error ? error.message : String(error) }),
    )
  })
}

// Obsolete: all the old phone link may still ask, until the screen moves onto the server path.
const SCREEN_ONLY = new Set(['link.can', 'screen.start', 'screen.stop', 'screen.control', 'mac.version'])

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

const video = tabVideoSender()
let loadingVideoRooms: Set<string> | undefined = new Set()
window.geckit.peer.onTabVideo((event) => { loadingVideoRooms?.add(event.key); video(event) })
void window.geckit.peer.tabVideos().then((rooms) => {
  for (const [key, jpeg] of rooms) {
    if (loadingVideoRooms?.has(key)) continue
    video({ type: 'start', key })
    if (jpeg !== undefined) video({ type: 'frame', key, jpeg })
  }
  loadingVideoRooms = undefined
})

void window.geckit.peer.pairing().then((pairing) => {
  if (pairing === undefined) return
  listen(pairing, joined, (now) => {
    if (now === trouble) return
    trouble = now
    said()
  })
})
