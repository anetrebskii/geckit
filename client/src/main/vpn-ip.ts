import { get } from 'node:https'
import { isIPv4 } from 'node:net'
import { networkInterfaces } from 'node:os'

import log from 'electron-log'

import type { Settings } from '../shared/api'
import { canonicalPublicIp, validateVpnIps, VPN_IP_CONFIGURATION_ERROR, VPN_IP_UNAVAILABLE_ERROR, vpnIpMismatchError } from '../shared/vpn-ip'

export type VpnIpFamily = 4 | 6
export interface VpnIpDependencies {
  readonly families: () => readonly VpnIpFamily[]
  readonly probe: (family: VpnIpFamily, signal: AbortSignal, endpoint: string) => Promise<string>
  readonly diagnostic: (entry: VpnIpDiagnostic) => void
}

const TIMEOUT = 10_000
const ATTEMPT_TIMEOUT = 3_000

interface VpnIpAttempt {
  readonly family: VpnIpFamily
  readonly endpoint: string
  readonly attempt: number
  readonly elapsedMs: number
}

export type VpnIpDiagnostic = VpnIpAttempt & (
  { readonly outcome: 'failed'; readonly error: string; readonly code?: NodeJS.ErrnoException['code'] } |
  { readonly outcome: 'recovered' | 'mismatch'; readonly ip: string }
) | { readonly outcome: 'unavailable'; readonly elapsedMs: number; readonly error: string }

function writeDiagnostic(entry: VpnIpDiagnostic): void {
  if (entry.outcome === 'recovered') log.info('VPN IP check', entry)
  else log.warn('VPN IP check', entry)
}

function usableFamilies(): readonly VpnIpFamily[] {
  const families = new Set<VpnIpFamily>()
  for (const interfaces of Object.values(networkInterfaces())) {
    for (const network of interfaces ?? []) {
      if (network.internal) continue
      if (network.family === 'IPv4' && isIPv4(network.address) && !/^(0\.|127\.|169\.254\.)/.test(network.address)) families.add(4)
      if (network.family === 'IPv6' && canonicalPublicIp(network.address) !== undefined) families.add(6)
    }
  }
  return [...families].sort()
}

function probeIp(family: VpnIpFamily, signal: AbortSignal, endpoint: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = get(endpoint, { family, signal, timeout: ATTEMPT_TIMEOUT }, (response) => {
      if (response.statusCode !== 200) {
        response.resume()
        request.destroy(new Error(`Public IP lookup returned HTTP ${String(response.statusCode)}`))
        return
      }
      response.setEncoding('utf8')
      let body = ''
      let bytes = 0
      response.on('data', (chunk: string) => {
        bytes += Buffer.byteLength(chunk)
        if (bytes > 128) request.destroy(new Error('Public IP lookup returned more than 128 bytes'))
        else body += chunk
      })
      response.on('error', reject)
      response.on('aborted', () => reject(new Error('Public IP lookup response aborted')))
      response.on('end', () => resolve(body.trim()))
    })
    request.on('error', reject)
    request.on('timeout', () => request.destroy(new Error('Public IP lookup timed out')))
  })
}

export async function checkVpnIp(settings: () => Pick<Settings, 'vpnIpCheck' | 'vpnAllowedIps'>, dependencies: Partial<VpnIpDependencies> = {}): Promise<void> {
  if (settings().vpnIpCheck === false) return
  const { families = usableFamilies, probe = probeIp, diagnostic = writeDiagnostic } = dependencies
  const checking = new AbortController()
  const started = Date.now()
  const deadline = started + TIMEOUT
  const report = (entry: VpnIpDiagnostic): void => {
    try { diagnostic(entry) } catch { /* Diagnostics cannot change the verification result. */ }
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      checking.abort()
      reject(new Error(VPN_IP_UNAVAILABLE_ERROR))
    }, TIMEOUT)
  })
  const verify = async (): Promise<void> => {
    while (true) {
      const policy = settings()
      if (policy.vpnIpCheck === false) return
      if (checking.signal.aborted || Date.now() >= deadline) throw new Error(VPN_IP_UNAVAILABLE_ERROR)
      const allowed = validateVpnIps(policy.vpnAllowedIps)
      if (allowed.error !== undefined || allowed.ips.length === 0) throw new Error(VPN_IP_CONFIGURATION_ERROR)
      const required = [...new Set(families())].sort()
      if (required.length === 0) throw new Error(VPN_IP_UNAVAILABLE_ERROR)
      const results = await Promise.all(required.map(async (family) => {
        const endpoints = family === 4
          ? ['https://api.ipify.org/', 'https://checkip.amazonaws.com/', 'https://api.ipify.org/']
          : ['https://api6.ipify.org/', 'https://icanhazip.com/', 'https://api6.ipify.org/']
        for (const [index, endpoint] of endpoints.entries()) {
          if (settings().vpnIpCheck === false || checking.signal.aborted || Date.now() >= deadline) break
          const attempt = new AbortController()
          const signal = AbortSignal.any([checking.signal, attempt.signal])
          const aborted = new Promise<never>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason instanceof Error ? signal.reason : new Error('Public IP lookup cancelled')), { once: true })
          })
          const timeout = setTimeout(() => attempt.abort(new Error('Public IP lookup timed out')), Math.min(ATTEMPT_TIMEOUT, deadline - Date.now()))
          let address: string | undefined
          try {
            address = canonicalPublicIp(await Promise.race([Promise.resolve().then(() => probe(family, signal, endpoint)), aborted]))
            if (address === undefined || (family === 4) !== isIPv4(address)) throw new Error('Public IP lookup returned an invalid or wrong-family address')
          } catch (error) {
            if (settings().vpnIpCheck !== false && !checking.signal.aborted) {
              const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined
              report({ outcome: 'failed', family, endpoint, attempt: index + 1, elapsedMs: Date.now() - started, error: error instanceof Error ? error.message.slice(0, 512) : 'Public IP lookup failed', ...(code === undefined ? {} : { code }) })
            }
            continue
          } finally {
            clearTimeout(timeout)
            attempt.abort()
          }
          const current = settings()
          if (current.vpnIpCheck === false || checking.signal.aborted || Date.now() >= deadline) break
          const latest = validateVpnIps(current.vpnAllowedIps)
          if (latest.error === undefined && latest.ips.join('\n') === allowed.ips.join('\n') && required.join(',') === [...new Set(families())].sort().join(',') && !latest.ips.includes(address)) {
            report({ outcome: 'mismatch', family, endpoint, attempt: index + 1, elapsedMs: Date.now() - started, ip: address })
            throw new Error(vpnIpMismatchError(address))
          }
          if (index > 0) report({ outcome: 'recovered', family, endpoint, attempt: index + 1, elapsedMs: Date.now() - started, ip: address })
          return { family, address }
        }
        return { family, address: undefined }
      }))
      const current = settings()
      if (current.vpnIpCheck === false) return
      const latest = validateVpnIps(current.vpnAllowedIps)
      if (latest.error !== undefined || latest.ips.length === 0) throw new Error(VPN_IP_CONFIGURATION_ERROR)
      if (allowed.ips.join('\n') !== latest.ips.join('\n') || required.join(',') !== [...new Set(families())].sort().join(',')) continue
      for (const { family, address } of results) {
        if (address === undefined || (family === 4) !== isIPv4(address)) throw new Error(VPN_IP_UNAVAILABLE_ERROR)
        if (!latest.ips.includes(address)) throw new Error(vpnIpMismatchError(address))
      }
      return
    }
  }
  try {
    await Promise.race([verify(), expired])
  } catch (error) {
    if (error instanceof Error && error.message === VPN_IP_UNAVAILABLE_ERROR) report({ outcome: 'unavailable', elapsedMs: Date.now() - started, error: Date.now() >= deadline ? 'Public IP verification deadline exceeded' : 'Required public IP verification exhausted' })
    if (error instanceof Error && error.message.startsWith('Not sent.')) throw error
    throw new Error(VPN_IP_UNAVAILABLE_ERROR)
  } finally {
    clearTimeout(timer)
    checking.abort()
  }
}
