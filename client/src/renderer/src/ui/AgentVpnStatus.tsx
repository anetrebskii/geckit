import { memo, useEffect, useState } from 'react'
import type { AgentVpnView } from '../../../shared/api'
import { ON_PHONE } from '../on-phone'
import { Icon } from './Icon'

export interface AgentVpnStatusProps { readonly onOpen: (opener: HTMLButtonElement) => void }
type VpnRead = { readonly kind: 'loading' } | { readonly kind: 'ready'; readonly view: AgentVpnView } | { readonly kind: 'failed' }

export const AgentVpnStatus = memo(function AgentVpnStatus({ onOpen }: AgentVpnStatusProps): React.JSX.Element | null {
  const [read, setRead] = useState<VpnRead>({ kind: 'loading' })
  useEffect(() => {
    if (ON_PHONE) return
    let active = true
    let revision = 0
    let request = 0
    const look = (): void => {
      const asked = ++request
      const at = revision
      void window.geckit.agentVpn.view().then((view) => {
        if (active && asked === request && at === revision) setRead({ kind: 'ready', view })
      }).catch(() => { if (active && asked === request && at === revision) setRead({ kind: 'failed' }) })
    }
    const stop = window.geckit.agentVpn.onView((view) => { revision += 1; if (active) setRead({ kind: 'ready', view }) })
    window.addEventListener('focus', look)
    look()
    return () => { active = false; stop(); window.removeEventListener('focus', look) }
  }, [])
  if (ON_PHONE) return null
  const label = read.kind === 'loading' ? 'VPN loading' : read.kind === 'failed' ? 'VPN status unknown' : read.kind === 'ready' && read.view.required ? 'VPN required' : 'VPN unavailable'
  const selected = read.kind === 'ready' ? read.view.servers.find((one) => one.id === read.view.selected) : undefined
  const tip = [
    read.kind === 'failed' ? 'VPN status could not be read. Open VPN settings to try again.' : undefined,
    read.kind === 'ready' ? read.view.required ? 'Agents are blocked until VPN connects. The native VPN component is not installed.' : 'Built-in local agent VPN routing is unavailable. No VPN configuration requires it.' : 'Current VPN admission status is unknown.',
    selected === undefined ? undefined : `Saved configuration: ${selected.name}. Not connected.`,
    'Open VPN settings.',
  ].filter((line) => line !== undefined).join('\n')
  return <button type="button" className="agent-vpn-status-button" aria-label={`Agent ${label}. Open VPN settings.`} title={tip} onClick={(event) => onOpen(event.currentTarget)}><Icon name="settings" size={12} /><span>{label}</span></button>
})
