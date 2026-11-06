import { useEffect, useState } from 'react'
import type { RemoteServer, RemoteTrust } from '../../../shared/remote/protocol'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import type { RemoteView } from './client'
import { savedServers } from './storage'

export interface RemoteComputer {
  readonly server: RemoteServer
  readonly state: RemoteView['state']
  readonly choices: readonly Pick<RemoteTrust, 'server'>[]
  readonly onChoose: (id: string) => void
}

declare global {
  interface Window {
    geckitRemoteComputer?: RemoteComputer
    updateRemoteComputer?: (source: RemoteComputer) => void
  }
}

interface ComputerProps { readonly onConnect?: (id?: string) => void }

export function Computer({ onConnect }: ComputerProps): React.JSX.Element {
  const [source, setSource] = useState(window.geckitRemoteComputer)
  const [anchor, setAnchor] = useState<DOMRect>()
  const [saved, setSaved] = useState<readonly Pick<RemoteTrust, 'server'>[]>([])
  const [trouble, setTrouble] = useState('')
  useEffect(() => {
    const changed = (): void => setSource(window.geckitRemoteComputer)
    window.addEventListener('geckit:computer', changed)
    return () => window.removeEventListener('geckit:computer', changed)
  }, [])
  useEffect(() => {
    if (source !== undefined || anchor === undefined) return
    let active = true
    void savedServers().then((servers) => { if (active) { setSaved(servers); setTrouble('') } }).catch(() => { if (active) setTrouble('Saved computers are unavailable. Allow app storage, then try again.') })
    return () => { active = false }
  }, [source, anchor])
  const name = source?.server.name ?? 'This computer'
  const state = source?.state
  const servers = source?.choices ?? saved
  const computers = source !== undefined && !servers.some((one) => one.server.id === source.server.id) ? [...servers, { server: source.server }] : servers
  const status = state === 'connected' ? 'Connected' : state === 'connecting' ? 'Connecting…' : state === 'reconnecting' ? 'Reconnecting…' : 'Disconnected'
  return <>
    <button
      type="button"
      className={`computer-control no-drag${source === undefined ? ' local' : ''}${anchor === undefined ? '' : ' on'}`}
      aria-label={`Computer: ${name}`}
      aria-haspopup="menu"
      aria-expanded={anchor !== undefined}
      title={source === undefined ? 'This computer · Choose computer' : `${name} · ${status}`}
      onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}
    >
      <Icon name="display" size={13} />
      {source === undefined ? null : <span className="computer-name">{name}</span>}
      {state === undefined ? null : <span className={`computer-dot ${state}`} aria-hidden="true" />}
      {source === undefined ? null : <Icon name="down" size={10} />}
    </button>
    {anchor === undefined ? null : <Menu
      anchor={anchor}
      autoFocus
      title="Computer"
      chosen={source?.server.id ?? ':local'}
      choices={[{ value: ':local', label: 'This computer', icon: 'display' }, ...computers.map((one) => ({ value: one.server.id, label: one.server.name, icon: 'server' })), { value: ':add', label: 'Connect computer…', icon: 'plus' }]}
      {...(trouble === '' ? {} : { note: trouble })}
      onPick={(id) => {
        if (id === (source?.server.id ?? ':local')) return
        if (source === undefined) onConnect?.(id)
        else source.onChoose(id)
      }}
      onClose={() => setAnchor(undefined)}
    />}
  </>
}
