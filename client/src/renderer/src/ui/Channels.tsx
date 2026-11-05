import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Settings } from '../../../shared/api'
import type { ChannelChange, ChannelId, ChannelSetting, ChannelValue, ChannelView, ChannelsView } from '../../../shared/channels'
import type { Geckit } from '../../../preload'
import { homePath, projectLabel, projectName } from '../chat/project'
import { Icon, hasIcon } from './Icon'

export type ChannelsApi = Geckit['channels']

const reason = (error: unknown): string => (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': Error: /, '')

function stateLine(view: ChannelView): string {
  const threads = view.threads ?? 0
  const count = `${view.conversations === 0 ? '' : ` · ${String(view.conversations)} conversation${view.conversations === 1 ? '' : 's'}`}${threads === 0 ? '' : ` · ${String(threads)} thread${threads === 1 ? '' : 's'}`}`
  if (view.state === 'off') return `Off${count}`
  if (view.state === 'setup') return view.says ?? 'Fill in its settings.'
  if (view.state === 'starting') return 'Starting…'
  if (view.state === 'failed') return `Stopped: ${view.says ?? 'it failed to start.'}`
  return `Connected${view.says === undefined || view.says === '' ? '' : ` · ${view.says}`}${count}`
}

function SetUp({ setting, view, settings, api, onDone }: {
  readonly setting: ChannelSetting
  readonly view: ChannelView
  readonly settings: Settings
  readonly api: ChannelsApi
  readonly onDone: () => void
}): React.JSX.Element {
  const [values, setValues] = useState<{ readonly [key: string]: ChannelValue }>(() => Object.fromEntries(setting.info.fields.filter((field) => field.type !== 'secret').map((field) => [field.key, setting.config[field.key] ?? field.default ?? (field.type === 'boolean' ? false : field.type === 'list' ? [] : '')])))
  const [secrets, setSecrets] = useState<{ readonly [key: string]: string | null }>({})
  const [projects, setProjects] = useState<readonly string[]>(setting.projects.filter((root) => settings.projects.includes(root)))
  const [manager, setManager] = useState(setting.manager)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const first = useRef<HTMLFormElement>(null)
  useLayoutEffect(() => { first.current?.querySelector<HTMLElement>('input, textarea, button')?.focus() }, [])
  const save = (): void => {
    setSaving(true)
    setError('')
    const change: ChannelChange = { config: values, secrets, projects, manager }
    void api.configure(setting.info.id, change).then(onDone).catch((failure: unknown) => setError(reason(failure))).finally(() => setSaving(false))
  }
  return (
    <form ref={first} className="channel-setup" onSubmit={(event) => { event.preventDefault(); save() }} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onDone() } }}>
      {setting.info.fields.map((field) => {
        const id = `channel-${setting.info.id.replace(':', '-')}-${field.key}`
        const help = field.help === undefined ? null : <span className="channel-help">{field.help}</span>
        if (field.type === 'boolean') return (
          <div key={field.key} className="field">
            <label className="check"><input id={id} type="checkbox" checked={values[field.key] === true} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.checked }))} />{field.label}</label>
            {help}
          </div>
        )
        if (field.type === 'secret') {
          const saved = view.secrets.includes(field.key) && secrets[field.key] !== null
          return (
            <div key={field.key} className="field">
              <label htmlFor={id}>{field.label}{field.required === true ? '' : ' (optional)'}</label>
              <div className="channel-secret">
                <input id={id} type="password" autoComplete="off" value={secrets[field.key] ?? ''} placeholder={saved ? 'Saved' : ''} onChange={(event) => setSecrets((current) => ({ ...current, [field.key]: event.target.value }))} />
                {saved ? <button type="button" className="quiet" onClick={() => setSecrets((current) => ({ ...current, [field.key]: null }))}>Forget</button> : null}
              </div>
              {help}
            </div>
          )
        }
        if (field.type === 'list') return (
          <div key={field.key} className="field">
            <label htmlFor={id}>{field.label}</label>
            <textarea id={id} rows={3} value={(values[field.key] as readonly string[] | undefined ?? []).join('\n')} placeholder="One per line" onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value.split('\n') }))} />
            {help}
          </div>
        )
        return (
          <div key={field.key} className="field">
            <label htmlFor={id}>{field.label}{field.required === true ? '' : ' (optional)'}</label>
            <input id={id} type="text" value={String(values[field.key] ?? '')} onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))} />
            {help}
          </div>
        )
      })}
      <div className="field">
        <label>Folders it may use</label>
        {settings.projects.length === 0 ? <span className="channel-help">Add a folder to GeckIt first.</span> : (
          <div className="projects-listed">
            {settings.projects.map((root) => {
              const on = projects.includes(root)
              return (
                <button key={root} type="button" role="switch" aria-checked={on} aria-label={projectLabel(root)} className={`project-listed${on ? '' : ' off'}`} onClick={() => setProjects((current) => on ? current.filter((one) => one !== root) : [...current, root])}>
                  <span className="tick">{on ? <Icon name="check" size={13} /> : null}</span>
                  <span className="name">{projectName(root)}</span>
                  <span className="says">{homePath(root)}</span>
                </button>
              )
            })}
          </div>
        )}
        <span className="channel-help">None ticked means it cannot start conversations.</span>
      </div>
      <div className="field">
        <label className="check"><input type="checkbox" checked={manager} onChange={(event) => setManager(event.target.checked)} />May talk to Manager</label>
      </div>
      {error === '' ? null : <span className="error" role="alert">{error}</span>}
      <div className="channel-setup-actions">
        <button type="button" className="quiet" disabled={saving} onClick={onDone}>Cancel</button>
        <button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  )
}

function ChannelRow({ setting, view, settings, api }: {
  readonly setting: ChannelSetting
  readonly view: ChannelView
  readonly settings: Settings
  readonly api: ChannelsApi
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const setUpButton = useRef<HTMLButtonElement>(null)
  const removeButton = useRef<HTMLButtonElement>(null)
  const toggle = (enabled: boolean): void => {
    setError('')
    void api.configure(setting.info.id, { enabled }).then((next) => { if (enabled && next.channels.find((one) => one.id === setting.info.id)?.state === 'setup') setOpen(true) }).catch((failure: unknown) => setError(reason(failure)))
  }
  const close = (): void => { setOpen(false); setUpButton.current?.focus() }
  return (
    <div className="provider-library-row channel-row">
      <span className="provider-library-icon"><Icon name={hasIcon(setting.info.icon) ? setting.info.icon : 'chat'} size={16} /></span>
      <span className="provider-library-copy">
        <strong>{setting.info.name}</strong>
        <span className={view.state === 'failed' ? 'channel-failed' : ''} title={setting.info.source}>{stateLine(view)}</span>
      </span>
      <label className="check channel-on"><input type="checkbox" checked={setting.enabled} onChange={(event) => toggle(event.target.checked)} />On</label>
      <button ref={setUpButton} type="button" className="quiet provider-library-remove" aria-expanded={open} onClick={() => open ? close() : setOpen(true)}>Set up</button>
      {view.builtIn === true ? null : <button ref={removeButton} type="button" className="quiet provider-library-remove" aria-label={`Remove ${setting.info.name}`} aria-expanded={confirming} disabled={busy} onClick={() => setConfirming((current) => !current)}>Remove</button>}
      {error === '' ? null : <p className="provider-library-failure-reason" role="alert">{error}</p>}
      {confirming ? <div className="provider-library-confirm">
        <span>Remove {setting.info.name}? It stops, its copy moves to Trash, and GeckIt forgets its settings and secrets. Conversations it started stay.</span>
        <div>
          <button type="button" className="quiet" disabled={busy} onClick={() => { setConfirming(false); removeButton.current?.focus() }}>Cancel</button>
          <button type="button" className="primary danger" disabled={busy} onClick={() => {
            setBusy(true)
            void api.remove(setting.info.id).catch((failure: unknown) => { setError(reason(failure)); setBusy(false) })
          }}>{busy ? 'Removing…' : 'Remove channel'}</button>
        </div>
      </div> : null}
      {open ? <SetUp setting={setting} view={view} settings={settings} api={api} onDone={close} /> : null}
    </div>
  )
}

export function Channels({ settings, change, api = window.geckit.channels }: { readonly settings: Settings; readonly change: (change: Partial<Settings>) => void; readonly api?: ChannelsApi }): React.JSX.Element {
  const [view, setView] = useState<ChannelsView | undefined>(undefined)
  const [adding, setAdding] = useState(false)
  const [repository, setRepository] = useState('')
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState('')
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState('')
  const [removingFailure, setRemovingFailure] = useState('')
  useEffect(() => {
    void api.view().then(setView).catch(() => setView({ channels: [], failures: [] }))
    return api.on(setView)
  }, [api])
  const rows = settings.channels.flatMap((setting) => {
    const shown = view?.channels.find((one) => one.id === setting.info.id)
    return shown === undefined ? [] : [{ setting, shown }]
  })
  const failures = view?.failures ?? []
  const nameOf = (id: ChannelId): string => settings.channels.find((one) => one.info.id === id)?.info.name ?? id
  return (
    <section className="provider-libraries" aria-labelledby="channels-title">
      <div className="provider-library-head">
        <h3 id="channels-title">Channels</h3>
        <button type="button" className="provider-library-add-button" onClick={() => setAdding(true)} disabled={adding}><Icon name="plus" size={14} />Add channel</button>
      </div>
      <p className="provider-library-intro">Libraries from GitHub that bring your conversations to Slack, Telegram or another place. Each decides how it works with them.</p>
      {view === undefined ? null : rows.length === 0 && failures.length === 0 ? adding ? null : <p className="provider-library-empty">No channels installed.</p> : <div className="provider-library-list">
        {failures.map((failure) => (
          <div key={failure.id ?? failure.name} className="provider-library-row provider-library-failure">
            <span className="provider-library-icon"><Icon name="chat" size={16} /></span>
            <span className="provider-library-copy"><strong>{failure.name}</strong><span title={failure.source}>{failure.source?.replace(/^https:\/\//, '') ?? 'Installed locally'}</span></span>
            {failure.id === undefined ? null : <button type="button" className="quiet provider-library-remove" disabled={removingFailure === failure.id} onClick={() => {
              const id = failure.id
              if (id === undefined) return
              setRemovingFailure(id)
              void api.remove(id).then(setView).catch((error: unknown) => setMessage(reason(error))).finally(() => setRemovingFailure(''))
            }}>Remove</button>}
            <p className="provider-library-failure-reason" role="alert">Could not load this channel: {failure.error}</p>
          </div>
        ))}
        {rows.map(({ setting, shown }) => <ChannelRow key={setting.info.id} setting={setting} view={shown} settings={settings} api={api} />)}
      </div>}
      {adding ? <form className="provider-library-add" onSubmit={(event) => {
        event.preventDefault()
        setInstalling(true)
        setInstallError('')
        void api.install(repository.trim()).then((next) => { setView(next); setRepository(''); setAdding(false) }).catch((error: unknown) => setInstallError(reason(error))).finally(() => setInstalling(false))
      }}>
        <input autoFocus type="url" required value={repository} placeholder="https://github.com/owner/repository" aria-label="GitHub repository URL" onChange={(event) => setRepository(event.target.value)} />
        <button type="submit" className="primary" disabled={installing || repository.trim() === ''}>{installing ? 'Adding channel…' : 'Add'}</button>
        <button type="button" className="quiet" disabled={installing} onClick={() => { setAdding(false); setRepository(''); setInstallError('') }}>Cancel</button>
      </form> : null}
      {installError === '' ? null : <span className="error" role="alert">{installError}</span>}
      {adding ? <p className="provider-library-trust">Channel code runs on this computer and reaches the conversations you allow it. Add a repository you trust.</p> : null}
      {message === '' ? null : <span role="status">{message}</span>}
      <div className="provider-library-updates">
        <label className="check"><input type="checkbox" checked={settings.channelAutoUpdate} onChange={(event) => change({ channelAutoUpdate: event.target.checked })} />Update channels automatically</label>
        {rows.length === 0 ? null : <button type="button" className="quiet" disabled={checking} onClick={() => {
          setChecking(true)
          setMessage('')
          void api.checkUpdates().then((result) => setMessage(result.failed.length > 0 ? 'Could not check every channel. Try again.' : result.updated.length === 0 ? 'Channels are up to date.' : `Updated ${result.updated.map(nameOf).join(', ')}.`)).catch(() => setMessage('Could not check every channel. Try again.')).finally(() => setChecking(false))
        }}>{checking ? 'Checking…' : 'Check now'}</button>}
      </div>
    </section>
  )
}
