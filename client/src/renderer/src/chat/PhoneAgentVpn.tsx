import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AgentVpnView } from '../../../shared/api'
import { phoneCalls } from '../phone-calls'
import { Icon } from '../ui/Icon'
import { AgentVpnRouting } from '../ui/AgentVpnRouting'
import { computerName } from './PhoneHosts'
import { Cell, Drawer } from './PhoneKit'

export interface PhoneAgentVpnProps {
  readonly open: boolean
  readonly onOpen: () => void
  readonly onClose: () => void
  readonly conversation?: boolean
}
type Read = { readonly kind: 'loading' | 'offline' | 'failed' } | { readonly kind: 'ready'; readonly view: AgentVpnView }

export const PhoneAgentVpn = memo(function PhoneAgentVpn({ open, onOpen, onClose, conversation = false }: PhoneAgentVpnProps): React.JSX.Element {
  const [read, setRead] = useState<Read>({ kind: phoneCalls()?.connected() === false ? 'offline' : 'loading' })
  const refresh = useRef<() => void>(() => undefined)
  useEffect(() => {
    let active = true
    let revision = 0
    let request = 0
    const connected = (): boolean => phoneCalls()?.connected() !== false
    const look = (): void => {
      const asked = ++request
      const at = revision
      if (!connected()) { setRead({ kind: 'offline' }); return }
      setRead({ kind: 'loading' })
      void window.geckit.agentVpn.view().then((view) => {
        if (active && connected() && asked === request && at === revision) setRead({ kind: 'ready', view })
      }).catch(() => {
        if (active && asked === request && at === revision) setRead({ kind: connected() ? 'failed' : 'offline' })
      })
    }
    refresh.current = look
    const stop = window.geckit.agentVpn.onView((view) => {
      revision += 1
      if (active && connected()) setRead({ kind: 'ready', view })
    })
    const stopConnection = phoneCalls()?.onConnection((up) => {
      revision += 1
      request += 1
      if (up) look()
      else setRead({ kind: 'offline' })
    })
    const foreground = (): void => { if (!document.hidden) look() }
    window.addEventListener('focus', foreground)
    document.addEventListener('visibilitychange', foreground)
    look()
    return () => {
      active = false
      refresh.current = () => undefined
      stop()
      stopConnection?.()
      window.removeEventListener('focus', foreground)
      document.removeEventListener('visibilitychange', foreground)
    }
  }, [])
  const look = useCallback(() => refresh.current(), [])
  const label = read.kind === 'loading' ? 'Host VPN loading' : read.kind === 'offline' ? 'Host offline' : read.kind === 'failed' ? 'Host VPN status unknown' : read.kind === 'ready' && read.view.required ? 'Host VPN required' : 'Host VPN unavailable'
  return <>
    <div className={`phone-agent-vpn-status${conversation ? ' conversation' : ''}`}>
      <Cell label={label} onPress={onOpen}><Icon name="settings" size={18} /></Cell>
    </div>
    {open ? <VpnSheet read={read} onClose={onClose} onRefresh={look} /> : null}
  </>
})

function VpnSheet({ read, onClose, onRefresh }: Pick<PhoneAgentVpnProps, 'onClose'> & { readonly read: Read; readonly onRefresh: () => void }): React.JSX.Element {
  const content = useRef<HTMLDivElement>(null)
  const name = computerName()
  useLayoutEffect(() => {
    const dialog = content.current?.closest<HTMLElement>('.phone-drawer')
    if (dialog === undefined || dialog === null) return
    dialog.classList.add('phone-agent-vpn-sheet')
    dialog.setAttribute('aria-modal', 'true')
    const behind = Array.from(document.body.children).filter((one): one is HTMLElement => one instanceof HTMLElement && one !== dialog && !one.classList.contains('phone-drawer-scrim')).map((one) => ({ one, inert: one.inert }))
    for (const { one } of behind) one.inert = true
    dialog.querySelector<HTMLButtonElement>('.phone-task-bar button')?.focus()
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose() }
      if (event.key !== 'Tab') return
      const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    dialog.addEventListener('keydown', key)
    return () => {
      dialog.removeEventListener('keydown', key)
      for (const { one, inert } of behind) one.inert = inert
    }
  }, [onClose])
  const selected = read.kind === 'ready' ? read.view.servers.find((one) => one.id === read.view.selected) : undefined
  return <Drawer title="Agent VPN" onClose={onClose}>
    <div className="phone-agent-vpn-content" ref={content}>
      <h1>Agent VPN on {name}</h1>
      <p className="phone-note">Agent status on the paired computer. This does not change the phone's connection or route SSH hosts through its VPN.</p>
      <div className="phone-agent-vpn-purpose"><p>Give GeckIt agents and their tools a separate AmneziaWG connection.</p><p>When connected, their internet traffic goes through your VPN server. If the VPN disconnects, their internet access stops until you reconnect.</p></div>
      <div className="phone-group" role="status" aria-live="polite">
        <Cell label={read.kind === 'loading' ? 'Checking the computer…' : read.kind === 'offline' ? 'Computer offline' : read.kind === 'failed' ? 'VPN status unknown' : read.kind === 'ready' && read.view.required ? 'Agents cannot start until VPN connects.' : 'VPN routing is not ready in this build.'} />
      </div>
      <p className="phone-note">{read.kind === 'offline' ? 'Connect to the paired computer to read its current VPN status.' : read.kind === 'failed' ? 'The computer could not provide VPN status. Refresh to try again. An older host may need an update.' : read.kind === 'loading' ? 'Current VPN protection status is unknown.' : read.kind === 'ready' && read.view.required ? 'VPN routing is not ready in this build. GeckIt blocks new agent work, but network-level blocking for running tools is not active yet.' : 'You can save server configurations. Connecting and blocking agent internet access are still being completed.'}</p>
      <AgentVpnRouting />
      <p className="phone-note">This policy applies to agents running on this computer. SSH hosts need their own protection.</p>
      {read.kind === 'ready' ? <>
        <div className="phone-head">Saved configuration</div>
        <div className="phone-group"><Cell label={selected?.name ?? 'None selected'} says={selected === undefined ? 'No configuration selected for later.' : `${selected.version} fields · Not connected`} /></div>
        {read.view.problem === undefined ? null : <p className="phone-note">Saved configurations could not be read on the computer.</p>}
      </> : null}
      <div className="phone-group"><Cell label="Refresh status" icon="refresh" accent onPress={onRefresh} /></div>
      <p className="phone-note">Manage configurations on {name}.</p>
    </div>
  </Drawer>
}
