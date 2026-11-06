import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { connectRpc } from '../core/rpc'
import { defaultDataDirectory } from '../core/platform'
import { requestingSession } from './start'
import type { ServiceEvents, ServiceMethods } from '../service/application'
import QRCode from 'qrcode'
const HELP = `Remote observation (server CLI):
  geckit access enable [--data <directory>]
  geckit pair create [--project <path>]... [--manager] [--qr] [--expires <seconds>s] [--data <directory>]
    Without --project the device sees every registered project.
  geckit pair pending
  geckit pair approve <request-id> --phrase <verification-phrase>
  geckit pair cancel <invitation-id>
  geckit devices list
  geckit devices revoke <device-id>
  geckit access disable
Every command accepts --data <directory>. Start headless: geckit service run --data <directory>.
Connect a client: open Servers and enter the code or scan its QR. No remote task control.`
export const remoteCommand = (what: string | undefined): boolean => what === 'access' || what === 'pair' || what === 'devices'
export async function remoteCli(what: string, args: readonly string[]): Promise<{ readonly ok: boolean; readonly said: string }> {
  if (args.length === 0 || args.includes('--help')) return { ok: true, said: HELP }
  if (requestingSession() !== undefined || process.env['GECKIT_MANAGER_SESSION'] || process.env['CLAUDECODE']) return { ok: false, said: 'Operator access denied.' }
  let client: Awaited<ReturnType<typeof connectRpc<ServiceMethods, ServiceEvents>>> | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const rest = [...args]
    let directory = defaultDataDirectory()
    const take = (flag: string): string | undefined => { const index = rest.indexOf(flag); if (index < 0) return undefined; const value = rest[index + 1]; if (!value || value.startsWith('--')) throw new Error(`Missing ${flag} value.`); rest.splice(index, 2); return value }
    const data = take('--data'); if (data !== undefined) directory = resolve(data)
    const token = readFileSync(join(directory, 'operator-token'), 'utf8').trim()
    const expired = new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('Service did not answer.')), 30_000) })
    const connecting = connectRpc<ServiceMethods, ServiceEvents>(directory, token)
    let abandoned = false
    void connecting.then((one) => { if (abandoned) one.close() }, () => undefined)
    try { client = await Promise.race([connecting, expired]) } catch (error) { abandoned = true; throw error }
    const call = client.call
    let result: object | undefined
    if (what === 'access' && rest[0] === 'enable') { const signal = take('--signal'); if (rest.length !== 1) throw new Error(HELP); result = await call('remote:enable', signal) }
    else if (what === 'access' && rest[0] === 'disable' && rest.length === 1) result = await call('remote:disable')
    else if (what === 'pair' && rest[0] === 'create') {
      const projects: string[] = []; let project = take('--project'); while (project !== undefined) { projects.push(project); project = take('--project') }
      const manager = rest.includes('--manager'); if (manager) rest.splice(rest.indexOf('--manager'), 1)
      const qr = rest.includes('--qr'); if (qr) rest.splice(rest.indexOf('--qr'), 1)
      const expires = take('--expires'); if (expires !== undefined && !/^\d+s$/.test(expires)) throw new Error('Use --expires <seconds>s (maximum 300s).')
      if (rest.length !== 1) throw new Error(HELP)
      const invitation = await call('remote:create', projects, manager, expires === undefined ? undefined : Number(expires.slice(0, -1)) * 1000)
      if (invitation === undefined) throw new Error('Remote access unavailable.')
      return { ok: true, said: `${JSON.stringify(invitation, undefined, 2)}${qr ? `\n${await QRCode.toString(invitation.link, { type: 'terminal', small: true })}` : ''}\nKeep this temporary invitation private. Compare the verification phrase before approving a device.` }
    } else if (what === 'pair' && rest[0] === 'pending' && rest.length === 1) result = await call('remote:pending')
    else if (what === 'pair' && rest[0] === 'approve') { const phrase = take('--phrase'); if (rest.length !== 2 || rest[1] === undefined || phrase === undefined) throw new Error(HELP); result = await call('remote:approve', rest[1], phrase) }
    else if (what === 'pair' && rest[0] === 'cancel' && rest.length === 2 && rest[1] !== undefined) result = await call('remote:cancel', rest[1])
    else if (what === 'devices' && rest[0] === 'list' && rest.length === 1) result = await call('remote:devices')
    else if (what === 'devices' && rest[0] === 'revoke' && rest.length === 2 && rest[1] !== undefined) result = await call('remote:revoke', rest[1])
    else throw new Error(HELP)
    return { ok: true, said: JSON.stringify(result ?? null, undefined, 2) }
  } catch (error) { return { ok: false, said: error instanceof Error ? error.message : String(error) } }
  finally { if (timeout !== undefined) clearTimeout(timeout); client?.close() }
}
