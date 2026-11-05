import { gathered } from '../link'
import { transportBinding } from '../../../shared/remote/identity'
import { remoteChannel } from '../../../shared/remote/channel'
import { answer, iceFor, postSignal } from '../../../shared/remote/signaling'
import type { RemoteChannel, RemoteSignal } from '../../../shared/remote/protocol'
export async function remoteDial(pairing: RemoteSignal, signal: AbortSignal): Promise<RemoteChannel> {
  const peer = new RTCPeerConnection({ iceServers: await iceFor(pairing) })
  const channel = peer.createDataChannel('geckit', { ordered: true })
  const close = (): void => peer.close()
  signal.addEventListener('abort', close, { once: true })
  const until = Date.now() + 45_000
  try {
    await peer.setLocalDescription(await peer.createOffer())
    await gathered(peer)
    const id = crypto.randomUUID()
    const offer = peer.localDescription?.sdp ?? ''
    await postSignal(pairing, 'offers', id, { sdp: offer, at: Date.now() })
    let description = await answer(pairing, id)
    while (description === undefined) {
      if (signal.aborted || Date.now() > until) throw new Error('The server did not answer.')
      await new Promise((resolve) => setTimeout(resolve, 1000))
      description = await answer(pairing, id)
    }
    await peer.setRemoteDescription({ type: 'answer', sdp: description.sdp })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The server did not answer.')), Math.max(0, until - Date.now()))
      channel.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
      channel.addEventListener('close', () => { clearTimeout(timer); reject(new Error('Connection closed.')) }, { once: true })
      if (signal.aborted) reject(new Error('Cancelled.'))
    })
    const closed: (() => void)[] = []
    let ended = false
    const end = (): void => { if (ended) return; ended = true; peer.close(); for (const listener of closed) listener() }
    channel.addEventListener('close', end)
    peer.addEventListener('connectionstatechange', () => { if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) end() })
    channel.bufferedAmountLowThreshold = 250_000
    return remoteChannel({ send: (text) => channel.send(text), hear: (heard) => channel.addEventListener('message', (event: MessageEvent<string>) => { if (typeof event.data === 'string') heard(event.data); else end() }), closed: (listener) => closed.push(listener), close: end, buffered: () => channel.bufferedAmount, drain: (ready) => channel.addEventListener('bufferedamountlow', ready) }, transportBinding(offer, description.sdp))
  } catch (error) { peer.close(); throw error }
}
