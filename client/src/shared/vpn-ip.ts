import type { Settings } from './api'

export const VPN_IP_CONFIGURATION_ERROR = 'Not sent. VPN IP check is on, but no valid public IP addresses are saved. Add your VPN IPs in Settings.'
export const VPN_IP_UNAVAILABLE_ERROR = "Not sent. GeckIt could not verify this computer's public IP. Check your connection and VPN, then try again."
export const VPN_IP_CHECKING_TEXT = 'Checking public IP...'
export const vpnIpPausedError = (explanation: string, remote = false): string => `Paused by VPN IP check. ${explanation.startsWith('Not sent. ') ? explanation.slice('Not sent. '.length) : explanation}${remote ? ' Interruption was requested on the SSH host. Remote work may continue if the host cannot be reached.' : ''}`

export const vpnIpMismatchError = (ip: string): string => `Not sent. This computer's public IP is ${ip}, which is not in your approved VPN IPs. Connect your VPN, then try again.`

export function retryableVpnIpError(error: string | undefined): boolean {
  if (error === undefined) return false
  const pausedPrefix = 'Paused by VPN IP check. '
  const explanation = error.startsWith(pausedPrefix) ? `Not sent. ${error.slice(pausedPrefix.length)}` : error
  if (explanation === VPN_IP_UNAVAILABLE_ERROR) return true
  const match = /^Not sent\. This computer's public IP is ([\da-f:.]+), which is not in your approved VPN IPs\. Connect your VPN, then try again\.$/.exec(explanation)
  const ip = match?.[1]
  return ip !== undefined && canonicalPublicIp(ip) === ip && explanation === vpnIpMismatchError(ip)
}

export interface VpnIpParseResult {
  readonly ips: Settings['vpnAllowedIps']
  readonly error?: string
}

function ipv4Parts(address: string): readonly number[] | undefined {
  const parts = address.split('.')
  if (parts.length !== 4 || parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)) return undefined
  return parts.map(Number)
}

function ipv6Parts(address: string): readonly number[] | undefined {
  let source = address.toLowerCase()
  if (source.includes('.')) {
    const colon = source.lastIndexOf(':')
    const tail = ipv4Parts(source.slice(colon + 1))
    if (colon < 0 || tail === undefined) return undefined
    source = `${source.slice(0, colon)}:${((tail[0] ?? 0) * 256 + (tail[1] ?? 0)).toString(16)}:${((tail[2] ?? 0) * 256 + (tail[3] ?? 0)).toString(16)}`
  }
  const halves = source.split('::')
  if (halves.length > 2) return undefined
  const groups = (part: string): readonly string[] => part === '' ? [] : part.split(':')
  const left = groups(halves[0] ?? '')
  const right = halves.length === 2 ? groups(halves[1] ?? '') : []
  if ([...left, ...right].some((part) => !/^[\da-f]{1,4}$/.test(part))) return undefined
  const missing = 8 - left.length - right.length
  if (halves.length === 1 ? missing !== 0 : missing < 1) return undefined
  return [...left.map((part) => parseInt(part, 16)), ...Array<number>(missing).fill(0), ...right.map((part) => parseInt(part, 16))]
}

function formatIpv6(parts: readonly number[]): string {
  let start = -1
  let length = 1
  for (let index = 0; index < parts.length; index++) {
    if (parts[index] !== 0) continue
    let end = index
    while (end < parts.length && parts[end] === 0) end++
    if (end - index > length) {
      start = index
      length = end - index
    }
    index = end - 1
  }
  const words = parts.map((part) => part.toString(16))
  if (start < 0) return words.join(':')
  return `${words.slice(0, start).join(':')}::${words.slice(start + length).join(':')}`
}

export function canonicalPublicIp(address: string): string | undefined {
  const source = address.trim()
  const ipv4 = ipv4Parts(source)
  if (ipv4 !== undefined) {
    const [a = 0, b = 0, c = 0, d = 0] = ipv4
    if (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 2 || (c === 0 && d !== 9 && d !== 10))) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    ) return undefined
    return ipv4.join('.')
  }
  const ipv6 = ipv6Parts(source)
  if (ipv6 === undefined) return undefined
  const [first = 0, second = 0] = ipv6
  const translatedPublic = first === 0x64 && second === 0xff9b && ipv6.slice(2, 6).every((part) => part === 0)
  const protocolPublic = first === 0x2001 && (
    (second === 1 && ipv6.slice(2, 7).every((part) => part === 0) && (ipv6[7] ?? 0) >= 1 && (ipv6[7] ?? 0) <= 3) ||
    second === 3 || (second === 4 && ipv6[2] === 0x112) || (second >= 0x20 && second <= 0x3f)
  )
  if (
    ((first < 0x2000 || first > 0x3fff) && !translatedPublic) ||
    (first === 0x2001 && ((second <= 0x1ff && !protocolPublic) || second === 0xdb8)) ||
    first === 0x2002 ||
    (first === 0x3fff && second <= 0x0fff)
  ) return undefined
  return formatIpv6(ipv6)
}

export function validateVpnIps(addresses: Settings['vpnAllowedIps']): VpnIpParseResult {
  if (!Array.isArray(addresses)) return { ips: [], error: VPN_IP_CONFIGURATION_ERROR }
  const ips: string[] = []
  for (const address of addresses) {
    const canonical = typeof address === 'string' ? canonicalPublicIp(address) : undefined
    if (canonical === undefined) {
      const entry = typeof address === 'string' ? address : 'invalid saved address'
      return { ips: [], error: `Enter a public IPv4 or IPv6 address on each line. Invalid address: ${entry}.` }
    }
    if (!ips.includes(canonical)) ips.push(canonical)
  }
  return { ips }
}

export function parseVpnIps(text: string): VpnIpParseResult {
  return validateVpnIps(text.split(/[\r\n]/).map((line) => line.trim()).filter((line) => line !== ''))
}
