import { transportBinding } from '../../shared/remote/identity'
import { cleanup, PeerConnection } from 'node-datachannel'
import type { DataChannel, IceServer } from 'node-datachannel'
import { remoteChannel } from '../../shared/remote/channel'
import type { RawChannel } from '../../shared/remote/channel'
import type { RemoteChannel, RemoteSignal } from '../../shared/remote/protocol'
import { iceFor, postSignal, presence } from '../../shared/remote/signaling'
import { waitAnswer, watchOffers } from '../../shared/remote/listen'
// How often a listening room says it is there, inside the ice function's five minutes.
const PRESENCE = 4 * 60_000
import { randomUUID } from 'node:crypto'
const ice = async (pairing: RemoteSignal): Promise<IceServer[]> => (await iceFor(pairing)).flatMap((server) => (typeof server.urls === 'string' ? [server.urls] : server.urls).map((url) => {
  const found = /^(stun|turn|turns):([^:/?]+)(?::(\d+))?(?:\?transport=(udp|tcp))?$/.exec(url)
  if (found?.[2] === undefined) return undefined
  return { hostname: found[2], port: Number(found[3] ?? (found[1] === 'turns' ? 5349 : 3478)), ...(found[1] === 'stun' ? {} : { relayType: found[1] === 'turns' ? 'TurnTls' as const : found[4] === 'tcp' ? 'TurnTcp' as const : 'TurnUdp' as const, username: server.username ?? '', password: server.credential ?? '' }) }
})).filter((one) => one !== undefined)
export const disposeTransport = (): void => cleanup()
const bytesOf = (data: Buffer | ArrayBuffer): ArrayBuffer => (data instanceof ArrayBuffer ? data : new Uint8Array(data).buffer)
/** How a link was made, direct on the network or through the relay, since a relayed one carries far less a second. */
function said(peer: PeerConnection): void {
  const pair = peer.getSelectedCandidatePair()
  if (pair === null) return
  console.warn(`Remote link made: ${pair.local.type} ${pair.local.transportType} to ${pair.remote.type} ${pair.remote.transportType}`)
}
export const nodeListen = (pairing: RemoteSignal, joined: (channel: RemoteChannel) => void, failed: (error: Error) => void): (() => void) => nodeAnswer(pairing, (raw, binding) => joined(remoteChannel(raw, binding)), failed)

/** Answers every fresh offer in the room with a raw data channel, for links that speak something other than the remote protocol. */
export function nodeAnswer(pairing: RemoteSignal, opened: (raw: RawChannel, binding: Promise<string>) => void, failed: (error: Error) => void): () => void {
  const peers = new Set<PeerConnection>()
  const seen = new Set<string>()
  let stopped = false
  const accept = async (id: string, sdpOffer: string): Promise<void> => {
    if (peers.size >= 16) return
    let binding: Promise<string> = Promise.reject(new Error('ICE description not ready'))
    void binding.catch(() => undefined)
    const servers = await ice(pairing)
    if (stopped) return
    const peer = new PeerConnection('GeckIt remote', { iceServers: servers, enableIceTcp: true })
    peers.add(peer)
    const timer = setTimeout(() => { peers.delete(peer); peer.close() }, 45_000)
    timer.unref()
    let grace: ReturnType<typeof setTimeout> | undefined
    const drop = (reason: string): void => { clearTimeout(timer); clearTimeout(grace); if (!peers.delete(peer)) return; console.warn(`Remote link closed: ${reason}`); peer.close() }
    // A link that stops answering is often back within seconds, so only one that stays away is given up.
    peer.onStateChange((state) => {
      if (state === 'connected') { clearTimeout(timer); clearTimeout(grace); grace = undefined; said(peer) }
      else if (state === 'disconnected') { grace ??= setTimeout(() => drop('the link stayed disconnected for 15 s'), 15_000); grace.unref() }
      else if (state === 'failed' || state === 'closed') drop(`the link ${state}`)
    })
    peer.onDataChannel((channel: DataChannel) => {
      if (channel.getLabel() !== 'geckit') { channel.close(); return }
      channel.onOpen(() => {
        const listeners: (() => void)[] = []
        channel.onClosed(() => { drop('the data channel closed'); for (const listener of listeners) listener() })
        channel.setBufferedAmountLowThreshold(250_000)
        opened({ send: (text) => { channel.sendMessage(text) }, sendBinary: (bytes) => { channel.sendMessageBinary(Buffer.from(bytes)) }, hear: (heard) => channel.onMessage((data) => { if (typeof data === 'string') heard(data); else heard(bytesOf(data)) }), closed: (closed) => listeners.push(closed), close: () => { channel.close(); drop('closed here'); for (const listener of listeners) listener() }, buffered: () => channel.bufferedAmount(), drain: (ready) => channel.onBufferedAmountLow(ready) }, binding)
      })
    })
    peer.onGatheringStateChange((state) => {
      if (state !== 'complete' || stopped) return
      const sdp = peer.localDescription()?.sdp
      if (sdp === undefined) { peer.close(); return }
      binding = transportBinding(sdpOffer, sdp)
      void postSignal(pairing, 'answers', id, { sdp, at: Date.now() }).catch(failed)
    })
    peer.setRemoteDescription(sdpOffer, 'offer')
  }
  // Said every few minutes, so a phone off this network is handed the relay; the ice function trusts it for five.
  const here = (): void => void presence(pairing).catch((error: unknown) => { if (!stopped) failed(error instanceof Error ? error : new Error(String(error))) })
  here()
  const interval = setInterval(here, PRESENCE)
  interval.unref()
  let accepting = Promise.resolve()
  const unwatch = watchOffers(pairing, (found) => {
    accepting = accepting.then(async () => {
      for (const one of found) {
        if (stopped || seen.has(one.id)) continue
        seen.add(one.id)
        if (seen.size > 1024) seen.delete(seen.values().next().value ?? '')
        await accept(one.id, one.description.sdp)
      }
    }).catch((error: unknown) => { if (!stopped) failed(error instanceof Error ? error : new Error(String(error))) })
  }, (error) => { if (!stopped) failed(error) })
  return () => { stopped = true; clearInterval(interval); unwatch(); for (const peer of peers) peer.close(); peers.clear() }
}

/** This service calling another GeckIt it is paired with, the way a desktop or phone dials it. */
export async function nodeDial(pairing: RemoteSignal): Promise<RemoteChannel> {
  const peer = new PeerConnection('GeckIt computer', { iceServers: await ice(pairing), enableIceTcp: true })
  const until = Date.now() + 45_000
  try {
    const gathered = new Promise<void>((done) => peer.onGatheringStateChange((state) => { if (state === 'complete') done() }))
    const channel = peer.createDataChannel('geckit')
    const opened = new Promise<void>((done, fail) => {
      channel.onOpen(() => done())
      channel.onClosed(() => fail(new Error('Connection closed.')))
      setTimeout(() => fail(new Error('The computer did not answer.')), 45_000).unref()
    })
    opened.catch(() => undefined)
    await gathered
    const offer = peer.localDescription()?.sdp
    if (offer === undefined) throw new Error('No connection offer.')
    const id = randomUUID()
    await postSignal(pairing, 'offers', id, { sdp: offer, at: Date.now() })
    const description = await waitAnswer(pairing, id, until)
    if (description === undefined) throw new Error('The computer did not answer. Is GeckIt running there?')
    peer.setRemoteDescription(description.sdp, 'answer')
    await opened
    const listeners: (() => void)[] = []
    let ended = false
    let grace: ReturnType<typeof setTimeout> | undefined
    const end = (reason: string): void => { if (ended) return; ended = true; clearTimeout(grace); console.warn(`Remote link closed: ${reason}`); try { channel.close() } catch { /* Already closed. */ } peer.close(); for (const listener of listeners) listener() }
    channel.onClosed(() => end('the data channel closed'))
    peer.onStateChange((state) => {
      if (state === 'connected') { clearTimeout(grace); grace = undefined }
      else if (state === 'disconnected') { grace ??= setTimeout(() => end('the link stayed disconnected for 15 s'), 15_000); grace.unref() }
      else if (state === 'failed' || state === 'closed') end(`the link ${state}`)
    })
    channel.setBufferedAmountLowThreshold(250_000)
    return remoteChannel({ send: (text) => { channel.sendMessage(text) }, sendBinary: (bytes) => { channel.sendMessageBinary(Buffer.from(bytes)) }, hear: (heard) => channel.onMessage((data) => { if (typeof data === 'string') heard(data); else heard(bytesOf(data)) }), closed: (closed) => listeners.push(closed), close: () => end('closed here'), buffered: () => channel.bufferedAmount(), drain: (ready) => channel.onBufferedAmountLow(ready) }, transportBinding(offer, description.sdp))
  } catch (error) { peer.close(); throw error }
}
