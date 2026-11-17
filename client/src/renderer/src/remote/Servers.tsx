import { useCallback, useEffect, useRef, useState } from 'react'
import { readInvitation } from '../../../shared/remote/protocol'
import type { RemoteServer, RemoteSnapshot, RemoteTrust } from '../../../shared/remote/protocol'
import type { SavedServer } from './storage'
import { Icon } from '../ui/Icon'
import { connectRemote } from './client'
import { Workspace } from './Workspace'
import { ConnectProgress, stageSaid } from './ConnectProgress'
import { LiveView } from '../chat/LiveView'
import type { SignInLink } from '../../../shared/live-view'
import type { RemoteView } from './client'
import { forgetServer, nameServer, savedServers, shownName } from './storage'
import { Cell, FullSheet, Page } from '../chat/PhoneKit'
import { SwipeRow } from '../chat/SwipeRow'
import { Menu } from '../ui/Menu'
import { computerName } from './Computer'
import '../chat/phone-home.css'
interface ServersProps { readonly onClose: () => void; readonly onWorkspace?: (open: boolean, server?: string) => void; readonly scan?: () => Promise<string | undefined>; readonly invitation?: string; readonly initialServer?: string; readonly signIn?: SignInLink }
const COMMAND = 'geckit pair'
const FAILED = ['error', 'expired', 'reused', 'revoked', 'incompatible']
const ON_PHONE = (): boolean => document.documentElement.classList.contains('phone')
export function Servers({ onClose, onWorkspace, scan, invitation = '', initialServer, signIn }: ServersProps): React.JSX.Element {
  const [signing, setSigning] = useState(signIn)
  const [code, setCode] = useState(invitation)
  const [saved, setSaved] = useState<readonly SavedServer[]>()
  const [label, setLabel] = useState('')
  const [editing, setEditing] = useState<string>()
  const [draft, setDraft] = useState('')
  const [removing, setRemoving] = useState<string>()
  const [swiped, setSwiped] = useState<string>()
  const naming = useRef('')
  const [view, setView] = useState<RemoteView>({ state: 'disconnected', message: '' })
  const [snapshot, setSnapshot] = useState<RemoteSnapshot>()
  const [, setServer] = useState<RemoteServer>()
  // A saved computer being opened: its workspace shows at once on what this client kept, while the link is made.
  const [opening, setOpening] = useState<RemoteServer>()
  const [round, setRound] = useState(0)
  const [target, setTarget] = useState('')
  const [adding, setAdding] = useState(invitation !== '' || initialServer === ':add')
  const [copied, setCopied] = useState(false)
  const connection = useRef<ReturnType<typeof connectRemote> | undefined>(undefined)
  const [workspace, setWorkspace] = useState<ReturnType<typeof connectRemote>>()
  const attempt = useRef(0)
  const input = useRef<HTMLInputElement>(null)
  const closeConnection = useCallback((): void => { attempt.current++; connection.current?.close() }, [])
  const refreshSaved = useCallback((): void => { void savedServers().then(setSaved).catch(() => { setSaved([]); setView({ state: 'error', message: 'Device storage is unavailable. Allow app storage, then try again.' }) }) }, [])
  const disconnect = useCallback((): void => { attempt.current++; connection.current?.close(); connection.current = undefined; setSnapshot(undefined); setOpening(undefined); setView({ state: 'disconnected', message: '' }) }, [])
  const connect = useCallback((trust?: RemoteTrust, value = '', name = ''): void => {
    const pairing = trust ?? readInvitation(value)
    naming.current = trust === undefined ? name.trim() : ''
    setTarget(trust?.server.id ?? '')
    if (pairing === undefined) { setView({ state: 'error', message: 'This is not a connection code. Copy the whole code the server printed.' }); return }
    disconnect()
    if (trust !== undefined && !trust.full) { setAdding(true); setView({ state: 'error', message: 'Run geckit pair on this computer and paste a new code to open its workspace.' }); return }
    setServer(trust?.server)
    setOpening(trust?.full === true ? trust.server : undefined)
    setRound((one) => one + 1)
    const mine = ++attempt.current
    connection.current = connectRemote(pairing, 'GeckIt client', (next) => {
      if (mine !== attempt.current) return
      setView(next)
      if (next.state !== 'connected' && next.state !== 'reconnecting') setSnapshot(undefined)
      if (FAILED.includes(next.state) || next.state === 'pending') setOpening(undefined)
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
  }, [disconnect, refreshSaved])
  useEffect(() => {
    void savedServers().then((items) => {
      setSaved(items)
      // The phone's list is its home, so with nothing on it the sheet to connect one opens over it.
      if (items.length === 0 && ON_PHONE()) setAdding(true)
      const trust = items.find((one) => one.server.id === (signIn?.computer ?? initialServer))
      if (trust !== undefined) connect(trust)
      else if (signIn !== undefined) { setSigning(undefined); setAdding(true); setView({ state: 'error', message: `This link opens in GeckIt paired with ${signIn.name}. Pair this device with it first.` }) }
    }).catch(() => { setSaved([]); setView({ state: 'error', message: 'Device storage is unavailable. Allow app storage, then try again.' }) })
    return closeConnection
  }, [closeConnection, connect, initialServer, signIn])
  const showForm = adding || (saved?.length === 0 && !ON_PHONE())
  const shownServer = snapshot?.server ?? opening
  const openServer = shownServer !== undefined && workspace !== undefined ? shownServer.id : undefined
  useEffect(() => { onWorkspace?.(openServer !== undefined, openServer) }, [onWorkspace, openServer])
  useEffect(() => { if (showForm && snapshot === undefined) setTimeout(() => input.current?.focus(), 0) }, [showForm, snapshot])
  const leave = (): void => { disconnect(); onClose() }
  const choose = (id: string): void => {
    if (id === ':local') { leave(); return }
    if (id === ':add') { disconnect(); setServer(undefined); setAdding(true); return }
    if (id === ':manage') { disconnect(); setServer(undefined); setAdding(false); return }
    const trust = saved?.find((one) => one.server.id === id)
    if (trust !== undefined && id !== snapshot?.server.id) connect(trust)
  }
  const scanned = async (): Promise<void> => {
    const text = await scan?.()
    if (text === undefined) return
    if (readInvitation(text) === undefined) { setView({ state: 'error', message: 'That is not a GeckIt code. Scan the code in GeckIt Settings, Phone.' }); return }
    setCode(text)
    connect(undefined, text, label)
  }
  const copy = (): void => { void navigator.clipboard.writeText(COMMAND).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }
  const rename = (id: string): void => { const value = draft; setEditing(undefined); void nameServer(id, value).then(refreshSaved) }
  const remove = (id: string): void => { setRemoving(undefined); if (target === id) disconnect(); void forgetServer(id).then(refreshSaved) }
  const labelled = (one: RemoteServer): RemoteServer => { const found = saved?.find((item) => item.server.id === one.id); return found === undefined ? one : { ...one, name: shownName(found) } }
  const busy = ['connecting', 'pending', 'reconnecting'].includes(view.state)
  const failed = FAILED.includes(view.state)
  const reconnecting = (name: string): string => {
    const step = view.steps?.at(-1)
    return step === undefined || step.stage === 'ready' ? view.message : `Reconnecting: ${stageSaid(name)[step.stage]}…`
  }
  const pillStep = (name: string): string => { const step = view.steps?.at(-1); return step === undefined || step.stage === 'ready' ? 'Trying again' : `${stageSaid(name)[step.stage]}…` }
  const feedback = (here: boolean): React.JSX.Element | null => here && (failed || (view.state === 'reconnecting' && (view.steps ?? []).length === 0)) ? <p className={`remote-feedback${failed ? ' failed' : ''}`} role="status">{view.message}</p> : null
  if (shownServer !== undefined && workspace !== undefined) return <main className="remote-clients">
    {view.state !== 'reconnecting' && view.state !== 'connecting' ? null : ON_PHONE() ? <Dropped key={view.state} head={`${view.state === 'connecting' ? 'Connecting' : 'Reconnecting'} to ${computerName(labelled(shownServer).name)}`} step={pillStep(shownServer.name)} /> : <p className="remote-feedback" role="status">{view.state === 'connecting' ? `Connecting to ${computerName(labelled(shownServer).name)}…` : reconnecting(shownServer.name)}</p>}
    <Workspace key={round} quick={snapshot === undefined} connection={workspace} server={shownServer} steps={view.steps ?? []} source={{ server: labelled(shownServer), state: view.state, choices: (saved ?? []).map((one) => ({ server: labelled(one.server) })), onChoose: choose }} onClose={leave} />
    {signing === undefined || signing.computer !== shownServer.id ? null : <LiveView
      name={signing.profile}
      token={signing.token}
      computer={shownServer.name}
      api={{ start: (name, url, token) => workspace.call('browser:viewStart', name, url, token), frame: (name) => workspace.call('browser:viewFrame', name), input: (name, input) => workspace.call('browser:viewInput', name, input), end: (name) => workspace.call('browser:viewEnd', name) }}
      onClose={() => setSigning(undefined)}
    />}
  </main>
  const going = saved?.find((one) => one.server.id === target)
  const goingName = going === undefined ? 'the computer' : shownName(going)
  const progress = busy && view.state !== 'pending' ? <ConnectProgress name={goingName} steps={view.steps ?? []} /> : null
  if (scan !== undefined && progress !== null) return <main className="remote-clients remote-reaching">
    <h2>Connecting to {goingName}</h2>
    {progress}
    <button type="button" className="quiet" onClick={disconnect}>Cancel</button>
  </main>
  const empty = saved !== undefined && saved.length === 0
  const editingOne = saved?.find((one) => one.server.id === editing)
  const removingOne = saved?.find((one) => one.server.id === removing)
  const toList = (): void => { if (busy) disconnect(); setAdding(false); setEditing(undefined); setRemoving(undefined); setView({ state: 'disconnected', message: '' }) }
  const back = (): void => { if (removingOne !== undefined || editingOne !== undefined || (adding && !empty)) toList(); else leave() }
  const startAdding = (keep = ''): void => { setView({ state: 'disconnected', message: '' }); setTarget(''); setLabel(keep); setAdding(true) }
  const status = (one: SavedServer, going: boolean): React.ReactNode => going ? 'Connecting…' : !one.full ? <span className="host-state trouble">Needs a new code</span> : one.label === undefined ? 'Saved' : computerName(one.server.name)
  const openOne = (one: SavedServer): void => { if (one.full) connect(one); else startAdding(one.label ?? '') }
  const details = (one: SavedServer): void => { setDraft(one.label ?? ''); setEditing(one.server.id) }
  const forgetSaid = scan === undefined ? 'To use it again, run geckit pair there and paste a new code.' : 'To use it again, scan the code in GeckIt Settings, Phone, there.'
  const connectReady = !busy && code.trim() !== '' && view.state !== 'pending'
  const submit = (): void => { if (connectReady) connect(undefined, code, label) }
  const commandRow = <div className="remote-command"><code>{COMMAND}</code><button type="button" className="icon-button" aria-label="Copy command" title={copied ? 'Copied' : 'Copy'} onClick={copy}><Icon name={copied ? 'check' : 'copy'} /></button></div>
  const lead = scan === undefined
    ? 'On the other computer, run this command, then paste the code it prints.'
    : 'On the computer, open GeckIt Settings, Phone, and scan its code. Without the app there, run this command and paste the code it prints.'

  if (ON_PHONE()) return <main className="computers-phone">
    <Page title="Computers">
      {empty ? <div className="phone-empty">No computers yet. Connect one to see its tasks and conversations here.</div> : <div className="phone-group">{(saved ?? []).map((one) => {
        const going = busy && target === one.server.id
        return <SwipeRow key={one.server.id} open={swiped === one.server.id} onOpen={(on) => setSwiped(on ? one.server.id : undefined)} onTap={() => { if (!busy) openOne(one) }} onDelete={() => setRemoving(one.server.id)}>
          <span className="computer-row">
            <Icon name="display" size={22} className="phone-cell-icon" />
            <span className="phone-row-text">
              <span className="phone-row-title">{computerName(shownName(one))}</span>
              <span className="phone-row-said">{status(one, going)}</span>
            </span>
            <button type="button" className="phone-icon computer-info" aria-label={`Details of ${shownName(one)}`} onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); details(one) }}><Icon name="info" size={22} /></button>
          </span>
        </SwipeRow>
      })}</div>}
      <div className="phone-group computers-add"><Cell label="Connect Computer" icon="plus" accent onPress={() => startAdding()} /></div>
      {empty ? null : <div className="phone-note">Tap a computer to open it. Swipe left to remove one.</div>}
      {feedback(target !== '')}
    </Page>
    {editingOne === undefined ? null : <section className="phone-pushed">
      <Page title={computerName(shownName(editingOne))} back="Computers" onBack={() => rename(editingOne.server.id)}>
        <div className="phone-head">Name</div>
        <div className="phone-group"><input className="phone-field" aria-label="Name" type="text" value={draft} maxLength={80} placeholder={computerName(editingOne.server.name)} onChange={(event) => setDraft(event.target.value)} autoComplete="off" spellCheck={false} /></div>
        <div className="phone-note">Kept on this phone. Leave empty to use {computerName(editingOne.server.name)}.</div>
        {editingOne.full ? null : <div className="phone-group computers-add"><Cell label="Pair Again" accent onPress={() => { setEditing(undefined); startAdding(editingOne.label ?? '') }} /></div>}
        <div className="phone-group computers-add"><Cell label="Remove Computer" danger onPress={() => setRemoving(editingOne.server.id)} /></div>
      </Page>
    </section>}
    {!showForm ? null : <FullSheet title="Connect Computer" action="Connect" ready={connectReady} onAction={submit} onClose={toList}>
      <div className="phone-note computers-lead">{lead}</div>
      {view.state === 'pending' ? null : <div className="phone-group"><Cell label="Scan Code" icon="scan" accent onPress={() => { if (!busy) void scanned() }} /></div>}
      <div className="computers-command">{commandRow}</div>
      {view.state === 'pending' ? <div className="phone-note">Update GeckIt on the server, then run geckit pair for a new connection code.</div> : <>
        <div className="phone-head">Or paste the code</div>
        <div className="phone-group">
          <input ref={input} className="phone-field computer-code" aria-label="Connection code" placeholder="Connection code" type="text" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} disabled={busy} />
          <input className="phone-field" aria-label="Name" placeholder="Name (optional)" type="text" value={label} maxLength={80} onChange={(event) => setLabel(event.target.value)} autoComplete="off" spellCheck={false} disabled={busy} />
        </div>
      </>}
      {target === '' ? progress : null}
      {feedback(target === '')}
    </FullSheet>}
    {removingOne === undefined ? null : <Menu
      anchor={new DOMRect()}
      title={`Remove "${computerName(shownName(removingOne))}"?`}
      choices={[{ value: 'remove', label: 'Remove Computer', says: forgetSaid, danger: true }]}
      onPick={() => remove(removingOne.server.id)}
      onClose={() => setRemoving(undefined)}
    />}
  </main>

  let body: React.JSX.Element
  if (removingOne !== undefined) body = <>
    <h2>Remove {computerName(shownName(removingOne))}?</h2>
    <p className="add-host-lead">This computer forgets it. {forgetSaid}</p>
    <div className="dialog-actions">
      <button type="button" className="quiet" autoFocus onClick={() => setRemoving(undefined)}>Cancel</button>
      <button type="button" className="primary danger" onClick={() => remove(removingOne.server.id)}>Remove</button>
    </div>
  </>
  else if (editingOne !== undefined) body = <form onSubmit={(event) => { event.preventDefault(); rename(editingOne.server.id) }}>
    <h2>{computerName(shownName(editingOne))}</h2>
    <div className="field">
      <label htmlFor="computer-rename">Name</label>
      <input id="computer-rename" type="text" value={draft} maxLength={80} placeholder={computerName(editingOne.server.name)} autoFocus onChange={(event) => setDraft(event.target.value)} autoComplete="off" spellCheck={false} />
      <span className="hint">Kept on this computer. Leave empty to use <span className="nowrap">{computerName(editingOne.server.name)}</span>.</span>
    </div>
    <div className="dialog-actions">
      <button type="button" className="quiet host-remove" onClick={() => { setRemoving(editingOne.server.id); setEditing(undefined) }}>Remove Computer…</button>
      <button type="button" className="quiet" onClick={() => setEditing(undefined)}>Cancel</button>
      <button type="submit" className="primary">Save</button>
    </div>
  </form>
  else if (showForm) body = <form onSubmit={(event) => { event.preventDefault(); submit() }}>
    <h2>Connect Computer</h2>
    <p className="add-host-lead">{lead}</p>
    {commandRow}
    {scan === undefined || view.state === 'pending' ? null : <button type="button" className="primary computers-scan" disabled={busy} onClick={() => void scanned()}>Scan code</button>}
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
    {target === '' ? progress : null}
    {feedback(target === '')}
    <div className="dialog-actions">
      <button type="button" className="quiet" onClick={empty ? leave : toList}>Cancel</button>
      <button type="submit" className="primary" disabled={!connectReady}>{busy && target === '' ? 'Connecting…' : 'Connect'}</button>
    </div>
  </form>
  else body = <>
    <h2>Computers</h2>
    <div className="computers-list" role="list">
      {(saved ?? []).map((one) => {
        const going = busy && target === one.server.id
        return <div key={one.server.id} role="listitem" className="computer-item">
          <button type="button" className="computer-open" disabled={busy && !going} title={one.full ? `Open ${shownName(one)}` : 'Pair it again'} onClick={() => { if (going) disconnect(); else openOne(one) }}>
            <Icon name="display" size={18} />
            <span className="host-lines">
              <span className="name">{computerName(shownName(one))}</span>
              <span className="says">{status(one, going)}</span>
            </span>
            {going ? <span className="computer-cancel">Cancel</span> : null}
          </button>
          <button type="button" className="icon-button" aria-label={`Details of ${shownName(one)}`} title="Details" disabled={busy} onClick={() => details(one)}><Icon name="info" size={16} /></button>
        </div>
      })}
    </div>
    {target === '' ? null : progress}
    {feedback(target !== '')}
    <div className="dialog-actions">
      <button type="button" className="quiet computers-new" disabled={busy} onClick={() => startAdding()}>Connect Computer…</button>
      <button type="button" className="primary" autoFocus onClick={leave}>Done</button>
    </div>
  </>
  return <div className="dialog-scrim" onMouseDown={leave} onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Escape') back() }}>
    <div className="dialog add-host computers-dialog" role="dialog" aria-modal="true" aria-label="Computers" onMouseDown={(event) => event.stopPropagation()}>{body}</div>
  </div>
}

// Most drops mend in a few seconds, back from the background above all, and a pill that comes and goes in that time only startles.
const QUIET = 5000

/** The pill over the phone's workspace while the link is made again, once the drop has lasted long enough to be worth saying. */
function Dropped({ head, step }: { readonly head: string; readonly step: string }): React.JSX.Element | null {
  const [shown, setShown] = useState(false)
  useEffect(() => { const wait = setTimeout(() => setShown(true), QUIET); return () => clearTimeout(wait) }, [])
  return shown ? <div className="phone-offline" role="status"><span className="phone-spin" /><span><b>{head}</b><small>{step}</small></span></div> : null
}
