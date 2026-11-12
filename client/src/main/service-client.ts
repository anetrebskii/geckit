import { spawn } from 'node:child_process'
import { closeSync, existsSync, fchmodSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { version as bundledVersion } from '../../package.json'
import { askedEndpoint, endpointOnDisk } from '../cli/endpoint'
import { connectRpc, rpcEndpoint } from '../core/rpc'
import { canStartService } from '../core/ownership'
import type { RpcClient, RpcEvent } from '../core/rpc'
import type { ServiceEvents, ServiceMethods } from '../service/application'

type Snapshot = Awaited<ReturnType<ServiceMethods['service:bootstrap']>>

export interface DesktopServiceOptions {
  readonly directory: string
  readonly executable: string
  readonly script: string
  readonly args?: readonly string[]
  readonly env?: NodeJS.ProcessEnv
  readonly version?: string
  readonly onEvent: (event: RpcEvent<ServiceEvents>) => void
  readonly onDisconnect?: (error?: Error) => void
  readonly onConnect?: (snapshot: Snapshot) => void
}

export interface DesktopServiceClient extends Pick<RpcClient<ServiceMethods>, 'call' | 'close'> {
  readonly snapshot: Snapshot
  readonly connected: boolean
  shutdownForUpdate(): Promise<void>
  importConfiguration(text: string): Promise<void>
}

export class ServiceCompatibilityError extends Error {
  override readonly name = 'ServiceCompatibilityError'
  constructor(readonly component: 'protocol' | 'version', readonly actual: string, readonly expected: string) {
    super(`GeckIt service ${component} ${actual} does not match desktop ${component} ${expected}. Stop that service through its CLI, then reopen desktop with the matching GeckIt version.`)
  }
}

const STARTUP_TIMEOUT = 20_000
const LAUNCHED_TIMEOUT = 120_000
const STARTUP_RETRY = 100
const RECONNECT_RETRY = 1_000

export async function connectDesktop(options: DesktopServiceOptions): Promise<DesktopServiceClient> {
  const tokenFile = join(options.directory, 'operator-token')
  const ownerFile = join(options.directory, 'service-owner.json')
  const logFile = join(options.directory, 'service.log')
  let current: RpcClient<ServiceMethods> | undefined
  let snapshot: Snapshot | undefined
  let closed = false
  let retry: NodeJS.Timeout | undefined
  let launchError: Error | undefined
  let launchExit: string | undefined
  let connectionError: Error | undefined
  let launched = false
  let alive = false
  let shutdownPromise: Promise<void> | undefined
  let importing: string | undefined

  const close = (): void => {
    closed = true
    if (retry !== undefined) clearTimeout(retry)
    current?.close()
    current = undefined
  }

  const launch = (): void => {
    mkdirSync(options.directory, { recursive: true, mode: 0o700 })
    const output = openSync(logFile, 'a', 0o600)
    try {
      if (process.platform !== 'win32') fchmodSync(output, 0o600)
      const env = { ...process.env, ...options.env, GECKIT_DATA: options.directory }
      for (const key of ['CODEX_THREAD_ID', 'CLAUDE_CODE_SESSION_ID', 'CLAUDECODE', 'GECKIT_MANAGER_SESSION', 'GECKIT_MANAGER_TOKEN', 'GECKIT_MANAGER_OPERATION']) Reflect.deleteProperty(env, key)
      const child = spawn(options.executable, [options.script, ...options.args ?? [], '--data', options.directory], { env, detached: true, stdio: ['ignore', output, output], windowsHide: true })
      child.once('error', () => { launchError = new Error(`GeckIt service could not start. Check its executable and ${logFile}.`) })
      alive = true
      child.once('exit', (code, signal) => {
        alive = false
        launchExit = `GeckIt service exited before desktop connected (${signal ?? String(code)}). Check ${logFile}.`
        if (process.platform !== 'win32' && current === undefined && !closed) launchError = new Error(launchExit)
      })
      child.unref()
      launched = true
    } finally { closeSync(output) }
  }

  const reconnect = (): void => {
    if (closed || retry !== undefined) return
    retry = setTimeout(() => {
      retry = undefined
      void attach().catch((error: Error) => {
        connectionError = error
        if (error instanceof ServiceCompatibilityError) options.onDisconnect?.(error)
        else reconnect()
      })
    }, RECONNECT_RETRY)
    retry.unref()
  }

  const attach = async (budget = STARTUP_TIMEOUT): Promise<void> => {
    if (closed) return
    const token = readFileSync(tokenFile, 'utf8').trim()
    if (!token) throw new Error('GeckIt service credentials are not ready.')
    const buffered: RpcEvent<ServiceEvents>[] = []
    let delivering = false
    let abandoned = false
    const connecting = connectRpc<ServiceMethods, ServiceEvents>(options.directory, token, (event) => {
      if (delivering) options.onEvent(event)
      else buffered.push(event)
    })
    void connecting.then((connection) => { if (abandoned) connection.close() }, () => undefined)
    let connection: RpcClient<ServiceMethods> | undefined
    let timeout: NodeJS.Timeout | undefined
    try {
      const expired = new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => { abandoned = true; connection?.close(); reject(new Error('GeckIt service did not provide its state in time.')) }, budget) })
      connection = await Promise.race([connecting, expired])
      const greeting = connection.call('desktop:hello').catch((error: Error) => {
        if (error.message === 'Unknown GeckIt service method.') throw new ServiceCompatibilityError('protocol', 'unsupported', '1')
        throw error
      })
      const hello = await Promise.race([greeting, expired])
      if (hello.protocol !== 1) throw new ServiceCompatibilityError('protocol', String(hello.protocol), '1')
      const expected = options.version ?? bundledVersion
      if (hello.version !== expected) throw new ServiceCompatibilityError('version', hello.version, expected)
      const state = await Promise.race([connection.call('service:bootstrap'), expired])
      if (closed) { connection.close(); return }
      snapshot = state
      connectionError = undefined
      current = connection
      const attached = connection
      void attached.closed.then(() => {
        if (current !== attached) return
        current = undefined
        if (!closed) { options.onDisconnect?.(); reconnect() }
      })
      options.onConnect?.(state)
      delivering = true
      for (const event of buffered) options.onEvent(event)
    } catch (error) {
      abandoned = true
      if (current === connection) current = undefined
      connection?.close()
      throw error
    } finally { if (timeout !== undefined) clearTimeout(timeout) }
  }

  const started = Date.now()
  let failure = 'The service is not ready.'
  const budget = (): number => (alive ? LAUNCHED_TIMEOUT : STARTUP_TIMEOUT) - (Date.now() - started)
  while (budget() > 0) {
    try { await attach(Math.max(1, budget())); break }
    catch (error) {
      if (error instanceof ServiceCompatibilityError) { closed = true; throw error }
      failure = error instanceof Error ? error.message : String(error)
      if (launchError !== undefined) throw launchError
      const control = existsSync(rpcEndpoint(options.directory))
      const token = existsSync(tokenFile)
      const legacy = endpointOnDisk() && existsSync(askedEndpoint(options.directory))
      if (legacy && !control && !token) throw new Error('This data directory is owned by a GeckIt version without service control. Quit that instance before starting desktop. No socket was removed.', { cause: error })
      // A competing launcher may win ownership; keep attaching even if our child exits.
      if (!launched && (process.platform === 'win32' || (!control && !token)) && canStartService(options.directory)) launch()
      await new Promise<void>((resolve) => setTimeout(resolve, STARTUP_RETRY))
    }
  }
  if (current === undefined || snapshot === undefined) {
    closed = true
    throw new Error(`Could not connect desktop to the GeckIt service: ${launchExit ?? failure} Check ${logFile} and the process owning ${ownerFile}; verify that it has stopped before removing stale files.`)
  }
  const shutdown = (text?: string): Promise<void> => {
    if (shutdownPromise !== undefined) return importing === text ? shutdownPromise : Promise.reject(new Error('GeckIt is already restarting. Wait for it to reopen, then try again.'))
    const connection = current
    if (closed || connection === undefined) return Promise.reject(new Error(text === undefined ? 'Reconnect the GeckIt service before installing an update.' : 'Reconnect the GeckIt service before importing configuration.'))
    importing = text
    shutdownPromise = (async () => {
      const deadline = Date.now() + 15_000
      const failure = text === undefined ? 'The update was not installed.' : 'The configuration was not imported.'
      let timeout: NodeJS.Timeout | undefined
      try {
        const expired = new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error(`The GeckIt service did not finish shutting down. ${failure}`)), 15_000) })
        await Promise.race([text === undefined ? connection.call('service:shutdownForUpdate') : connection.call('service:importConfiguration', text), expired])
        while (Date.now() < deadline) {
          if (!existsSync(ownerFile) && !existsSync(tokenFile) && (!endpointOnDisk() || !existsSync(rpcEndpoint(options.directory)))) { close(); return }
          await new Promise<void>((resolve) => setTimeout(resolve, STARTUP_RETRY))
        }
        throw new Error(`The GeckIt service did not finish shutting down. ${failure}`)
      } finally { if (timeout !== undefined) clearTimeout(timeout) }
    })().catch((error: Error) => { shutdownPromise = undefined; throw error })
    return shutdownPromise
  }
  const initial = snapshot
  return {
    get snapshot() { return snapshot ?? initial },
    get connected() { return current !== undefined },
    call: (name, ...args) => {
      if (closed || current === undefined) return Promise.reject(connectionError ?? new Error('GeckIt service is disconnected. Wait for reconnection, then try again.'))
      return current.call(name, ...args)
    },
    close,
    shutdownForUpdate: () => shutdown(),
    importConfiguration: (text) => shutdown(text),
  }
}
