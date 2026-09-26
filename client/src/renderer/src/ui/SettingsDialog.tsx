import { useEffect, useRef, useState } from 'react'

import { UPDATE_CHANNELS, appName, channelLabel, profileOf } from '../../../shared/api'
import type { AIProvider, OpenRule, PhoneView, ProjectProfile, Settings, Theme, UpdateChannel } from '../../../shared/api'
import { homePath, projectName } from '../chat/project'
import { Icon } from './Icon'
import { Picker } from './Menu'
import { MOD } from './Shortcuts'
import { Version } from './UpdateNotice'

/**
 * Settings, a section at a time: General, Profiles, Phrases, Correct and dictation, Phone, Version.
 *
 * Chat needs no key: it runs on the Claude plan through the person's own
 * `claude`, which is signed in from a terminal and never from here.
 */

const PROVIDERS: readonly { value: AIProvider; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openrouter', label: 'OpenRouter' },
]

const THEMES: readonly { value: Theme; label: string; says: string }[] = [
  { value: 'system', label: 'System', says: 'as the machine is set' },
  { value: 'light', label: 'Light', says: '' },
  { value: 'dark', label: 'Dark', says: '' },
]

const LANGUAGES = [
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

type Section = 'general' | 'profiles' | 'phrases' | 'correct' | 'phone' | 'version'

const SECTIONS: readonly { readonly value: Section; readonly label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'profiles', label: 'Profiles' },
  { value: 'phrases', label: 'Phrases' },
  { value: 'correct', label: 'Correct and dictation' },
  { value: 'phone', label: 'Phone' },
  { value: 'version', label: 'Version' },
]

const NOTE = { fontSize: 12, color: 'var(--text-faint)' } as const

export function SettingsDialog({
  settings,
  change,
  onClose,
  onShortcuts,
}: {
  readonly settings: Settings
  readonly change: (change: Partial<Settings>) => void
  readonly onClose: () => void
  readonly onShortcuts: () => void
}): React.JSX.Element {
  const [section, setSection] = useState<Section>('general')
  const onPhone = document.documentElement.classList.contains('phone')

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
          <nav className="settings-nav" aria-label="Sections">
            {SECTIONS.filter((one) => !onPhone || one.value !== 'phone').map((one) => (
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
          <div className="settings-page">
            {section === 'general' ? <General settings={settings} change={change} /> : null}
            {section === 'profiles' ? <Profiles settings={settings} change={change} /> : null}
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

function General({ settings, change }: Part): React.JSX.Element {
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
          <input type="checkbox" checked={settings.analytics} onChange={(event) => change({ analytics: event.target.checked })} />
          Count which features are used
        </label>
        <span style={NOTE}>
          Sends Google Analytics the name of what was used, such as correct or chatSent, the version and a random id for
          this installation. Never text, paths or keys.
        </span>
      </div>

      <div className="field">
        <label>Claude Code</label>
        <label className="check">
          <input type="checkbox" checked={settings.guideClaude} onChange={(event) => change({ guideClaude: event.target.checked })} />
          Tell Claude Code how GeckIt works
        </label>
        <span style={NOTE}>
          Writes GECKIT.md in ~/.claude and one line in ~/.claude/CLAUDE.md that reads it, so a session knows about the
          board, goals and the links on a card. Turning this off takes both away again.
        </span>
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

const counted = (count: number): string => `${String(count)} ${count === 1 ? 'project' : 'projects'}`

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
    { id: '', name: 'All projects', says: 'Every project, always' },
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
            <label>Projects in this profile</label>
            {settings.projects.length === 0 ? (
              <span style={NOTE}>Add a project first, from the project picker.</span>
            ) : (
              <div className="projects-listed">
                {settings.projects.map((root) => {
                  const on = inUse.projects.includes(root)
                  return (
                    <button
                      key={root}
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={projectName(root)}
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
                })}
              </div>
            )}
            <span style={NOTE}>
              The board, the project picker, New task, search and shortcuts show only these projects. Conversations in
              other projects keep running and still tell you when they need you.
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
  const [shown, setShown] = useState(false)
  const secret = shown ? 'text' : 'password'
  return (
    <>
      <p>Chat runs on your Claude plan through your own claude command, so it needs no key here.</p>

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

      <div className="field">
        <label htmlFor="provider">Which vendor Correct uses when it runs on a key</label>
        <Picker
          label={PROVIDERS.find((one) => one.value === settings.provider)?.label ?? 'OpenAI'}
          choices={PROVIDERS.map((one) => ({ value: one.value, label: one.label }))}
          chosen={settings.provider}
          onPick={(value) => change({ provider: value as AIProvider })}
          className="select"
        />
      </div>

      <div className="field">
        <label htmlFor="openrouter">OpenRouter key</label>
        <input
          id="openrouter"
          type={secret}
          value={settings.openRouterKey}
          placeholder="sk-or-..."
          onChange={(event) => change({ openRouterKey: event.target.value })}
        />
        <span style={NOTE}>Transcription needs this one.</span>
      </div>

      <div className="field">
        <label htmlFor="openai">OpenAI key</label>
        <input
          id="openai"
          type={secret}
          value={settings.openAiKey}
          placeholder="sk-..."
          onChange={(event) => change({ openAiKey: event.target.value })}
        />
      </div>

      <div className="field">
        <label htmlFor="anthropic">Anthropic key</label>
        <input
          id="anthropic"
          type={secret}
          value={settings.anthropicKey}
          placeholder="sk-ant-..."
          onChange={(event) => change({ anthropicKey: event.target.value })}
        />
      </div>

      <div>
        <button type="button" className="quiet" onClick={() => setShown(!shown)}>
          {shown ? 'Hide keys' : 'Show keys'}
        </button>
      </div>
    </>
  )
}

function PhoneAccess({ on, change }: { readonly on: boolean; readonly change: (on: boolean) => void }): React.JSX.Element {
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
        Scan the code with the GeckIt app on your iPhone. The phone talks to this Mac directly, and only with the key in this code.
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
