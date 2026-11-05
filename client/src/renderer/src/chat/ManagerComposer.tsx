import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'

import type { ManagerSendRequest, ManagerView } from '../../../shared/manager'
import { keep, readKept } from '../kept'
import { ON_PHONE } from '../on-phone'

interface PendingSend {
  readonly request: ManagerSendRequest
  readonly phase: 'sending' | 'checking' | 'failed'
  readonly error?: string
}

interface ManagerDraft extends Pick<ManagerSendRequest, 'text'> {
  readonly pending?: PendingSend
}

const KEY = 'manager-chat-draft'
let draft: ManagerDraft = { text: '' }
let loaded = false
let loading: Promise<void> | undefined
let checking: Promise<void> | undefined
const listeners = new Set<() => void>()
const subscribe = (said: () => void): (() => void) => { listeners.add(said); return () => { listeners.delete(said) } }
const notify = (): void => { for (const said of listeners) said() }
const save = async (next: ManagerDraft): Promise<void> => { draft = next; notify(); await keep(KEY, next) }
const load = (): Promise<void> => loading ??= readKept<ManagerDraft>(KEY).then((kept) => {
  draft = kept === undefined ? draft : { ...kept, ...(kept.pending === undefined ? {} : { pending: { ...kept.pending, phase: kept.pending.phase === 'failed' ? 'failed' : 'checking' } }) }
  loaded = true
  notify()
})

const accepted = async (request: ManagerSendRequest): Promise<void> => {
  if (draft.pending?.request.id !== request.id) return
  await save({ text: draft.text === request.text ? '' : draft.text })
  window.dispatchEvent(new Event('manager:sent'))
}

async function reconcile(): Promise<void> {
  if (checking !== undefined) return checking
  const pending = draft.pending
  if (pending === undefined || pending.phase === 'failed') return
  checking = (async () => {
    try {
      const receipt = await window.geckit.manager.receipt(pending.request.id)
      if (draft.pending?.request.id !== pending.request.id) return
      if (receipt !== undefined) await accepted(pending.request)
      else await save({ ...draft, pending: { ...pending, phase: 'failed', error: pending.error ?? 'Message was not sent. Try again.' } })
    } catch {
      if (draft.pending?.request.id === pending.request.id) await save({ ...draft, pending: { ...pending, phase: 'checking' } })
    }
  })().finally(() => { checking = undefined })
  return checking
}

export function ManagerComposer({ view, connected, historyReady }: { readonly view: ManagerView; readonly connected: boolean; readonly historyReady: boolean }): React.JSX.Element {
  const held = useSyncExternalStore(subscribe, () => draft)
  const field = useRef<HTMLTextAreaElement>(null)
  const [ready, setReady] = useState(loaded)
  const busy = held.pending !== undefined && held.pending.phase !== 'failed'
  const blocked = !connected ? 'Computer disconnected. Reconnect to send.' : !view.config.enabled ? 'Manager disabled. History is kept.' : view.state === 'paused' ? 'Manager paused' : view.state === 'blocked' ? 'Manager unavailable' : undefined
  useEffect(() => { void load().then(() => setReady(true)) }, [])
  useEffect(() => { if (ready && connected && draft.pending?.phase === 'checking') void reconcile() }, [ready, connected, view])
  useEffect(() => { if (!ON_PHONE && ready && blocked === undefined && !busy) field.current?.focus({ preventScroll: true }) }, [ready, blocked, busy])
  useLayoutEffect(() => {
    const textarea = field.current
    if (textarea === null) return
    textarea.style.height = 'auto'
    textarea.style.height = `${String(Math.min(textarea.scrollHeight, 180))}px`
  }, [held.text])
  const send = async (): Promise<void> => {
    if (!ready || !historyReady || (draft.pending !== undefined && draft.pending.phase !== 'failed') || blocked !== undefined || held.text.trim() === '') return
    const request: ManagerSendRequest = held.pending?.phase === 'failed' && held.pending.request.text === held.text && held.pending.request.session === view.session?.id
      ? held.pending.request
      : { id: crypto.randomUUID(), text: held.text, ...(view.session === undefined ? {} : { session: view.session.id }) }
    await save({ text: held.text, pending: { request, phase: 'sending' } })
    try { await window.geckit.manager.send(request); await accepted(request) }
    catch (caught) {
      if (draft.pending?.request.id !== request.id) return
      await save({ ...draft, pending: { request, phase: 'checking', ...(caught instanceof Error ? { error: caught.message } : {}) } })
      await reconcile()
    }
  }
  return <div className="composer manager-composer">
    {held.pending === undefined ? null : <div className="manager-send-state" role="status"><span>{held.pending.phase === 'sending' ? 'Sending...' : held.pending.phase === 'checking' ? 'Checking whether your message was received...' : 'Message was not sent. Try again.'}</span>{held.pending.phase === 'failed' && held.pending.error !== undefined && held.pending.error !== 'Message was not sent. Try again.' ? <span>{held.pending.error}</span> : null}{held.pending.phase === 'checking' && connected ? <button type="button" className="quiet small" onClick={() => { void reconcile() }}>Check status</button> : null}</div>}
    <div className="composer-inner">
      <textarea ref={field} rows={2} value={held.text} disabled={!ready || busy} placeholder="Message Manager" aria-label="Message Manager" onChange={(event) => { void save({ text: event.target.value, ...(held.pending?.phase === 'failed' ? {} : held.pending === undefined ? {} : { pending: held.pending }) }) }} onKeyDown={(event) => {
        if (!ON_PHONE && event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); void send() }
      }} />
      <div className="manager-composer-actions"><span className="manager-composer-hint" role="status">{blocked ?? (ON_PHONE ? '' : 'Enter to send · Shift+Enter for a new line')}</span><button type="button" className="primary" disabled={!ready || !historyReady || busy || blocked !== undefined || held.text.trim() === ''} onClick={() => { void send() }}>Send</button></div>
    </div>
  </div>
}
