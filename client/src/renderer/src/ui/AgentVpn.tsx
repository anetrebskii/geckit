import { useEffect, useRef, useState } from 'react'
import type { AgentVpnResult, AgentVpnServer, AgentVpnView } from '../../../shared/api'
import { AgentVpnRouting } from './AgentVpnRouting'

export function AgentVpn(): React.JSX.Element {
  const [view, setView] = useState<AgentVpnView>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [noticeAt, setNoticeAt] = useState<'setup' | 'saved'>('setup')
  const [error, setError] = useState(false)
  const [draft, setDraft] = useState<Pick<AgentVpnServer, 'id' | 'name'>>()
  const [confirming, setConfirming] = useState<AgentVpnServer['id']>()
  const importButton = useRef<HTMLButtonElement>(null)
  const removeButton = useRef<HTMLButtonElement>(null)
  const nameInput = useRef<HTMLInputElement>(null)
  const mounted = useRef(false)
  const selected = view?.servers.find((one) => one.id === view.selected)
  const name = draft?.id === selected?.id ? draft?.name ?? '' : selected?.name ?? ''

  useEffect(() => {
    mounted.current = true
    let active = true
    let heard = false
    const stop = window.geckit.agentVpn.onView((next) => { heard = true; if (active) setView(next) })
    void window.geckit.agentVpn.view().then((next) => { if (active && !heard) setView(next) }).catch(() => {
      if (active) { setNotice('VPN settings could not be loaded. Reopen Settings to try again.'); setError(true) }
    })
    return () => { active = false; mounted.current = false; stop() }
  }, [])

  const run = async (operation: () => Promise<AgentVpnResult>, success = '', removed = false): Promise<void> => {
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    let removedSaved = false
    setBusy(true)
    setNoticeAt(focused === importButton.current ? 'setup' : 'saved')
    setNotice('')
    try {
      const result = await operation()
      if (!mounted.current) return
      setView(result.view)
      setError(!result.ok)
      setNotice(result.ok ? success : result.error)
      if (result.ok) { setDraft(undefined); setConfirming(undefined) }
      removedSaved = removed && result.ok
    } catch {
      if (mounted.current) { setError(true); setNotice('VPN settings could not be changed. Try again.') }
    } finally {
      if (mounted.current) {
        setBusy(false)
        requestAnimationFrame(() => {
          if (!mounted.current) return
          if (removedSaved) importButton.current?.focus()
          else if (focused instanceof HTMLButtonElement && focused.disabled) nameInput.current?.focus()
          else if (focused?.isConnected) focused.focus()
        })
      }
    }
  }
  const canSave = view !== undefined && view.secureStorage && view.problem === undefined && !busy
  const feedback = notice === '' ? null : <div className={error ? 'agent-vpn-error' : 'agent-vpn-note'} role={error ? 'alert' : 'status'} aria-live="polite">{notice}</div>

  return <div className="agent-vpn">
    <div className="agent-vpn-heading"><h3>Agent VPN</h3>{view === undefined ? null : <span className="agent-vpn-badge">{view.required ? 'VPN required' : 'Configuration only'}</span>}</div>
    <div className="agent-vpn-purpose"><p>Give GeckIt agents and their tools a separate AmneziaWG connection.</p><p>When connected, their internet traffic goes through your VPN server. If the VPN disconnects, their internet access stops until you reconnect.</p></div>
    <div className="agent-vpn-status">
      <strong>{view === undefined ? error ? 'VPN status could not be read' : 'Checking VPN status...' : view.required ? 'Agents cannot start until VPN connects.' : 'VPN routing is not ready in this build.'}</strong>
      <span>{view === undefined ? 'Current VPN protection status is unknown.' : view.required ? 'VPN routing is not ready in this build. GeckIt blocks new agent work, but network-level blocking for running tools is not active yet.' : 'You can save server configurations. Connecting and blocking agent internet access are still being completed.'}</span>
    </div>
    {view?.problem !== undefined ? <p className="agent-vpn-error" role="alert">{view.problem}</p> : null}
    {view !== undefined && !view.secureStorage ? <p className="agent-vpn-error" role="alert">Secure storage is unavailable. Configure your operating system credential store before saving VPN servers.</p> : null}
    <AgentVpnRouting />
    <p className="agent-vpn-note">This policy applies to agents running on this computer. SSH hosts need their own protection.</p>
    <section className="agent-vpn-setup" aria-label="Server setup">
      <h3>{view !== undefined && view.servers.length > 0 ? 'Add another server' : 'Add your first server'}</h3>
      <ol>
        <li><strong>Open AmneziaVPN</strong><p>Choose Share VPN access for your self-hosted server.</p></li>
        <li><strong>Export a separate connection</strong><p>Name the user GeckIt. Choose your server, AmneziaWG and AmneziaWG native format, then save the .conf file. A vpn:// key or .vpn export cannot be imported here.</p></li>
        <li><strong>Import the .conf file</strong><p>Each server needs its own configuration. Saving a server blocks agent work until VPN connects.</p></li>
      </ol>
      <div className="agent-vpn-actions">
        <button ref={importButton} type="button" className="primary" disabled={!canSave} onClick={() => void run(() => window.geckit.agentVpn.import())}>Import .conf file</button>
        {busy ? <span role="status">Working...</span> : null}
      </div>
      {noticeAt === 'setup' ? feedback : null}
    </section>
    {view === undefined && notice === '' ? <p role="status">Loading VPN settings...</p> : null}
    {view !== undefined ? <h3 className="agent-vpn-saved-heading">Saved servers</h3> : null}
    {view !== undefined && view.servers.length === 0 ? <p className="agent-vpn-note">No saved servers yet. Import a .conf file above to add one.</p> : null}
    {view !== undefined && view.servers.length > 0 ? <div className="field">
      <label htmlFor="agent-vpn-server">Configuration to use later</label>
      <select id="agent-vpn-server" value={view.selected ?? ''} disabled={!canSave} onChange={(event) => void run(() => window.geckit.agentVpn.select(event.target.value))}>
        <option value="" disabled>Choose a server</option>
        {view.servers.map((one) => <option key={one.id} value={one.id}>{one.name}</option>)}
      </select>
      <span className="agent-vpn-note">Saved selection only. This does not connect agents.</span>
    </div> : null}
    {selected === undefined ? null : <div className="agent-vpn-server" onKeyDown={(event) => {
      if (event.key === 'Escape' && confirming === selected.id) { event.stopPropagation(); setConfirming(undefined); removeButton.current?.focus() }
    }}>
      <div className="field">
        <label htmlFor="agent-vpn-name">Server name</label>
        <input ref={nameInput} id="agent-vpn-name" type="text" value={name} maxLength={120} disabled={!canSave} onChange={(event) => setDraft({ id: selected.id, name: event.target.value })} />
        <span className="agent-vpn-note">{selected.version === 'AmneziaWG 2' ? 'AmneziaWG 1.5/2' : selected.version} configuration fields</span>
      </div>
      <div className="agent-vpn-actions">
        <button type="button" className="quiet" disabled={!canSave || name.trim() === '' || name.trim() === selected.name} onClick={() => void run(() => window.geckit.agentVpn.rename(selected.id, name))}>Save name</button>
        <button type="button" className="quiet" disabled={busy || view?.problem !== undefined || !view?.secureStorage} onClick={() => void run(() => window.geckit.agentVpn.check(selected.id), 'File settings are supported. This offline check did not contact the server.')}>Check file</button>
        <button ref={removeButton} type="button" className="quiet danger" disabled={!canSave} aria-expanded={confirming === selected.id} onClick={() => setConfirming(selected.id)}>Remove</button>
      </div>
      <span className="agent-vpn-note">Checks supported settings only; does not contact the server.</span>
      {confirming === selected.id ? <div className="agent-vpn-confirm">
        <p>Remove {selected.name}? Its saved configuration will be deleted.</p>
        <div className="agent-vpn-actions">
          <button type="button" className="quiet" disabled={busy} onClick={() => { setConfirming(undefined); removeButton.current?.focus() }}>Cancel</button>
          <button type="button" className="primary danger" disabled={!canSave} onClick={() => void run(() => window.geckit.agentVpn.remove(selected.id), 'Server removed. No other server was selected.', true)}>Remove server</button>
        </div>
      </div> : null}
    </div>}
    {noticeAt === 'saved' ? feedback : null}
  </div>
}
