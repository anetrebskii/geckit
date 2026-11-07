import { useCallback, useEffect, useRef, useState } from 'react'
import { readInvitation } from '../../../shared/remote/protocol'
import type { RemoteServer, RemoteSnapshot, RemoteTrust } from '../../../shared/remote/protocol'
import type { SavedServer } from './storage'
import { Icon } from '../ui/Icon'
import { connectRemote } from './client'
import { Workspace } from './Workspace'
import { LiveView } from '../chat/LiveView'
import type { SignInLink } from '../../../shared/live-view'
import type { RemoteView } from './client'
import { forgetServer, nameServer, savedServers, shownName } from './storage'
interface ServersProps { readonly onClose: () => void; readonly scan?: () => Promise<string | undefined>; readonly invitation?: string; readonly initialServer?: string; readonly signIn?: SignInLink }
const COMMAND = 'geckit pair'
const FAILED = ['error', 'expired', 'reused', 'revoked', 'incompatible']
export function Servers({ onClose, invitation = '', initialServer, signIn }: ServersProps): React.JSX.Element {
  const [signing, setSigning] = useState(signIn)
  const [code, setCode] = useState(invitation)
  const [saved, setSaved] = useState<readonly SavedServer[]>()
  const [label, setLabel] = useState('')
  const [editing, setEditing] = useState<string>()
  const [draft, setDraft] = useState('')
  const [removing, setRemoving] = useState<string>()
  const naming = useRef('')
  const [view, setView] = useState<RemoteView>({ state: 'disconnected', message: '' })
  const [snapshot, setSnapshot] = useState<RemoteSnapshot>()
  const [server, setServer] = useState<RemoteServer>()
  const [target, setTarget] = useState('')
  const [adding, setAdding] = useState(invitation !== '' || initialServer === ':add')
  const [copied, setCopied] = useState(false)
  const connection = useRef<ReturnType<typeof connectRemote> | undefined>(undefined)
  const [workspace, setWorkspace] = useState<ReturnType<typeof connectRemote>>()
  const attempt = useRef(0)
  const input = useRef<HTMLInputElement>(null)
  const closeConnection = useCallback((): void => { attempt.current++; connection.current?.close() }, [])
  const refreshSaved = useCallback((): void => { void savedServers().then(setSaved).catch(() => { setSaved([]); setView({ state: 'error', message: 'Device storage is unavailable. Allow app storage, then try again.' }) }) }, [])
  const disconnect = useCallback((): void => { attempt.current++; connection.current?.close(); connection.current = undefined; setSnapshot(undefined); setView({ state: 'disconnected', message: '' }) }, [])
  const connect = useCallback((trust?: RemoteTrust, value = ''): void => {
    const pairing = trust ?? readInvitation(value)
    naming.current = trust === undefined ? label.trim() : ''
    setTarget(trust?.server.id ?? '')
    if (pairing === undefined) { setView({ state: 'error', message: 'This is not a connection code. Copy the whole code the server printed.' }); return }
    disconnect()
    if (trust !== undefined && !trust.full) { setAdding(true); setView({ state: 'error', message: 'Run geckit pair on this computer and paste a new code to open its workspace.' }); return }
    setServer(trust?.server)
    const mine = ++attempt.current
    connection.current = connectRemote(pairing, 'GeckIt client', (next) => {
      if (mine !== attempt.current) return
      setView(next)
      if (next.state !== 'connected') setSnapshot(undefined)
      if (next.snapshot !== undefined) {
        if (!next.trust?.full) { setAdding(true); setView({ state: 'error', message: 'Update GeckIt on the server and run geckit pair for a new connection code.' }); return }
        const id = next.snapshot.server.id
        const wanted = naming.current
        naming.current = ''
        setServer(next.snapshot.server); setSnapshot(next.snapshot); setAdding(false); setCode(''); setLabel('')
        if (wanted === '') refreshSaved()
        else void nameServer(id, wanted).catch(() => undefined).finally(refreshSaved)
      }
    }, trust)
    setWorkspace(connection.current)
  }, [disconnect, refreshSaved, label])
  useEffect(() => {
    void savedServers().then((items) => {
      setSaved(items)
      const trust = items.find((one) => one.server.id === (signIn?.computer ?? initialServer))
      if (trust !== undefined) connect(trust)
      else if (signIn !== undefined) { setSigning(undefined); setAdding(true); setView({ state: 'error', message: `This link opens in GeckIt paired with ${signIn.name}. Pair this device with it first.` }) }
    }).catch(() => { setSaved([]); setView({ state: 'error', message: 'Device storage is unavailable. Allow app storage, then try again.' }) })
    return closeConnection
  }, [closeConnection, connect, initialServer, signIn])
  const showForm = adding || saved?.length === 0
  useEffect(() => { if (showForm && snapshot === undefined) input.current?.focus() }, [showForm, snapshot])
  const leave = (): void => { disconnect(); onClose() }
  const choose = (id: string): void => {
    if (id === ':local') { leave(); return }
    if (id === ':add') { disconnect(); setServer(undefined); setAdding(true); return }
    const trust = saved?.find((one) => one.server.id === id)
    if (trust !== undefined && id !== snapshot?.server.id) connect(trust)
  }
  const copy = (): void => { void navigator.clipboard.writeText(COMMAND).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }
  const rename = (id: string): void => { const value = draft; setEditing(undefined); void nameServer(id, value).then(refreshSaved) }
  const remove = (id: string): void => { setRemoving(undefined); if (target === id) disconnect(); void forgetServer(id).then(refreshSaved) }
  const labelled = (one: RemoteServer): RemoteServer => { const found = saved?.find((item) => item.server.id === one.id); return found === undefined ? one : { ...one, name: shownName(found) } }
  const busy = ['connecting', 'pending', 'reconnecting'].includes(view.state)
  const failed = FAILED.includes(view.state)
  const feedback = (here: boolean): React.JSX.Element | null => here && (failed || view.state === 'reconnecting') ? <p className={`remote-feedback${failed ? ' failed' : ''}`} role="status">{view.message}</p> : null
  if (snapshot !== undefined && workspace !== undefined) return <main className="remote-clients">
    <Workspace connection={workspace} server={snapshot.server} source={{ server: labelled(snapshot.server), state: view.state, choices: (saved ?? []).map((one) => ({ server: labelled(one.server) })), onChoose: choose }} onClose={leave} />
    {signing === undefined || signing.computer !== snapshot.server.id ? null : <LiveView
      name={signing.profile}
      token={signing.token}
      computer={snapshot.server.name}
      api={{ start: (name, url, token) => workspace.call('browser:viewStart', name, url, token), frame: (name) => workspace.call('browser:viewFrame', name), input: (name, input) => workspace.call('browser:viewInput', name, input), end: (name) => workspace.call('browser:viewEnd', name) }}
      onClose={() => setSigning(undefined)}
    />}
  </main>
  return <main className="remote-clients" onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') leave() }}>
    <header className="board-head drag">
      <button type="button" className="icon-button no-drag" aria-label="Back to This computer" title="Back to This computer" onClick={leave}><Icon name="left" /></button>
      <strong className="remote-title">{server === undefined ? 'Computers' : labelled(server).name}</strong>
      <span className="spacer" />
      {view.state === 'reconnecting' ? <span className="remote-state reconnecting" role="status">Reconnecting…</span> : null}
    </header>
    <div className="remote-body"><div className="remote-setup">
      {saved === undefined || saved.length === 0 ? null : <section aria-labelledby="remote-saved-title">
        <h2 id="remote-saved-title">Your computers</h2>
        <ul className="remote-saved">{saved.map((one) => {
          const going = busy && target === one.server.id
          const name = shownName(one)
          if (editing === one.server.id) return <li key={one.server.id} className="remote-editing">
            <form className="remote-rename" onSubmit={(event) => { event.preventDefault(); rename(one.server.id) }} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setEditing(undefined) } }}>
              <Icon name="server" />
              <input aria-label={`Name for ${one.server.name}`} placeholder={one.server.name} value={draft} maxLength={80} autoFocus onChange={(event) => setDraft(event.target.value)} autoComplete="off" spellCheck={false} />
              <button type="submit" className="remote-button primary">Save</button>
              <button type="button" className="remote-button" onClick={() => setEditing(undefined)}>Cancel</button>
            </form>
          </li>
          if (removing === one.server.id) return <li key={one.server.id} className="remote-removing" onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setRemoving(undefined) } }}>
            <span><strong>Remove {name}?</strong><small>To use it again, pair it with a new code.</small></span>
            <button type="button" className="remote-button danger" onClick={() => remove(one.server.id)}>Remove</button>
            <button type="button" className="remote-button" autoFocus onClick={() => setRemoving(undefined)}>Cancel</button>
          </li>
          return <li key={one.server.id}>
            <button type="button" className="remote-server" disabled={busy} onClick={() => connect(one)}>
              <Icon name="server" />
              <span><strong>{name}</strong><small>{!one.full ? 'Pair again to use this computer' : one.label === undefined ? 'Saved connection' : one.server.name}</small></span>
              {going ? <span className="spinner-turn" aria-label="Connecting"><Icon name="spinner" /></span> : null}
            </button>
            <button type="button" className="icon-button" disabled={busy} aria-label={`Rename ${name}`} title="Rename" onClick={() => { setRemoving(undefined); setDraft(name); setEditing(one.server.id) }}><Icon name="pencil" /></button>
            <button type="button" className="icon-button" disabled={busy} aria-label={`Remove ${name}`} title="Remove" onClick={() => { setEditing(undefined); setRemoving(one.server.id) }}><Icon name="trash" /></button>
          </li>
        })}</ul>
        {feedback(target !== '')}
        {showForm ? null : <button type="button" className="remote-add-open" onClick={() => { setView({ state: 'disconnected', message: '' }); setAdding(true) }}><Icon name="plus" />Connect computer</button>}
      </section>}
      {showForm ? <section className="remote-add" aria-labelledby="remote-add-title">
        <div className="remote-add-head"><h2 id="remote-add-title">{saved !== undefined && saved.length > 0 ? 'Connect computer' : 'Connect a computer'}</h2>{saved !== undefined && saved.length > 0 && !busy ? <button type="button" className="icon-button" aria-label="Cancel" title="Cancel" onClick={() => { setAdding(false); setView({ state: 'disconnected', message: '' }) }}><Icon name="close" /></button> : null}</div>
        {view.state === 'pending' ? <div className="remote-pending" role="status">
          <p>Update GeckIt on the server, then run <code>geckit pair</code> for a new connection code.</p>
          <button type="button" className="remote-button" onClick={disconnect}>Cancel</button>
        </div> : <ol className="remote-steps">
          <li><span>On the server, run</span><div className="remote-command"><code>{COMMAND}</code><button type="button" className="icon-button" aria-label="Copy command" title={copied ? 'Copied' : 'Copy'} onClick={copy}><Icon name={copied ? 'check' : 'copy'} /></button></div></li>
          <li><span>Paste the code it prints</span>
            <form className="remote-code" onSubmit={(event) => { event.preventDefault(); if (!busy && code.trim() !== '') connect(undefined, code) }}>
              <input ref={input} aria-label="Connection code" placeholder="Connection code" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={busy} />
              <button className="remote-button primary" disabled={busy || code.trim() === ''} type="submit">{busy && target === '' ? 'Connecting…' : 'Connect'}</button>
            </form>
            <input className="remote-name" aria-label="Name (optional)" placeholder="Name on this device (optional)" value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !busy && code.trim() !== '') connect(undefined, code) }} autoComplete="off" spellCheck={false} disabled={busy} />
            {feedback(target === '')}
          </li>
        </ol>}
        {busy ? <button type="button" className="remote-button" onClick={disconnect}>Cancel</button> : null}
      </section> : null}
    </div></div>
  </main>
}
