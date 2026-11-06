import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readInvitation } from '../../../shared/remote/protocol'
import type { RemoteHistory, RemoteSession, RemoteSnapshot, RemoteTrust } from '../../../shared/remote/protocol'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { connectRemote } from './client'
import type { RemoteView } from './client'
import { forgetServer, savedServers } from './storage'
interface ServersProps { readonly onClose: () => void; readonly scan?: () => Promise<string | undefined>; readonly invitation?: string }
interface SessionRowProps { readonly session: RemoteSession; readonly selected: boolean; readonly open: (id: string) => void }
const COMMAND = 'geckit pair create --qr'
const FAILED = ['error', 'expired', 'reused', 'revoked', 'incompatible']
const scope = (trust: RemoteTrust): string => `${trust.projects.length === 1 ? '1 project' : `${String(trust.projects.length)} projects`}${trust.manager ? ' · Manager' : ''}`
const SessionRow = memo(function SessionRow({ session, selected, open }: SessionRowProps) {
  return <button type="button" className={`remote-session${selected ? ' on' : ''}`} onClick={() => open(session.id)}><strong>{session.title}</strong><span>{session.status ?? session.state} · {session.provider ?? 'claude'}</span><p>{session.stands}</p></button>
}, (before, after) => before.selected === after.selected && before.open === after.open && before.session.id === after.session.id && before.session.title === after.session.title && before.session.status === after.session.status && before.session.state === after.session.state && before.session.provider === after.session.provider && before.session.stands === after.session.stands)
export function Servers({ onClose, scan, invitation = '' }: ServersProps): React.JSX.Element {
  const [code, setCode] = useState(invitation)
  const [name, setName] = useState('GeckIt client')
  const [saved, setSaved] = useState<readonly RemoteTrust[]>()
  const [view, setView] = useState<RemoteView>({ state: 'disconnected', message: '' })
  const [snapshot, setSnapshot] = useState<RemoteSnapshot>()
  const [history, setHistory] = useState<RemoteHistory>()
  const [project, setProject] = useState('')
  const [manager, setManager] = useState(false)
  const [selected, setSelected] = useState('')
  const [target, setTarget] = useState('')
  const [adding, setAdding] = useState(invitation !== '')
  const [copied, setCopied] = useState(false)
  const [switching, setSwitching] = useState<DOMRect>()
  const connection = useRef<ReturnType<typeof connectRemote> | undefined>(undefined)
  const attempt = useRef(0)
  const input = useRef<HTMLInputElement>(null)
  const historyEpoch = useRef('')
  const earlier = useRef(false)
  const closeConnection = useCallback((): void => { attempt.current++; connection.current?.close() }, [])
  const refreshSaved = (): void => { void savedServers().then(setSaved).catch(() => { setSaved([]); setView({ state: 'error', message: 'Device storage is unavailable. Allow app storage, then try again.' }) }) }
  useEffect(() => {
    refreshSaved()
    return closeConnection
  }, [closeConnection])
  const showForm = adding || saved?.length === 0
  useEffect(() => { if (showForm && snapshot === undefined) input.current?.focus() }, [showForm, snapshot])
  const disconnect = (): void => { attempt.current++; connection.current?.close(); connection.current = undefined; setSnapshot(undefined); setHistory(undefined); setView({ state: 'disconnected', message: '' }) }
  const connect = (trust?: RemoteTrust, value = code): void => {
    const pairing = trust ?? readInvitation(value)
    setTarget(trust?.server.id ?? '')
    if (pairing === undefined) { setView({ state: 'error', message: 'This is not a connection code. Copy the whole code the server printed.' }); return }
    disconnect(); const mine = ++attempt.current
    setSelected(''); setProject(''); setManager(false)
    connection.current = connectRemote(pairing, name, (next) => {
      if (mine !== attempt.current) return
      setView(next)
      if (next.state !== 'connected') { setSnapshot(undefined); setHistory(undefined) }
      if (next.snapshot !== undefined) {
        if (historyEpoch.current !== next.snapshot.epoch) { historyEpoch.current = next.snapshot.epoch; setHistory(undefined) }
        setSnapshot(next.snapshot); setAdding(false); setCode(''); refreshSaved()
      }
      if (next.history !== undefined) {
        const page = next.history
        const append = earlier.current
        setHistory((previous) => append && previous?.session === page.session ? { ...page, items: [...page.items, ...previous.items] } : page)
        earlier.current = false
      }
    }, trust)
  }
  const open = useCallback((id: string): void => { earlier.current = false; setSelected(id); setHistory(undefined); connection.current?.history(id) }, [])
  const leave = (): void => { disconnect(); onClose() }
  const copy = (): void => { void navigator.clipboard.writeText(COMMAND).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }
  const busy = ['connecting', 'pending', 'reconnecting'].includes(view.state)
  const failed = FAILED.includes(view.state)
  const sessions = useMemo(() => snapshot?.sessions.filter((one) => project === '' || one.project === project) ?? [], [snapshot?.sessions, project])
  const feedback = (here: boolean): React.JSX.Element | null => here && (failed || view.state === 'reconnecting') ? <p className={`remote-feedback${failed ? ' failed' : ''}`} role="status">{view.message}</p> : null
  const phrase = view.state === 'pending' ? view.message.split('\n').slice(1).join(' ') : ''
  return <main className="remote-clients" onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') leave() }}>
    <header className="board-head drag">
      <button type="button" className="icon-button no-drag" aria-label="Back to Local" title="Back to Local" onClick={leave}><Icon name="left" /></button>
      {snapshot === undefined ? <strong className="remote-title">Servers</strong> : <button type="button" className={`remote-switch no-drag${switching === undefined ? '' : ' on'}`} aria-haspopup="menu" aria-expanded={switching !== undefined} title="Switch server" onClick={(event) => setSwitching(event.currentTarget.getBoundingClientRect())}><Icon name="server" /><span>{snapshot.server.name}</span><Icon name="down" size={12} /></button>}
      <span className="spacer" />
      {snapshot === undefined ? null : <span className={`remote-state ${view.state}`} role="status"><span className="remote-state-dot" aria-hidden="true" />{view.state === 'connected' ? 'Read only' : view.message}</span>}
    </header>
    {switching === undefined || snapshot === undefined ? null : <Menu
      anchor={switching}
      autoFocus
      chosen={snapshot.server.id}
      explained
      choices={[...(saved ?? []).map((one) => ({ value: one.server.id, label: one.server.name, says: scope(one), icon: 'server' })), { value: ':add', label: 'Add server…', icon: 'plus' }, { value: ':disconnect', label: 'Disconnect', icon: 'close' }]}
      onPick={(value) => {
        if (value === ':add') { disconnect(); setAdding(true); return }
        if (value === ':disconnect') { disconnect(); return }
        const trust = saved?.find((one) => one.server.id === value)
        if (trust !== undefined && value !== snapshot.server.id) connect(trust)
      }}
      onClose={() => setSwitching(undefined)}
    />}
    {snapshot === undefined ? <div className="remote-body"><div className="remote-setup">
      {saved === undefined || saved.length === 0 ? null : <section aria-labelledby="remote-saved-title">
        <h2 id="remote-saved-title">Your servers</h2>
        <ul className="remote-saved">{saved.map((one) => {
          const going = busy && target === one.server.id
          return <li key={one.server.id}>
            <button type="button" className="remote-server" disabled={busy} onClick={() => connect(one)}>
              <Icon name="server" />
              <span><strong>{one.server.name}</strong><small>{scope(one)}</small></span>
              {going ? <span className="spinner-turn" aria-label="Connecting"><Icon name="spinner" /></span> : <Icon name="right" size={12} />}
            </button>
            <button type="button" className="icon-button" disabled={busy} aria-label={`Forget ${one.server.name}`} title="Forget on this device. The server keeps its grant until geckit devices revoke." onClick={() => { void forgetServer(one.server.id).then(refreshSaved) }}><Icon name="trash" /></button>
          </li>
        })}</ul>
        {feedback(target !== '')}
        {showForm ? null : <button type="button" className="remote-add-open" onClick={() => { setView({ state: 'disconnected', message: '' }); setAdding(true) }}><Icon name="plus" />Add server</button>}
      </section>}
      {showForm ? <section className="remote-add" aria-labelledby="remote-add-title">
        <div className="remote-add-head"><h2 id="remote-add-title">{saved !== undefined && saved.length > 0 ? 'Add server' : 'Connect to a server'}</h2>{saved !== undefined && saved.length > 0 && !busy ? <button type="button" className="icon-button" aria-label="Cancel" title="Cancel" onClick={() => { setAdding(false); setView({ state: 'disconnected', message: '' }) }}><Icon name="close" /></button> : null}</div>
        {view.state === 'pending' ? <div className="remote-pending" role="status">
          <p>Approve this device on the server. Run <code>geckit pair pending</code> there and approve the request with this phrase:</p>
          <p className="remote-phrase">{phrase}</p>
          <button type="button" className="remote-button" onClick={disconnect}>Cancel</button>
        </div> : <ol className="remote-steps">
          <li><span>On the server, run</span><div className="remote-command"><code>{COMMAND}</code><button type="button" className="icon-button" aria-label="Copy command" title={copied ? 'Copied' : 'Copy'} onClick={copy}><Icon name={copied ? 'check' : 'copy'} /></button></div></li>
          <li><span>{scan === undefined ? 'Paste the code it prints' : 'Paste the code it prints or scan its QR'}</span>
            <form className="remote-code" onSubmit={(event) => { event.preventDefault(); if (!busy && code.trim() !== '') connect() }}>
              <input ref={input} aria-label="Connection code" placeholder="Connection code" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={busy} />
              {scan === undefined ? null : <button className="remote-button" type="button" aria-label="Scan QR" title="Scan QR" disabled={busy} onClick={() => { void scan().then((text) => { if (text !== undefined) { setCode(text); connect(undefined, text) } }).catch(() => undefined) }}><Icon name="photo" /></button>}
              <button className="remote-button primary" disabled={busy || code.trim() === ''} type="submit">{busy && target === '' ? 'Connecting…' : 'Connect'}</button>
            </form>
            {feedback(target === '')}
          </li>
          <li><span>Approve the device on the server. It asks as</span><input className="remote-name" aria-label="Device name" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} disabled={busy} /></li>
        </ol>}
        <p className="remote-note">Read only: you see the server's conversations, nothing here starts or changes work on it.</p>
      </section> : null}
    </div></div> : <>
      <nav className="remote-projects" aria-label="Server projects"><button className={`remote-button${project === '' && !manager ? ' on' : ''}`} type="button" onClick={() => { setProject(''); setManager(false); setSelected(''); setHistory(undefined) }}>All projects</button>{snapshot.projects.map((one) => <button className={`remote-button${project === one.id && !manager ? ' on' : ''}`} key={one.id} type="button" title={one.path} onClick={() => { setProject(one.id); setManager(false); setSelected(''); setHistory(undefined) }}>{one.path}</button>)}<button type="button" className={`remote-button${manager ? ' on' : ''}`} onClick={() => { setManager(true); setSelected(''); setHistory(undefined) }}>Manager</button></nav>
      <div className="remote-workspace"><section className="remote-list" aria-label={manager ? 'Manager' : 'Conversations'}>{manager ? <><h2>Manager · {snapshot.manager.state}</h2><p>{snapshot.manager.queued} queued</p>{snapshot.manager.threads.map((one) => <button key={one.id} type="button" className="remote-session" onClick={() => open(one.id)}><strong>{one.title}</strong><span>{one.state}</span></button>)}</> : sessions.length === 0 ? <p>No conversations in this project.</p> : sessions.map((one) => <SessionRow key={one.id} session={one} selected={one.id === selected} open={open} />)}</section>
        <section className="remote-history" aria-label="Conversation history">{selected === '' ? <p>Open a conversation to read its history.</p> : history === undefined ? <p>Loading history…</p> : <>{history.before === 0 ? null : <button className="remote-button" type="button" onClick={() => { earlier.current = true; connection.current?.history(selected, history.before) }}>Load earlier</button>}{history.items.length === 0 ? <p>No messages yet.</p> : history.items.map((item) => <article key={item.id}><small>{item.kind}</small><pre>{item.text}</pre></article>)}</>}</section>
      </div></>}
  </main>
}
