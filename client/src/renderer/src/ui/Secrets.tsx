import { useCallback, useEffect, useRef, useState } from 'react'
import type { SecretKind, SecretMetadata, SecretUse } from '../../../shared/secrets'
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
const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

function SecretRow({ secret, now, refresh, onRemoved }: { readonly secret: SecretMetadata; readonly now: number; readonly refresh: () => Promise<void>; readonly onRemoved: () => void }): React.JSX.Element {
  const [more, setMore] = useState<DOMRect>()
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState('')
  const [history, setHistory] = useState<readonly SecretUse[]>()
  const moreButton = useRef<HTMLButtonElement>(null)
  const cancelButton = useRef<HTMLButtonElement>(null)
  const restore = useRef(false)
  useEffect(() => {
    if (asking) cancelButton.current?.focus()
    else if (restore.current) { moreButton.current?.focus(); restore.current = false }
  }, [asking])
  const choices: readonly Choice[] = [
    { value: 'history', label: history === undefined ? 'History' : 'Hide history', icon: 'list' },
    { value: 'remove', label: 'Remove', icon: 'trash', danger: true },
  ]
  const pick = (value: string): void => {
    setMore(undefined)
    setProblem('')
    if (value === 'remove') { setAsking(true); return }
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
  return <li className={`browser-profile secret-row${asking ? ' asking' : ''}`} onKeyDown={(event) => { if (event.key === 'Escape' && asking) { event.preventDefault(); event.stopPropagation(); cancel() } }}>
    <div className="browser-profile-main">
      <span className="secret-row-icon" aria-hidden="true"><Icon name={secret.kind === 'website' ? 'globe' : secret.kind === 'ssh' ? 'server' : secret.kind === 'command' ? 'terminal' : 'link'} size={16} /></span>
      <div className="browser-profile-lines">
        <div className="browser-profile-title">
          <strong>{secret.name}</strong>
          {secret.kind === 'command' ? <span className="secret-badge">Given to a program</span> : null}
          {secret.cleaned ? null : <span className="secret-badge warn">Not cleaned from output</span>}
        </div>
        <p className="secret-row-line" title={places(secret)}>{KIND[secret.kind]} on {places(secret)}</p>
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
  const heading = useRef<HTMLHeadingElement>(null)
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
  return <section className="secrets-section" aria-labelledby="secrets-title">
    <div className="secrets-heading">
      <h4 id="secrets-title" ref={heading} tabIndex={-1}>Secrets</h4>
      <p>Keys and passwords conversations use without seeing them. A conversation asks for one with a link you open; the value never reaches the conversation.</p>
    </div>
    {status?.problem !== undefined ? <div className="browser-profiles-notice secrets-problem" role="status">
      <p>Secrets are unavailable: {status.problem.replace(/\.$/, '')}.</p>
      <button type="button" className="quiet" disabled={checking} onClick={again}>{checking ? 'Checking...' : 'Try again'}</button>
    </div> : status?.locked === true ? <p className="browser-profiles-notice" role="status">The store is locked. Unlock it to use secrets.</p> : null}
    {secrets === undefined ? null : <div className="browser-profiles-group">
      {secrets.length === 0 ? <p className="secrets-empty">No secrets yet. When a conversation needs a key or a password, it sends you a link to enter it.</p>
        : <ul className="browser-profiles-list">{secrets.map((one) => <SecretRow key={one.name} secret={one} now={now} refresh={refresh} onRemoved={onRemoved} />)}</ul>}
    </div>}
    {status?.store === undefined ? null : <p className="secrets-foot">Stored in {STORE[status.store] ?? status.store} on this computer.</p>}
  </section>
}
