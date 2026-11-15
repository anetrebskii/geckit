import { useCallback, useEffect, useRef, useState } from 'react'
import type { BrowserBridgeState, TestBrowsersState } from '../../../shared/api'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { LiveView, tint } from './LiveView'
import type { LiveViewApi } from './LiveView'
import { Cell, FullSheet, Page, Switch } from './PhoneKit'
import type { Chat } from './useChat'

type Profile = TestBrowsersState['profiles'][number]
type Editing = { readonly name?: Profile['name'] }
const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/
const liveApi: LiveViewApi = {
  start: (name, url, token) => window.geckit.browser.viewStart(name, url, token),
  frame: (name) => window.geckit.browser.viewFrame(name),
  input: (name, input) => window.geckit.browser.viewInput(name, input),
  end: (name) => window.geckit.browser.viewEnd(name),
}
const said = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/** Settings > Web Browser on the phone: the host's Camoufox profiles, made, renamed and deleted from here, and each opened live to sign in by hand. See docs/ux/browser-profile-management.md. */
export function PhoneBrowser({ chat, host, back, onBack }: { readonly chat: Chat; readonly host: string; readonly back: string; readonly onBack: () => void }): React.JSX.Element {
  const [state, setState] = useState<BrowserBridgeState>()
  const [problem, setProblem] = useState('')
  const [editing, setEditing] = useState<Editing>()
  const [more, setMore] = useState<Profile['name']>()
  const [deleting, setDeleting] = useState<Profile['name']>()
  const [live, setLive] = useState<Profile['name']>()
  const enabled = chat.settings.chromeBridge
  const refresh = useCallback(async (): Promise<void> => {
    try { setState(await window.geckit.browser.state()); setProblem('') } catch (error) { setProblem(said(error)) }
  }, [])
  useEffect(() => {
    let live = true
    const look = (): void => { void window.geckit.browser.state().then((next) => { if (live) { setState(next); setProblem('') } }, (error: unknown) => { if (live) setProblem(said(error)) }) }
    look()
    const timer = setInterval(look, 2_000)
    return () => { live = false; clearInterval(timer) }
  }, [])
  const testing = state?.testing
  const profiles = testing?.profiles ?? []
  const download = testing?.download
  const remove = async (name: Profile['name']): Promise<void> => {
    try { await window.geckit.browser.deleteTest(name); tap('light'); await refresh() } catch (error) { setProblem(said(error)) }
  }
  const open = (name: Profile['name']): void => { if (!enabled) return; tap('light'); setLive(name) }

  return (
    <Page title="Web Browser" back={back} onBack={onBack} actions={<button type="button" className="phone-icon" aria-label="New profile" disabled={testing?.supported === false} onClick={() => setEditing({})}><Icon name="plus" size={24} /></button>}>
      <div className="phone-head">Browser profiles</div>
      {state === undefined && problem === '' ? (
        <div className="phone-group" aria-busy="true">
          <span className="browser-profiles-loading" role="status">Loading browser profiles</span>
          {[0, 1, 2].map((one) => <div key={one} className="phone-cell phone-browser-skeleton" aria-hidden="true"><span className="phone-browser-badge browser-bone" /><span className="phone-cell-words"><span className="browser-bone line" /><span className="browser-bone line short" /></span></div>)}
        </div>
      ) : testing?.supported === false ? (
        <div className="phone-note">Browser profiles are not available on {host}.</div>
      ) : profiles.length === 0 && state !== undefined ? (
        <div className="phone-empty">
          No browser profiles yet. A profile keeps the sign-ins for one account, so assistants can work on that site.
          <button type="button" className="phone-empty-action" onClick={() => setEditing({})}>New profile</button>
        </div>
      ) : (
        <div className="phone-group">
          {profiles.map((one) => (
            <div key={one.name} className="phone-cell-pair">
              <Cell
                label={<><span className="phone-browser-badge" style={{ background: tint(one.name) }} aria-hidden="true">{one.name.charAt(0).toUpperCase()}</span><span className="phone-browser-name"><span className="phone-browser-prefix">geckit:</span>{one.name}</span></>}
                says={<><span className={`phone-browser-dot${one.open ? ' on' : ''}`} aria-hidden="true" />{one.open ? 'Open' : 'Closed'}{one.note === undefined || one.note === '' ? '' : ` · ${one.note}`}</>}
                {...(enabled ? { onPress: () => open(one.name) } : {})}
              >{null}</Cell>
              <button type="button" className="phone-icon" aria-label={`More for geckit:${one.name}`} onClick={() => setMore(one.name)}><Icon name="more" size={20} /></button>
            </div>
          ))}
        </div>
      )}
      {problem === '' ? null : <div className="phone-note phone-browser-problem" role="alert">{problem}</div>}
      {download?.error !== undefined ? <div className="phone-note">Camoufox could not be installed on {host}: {download.error.replace(/\.$/, '')}. Open a profile to try again.</div>
        : download !== undefined ? <div className="phone-note">{download.phase === 'installing' ? `Installing Camoufox on ${host}...` : `Downloading Camoufox on ${host}, ${Math.round(download.received / 1e6)} of ${Math.round(download.total / 1e6)} MB.`}</div>
          : profiles.length > 0 ? <div className="phone-note">Tap a profile to see its browser on {host} and sign in yourself. Sign-ins stay on {host}; assistants use them with geckit:&lt;name&gt;.</div> : null}

      <div className="phone-head">Browser access</div>
      <div className="phone-group">
        <Cell label="Chrome through GeckIt" says={`Applies on ${host}`}>
          <Switch on={enabled} label="Chrome through GeckIt" onChange={(on) => chat.change({ chromeBridge: on })} />
        </Cell>
      </div>
      <div className="phone-note">{enabled ? 'Assistants work in your Chrome and these profiles.' : 'Turn on to open a profile. Off, assistants have no browser.'}</div>

      {more === undefined ? null : (
        <Menu
          anchor={new DOMRect()}
          title={`geckit:${more}`}
          choices={[
            { value: 'open', label: 'Open browser', icon: 'display', ...(enabled ? {} : { disabled: true }) },
            { value: 'edit', label: 'Edit', icon: 'pencil' },
            { value: 'delete', label: 'Delete', icon: 'trash', danger: true },
          ]}
          onPick={(value) => { if (value === 'open') open(more); else if (value === 'edit') setEditing({ name: more }); else setDeleting(more) }}
          onClose={() => setMore(undefined)}
        />
      )}
      {deleting === undefined ? null : (
        <Menu
          anchor={new DOMRect()}
          title={`Delete geckit:${deleting}?`}
          choices={[{ value: 'delete', label: 'Delete', says: 'Its sign-ins and history go with it', danger: true }]}
          onPick={() => void remove(deleting)}
          onClose={() => setDeleting(undefined)}
        />
      )}
      {editing === undefined ? null : <ProfileSheet given={profiles.find((one) => one.name === editing.name)} taken={profiles.map((one) => one.name)} host={host} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); void refresh() }} />}
      {live === undefined ? null : <LiveView name={live} api={liveApi} computer={host} title={`geckit:${live}`} onClose={() => { setLive(undefined); void refresh() }} />}
    </Page>
  )
}

function ProfileSheet({ given, taken, host, onClose, onSaved }: { readonly given: Profile | undefined; readonly taken: readonly Profile['name'][]; readonly host: string; readonly onClose: () => void; readonly onSaved: () => void }): React.JSX.Element {
  const [name, setName] = useState(given?.name ?? '')
  const [note, setNote] = useState(given?.note ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => { if (given === undefined) field.current?.focus() }, [given])
  const next = name.trim()
  const duplicate = next !== given?.name && taken.includes(next)
  const changed = given === undefined || next !== given.name || note.trim() !== (given.note ?? '')
  const ready = !saving && NAME.test(next) && !duplicate && changed
  const save = (): void => {
    if (!ready) return
    setSaving(true)
    setError('')
    const done = given === undefined ? window.geckit.browser.account(next, note) : window.geckit.browser.updateTest(given.name, next, note)
    void done.then(() => { tap('light'); onSaved() }, (failed: unknown) => setError(said(failed))).finally(() => setSaving(false))
  }
  return (
    <FullSheet title={given === undefined ? 'New profile' : `geckit:${given.name}`} action={saving ? 'Saving...' : given === undefined ? 'Create' : 'Save'} ready={ready} onAction={save} onClose={onClose}>
      <div className="phone-task-label">Name</div>
      <input ref={field} className="phone-task-goal" value={name} placeholder="github-work" autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={40} disabled={given?.open === true || saving} aria-invalid={duplicate || undefined} onChange={(event) => { setName(event.target.value.toLowerCase()); setError('') }} />
      <div className="phone-note phone-browser-hint">{duplicate ? `A profile named ${next} already exists. Choose another name.` : given?.open === true ? 'Close its browser to rename it.' : 'Lowercase letters, numbers and hyphens. Used as geckit:<name> in conversations.'}</div>
      <div className="phone-task-label">Description</div>
      <input className="phone-task-goal" value={note} placeholder="GitHub as alex@example.com" maxLength={120} disabled={saving} onChange={(event) => { setNote(event.target.value); setError('') }} />
      <div className="phone-note phone-browser-hint">Optional. Assistants read it to pick the right profile for a task. The profile is kept on {host}.</div>
      {error === '' ? null : <p className="recurrence-error" role="alert">{error}</p>}
    </FullSheet>
  )
}
