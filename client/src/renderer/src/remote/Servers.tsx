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
interface ServersProps { readonly onClose: () => void; readonly onWorkspace?: (open: boolean) => void; readonly scan?: () => Promise<string | undefined>; readonly invitation?: string; readonly initialServer?: string; readonly signIn?: SignInLink }
const COMMAND = 'geckit pair'
const FAILED = ['error', 'expired', 'reused', 'revoked', 'incompatible']
export function Servers({ onClose, onWorkspace, invitation = '', initialServer, signIn }: ServersProps): React.JSX.Element {
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
  const [, setServer] = useState<RemoteServer>()
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
  const open = snapshot !== undefined && workspace !== undefined
  useEffect(() => { onWorkspace?.(open) }, [onWorkspace, open])
  useEffect(() => { if (showForm && snapshot === undefined) setTimeout(() => input.current?.focus(), 0) }, [showForm, snapshot])
  const leave = (): void => { disconnect(); onClose() }
  const choose = (id: string): void => {
    if (id === ':local') { leave(); return }
    if (id === ':add') { disconnect(); setServer(undefined); setAdding(true); return }
    if (id === ':manage') { disconnect(); setServer(undefined); setAdding(false); return }
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
  const empty = saved !== undefined && saved.length === 0
  const editingOne = saved?.find((one) => one.server.id === editing)
  const removingOne = saved?.find((one) => one.server.id === removing)
  const toList = (): void => { if (busy) disconnect(); setAdding(false); setEditing(undefined); setRemoving(undefined); setView({ state: 'disconnected', message: '' }) }
  const back = (): void => { if (removingOne !== undefined || editingOne !== undefined || (adding && !empty)) toList(); else leave() }
  const startAdding = (keep = ''): void => { setView({ state: 'disconnected', message: '' }); setTarget(''); setLabel(keep); setAdding(true) }
  const head = (title: string): React.JSX.Element => <div className="computers-head">
    <h2>{title}</h2>
    <button type="button" className="icon-button" aria-label="Close" title="Close" onClick={leave}><Icon name="close" /></button>
  </div>
  let body: React.JSX.Element
  if (removingOne !== undefined) body = <>
    <h2>Remove {shownName(removingOne)}?</h2>
    <p className="add-host-lead">This device forgets it. To use it again, run geckit pair there and paste a new code.</p>
    <div className="dialog-actions">
      <button type="button" className="quiet" autoFocus onClick={() => setRemoving(undefined)}>Cancel</button>
      <button type="button" className="primary danger" onClick={() => remove(removingOne.server.id)}>Remove</button>
    </div>
  </>
  else if (editingOne !== undefined) body = <form onSubmit={(event) => { event.preventDefault(); rename(editingOne.server.id) }}>
    {head(`Edit ${shownName(editingOne)}`)}
    <div className="field">
      <label htmlFor="computer-rename">Name</label>
      <input id="computer-rename" type="text" value={draft} maxLength={80} placeholder={editingOne.server.name} autoFocus onChange={(event) => setDraft(event.target.value)} autoComplete="off" spellCheck={false} />
      <span className="hint">Kept on this device. Leave empty to use <span className="nowrap">{editingOne.server.name}</span>.</span>
    </div>
    <div className="dialog-actions">
      <button type="button" className="quiet host-remove" onClick={() => { setRemoving(editingOne.server.id); setEditing(undefined) }}>Remove</button>
      <button type="button" className="quiet" onClick={() => setEditing(undefined)}>Cancel</button>
      <button type="submit" className="primary">Save</button>
    </div>
  </form>
  else if (showForm) body = <form onSubmit={(event) => { event.preventDefault(); if (!busy && code.trim() !== '') connect(undefined, code) }}>
    {head('Connect a computer')}
    <p className="add-host-lead">On the other computer, run this command, then paste the code it prints.</p>
    <div className="remote-command"><code>{COMMAND}</code><button type="button" className="icon-button" aria-label="Copy command" title={copied ? 'Copied' : 'Copy'} onClick={copy}><Icon name={copied ? 'check' : 'copy'} /></button></div>
    {view.state === 'pending' ? <p className="remote-feedback" role="status">Update GeckIt on the server, then run <code>geckit pair</code> for a new connection code.</p> : <div className="computers-fields">
      <div className="field">
        <label htmlFor="computer-code">Connection code</label>
        <input id="computer-code" ref={input} type="text" className="computer-code" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={busy} />
      </div>
      <div className="field">
        <label htmlFor="computer-name">Name <span className="optional">optional</span></label>
        <input id="computer-name" type="text" value={label} maxLength={80} placeholder="Its own name" onChange={(event) => setLabel(event.target.value)} autoComplete="off" spellCheck={false} disabled={busy} />
      </div>
    </div>}
    {feedback(target === '')}
    <div className="dialog-actions">
      <button type="button" className="quiet" onClick={empty ? leave : toList}>{empty ? 'Cancel' : 'Back'}</button>
      <button type="submit" className="primary" disabled={busy || code.trim() === '' || view.state === 'pending'}>{busy && target === '' ? 'Connecting…' : 'Connect'}</button>
    </div>
  </form>
  else body = <>
    {head('Computers')}
    <div className="hosts-list">
      {(saved ?? []).map((one) => {
        const name = shownName(one)
        const going = busy && target === one.server.id
        return <div key={one.server.id} className="host-row">
          <Icon name="server" />
          <span className="host-lines">
            <span className="name">{name}</span>
            <span className="says">{going ? 'Connecting…' : !one.full ? <span className="host-state trouble">Needs a new code</span> : one.label === undefined ? 'Saved connection' : one.server.name}</span>
          </span>
          {going ? <button type="button" className="quiet" onClick={disconnect}>Cancel</button> : <button type="button" className="quiet" disabled={busy} onClick={() => { if (one.full) connect(one); else startAdding(one.label ?? '') }}>{one.full ? 'Open' : 'Pair again'}</button>}
          <button type="button" className="quiet" disabled={busy} onClick={() => { setDraft(one.label ?? ''); setEditing(one.server.id) }}>Edit</button>
        </div>
      })}
    </div>
    {feedback(target !== '')}
    <div className="dialog-actions computers-actions">
      <button type="button" className="quiet" disabled={busy} onClick={() => startAdding()}><Icon name="plus" size={12} />Connect computer</button>
    </div>
  </>
  return <div className="dialog-scrim" onMouseDown={leave} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') back() }}>
    <div className="dialog add-host computers-dialog" role="dialog" aria-modal="true" aria-label="Computers" onMouseDown={(event) => event.stopPropagation()}>{body}</div>
  </div>
}
