import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'

import type { ClaudeModel, Settings } from '../../../shared/api'
import type { ManagerRequestReceipt, ManagerSendRequest, ManagerThread, ManagerView } from '../../../shared/manager'
import { MANAGER_CHAT_UPDATE } from '../../../shared/manager'
import { llmProviderInfo } from '../../../shared/providers'
import { Picker } from '../ui/Menu'
import { keep, readKept } from '../kept'
import { ON_PHONE } from '../on-phone'
import { DictatingStrip, fitField, KeptRecording, SendControls, useDictation } from './MessageControls'

interface PendingSend {
  readonly request: ManagerSendRequest
  readonly phase: 'sending' | 'checking' | 'failed'
  readonly error?: string
}

interface ManagerDraft extends Pick<ManagerSendRequest, 'text'> {
  readonly pending?: PendingSend
}

const KEY = 'manager-chat-draft'
/** The conversation shown before its first message, made on the computer only when that message is sent. */
export const NEW_CONVERSATION = 'new'
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

const accepted = async (request: ManagerSendRequest, receipt?: Pick<ManagerRequestReceipt, 'session'>): Promise<void> => {
  if (draft.pending?.request.id !== request.id) return
  await save({ text: draft.text === request.text ? '' : draft.text })
  window.dispatchEvent(new CustomEvent('manager:sent', { detail: receipt?.session }))
}

async function reconcile(): Promise<void> {
  if (checking !== undefined) return checking
  const pending = draft.pending
  if (pending === undefined || pending.phase === 'failed') return
  checking = (async () => {
    try {
      const receipt = await window.geckit.manager.receipt(pending.request.id)
      if (draft.pending?.request.id !== pending.request.id) return
      if (receipt !== undefined) await accepted(pending.request, receipt)
      else await save({ ...draft, pending: { ...pending, phase: 'failed', error: pending.error ?? 'Message was not sent. Try again.' } })
    } catch {
      if (draft.pending?.request.id === pending.request.id) await save({ ...draft, pending: { ...pending, phase: 'checking' } })
    }
  })().finally(() => { checking = undefined })
  return checking
}

const AGAIN = 'Another model reads the whole conversation again at your next message.'

/** The conversation's assistant, which stays as it was given, and its model, changed here as in any conversation. */
function ModelControls({ thread, settings, disabled, onModel }: { readonly thread: ManagerThread; readonly settings: Settings; readonly disabled: boolean; readonly onModel: (model: string) => void }): React.JSX.Element {
  const [models, setModels] = useState<{ readonly provider: string; readonly list: readonly ClaudeModel[] | 'asking' | 'unknown' }>()
  const ask = (): void => {
    if (models?.provider === thread.provider && models.list !== 'unknown') return
    setModels({ provider: thread.provider, list: 'asking' })
    void window.geckit.chat.models(undefined, thread.provider).then((found) => setModels({ provider: thread.provider, list: found ?? 'unknown' }), () => setModels({ provider: thread.provider, list: 'unknown' }))
  }
  const list = models?.provider === thread.provider ? models.list : undefined
  const assistant = llmProviderInfo(thread.provider, 'stream', settings.providerPlugins).name
  const named = thread.model === '' ? 'Default' : Array.isArray(list) ? list.find((one) => one.value === thread.model)?.name ?? thread.model : thread.model
  const choices = [
    { value: '', label: 'Default', says: `as ${assistant} is set up` },
    ...(Array.isArray(list) ? list.filter((one) => one.value !== '').map((one) => ({ value: one.value, label: one.name, ...(one.disabled === true ? { disabled: true } : {}), ...(one.says === undefined ? {} : { says: one.says }) })) : [{ value: '__asking', label: list === 'unknown' ? `${assistant} did not say which models it has` : `Asking ${assistant}...` }]),
  ]
  return <>
    <Picker label={assistant} title="Assistant" chosen={thread.provider} disabled choices={[{ value: thread.provider, label: assistant, says: 'Each Manager conversation keeps the assistant it was started with.' }]} onPick={() => undefined} />
    <Picker label={named} title="Model" chosen={thread.model} disabled={disabled} choices={choices} {...(thread.session === undefined ? {} : { note: AGAIN })} onOpen={ask} onPick={(value) => { if (value !== '__asking' && value !== thread.model) onModel(value) }} />
  </>
}

export function ManagerComposer({ view, settings, connected, historyReady, closed, posted, thread, onModel }: { readonly view: ManagerView; readonly settings: Settings; readonly connected: boolean; readonly historyReady: boolean; readonly closed?: string | undefined; readonly posted?: string | undefined; readonly thread?: ManagerThread | undefined; readonly onModel?: ((model: string) => void) | undefined }): React.JSX.Element {
  const held = useSyncExternalStore(subscribe, () => draft)
  const field = useRef<HTMLTextAreaElement>(null)
  const [ready, setReady] = useState(loaded)
  const busy = held.pending !== undefined && held.pending.phase !== 'failed'
  const blocked = !connected ? 'Computer disconnected. Reconnect to send.' : view.appChat !== true ? MANAGER_CHAT_UPDATE : !view.config.enabled ? 'Manager disabled. History is kept.' : view.state === 'paused' ? 'Manager paused' : view.state === 'blocked' ? 'Manager unavailable' : closed
  useEffect(() => { void load().then(() => setReady(true)) }, [])
  useEffect(() => { if (ready && connected && view.appChat === true && draft.pending?.phase === 'checking') void reconcile() }, [ready, connected, view])
  useEffect(() => { if (!ON_PHONE && ready && blocked === undefined && !busy) field.current?.focus({ preventScroll: true }) }, [ready, blocked, busy])
  useLayoutEffect(() => { if (field.current !== null) fitField(field.current, held.text) }, [held.text])
  const write = (text: string): void => { void save({ text, ...(held.pending?.phase === 'failed' ? {} : held.pending === undefined ? {} : { pending: held.pending }) }) }
  const dictation = useDictation({ settings, draft: held.text, setDraft: write, field, place: view.session?.id ?? 'manager', session: view.session?.id })
  const send = async (): Promise<void> => {
    if (!ready || !historyReady || (draft.pending !== undefined && draft.pending.phase !== 'failed') || blocked !== undefined || held.text.trim() === '') return
    const request: ManagerSendRequest = held.pending?.phase === 'failed' && held.pending.request.text === held.text && held.pending.request.session === view.session?.id
      ? held.pending.request
      : { id: crypto.randomUUID(), text: held.text, ...(view.session === undefined ? {} : { session: view.session.id }), ...(thread?.id === NEW_CONVERSATION ? { create: thread.model === '' ? {} : { model: thread.model } } : {}) }
    await save({ text: held.text, pending: { request, phase: 'sending' } })
    try { await accepted(request, await window.geckit.manager.send(request)) }
    catch (caught) {
      if (draft.pending?.request.id !== request.id) return
      await save({ ...draft, pending: { request, phase: 'checking', ...(caught instanceof Error ? { error: caught.message } : {}) } })
      await reconcile()
    }
  }
  const cannot = !ready || !historyReady || busy || blocked !== undefined
  const hint = blocked ?? posted ?? ''
  const session = view.session?.id
  return <div className="composer manager-composer">
    {held.pending === undefined ? null : <div className="manager-send-state" role="status"><span>{held.pending.phase === 'sending' ? 'Sending...' : held.pending.phase === 'checking' ? 'Checking whether your message was received...' : 'Message was not sent. Try again.'}</span>{held.pending.phase === 'failed' && held.pending.error !== undefined && held.pending.error !== 'Message was not sent. Try again.' ? <span>{held.pending.error}</span> : null}{held.pending.phase === 'checking' && connected && view.appChat === true ? <button type="button" className="quiet small" onClick={() => { void reconcile() }}>Check status</button> : null}</div>}
    <div className="composer-inner">
      <textarea ref={field} rows={1} enterKeyHint={ON_PHONE ? 'enter' : undefined} value={held.text} disabled={!ready || busy} readOnly={dictation.capturing} placeholder={dictation.placeholder('Message Manager')} aria-label="Message Manager" onChange={(event) => write(event.target.value)} onKeyDown={(event) => {
        if (ON_PHONE && event.key === 'Enter') return
        if (dictation.keyDown(event)) return
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); void send() }
      }} />
      <DictatingStrip dictation={dictation} />
      <div className="composer-bar">
        {thread === undefined || onModel === undefined ? null : <ModelControls thread={thread} settings={settings} disabled={!connected} onModel={onModel} />}
        {ON_PHONE ? null : <span className="composer-hint manager-composer-hint" role="status">{hint}</span>}
        <KeptRecording dictation={dictation} />
        <span className="spacer" />
        <SendControls dictation={dictation} typed={held.text.trim() !== ''} working={view.state === 'working'} cannot={cannot} micDisabled={cannot} onSend={() => { void send() }} onStop={session === undefined ? undefined : () => { void window.geckit.manager.stop(session) }} />
      </div>
    </div>
    {ON_PHONE && hint !== '' ? <p className="manager-composer-hint" role="status">{hint}</p> : null}
  </div>
}
