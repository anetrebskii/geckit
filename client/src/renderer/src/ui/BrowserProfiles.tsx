import { memo, useCallback, useEffect, useRef, useState } from 'react'
import type { BrowserBridgeState, TestBrowsersState } from '../../../shared/api'
import { LiveView } from '../chat/LiveView'
import type { LiveViewApi } from '../chat/LiveView'
import { Icon } from './Icon'
import { Menu } from './Menu'
import type { Choice } from './Menu'

type Profile = TestBrowsersState['profiles'][number]
interface BrowserProfilesProps {
  readonly testing: BrowserBridgeState['testing'] | undefined
  readonly refresh: () => Promise<void>
  readonly enabled: boolean
}
type ProfileRowProps = Pick<Profile, 'name' | 'note' | 'open'> & Pick<BrowserProfilesProps, 'refresh' | 'enabled'> & {
  readonly signIn: (name: Profile['name'], opener: HTMLButtonElement | null) => void
  readonly focusOpen: boolean
  readonly onFocused: () => void
  readonly onDeleted: () => void
  readonly onRenamed: (name: Profile['name']) => void
}
const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/
const liveApi: LiveViewApi = {
  start: (name, url, token) => window.geckit.browser.viewStart(name, url, token),
  frame: (name) => window.geckit.browser.viewFrame(name),
  input: (name, input) => window.geckit.browser.viewInput(name, input),
  end: (name) => window.geckit.browser.viewEnd(name),
}
const tint = (name: string): string => `var(--project-${[...name].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 8})`

const ProfileRow = memo(function ProfileRow({ name, note, open, refresh, enabled, signIn, focusOpen, onFocused, onDeleted, onRenamed }: ProfileRowProps): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState<'open' | 'delete' | 'save'>()
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(name)
  const [draftNote, setDraftNote] = useState('')
  const nameField = useRef<HTMLInputElement>(null)
  const noteField = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState('')
  const [more, setMore] = useState<DOMRect>()
  const running = useRef(false)
  const identity = useRef<HTMLElement>(null)
  const openButton = useRef<HTMLButtonElement>(null)
  const moreButton = useRef<HTMLButtonElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const restoreMore = useRef(false)
  useEffect(() => {
    if (focusOpen) { if (openButton.current?.disabled) identity.current?.focus(); else openButton.current?.focus(); onFocused() }
  }, [focusOpen, onFocused])
  useEffect(() => {
    if (asking) cancelButton.current?.focus()
    else if (restoreMore.current) { moreButton.current?.focus(); restoreMore.current = false }
  }, [asking])
  useEffect(() => {
    if (editing) (open ? noteField : nameField).current?.focus()
    else if (restoreMore.current) { moreButton.current?.focus(); restoreMore.current = false }
  }, [editing, open])
  const next = draftName.trim()
  const changed = next !== name || draftNote.trim() !== (note ?? '')
  const stopEditing = (): void => { if (running.current) return; setProblem(''); restoreMore.current = true; setEditing(false) }
  const save = async (): Promise<void> => {
    if (running.current || !NAME.test(next) || !changed) return
    running.current = true
    setBusy('save')
    setProblem('')
    try {
      await window.geckit.browser.updateTest(name, next, draftNote)
      await refresh()
      if (next === name) { restoreMore.current = true; setEditing(false) } else onRenamed(next)
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error))
    } finally {
      running.current = false
      setBusy(undefined)
    }
  }
  const cancel = (): void => { if (running.current) return; restoreMore.current = true; setAsking(false) }
  const act = async (action: 'open' | 'delete'): Promise<void> => {
    if (running.current) return
    running.current = true
    setBusy(action)
    setProblem('')
    try {
      if (action === 'open') await window.geckit.browser.openTest(name)
      else await window.geckit.browser.deleteTest(name)
      await refresh()
      setAsking(false)
      if (action === 'delete') onDeleted()
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error))
      if (action === 'delete') { restoreMore.current = true; setAsking(false) }
    } finally {
      running.current = false
      setBusy(undefined)
    }
  }
  const remote = window.geckitRemoteComputer !== undefined
  const choices: readonly Choice[] = [
    { value: 'edit', label: 'Edit', icon: 'pencil' },
    ...(remote ? [] : [{ value: 'sign-in', label: 'Sign in', icon: 'display', ...(enabled ? {} : { disabled: true }) }]),
    { value: 'delete', label: 'Delete', icon: 'trash', danger: true },
  ]
  const pick = (value: string): void => {
    setMore(undefined)
    setProblem('')
    if (value === 'sign-in') signIn(name, moreButton.current)
    else if (value === 'edit') { setDraftName(name); setDraftNote(note ?? ''); setEditing(true) }
    else setAsking(true)
  }
  if (editing) {
    const nameId = `browser-profile-${name}-name`
    const noteId = `browser-profile-${name}-note`
    return <li className="browser-profile asking editing">
      <form className="browser-profiles-form" aria-label={`Edit geckit:${name}`} onSubmit={(event) => { event.preventDefault(); void save() }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stopEditing() } }}>
        <label htmlFor={nameId}>Profile name</label>
        <div className="browser-profiles-field"><input ref={nameField} id={nameId} type="text" value={draftName} autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={40} required disabled={open || busy !== undefined} aria-describedby={`${nameId}-hint`} onChange={(event) => { setDraftName(event.target.value.toLowerCase()); setProblem('') }} /><span id={`${nameId}-hint`} className="browser-profiles-hint">{open ? 'Close its browser to rename it.' : 'Lowercase letters, numbers and hyphens. Conversations and settings that use the old name need the new one.'}</span></div>
        <label htmlFor={noteId}>Description</label>
        <div className="browser-profiles-field"><input ref={noteField} id={noteId} type="text" value={draftNote} maxLength={120} placeholder="GitHub as alex@example.com" disabled={busy !== undefined} aria-describedby={`${noteId}-hint`} onChange={(event) => { setDraftNote(event.target.value); setProblem('') }} /><span id={`${noteId}-hint`} className="browser-profiles-hint">Optional. Assistants read it to pick the right profile for a task.</span></div>
        {problem === '' ? null : <p className="browser-profile-error browser-profiles-form-wide" role="alert">{problem}</p>}
        <div className="browser-profiles-form-actions browser-profiles-form-wide"><button type="button" className="quiet" disabled={busy !== undefined} onClick={stopEditing}>Cancel</button><button type="submit" className="primary" disabled={!NAME.test(next) || !changed || busy !== undefined}>{busy === 'save' ? 'Saving...' : 'Save'}</button></div>
      </form>
    </li>
  }
  return <li className={`browser-profile${asking ? ' asking' : ''}`} onKeyDown={(event) => { if (event.key === 'Escape' && asking) { event.preventDefault(); event.stopPropagation(); cancel() } }}>
    <div className="browser-profile-main">
      <span className="browser-profile-badge" style={{ background: tint(name) }} aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
      <div className="browser-profile-lines">
        <div className="browser-profile-title">
          <strong ref={identity} tabIndex={-1}><span className="browser-profile-prefix">geckit:</span>{name}</strong>
          <span className={`browser-profile-status${open ? ' on' : ''}`}>{open ? 'Open' : 'Closed'}</span>
        </div>
        {note === undefined || note === '' ? null : <p className="browser-profile-note" title={note}>{note}</p>}
      </div>
      {asking ? null : <div className="browser-profile-actions">
        <button ref={openButton} type="button" className="quiet browser-profile-open" disabled={!enabled || busy !== undefined} onClick={() => { if (remote) signIn(name, openButton.current); else void act('open') }}>{busy === 'open' ? 'Opening...' : 'Open browser'}</button>
        <button ref={moreButton} type="button" className="icon-button" aria-label={`More for geckit:${name}`} aria-haspopup="menu" aria-expanded={more !== undefined} disabled={busy !== undefined} onClick={(event) => { const box = event.currentTarget.getBoundingClientRect(); setMore((was) => was === undefined ? box : undefined) }}><Icon name="more" size={16} /></button>
      </div>}
    </div>
    {asking ? <div className="browser-profile-confirm">
      <p>Delete geckit:{name}? Its sign-ins and history go with it.</p>
      <div className="browser-profile-confirm-actions"><button ref={cancelButton} type="button" className="quiet" disabled={busy !== undefined} onClick={cancel}>Cancel</button><button type="button" className="primary danger" disabled={busy !== undefined} onClick={() => void act('delete')}>{busy === 'delete' ? 'Deleting...' : 'Delete'}</button></div>
    </div> : null}
    {problem === '' ? null : <p className="browser-profile-error" role="alert">{problem}</p>}
    {more === undefined ? null : <Menu anchor={more} choices={choices} autoFocus onPick={pick} onClose={() => setMore(undefined)} />}
  </li>
})

export function BrowserProfiles({ testing, refresh, enabled }: BrowserProfilesProps): React.JSX.Element | null {
  const [making, setMaking] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState('')
  const [created, setCreated] = useState<Profile['name']>()
  const [signing, setSigning] = useState<Profile['name']>()
  const nameInput = useRef<HTMLInputElement>(null)
  const newButton = useRef<HTMLButtonElement>(null)
  const running = useRef(false)
  const restoreNew = useRef(false)
  const signInOpener = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (making) nameInput.current?.focus()
    else if (restoreNew.current) { newButton.current?.focus(); restoreNew.current = false }
  }, [making])
  const onFocused = useCallback((): void => setCreated(undefined), [])
  const onDeleted = useCallback((): void => newButton.current?.focus(), [])
  const onRenamed = useCallback((profile: Profile['name']): void => setCreated(profile), [])
  const signIn = useCallback((profile: Profile['name'], opener: HTMLButtonElement | null): void => { signInOpener.current = opener; setSigning(profile) }, [])
  if (testing === undefined || !testing.supported) return null
  const trimmed = name.trim()
  const duplicate = testing.profiles.some((one) => one.name === trimmed)
  const duplicateProblem = duplicate ? `A profile named ${trimmed} already exists. Choose another name.` : ''
  const valid = NAME.test(trimmed) && !duplicate
  const download = testing.download
  const cancel = (): void => { if (running.current) return; setName(''); setNote(''); setProblem(''); restoreNew.current = true; setMaking(false) }
  const create = async (): Promise<void> => {
    if (running.current || !valid) return
    running.current = true
    setCreating(true)
    setProblem('')
    try {
      await window.geckit.browser.account(trimmed, note)
      setCreated(trimmed)
      await refresh()
      setMaking(false)
      setName('')
      setNote('')
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error))
    } finally {
      running.current = false
      setCreating(false)
    }
  }
  const empty = testing.profiles.length === 0
  return <section className="browser-profiles" aria-labelledby="browser-profiles-title">
    <header className="browser-profiles-header">
      <div className="browser-profiles-heading">
        <h4 id="browser-profiles-title">Browser profiles</h4>
        <p>Separate Camoufox profiles for your accounts. Create a profile, open its browser and sign in yourself. Sign-ins stay on this computer.</p>
      </div>
      <button ref={newButton} type="button" className="quiet browser-profiles-new" disabled={making} onClick={() => { setProblem(''); setMaking(true) }}><Icon name="plus" size={14} />New profile</button>
    </header>
    {enabled ? null : <p className="browser-profiles-notice">Turn on Chrome through GeckIt below to open a browser or sign in.</p>}
    {download?.error !== undefined ? <p className="browser-profiles-notice">Camoufox could not be installed: {download.error.replace(/\.$/, '')}. Try Open or Sign in again.</p>
      : download !== undefined ? <div className="browser-profiles-notice"><p>{download.phase === 'installing' ? 'Installing Camoufox without bundled fonts...' : <>Downloading Camoufox, {Math.round(download.received / 1e6)} of {Math.round(download.total / 1e6)} MB.</>}</p><div className="progress"><span style={{ width: `${download.total === 0 ? 0 : Math.round((download.received / download.total) * 100)}%` }} /></div></div>
      : testing.version === undefined ? <p className="browser-profiles-notice">Camoufox downloads on first use, about 150-180 MB. This font-free build uses the fonts installed on this computer.</p> : null}
    {testing.migrated ? <p className="browser-profiles-notice">Previous Chrome profiles need a new sign-in in Camoufox. Their original Chrome data is preserved.</p> : null}
    <div className="browser-profiles-group">
      {making ? <form className="browser-profiles-form" onSubmit={(event) => { event.preventDefault(); void create() }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel() } }}>
        <label htmlFor="browser-profile-name">Profile name</label>
        <div className="browser-profiles-field"><input ref={nameInput} id="browser-profile-name" type="text" value={name} placeholder="github-work" autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={40} required disabled={creating} aria-describedby={`browser-profile-name-hint${duplicate ? ' browser-profile-duplicate' : ''}`} aria-invalid={duplicate || undefined} onChange={(event) => { setName(event.target.value.toLowerCase()); setProblem('') }} /><span id="browser-profile-name-hint" className="browser-profiles-hint">Lowercase letters, numbers and hyphens. Used as geckit:&lt;name&gt; in conversations.</span>{duplicate ? <p id="browser-profile-duplicate" className="browser-profile-error" role="alert">{duplicateProblem}</p> : null}</div>
        <label htmlFor="browser-profile-note">Description</label>
        <div className="browser-profiles-field"><input id="browser-profile-note" type="text" value={note} maxLength={120} placeholder="GitHub as alex@example.com" aria-describedby="browser-profile-note-hint" disabled={creating} onChange={(event) => { setNote(event.target.value); setProblem('') }} /><span id="browser-profile-note-hint" className="browser-profiles-hint">Optional. Assistants read it to pick the right profile for a task.</span></div>
        {problem === '' ? null : <p className="browser-profile-error browser-profiles-form-wide" role="alert">{problem}</p>}
        <div className="browser-profiles-form-actions browser-profiles-form-wide"><button type="button" className="quiet" disabled={creating} onClick={cancel}>Cancel</button><button type="submit" className="primary" disabled={!valid || creating}>{creating ? 'Creating...' : 'Create profile'}</button></div>
      </form> : null}
      {empty ? (making ? null : <p className="browser-profiles-empty">No browser profiles yet. Create one, then open it to sign in.</p>)
        : <ul className="browser-profiles-list">{testing.profiles.map((one) => <ProfileRow key={one.name} {...one} refresh={refresh} enabled={enabled} signIn={signIn} focusOpen={created === one.name} onFocused={onFocused} onDeleted={onDeleted} onRenamed={onRenamed} />)}</ul>}
    </div>
    {signing === undefined ? null : <LiveView name={signing} api={liveApi} {...(window.geckitRemoteComputer === undefined ? {} : { computer: window.geckitRemoteComputer.server.name, title: `geckit:${signing}` })} onClose={() => { setSigning(undefined); signInOpener.current?.focus() }} />}
  </section>
}
