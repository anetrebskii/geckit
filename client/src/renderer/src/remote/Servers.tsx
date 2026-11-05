import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { readInvitation } from '../../../shared/remote/protocol'
import type { RemoteHistory, RemoteSession, RemoteSnapshot, RemoteTrust } from '../../../shared/remote/protocol'
import { connectRemote } from './client'
import type { RemoteView } from './client'
import { forgetServer, savedServers } from './storage'
interface ServersProps { readonly onClose: () => void; readonly scan?: () => Promise<string | undefined>; readonly invitation?: string }
interface SessionRowProps { readonly session: RemoteSession; readonly selected: boolean; readonly open: (id: string) => void }
const SessionRow = memo(function SessionRow({ session, selected, open }: SessionRowProps) {
  return <button type="button" className={`remote-session${selected ? ' on' : ''}`} onClick={() => open(session.id)}><strong>{session.title}</strong><span>{session.status ?? session.state} · {session.provider ?? 'claude'}</span><p>{session.stands}</p></button>
}, (before, after) => before.selected === after.selected && before.open === after.open && before.session.id === after.session.id && before.session.title === after.session.title && before.session.status === after.session.status && before.session.state === after.session.state && before.session.provider === after.session.provider && before.session.stands === after.session.stands)
export function Servers({ onClose, scan, invitation = '' }: ServersProps): React.JSX.Element {
  const [code, setCode] = useState(invitation)
  const [name, setName] = useState('GeckIt client')
  const [saved, setSaved] = useState<readonly RemoteTrust[]>([])
  const [view, setView] = useState<RemoteView>({ state: 'disconnected', message: 'Connect to a server' })
  const [snapshot, setSnapshot] = useState<RemoteSnapshot>()
  const [history, setHistory] = useState<RemoteHistory>()
  const [project, setProject] = useState('')
  const [manager, setManager] = useState(false)
  const [selected, setSelected] = useState('')
  const connection = useRef<ReturnType<typeof connectRemote> | undefined>(undefined)
  const attempt = useRef(0)
  const input = useRef<HTMLInputElement>(null)
  const historyEpoch = useRef('')
  const earlier = useRef(false)
  const closeConnection = useCallback((): void => { attempt.current++; connection.current?.close() }, [])
  const refreshSaved = (): void => { void savedServers().then(setSaved).catch(() => setView({ state: 'error', message: 'Device storage is unavailable. Allow app storage, then try again.' })) }
  useEffect(() => {
    refreshSaved(); input.current?.focus()
    return closeConnection
  }, [closeConnection])
  const disconnect = (): void => { attempt.current++; connection.current?.close(); connection.current = undefined; setSnapshot(undefined); setHistory(undefined); setView({ state: 'disconnected', message: 'Disconnected' }) }
  const connect = (trust?: RemoteTrust, value = code): void => {
    const pairing = trust ?? readInvitation(value)
    if (pairing === undefined) { setView({ state: 'error', message: 'Could not connect. Check the code and server, then try again.' }); return }
    disconnect(); const mine = ++attempt.current
    setSelected(''); setProject(''); setManager(false)
    connection.current = connectRemote(pairing, name, (next) => {
      if (mine !== attempt.current) return
      setView(next)
      if (next.state !== 'connected') { setSnapshot(undefined); setHistory(undefined) }
      if (next.snapshot !== undefined) {
        if (historyEpoch.current !== next.snapshot.epoch) { historyEpoch.current = next.snapshot.epoch; setHistory(undefined) }
        setSnapshot(next.snapshot); refreshSaved()
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
  const busy = ['connecting', 'pending', 'reconnecting'].includes(view.state)
  const active = busy || view.state === 'connected'
  const sessions = useMemo(() => snapshot?.sessions.filter((one) => project === '' || one.project === project) ?? [], [snapshot?.sessions, project])
  return <main className="remote-clients" onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') { disconnect(); onClose() } }}>
    <header className="board-head drag"><button type="button" className="remote-button no-drag" onClick={() => { disconnect(); onClose() }}>Local</button><strong>Servers</strong><span className="spacer" /><span className="remote-status" role="status">{view.message}</span>{active ? <button type="button" className="remote-button no-drag" onClick={disconnect}>Disconnect</button> : null}</header>
    {snapshot === undefined ? <section className="remote-setup">
      <h1>Connect to a server</h1><p>Run <code>geckit pair create --project &lt;path&gt; --qr</code> on your GeckIt server. Enter its temporary code, then confirm this device there. Access is read only.</p>
      <form onSubmit={(event) => { event.preventDefault(); if (!busy && code.trim() !== '') connect() }}>
        <label>Connection code<input ref={input} value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={busy} /></label>
        <label>Device name<input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} disabled={busy} /></label>
        <div className="remote-actions"><button className="remote-button primary" disabled={busy || code.trim() === ''} type="submit">Connect</button>{scan === undefined ? null : <button className="remote-button" type="button" disabled={busy} onClick={() => { void scan().then((text) => { if (text !== undefined) { setCode(text); connect(undefined, text) } }).catch(() => undefined) }}>Scan server QR</button>}</div>
      </form>
      <p className="remote-feedback" role="status">{view.message}</p>
      {saved.length === 0 ? null : <><h2>Saved servers</h2><ul className="remote-saved">{saved.map((one) => <li key={one.server.id}><button type="button" className="remote-button" disabled={busy} onClick={() => connect(one)}><strong>{one.server.name}</strong><small>{one.server.id}</small></button><button type="button" className="remote-button" disabled={active} onClick={() => { void forgetServer(one.server.id).then(refreshSaved) }}>Forget</button></li>)}</ul><p>Forget removes this server from this device. Use the server CLI to revoke device access.</p></>}
    </section> : <>
      <nav className="remote-projects" aria-label="Server projects"><strong>{snapshot.server.name}</strong><button className={`remote-button${project === '' && !manager ? ' on' : ''}`} type="button" onClick={() => { setProject(''); setManager(false); setSelected(''); setHistory(undefined) }}>All projects</button>{snapshot.projects.map((one) => <button className={`remote-button${project === one.id && !manager ? ' on' : ''}`} key={one.id} type="button" title={one.path} onClick={() => { setProject(one.id); setManager(false); setSelected(''); setHistory(undefined) }}>{one.path}</button>)}<button type="button" className={`remote-button${manager ? ' on' : ''}`} onClick={() => { setManager(true); setSelected(''); setHistory(undefined) }}>Manager</button></nav>
      <div className="remote-workspace"><section className="remote-list" aria-label={manager ? 'Manager' : 'Conversations'}>{manager ? <><h2>Manager · {snapshot.manager.state}</h2><p>{snapshot.manager.queued} queued</p>{snapshot.manager.threads.map((one) => <button key={one.id} type="button" className="remote-session" onClick={() => open(one.id)}><strong>{one.title}</strong><span>{one.state}</span></button>)}</> : sessions.length === 0 ? <p>No conversations in this project.</p> : sessions.map((one) => <SessionRow key={one.id} session={one} selected={one.id === selected} open={open} />)}</section>
        <section className="remote-history" aria-label="Conversation history">{selected === '' ? <p>Open a conversation to read its history.</p> : history === undefined ? <p>Loading history…</p> : <>{history.before === 0 ? null : <button className="remote-button" type="button" onClick={() => { earlier.current = true; connection.current?.history(selected, history.before) }}>Load earlier</button>}{history.items.length === 0 ? <p>No messages yet.</p> : history.items.map((item) => <article key={item.id}><small>{item.kind}</small><pre>{item.text}</pre></article>)}</>}</section>
      </div></>}
  </main>
}
