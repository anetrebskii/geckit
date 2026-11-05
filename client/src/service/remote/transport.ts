import { transportBinding } from '../../shared/remote/identity'
import { cleanup, PeerConnection } from 'node-datachannel'
import type { DataChannel, IceServer } from 'node-datachannel'
import { remoteChannel } from '../../shared/remote/channel'
import type { RemoteChannel, RemoteSignal } from '../../shared/remote/protocol'
import { iceFor, offers, postSignal, presence } from '../../shared/remote/signaling'
const ice = async (pairing: RemoteSignal): Promise<IceServer[]> => (await iceFor(pairing)).flatMap((server) => (typeof server.urls === 'string' ? [server.urls] : server.urls).map((url) => {
  const found = /^(stun|turn|turns):([^:/?]+)(?::(\d+))?(?:\?transport=(udp|tcp))?$/.exec(url)
  if (found?.[2] === undefined) return undefined
  return { hostname: found[2], port: Number(found[3] ?? (found[1] === 'turns' ? 5349 : 3478)), ...(found[1] === 'stun' ? {} : { relayType: found[1] === 'turns' ? 'TurnTls' as const : found[4] === 'tcp' ? 'TurnTcp' as const : 'TurnUdp' as const, username: server.username ?? '', password: server.credential ?? '' }) }
})).filter((one) => one !== undefined)
export const disposeTransport = (): void => cleanup()
export function nodeListen(pairing: RemoteSignal, joined: (channel: RemoteChannel) => void, failed: (error: Error) => void): () => void {
  const peers = new Set<PeerConnection>()
  const seen = new Set<string>()
  let stopped = false
  let busy = false
  let ticks = 0
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
    peer.onStateChange((state) => { if (state === 'connected') clearTimeout(timer); if (state === 'failed' || state === 'closed' || state === 'disconnected') { clearTimeout(timer); peers.delete(peer); peer.close() } })
    peer.onDataChannel((channel: DataChannel) => {
      if (channel.getLabel() !== 'geckit') { channel.close(); return }
      channel.onOpen(() => {
        const listeners: (() => void)[] = []
        channel.onClosed(() => { peers.delete(peer); peer.close(); for (const listener of listeners) listener() })
        channel.setBufferedAmountLowThreshold(250_000)
        joined(remoteChannel({ send: (text) => { channel.sendMessage(text) }, hear: (heard) => channel.onMessage((data) => { if (typeof data === 'string') heard(data); else peer.close() }), closed: (closed) => listeners.push(closed), close: () => { channel.close(); peer.close(); for (const listener of listeners) listener() }, buffered: () => channel.bufferedAmount(), drain: (ready) => channel.onBufferedAmountLow(ready) }, binding))
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
  const tick = async (): Promise<void> => {
    if (busy || stopped) return
    busy = true
    try {
      if (ticks++ % 15 === 0) await presence(pairing)
      for (const one of await offers(pairing)) {
        if (stopped || seen.has(one.id)) continue
        seen.add(one.id)
        if (seen.size > 1024) seen.delete(seen.values().next().value ?? '')
        await accept(one.id, one.description.sdp)
      }
    } catch (error) { if (!stopped) failed(error instanceof Error ? error : new Error(String(error))) }
    finally { busy = false }
  }
  void tick()
  const interval = setInterval(() => void tick(), 2000)
  return () => { stopped = true; clearInterval(interval); for (const peer of peers) peer.close(); peers.clear() }
}
