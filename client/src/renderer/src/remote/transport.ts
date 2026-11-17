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
      if (signal.aborted || Date.now() > until) throw new Error('the server did not answer. Check that GeckIt is running there and the code is new.')
      await new Promise((resolve) => setTimeout(resolve, 1000))
      description = await answer(pairing, id)
    }
    await peer.setRemoteDescription({ type: 'answer', sdp: description.sdp })
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('the server answered, but no direct or relayed connection could be opened between the two networks.')), Math.max(0, until - Date.now()))
      channel.addEventListener('open', () => { clearTimeout(timer); resolve() }, { once: true })
      channel.addEventListener('close', () => { clearTimeout(timer); reject(new Error('the connection closed while opening.')) }, { once: true })
      if (signal.aborted) reject(new Error('Cancelled.'))
    })
    const closed: (() => void)[] = []
    let ended = false
    let grace: ReturnType<typeof setTimeout> | undefined
    const end = (reason: string): void => { if (ended) return; ended = true; clearTimeout(grace); console.warn(`Remote link closed: ${reason}`); peer.close(); for (const listener of closed) listener() }
    channel.addEventListener('close', () => end('the data channel closed'))
    // A link that stops answering is often back within seconds, so only one that stays away is given up.
    peer.addEventListener('connectionstatechange', () => {
      const state = peer.connectionState
      if (state === 'connected') { clearTimeout(grace); grace = undefined }
      else if (state === 'disconnected') grace ??= setTimeout(() => end('the link stayed disconnected for 15 s'), 15_000)
      else if (state === 'failed' || state === 'closed') end(`the link ${state}`)
    })
    channel.bufferedAmountLowThreshold = 250_000
    return remoteChannel({ send: (text) => channel.send(text), hear: (heard) => channel.addEventListener('message', (event: MessageEvent<string>) => { if (typeof event.data === 'string') heard(event.data); else end('the server sent binary data') }), closed: (listener) => closed.push(listener), close: () => end('closed here'), buffered: () => channel.bufferedAmount, drain: (ready) => channel.addEventListener('bufferedamountlow', ready) }, transportBinding(offer, description.sdp))
  } catch (error) { peer.close(); throw error }
}
