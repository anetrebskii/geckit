import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { ClaudeModel, Settings } from '../../../shared/api'
import type { ManagerConfig, ManagerView } from '../../../shared/manager'
import { llmProviderInfo } from '../../../shared/providers'
import { Picker } from '../ui/Menu'
import { ManagerFlow } from './ManagerFlow'
import { managerAssistant } from './manager-label'
import { managerLabel, useManager } from './useManager'

const PROJECTS = 'Works in all projects, current and future, across every profile. Telegram, Slack and Discord reach Manager from Settings, Channels.'

/** Manager is always on and starts work by itself, so its setup is the assistant that runs it, saved as soon as it is picked, and how it stands. */
export function ManagerSettings({ settings, embedded = false }: { readonly settings: Settings; readonly embedded?: boolean }): React.JSX.Element {
  const view = useManager()
  const [reload, setReload] = useState(0)
  const [fetched, setFetched] = useState<{ readonly key: string; readonly models: readonly ClaudeModel[] | undefined }>()
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<{ readonly kind: 'change'; readonly provider: ManagerConfig['provider'] } | { readonly kind: 'restart' }>()
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
  if (view === undefined) return <p role="status">Loading Manager...</p>
  const modelUnavailable = model !== '' && models !== undefined && !models.some((one) => one.value === model && one.disabled !== true)
  const available = view.providers.find((one) => one.provider === provider)
  const choices = view.providers.map((one) => ({ value: one.provider, label: llmProviderInfo(one.provider, 'stream', settings.providerPlugins).name, ...(one.available ? {} : { disabled: true, says: one.reason ?? 'This assistant cannot run as a manager.' }) }))
  const configure = (change: Partial<ManagerConfig>): void => { void run(() => window.geckit.manager.configure({ enabled: true, delegation: 'automatic', ...change })) }
  const pickProvider = (value: string): void => {
    const chosen = view.providers.find((one) => one.provider === value)
    if (chosen?.available !== true || chosen.provider === provider) return
    setError('')
    if (view.session !== undefined && chosen.provider !== managerAssistant(view)) setConfirm({ kind: 'change', provider: chosen.provider })
    else configure({ provider: chosen.provider, chatModel: '' })
  }
  const modelName = model === '' ? 'Provider default' : models?.find((one) => one.value === model)?.name ?? model
  const assistantName = llmProviderInfo(provider, 'stream', settings.providerPlugins).name
  return <section className="manager-settings">
    {embedded ? null : <><h3>Manager</h3><p>Give Manager work in the app or a connected channel. It delegates work to separate sessions and brings back results.</p></>}
    <ManagerFlow step="enable" delegation="automatic" />
    <div className="manager-group">
      <div className="manager-setting"><span>Assistant</span><Picker title="Manager assistant" chosen={provider} label={assistantName} choices={choices} explained disabled={saving} onPick={pickProvider} /></div>
      <div className="manager-setting"><span>Model</span><Picker title="Manager model" chosen={model} label={loading ? 'Loading...' : modelName} disabled={saving || loading} choices={[{ value: '', label: 'Provider default' }, ...(models ?? []).filter((one) => one.value !== '').map((one) => ({ value: one.value, label: one.name, ...(one.says === undefined ? {} : { says: one.says }), ...(one.disabled === true ? { disabled: true } : {}) }))]} onPick={(value) => { if (value !== model) configure({ chatModel: value }) }} /></div>
      <div className="manager-setting">
        <span>Status</span>
        <span className="manager-status">
          <span className="manager-status-text">{saving ? 'Saving...' : managerLabel(view)}{view.session !== undefined && view.config.chatModel !== (view.session.chosen ?? '') ? ` · ${view.config.chatModel || 'Provider default'} from the next turn` : ''}</span>
          {view.state === 'paused' ? <button type="button" className="quiet small" disabled={saving} onClick={() => { void run(() => window.geckit.manager.resume()) }}>Resume</button> : null}
          {view.state === 'blocked' ? <button type="button" className="quiet small" disabled={saving} onClick={() => { void run(() => window.geckit.manager.retry()) }}>Try again</button> : null}
          {view.session === undefined ? null : <button type="button" className="quiet small" disabled={saving} onClick={() => { setError(''); setConfirm({ kind: 'restart' }) }}>Restart</button>}
        </span>
      </div>
    </div>
    {modelError ? <p className="manager-message" role="status">Could not load models. <button type="button" className="quiet small" onClick={() => setReload((count) => count + 1)}>Try again</button></p> : null}
    {modelUnavailable ? <p className="manager-error" role="alert">This model is unavailable. Choose another model.</p> : null}
    {available?.available === false ? <p className="manager-error" role="alert">{available.reason}</p> : null}
    {available === undefined ? <p className="manager-error" role="alert">{view.providers.length === 0 ? 'Enable an assistant in Assistants to run Manager.' : 'This assistant is disabled. Choose an enabled assistant or restore it in Assistants.'}</p> : null}
    {view.state === 'paused' ? <p className="manager-note" role="status">Manager paused. Workers continue.</p> : null}
    {confirm === undefined && error !== '' ? <p className="manager-error" role="alert">{error}</p> : null}
    {view.error === undefined ? null : <p className="manager-error" role="status">{view.error}</p>}
    <p className="manager-note">{PROJECTS}</p>
    {confirm === undefined ? null : <ManagerConfirm kind={confirm.kind} busy={saving} working={view.state === 'working' || view.session?.state === 'working'} error={error} onCancel={() => setConfirm(undefined)} onConfirm={() => { if (confirm.kind === 'change') configure({ provider: confirm.provider, chatModel: '' }); else void run(() => window.geckit.manager.restart()) }} />}
  </section>
}

function ManagerConfirm({ kind, busy, working, error, onCancel, onConfirm }: { readonly kind: 'change' | 'restart'; readonly busy: boolean; readonly working: boolean; readonly error: string; readonly onCancel: () => void; readonly onConfirm: () => void }): React.JSX.Element {
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
    <header><h2 id="manager-change-title">{kind === 'change' ? 'Change manager assistant?' : 'Restart manager session?'}</h2></header>
    <p>{kind === 'change' ? 'The manager session will restart with the selected assistant. Saved tasks and decisions stay. Workers keep their current assistants.' : 'Task history is kept. Workers continue.'}</p>
    {!working ? null : <p>{kind === 'restart' ? 'The current manager turn will be interrupted.' : 'The current manager turn will stop.'}</p>}
    {error === '' ? null : <p className="manager-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button ref={cancel} type="button" className="quiet" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className="primary" disabled={busy} onClick={onConfirm}>{busy ? 'Saving...' : kind === 'change' ? 'Change assistant' : 'Restart session'}</button></div>
  </div></div>, document.body)
}
