import { useState } from 'react'
import type { Settings } from '../../../shared/api'
import type { ManagerView } from '../../../shared/manager'
import { Icon } from '../ui/Icon'
import { Cell, Page } from '../chat/PhoneKit'
import { ManagerSettings } from '../chat/Manager'
import { openManagerChat } from '../chat/manager-chat-open'
import { managerStand } from '../chat/manager-label'
import { useManager } from '../chat/useManager'
import { EMPLOYEE_AVATARS } from './avatars'
import { EmployeeAvatar } from './Employees'

type Change = (change: Partial<Settings>) => void

export const MANAGER_ROLE = 'Coordinates work in GeckIt, Telegram and shortcuts'
const DOES = 'Send a request here, in Telegram or through a Manager shortcut. It starts conversations, follows them and brings back the results. Employees do the work.'

export const managerFace = (settings: Pick<Settings, 'managerAvatar'>): { readonly name: string; readonly avatar: string } => ({ name: 'Manager', avatar: settings.managerAvatar })

const INSTRUCTIONS_NOTE = 'Your rules for Manager, such as which model to use and when. Kept in GECKIT.md.'

function ManagerInstructions({ view }: { readonly view: ManagerView | undefined }): React.JSX.Element {
  const saved = view?.config.instructions ?? ''
  const [draft, setDraft] = useState<string>()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const save = (): void => {
    if (draft === undefined) return
    setSaving(true)
    setError('')
    window.geckit.manager.configure({ instructions: draft.trim() }).then(() => setDraft(undefined), (failed: unknown) => setError(failed instanceof Error ? failed.message : String(failed))).finally(() => setSaving(false))
  }
  return <section className="team-section" aria-label="Instructions">
    <div className="employee-section-head"><span><h3>Instructions</h3><p className="employee-note">{INSTRUCTIONS_NOTE}</p></span>{draft !== undefined || view === undefined ? null : <button type="button" className="quiet" onClick={() => setDraft(saved)}>Edit</button>}</div>
    {draft === undefined ? <p className="employee-description">{saved.trim() || 'No instructions'}</p> : <form className="employee-form team-about" onSubmit={(event) => { event.preventDefault(); save() }}>
      <textarea rows={7} value={draft} disabled={saving} autoFocus aria-label="Manager instructions" placeholder="For example: use Opus for code changes, Sonnet for writing and research, Haiku for quick checks." onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape' && draft === saved) { event.stopPropagation(); setDraft(undefined) } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save() } }} />
      {error === '' ? null : <p className="employee-alert" role="alert">{error}</p>}
      <footer><span className="spacer" /><button type="button" className="quiet" disabled={saving} onClick={() => { setDraft(undefined); setError('') }}>Cancel</button><button type="submit" className="primary" disabled={saving || draft.trim() === saved.trim()}>{saving ? 'Saving...' : error === '' ? 'Save' : 'Retry'}</button></footer>
    </form>}
  </section>
}

function Portraits({ settings, change, onPicked }: { readonly settings: Settings; readonly change: Change; readonly onPicked?: () => void }): React.JSX.Element {
  return <>{EMPLOYEE_AVATARS.map((one, index) => <button key={one.id} type="button" className={settings.managerAvatar === one.id ? 'on' : ''} aria-label={`Portrait ${index + 1}`} aria-pressed={settings.managerAvatar === one.id} onClick={() => { change({ managerAvatar: one.id }); onPicked?.() }}><EmployeeAvatar employee={{ name: 'Manager', avatar: one.id }} size="medium" /></button>)}</>
}

export function ManagerPage({ settings, change, view, onChat, children }: { readonly settings: Settings; readonly change: Change; readonly view: ManagerView | undefined; readonly onChat: () => void; readonly children?: React.ReactNode }): React.JSX.Element {
  const [avatars, setAvatars] = useState(false)
  const stand = managerStand(view)
  return <>
    <header className="employee-profile">
      <button type="button" className={`employee-portrait${avatars ? ' on' : ''}`} aria-label="Change avatar" title="Change avatar" aria-expanded={avatars} onClick={() => setAvatars(!avatars)}>
        <EmployeeAvatar employee={managerFace(settings)} size="hero" /><span className="employee-portrait-edit"><Icon name="pencil" size={10} /></span>
      </button>
      <span className="employee-hero-words">
        <h2>Manager</h2>
        <span className="employee-hero-role">{MANAGER_ROLE}<span className="employee-pill">{stand.short}</span></span>
      </span>
    </header>
    {!avatars ? null : <div className="employee-avatar-options" role="group" aria-label="Choose avatar"><Portraits settings={settings} change={change} onPicked={() => setAvatars(false)} /></div>}
    {view?.config.enabled !== true && view?.session === undefined ? null : <div className="manager-actions"><button type="button" className="primary" onClick={onChat}><Icon name="chat" size={12} />Open chat</button></div>}
    <section className="team-section" aria-label="What it does">
      <div className="employee-section-head"><span><h3>What it does</h3></span></div>
      <p className="employee-description">{DOES}</p>
    </section>
    <ManagerInstructions view={view} />
    {children}
    <section className="team-section" aria-label="Setup">
      <div className="employee-section-head"><span><h3>Setup</h3><p className="employee-note">Manager is always part of the team. Turn it on to give work in the app, Telegram or Manager shortcuts.</p></span></div>
      <ManagerSettings settings={settings} embedded />
    </section>
  </>
}

export const usePhoneManager = useManager

export function PhoneManager({ settings, change, view, onBack, children }: { readonly settings: Settings; readonly change: Change; readonly view: ManagerView | undefined; readonly onBack: () => void; readonly children?: React.ReactNode }): React.JSX.Element {
  const stand = managerStand(view)
  return <Page title="Manager" back="Team" onBack={onBack}>
    <header className="phone-team-hero">
      <EmployeeAvatar employee={managerFace(settings)} size="hero" />
      <span className="phone-team-hero-words"><span className="employee-hero-role">{MANAGER_ROLE}</span><span className="employee-hero-role"><span className="employee-pill">{stand.short}</span></span></span>
    </header>
    {view?.config.enabled !== true && view?.session === undefined ? null : <div className="phone-group"><Cell label="Open chat" icon="chat" accent onPress={openManagerChat} /></div>}
    <div className="phone-head">What it does</div>
    <div className="phone-team-block"><p className="employee-description">{DOES}</p></div>
    <div className="phone-head">Instructions</div>
    <div className="phone-team-block"><p className="employee-description">{view?.config.instructions.trim() || 'No instructions'}</p></div>
    {children}
    <div className="phone-head">Avatar</div>
    <div className="phone-team-block"><div className="phone-team-portraits" role="group" aria-label="Choose avatar"><Portraits settings={settings} change={change} /></div></div>
    <div className="phone-note">{view?.config.enabled !== true && view?.session === undefined ? 'Set up Manager on your computer, then chat here.' : 'Set up and change Manager on your computer.'}</div>
  </Page>
}
