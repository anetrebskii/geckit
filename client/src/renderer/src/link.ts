import { initializeApp } from 'firebase/app'
import { collection, doc, getFirestore, onSnapshot, query, serverTimestamp, setDoc, Timestamp, where } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
import { assembler, framesOf, roomOf, seal, unseal } from '../../shared/pairing'
import type { LinkMessage, Pairing, Signed } from '../../shared/pairing'

/**
 * The phone and the Mac, joined by a WebRTC data channel.
 *
 * The phone dials: it leaves an offer in the room and waits for the answer. The
 * Mac listens: it waits in the room for offers and answers each. Each side
 * gathers all its routes before it speaks, so one offer and one answer are the
 * whole of the signaling, and Firestore is not asked again once they are joined.
 */

export interface Link {
  readonly send: (message: LinkMessage) => void
  readonly onMessage: (heard: (message: LinkMessage) => void) => void
  readonly onClose: (closed: () => void) => void
  readonly close: () => void
  /** The phone's side: the Mac's screen as it arrives, once the Mac sends it. */
  readonly screen: () => MediaStream | undefined
  /** The Mac's side: what goes out as the screen, or nothing to stop it. */
  readonly share: (track: MediaStreamTrack | null) => Promise<void>
}

// Public by design: what may be written is decided by firestore.rules in signal/.
const FIREBASE = {
  apiKey: 'AIzaSyC4h8OpyHUFHpQuQvn8vYdRiPXg-lh2mXc',
  authDomain: 'geckit-signal.firebaseapp.com',
  projectId: 'geckit-signal',
  appId: '1:229553514713:web:15dd5a3b6ceb081012b6c8',
}
let store: Firestore | undefined
const firestore = (): Firestore => (store ??= getFirestore(initializeApp(FIREBASE)))

const STUN: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]
// An offer older than this is from a phone that has given up on it.
const FRESH = 60_000
// What is left in a room is deleted by Firestore's TTL some time after this.
const KEPT = 3600_000
// The relay is handed only to a room whose Mac said it was waiting within the last minute.
const SEEN = 30_000
// Past this, the routes found so far are enough.
const GATHERING = 4000
// A send buffer much fuller than this is where browsers start closing channels.
const BUFFERED = 1_000_000
// Enough for text on a Retina screen at 15 frames a second; more only fills a phone's mobile data.
const SCREEN_BITRATE = 3_000_000

// The relay's keys last a day, so what the function said is kept for half of it; the app starting again asks afresh.
const KEEP = 12 * 3600_000
// A function waking from cold takes seconds; much more than that and it is not coming.
const POSTING = 15_000
const kept = new Map<string, { readonly servers: RTCIceServer[]; readonly until: number }>()

async function iceServers(pairing: Pairing, room: string): Promise<RTCIceServer[]> {
  const held = kept.get(room)
  if (held !== undefined && held.until > Date.now()) return held.servers
  try {
    const answer = await inTime(POSTING, (signal) => fetch(`${pairing.signal}/ice?room=${room}`, { signal }))
    const said = (await answer.json()) as { readonly iceServers: RTCIceServer[] }
    kept.set(room, { servers: said.iceServers, until: Date.now() + KEEP })
    return said.iceServers
  } catch {
    return STUN
  }
}

function gathered(peer: RTCPeerConnection): Promise<void> {
  if (peer.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((done) => {
    const timer = setTimeout(done, GATHERING)
    peer.addEventListener('icegatheringstatechange', () => {
      if (peer.iceGatheringState !== 'complete') return
      clearTimeout(timer)
      done()
    })
  })
}

async function post(room: string, kind: 'offers' | 'answers', id: string, box: string): Promise<void> {
  await inTime(POSTING, () =>
    setDoc(doc(firestore(), 'rooms', room, kind, id), { box, at: serverTimestamp(), gone: Timestamp.fromMillis(Date.now() + KEPT) }),
  )
}

/** The answer to one offer, as soon as the Mac leaves it, or nothing at `until`. */
function answerTo(room: string, id: string, until: number): Promise<string | undefined> {
  return new Promise((done, failed) => {
    const timer = window.setTimeout(() => {
      stop()
      done(undefined)
    }, Math.max(0, until - Date.now()))
    const stop = onSnapshot(
      doc(firestore(), 'rooms', room, 'answers', id),
      (found) => {
        const box: unknown = found.get('box')
        if (typeof box !== 'string') return
        window.clearTimeout(timer)
        stop()
        done(box)
      },
      (error) => {
        window.clearTimeout(timer)
        failed(error)
      },
    )
  })
}

/** Gives up at the time given even when the request does not: WebKit has been seen to keep one open past its abort signal, which left a phone reconnecting forever. */
function inTime<T>(ms: number, doing: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const stop = new AbortController()
  let timer = 0
  return Promise.race([
    doing(stop.signal),
    new Promise<never>((_done, failed) => {
      timer = window.setTimeout(() => {
        stop.abort()
        failed(new Error('The pairing service did not answer in time'))
      }, ms)
    }),
  ]).finally(() => window.clearTimeout(timer))
}

function linkOver(channel: RTCDataChannel, peer: RTCPeerConnection, video: RTCRtpTransceiver | undefined, seen?: () => MediaStream | undefined): Link {
  const put = assembler()
  const waiting: string[] = []
  let next = 0
  let closedOnce = false
  const closers: (() => void)[] = []
  const hearers: ((message: LinkMessage) => void)[] = []

  channel.bufferedAmountLowThreshold = BUFFERED / 4
  const pump = (): void => {
    while (waiting.length > 0 && channel.readyState === 'open' && channel.bufferedAmount < BUFFERED) {
      channel.send(waiting.shift() ?? '')
    }
  }
  channel.addEventListener('bufferedamountlow', pump)
  channel.addEventListener('message', (event: MessageEvent<string>) => {
    const message = put(event.data)
    if (message !== undefined) for (const hear of hearers) hear(message)
  })
  const closed = (): void => {
    if (closedOnce) return
    closedOnce = true
    peer.close()
    for (const close of closers) close()
  }
  channel.addEventListener('close', closed)
  peer.addEventListener('connectionstatechange', () => {
    if (peer.connectionState === 'failed' || peer.connectionState === 'closed' || peer.connectionState === 'disconnected') closed()
  })

  return {
    send: (message) => {
      waiting.push(...framesOf(message, next++))
      pump()
    },
    onMessage: (heard) => hearers.push(heard),
    onClose: (close) => closers.push(close),
    close: () => {
      channel.close()
      closed()
    },
    screen: () => seen?.(),
    share: async (track) => {
      if (video === undefined) return
      await video.sender.replaceTrack(track)
      if (track === null) return
      const parameters = video.sender.getParameters()
      parameters.encodings = (parameters.encodings.length === 0 ? [{}] : parameters.encodings).map((one) => ({
        ...one,
        maxBitrate: SCREEN_BITRATE,
        maxFramerate: 15,
      }))
      parameters.degradationPreference = 'maintain-resolution'
      await video.sender.setParameters(parameters).catch(() => undefined)
    },
  }
}

const opened = (channel: RTCDataChannel): Promise<void> =>
  channel.readyState === 'open' ? Promise.resolve() : new Promise((done) => channel.addEventListener('open', () => done(), { once: true }))

const randomId = (): string => [...crypto.getRandomValues(new Uint8Array(8))].map((one) => one.toString(16).padStart(2, '0')).join('')

/** Where a dial has got to, for a screen that would otherwise only spin. */
export type Dialing = 'service' | 'mac' | 'joining'

/** The phone's side: joined, or an error once `within` has passed without the Mac answering. */
// Long enough for a pairing service slow to wake on both sides of the handshake.
export async function dial(pairing: Pairing, within = 45_000, step: (at: Dialing) => void = () => undefined): Promise<Link> {
  const until = Date.now() + within
  step('service')
  const room = await roomOf(pairing.key)
  const peer = new RTCPeerConnection({ iceServers: await iceServers(pairing, room) })
  try {
    const channel = peer.createDataChannel('geckit', { ordered: true })
    // Offered from the start, so the Mac can send its screen later without a second handshake.
    const video = peer.addTransceiver('video', { direction: 'recvonly' })
    let stream: MediaStream | undefined
    peer.addEventListener('track', (event) => {
      stream = event.streams[0] ?? new MediaStream([event.track])
    })
    await peer.setLocalDescription(await peer.createOffer())
    await gathered(peer)
    const id = randomId()
    const offer: Signed = { sdp: peer.localDescription?.sdp ?? '', at: Date.now() }
    await post(room, 'offers', id, await seal(pairing.key, offer))
    step('mac')
    const box = await answerTo(room, id, until)
    const answer = box === undefined ? undefined : await unseal<Signed>(pairing.key, box)
    if (answer === undefined) throw new Error('The Mac did not answer')
    await peer.setRemoteDescription({ type: 'answer', sdp: answer.sdp })
    step('joining')
    await Promise.race([
      opened(channel),
      new Promise((_done, failed) => setTimeout(() => failed(new Error('The Mac did not answer')), Math.max(0, until - Date.now()))),
    ])
    return linkOver(channel, peer, video, () => stream ?? new MediaStream([video.receiver.track]))
  } catch (error) {
    peer.close()
    throw error
  }
}

/** The Mac's side: answers every fresh offer in the room until stopped, and says when the pairing service cannot be reached. */
export function listen(pairing: Pairing, joined: (link: Link) => void, trouble: (said: string | undefined) => void): () => void {
  const answered = new Set<string>()
  const peers = new Set<RTCPeerConnection>()
  const stops: (() => void)[] = []
  let stopped = false

  const answer = async (room: string, id: string, box: string): Promise<void> => {
    const offer = await unseal<Signed>(pairing.key, box)
    if (offer === undefined || Date.now() - offer.at > FRESH) return
    const peer = new RTCPeerConnection({ iceServers: await iceServers(pairing, room) })
    peers.add(peer)
    peer.addEventListener('connectionstatechange', () => {
      if (peer.connectionState === 'closed' || peer.connectionState === 'failed') peers.delete(peer)
    })
    await peer.setRemoteDescription({ type: 'offer', sdp: offer.sdp })
    const video = peer.getTransceivers().find((one) => one.receiver.track.kind === 'video')
    if (video !== undefined) video.direction = 'sendonly'
    // The channel opens only once the answer below has gone back, so listening for it here is in time.
    peer.addEventListener('datachannel', (event) => {
      void opened(event.channel).then(() => joined(linkOver(event.channel, peer, video)))
    })
    await peer.setLocalDescription(await peer.createAnswer())
    await gathered(peer)
    const back: Signed = { sdp: peer.localDescription?.sdp ?? '', at: Date.now() }
    await post(room, 'answers', id, await seal(pairing.key, back))
  }

  const unreachable = 'The pairing service did not answer. Phones cannot find this Mac until it does.'
  void roomOf(pairing.key).then((room) => {
    if (stopped) return
    const seen = (): void => void setDoc(doc(firestore(), 'rooms', room), { seen: serverTimestamp() }).catch(() => undefined)
    seen()
    const timer = window.setInterval(seen, SEEN)
    stops.push(() => window.clearInterval(timer))
    const fresh = query(collection(firestore(), 'rooms', room, 'offers'), where('at', '>=', Timestamp.fromMillis(Date.now() - FRESH)))
    stops.push(
      onSnapshot(
        fresh,
        { includeMetadataChanges: true },
        (found) => {
          trouble(found.metadata.fromCache ? unreachable : undefined)
          for (const change of found.docChanges()) {
            const box: unknown = change.doc.get('box')
            if (change.type !== 'added' || answered.has(change.doc.id) || typeof box !== 'string') continue
            answered.add(change.doc.id)
            void answer(room, change.doc.id, box).catch(() => undefined)
          }
        },
        () => trouble(unreachable),
      ),
    )
  })

  return () => {
    stopped = true
    for (const stop of stops) stop()
    for (const peer of peers) peer.close()
  }
}
