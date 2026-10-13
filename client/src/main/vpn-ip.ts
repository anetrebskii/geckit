import { get } from 'node:https'
import { isIPv4 } from 'node:net'
import { networkInterfaces } from 'node:os'

import type { Settings } from '../shared/api'
import { canonicalPublicIp, validateVpnIps, VPN_IP_CONFIGURATION_ERROR, VPN_IP_UNAVAILABLE_ERROR, vpnIpMismatchError } from '../shared/vpn-ip'

export type VpnIpFamily = 4 | 6
export interface VpnIpDependencies {
  readonly families: () => readonly VpnIpFamily[]
  readonly probe: (family: VpnIpFamily, signal: AbortSignal) => Promise<string>
}

const TIMEOUT = 10_000

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

function probeIp(family: VpnIpFamily, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = get(family === 4 ? 'https://api.ipify.org/' : 'https://api6.ipify.org/', { family, signal, timeout: TIMEOUT }, (response) => {
      if (response.statusCode !== 200) {
        response.resume()
        request.destroy(new Error(VPN_IP_UNAVAILABLE_ERROR))
        return
      }
      response.setEncoding('utf8')
      let body = ''
      let bytes = 0
      response.on('data', (chunk: string) => {
        bytes += Buffer.byteLength(chunk)
        if (bytes > 128) request.destroy(new Error(VPN_IP_UNAVAILABLE_ERROR))
        else body += chunk
      })
      response.on('error', reject)
      response.on('aborted', () => reject(new Error(VPN_IP_UNAVAILABLE_ERROR)))
      response.on('end', () => resolve(body.trim()))
    })
    request.on('error', reject)
    request.on('timeout', () => request.destroy(new Error(VPN_IP_UNAVAILABLE_ERROR)))
  })
}

export async function checkVpnIp(settings: () => Pick<Settings, 'vpnIpCheck' | 'vpnAllowedIps'>, dependencies: Partial<VpnIpDependencies> = {}): Promise<void> {
  if (settings().vpnIpCheck === false) return
  const { families = usableFamilies, probe = probeIp } = dependencies
  const checking = new AbortController()
  const deadline = Date.now() + TIMEOUT
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
        try {
          const address = canonicalPublicIp(await probe(family, checking.signal))
          return { family, address }
        } catch {
          return { family, address: undefined }
        }
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
    if (error instanceof Error && error.message.startsWith('Not sent.')) throw error
    throw new Error(VPN_IP_UNAVAILABLE_ERROR)
  } finally {
    clearTimeout(timer)
    checking.abort()
  }
}
