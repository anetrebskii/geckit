import { newKey } from '../../../shared/pairing'
import { transcript, trustProof, verify } from '../../../shared/remote/identity'
import { REMOTE_PROTOCOL } from '../../../shared/remote/protocol'
import type { RemoteChannel, RemoteHistory, RemoteRequest, RemoteResponse, RemoteSignal, RemoteSnapshot, RemoteTrust } from '../../../shared/remote/protocol'
import { remoteDial } from './transport'
import { deviceIdentity, rememberServer } from './storage'
export type ConnectionState = 'connecting' | 'pending' | 'connected' | 'reconnecting' | 'disconnected' | 'expired' | 'reused' | 'revoked' | 'incompatible' | 'error'
export interface RemoteView { readonly state: ConnectionState; readonly message: string; readonly snapshot?: RemoteSnapshot; readonly history?: RemoteHistory }
export function connectRemote(pairing: RemoteSignal, name: string, change: (view: RemoteView) => void, saved?: RemoteTrust) {
  const abort = new AbortController()
  let channel: RemoteChannel | undefined
  let trust = saved
  let next = 0
  let selected: string | undefined
  let epoch = ''
  let seq = -1
  let stopped = false
  let tries = 0
  let refresh: ReturnType<typeof setTimeout> | undefined
  let snapshotPending = false
  let dirty = false
  const send = (message: RemoteRequest): void => channel?.send(JSON.stringify(message))
  const snapshot = (): void => { if (snapshotPending) { dirty = true; return }; snapshotPending = true; send({ type: 'snapshot', id: ++next }) }
  const fail = (state: ConnectionState, message: string): void => { stopped = true; abort.abort(); channel?.close(); change({ state, message }) }
  const dial = async (): Promise<void> => {
    if (stopped) return
    change({ state: trust === undefined ? 'connecting' : 'reconnecting', message: trust === undefined ? 'Connecting…' : 'Reconnecting…' })
    try {
      const device = await deviceIdentity()
      if (stopped) return
      const link = await remoteDial(trust ?? pairing, abort.signal)
      if (stopped) { link.close(); return }
      channel = link
      let proofText = ''
      let serverKey = ''
      let serverId = ''
      link.onMessage((raw) => {
        void (async () => {
          if (stopped || channel !== link) return
          const parsed: unknown = JSON.parse(raw)
          if (parsed === null || typeof parsed !== 'object' || !('type' in parsed)) throw new Error('Invalid server response')
          const response = parsed as RemoteResponse
          if (response.type === 'error') { fail(['expired', 'reused', 'revoked', 'incompatible'].includes(response.code) ? response.code as ConnectionState : 'error', response.message); return }
          if (response.type === 'challenge') {
            if (response.protocol !== REMOTE_PROTOCOL) { fail('incompatible', 'Server version is not compatible with this client.'); return }
            if (trust !== undefined && (trust.server.id !== response.server.id || trust.server.publicKey !== response.server.publicKey)) throw new Error('Server identity changed.')
            if (response.expires !== 0 && Date.now() >= response.expires) { fail('expired', 'Code expired. Create a new code on the server.'); return }
            serverKey = response.server.publicKey; serverId = response.server.id
            const nonce = newKey()
            proofText = transcript(serverId, response.nonce, device.publicKey, nonce, await link.binding)
            const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, device.privateKey, new TextEncoder().encode(proofText))
            send({ type: 'hello', protocol: REMOTE_PROTOCOL, publicKey: device.publicKey, name: name.trim().slice(0, 80) || 'GeckIt client', nonce, proof: btoa(String.fromCharCode(...new Uint8Array(signature))) }); return
          }
          if (response.type === 'pending') { change({ state: 'pending', message: `Confirm this device on the server\n${response.phrase}` }); return }
          if (response.type === 'trusted') {
            const received = response.trust
            if (serverKey === '' || received.server.id !== serverId || received.server.publicKey !== serverKey || !/^[A-Za-z0-9_-]{43}$/.test(received.key) || !await verify(serverKey, trustProof(proofText, received), response.proof)) throw new Error('Server proof rejected.')
            if (trust !== undefined && (trust.device !== received.device || trust.key !== received.key)) throw new Error('Device trust changed.')
            trust = received; await rememberServer(received)
            if (stopped) return
            tries = 0; seq = -1; epoch = ''; snapshotPending = false; snapshot(); return
          }
          if (trust === undefined) throw new Error('Server sent data before authentication.')
          if (response.type === 'snapshot') {
            snapshotPending = false
            if (response.snapshot.server.id !== trust.server.id) throw new Error('Wrong server snapshot.')
            if (epoch === response.snapshot.epoch && response.snapshot.seq < seq) { snapshot(); return }
            epoch = response.snapshot.epoch; seq = response.snapshot.seq
            change({ state: 'connected', message: 'Connected · Read only', snapshot: response.snapshot })
            if (selected !== undefined) send({ type: 'history', id: ++next, session: selected, before: 0 })
            if (dirty) { dirty = false; snapshot() }; return
          }
          if (response.type === 'changed') { if (refresh === undefined) refresh = setTimeout(() => { refresh = undefined; snapshot() }, 300); return }
          if (response.type === 'history' && response.history.session === selected) change({ state: 'connected', message: 'Connected · Read only', history: response.history })
        })().catch((error: Error) => fail('error', error.message))
      })
      link.onClose(() => {
        if (stopped || channel !== link) return
        channel = undefined; snapshotPending = false
        change({ state: 'reconnecting', message: 'Reconnecting…' })
        if (trust === undefined) { fail('error', 'Could not connect. Check the code and server, then try again.'); return }
        refresh = setTimeout(() => { refresh = undefined; void dial() }, [2000, 5000, 10_000, 30_000][Math.min(tries++, 3)] ?? 30_000)
      })
    } catch {
      if (stopped) return
      if (trust === undefined) { fail('error', 'Could not connect. Check the code and server, then try again.'); return }
      change({ state: 'reconnecting', message: 'Reconnecting…' })
      refresh = setTimeout(() => { refresh = undefined; void dial() }, [2000, 5000, 10_000, 30_000][Math.min(tries++, 3)] ?? 30_000)
    }
  }
  void dial()
  return {
    close: () => { stopped = true; abort.abort(); if (refresh !== undefined) clearTimeout(refresh); channel?.close(); change({ state: 'disconnected', message: 'Disconnected' }) },
    history: (session: string, before = 0) => { selected = session; send({ type: 'history', id: ++next, session, before }) },
  }
}
