import { resolve } from 'node:path'
import type { connectRpc } from '../core/rpc'
import { defaultDataDirectory } from '../core/platform'
import { requestingSession } from './start'
import type { ServiceEvents, ServiceMethods } from '../service/application'
import { connectService } from './service-start'
import { knownComputers } from './computer'
const HELP = `Connect to this GeckIt server:
  geckit pair
    Starts the service and prints a connection code. Paste it into Connect computer.
  geckit devices list
  geckit devices revoke <device-id>
  geckit access disable
Reach other computers from this one:
  geckit computers
  geckit computers add <code>
    Pairs this GeckIt with another: the code is what geckit pair printed there.
  geckit computers forget <name>
  geckit <any command> --computer <name>
    Runs the command on that computer.
Every command accepts --data <directory>.`
export const remoteCommand = (what: string | undefined): boolean => what === 'access' || what === 'pair' || what === 'devices' || what === 'computers'
export async function remoteCli(what: string, args: readonly string[]): Promise<{ readonly ok: boolean; readonly said: string }> {
  if (what === 'computers' && (args.length === 0 || args[0] === 'list')) { const known = knownComputers(); return { ok: true, said: known.length === 0 ? 'No computer is paired with this one. The person pairs one with geckit computers add <code>, the code geckit pair prints there.' : known.map((one) => `${one.name.padEnd(30)} ${one.id}`).join('\n') } }
  if ((args.length === 0 && what !== 'pair') || args.includes('--help')) return { ok: true, said: HELP }
  if (requestingSession() !== undefined || process.env['GECKIT_MANAGER_SESSION'] || process.env['CLAUDECODE']) return { ok: false, said: 'Operator access denied.' }
  let client: Awaited<ReturnType<typeof connectRpc<ServiceMethods, ServiceEvents>>> | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const rest = [...args]
    let directory = defaultDataDirectory()
    const take = (flag: string): string | undefined => { const index = rest.indexOf(flag); if (index < 0) return undefined; const value = rest[index + 1]; if (!value || value.startsWith('--')) throw new Error(`Missing ${flag} value.`); rest.splice(index, 2); return value }
    const data = take('--data'); if (data !== undefined) directory = resolve(data)
    const pairing = what === 'pair' && (rest.length === 0 || rest[0] === 'create')
    const expired = new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('Service did not answer.')), 35_000) })
    const connecting = connectService(directory, pairing)
    let abandoned = false
    void connecting.then((one) => { if (abandoned) one.close() }, () => undefined)
    try { client = await Promise.race([connecting, expired]) } catch (error) { abandoned = true; throw error }
    const call = client.call
    let result: object | undefined
    if (what === 'access' && rest[0] === 'enable') { const signal = take('--signal'); if (rest.length !== 1) throw new Error(HELP); result = await call('remote:enable', signal) }
    else if (what === 'access' && rest[0] === 'disable' && rest.length === 1) result = await call('remote:disable')
    else if (pairing) {
      if (rest[0] === 'create') rest.shift()
      const qr = rest.indexOf('--qr'); if (qr >= 0) rest.splice(qr, 1)
      if (rest.length !== 0) throw new Error('Use geckit pair. No project selection or extra flags are needed.')
      const invitation = await call('remote:pair')
      return { ok: true, said: invitation.code }
    } else if (what === 'pair' && rest[0] === 'pending' && rest.length === 1) result = await call('remote:pending')
    else if (what === 'pair' && rest[0] === 'approve') { const phrase = take('--phrase'); if (rest.length !== 2 || rest[1] === undefined || phrase === undefined) throw new Error(HELP); result = await call('remote:approve', rest[1], phrase) }
    else if (what === 'pair' && rest[0] === 'cancel' && rest.length === 2 && rest[1] !== undefined) result = await call('remote:cancel', rest[1])
    else if (what === 'devices' && rest[0] === 'list' && rest.length === 1) result = await call('remote:devices')
    else if (what === 'devices' && rest[0] === 'revoke' && rest.length === 2 && rest[1] !== undefined) result = await call('remote:revoke', rest[1])
    else if (what === 'computers' && rest[0] === 'add' && rest.length === 2 && rest[1] !== undefined) { const added = await call('computers:add', rest[1]); return { ok: true, said: `Paired with ${added.name}. Run a command there with --computer ${added.name}.` } }
    else if (what === 'computers' && rest[0] === 'forget' && rest.length === 2 && rest[1] !== undefined) result = await call('computers:forget', rest[1])
    else throw new Error(HELP)
    return { ok: true, said: JSON.stringify(result ?? null, undefined, 2) }
  } catch (error) { return { ok: false, said: error instanceof Error ? error.message : String(error) } }
  finally { if (timeout !== undefined) clearTimeout(timeout); client?.close() }
}
