import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VpnSessionMonitor } from '../src/main/sessions/vpn-monitor'
import { VPN_IP_UNAVAILABLE_ERROR, vpnIpMismatchError, vpnIpPausedError } from '../src/shared/vpn-ip'

describe('active session VPN monitor', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

  it('explains a paused turn without claiming its original prompt was unsent', () => {
    expect(vpnIpPausedError(vpnIpMismatchError('8.8.8.8'))).toBe("Paused by VPN IP check. This computer's public IP is 8.8.8.8, which is not in your approved VPN IPs. Connect your VPN, then try again.")
    expect(vpnIpPausedError(VPN_IP_UNAVAILABLE_ERROR, true)).toContain('Remote work may continue if the host cannot be reached.')
  })

  it('stays idle/off and starts one shared silent check when activity begins', async () => {
    let active = false
    let policy: string | undefined = undefined
    const check = vi.fn(async () => undefined)
    const failed = vi.fn<(explanation: string) => void>()
    const monitor = new VpnSessionMonitor({ beforeSend: check, vpnMonitor: () => policy, active: () => active, failed })
    monitor.refresh()
    await vi.advanceTimersByTimeAsync(30_000)
    active = true
    monitor.refresh()
    expect(check).not.toHaveBeenCalled()
    policy = 'approved'
    monitor.refresh()
    await vi.advanceTimersByTimeAsync(0)
    expect(check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(check).toHaveBeenCalledTimes(2)
    expect(failed).not.toHaveBeenCalled()
    active = false
    monitor.refresh()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(check).toHaveBeenCalledTimes(2)
    monitor.dispose()
  })

  it('uses ten-second start intervals without overlapping slow checks', async () => {
    let finish: (() => void) | undefined
    const check = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    const monitor = new VpnSessionMonitor({ beforeSend: check, vpnMonitor: () => 'approved', active: () => true, failed: () => undefined })
    monitor.refresh()
    monitor.refresh()
    await vi.advanceTimersByTimeAsync(4_000)
    expect(check).toHaveBeenCalledTimes(1)
    finish?.()
    await vi.advanceTimersByTimeAsync(5_999)
    expect(check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(check).toHaveBeenCalledTimes(2)
    monitor.dispose()
    finish?.()
  })

  it.each(['off', 'idle', 'policy', 'dispose'] as const)('discards obsolete failure after %s', async (change) => {
    let policy: string | undefined = 'first'
    let active = true
    let reject: ((error: Error) => void) | undefined
    const failed = vi.fn<(explanation: string) => void>()
    const check = vi.fn(() => new Promise<void>((_resolve, refused) => { reject = refused }))
    const monitor = new VpnSessionMonitor({ beforeSend: check, vpnMonitor: () => policy, active: () => active, failed })
    monitor.refresh()
    if (change === 'off') policy = undefined
    if (change === 'idle') active = false
    if (change === 'policy') policy = 'second'
    if (change === 'dispose') monitor.dispose()
    else monitor.refresh()
    reject?.(new Error('old failure'))
    await vi.advanceTimersByTimeAsync(0)
    expect(failed).not.toHaveBeenCalled()
    if (change === 'policy') expect(check).toHaveBeenCalledTimes(2)
    monitor.dispose()
  })

  it('fails closed on an unavailable checker and bounds an unresolved check', async () => {
    let active = true
    const failed = vi.fn<(explanation: string) => void>(() => { active = false; monitor.refresh() })
    const check = vi.fn(() => new Promise<void>(() => undefined))
    const monitor = new VpnSessionMonitor({ beforeSend: check, vpnMonitor: () => 'approved', active: () => active, failed })
    monitor.refresh()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(failed).toHaveBeenCalledWith(VPN_IP_UNAVAILABLE_ERROR)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(check).toHaveBeenCalledTimes(1)
    monitor.dispose()
  })

  it('cancels its pending waiter and removes timers when disposed', async () => {
    const failed = vi.fn<(explanation: string) => void>()
    const monitor = new VpnSessionMonitor({ beforeSend: () => new Promise<void>(() => undefined), vpnMonitor: () => 'approved', active: () => true, failed })
    monitor.refresh()
    expect(vi.getTimerCount()).toBe(1)
    monitor.dispose()
    await vi.advanceTimersByTimeAsync(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(failed).not.toHaveBeenCalled()
  })
})
