import type { networkInterfaces } from 'node:os'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Settings } from '../src/shared/api'
import { canonicalPublicIp, parseVpnIps, VPN_IP_CONFIGURATION_ERROR, VPN_IP_UNAVAILABLE_ERROR, vpnIpMismatchError } from '../src/shared/vpn-ip'
import { checkVpnIp } from '../src/main/vpn-ip'

const system = vi.hoisted(() => ({ interfaces: vi.fn<typeof networkInterfaces>(() => ({})) }))
vi.mock('node:os', () => ({ networkInterfaces: system.interfaces }))

type Policy = Pick<Settings, 'vpnIpCheck' | 'vpnAllowedIps'>
const enabled: Policy = { vpnIpCheck: true, vpnAllowedIps: ['8.8.8.8', '2001:4860:4860::8888'] }

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
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
