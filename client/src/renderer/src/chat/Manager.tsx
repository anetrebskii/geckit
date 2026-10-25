import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { ClaudeModel, Settings } from '../../../shared/api'
import type { ManagerConfig, ManagerView } from '../../../shared/manager'
import { llmProviderInfo } from '../../../shared/providers'
import { Picker } from '../ui/Menu'
import { ManagerFlow } from './ManagerFlow'
import type { ManagerStepName } from './ManagerFlow'
import { ManagerStep } from './ManagerStep'
import { ManagerSources } from './ManagerSources'
import { ManagerTelegram, SharedLinks, useTelegram } from './ManagerTelegram'
import { managerAssistant } from './manager-label'
import { managerLabel, useManager } from './useManager'

const ORDER: readonly ManagerStepName[] = ['assistant', 'delegation', 'telegram', 'enable']
const LOCKED: Record<ManagerStepName, string> = { assistant: '', delegation: 'Choose the assistant first.', telegram: 'Decide how work starts first.', enable: 'Connect Telegram first.' }
const PROJECTS = 'All projects, current and future, across every profile.'

export function ManagerSettings({ settings }: { readonly settings: Settings }): React.JSX.Element {
  const view = useManager()
  const [telegram, setTelegram] = useTelegram()
  const initialProvider = useRef(view?.config.provider ?? 'claude')
  const [provider, setProvider] = useState<ManagerConfig['provider']>(view?.config.provider ?? 'claude')
  const [delegation, setDelegation] = useState<ManagerConfig['delegation']>('automatic')
  const [model, setModel] = useState(view?.config.chatModel ?? '')
  const [models, setModels] = useState<readonly ClaudeModel[]>()
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [modelError, setModelError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<'change' | 'restart' | 'disable'>()
  const [error, setError] = useState('')
  const [passed, setPassed] = useState<readonly ManagerStepName[]>([])
  const [opened, setOpened] = useState<ManagerStepName>()
  const loaded = useRef(false)
  useEffect(() => {
    if (view === undefined || loaded.current) return
    loaded.current = true
    if (view.config.provider !== initialProvider.current) {
      setLoading(true)
      setModelError(false)
      setModels(undefined)
    }
    setProvider(view.config.provider)
    setModel(view.config.chatModel)
    setDelegation(view.config.delegation)
  }, [view])
  useEffect(() => {
    let here = true
    void window.geckit.chat.models(undefined, provider).then((found) => {
      if (!here) return
      setModels(found)
      setModelError(found === undefined)
      setLoading(false)
    }, () => { if (here) { setModelError(true); setLoading(false) } })
    return () => { here = false }
  }, [provider, reload])
  const run = async (action: () => Promise<ManagerView>): Promise<void> => {
    setSaving(true)
    setError('')
    try { await action() } catch (caught) { setError(caught instanceof Error ? caught.message : String(caught)) }
    finally { setSaving(false) }
  }
  const enabled = view?.config.enabled === true
  const modelUnavailable = model !== '' && models !== undefined && !models.some((one) => one.value === model && one.disabled !== true)
  const available = view?.providers.find((one) => one.provider === provider)
  const choices = view?.providers.map((one) => ({ value: one.provider, label: llmProviderInfo(one.provider, 'stream', settings.providerPlugins).name, ...(one.available ? {} : { disabled: true, says: one.reason ?? 'This assistant cannot run as a manager.' }) })) ?? []
  if (view === undefined) return <p role="status">Loading Manager...</p>
  const save = (): void => {
    void run(async () => {
      const next = await window.geckit.manager.configure({ enabled: true, provider, chatModel: model, delegation })
      setConfirm(undefined)
      setPassed(ORDER)
      setOpened(undefined)
      return next
    })
  }
  const saveNow = (): void => { if (view.session !== undefined && provider !== managerAssistant(view)) { setError(''); setConfirm('change') } else save() }
  const answer = (step: ManagerStepName): void => { setPassed((before) => before.includes(step) ? before : [...before, step]); setOpened(undefined) }
  const settled = available?.available === true && !modelUnavailable
  const answered: Record<ManagerStepName, boolean> = {
    assistant: settled && (enabled || passed.includes('assistant')),
    delegation: enabled || passed.includes('delegation'),
    telegram: telegram?.state === 'connected',
    enable: enabled,
  }
  const current = ORDER.find((step) => !answered[step]) ?? 'enable'
  const focus = opened ?? current
  const stepState = (step: ManagerStepName): 'open' | 'answered' | 'locked' => {
    if (step === opened || step === current || (step === 'enable' && enabled)) return 'open'
    if (answered[step]) return 'answered'
    return ORDER.indexOf(step) > ORDER.indexOf(current) ? 'locked' : 'answered'
  }
  const modelName = model === '' ? 'Provider default' : models?.find((one) => one.value === model)?.name ?? model
  const assistantName = llmProviderInfo(provider, 'stream', settings.providerPlugins).name
  const delegationName = delegation === 'approve' ? 'Approve new sessions' : 'Automatic delegation'
  const account = telegram?.account === undefined ? undefined : `${telegram.bot === undefined ? '' : `@${telegram.bot.username} · `}${telegram.account.name}`
  const reopen = (step: ManagerStepName) => () => { setError(''); setOpened(step) }
  const done = <button type="button" className="quiet" onClick={() => setOpened(undefined)}>Done</button>
  return <section className="manager-settings">
    <h3>Manager</h3>
    <p>Manage GeckIt from Telegram. The manager delegates work to separate sessions and brings back results.</p>
    {enabled || view.session === undefined ? null : <p role="status">Manager disabled. History is kept.</p>}
    <ManagerFlow step={focus} delegation={delegation} />
    <ol className="manager-steps">
      <ManagerStep number={1} title="Choose the assistant" value={`${assistantName} · ${modelName}`} state={stepState('assistant')} onOpen={reopen('assistant')}>
        <div className="manager-setting"><span>Assistant</span><Picker title="Manager assistant" chosen={provider} label={assistantName} choices={choices} explained disabled={saving} onPick={(value) => { const chosen = view.providers.find((one) => one.provider === value); if (chosen?.available && chosen.provider !== provider) { setLoading(true); setModelError(false); setModels(undefined); setProvider(chosen.provider); setModel('') } }} /></div>
        <div className="manager-setting"><span>Model</span><Picker title="Manager model" chosen={model} label={modelName} disabled={saving || loading} choices={[{ value: '', label: 'Provider default' }, ...(models ?? []).filter((one) => one.value !== '').map((one) => ({ value: one.value, label: one.name, ...(one.says === undefined ? {} : { says: one.says }), ...(one.disabled === true ? { disabled: true } : {}) }))]} onPick={setModel} /></div>
        {loading ? <p role="status">Loading models...</p> : modelError ? <p className="manager-message" role="status">Could not load models. <button type="button" className="quiet" onClick={() => { setLoading(true); setModelError(false); setModels(undefined); setReload((count) => count + 1) }}>Try again</button></p> : null}
        {modelUnavailable ? <p className="manager-error" role="alert">This model is unavailable. Choose another model or try again.</p> : null}
        {available?.available === false ? <p className="manager-error" role="alert">{available.reason}</p> : null}
        {available === undefined ? <p className="manager-error" role="alert">{view.providers.length === 0 ? 'Enable an assistant in Assistants to set up Manager.' : 'This assistant is disabled. Choose an enabled assistant or restore it in Assistants.'}</p> : null}
        <div className="manager-actions">
          {enabled
            ? <><button type="button" className="primary" disabled={saving || !settled} onClick={saveNow}>{saving ? 'Saving...' : 'Save changes'}</button>{done}</>
            : <button type="button" className="primary" disabled={!settled || loading} onClick={() => answer('assistant')}>Continue</button>}
        </div>
      </ManagerStep>
      <ManagerStep number={2} title="Decide how work starts" value={delegationName} state={stepState('delegation')} locked={LOCKED.delegation} onOpen={reopen('delegation')}>
        <div className="manager-setting"><span>Delegation</span><Picker title="Delegation policy" label={delegationName} chosen={delegation} choices={[{ value: 'automatic', label: 'Automatic delegation', says: 'Start and follow up on requested work. Worker permissions still apply.' }, { value: 'approve', label: 'Approve new sessions', says: 'Review each new worker before it starts.' }]} explained onPick={(value) => setDelegation(value === 'approve' ? 'approve' : 'automatic')} /></div>
        <div className="manager-actions">
          {enabled
            ? <><button type="button" className="primary" disabled={saving || !settled} onClick={saveNow}>{saving ? 'Saving...' : 'Save changes'}</button>{done}</>
            : <button type="button" className="primary" onClick={() => answer('delegation')}>Continue</button>}
        </div>
      </ManagerStep>
      <ManagerStep number={3} title="Connect Telegram" {...(account === undefined ? {} : { value: account })} state={stepState('telegram')} locked={LOCKED.telegram} onOpen={reopen('telegram')}>
        <ManagerTelegram view={telegram} onView={setTelegram} {...(opened === 'telegram' ? { done } : {})} />
      </ManagerStep>
      <ManagerStep number={4} title={enabled ? 'Manager is on' : 'Turn Manager on'} state={stepState('enable')} locked={LOCKED.enable}>
        {enabled
          ? <>
            <dl className="manager-details"><dt>Status</dt><dd>{managerLabel(view)}</dd>{view.session === undefined ? null : <><dt>Current assistant</dt><dd>{llmProviderInfo(managerAssistant(view), 'stream', settings.providerPlugins).name}</dd><dt>Current model</dt><dd>{view.session.model ?? 'Provider default'}</dd>{view.config.chatModel === (view.session.chosen ?? '') ? null : <><dt>Next turn</dt><dd>{view.config.chatModel || 'Provider default'}</dd></>}</>}<dt>Projects</dt><dd>{PROJECTS}</dd></dl>
            {view.state === 'paused' ? <p role="status">Manager paused. Workers continue.</p> : null}
            <div className="manager-actions">
              <button type="button" className="primary" disabled={saving || available?.available !== true || modelUnavailable} onClick={saveNow}>{saving ? 'Saving...' : 'Save changes'}</button>
              <button type="button" className="quiet" disabled={saving} onClick={() => { void run(() => view.state === 'paused' ? window.geckit.manager.resume() : window.geckit.manager.pause()) }}>{view.state === 'paused' ? 'Resume' : 'Pause'}</button>
              {view.state !== 'blocked' ? null : <button type="button" className="quiet" disabled={saving} onClick={() => { void run(() => window.geckit.manager.retry()) }}>Try again</button>}
              <button type="button" className="quiet" disabled={saving} onClick={() => { setError(''); setConfirm('restart') }}>Restart session</button>
              <button type="button" className="quiet danger" disabled={saving} onClick={() => { setError(''); setConfirm('disable') }}>Disable Manager</button>
            </div>
          </>
          : <>
            <dl className="manager-details"><dt>Assistant</dt><dd>{assistantName}</dd><dt>Model</dt><dd>{modelName}</dd><dt>Delegation</dt><dd>{delegationName}</dd>{account === undefined ? null : <><dt>Telegram</dt><dd>{account}</dd></>}<dt>Projects</dt><dd>{PROJECTS}</dd></dl>
            <div className="manager-actions"><button type="button" className="primary" disabled={saving || !settled || !answered.telegram} onClick={save}>{saving ? 'Saving...' : 'Enable Manager'}</button></div>
          </>}
      </ManagerStep>
    </ol>
    <ManagerSources view={view} />
    <SharedLinks view={telegram} onView={setTelegram} />
    {error === '' ? null : <p className="manager-error" role="alert">{error}</p>}
    {view.error === undefined ? null : <p className="manager-error" role="status">{view.error}</p>}
    {confirm === undefined ? null : <ManagerConfirm kind={confirm} busy={saving} working={view.state === 'working' || view.session?.state === 'working'} error={error} onCancel={() => setConfirm(undefined)} onConfirm={() => { if (confirm === 'change') save(); else void run(async () => { const next = await (confirm === 'restart' ? window.geckit.manager.restart() : window.geckit.manager.configure({ enabled: false })); setConfirm(undefined); return next }) }} />}
  </section>
}

function ManagerConfirm({ kind, busy, working, error, onCancel, onConfirm }: { readonly kind: 'change' | 'restart' | 'disable'; readonly busy: boolean; readonly working: boolean; readonly error: string; readonly onCancel: () => void; readonly onConfirm: () => void }): React.JSX.Element {
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
    <header><h2 id="manager-change-title">{kind === 'change' ? 'Change manager assistant?' : kind === 'restart' ? 'Restart manager session?' : 'Disable manager?'}</h2></header>
    <p>{kind === 'change' ? 'The manager session will restart with the selected assistant. Saved tasks and decisions stay. Workers keep their current assistants.' : kind === 'restart' ? 'Task history is kept. Workers continue.' : 'Coordination and Telegram controls will stop. Workers continue. Your task history is kept.'}</p>
    {!working || kind === 'disable' ? null : <p>{kind === 'restart' ? 'The current manager turn will be interrupted.' : 'The current manager turn will stop.'}</p>}
    {error === '' ? null : <p className="manager-error" role="alert">{error}</p>}
    <div className="dialog-actions"><button ref={cancel} type="button" className="quiet" disabled={busy} onClick={onCancel}>Cancel</button><button type="button" className={kind === 'disable' ? 'quiet danger' : 'primary'} disabled={busy} onClick={onConfirm}>{busy ? 'Saving...' : kind === 'change' ? 'Change assistant' : kind === 'restart' ? 'Restart session' : 'Disable Manager'}</button></div>
  </div></div>, document.body)
}
