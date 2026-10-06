import type { ChildProcess } from 'node:child_process'
import type { AgentVpnView } from '../../shared/vpn'

import { VPN_REQUIRED_MESSAGE } from '../../shared/vpn'
export type AgentAdmission = (root?: string) => void

export class VpnAdmission {
  private required = true
  update(view: Pick<AgentVpnView, 'required'>): boolean {
    const before = this.required
    this.required = view.required
    return !before && this.required
  }
  assert: AgentAdmission = () => {
    if (this.required) throw new Error(VPN_REQUIRED_MESSAGE)
  }
}

export const agentAdmission = new VpnAdmission()

const children = new Set<ChildProcess>()
export function trackAgentChild<T extends ChildProcess>(child: T): T {
  children.add(child)
  child.once('exit', () => children.delete(child))
  child.once('error', () => children.delete(child))
  return child
}
export function cancelAgentChildren(): void {
  for (const child of children) { try { child.kill() } catch { /* Continue cancelling other owned children. */ } }
  children.clear()
}
