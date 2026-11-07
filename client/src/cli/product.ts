import { readFileSync } from 'node:fs'
import { withFiles } from './employees'
import { requestingSession } from './start'
import { connectService } from './service-start'
import { RpcDisconnectedError } from '../core/rpc'

export async function product(args: readonly string[], directory: string, host?: string): Promise<{ readonly ok: boolean; readonly said: string }> {
  if ((requestingSession() !== undefined || process.env['GECKIT_MANAGER_SESSION'] || process.env['CLAUDECODE']) && !(args[0] === 'sessions' && ['list', 'show'].includes(args[1] ?? ''))) return { ok: false, said: 'Operator access denied. Use authenticated Manager commands for product changes; native permissions remain user-controlled.' }
  let client: Awaited<ReturnType<typeof connectService>> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let dispatched = false
  let abandoned = false
  try {
    if (args[0] === 'employees') args = [args[0], ...withFiles(args.slice(1), (file) => readFileSync(file === '-' ? 0 : file, 'utf8'))]
    if (args.includes('--help') || args[0] === 'help') args = ['capabilities']
    const expired = new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error(dispatched ? 'Delivery is uncertain: source RPC timed out after dispatch. Read target state before retrying.' : 'Source service did not answer. No product command was dispatched.')), 145_000) })
    const connecting = connectService(directory, false)
    void connecting.then((one) => { if (abandoned) one.close() }, () => undefined)
    client = await Promise.race([connecting, expired])
    const hello = await Promise.race([client.call('desktop:hello'), expired])
    const method = host === undefined ? 'cli:product' : 'computers:product'
    if (!hello.methods.includes(method)) throw new Error('This GeckIt does not support product CLI commands. Update it after active work finishes.')
    dispatched = true
    const said = await Promise.race([host === undefined ? client.call('cli:product', args) : client.call('computers:product', host, args), expired])
    return { ok: true, said }
  } catch (error) { return { ok: false, said: dispatched && error instanceof RpcDisconnectedError ? 'Delivery is uncertain: source RPC disconnected after dispatch. Read target state before retrying.' : error instanceof Error ? error.message : String(error) } }
  finally { abandoned = true; if (timer !== undefined) clearTimeout(timer); client?.close() }
}
