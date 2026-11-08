import { remoteAccess } from './remote/access'
import { remoteComputers } from './remote/computers'
import type { RemoteComputers } from './remote/computers'
import { setLiveServer } from '../cli/live-view'
import type { RemoteAccess } from './remote/access'
import { randomBytes } from 'node:crypto'
import { rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

import log from 'electron-log'

import { serviceHandler } from '../core/operator'
import { ownDataDirectory } from '../core/ownership'
import { applyConfigurationImport } from '../core/configuration-transfer'
import { configureCorePlatform, defaultDataDirectory } from '../core/platform'
import { createRuntime } from '../core/runtime'
import { application } from '../core/application'
import { serveLocal } from '../core/socket'
import { listenRpc } from '../core/rpc'
import type { RpcServer } from '../core/rpc'
import { nativeRequests, serviceApplication, serviceSecurity } from './application'
import type { ServiceEvents, ServiceMethods } from './application'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const usage = 'node service.js [--data <directory>] [--source] [--app-home <directory>]'
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) { console.log(usage); return }
  let directory = defaultDataDirectory()
  let source = false
  let appHome: string | undefined
  const seen = new Set<string>()
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]
    if (flag === undefined || seen.has(flag)) throw new Error(`Use ${usage}.`)
    seen.add(flag)
    if (flag === '--source') { source = true; continue }
    const value = args[++index]
    if ((flag !== '--data' && flag !== '--app-home') || !value || value.startsWith('--')) throw new Error(`Use ${usage}.`)
    if (flag === '--data') directory = resolve(value)
    else appHome = resolve(value)
  }
  const script = join(import.meta.dirname, 'cli.js')
  let rpc: RpcServer<ServiceEvents> | undefined
  const native = nativeRequests((id, path) => { if (rpc === undefined || rpc.connections === 0) return false; rpc.broadcast('core:trash', id, path); return true })
  const fromSource = appHome === undefined || source
  configureCorePlatform({ directory: () => directory, source: () => fromSource, headless: appHome === undefined, command: () => appHome === undefined ? join(directory, 'bin', 'geckit') : join(homedir(), '.geckit', 'bin', source ? 'geckit-local' : 'geckit'), launcher: () => ({ executable: process.execPath, script }), trash: native.trash })
  process.env['GECKIT_DATA'] = directory
  if (appHome !== undefined) process.env['GECKIT_APP_HOME'] = appHome
  log.transports.file.level = false
  const release = ownDataDirectory(directory)
  const tokenPath = join(directory, 'operator-token')
  const token = randomBytes(32).toString('hex')
  let runtime: Awaited<ReturnType<typeof createRuntime>> | undefined
  let listener: ReturnType<typeof serveLocal> | undefined
  let activation: Promise<void> | undefined
  let unsubscribe: (() => void) | undefined
  let remote: RemoteAccess | undefined
  let computers: RemoteComputers | undefined
  let stopComputers: (() => void) | undefined
  let stopping: Promise<void> | undefined
  const stop = (): Promise<void> => stopping ??= (async () => {
    remote?.dispose()
    stopComputers?.()
    computers?.dispose()
    native.dispose()
    unsubscribe?.()
    try { await Promise.all([listener?.close(), rpc?.close()]); await activation }
    finally { try { await runtime?.dispose() } finally { rmSync(tokenPath, { force: true }); release() } }
  })()
  let started = false
  let requested = false
  const shutdown = (): void => { requested = true; if (!started) return; void stop().then(() => { console.log('GeckIt service stopped.') }, (error: Error) => { console.error(error.message); process.exitCode = 1 }) }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
  try {
    applyConfigurationImport(directory)
    const security = serviceSecurity(directory)
    delete process.env['GECKIT_VAULT_KEY']
    runtime = await createRuntime(script, { vault: security.vault, secrets: security.secrets })
    rmSync(tokenPath, { force: true })
    writeFileSync(tokenPath, token, { mode: 0o600, flag: 'wx' })
    remote = await remoteAccess(runtime, directory, security, application(runtime))
    const access = remote
    setLiveServer(() => access.server())
    computers = remoteComputers(directory, security)
    const paired = computers
    const targetRuntime = runtime
    runtime.setCliTargets({ local: (args) => application(targetRuntime)['cli:product'](args, 'manager'), registry: (args) => {
      const [domain, command, id, ...rest] = args
      if (rest.length > 0) throw new Error('Unsupported registry arguments.')
      if (domain === 'computers' && command === 'list' && id === undefined) return JSON.stringify(paired.list())
      if (domain === 'computers' && command === 'forget' && id !== undefined) return JSON.stringify(paired.forget(id))
      if (domain === 'devices' && command === 'list' && id === undefined) return JSON.stringify(access.devices())
      if (domain === 'devices' && command === 'revoke' && id !== undefined) return JSON.stringify(access.revoke(id) ?? null)
      if (domain === 'access' && command === 'status' && id === undefined) return JSON.stringify({ reachable: access.server() !== undefined })
      if (domain === 'access' && command === 'disable' && id === undefined) return JSON.stringify(access.disable())
      throw new Error('Pairing and authentication require the user on the target; registry supports list/forget, devices list/revoke, access status/disable.')
    }, run: (name, args, authorized) => paired.product(name, args, authorized, 'manager'), list: () => paired.list() })
    stopComputers = computers.serve()
    listener = serveLocal(directory, serviceHandler(runtime, token, shutdown))
    rpc = listenRpc<ServiceMethods, ServiceEvents>(directory, token, serviceApplication(runtime, directory, security, native, remote, computers), undefined, (method) => {
      if ((method === 'service:shutdownForUpdate' || method === 'service:importConfiguration') && runtime?.sessions.working().length === 0) shutdown()
    })
    unsubscribe = runtime.subscribe((event) => {
      if (event.name === 'core:terminal' && rpc?.connections === 0) {
        const status = event.args[2]
        if (status !== undefined) { try { writeFileSync(status, '1') } catch (error) { console.error(error) } }
        console.warn('Open GeckIt desktop to use a terminal.')
        return
      }
      rpc?.broadcast(event.name, ...event.args)
    })
    await Promise.all([listener.ready, rpc.ready])
    started = true
    if (requested) shutdown()
    else { activation = runtime.start(); await activation; if (!requested) console.log(`GeckIt service ready. ${directory}`) }
  } catch (error) { await stop(); throw error }
}

void main().catch((error: Error) => { console.error(error); process.exitCode = 1 })
