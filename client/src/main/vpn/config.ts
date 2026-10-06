import { isIP } from 'node:net'
import type { AgentVpnServer } from '../../shared/vpn'

export const VPN_CONFIG_LIMIT = 64 * 1024
export type CheckedVpnConfig = Pick<AgentVpnServer, 'version'> & { readonly text: string }

const latestFields = new Set(['HeaderProtectionKey', 'ContentPaddingAddition', 'RekeyAfterTime', 'RekeyTimeout', 'RejectAfterTime', 'KeepaliveTimeout', 'MaxHandshakeAttempts', 'RandomTrailers', 'DisableCookies'])
const interfaceFields = new Set(['PrivateKey', 'Address', 'DNS', 'MTU', 'ListenPort', 'Jc', 'Jmin', 'Jmax', 'S1', 'S2', 'S3', 'S4', 'H1', 'H2', 'H3', 'H4', 'I1', 'I2', 'I3', 'I4', 'I5', ...latestFields])
const peerFields = new Set(['PublicKey', 'PresharedKey', 'Endpoint', 'AllowedIPs', 'PersistentKeepalive'])
function fail(): never { throw new Error('Invalid or unsupported AmneziaWG configuration. Use a native single-server .conf without scripts or unsupported parameters.') }
const integer = (value: string, maximum: number): number => {
  if (!/^\d+$/.test(value) || Number(value) > maximum || !Number.isSafeInteger(Number(value))) fail()
  return Number(value)
}
const range = (value: string, maximum = 0xffffffff): readonly [number, number] => {
  const parts = value.split('-')
  if (parts.length > 2) fail()
  const low = integer(parts[0] ?? '', maximum)
  const high = integer(parts[1] ?? parts[0] ?? '', maximum)
  if (high < low) fail()
  return [low, high]
}
const key = (value: string): void => {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value) || Buffer.from(value, 'base64').length !== 32 || Buffer.from(value, 'base64').toString('base64') !== value) fail()
}
const cidr = (value: string): void => {
  const parts = value.split('/')
  const family = isIP(parts[0] ?? '')
  if (family === 0 || parts.length !== 2) fail()
  integer(parts[1] ?? '', family === 4 ? 32 : 128)
}
const list = (value: string, validate: (part: string) => void): void => {
  for (const part of value.split(',')) validate(part.trim())
}
const injection = (value: string): void => {
  if (value === '') return
  let rest = value
  let size = 0
  while (rest.length > 0) {
    const tag = /^<(b|t|r|rc|rd|d|ds|dz)(?:\s+([^<>\s]+))?>/.exec(rest)
    if (tag === null) fail()
    const kind = tag[1]
    const data = tag[2] ?? ''
    if (kind === 'b') {
      if (!/^(?:0x)?(?:[a-fA-F0-9]{2})+$/.test(data)) fail()
      size += data.replace(/^0x/, '').length / 2
    } else if (kind === 't' || kind === 'd' || kind === 'ds') {
      if (data !== '') fail()
      size += kind === 't' ? 4 : 0
    } else size += integer(data, 65535)
    if (size > 65507) fail()
    rest = rest.slice(tag[0].length).trim()
  }
}

export function checkVpnConfig(text: string): CheckedVpnConfig {
  if (Buffer.byteLength(text, 'utf8') > VPN_CONFIG_LIMIT || text.includes('\0')) fail()
  const fields: (readonly [string, string])[] = []
  const get = (name: string): string | undefined => fields.find(([key]) => key === name)?.[1]
  const has = (name: string): boolean => fields.some(([key]) => key === name)
  let section: 'Interface' | 'Peer' | undefined
  let peer = false
  for (const original of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = original.replace(/\s*[#;].*$/, '').trim()
    if (line === '') continue
    if (line === '[Interface]' && section === undefined) { section = 'Interface'; continue }
    if (line === '[Peer]' && section === 'Interface' && !peer) { section = 'Peer'; peer = true; continue }
    const match = /^([A-Za-z][A-Za-z0-9]*)\s*=\s*(.*)$/.exec(line)
    if (match === null || section === undefined) fail()
    const name = match[1] ?? ''
    const value = match[2] ?? ''
    if (!(section === 'Interface' ? interfaceFields : peerFields).has(name) || has(name)) fail()
    fields.push([name, value])
  }
  for (const required of ['PrivateKey', 'Address', 'PublicKey', 'Endpoint', 'AllowedIPs']) if (!has(required)) fail()
  if (!fields.some(([name]) => /^(Jc|Jmin|Jmax|[SH][1-4]|I[1-5])$/.test(name) || latestFields.has(name))) fail()
  const headers = [1, 2, 3, 4].map((index) => range(get(`H${String(index)}`) ?? String(index)))
  for (const [name, value] of fields) {
    if (name.endsWith('Key')) { key(value); if ((name === 'PrivateKey' || name === 'PublicKey') && Buffer.from(value, 'base64').every((byte) => byte === 0)) fail() }
    else if (name === 'Address' || name === 'AllowedIPs') list(value, cidr)
    else if (name === 'DNS') list(value, (part) => { if (isIP(part) === 0) fail() })
    else if (name === 'Endpoint') {
      const endpoint = /^(\[[a-fA-F0-9:]+\]|[A-Za-z0-9.-]+):(\d+)$/.exec(value)
      if (endpoint === null || integer(endpoint[2] ?? '', 65535) === 0) fail()
      const host = endpoint[1] ?? ''
      if (host.startsWith('[') && isIP(host.slice(1, -1)) !== 6) fail()
    } else if (/^H[1-4]$/.test(name)) range(value)
    else if (/^I[1-5]$/.test(name)) injection(value)
    else if (name === 'Jc' || name === 'Jmin' || name === 'Jmax') integer(value, 65535)
    else if (name === 'MTU') { if (integer(value, 65535) < 576) fail() }
    else if (name === 'RandomTrailers' || name === 'DisableCookies') { if (!/^(true|false|on|off|1|0)$/i.test(value)) fail() }
    else if (latestFields.has(name) || name === 'PersistentKeepalive') range(value, 65535)
    else integer(value, 65535)
  }
  if (Number(get('Jmin') ?? 0) > Number(get('Jmax') ?? 0)) fail()
  const protection = get('HeaderProtectionKey')
  if (protection !== undefined && Buffer.from(protection, 'base64').some((byte) => byte !== 0)) for (const index of [1, 2, 3, 4]) if (Number(get(`S${String(index)}`) ?? 0) < 12) fail()
  for (let i = 0; i < headers.length; i++) for (let j = i + 1; j < headers.length; j++) {
    const a = headers[i]!
    const b = headers[j]!
    if (a[0] <= b[1] && b[0] <= a[1]) fail()
  }
  const version = fields.some(([name, value]) => latestFields.has(name) || (name === 'PersistentKeepalive' && value.includes('-')) || (/^I[1-5]$/.test(name) && /<(d|ds|dz)(\s|>)/.test(value))) ? 'AmneziaWG 3' : has('S3') || has('S4') || fields.some(([name, value]) => /^I[1-5]$/.test(name) || (/^H[1-4]$/.test(name) && value.includes('-'))) ? 'AmneziaWG 2' : 'AmneziaWG 1'
  return { text, version }
}
