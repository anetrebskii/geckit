import { Fragment, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { ANYWHERE, UPDATE_CHANNELS, appName, assistantsIn, channelLabel, profileOf } from '../../../shared/api'
import { instructionsFor, llmProviderInfo } from '../../../shared/providers'
import type { LlmProviderInfo } from '../../../shared/providers'
import type { Anywhere, OpenRule, PhoneView, ProjectProfile, SessionProvider, Settings, Theme, UpdateChannel } from '../../../shared/api'
import { HostsSection } from '../chat/Hosts'
import { hostOf } from '../../../shared/hosts'
import { homePath, projectLabel, projectName } from '../chat/project'
import { Icon } from './Icon'
import { Picker } from './Menu'
import { MOD, said } from './Shortcuts'
import { Version } from './UpdateNotice'
import { removeProviderLibrary } from '../../../shared/library-removal'

/**
 * Settings, a section at a time: General, Profiles, Hosts, Phrases, Correct and dictation, Phone, Version.
 *
 * Chat needs no key: it runs on the Claude plan through the person's own
 * `claude`, which is signed in from a terminal and never from here.
 */

const THEMES: readonly { value: Theme; label: string; says: string }[] = [
  { value: 'system', label: 'System', says: 'as the system is set' },
  { value: 'light', label: 'Light', says: '' },
  { value: 'dark', label: 'Dark', says: '' },
]

export const LANGUAGES = [
  'English',
  'Russian',
  'Spanish',
  'German',
  'French',
  'Portuguese',
  'Italian',
  'Polish',
  'Turkish',
  'Ukrainian',
  'Chinese',
  'Japanese',
]

export type Section = 'general' | 'assistants' | 'libraries' | 'profiles' | 'hosts' | 'phrases' | 'correct' | 'phone' | 'version'

const SECTIONS: readonly { readonly value: Section; readonly label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'assistants', label: 'Assistants' },
  { value: 'libraries', label: 'Libraries' },
  { value: 'profiles', label: 'Profiles' },
  { value: 'hosts', label: 'Hosts' },
  { value: 'phrases', label: 'Phrases' },
  { value: 'correct', label: 'Correct and dictation' },
  { value: 'phone', label: 'Phone' },
  { value: 'version', label: 'Version' },
]

const NOTE = { fontSize: 12, color: 'var(--text-faint)' } as const

const ANYWHERE_SAID: readonly (readonly [Anywhere, string])[] = [
  ['correct', 'Correct the selected text'],
  ['dictate', 'Dictate'],
  ['record', 'Record the screen'],
  ['screenshot', 'Screenshot into a task or question'],
  ['orders', 'Say what to do'],
  ['search', 'Search conversations'],
]

export function SettingsDialog({
  settings,
  change,
  onClose,
  onShortcuts,
  first,
}: {
  readonly settings: Settings
  readonly change: (change: Partial<Settings>) => void
  readonly onClose: () => void
  readonly onShortcuts: () => void
  /** The section it opens on. */
  readonly first?: Section
}): React.JSX.Element {
  const [section, setSection] = useState<Section>(first ?? 'general')
  const onPhone = document.documentElement.classList.contains('phone')
  const navigation = useRef<HTMLElement>(null)

  useEffect(() => {
  }, [first, onPhone])

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  return (
    <div className="dialog-scrim" onMouseDown={onClose}>
      <div className="dialog settings-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <h2>Settings</h2>
        <div className="settings-body">
          <nav ref={navigation} className="settings-nav" aria-label="Sections">
            {SECTIONS.filter((one) => !onPhone || (one.value !== 'phone' && one.value !== 'libraries')).map((one) => (
              <button
                key={one.value}
                type="button"
                className={one.value === section ? 'on' : ''}
                aria-current={one.value === section ? 'page' : undefined}
                onClick={() => setSection(one.value)}
              >
                {one.label}
              </button>
            ))}
          </nav>
          <div key={section} className="settings-page">
            {section === 'general' ? (
              <General
                settings={settings}
                change={change}
                onWelcome={() => {
                  change({ welcomed: false })
                  onClose()
                }}
              />
            ) : null}
            {section === 'profiles' ? <Profiles settings={settings} change={change} /> : null}
            {section === 'assistants' ? <Assistants settings={settings} change={change} /> : null}
            {section === 'libraries' ? <Libraries settings={settings} change={change} /> : null}
            {section === 'hosts' ? <HostsSection /> : null}
            {section === 'phrases' ? <Phrases settings={settings} change={change} /> : null}
            {section === 'correct' ? <Correct settings={settings} change={change} /> : null}
            {section === 'phone' ? <PhoneAccess on={settings.phone} change={(phone) => change({ phone })} /> : null}
            {section === 'version' ? <Updates settings={settings} change={change} /> : null}
          </div>
        </div>

        <div className="dialog-actions">
          <button type="button" className="quiet" onClick={onShortcuts}>
            Keyboard shortcuts ({MOD}+/)
          </button>
          <span className="spacer" />
          <button type="button" className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

interface Part {
  readonly settings: Settings
  readonly change: (change: Partial<Settings>) => void
}

const ProviderLibraryRow = memo(function ProviderLibraryRow({ provider, ready, confirming, removing, onAsk, onCancel, onRemove }: {
  readonly provider: LlmProviderInfo
  readonly ready: boolean
  readonly confirming: boolean
  readonly removing: boolean
  readonly onAsk: (id: LlmProviderInfo['id']) => void
  readonly onCancel: () => void
  readonly onRemove: (provider: LlmProviderInfo) => void
}): React.JSX.Element {
  const removeButton = useRef<HTMLButtonElement>(null)
  const cancel = (): void => { onCancel(); removeButton.current?.focus() }
  return (
    <div className="provider-library-row">
      <span className="provider-library-icon"><Icon name={provider.icon} size={16} /></span>
      <span className="provider-library-copy"><strong>{provider.name}</strong><span title={provider.source}>{provider.source?.replace(/^https:\/\//, '') ?? 'Installed locally'}</span></span>
      {ready ? <span className="provider-library-ready" title="Loads after restart">Update ready</span> : null}
      <button ref={removeButton} type="button" className="quiet provider-library-remove" aria-label={`Remove ${provider.name}`} aria-expanded={confirming} disabled={removing} onClick={confirming ? cancel : () => onAsk(provider.id)}>Remove</button>
      {confirming ? <div className="provider-library-confirm">
        <span>Remove {provider.name}? Its installed copy moves to Trash. Restart GeckIt to unload its code.</span>
        <div>
          <button type="button" className="quiet" disabled={removing} onClick={cancel}>Cancel</button>
          <button type="button" className="primary danger" disabled={removing} onClick={() => onRemove(provider)}>{removing ? 'Removing…' : 'Remove library'}</button>
        </div>
      </div> : null}
    </div>
  )
})

function Assistants({ settings, change }: Part): React.JSX.Element {
  const enabled = assistantsIn(settings)
  const codexInfo = llmProviderInfo('codex', 'stream', settings.providerPlugins)
  const tmuxInfo = settings.providerPlugins.find((one) => one.id === 'claude-tmux')
  const toggle = (provider: SessionProvider, on: boolean): void => {
    const chatProviders = on ? [...enabled, provider] : enabled.filter((one) => one !== provider)
    if (chatProviders.length === 0) return
    change({ chatProviders, chatProvider: chatProviders.includes(settings.chatProvider) ? settings.chatProvider : chatProviders[0] ?? 'claude' })
  }
  return (
    <section className="assistant-settings" aria-labelledby="assistant-settings-title">
      <h3 id="assistant-settings-title">Assistants</h3>
      <div className="assistant-options">
        <label className="assistant-option">
          <span className="assistant-option-copy">
            <span className="assistant-option-name"><Icon name="claude" size={14} /> Claude Code</span>
            <span className="assistant-option-description">Your Claude plan</span>
          </span>
          <input className="assistant-toggle" type="checkbox" role="switch" aria-label="Use Claude Code" aria-describedby="assistant-settings-note" checked={enabled.includes('claude')} disabled={enabled.length === 1 && enabled.includes('claude')} onChange={(event) => toggle('claude', event.target.checked)} />
        </label>
        {tmuxInfo === undefined ? null : <div className="assistant-guide">
          <Picker label={`Default transport: ${settings.chatTransport === 'tmux' ? 'tmux' : 'Stream'}`} title="Claude Code transport for new conversations" chosen={settings.chatTransport} choices={[
            { value: 'stream', label: 'Stream', says: 'Claude Code' },
            { value: 'tmux', label: 'tmux', says: tmuxInfo.name, disabled: window.geckit.platform === 'win32' },
          ]} onPick={(value) => change({ chatTransport: value === 'tmux' ? 'tmux' : 'stream' })} />
          <span style={NOTE}>For new local conversations. Existing conversations keep their transport.</span>
        </div>}
        <details className="assistant-guide">
          <summary>GeckIt instructions</summary>
          <label className="check"><input type="checkbox" checked={settings.guideClaude} onChange={(event) => change({ guideClaude: event.target.checked })} />Tell Claude Code how GeckIt works</label>
          <span style={NOTE}>Writes GECKIT.md in ~/.claude and links it from ~/.claude/CLAUDE.md. Turning this off removes both.</span>
        </details>
        <label className="assistant-option">
          <span className="assistant-option-copy">
            <span className="assistant-option-name"><Icon name={codexInfo.icon} size={14} /> {codexInfo.name}</span>
            <span className="assistant-option-description">Your ChatGPT plan. Local folders only.</span>
          </span>
          <input className="assistant-toggle" type="checkbox" role="switch" aria-label={`Use ${codexInfo.name}`} aria-describedby="assistant-settings-note" checked={enabled.includes('codex')} disabled={enabled.length === 1 && enabled.includes('codex')} onChange={(event) => toggle('codex', event.target.checked)} />
        </label>
        <details className="assistant-guide">
          <summary>GeckIt instructions</summary>
          <label className="check"><input type="checkbox" checked={settings.guideCodex} onChange={(event) => change({ guideCodex: event.target.checked })} />Tell Codex how GeckIt works</label>
          <span style={NOTE}>Writes GECKIT.md in ~/.codex and links it from ~/.codex/AGENTS.md. Turning this off removes both.</span>
        </details>
        {settings.providerPlugins.filter((one) => one.family !== 'claude' && one.replaces === undefined).map((one) => {
          const instructions = instructionsFor(one)
          return (
          <Fragment key={one.id}>
            <label className="assistant-option">
              <span className="assistant-option-copy">
                <span className="assistant-option-name"><Icon name={one.icon} size={14} /> {one.name}</span>
                <span className="assistant-option-description">{one.source ?? 'Installed provider plugin'}</span>
              </span>
              <input className="assistant-toggle" type="checkbox" role="switch" aria-label={`Use ${one.name}`} checked={enabled.includes(one.family)} disabled={enabled.length === 1 && enabled.includes(one.family)} onChange={(event) => toggle(one.family, event.target.checked)} />
            </label>
            <details className="assistant-guide">
              <summary>GeckIt instructions</summary>
              <label className="check"><input type="checkbox" checked={instructions === 'claude' ? settings.guideClaude : instructions === 'codex' ? settings.guideCodex : settings.guidePlugins[one.id] ?? true} onChange={(event) => instructions === 'claude' ? change({ guideClaude: event.target.checked }) : instructions === 'codex' ? change({ guideCodex: event.target.checked }) : change({ guidePlugins: { ...settings.guidePlugins, [one.id]: event.target.checked } })} />Tell {one.name} how GeckIt works</label>
              <span style={NOTE}>{instructions === 'codex' ? 'Shares Codex instructions.' : instructions === 'claude' ? 'Shares Claude Code instructions.' : `${one.name} manages its own instructions.`}</span>
            </details>
          </Fragment>
          )
        })}
      </div>
      <p className="assistant-settings-note" id="assistant-settings-note">Turning off an assistant hides its conversations and pauses its shortcuts.</p>
    </section>
  )
}

function Libraries({ settings, change }: Part): React.JSX.Element {
  const readyLibraries = useMemo(() => new Set(settings.providerUpdatesReady), [settings.providerUpdatesReady])
  const addForm = useRef<HTMLFormElement>(null)
  const restartNotice = useRef<HTMLParagraphElement>(null)
  const [repository, setRepository] = useState('')
  const [adding, setAdding] = useState(false)
  const [installing, setInstalling] = useState(false)
  const [installError, setInstallError] = useState('')
  const [checking, setChecking] = useState(false)
  const [checkMessage, setCheckMessage] = useState('')
  const [confirming, setConfirming] = useState('')
  const [removing, setRemoving] = useState('')
  const [removeError, setRemoveError] = useState('')
  const askRemove = useCallback((id: LlmProviderInfo['id']): void => { setConfirming(id); setRemoveError('') }, [])
  const cancelRemove = useCallback((): void => setConfirming(''), [])
  const removeLibrary = useCallback((provider: LlmProviderInfo): void => {
    setRemoving(provider.id)
    setRemoveError('')
    void removeProviderLibrary(window.geckit.chat, provider).then((error) => {
      if (error === undefined) setConfirming('')
      else setRemoveError(error)
    }).finally(() => setRemoving(''))
  }, [])
  useLayoutEffect(() => {
    if (adding) addForm.current?.scrollIntoView({ block: 'center' })
  }, [adding])
  useLayoutEffect(() => {
    if (settings.providerRemovalPending && removing !== '') restartNotice.current?.focus()
  }, [settings.providerRemovalPending, removing])
  return (
    <section className="provider-libraries" aria-labelledby="provider-libraries-title">
      <div className="provider-library-head">
        <h3 id="provider-libraries-title">Libraries</h3>
        <button type="button" className="provider-library-add-button" onClick={() => setAdding(true)} disabled={adding}><Icon name="plus" size={14} />Add library</button>
      </div>
      <p className="provider-library-intro">Providers from GitHub. Updates load after restart.</p>
      {settings.providerPlugins.length === 0 ? adding ? null : <p className="provider-library-empty">No libraries installed.</p> : <div className="provider-library-list">{settings.providerPlugins.map((one) => <ProviderLibraryRow key={one.id} provider={one} ready={readyLibraries.has(one.id)} confirming={confirming === one.id} removing={removing === one.id} onAsk={askRemove} onCancel={cancelRemove} onRemove={removeLibrary} />)}</div>}
      {settings.providerRemovalPending ? <p ref={restartNotice} className="provider-library-restart" role="status" tabIndex={-1}>Restart GeckIt to unload removed libraries.</p> : null}
      {removeError === '' ? null : <span className="error" role="alert">{removeError}</span>}
      {adding ? <form ref={addForm} className="provider-library-add" onSubmit={(event) => {
          event.preventDefault()
          setInstalling(true)
          setInstallError('')
          void window.geckit.chat.installProvider(repository.trim()).then(() => { setRepository(''); setAdding(false) }).catch((error: Error) => setInstallError(error.message.replace(/^Error invoking remote method '[^']+': Error: /, ''))).finally(() => setInstalling(false))
        }}>
        <input autoFocus id="provider-repository" type="url" required value={repository} placeholder="https://github.com/owner/repository" aria-label="GitHub repository URL" onChange={(event) => setRepository(event.target.value)} />
        <button type="submit" className="primary" disabled={installing || repository.trim() === ''}>{installing ? 'Adding library…' : 'Add'}</button>
        <button type="button" className="quiet" disabled={installing} onClick={() => { setAdding(false); setRepository(''); setInstallError('') }}>Cancel</button>
      </form> : null}
      {installError === '' ? null : <span className="error" role="alert">{installError}</span>}
      {checkMessage === '' ? null : <span role="status">{checkMessage}</span>}
      {adding ? <p className="provider-library-trust">Provider code runs on this computer. Add a repository you trust.</p> : null}
      <div className="provider-library-updates">
        <label className="check"><input type="checkbox" checked={settings.providerAutoUpdate} onChange={(event) => change({ providerAutoUpdate: event.target.checked })} />Update libraries automatically</label>
        {settings.providerPlugins.length === 0 ? null : <button type="button" className="quiet" disabled={checking} onClick={() => {
          setChecking(true)
          setCheckMessage('')
          void window.geckit.chat.checkProviderUpdates().then((result) => setCheckMessage(result.failed.length > 0 ? 'Could not check every library. Try again.' : result.ready.length === 0 ? 'Libraries are up to date.' : '')).catch(() => setCheckMessage('Could not check every library. Try again.')).finally(() => setChecking(false))
        }}>{checking ? 'Checking…' : 'Check now'}</button>}
      </div>
    </section>
  )
}

function General({ settings, change, onWelcome }: Part & { readonly onWelcome: () => void }): React.JSX.Element {
  const rules = settings.openWith
  const setRule = (at: number, rule: OpenRule | undefined): void =>
    change({
      openWith: rule === undefined ? rules.filter((_one, index) => index !== at) : rules.map((one, index) => (index === at ? rule : one)),
    })
  const pickApp = (at: number): void => {
    void window.geckit.settings.pickApp().then((app) => {
      const rule = rules[at]
      if (app !== undefined && rule !== undefined) setRule(at, { ...rule, app })
    })
  }

  return (
    <>
      <div className="field">
        <label htmlFor="theme">Appearance</label>
        <Picker
          label={THEMES.find((one) => one.value === settings.theme)?.label ?? 'System'}
          choices={THEMES.map((one) => ({ value: one.value, label: one.label, ...(one.says === '' ? {} : { says: one.says }) }))}
          chosen={settings.theme}
          onPick={(value) => change({ theme: value as Theme })}
          className="select"
        />
      </div>

      <div className="field">
        <label htmlFor="open-with">Open files from a conversation with</label>
        {rules.map((rule, at) => (
          <div key={at} className="open-rule">
            <input
              type="text"
              value={rule.kinds}
              placeholder="ts tsx json"
              aria-label="Kinds of file"
              onChange={(event) => setRule(at, { ...rule, kinds: event.target.value })}
            />
            <button type="button" className="select" title={rule.app} onClick={() => pickApp(at)}>
              <span>{rule.app === '' ? 'Choose an application...' : appName(rule.app)}</span>
            </button>
            <button type="button" className="icon-button" aria-label="Remove" onClick={() => setRule(at, undefined)}>
              <Icon name="close" size={12} />
            </button>
          </div>
        ))}
        <div>
          <button type="button" className="quiet" onClick={() => change({ openWith: [...rules, { kinds: '', app: '' }] })}>
            Add a rule
          </button>
        </div>
        <span style={NOTE}>
          Extensions, then the application. * is anything no other rule names. A file with no rule opens in the
          application the system picks for it.
        </span>
      </div>

      <div className="field">
        <label>Usage</label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.analytics && settings.analyticsAsked}
            onChange={(event) => change({ analytics: event.target.checked, analyticsAsked: true })}
          />
          Count which features are used
        </label>
        <span style={NOTE}>
          Sends Google Analytics the name of what was used, such as correct or chatSent, the version and a random id for this installation. Never text, paths or keys.
        </span>
      </div>

      <div className="field">
        <label>Errors</label>
        <label className="check">
          <input type="checkbox" checked={settings.sendErrors} onChange={(event) => change({ sendErrors: event.target.checked })} />
          Send error reports
        </label>
        <span style={NOTE}>
          Sends Sentry the error and where in GeckIt it happened, with paths, addresses and links taken out. Never your conversations, files or keys. Off, errors are kept here and GeckIt asks before sending them.
        </span>
      </div>

      <div className="field">
        <label>Conversations working at once</label>
        <Picker
          label={settings.workingAtOnce === 0 ? 'No limit' : String(settings.workingAtOnce)}
          choices={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((count) => ({ value: String(count), label: count === 0 ? 'No limit' : String(count) }))}
          chosen={String(settings.workingAtOnce)}
          onPick={(value) => change({ workingAtOnce: Number(value) })}
          className="select"
        />
        <span style={NOTE}>
          A message sent while this many are working waits in its conversation. When one of them stops, the highest card in In progress with a message waiting goes first. A question asked with Ask never waits.
        </span>
      </div>

      <div className="field">
        <label>Shortcuts in any application</label>
        {ANYWHERE_SAID.map(([key, what]) => (
          <label key={key} className="check">
            <input
              type="checkbox"
              checked={!settings.anywhereOff.includes(key)}
              onChange={(event) =>
                change({
                  anywhereOff: event.target.checked
                    ? settings.anywhereOff.filter((one) => one !== key)
                    : [...settings.anywhereOff, key],
                })
              }
            />
            {what} <span style={NOTE}>{said(ANYWHERE[key])}</span>
          </label>
        ))}
        <span style={NOTE}>
          A shortcut turned off here is left to whatever else uses it, such as another copy of GeckIt running beside this one.
        </span>
      </div>

      <div className="field">
        <label>Welcome</label>
        <div>
          <button type="button" className="quiet" onClick={onWelcome}>
            Show again
          </button>
        </div>
      </div>
    </>
  )
}

function Updates({ settings, change }: Part): React.JSX.Element {
  return (
    <>
      <div className="field">
        <label>Version</label>
        <Version />
      </div>

      <div className="field">
        <label>Channel</label>
        <Picker
          label={channelLabel(settings.updateChannel)}
          choices={UPDATE_CHANNELS.map((one) => ({ value: one.value, label: one.label, says: one.says }))}
          chosen={settings.updateChannel}
          onPick={(value) => change({ updateChannel: value as UpdateChannel })}
          className="select"
        />
        <span style={NOTE}>
          Every build goes to Development first, and the ones that hold up are promoted to Stable, which is also what the
          website downloads. Moving to Stable from a newer development build keeps this one until Stable passes it.
        </span>
      </div>

      <div className="field">
        <label>Updates</label>
        <label className="check">
          <input type="checkbox" checked={settings.autoUpdate} onChange={(event) => change({ autoUpdate: event.target.checked })} />
          Update GeckIt automatically
        </label>
        <span style={NOTE}>
          Checks on launch and every hour, and downloads a new version in the background. It installs when the app restarts.
        </span>
      </div>
    </>
  )
}

const counted = (count: number): string => `${String(count)} ${count === 1 ? 'folder' : 'folders'}`

/**
 * The projects under where they are, Local first and then each host, as the
 * project picker groups them; with no project on a host, one list with no heads.
 */
function byWhere(settings: Settings): readonly { readonly name?: string; readonly roots: readonly string[] }[] {
  if (!settings.projects.some((root) => hostOf(root) !== undefined)) return [{ roots: settings.projects }]
  const local = settings.projects.filter((root) => hostOf(root) === undefined)
  const hosts = settings.hosts.map((host) => ({ name: host.name, roots: settings.projects.filter((root) => hostOf(root) === host.id) }))
  return [{ name: 'Local', roots: local }, ...hosts].filter((group) => group.roots.length > 0)
}

/**
 * The profile in use, and the projects in it.
 *
 * Ticking a profile uses it at once, and it is the one edited under the list:
 * the board behind the dialog shows what the ticks mean while they are being ticked.
 */
function Profiles({ settings, change }: Part): React.JSX.Element {
  const profiles = settings.profiles
  const inUse = profileOf(settings)
  const name = useRef<HTMLInputElement>(null)
  // A profile just made has its name picked out, ready to be typed over, once its field is there.
  const made = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (made.current === undefined || inUse?.id !== made.current) return
    name.current?.focus()
    name.current?.select()
    made.current = undefined
  }, [inUse])

  const edit = (one: ProjectProfile): void => change({ profiles: profiles.map((kept) => (kept.id === one.id ? one : kept)) })
  const make = (): void => {
    const id = crypto.randomUUID()
    change({ profiles: [...profiles, { id, name: 'New profile', projects: [] }], profile: id })
    made.current = id
  }
  const rows = [
    { id: '', name: 'All folders', says: 'Every folder, always' },
    ...profiles.map((one) => ({
      id: one.id,
      name: one.name.trim() === '' ? 'New profile' : one.name,
      says: counted(settings.projects.filter((root) => one.projects.includes(root)).length),
    })),
  ]

  return (
    <>
      <div className="field">
        <label>Profile in use</label>
        <div className="projects-listed" role="radiogroup" aria-label="Profile in use">
          {rows.map((row) => {
            const on = settings.profile === row.id || (row.id === '' && inUse === undefined)
            return (
              <button
                key={row.id}
                type="button"
                role="radio"
                aria-checked={on}
                className="project-listed"
                onClick={() => change({ profile: row.id })}
              >
                <span className="tick">{on ? <Icon name="check" size={13} /> : null}</span>
                <span className="name">{row.name}</span>
                <span className="says">{row.says}</span>
              </button>
            )
          })}
        </div>
        <div>
          <button type="button" className="quiet" onClick={make}>
            New profile
          </button>
        </div>
      </div>

      {inUse === undefined ? null : (
        <>
          <div className="field">
            <label htmlFor="profile-name">Name</label>
            <input
              id="profile-name"
              ref={name}
              type="text"
              value={inUse.name}
              onChange={(event) => edit({ ...inUse, name: event.target.value })}
            />
          </div>
          <div className="field">
            <label>Folders in this profile</label>
            {settings.projects.length === 0 ? (
              <span style={NOTE}>Add a folder first, from the folder picker.</span>
            ) : (
              <div className="projects-listed">
                {byWhere(settings).map((group) => [
                  group.name === undefined ? null : (
                    <div key={`head-${group.name}`} className="projects-listed-head">
                      {group.name}
                    </div>
                  ),
                  ...group.roots.map((root) => {
                  const on = inUse.projects.includes(root)
                  return (
                    <button
                      key={root}
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={projectLabel(root)}
                      className={`project-listed${on ? '' : ' off'}`}
                      onClick={() =>
                        edit({ ...inUse, projects: on ? inUse.projects.filter((one) => one !== root) : [...inUse.projects, root] })
                      }
                    >
                      <span className="tick">{on ? <Icon name="check" size={13} /> : null}</span>
                      <span className="name">{projectName(root)}</span>
                      <span className="says">{homePath(root)}</span>
                    </button>
                  )
                  }),
                ])}
              </div>
            )}
            <span style={NOTE}>
              The board, the folder picker, New task, search and shortcuts show only these folders. Conversations in
              other folders keep running and still tell you when they need you.
            </span>
          </div>
          <div>
            <button
              type="button"
              className="quiet"
              onClick={() => change({ profiles: profiles.filter((one) => one.id !== inUse.id), profile: '' })}
            >
              Delete profile
            </button>
          </div>
        </>
      )}
    </>
  )
}

function Phrases({ settings, change }: Part): React.JSX.Element {
  const phrases = settings.phrases
  const [added, setAdded] = useState(false)
  const setPhrase = (at: number, text: string | undefined): void =>
    change({
      phrases: text === undefined ? phrases.filter((_one, index) => index !== at) : phrases.map((one, index) => (index === at ? text : one)),
    })

  return (
    <div className="field">
      <label>Phrases</label>
      {phrases.map((phrase, at) => (
        <div key={at} className="phrase-rule">
          <input
            type="text"
            value={phrase}
            placeholder="commit to main"
            aria-label="Phrase"
            autoFocus={added && at === phrases.length - 1}
            onChange={(event) => setPhrase(at, event.target.value)}
          />
          <button type="button" className="icon-button" aria-label="Remove" onClick={() => setPhrase(at, undefined)}>
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
      <div>
        <button
          type="button"
          className="quiet"
          onClick={() => {
            setAdded(true)
            change({ phrases: [...phrases, ''] })
          }}
        >
          Add a phrase
        </button>
      </div>
      <span style={NOTE}>
        Each phrase is a button over the message field, and a press adds it to the message. The + next to them saves what is typed as a new one.
      </span>
    </div>
  )
}

function Correct({ settings, change }: Part): React.JSX.Element {
  return (
    <>
      <p>Correct uses an assistant enabled in Settings through your own Claude Code or Codex command and subscription.</p>

      <div className="two">
        <div className="field">
          <label htmlFor="first">Your language</label>
          <Picker
            label={settings.nativeLanguage}
            choices={LANGUAGES.map((one) => ({ value: one, label: one }))}
            chosen={settings.nativeLanguage}
            onPick={(value) => change({ nativeLanguage: value })}
            className="select"
          />
        </div>
        <div className="field">
          <label htmlFor="second">Translate into</label>
          <Picker
            label={settings.secondLanguage}
            choices={LANGUAGES.map((one) => ({ value: one, label: one }))}
            chosen={settings.secondLanguage}
            onPick={(value) => change({ secondLanguage: value })}
            className="select"
          />
        </div>
      </div>
    </>
  )
}

export function PhoneAccess({ on, change }: { readonly on: boolean; readonly change: (on: boolean) => void }): React.JSX.Element {
  const [view, setView] = useState<PhoneView>({ count: 0 })

  useEffect(() => {
    void window.geckit.phone.state().then(setView)
    return window.geckit.phone.onState(setView)
  }, [])

  return (
    <div className="field">
      <label>Phone</label>
      <label className="check">
        <input type="checkbox" checked={on} onChange={(event) => change(event.target.checked)} />
        Open the conversations on your phone
      </label>
      <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
        Scan the code with the GeckIt app on your iPhone. The phone talks to this computer directly, and only with the key in this code.
      </span>
      {on && view.qr !== undefined ? (
        <div className="phone-link">
          <img src={view.qr} alt="QR code for the GeckIt app" width={160} height={160} />
          <span>
            {view.count === 0 ? 'No phone connected' : `${String(view.count)} ${view.count === 1 ? 'phone' : 'phones'} connected`}
            <button type="button" className="quiet" onClick={() => window.geckit.phone.newCode()}>
              New code
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Phones paired with the old code will have to scan again.</span>
          </span>
        </div>
      ) : null}
      {on && view.trouble !== undefined ? <span className="phone-error">{view.trouble}</span> : null}
    </div>
  )
}
