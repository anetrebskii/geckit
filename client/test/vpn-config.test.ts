import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { checkVpnConfig, VPN_CONFIG_LIMIT } from '../src/main/vpn/config'

const VPN_FIXTURE = `[Interface]
PrivateKey = ${Buffer.alloc(32, 13).toString('base64')}
Address = 10.20.0.2/32, fd00::2/128
DNS = 1.1.1.1, 2606:4700:4700::1111
Jc = 4
Jmin = 30
Jmax = 50
S1 = 10
S2 = 20
H1 = 101
H2 = 201
H3 = 301
H4 = 401
[Peer]
PublicKey = ${Buffer.alloc(32, 17).toString('base64')}
Endpoint = vpn.example.test:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
`

describe('native AmneziaWG configuration', () => {
  it('retains the complete native configuration and identifies the supported version', () => {
    expect(checkVpnConfig(VPN_FIXTURE)).toEqual({ text: VPN_FIXTURE, version: 'AmneziaWG 1' })
    const v2 = VPN_FIXTURE.replace('S2 = 20', 'S2 = 20\nS3 = 30\nS4 = 40\nI1 = <b 0x010203><r 20><t>').replace('H1 = 101', 'H1 = 101-110')
    expect(checkVpnConfig(v2)).toEqual({ text: v2, version: 'AmneziaWG 2' })
  })
  it('retains every supported current native field, ranges and CPS signature', () => {
    const text = readFileSync(new URL('./fixtures/vpn/amneziawg3.conf', import.meta.url), 'utf8')
    expect(checkVpnConfig(text)).toEqual({ text, version: 'AmneziaWG 3' })
  })
  it('uses engine header defaults when individual fields are omitted', () => {
    const omitted = VPN_FIXTURE.replace(/^H[1-4] = .*\n/gm, '').replace(/^S[12] = .*\n/gm, '')
    expect(checkVpnConfig(omitted).version).toBe('AmneziaWG 1')
    expect(() => checkVpnConfig(omitted.replace('Jc = 4', 'Jc = 4\nH1 = 2'))).toThrow()
  })
  it.each([
    ['ContentPaddingAddition = 65536', 'ContentPaddingAddition'],
    ['RekeyAfterTime = 20-10', 'RekeyAfterTime'],
    ['RandomTrailers = maybe', 'RandomTrailers'],
    ['DisableCookies = -1', 'DisableCookies'],
    ['I4 = <r -1>', 'I4'],
    ['I4 = <r 40000><r 40000>', 'I4'],
    ['I4 = <ds PRIVATE-SECRET>', 'I4'],
    ['I4 = ignored<d>', 'I4'],
    ['I4 = <c>', 'I4'],
    ['HeaderProtectionKey = PRIVATE-SECRET', 'HeaderProtectionKey'],
    ['S3 = 11', 'S3'],
  ])('rejects malformed current fields: %s', (replacement, field) => {
    const text = readFileSync(new URL('./fixtures/vpn/amneziawg3.conf', import.meta.url), 'utf8')
    const changed = text.replace(new RegExp(`^${field} =.*$`, 'm'), replacement)
    const tested = changed === text ? text.replace('I3 =', replacement) : changed
    expect(() => checkVpnConfig(tested)).toThrow('Invalid or unsupported AmneziaWG configuration.')
  })
  it.each([
    VPN_FIXTURE.replace(/^(Jc|Jmin|Jmax|S[12]|H[1-4]) = .*\n/gm, ''),
    VPN_FIXTURE.replace('S1 = 10', 'PostUp = echo PRIVATE-SECRET'),
    VPN_FIXTURE.replace('S1 = 10', 'HeaderProtectionKey = PRIVATE-SECRET'),
    VPN_FIXTURE.replace('S1 = 10', 'S1 = 70000'),
    VPN_FIXTURE.replace('Jc = 4', 'Jc = 65536'),
    VPN_FIXTURE.replace('H2 = 201', 'H2 = 101'),
    VPN_FIXTURE.replace('H1 = 101', 'H1 = 120-100'),
    VPN_FIXTURE.replace('Jmin = 30', 'Jmin = 60'),
    VPN_FIXTURE.replace('Address = 10.20.0.2/32, fd00::2/128', 'Address = 10.20.0.2/50'),
    VPN_FIXTURE.replace('Endpoint = vpn.example.test:51820', 'Endpoint = username:PRIVATE-SECRET@host'),
    VPN_FIXTURE.replace('S1 = 10', 'S1 = 10\nI1 = <exec PRIVATE-SECRET>'),
    VPN_FIXTURE.replace('S1 = 10', 'S1 = 10\nS1 = 20'),
    VPN_FIXTURE + '\n[Peer]\nPublicKey = PRIVATE-SECRET',
    VPN_FIXTURE + '\0PRIVATE-SECRET',
    '#'.repeat(VPN_CONFIG_LIMIT + 1),
  ])('rejects malformed, unsupported and executable input with a fixed sanitized error', (text) => {
    expect(() => checkVpnConfig(text)).toThrow('Invalid or unsupported AmneziaWG configuration.')
    try { checkVpnConfig(text) } catch (error) { expect(String(error)).not.toContain('PRIVATE-SECRET') }
  })
})
