import type { networkInterfaces } from 'node:os'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Settings } from '../src/shared/api'
import { canonicalPublicIp, parseVpnIps, VPN_IP_CONFIGURATION_ERROR, VPN_IP_UNAVAILABLE_ERROR, vpnIpMismatchError, vpnIpPausedError, retryableVpnIpError } from '../src/shared/vpn-ip'
import { checkVpnIp } from '../src/main/vpn-ip'
import type { VpnIpDependencies } from '../src/main/vpn-ip'
import { VpnSessionMonitor } from '../src/main/sessions/vpn-monitor'

const system = vi.hoisted(() => ({ interfaces: vi.fn<typeof networkInterfaces>(() => ({})) }))
vi.mock('node:os', () => ({ networkInterfaces: system.interfaces }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))

type Policy = Pick<Settings, 'vpnIpCheck' | 'vpnAllowedIps'>
const enabled: Policy = { vpnIpCheck: true, vpnAllowedIps: ['8.8.8.8', '2001:4860:4860::8888'] }

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('automatic VPN revalidation eligibility', () => {
  it.each([VPN_IP_UNAVAILABLE_ERROR, vpnIpMismatchError('5.165.50.8'), vpnIpMismatchError('2001:4860:4860::8888')])('accepts only exact public-IP guard errors, including paused form: %s', (error) => {
    expect(retryableVpnIpError(error)).toBe(true)
    expect(retryableVpnIpError(vpnIpPausedError(error))).toBe(true)
  })

  it.each([undefined, VPN_IP_CONFIGURATION_ERROR, 'VPN unavailable', vpnIpMismatchError('127.0.0.1'), vpnIpMismatchError('008.8.8.8'), vpnIpMismatchError('2001:4860:4860:0:0:0:0:8888'), `${vpnIpMismatchError('8.8.8.8')} Hook refused`, `Hook refused: ${VPN_IP_UNAVAILABLE_ERROR}`])('rejects configuration and lookalike guard errors: %s', (error) => {
    expect(retryableVpnIpError(error)).toBe(false)
    if (error !== undefined) expect(retryableVpnIpError(vpnIpPausedError(error))).toBe(false)
  })
})

describe('approved public IP addresses', () => {
  it('canonicalizes and deduplicates IPv6 without changing IPv4', () => {
    expect(parseVpnIps(' 8.8.8.8\n2001:4860:4860:0:0:0:0:8888\n2001:4860:4860::8888\n8.8.8.8 ')).toEqual({ ips: enabled.vpnAllowedIps })
    expect(canonicalPublicIp('2606:4700:4700::1111')).toBe('2606:4700:4700::1111')
  })

  it.each(['localhost', 'vpn.example.com', '8.8.8.0/24', '08.8.8.8', '8.8.8.8:443', '10.0.0.1', '127.0.0.1', '100.64.0.1', '169.254.1.1', '192.168.1.1', '192.0.2.1', '198.18.0.1', '224.0.0.1', '::1', 'fe80::1', 'fc00::1', '2001:db8::1', '2001:4860::1%en0', '::ffff:8.8.8.8', '2001:::4860'])('rejects non-public or non-address input: %s', (address) => {
    expect(canonicalPublicIp(address)).toBeUndefined()
    expect(parseVpnIps(`8.8.8.8\n${address}`)).toEqual({ ips: [], error: `Enter a public IPv4 or IPv6 address on each line. Invalid address: ${address}.` })
  })

  it('allows an empty edit so it can be saved with the guard disabled', () => {
    expect(parseVpnIps(' \n\t')).toEqual({ ips: [] })
  })

  it.each(['192.0.0.9', '192.0.0.10', '64:ff9b::808:808', '2001:1::1', '2001:3::1', '2001:4:112::1', '2001:20::1', '2001:30::1'])('accepts globally reachable IANA special-purpose exceptions: %s', (address) => {
    expect(canonicalPublicIp(address)).toBe(address)
  })
})

describe('VPN IP dispatch check', () => {
  it.each([4, 6] as const)('recovers family %s through an independent endpoint and preserves the network error', async (family) => {
    const probe = vi.fn<VpnIpDependencies['probe']>()
      .mockRejectedValueOnce(Object.assign(new Error('DNS lookup failed'), { code: 'ENOTFOUND' }))
      .mockResolvedValueOnce(family === 4 ? '8.8.8.8' : '2001:4860:4860::8888')
    const diagnostic = vi.fn<VpnIpDependencies['diagnostic']>()
    await checkVpnIp(() => enabled, { families: () => [family], probe, diagnostic })
    expect(probe.mock.calls.map((call) => call[2])).toEqual(family === 4 ? ['https://api.ipify.org/', 'https://checkip.amazonaws.com/'] : ['https://api6.ipify.org/', 'https://icanhazip.com/'])
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed', family, attempt: 1, code: 'ENOTFOUND', error: 'DNS lookup failed' }))
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'recovered', family, attempt: 2 }))
  })

  it('retries ipify once after both endpoints fail and never caches the recovery', async () => {
    const probe = vi.fn<VpnIpDependencies['probe']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('TLS failure'))
      .mockResolvedValue('8.8.8.8')
    await checkVpnIp(() => enabled, { families: () => [4], probe })
    await checkVpnIp(() => enabled, { families: () => [4], probe })
    expect(probe.mock.calls.map((call) => call[2])).toEqual(['https://api.ipify.org/', 'https://checkip.amazonaws.com/', 'https://api.ipify.org/', 'https://api.ipify.org/'])
  })

  it('bounds and aborts each attempt even if the transport ignores cancellation', async () => {
    vi.useFakeTimers()
    const probe = vi.fn<VpnIpDependencies['probe']>(() => new Promise<string>(() => {}))
    const diagnostic = vi.fn<VpnIpDependencies['diagnostic']>()
    const assertion = expect(checkVpnIp(() => enabled, { families: () => [4], probe, diagnostic })).rejects.toThrow(VPN_IP_UNAVAILABLE_ERROR)
    await vi.advanceTimersByTimeAsync(3_000)
    expect(probe.mock.calls).toHaveLength(2)
    expect(probe.mock.calls[0]?.[1].aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(6_000)
    await assertion
    expect(probe.mock.calls).toHaveLength(3)
    expect(probe.mock.calls.every((call) => call[1].aborted)).toBe(true)
    expect(diagnostic).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'unavailable', elapsedMs: 9_000 }))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('blocks a valid mismatch immediately and cancels the other family without using fallback', async () => {
    vi.useFakeTimers()
    const probe = vi.fn<VpnIpDependencies['probe']>((family) => family === 4 ? new Promise<string>(() => {}) : Promise.resolve('2606:4700:4700::1111'))
    await expect(checkVpnIp(() => enabled, { families: () => [4, 6], probe })).rejects.toThrow(vpnIpMismatchError('2606:4700:4700::1111'))
    await vi.advanceTimersByTimeAsync(0)
    expect(probe.mock.calls).toHaveLength(2)
    expect(probe.mock.calls.every((call) => call[1].aborted)).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cannot override an unapproved fallback IP by trying another service', async () => {
    const probe = vi.fn<VpnIpDependencies['probe']>().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce('1.1.1.1').mockResolvedValue('8.8.8.8')
    await expect(checkVpnIp(() => enabled, { families: () => [4], probe })).rejects.toThrow(vpnIpMismatchError('1.1.1.1'))
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('keeps first-attempt success silent and ignores diagnostic failures during recovery', async () => {
    const diagnostic = vi.fn<VpnIpDependencies['diagnostic']>(() => { throw new Error('disk unavailable') })
    const probe = vi.fn<VpnIpDependencies['probe']>().mockResolvedValueOnce('8.8.8.8').mockRejectedValueOnce(new Error('offline')).mockResolvedValue('8.8.8.8')
    await checkVpnIp(() => enabled, { families: () => [4], probe, diagnostic })
    expect(diagnostic).not.toHaveBeenCalled()
    await expect(checkVpnIp(() => enabled, { families: () => [4], probe, diagnostic })).resolves.toBeUndefined()
    expect(diagnostic).toHaveBeenCalledTimes(2)
  })

  it('does not retry after the guard is disabled inside a failed lookup', async () => {
    let policy: Policy = enabled
    const probe = vi.fn<VpnIpDependencies['probe']>(async () => { policy = { ...enabled, vpnIpCheck: false }; throw new Error('offline') })
    await expect(checkVpnIp(() => policy, { families: () => [4], probe })).resolves.toBeUndefined()
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('recovers malformed responses without putting response bodies in diagnostics', async () => {
    const diagnostic = vi.fn<VpnIpDependencies['diagnostic']>()
    const probe = vi.fn<VpnIpDependencies['probe']>().mockResolvedValueOnce('private server response body').mockResolvedValue('8.8.8.8')
    await checkVpnIp(() => enabled, { families: () => [4], probe, diagnostic })
    expect(probe).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('private server response body')
  })

  it('keeps periodic sessions working after a recovered lookup failure', async () => {
    vi.useFakeTimers()
    const probe = vi.fn<VpnIpDependencies['probe']>()
      .mockResolvedValueOnce('8.8.8.8')
      .mockRejectedValueOnce(new Error('DNS unavailable'))
      .mockResolvedValue('8.8.8.8')
    const failed = vi.fn<(explanation: string) => void>()
    const monitor = new VpnSessionMonitor({ beforeSend: () => checkVpnIp(() => enabled, { families: () => [4], probe }), vpnMonitor: () => 'enabled', active: () => true, failed })
    monitor.refresh()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(probe).toHaveBeenCalledTimes(3)
    expect(failed).not.toHaveBeenCalled()
    monitor.dispose()
  })

  it('discovers private IPv4 and global IPv6 interfaces, ignoring loopback, link-local and ULA', async () => {
    system.interfaces.mockReturnValue({
      lo0: [{ family: 'IPv4', address: '127.0.0.1', netmask: '255.0.0.0', mac: '00:00:00:00:00:00', internal: true, cidr: '127.0.0.1/8' }],
      en0: [
        { family: 'IPv4', address: '192.168.1.10', netmask: '255.255.255.0', mac: '00:00:00:00:00:00', internal: false, cidr: '192.168.1.10/24' },
        { family: 'IPv6', address: '2001:4860:4860::1', netmask: 'ffff:ffff:ffff:ffff::', mac: '00:00:00:00:00:00', internal: false, cidr: '2001:4860:4860::1/64', scopeid: 0 },
        { family: 'IPv6', address: 'fe80::1', netmask: 'ffff:ffff:ffff:ffff::', mac: '00:00:00:00:00:00', internal: false, cidr: 'fe80::1/64', scopeid: 4 },
        { family: 'IPv6', address: 'fc00::1', netmask: 'ffff:ffff:ffff:ffff::', mac: '00:00:00:00:00:00', internal: false, cidr: 'fc00::1/64', scopeid: 0 },
      ],
    })
    const probe = vi.fn(async (family: 4 | 6) => family === 4 ? '8.8.8.8' : '2001:4860:4860::8888')
    await checkVpnIp(() => enabled, { probe })
    expect(probe.mock.calls.map(([family]) => family)).toEqual([4, 6])
  })

  it('does no interface discovery or network probing while disabled', async () => {
    const families = vi.fn(() => [4] as const)
    const probe = vi.fn(async () => '8.8.8.8')
    await checkVpnIp(() => ({ ...enabled, vpnIpCheck: false }), { families, probe })
    expect(families).not.toHaveBeenCalled()
    expect(probe).not.toHaveBeenCalled()
  })

  it('checks both usable address families afresh for every operation', async () => {
    const probe = vi.fn(async (family: 4 | 6) => family === 4 ? '8.8.8.8' : '2001:4860:4860:0:0:0:0:8888')
    for (let index = 0; index < 2; index++) await checkVpnIp(() => enabled, { families: () => [4, 6], probe })
    expect(probe.mock.calls.map(([family]) => family)).toEqual([4, 6, 4, 6])
  })

  it('blocks if a usable IPv6 family differs even when IPv4 matches', async () => {
    await expect(checkVpnIp(() => enabled, { families: () => [4, 6], probe: async (family) => family === 4 ? '8.8.8.8' : '2606:4700:4700::1111' })).rejects.toThrow(vpnIpMismatchError('2606:4700:4700::1111'))
  })

  it.each(['', 'garbage', '10.0.0.1', '2001:4860:4860::8888'])('blocks malformed, private or wrong-family replies: %s', async (reply) => {
    await expect(checkVpnIp(() => enabled, { families: () => [4], probe: async () => reply })).rejects.toThrow(VPN_IP_UNAVAILABLE_ERROR)
  })

  it('blocks if either usable family cannot be verified', async () => {
    await expect(checkVpnIp(() => enabled, { families: () => [4, 6], probe: async (family) => { if (family === 6) throw new Error('offline'); return '8.8.8.8' } })).rejects.toThrow(VPN_IP_UNAVAILABLE_ERROR)
  })

  it.each([{ vpnAllowedIps: [] }, { vpnAllowedIps: ['bad'] }, { vpnAllowedIps: ['8.8.8.8', 'bad'] }])('fails closed for missing or partially corrupt saved addresses: %j', async ({ vpnAllowedIps }) => {
    const probe = vi.fn(async () => '8.8.8.8')
    await expect(checkVpnIp(() => ({ ...enabled, vpnAllowedIps }), { families: () => [4], probe })).rejects.toThrow(VPN_IP_CONFIGURATION_ERROR)
    expect(probe).not.toHaveBeenCalled()
  })

  it('fails closed if no usable interfaces exist', async () => {
    await expect(checkVpnIp(() => enabled, { families: () => [], probe: async () => '8.8.8.8' })).rejects.toThrow(VPN_IP_UNAVAILABLE_ERROR)
  })

  it('rechecks changed policy before allowing dispatch', async () => {
    let policy: Policy = enabled
    const probe = vi.fn(async () => {
      policy = { ...enabled, vpnAllowedIps: ['1.1.1.1'] }
      return '8.8.8.8'
    })
    await expect(checkVpnIp(() => policy, { families: () => [4], probe })).rejects.toThrow(vpnIpMismatchError('8.8.8.8'))
    expect(probe).toHaveBeenCalledTimes(2)
  })

  it('honors disabling the guard while a probe is running', async () => {
    let policy: Policy = enabled
    await expect(checkVpnIp(() => policy, { families: () => [4], probe: async () => {
      policy = { ...enabled, vpnIpCheck: false }
      throw new Error('offline')
    } })).resolves.toBeUndefined()
  })

  it('checks a family that becomes usable while the lookup runs', async () => {
    let ipv6 = false
    const probe = vi.fn(async (family: 4 | 6) => {
      ipv6 = true
      return family === 4 ? '8.8.8.8' : '2606:4700:4700::1111'
    })
    await expect(checkVpnIp(() => enabled, { families: () => ipv6 ? [4, 6] : [4], probe })).rejects.toThrow(vpnIpMismatchError('2606:4700:4700::1111'))
  })

  it('enforces an overall ten-second deadline and aborts in-flight probes', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const checked = checkVpnIp(() => enabled, { families: () => [4], probe: (_family, checking) => {
      signal = checking
      return new Promise<string>(() => {})
    } })
    const assertion = expect(checked).rejects.toThrow(VPN_IP_UNAVAILABLE_ERROR)
    await vi.advanceTimersByTimeAsync(10_000)
    await assertion
    expect(signal?.aborted).toBe(true)
  })
})
