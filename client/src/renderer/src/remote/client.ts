import { newKey } from '../../../shared/pairing'
import { transcript, trustProof, verify } from '../../../shared/remote/identity'
import { REMOTE_PROTOCOL } from '../../../shared/remote/protocol'
import { parseRemote, stringifyRemote } from '../../../shared/remote/codec'
import type { CoreMethods } from '../../../core/application'
import type { CoreEvent } from '../../../core/events'
import type { RemoteCall, RemoteChannel, RemoteHistory, RemoteRequest, RemoteResponse, RemoteResult, RemoteSignal, RemoteSnapshot, RemoteTrust } from '../../../shared/remote/protocol'
import { remoteDial } from './transport'
import { devicePublicKey, rememberServer, signDevice } from './storage'
// A call made while the link is down waits this long for it to be back.
export const HOLD = 60_000
export const LINK_DOWN = 'The link to the computer is down. Try again when it is back.'
export type ConnectionState = 'connecting' | 'pending' | 'connected' | 'reconnecting' | 'disconnected' | 'expired' | 'reused' | 'revoked' | 'incompatible' | 'error'
/** The steps of a connect, in order: the pairing service, the computer's answer, the link, proving who each side is, its state, the workspace starting, the conversation list. */
export const CONNECT_STAGES = ['service', 'answer', 'joining', 'proving', 'snapshot', 'bootstrap', 'list'] as const
export type ConnectStage = typeof CONNECT_STAGES[number]
/** When each step of the connect under way began, with what it brought in characters, the last one still going until `ready`. */
export type ConnectSteps = readonly { readonly stage: ConnectStage | 'ready'; readonly at: number; readonly size?: number }[]
export interface RemoteView { readonly state: ConnectionState; readonly message: string; readonly snapshot?: RemoteSnapshot; readonly history?: RemoteHistory; readonly trust?: RemoteTrust; readonly steps?: ConnectSteps }
export function connectRemote(pairing: RemoteSignal, name: string, change: (view: RemoteView) => void, saved?: RemoteTrust) {
  const abort = new AbortController()
  let channel: RemoteChannel | undefined
  let trust = saved
  let next = 0
  let epoch = ''
  let seq = -1
  let stopped = false
  let tries = 0
  let refresh: ReturnType<typeof setTimeout> | undefined
  let snapshotPending = false
  let dirty = false
  let ready = false
  let connectedOnce = false
  let resync = false
  let steps: ConnectSteps = []
  let base: Omit<RemoteView, 'steps'> = { state: 'connecting', message: '' }
  const stage = (at: ConnectStage | 'ready'): void => { if (stopped) return; steps = [...steps, { stage: at, at: Date.now() }]; change({ ...base, steps }) }
  const sized = (at: ConnectStage, size: number): void => { steps = steps.map((one) => (one.stage === at ? { ...one, size } : one)) }
  let heard = 0
  const events = new Set<(event: CoreEvent) => void>()
  const readyAgain = new Set<() => void>()
  // What was asked while the link was down goes once it is back, unless it stays away this long; what had already gone out is never sent again.
  const held: { readonly go: () => void; readonly give: (error: Error) => void }[] = []
  const pending = new Map<number, { readonly resolve: (value: RemoteResult) => void; readonly reject: (error: Error) => void; readonly timer: ReturnType<typeof setTimeout> }>()
  const rejectPending = (reason = 'Connection lost. Check the server before retrying this action.'): void => { ready = false; for (const one of pending.values()) { clearTimeout(one.timer); one.reject(new Error(reason)) }; pending.clear() }
  const send = (message: RemoteRequest): void => channel?.send(stringifyRemote(message))
  const snapshot = (): void => { if (snapshotPending) { dirty = true; return }; snapshotPending = true; send({ type: 'snapshot', id: ++next, ...(trust?.full === true ? { lean: true as const } : {}) }) }
  const fail = (state: ConnectionState, message: string): void => { console.warn(`Remote connection stopped (${state}): ${message}`); stopped = true; rejectPending(); for (const one of held.splice(0)) one.give(new Error(message)); abort.abort(); channel?.close(); change({ state, message }) }
  const later = (): void => { refresh = setTimeout(() => { refresh = undefined; void dial() }, [2000, 5000, 10_000, 30_000][Math.min(tries++, 3)] ?? 30_000) }
  // A saved computer that drops or answers oddly is dialled again; only a first pairing stops.
  const retry = (reason: string): void => {
    if (stopped) return
    if (trust === undefined || (saved === undefined && !connectedOnce)) { fail('error', `Could not connect: ${reason}`); return }
    console.warn(`Remote connection lost, reconnecting: ${reason}`)
    const old = channel
    channel = undefined; snapshotPending = false; rejectPending(LINK_DOWN); resync = true
    old?.close()
    change({ state: 'reconnecting', message: 'Reconnecting…' })
    if (refresh === undefined) later()
  }
  const catchUp = (): void => {
    const emit = (event: CoreEvent): void => { for (const heard of events) heard(event) }
    const read = <K extends keyof CoreMethods>(method: K, ...args: Parameters<CoreMethods[K]>): Promise<Awaited<ReturnType<CoreMethods[K]>>> => call(method, ...args)
    // A workspace that reads the list itself when the link is back says so with onReconnected; asking twice made the computer read every conversation twice.
    if (readyAgain.size === 0) void read('chat:list', undefined).then((sessions) => emit({ name: 'chat:sessions', args: [sessions] } as CoreEvent)).catch(() => undefined)
    void read('manager:view').then((view) => emit({ name: 'manager:view', args: [view] } as CoreEvent)).catch(() => undefined)
    void read('settings:get').then((settings) => emit({ name: 'settings:changed', args: [settings] } as CoreEvent)).catch(() => undefined)
    void read('lineup:state').then((lineup) => emit({ name: 'lineup:changed', args: [lineup] } as CoreEvent)).catch(() => undefined)
  }
  const dial = async (): Promise<void> => {
    if (stopped) return
    base = { state: trust === undefined ? 'connecting' : 'reconnecting', message: trust === undefined ? 'Connecting…' : 'Reconnecting…' }
    steps = []
    change(base)
    try {
      const publicKey = await devicePublicKey()
      if (stopped) return
      const link = await remoteDial(trust ?? pairing, abort.signal, stage)
      if (stopped) { link.close(); return }
      channel = link
      stage('proving')
      let proofText = ''
      let serverKey = ''
      let serverId = ''
      link.onMessage((raw) => {
        void (async () => {
          if (stopped || channel !== link) return
          const parsed: unknown = parseRemote(raw)
          if (parsed === null || typeof parsed !== 'object' || !('type' in parsed)) throw new Error('Invalid server response')
          const response = parsed as RemoteResponse
          if (response.type === 'error') {
            if (['expired', 'reused', 'revoked', 'incompatible'].includes(response.code)) fail(response.code as ConnectionState, response.message)
            else retry(`the server refused: ${response.message}`)
            return
          }
          if (response.type === 'challenge') {
            if (response.protocol !== REMOTE_PROTOCOL) { fail('incompatible', 'Server version is not compatible with this client.'); return }
            if (trust !== undefined && (trust.server.id !== response.server.id || trust.server.publicKey !== response.server.publicKey)) { fail('error', 'Server identity changed. Pair again with a new code.'); return }
            if (response.expires !== 0 && Date.now() >= response.expires) { fail('expired', 'Code expired. Create a new code on the server.'); return }
            serverKey = response.server.publicKey; serverId = response.server.id
            const nonce = newKey()
            proofText = transcript(serverId, response.nonce, publicKey, nonce, await link.binding)
            send({ type: 'hello', protocol: REMOTE_PROTOCOL, publicKey, name: name.trim().slice(0, 80) || 'GeckIt client', nonce, proof: await signDevice(proofText) }); return
          }
          if (response.type === 'pending') { change({ state: 'pending', message: `Confirm this device on the server\n${response.phrase}` }); return }
          if (response.type === 'trusted') {
            const received = response.trust
            if (serverKey === '' || received.server.id !== serverId || received.server.publicKey !== serverKey || !/^[A-Za-z0-9_-]{43}$/.test(received.key) || !await verify(serverKey, trustProof(proofText, received), response.proof)) { fail('error', 'The server could not prove who it is.'); return }
            if (trust !== undefined && (trust.device !== received.device || trust.key !== received.key)) { fail('error', 'Device trust changed. Pair again with a new code.'); return }
            trust = received; await rememberServer(received)
            if (stopped) return
            stage('snapshot')
            tries = 0; seq = -1; epoch = ''; snapshotPending = false; snapshot(); return
          }
          if (trust === undefined) throw new Error('Server sent data before authentication.')
          if (response.type === 'core-result' || response.type === 'core-failure') {
            heard = raw.length
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
            connectedOnce = true
            if (resync) { resync = false; catchUp(); for (const again of readyAgain) again() }
            for (const one of held.splice(0)) one.go()
            sized('snapshot', raw.length)
            base = { state: 'connected', message: trust.full ? 'Connected' : 'Connected · Read only', snapshot: response.snapshot, trust }
            change({ ...base, steps })
            if (dirty) { dirty = false; snapshot() }; return
          }
          if (response.type === 'changed') { if (trust.full) return; if (refresh === undefined) refresh = setTimeout(() => { refresh = undefined; snapshot() }, 300); return }
        })().catch((error: Error) => { if (channel === link) retry(error.message) })
      })
      link.onClose(() => {
        if (stopped || channel !== link) return
        if (trust === undefined) { fail('error', 'Could not connect: the server closed the connection before pairing finished. Run geckit pair there for a new code.'); return }
        retry('the connection closed')
      })
    } catch (error) {
      if (stopped) return
      const reason = error instanceof Error ? error.message : String(error)
      console.warn('Connect computer failed:', reason)
      if (trust === undefined) { fail('error', `Could not connect: ${reason}`); return }
      change({ state: 'reconnecting', message: 'Reconnecting…' })
      later()
    }
  }
  const call = <K extends keyof CoreMethods>(method: K, ...args: Parameters<CoreMethods[K]>): Promise<Awaited<ReturnType<CoreMethods[K]>>> => new Promise((resolve, reject) => {
    // A saved computer's calls wait for the link, the first one too, so its workspace opens on what was kept before it answers.
    if ((!ready || channel === undefined) && !stopped && trust?.full === true) {
      const one = {
        go: () => { clearTimeout(expired); void call(method, ...args).then(resolve, reject) },
        give: (error: Error) => { clearTimeout(expired); reject(error) },
      }
      const expired = setTimeout(() => { const at = held.indexOf(one); if (at >= 0) held.splice(at, 1); reject(new Error(LINK_DOWN)) }, HOLD)
      held.push(one)
      return
    }
    if (!ready || !trust?.full || channel === undefined) { reject(new Error('Connect to this server before using its workspace.')); return }
    const id = ++next
    const sentOn = channel
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('Server did not answer. Check the server before retrying this action.')) }, method === 'browser:openTest' || method === 'browser:viewStart' ? 16 * 60_000 : 120_000)
    const starting = (method as string) === 'service:about' || method === 'service:bootstrap'
    const first = starting && ['snapshot', 'bootstrap'].includes(steps.at(-1)?.stage ?? '') ? 'start' : method === 'chat:list' && steps.at(-1)?.stage === 'bootstrap' ? 'chat:list' : undefined
    if (first === 'start' && steps.at(-1)?.stage === 'snapshot') stage('bootstrap')
    if (first === 'chat:list') stage('list')
    pending.set(id, { resolve: (value) => {
      if (first === 'start') { sized('bootstrap', heard); change({ ...base, steps }) }
      if (first === 'chat:list') {
        sized('list', heard)
        stage('ready')
        console.info(`Connected to ${trust?.server.name ?? 'the server'}: ${steps.slice(0, -1).map((one, index) => `${one.stage} ${String(((steps[index + 1]?.at ?? Date.now()) - one.at) / 1000)} s${one.size === undefined ? '' : `, ${String(Math.round(one.size / 1024))} KB`}`).join('; ')}`)
      }
      // Said back plainly; from then on this side sends deflated too.
      if ((method as string) === 'link:can' && value !== null && typeof value === 'object' && 'can' in value && Array.isArray(value.can) && value.can.includes('deflate')) sentOn.compress?.(true)
      resolve(value as Awaited<ReturnType<CoreMethods[K]>>)
    }, reject, timer })
    try { send({ type: 'core-call', id, call: { method, args } as RemoteCall }) } catch (error) { clearTimeout(timer); pending.delete(id); reject(error) }
  })
  void dial()
  return {
    close: () => { stopped = true; rejectPending(); for (const one of held.splice(0)) one.give(new Error('Disconnected')); abort.abort(); if (refresh !== undefined) clearTimeout(refresh); channel?.close(); change({ state: 'disconnected', message: 'Disconnected' }) },
    call,
    on: (heard: (event: CoreEvent) => void): (() => void) => { events.add(heard); return () => { events.delete(heard) } },
    /** The link was made again and the workspace has fresh state. */
    onReconnected: (again: () => void): (() => void) => { readyAgain.add(again); return () => { readyAgain.delete(again) } },
  }
}
