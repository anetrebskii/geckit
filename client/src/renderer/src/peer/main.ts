import { listen } from '../link'
import type { Link } from '../link'

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

window.geckit.peer.onTell((channel, value) => {
  for (const link of links) link.send({ t: 'tell', channel, value })
})

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
