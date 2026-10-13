import { VPN_IP_UNAVAILABLE_ERROR } from '../../shared/vpn-ip'
import type { SessionsDeps } from './index'

type MonitorDeps = Required<Pick<SessionsDeps, 'beforeSend' | 'vpnMonitor'>> & {
  readonly active: () => boolean
  readonly failed: (explanation: string) => void
}

export class VpnSessionMonitor {
  readonly #deps: MonitorDeps
  #policy: string | undefined
  #active = false
  #generation = 0
  #disposed = false
  #inFlight = false
  #timer: ReturnType<typeof setTimeout> | undefined
  #deadline: ReturnType<typeof setTimeout> | undefined
  #cancel: (() => void) | undefined

  constructor(deps: MonitorDeps) {
    this.#deps = deps
  }

  refresh(): void {
    if (this.#disposed) return
    const policy = this.#deps.vpnMonitor()
    const active = policy !== undefined && this.#deps.active()
    if (policy !== this.#policy || active !== this.#active) {
      this.#generation += 1
      clearTimeout(this.#timer)
      this.#timer = undefined
      this.#policy = policy
      this.#active = active
    }
    if (!active || this.#inFlight || this.#timer !== undefined) return
    void this.#check()
  }

  async #check(): Promise<void> {
    this.#inFlight = true
    const generation = this.#generation
    const started = Date.now()
    try {
      await Promise.race([
        this.#deps.beforeSend(),
        new Promise<never>((_resolve, reject) => { this.#deadline = setTimeout(() => reject(new Error(VPN_IP_UNAVAILABLE_ERROR)), 10_000) }),
        new Promise<void>((resolve) => { this.#cancel = resolve }),
      ])
    } catch (error) {
      if (!this.#disposed && generation === this.#generation && this.#deps.vpnMonitor() === this.#policy && this.#deps.active()) {
        this.#deps.failed(error instanceof Error ? error.message : VPN_IP_UNAVAILABLE_ERROR)
      }
    } finally {
      clearTimeout(this.#deadline)
      this.#deadline = undefined
      this.#cancel = undefined
      this.#inFlight = false
      if (!this.#disposed && this.#active) {
        if (generation !== this.#generation || this.#deps.vpnMonitor() !== this.#policy || !this.#deps.active()) this.refresh()
        else this.#timer = setTimeout(() => { this.#timer = undefined; this.refresh() }, Math.max(0, 10_000 - (Date.now() - started)))
      }
    }
  }

  dispose(): void {
    this.#disposed = true
    this.#generation += 1
    clearTimeout(this.#timer)
    this.#timer = undefined
    clearTimeout(this.#deadline)
    this.#deadline = undefined
    this.#cancel?.()
  }
}
