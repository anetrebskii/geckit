import { newKey } from '../../../shared/pairing'
import { transcript, trustProof, verify } from '../../../shared/remote/identity'
import { REMOTE_PROTOCOL } from '../../../shared/remote/protocol'
import { parseRemote, stringifyRemote } from '../../../shared/remote/codec'
import type { CoreMethods } from '../../../core/application'
import type { CoreEvent } from '../../../core/events'
import type { RemoteCall, RemoteChannel, RemoteHistory, RemoteRequest, RemoteResponse, RemoteResult, RemoteSignal, RemoteSnapshot, RemoteTrust } from '../../../shared/remote/protocol'
import { remoteDial } from './transport'
import { devicePublicKey, rememberServer, signDevice } from './storage'
export type ConnectionState = 'connecting' | 'pending' | 'connected' | 'reconnecting' | 'disconnected' | 'expired' | 'reused' | 'revoked' | 'incompatible' | 'error'
export interface RemoteView { readonly state: ConnectionState; readonly message: string; readonly snapshot?: RemoteSnapshot; readonly history?: RemoteHistory; readonly trust?: RemoteTrust }
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
  let ready = false
  const events = new Set<(event: CoreEvent) => void>()
  const pending = new Map<number, { readonly resolve: (value: RemoteResult) => void; readonly reject: (error: Error) => void; readonly timer: ReturnType<typeof setTimeout> }>()
  const rejectPending = (): void => { ready = false; for (const one of pending.values()) { clearTimeout(one.timer); one.reject(new Error('Connection lost. Check the server before retrying this action.')) }; pending.clear() }
  const send = (message: RemoteRequest): void => channel?.send(stringifyRemote(message))
  const snapshot = (): void => { if (snapshotPending) { dirty = true; return }; snapshotPending = true; send({ type: 'snapshot', id: ++next }) }
  const fail = (state: ConnectionState, message: string): void => { stopped = true; rejectPending(); abort.abort(); channel?.close(); change({ state, message }) }
  const dial = async (): Promise<void> => {
    if (stopped) return
    change({ state: trust === undefined ? 'connecting' : 'reconnecting', message: trust === undefined ? 'Connecting…' : 'Reconnecting…' })
    try {
      const publicKey = await devicePublicKey()
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
          const parsed: unknown = parseRemote(raw)
          if (parsed === null || typeof parsed !== 'object' || !('type' in parsed)) throw new Error('Invalid server response')
          const response = parsed as RemoteResponse
          if (response.type === 'error') { fail(['expired', 'reused', 'revoked', 'incompatible'].includes(response.code) ? response.code as ConnectionState : 'error', response.message); return }
          if (response.type === 'challenge') {
            if (response.protocol !== REMOTE_PROTOCOL) { fail('incompatible', 'Server version is not compatible with this client.'); return }
            if (trust !== undefined && (trust.server.id !== response.server.id || trust.server.publicKey !== response.server.publicKey)) throw new Error('Server identity changed.')
            if (response.expires !== 0 && Date.now() >= response.expires) { fail('expired', 'Code expired. Create a new code on the server.'); return }
            serverKey = response.server.publicKey; serverId = response.server.id
            const nonce = newKey()
            proofText = transcript(serverId, response.nonce, publicKey, nonce, await link.binding)
            send({ type: 'hello', protocol: REMOTE_PROTOCOL, publicKey, name: name.trim().slice(0, 80) || 'GeckIt client', nonce, proof: await signDevice(proofText) }); return
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
          if (response.type === 'core-result' || response.type === 'core-failure') {
            const one = pending.get(response.id)
            if (one !== undefined) { pending.delete(response.id); clearTimeout(one.timer); if (response.type === 'core-result') one.resolve(response.value); else one.reject(new Error(response.message)) }
            return
          }
          if (response.type === 'core-event') { if (ready) for (const heard of events) heard(response.event); return }
          if (response.type === 'snapshot') {
            snapshotPending = false
            if (response.snapshot.server.id !== trust.server.id) throw new Error('Wrong server snapshot.')
            if (epoch === response.snapshot.epoch && response.snapshot.seq < seq) { snapshot(); return }
            epoch = response.snapshot.epoch; seq = response.snapshot.seq
            ready = true
            change({ state: 'connected', message: trust.full ? 'Connected' : 'Connected · Read only', snapshot: response.snapshot, trust })
            if (selected !== undefined) send({ type: 'history', id: ++next, session: selected, before: 0 })
            if (dirty) { dirty = false; snapshot() }; return
          }
          if (response.type === 'changed') { if (trust.full) return; if (refresh === undefined) refresh = setTimeout(() => { refresh = undefined; snapshot() }, 300); return }
          if (response.type === 'history' && response.history.session === selected) change({ state: 'connected', message: 'Connected · Read only', history: response.history })
        })().catch((error: Error) => fail('error', error.message))
      })
      link.onClose(() => {
        if (stopped || channel !== link) return
        channel = undefined; snapshotPending = false; rejectPending()
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
    close: () => { stopped = true; rejectPending(); abort.abort(); if (refresh !== undefined) clearTimeout(refresh); channel?.close(); change({ state: 'disconnected', message: 'Disconnected' }) },
    call: <K extends keyof CoreMethods>(method: K, ...args: Parameters<CoreMethods[K]>): Promise<Awaited<ReturnType<CoreMethods[K]>>> => new Promise((resolve, reject) => {
      if (!ready || !trust?.full || channel === undefined) { reject(new Error('Connect to this server before using its workspace.')); return }
      const id = ++next
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('Server did not answer. Check the server before retrying this action.')) }, method === 'browser:openTest' || method === 'browser:viewStart' ? 16 * 60_000 : 120_000)
      pending.set(id, { resolve: (value) => resolve(value as Awaited<ReturnType<CoreMethods[K]>>), reject, timer })
      try { send({ type: 'core-call', id, call: { method, args } as RemoteCall }) } catch (error) { clearTimeout(timer); pending.delete(id); reject(error) }
    }),
    on: (heard: (event: CoreEvent) => void): (() => void) => { events.add(heard); return () => { events.delete(heard) } },
    history: (session: string, before = 0) => { selected = session; send({ type: 'history', id: ++next, session, before }) },
  }
}
