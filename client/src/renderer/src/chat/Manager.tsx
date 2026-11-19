import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { ClaudeModel, Settings } from '../../../shared/api'
import { DEFAULT_COMPACT_AT } from '../../../shared/manager'
import type { ManagerConfig, ManagerView } from '../../../shared/manager'
import { llmProviderInfo } from '../../../shared/providers'
import { Menu, Picker } from '../ui/Menu'
import type { Choice } from '../ui/Menu'
import { Cell } from './PhoneKit'
import { ManagerFlow } from './ManagerFlow'
import { managerLabel, useManager } from './useManager'

const COMPACT_SIZES = [100_000, 160_000, DEFAULT_COMPACT_AT, 400_000, 600_000]
const COMPACT_NOTE = 'Manager summarises its conversation when it reaches this size, so each answer rereads less. Default 240,000 tokens.'
const TOKENS = new Intl.NumberFormat('en-US')
const compactLabel = (tokens: number): string => tokens === 0 ? 'Off' : `${TOKENS.format(tokens)} tokens`

const PROJECTS = 'Works in all projects, current and future, across every profile. Telegram, Slack and Discord reach Manager from Settings, Channels.'

/** Manager is always on and starts work by itself, so its setup is the assistant that runs it, saved as soon as it is picked, and how it stands. */
/** What Manager's setup reads and changes, on the desktop's section and the phone's group alike. */
function useManagerSetup(settings: Settings) {
  const view = useManager()
  const [reload, setReload] = useState(0)
  const [fetched, setFetched] = useState<{ readonly key: string; readonly models: readonly ClaudeModel[] | undefined }>()
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<{ readonly kind: 'restart' }>()
  const [error, setError] = useState('')
  const provider = view?.config.provider ?? 'claude'
  const model = view?.config.chatModel ?? ''
  const key = `${provider}:${String(reload)}`
  const loading = fetched?.key !== key
  const models = loading ? undefined : fetched.models
  const modelError = !loading && models === undefined
  useEffect(() => {
    let here = true
    void window.geckit.chat.models(undefined, provider).then((found) => { if (here) setFetched({ key, models: found }) }, () => { if (here) setFetched({ key, models: undefined }) })
    return () => { here = false }
  }, [provider, key])
  const run = async (action: () => Promise<ManagerView>): Promise<void> => {
    setSaving(true)
    setError('')
    try { await action(); setConfirm(undefined) } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
    finally { setSaving(false) }
  }
  const modelUnavailable = model !== '' && models !== undefined && !models.some((one) => one.value === model && one.disabled !== true)
  const available = view?.providers.find((one) => one.provider === provider)
  const choices: Choice[] = (view?.providers ?? []).map((one) => ({ value: one.provider, label: llmProviderInfo(one.provider, 'stream', settings.providerPlugins).name, ...(one.available ? {} : { disabled: true, says: one.reason ?? 'This assistant cannot run as a manager.' }) }))
  const modelChoices: Choice[] = [{ value: '', label: 'Provider default' }, ...(models ?? []).filter((one) => one.value !== '').map((one) => ({ value: one.value, label: one.name, ...(one.says === undefined ? {} : { says: one.says }), ...(one.disabled === true ? { disabled: true } : {}) }))]
  const configure = (change: Partial<ManagerConfig>): void => { void run(() => window.geckit.manager.configure({ enabled: true, delegation: 'automatic', ...change })) }
  const pickProvider = (value: string): void => {
    const chosen = view?.providers.find((one) => one.provider === value)
    if (chosen?.available !== true || chosen.provider === provider) return
    setError('')
    configure({ provider: chosen.provider, chatModel: '' })
  }
  const pickModel = (value: string): void => { if (value !== model) configure({ chatModel: value }) }
  const modelName = model === '' ? 'Provider default' : models?.find((one) => one.value === model)?.name ?? model
  const assistantName = llmProviderInfo(provider, 'stream', settings.providerPlugins).name
  const compactAt = view?.config.compactAt ?? DEFAULT_COMPACT_AT
  const compactChoices: Choice[] = [0, ...new Set([...COMPACT_SIZES, ...(compactAt === 0 ? [] : [compactAt])])].sort((a, b) => a - b).map((tokens) => ({ value: String(tokens), label: compactLabel(tokens) }))
  const pickCompact = (value: string): void => { if (Number(value) !== compactAt) void run(() => window.geckit.manager.configure({ compactAt: Number(value) })) }
  const compactNote = available?.compacts === false ? `${assistantName} can't compact conversations. Manager's conversation keeps growing.` : COMPACT_NOTE
  return { compactAt, compactChoices, pickCompact, compactNote, view, provider, model, loading, modelError, saving, confirm, setConfirm, error, setError, run, modelUnavailable, available, choices, modelChoices, pickProvider, pickModel, modelName, assistantName, retryModels: () => setReload((count) => count + 1) }
}

export function ManagerSettings({ settings, embedded = false }: { readonly settings: Settings; readonly embedded?: boolean }): React.JSX.Element {
  const { compactAt, compactChoices, pickCompact, compactNote, view, provider, model, loading, modelError, saving, confirm, setConfirm, error, setError, run, modelUnavailable, available, choices, modelChoices, pickProvider, pickModel, modelName, assistantName, retryModels } = useManagerSetup(settings)
  if (view === undefined) return <p role="status">Loading Manager...</p>
  return <section className="manager-settings">
    {embedded ? null : <><h3>Manager</h3><p>Give Manager work in the app or a connected channel. It delegates work to separate sessions and brings back results.</p></>}
    <ManagerFlow step="enable" delegation="automatic" />
    <div className="manager-group">
      <div className="manager-setting"><span>Assistant</span><Picker title="Manager assistant" chosen={provider} label={assistantName} choices={choices} explained disabled={saving} onPick={pickProvider} /></div>
      <div className="manager-setting"><span>Model</span><Picker title="Manager model" chosen={model} label={loading ? 'Loading...' : modelName} disabled={saving || loading} choices={modelChoices} onPick={pickModel} /></div>
      <div className="manager-setting"><span>Compact conversation at</span><Picker title="Compact conversation at" chosen={String(compactAt)} label={compactLabel(compactAt)} disabled={saving} choices={compactChoices} onPick={pickCompact} /></div>
      <div className="manager-setting">
        <span>Status</span>
        <span className="manager-status">
          <span className="manager-status-text">{saving ? 'Saving...' : managerLabel(view)}</span>
          {view.state === 'paused' ? <button type="button" className="quiet small" disabled={saving} onClick={() => { void run(() => window.geckit.manager.resume()) }}>Resume</button> : null}
          {view.state === 'blocked' ? <button type="button" className="quiet small" disabled={saving} onClick={() => { void run(() => window.geckit.manager.retry()) }}>Try again</button> : null}
          {view.session === undefined ? null : <button type="button" className="quiet small" disabled={saving} onClick={() => { setError(''); setConfirm({ kind: 'restart' }) }}>Restart</button>}
        </span>
      </div>
    </div>
    <p className="manager-note">New Manager conversations use this. Each conversation keeps the model it was given.</p>
    <p className="manager-note">{compactNote}</p>
    {modelError ? <p className="manager-message" role="status">Could not load models. <button type="button" className="quiet small" onClick={retryModels}>Try again</button></p> : null}
    {modelUnavailable ? <p className="manager-error" role="alert">This model is unavailable. Choose another model.</p> : null}
    {available?.available === false ? <p className="manager-error" role="alert">{available.reason}</p> : null}
    {available === undefined ? <p className="manager-error" role="alert">{view.providers.length === 0 ? 'Enable an assistant in Assistants to run Manager.' : 'This assistant is disabled. Choose an enabled assistant or restore it in Assistants.'}</p> : null}
    {view.state === 'paused' ? <p className="manager-note" role="status">Manager paused. Workers continue.</p> : null}
    {confirm === undefined && error !== '' ? <p className="manager-error" role="alert">{error}</p> : null}
    {view.error === undefined ? null : <p className="manager-error" role="status">{view.error}</p>}
    <p className="manager-note">{PROJECTS}</p>
    {confirm === undefined ? null : <ManagerConfirm busy={saving} working={view.state === 'working' || view.session?.state === 'working'} error={error} onCancel={() => setConfirm(undefined)} onConfirm={() => { void run(() => window.geckit.manager.restart()) }} />}
  </section>
}

function ManagerConfirm({ busy, working, error, onCancel, onConfirm }: { readonly busy: boolean; readonly working: boolean; readonly error: string; readonly onCancel: () => void; readonly onConfirm: () => void }): React.JSX.Element {
  const cancel = useRef<HTMLButtonElement>(null)
  const dialog = useRef<HTMLDivElement>(null)
  const latest = useRef({ busy, onCancel })
  useEffect(() => { latest.current = { busy, onCancel } }, [busy, onCancel])
  useEffect(() => {
    const before = document.activeElement
    cancel.current?.focus()
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (!latest.current.busy) latest.current.onCancel() }
      if (event.key !== 'Tab') return
      const buttons = dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
      const first = buttons?.[0]
      const last = buttons?.[buttons.length - 1]
      if (first === undefined) { event.preventDefault(); return }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('keydown', key, true); if (before instanceof HTMLElement) before.focus() }
  }, [])
  return createPortal(<div className="dialog-scrim" onMouseDown={(event) => { event.stopPropagation(); if (!busy && event.target === event.currentTarget) onCancel() }}><div ref={dialog} className="dialog manager-session" role="dialog" aria-modal="true" aria-labelledby="manager-change-title">
    <header><h2 id="manager-change-title">Restart manager session?</h2></header>
    <p>Task history is kept. Workers continue.</p>
    {!working ? null : <p>The current manager turn will be interrupted.</p>}
    {error === '' ? null : <p className="manager-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button ref={cancel} type="button" className="quiet" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className="primary" disabled={busy} onClick={onConfirm}>{busy ? 'Saving...' : 'Restart session'}</button></div>
  </div></div>, document.body)
}

/** Manager's setup on the phone, as grouped rows: the assistant and model it runs on, each picked from a sheet, and how it stands. */
export function PhoneManagerSetup({ settings }: { readonly settings: Settings }): React.JSX.Element {
  const { compactAt, compactChoices, pickCompact, compactNote, view, provider, model, loading, modelError, saving, confirm, setConfirm, error, setError, run, modelUnavailable, available, choices, modelChoices, pickProvider, pickModel, modelName, assistantName, retryModels } = useManagerSetup(settings)
  const [picking, setPicking] = useState<'assistant' | 'model' | 'compact'>()
  if (view === undefined) return <div className="phone-group" aria-busy="true"><div className="phone-cell"><span className="skeleton-line" /></div><div className="phone-cell"><span className="skeleton-line" /></div></div>
  const trouble = modelUnavailable ? 'This model is unavailable. Choose another model.' : available?.available === false ? available.reason ?? '' : available === undefined ? (view.providers.length === 0 ? 'Enable an assistant in Assistants on your computer to run Manager.' : 'This assistant is disabled. Choose an enabled assistant.') : confirm === undefined ? error || view.error || '' : ''
  return <>
    <div className="phone-group">
      <Cell label="Assistant" value={assistantName} onPress={() => { if (!saving) setPicking('assistant') }} />
      <Cell label="Model" value={loading ? 'Loading…' : modelName} onPress={() => { if (!saving && !loading) setPicking('model') }} />
      <Cell label="Compact At" value={compactLabel(compactAt)} onPress={() => { if (!saving) setPicking('compact') }} />
      <Cell label="Status" value={saving ? 'Saving…' : managerLabel(view)} />
      {view.state === 'paused' ? <Cell label="Resume" accent onPress={() => { void run(() => window.geckit.manager.resume()) }} /> : null}
      {view.state === 'blocked' ? <Cell label="Try Again" accent onPress={() => { void run(() => window.geckit.manager.retry()) }} /> : null}
      {view.session === undefined ? null : <Cell label="Restart Session" accent onPress={() => { setError(''); setConfirm({ kind: 'restart' }) }} />}
    </div>
    <div className="phone-note">{trouble !== '' ? trouble : modelError ? 'Could not load models.' : 'New Manager conversations use this. Each conversation keeps the model it was given.'}</div>
    {modelError ? <div className="phone-group"><Cell label="Load Models Again" accent onPress={retryModels} /></div> : null}
    <div className="phone-note">{compactNote}</div>
    {picking === undefined ? null : <Menu anchor={new DOMRect()} title={picking === 'assistant' ? 'Manager Assistant' : picking === 'compact' ? 'Compact Conversation At' : 'Manager Model'} chosen={picking === 'assistant' ? provider : picking === 'compact' ? String(compactAt) : model} choices={picking === 'assistant' ? choices : picking === 'compact' ? compactChoices : modelChoices} explained onPick={picking === 'assistant' ? pickProvider : picking === 'compact' ? pickCompact : pickModel} onClose={() => setPicking(undefined)} />}
    {confirm === undefined ? null : <Menu anchor={new DOMRect()} title={view.state === 'working' || view.session?.state === 'working' ? 'Restart the Manager session? Its current turn stops. Task history is kept and workers continue.' : 'Restart the Manager session? Task history is kept and workers continue.'} choices={[{ value: 'restart', label: 'Restart Session', danger: true }]} onPick={() => { void run(() => window.geckit.manager.restart()) }} onClose={() => setConfirm(undefined)} />}
  </>
}
