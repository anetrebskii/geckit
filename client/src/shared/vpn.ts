export const VPN_REQUIRED_MESSAGE = 'Agents are blocked until VPN connects. The native VPN component is not installed.'

import type { ProjectProfile } from './api'

export type AgentVpnVersion = 'AmneziaWG 1' | 'AmneziaWG 2' | 'AmneziaWG 3'
export type AgentVpnServer = Pick<ProjectProfile, 'id' | 'name'> & { readonly version: AgentVpnVersion }

export interface AgentVpnView {
  readonly servers: readonly AgentVpnServer[]
  readonly selected: string | null
  readonly runtime: 'unavailable'
  readonly required: boolean
  readonly blocked: boolean
  readonly secureStorage: boolean
  readonly problem?: string
}

export type AgentVpnResult = { readonly ok: true; readonly view: AgentVpnView } | { readonly ok: false; readonly view: AgentVpnView; readonly error: string }

export interface AgentVpnApi {
  view(): Promise<AgentVpnView>
  import(): Promise<AgentVpnResult>
  select(id: AgentVpnServer['id']): Promise<AgentVpnResult>
  rename(id: AgentVpnServer['id'], name: AgentVpnServer['name']): Promise<AgentVpnResult>
  remove(id: AgentVpnServer['id']): Promise<AgentVpnResult>
  check(id: AgentVpnServer['id']): Promise<AgentVpnResult>
  onView(said: (view: AgentVpnView) => void): () => void
}
