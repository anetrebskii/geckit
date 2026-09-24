import { assembler, framesOf, roomOf, seal, unseal } from '../../shared/pairing'
import type { LinkMessage, Pairing, Signed } from '../../shared/pairing'

/**
 * The phone and the Mac, joined by a WebRTC data channel.
 *
 * The phone dials: it leaves an offer in the room and waits for the answer. The
 * Mac listens: it waits in the room for offers and answers each. Each side
 * gathers all its routes before it speaks, so one offer and one answer are the
 * whole of the signaling, and weroost is not asked again once they are joined.
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

interface Signal {
  readonly id: string
  readonly box: string
  readonly at: number
}

const STUN: RTCIceServer[] = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }]
// An offer older than this is from a phone that has given up on it.
const FRESH = 60_000
// Past this, the routes found so far are enough.
const GATHERING = 4000
// A send buffer much fuller than this is where browsers start closing channels.
const BUFFERED = 1_000_000
// Enough for text on a Retina screen at 15 frames a second; more only fills a phone's mobile data.
const SCREEN_BITRATE = 3_000_000

// The pairing service takes seconds to answer, so what it said is kept for half the day a relay's keys last; the app starting again asks afresh.
const KEEP = 12 * 3600_000
// The service has taken 7 s to wake; twice that and it is not coming.
const POSTING = 15_000
const kept = new Map<string, { readonly servers: RTCIceServer[]; readonly until: number }>()

async function iceServers(pairing: Pairing, room: string): Promise<RTCIceServer[]> {
  const held = kept.get(room)
  if (held !== undefined && held.until > Date.now()) return held.servers
  try {
    const answer = await inTime(POSTING, (signal) => fetch(`${pairing.signal}/api/fn/ice?room=${room}`, { signal }))
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

async function post(pairing: Pairing, body: { room: string; kind: 'offer' | 'answer'; id: string; box: string }): Promise<void> {
  const answer = await inTime(POSTING, (signal) =>
    fetch(`${pairing.signal}/api/fn/signal`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    }),
  )
  if (!answer.ok) throw new Error(`The pairing service answered ${String(answer.status)}`)
}

async function ask(pairing: Pairing, query: Record<string, string>, signal?: AbortSignal): Promise<{ signals: Signal[]; at: number }> {
  const answer = await fetch(`${pairing.signal}/api/fn/signal?${new URLSearchParams(query).toString()}`, signal === undefined ? {} : { signal })
  if (!answer.ok) throw new Error(`The pairing service answered ${String(answer.status)}`)
  return (await answer.json()) as { signals: Signal[]; at: number }
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
    await post(pairing, { room, kind: 'offer', id, box: await seal(pairing.key, offer) })
    step('mac')
    let answer: Signed | undefined
    while (answer === undefined && Date.now() < until) {
      // The service holds a question 10 s at most, so one open much longer than that is lost.
      const heard = await inTime(Math.min(15_000, Math.max(1, until - Date.now())), (signal) =>
        ask(pairing, { room, kind: 'answer', id, after: '0' }, signal),
      ).catch((error: unknown) => {
        if (Date.now() >= until) throw error
        return { signals: [] }
      })
      for (const one of heard.signals) answer ??= await unseal<Signed>(pairing.key, one.box)
    }
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
  const stop = new AbortController()

  const answer = async (room: string, one: Signal): Promise<void> => {
    const offer = await unseal<Signed>(pairing.key, one.box)
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
    await post(pairing, { room, kind: 'answer', id: one.id, box: await seal(pairing.key, back) })
  }

  void (async () => {
    const room = await roomOf(pairing.key)
    let after = 0
    while (!stop.signal.aborted) {
      try {
        // Held to a time of its own: one question left open by the service would leave this Mac deaf to every phone.
        const heard = await inTime(15_000, (signal) =>
          ask(pairing, { room, kind: 'offer', after: String(after) }, AbortSignal.any([signal, stop.signal])),
        )
        trouble(undefined)
        // Past the newest offer seen; with none, a little behind the service's clock, so one arriving as this asked is not missed.
        after = heard.signals.length === 0 ? heard.at - 2000 : Math.max(...heard.signals.map((one) => one.at)) + 1
        for (const one of heard.signals) {
          if (answered.has(one.id)) continue
          answered.add(one.id)
          void answer(room, one).catch(() => undefined)
        }
      } catch {
        if (stop.signal.aborted) return
        trouble('The pairing service did not answer. Phones cannot find this Mac until it does.')
        await new Promise((done) => setTimeout(done, 5000))
      }
    }
  })()

  return () => {
    stop.abort()
    for (const peer of peers) peer.close()
  }
}
