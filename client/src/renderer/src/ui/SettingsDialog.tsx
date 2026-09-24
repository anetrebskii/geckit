import { useEffect, useState } from 'react'

import { appName } from '../../../shared/api'
import type { AIProvider, OpenRule, PhoneView, Settings, Theme } from '../../../shared/api'
import { Icon } from './Icon'
import { Picker } from './Menu'
import { MOD } from './Shortcuts'
import { Version } from './UpdateNotice'

/**
 * The keys and the two languages.
 *
 * Chat needs none of this: it runs on the Claude plan through the person's own
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
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const secret = shown ? 'text' : 'password'

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
    <div className="dialog-scrim" onMouseDown={onClose}>
      <div className="dialog" onMouseDown={(event) => event.stopPropagation()}>
        <h2>Settings</h2>
        <p>Chat runs on your Claude plan through your own claude command, so it needs no key here.</p>

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
            <button
              type="button"
              className="quiet"
              onClick={() => change({ openWith: [...rules, { kinds: '', app: '' }] })}
            >
              Add a rule
            </button>
          </div>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            Extensions, then the application. * is anything no other rule names. A file with no rule opens in the
            application the system picks for it.
          </span>
        </div>

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
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Transcription needs this one.</span>
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

        <div className="field">
          <label>Updates</label>
          <Version />
          <label className="check">
            <input
              type="checkbox"
              checked={settings.autoUpdate}
              onChange={(event) => change({ autoUpdate: event.target.checked })}
            />
            Update GeckIt automatically
          </label>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            Checks on launch and every hour, and downloads a new version in the background. It installs when the app restarts.
          </span>
        </div>

        <div className="field">
          <label>Claude Code</label>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.guideClaude}
              onChange={(event) => change({ guideClaude: event.target.checked })}
            />
            Tell Claude Code how GeckIt works
          </label>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            Writes GECKIT.md in ~/.claude and one line in ~/.claude/CLAUDE.md that reads it, so a session knows about the
            board, goals and the links on a card. Turning this off takes both away again.
          </span>
        </div>

        {document.documentElement.classList.contains('phone') ? null : (
          <PhoneAccess on={settings.phone} change={(phone) => change({ phone })} />
        )}

        <div className="dialog-actions">
          <button type="button" className="quiet" onClick={onShortcuts}>
            Keyboard shortcuts ({MOD}+/)
          </button>
          <span className="spacer" />
          <span className="together">
            <button type="button" className="quiet" onClick={() => setShown(!shown)}>
              {shown ? 'Hide keys' : 'Show keys'}
            </button>
            <button type="button" className="primary" onClick={onClose}>
              Done
            </button>
          </span>
        </div>
      </div>
    </div>
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
