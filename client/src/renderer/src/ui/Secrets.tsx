import { useCallback, useEffect, useRef, useState } from 'react'
import { SECRET_NAME, placesValid, type SecretKind, type SecretLifetime, type SecretMetadata, type SecretUse } from '../../../shared/secrets'
import { sealFor } from '../../../shared/secret-seal'
import { Icon } from './Icon'
import { Menu } from './Menu'
import type { Choice } from './Menu'

type Status = Awaited<ReturnType<typeof window.geckit.secrets.status>>

const KIND: Readonly<Record<SecretKind, string>> = { website: 'Website', http: 'HTTP API', command: 'Command', ssh: 'SSH key' }
const STORE: Readonly<Record<string, string>> = { keychain: 'the macOS Keychain', dpapi: 'files sealed with Windows DPAPI', 'secret-service': 'the system keyring', 'file-systemd-creds': 'an encrypted file whose key systemd keeps', 'file-keyfile': 'an encrypted file', memory: 'memory only' }
const time = (at: number): string => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const ago = (at: number, now: number): string => {
  const minutes = Math.round((now - at) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)} h ago`
  return new Date(at).toLocaleDateString()
}
const kept = (one: SecretMetadata): string => one.lifetime === 'task' ? 'until this task is done' : one.lifetime === 'once' ? 'after one use' : one.lifetime === 'keep' ? 'kept' : one.expiresAt === undefined ? 'timed' : `expires ${time(one.expiresAt)}`
const places = (one: SecretMetadata): string => one.places.map((place) => one.kind === 'website' ? place.replace(/^https:\/\//, '') : place).join(', ')
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
const KINDS: readonly SecretKind[] = ['http', 'website', 'command', 'ssh']
const WHERE: Readonly<Record<SecretKind, string>> = { website: 'Sites, such as https://github.com', http: 'Hosts, such as api.openai.com or *.stripe.com', command: 'Programs, such as psql', ssh: 'Hosts, such as github.com' }
const EXAMPLE: Readonly<Record<SecretKind, string>> = { website: 'https://github.com', http: 'api.openai.com', command: 'psql', ssh: 'github.com' }
const LIFETIMES: readonly { readonly value: SecretLifetime; readonly label: string }[] = [{ value: 'once', label: 'One use' }, { value: '15m', label: '15 minutes' }, { value: '1h', label: '1 hour' }, { value: '1d', label: '1 day' }, { value: 'keep', label: 'Keep' }]
const placesOf = (kind: SecretKind, text: string): string[] => text.split(',').map((one) => one.trim()).filter((one) => one !== '').map((one) => {
  if (kind === 'http' || kind === 'ssh') return one.replace(/^[a-z]+:\/\//i, '').replace(/^[^@/]*@/, '').replace(/\/.*$/, '').toLowerCase()
  if (kind === 'website') return (/^https?:\/\//i.test(one) ? one : `https://${one}`).replace(/^(https?:\/\/[^/]+).*$/i, '$1').toLowerCase()
  return one
})

function Segments<T extends string>({ label, choices, chosen, disabled, onPick }: { readonly label: string; readonly choices: readonly { readonly value: T; readonly label: string }[]; readonly chosen: T; readonly disabled: boolean; readonly onPick: (value: T) => void }): React.JSX.Element {
  const move = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const at = (choices.findIndex((one) => one.value === chosen) + step + choices.length) % choices.length
    const next = choices[at]
    if (next === undefined) return
    onPick(next.value)
    event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[at]?.focus()
  }
  return <div className="views secret-segments" role="radiogroup" aria-label={label} onKeyDown={move}>
    {choices.map((one) => <button key={one.value} type="button" role="radio" aria-checked={one.value === chosen} tabIndex={one.value === chosen ? 0 : -1} className={one.value === chosen ? 'on' : ''} disabled={disabled} onClick={() => onPick(one.value)}>{one.label}</button>)}
  </div>
}

function SecretForm({ secret, taken, onDone }: { readonly secret?: SecretMetadata; readonly taken: readonly string[]; readonly onDone: (saved: string | undefined) => void }): React.JSX.Element {
  const editing = secret !== undefined
  const [name, setName] = useState(secret?.name ?? '')
  const [kind, setKind] = useState<SecretKind>(secret?.kind ?? 'http')
  const [where, setWhere] = useState(secret?.places.join(', ') ?? '')
  const [note, setNote] = useState(secret?.note ?? '')
  const [user, setUser] = useState(secret?.user ?? '')
  const [value, setValue] = useState('')
  const [shown, setShown] = useState(false)
  const [lifetime, setLifetime] = useState<SecretLifetime>(secret?.lifetime ?? 'keep')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => { first.current?.focus() }, [])
  const id = `secret-${secret?.name ?? 'new'}`
  const word = kind === 'website' ? 'password' : 'value'
  const lifetimes = secret?.lifetime === 'task' ? [{ value: 'task' as const, label: 'This task' }, ...LIFETIMES] : LIFETIMES
  const places = placesOf(kind, where)
  const changed = !editing || value !== '' || places.join(',') !== secret.places.join(',') || note !== (secret.note ?? '') || (kind === 'website' && user.trim() !== (secret.user ?? '')) || lifetime !== secret.lifetime
  const ready = name !== '' && places.length > 0 && (editing || value !== '') && changed
  const save = async (): Promise<void> => {
    if (!ready || busy) return
    const wrong = !editing && taken.includes(name) ? `A secret named ${name} already exists. Edit it instead.` : !SECRET_NAME.test(name) ? 'Name the secret with lowercase letters, digits and hyphens, such as openai-key.' : placesValid(kind, places)
    if (wrong !== undefined) { setProblem(wrong); return }
    const typed = value
    setValue('')
    setShown(false)
    setProblem('')
    setBusy(true)
    try {
      const entry = { name, kind, places, note: note.trim(), user: kind === 'website' ? user.trim() : '', lifetime, editing }
      if (typed === '') await window.geckit.secrets.update(entry)
      else {
        const { requestId, brokerKey } = await window.geckit.secrets.prepare(entry)
        await window.geckit.secrets.save(requestId, await sealFor(brokerKey, typed, 'geckit-secret-v1'), lifetime)
      }
      onDone(name)
    } catch (error) { setProblem(message(error)); setBusy(false) }
  }
  const valueProps = { id: `${id}-value`, value, autoComplete: 'off', autoCapitalize: 'off', autoCorrect: 'off', spellCheck: false, disabled: busy, placeholder: editing ? `Leave empty to keep the current ${word}` : '', 'data-geckit-secret': '', onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => { setValue(event.target.value); setProblem('') } }
  return <form className="browser-profiles-form secret-form" aria-label={editing ? `Edit ${secret.name}` : 'Add secret'} aria-busy={busy} onSubmit={(event) => { event.preventDefault(); void save() }} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) onDone(undefined) } }}>
    <label htmlFor={`${id}-name`}>Name</label>
    {editing ? <span id={`${id}-name`} className="secret-form-fixed secret-form-name">{secret.name}</span>
      : <div className="browser-profiles-field"><input ref={first} id={`${id}-name`} className="secret-form-name" type="text" value={name} placeholder="openai-key" autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={48} disabled={busy} aria-describedby={`${id}-name-hint`} onChange={(event) => { setName(event.target.value.toLowerCase().replace(/[\s_]/g, '-')); setProblem('') }} /><span id={`${id}-name-hint`} className="browser-profiles-hint">Lowercase letters, digits and hyphens. Conversations use the secret by this name.</span></div>}
    <span className="secret-form-label" id={`${id}-kind`}>Used for</span>
    {editing ? <span className="secret-form-fixed" aria-labelledby={`${id}-kind`}>{KIND[kind]}</span>
      : <div className="browser-profiles-field"><Segments label="Used for" choices={KINDS.map((one) => ({ value: one, label: KIND[one] }))} chosen={kind} disabled={busy} onPick={(next) => { setKind(next); setProblem('') }} /></div>}
    <label htmlFor={`${id}-where`}>Where</label>
    <div className="browser-profiles-field"><input ref={editing ? first : undefined} id={`${id}-where`} type="text" value={where} placeholder={EXAMPLE[kind]} autoCapitalize="off" autoCorrect="off" spellCheck={false} disabled={busy} aria-describedby={`${id}-where-hint`} onChange={(event) => { setWhere(event.target.value); setProblem('') }} /><span id={`${id}-where-hint`} className="browser-profiles-hint">{WHERE[kind]}. Separate several with commas.</span></div>
    {kind === 'website' ? <>
      <label htmlFor={`${id}-user`}>Username</label>
      <div className="browser-profiles-field"><input id={`${id}-user`} type="text" value={user} maxLength={200} placeholder="alex@example.com" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} disabled={busy} aria-describedby={`${id}-user-hint`} onChange={(event) => { setUser(event.target.value); setProblem('') }} /><span id={`${id}-user-hint`} className="browser-profiles-hint">Optional. The username or email it signs in as. Not secret: conversations see it and type it themselves.</span></div>
    </> : null}
    <label htmlFor={`${id}-note`}>Note</label>
    <div className="browser-profiles-field"><input id={`${id}-note`} type="text" value={note} maxLength={200} placeholder="Optional" disabled={busy} onChange={(event) => { setNote(event.target.value); setProblem('') }} /></div>
    <label htmlFor={`${id}-value`}>{kind === 'website' ? 'Password' : 'Value'}</label>
    <div className="browser-profiles-field">
      <div className={`secret-value${kind === 'ssh' ? ' multiline' : ''}`}>
        {kind === 'ssh' ? <textarea {...valueProps} rows={4} className={shown ? '' : 'masked'} /> : <input {...valueProps} type={shown ? 'text' : 'password'} />}
        <button type="button" className="icon-button secret-value-eye" aria-label={shown ? `Hide ${word}` : `Show ${word}`} aria-pressed={shown} title={shown ? `Hide ${word}` : `Show ${word}`} disabled={busy} onClick={() => setShown((was) => !was)}><Icon name={shown ? 'hidden' : 'eye'} size={16} /></button>
      </div>
      <span className="browser-profiles-hint">Encrypted before it leaves this window. GeckIt's AI never sees it.</span>
    </div>
    <span className="secret-form-label">Keep it</span>
    <div className="browser-profiles-field"><Segments label="Keep it" choices={lifetimes} chosen={lifetime} disabled={busy} onPick={(next) => { setLifetime(next); setProblem('') }} /></div>
    {problem === '' ? null : <p className="browser-profile-error secret-form-error browser-profiles-form-wide" role="alert">{problem}</p>}
    <div className="browser-profiles-form-actions browser-profiles-form-wide"><button type="button" className="quiet" disabled={busy} onClick={() => onDone(undefined)}>Cancel</button><button type="submit" className="primary" disabled={!ready || busy}>{busy ? 'Saving...' : editing ? 'Save changes' : 'Save'}</button></div>
  </form>
}

function SecretRow({ secret, now, taken, focus, refresh, onRemoved, onFocused }: { readonly secret: SecretMetadata; readonly now: number; readonly taken: readonly string[]; readonly focus: boolean; readonly refresh: () => Promise<void>; readonly onRemoved: () => void; readonly onFocused: () => void }): React.JSX.Element {
  const [more, setMore] = useState<DOMRect>()
  const [editing, setEditing] = useState(false)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [history, setHistory] = useState<readonly SecretUse[]>()
  const moreButton = useRef<HTMLButtonElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const restore = useRef(false)
  useEffect(() => {
    if (asking) cancelButton.current?.focus()
    else if (!editing && restore.current) { moreButton.current?.focus(); restore.current = false }
  }, [asking, editing])
  useEffect(() => { if (focus) { moreButton.current?.focus(); onFocused() } }, [focus, onFocused])
  const choices: readonly Choice[] = [
    { value: 'edit', label: 'Edit', icon: 'pencil' },
    { value: 'history', label: history === undefined ? 'History' : 'Hide history', icon: 'list' },
    { value: 'remove', label: 'Remove', icon: 'trash', danger: true },
  ]
  const pick = (value: string): void => {
    setMore(undefined)
    setProblem('')
    if (value === 'remove') { setAsking(true); return }
    if (value === 'edit') { setEditing(true); return }
    if (history !== undefined) { setHistory(undefined); moreButton.current?.focus(); return }
    window.geckit.secrets.history(secret.name).then(setHistory, (error: unknown) => setProblem(message(error)))
    moreButton.current?.focus()
  }
  const cancel = (): void => { if (busy) return; restore.current = true; setAsking(false) }
  const remove = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try { await window.geckit.secrets.revoke(secret.name); await refresh(); onRemoved() }
    catch (error) { setProblem(message(error)); restore.current = true; setAsking(false) }
    finally { setBusy(false) }
  }
  if (editing) return <li className="browser-profile secret-row asking editing">
    <SecretForm secret={secret} taken={taken} onDone={(saved) => { restore.current = true; setEditing(false); if (saved !== undefined) void refresh() }} />
  </li>
  return <li className={`browser-profile secret-row${asking ? ' asking' : ''}`} onKeyDown={(event) => { if (event.key === 'Escape' && asking) { event.preventDefault(); event.stopPropagation(); cancel() } }}>
    <div className="browser-profile-main">
      <span className="secret-row-icon" aria-hidden="true"><Icon name={secret.kind === 'website' ? 'globe' : secret.kind === 'ssh' ? 'server' : secret.kind === 'command' ? 'terminal' : 'link'} size={16} /></span>
      <div className="browser-profile-lines">
        <div className="browser-profile-title">
          <strong>{secret.name}</strong>
          {secret.kind === 'command' ? <span className="secret-badge">Given to a program</span> : null}
          {secret.cleaned ? null : <span className="secret-badge warn">Not cleaned from output</span>}
        </div>
        <p className="secret-row-line" title={places(secret)}>{KIND[secret.kind]} on {places(secret)}{secret.user === undefined || secret.user === '' ? '' : ` as ${secret.user}`}</p>
        <p className="secret-row-line faint">{kept(secret)}{secret.lastUsedAt === undefined ? ', not used yet' : `, used ${ago(secret.lastUsedAt, now)}`}</p>
      </div>
      {asking ? null : <div className="browser-profile-actions">
        <button ref={moreButton} type="button" className="icon-button" aria-label={`More for ${secret.name}`} aria-haspopup="menu" aria-expanded={more !== undefined} disabled={busy} onClick={(event) => { const box = event.currentTarget.getBoundingClientRect(); setMore((was) => was === undefined ? box : undefined) }}><Icon name="more" size={16} /></button>
      </div>}
    </div>
    {asking ? <div className="browser-profile-confirm">
      <p>Remove {secret.name}? Conversations that use it will be refused until it is entered again.</p>
      <div className="browser-profile-confirm-actions"><button ref={cancelButton} type="button" className="quiet" disabled={busy} onClick={cancel}>Cancel</button><button type="button" className="primary danger" disabled={busy} onClick={() => void remove()}>{busy ? 'Removing...' : 'Remove'}</button></div>
    </div> : null}
    {history === undefined ? null : history.length === 0 ? <p className="secret-history-empty">Not used yet.</p>
      : <table className="secret-history" aria-label={`Uses of ${secret.name}`}>
        <thead><tr><th scope="col">When</th><th scope="col">Task</th><th scope="col">Where</th><th scope="col">Result</th></tr></thead>
        <tbody>{history.map((use, at) => <tr key={`${use.at}-${at}`}><td>{new Date(use.at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td><td>{use.taskId ?? ''}</td><td>{use.place ?? use.kind}</td><td>{use.result}</td></tr>)}</tbody>
      </table>}
    {problem === '' ? null : <p className="secret-error" role="alert">{problem}</p>}
    {more === undefined ? null : <Menu anchor={more} choices={choices} autoFocus onPick={pick} onClose={() => setMore(undefined)} />}
  </li>
}

export function SecretsSection(): React.JSX.Element {
  const [secrets, setSecrets] = useState<readonly SecretMetadata[]>()
  const [status, setStatus] = useState<Status>()
  const [now, setNow] = useState(0)
  const [checking, setChecking] = useState(false)
  const [adding, setAdding] = useState(false)
  const [saved, setSaved] = useState<string>()
  const heading = useRef<HTMLHeadingElement>(null)
  const addButton = useRef<HTMLButtonElement>(null)
  const refresh = useCallback(async (): Promise<void> => {
    const told = await window.geckit.secrets.status()
    setStatus(told)
    if (told.problem !== undefined) return
    try { const listed = await window.geckit.secrets.list(); setNow(Date.now()); setSecrets(listed) } catch (error) { setStatus({ problem: message(error) }) }
  }, [])
  useEffect(() => {
    void Promise.resolve().then(refresh)
    const timer = window.setInterval(() => { void refresh() }, 5_000)
    return () => window.clearInterval(timer)
  }, [refresh])
  const again = (): void => { setChecking(true); void refresh().finally(() => setChecking(false)) }
  const onRemoved = useCallback((): void => heading.current?.focus(), [])
  const onFocused = useCallback((): void => setSaved(undefined), [])
  const working = status !== undefined && status.problem === undefined
  const names = secrets?.map((one) => one.name) ?? []
  const backToAdd = useRef(false)
  useEffect(() => { if (!adding && backToAdd.current) { backToAdd.current = false; addButton.current?.focus() } }, [adding])
  const added = (name: string | undefined): void => {
    if (name === undefined) { backToAdd.current = true; setAdding(false); return }
    setAdding(false)
    void refresh().then(() => setSaved(name))
  }
  return <section className="secrets-section" aria-labelledby="secrets-title">
    <header className="browser-profiles-header">
      <div className="secrets-heading">
        <h4 id="secrets-title" ref={heading} tabIndex={-1}>Secrets</h4>
        <p>Keys and passwords conversations use without seeing them. The value never reaches the conversation.</p>
      </div>
      {working ? <button ref={addButton} type="button" className="quiet browser-profiles-new" disabled={adding} onClick={() => setAdding(true)}><Icon name="plus" size={14} />Add secret</button> : null}
    </header>
    {status?.problem !== undefined ? <div className="browser-profiles-notice secrets-problem" role="status">
      <p>Secrets are unavailable: {status.problem.replace(/\.$/, '')}.</p>
      <button type="button" className="quiet" disabled={checking} onClick={again}>{checking ? 'Checking...' : 'Try again'}</button>
    </div> : status?.locked === true ? <p className="browser-profiles-notice" role="status">The store is locked. Unlock it to use secrets.</p> : null}
    {secrets === undefined || !working ? null : <div className="browser-profiles-group">
      {adding ? <SecretForm taken={names} onDone={added} /> : null}
      {secrets.length === 0 ? (adding ? null : <p className="secrets-empty">No secrets yet. Add one here, or a conversation sends you a link when it needs a key or a password.</p>)
        : <ul className="browser-profiles-list">{secrets.map((one) => <SecretRow key={one.name} secret={one} now={now} taken={names} focus={saved === one.name} refresh={refresh} onRemoved={onRemoved} onFocused={onFocused} />)}</ul>}
    </div>}
    {status?.store === undefined ? null : <p className="secrets-foot">Stored in {STORE[status.store] ?? status.store} on this computer.</p>}
  </section>
}
