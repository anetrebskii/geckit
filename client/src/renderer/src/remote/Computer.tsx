import { useEffect, useState } from 'react'
import type { RemoteServer, RemoteTrust } from '../../../shared/remote/protocol'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import type { Choice } from '../ui/Menu'
import { ON_PHONE } from '../on-phone'
import type { RemoteView } from './client'
import { savedServers, shownName } from './storage'

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

export interface ComputerChoices {
  /** The GeckIt computer this window shows, or none for this computer. */
  readonly source: RemoteComputer | undefined
  readonly computers: readonly Pick<RemoteTrust, 'server'>[]
  readonly trouble: string
  /** Shows the chosen computer: `:local` for this one, `:add` to connect another, `:manage` for the saved list. */
  readonly choose: (id: string) => void
}

/** The computers a window can switch to, read again whenever `reading` changes. */
export function useComputers(reading: unknown, onConnect?: (id?: string) => void): ComputerChoices {
  const [source, setSource] = useState(window.geckitRemoteComputer)
  const [saved, setSaved] = useState<readonly Pick<RemoteTrust, 'server'>[]>([])
  const [trouble, setTrouble] = useState('')
  useEffect(() => {
    const changed = (): void => setSource(window.geckitRemoteComputer)
    window.addEventListener('geckit:computer', changed)
    return () => window.removeEventListener('geckit:computer', changed)
  }, [])
  useEffect(() => {
    if (source !== undefined || reading === undefined) return
    let active = true
    void savedServers().then((servers) => { if (active) { setSaved(servers.map((one) => ({ server: { ...one.server, name: shownName(one) } }))); setTrouble('') } }).catch(() => { if (active) setTrouble('Saved computers are unavailable. Allow app storage, then try again.') })
    return () => { active = false }
  }, [source, reading])
  const servers = source?.choices ?? saved
  const computers = source !== undefined && !servers.some((one) => one.server.id === source.server.id) ? [...servers, { server: source.server }] : servers
  const choose = (id: string): void => {
    if (id === (source?.server.id ?? ':local')) return
    if (source === undefined) onConnect?.(id)
    else source.onChoose(id)
  }
  return { source, computers, trouble, choose }
}

/** A computer's name as a person reads it: a Mac's network name loses its `.local` and gets its spaces back. */
export const computerName = (name: string): string => /\.local$/i.test(name) ? name.replace(/\.local$/i, '').replace(/-/g, ' ') : name

/** What the computer switcher offers: the computers, the current one checked, then connecting another and managing the saved ones. */
export function computerChoices(computers: ComputerChoices['computers'], local: boolean): Choice[] {
  return [
    ...(local ? [{ value: ':local', label: 'This computer', icon: 'display' }] : []),
    ...computers.map((one) => ({ value: one.server.id, label: computerName(one.server.name), icon: 'display' })),
    { value: ':add', label: 'Connect Computer…', icon: 'plus', divided: true },
    ...(computers.length === 0 ? [] : [{ value: ':manage', label: 'Manage Computers…', icon: 'settings' }]),
  ]
}

export const computerStatus = (state: RemoteView['state'] | undefined): string => state === 'connected' ? 'Connected' : state === 'connecting' ? 'Connecting…' : state === 'reconnecting' ? 'Reconnecting…' : 'Disconnected'

export function Computer({ onConnect }: ComputerProps): React.JSX.Element {
  const [anchor, setAnchor] = useState<DOMRect>()
  const { source, computers, trouble, choose } = useComputers(anchor, onConnect)
  const name = source?.server.name ?? 'This computer'
  const state = source?.state
  const status = computerStatus(state)
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
      choices={computerChoices(computers, !ON_PHONE)}
      {...(trouble === '' ? {} : { note: trouble })}
      onPick={choose}
      onClose={() => setAnchor(undefined)}
    />}
  </>
}
