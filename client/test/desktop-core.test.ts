import { execFile, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { WebSocket } from 'ws'
import { afterAll, expect, it } from 'vitest'

import { ANYWHERE } from '../src/shared/api'
import type { ChatSession, SessionItem, Settings } from '../src/shared/api'

interface Target { readonly type: string; readonly url: string; readonly webSocketDebuggerUrl: string }
interface CdpReply {
  readonly id?: number
  readonly error?: { readonly message: string }
  readonly result?: {
    readonly result?: { readonly value?: object | string | number | boolean | null; readonly description?: string }
    readonly exceptionDetails?: { readonly text: string; readonly exception?: { readonly description?: string } }
  }
}
interface ObservedEvent { readonly kind: string; readonly value?: string; readonly ids?: readonly string[]; readonly id?: string }

const exec = promisify(execFile)
const client = resolve(import.meta.dirname, '..')
let folder: string | undefined
let data: string
let env: NodeJS.ProcessEnv
let desktop: ChildProcess | undefined
let debuggerSocket: WebSocket | undefined
let output = ''

async function until<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeout = 20_000): Promise<T> {
  const deadline = Date.now() + timeout
  for (;;) {
    const value = await read()
    if (accept(value)) return value
    if (Date.now() >= deadline) throw new Error(`Desktop integration timed out. ${output}`)
    await new Promise<void>((resolve) => setTimeout(resolve, 30))
  }
}

async function port(): Promise<number> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('No debug port was assigned.')
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return address.port
}

async function stopDesktop(): Promise<void> {
  debuggerSocket?.close()
  debuggerSocket = undefined
  if (desktop?.exitCode === null && desktop.signalCode === null) {
    const stopped = once(desktop, 'exit')
    desktop.kill('SIGTERM')
    await stopped
  }
  desktop = undefined
}

async function cli<T>(...args: string[]): Promise<T> {
  const result = await exec(process.execPath, [join(client, 'out', 'service', 'cli.js'), 'service', ...args], { env, cwd: client, timeout: 10_000 })
  return JSON.parse(result.stdout) as T
}

async function startDesktop(): Promise<<T>(expression: string) => Promise<T>> {
  const debugPort = await port()
  const electron = join(client, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
  desktop = spawn(electron, [client, `--remote-debugging-port=${String(debugPort)}`], { cwd: client, env, stdio: ['ignore', 'pipe', 'pipe'] })
  desktop.stdout?.on('data', (part: Buffer) => { output += part.toString() })
  desktop.stderr?.on('data', (part: Buffer) => { output += part.toString() })
  desktop.once('error', (error) => { output += error.message })
  const targets = await until(async () => {
    try { return await (await fetch(`http://127.0.0.1:${String(debugPort)}/json`)).json() as Target[] }
    catch { return [] }
  }, (targets) => targets.some((target) => target.type === 'page' && target.url.includes('/chat.html')))
  const target = targets.find((target) => target.type === 'page' && target.url.includes('/chat.html'))
  if (target === undefined) throw new Error('GeckIt Chat did not open.')
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  debuggerSocket = socket
  const pending = new Map<number, { readonly resolve: (reply: CdpReply) => void; readonly reject: (error: Error) => void }>()
  let id = 0
  socket.on('message', (part) => {
    const reply = JSON.parse(part.toString()) as CdpReply
    if (reply.id === undefined) return
    const request = pending.get(reply.id)
    pending.delete(reply.id)
    request?.resolve(reply)
  })
  socket.on('close', () => { for (const request of pending.values()) request.reject(new Error('Desktop debugger disconnected.')); pending.clear() })
  await once(socket, 'open')
  const evaluate = async <T>(expression: string): Promise<T> => {
    const requestId = ++id
    const reply = await new Promise<CdpReply>((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`Desktop expression timed out: ${expression}`)) }, 10_000)
      pending.set(requestId, { resolve: (value) => { clearTimeout(timer); resolve(value) }, reject: (error) => { clearTimeout(timer); reject(error) } })
      socket.send(JSON.stringify({ id: requestId, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    })
    if (reply.error !== undefined) throw new Error(reply.error.message)
    const failure = reply.result?.exceptionDetails
    if (failure !== undefined) throw new Error(failure.exception?.description ?? failure.text)
    return reply.result?.result?.value as T
  }
  await until(() => evaluate<boolean>('typeof window.geckit?.chat?.send === "function"'), Boolean)
  return evaluate
}

afterAll(async () => {
  await stopDesktop()
  if (folder === undefined) return
  let pid: number | undefined
  try { pid = (JSON.parse(await readFile(join(data, 'service-owner.json'), 'utf8')) as { readonly pid: number }).pid } catch { /* The normal shutdown already removed its owner. */ }
  try { await cli('shutdown') } catch { if (pid !== undefined) { try { process.kill(pid, 'SIGTERM') } catch { /* The service already exited. */ } } }
  if (pid !== undefined) await until(async () => { try { process.kill(pid, 0); return false } catch { return true } }, Boolean)
  await rm(folder, { recursive: true, force: true })
}, 30_000)

it.skipIf(process.platform !== 'darwin' || process.env['GECKIT_DESKTOP_INTEGRATION'] !== '1')('uses the built desktop as a service client and reattaches while its task continues', async () => {
  folder = await mkdtemp(join(tmpdir(), 'geckit-desktop-core-'))
  data = join(folder, 'data')
  const home = join(folder, 'home')
  const project = join(folder, 'project')
  await Promise.all([mkdir(home), mkdir(project), mkdir(data)])
  const plugin = join(data, 'provider-plugins', 'plugin-fixture')
  await cp(join(import.meta.dirname, 'fixtures', 'headless'), plugin, { recursive: true })
  await writeFile(join(plugin, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { id: 'plugin:fixture', family: 'plugin:fixture', name: 'Fixture', shortName: 'Fixture', icon: 'terminal', browser: 'none', loginCommand: '', planName: '' } }))
  await writeFile(join(data, 'settings.json'), JSON.stringify({ projects: [project], chatProviders: ['plugin:fixture'], chatProvider: 'plugin:fixture', vpnIpCheck: false, guideClaude: false, guideCodex: false, workingAtOnce: 0, phone: false, autoUpdate: false, showGecko: false, analyticsAsked: true, analytics: false, sendErrors: false, anywhereOff: Object.keys(ANYWHERE), flashFor: 'never', soundFor: 'never' }))
  env = { ...process.env, GECKIT_DATA: data, GECKIT_VAULT_KEY: Buffer.alloc(32, 23).toString('base64'), HOME: home, CODEX_HOME: join(folder, 'codex'), CLAUDE_CONFIG_DIR: join(folder, 'claude') }
  for (const key of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL', 'CODEX_THREAD_ID', 'CLAUDE_CODE_SESSION_ID', 'CLAUDECODE', 'GECKIT_MANAGER_SESSION', 'GECKIT_MANAGER_TOKEN', 'GECKIT_MANAGER_OPERATION', 'GECKIT_SOURCE_CLI', 'GECKIT_SOURCE_GUIDE', 'GECKIT_SOURCE_CODEX_GUIDE']) delete env[key]
  const evaluate = await startDesktop()
  const owner = JSON.parse(await readFile(join(data, 'service-owner.json'), 'utf8')) as { readonly pid: number }
  expect(owner.pid).not.toBe(desktop?.pid)
  const initial = await evaluate<Settings>('window.geckit.settings.get()')
  expect(initial.projects).toContain(project)
  await evaluate('window.__coreEvents=[]; window.geckit.settings.on(value=>window.__coreEvents.push({kind:"settings",value:value.nativeLanguage})); window.geckit.chat.onSessions(value=>window.__coreEvents.push({kind:"sessions",ids:value.map(one=>one.id)})); window.geckit.chat.onItems(value=>window.__coreEvents.push({kind:"items",id:value.id})); true')
  const changed = await evaluate<Settings>('window.geckit.settings.set({nativeLanguage:"French"})')
  expect(changed.nativeLanguage).toBe('French')
  expect((await cli<Settings>('settings', 'get')).nativeLanguage).toBe('French')
  await until(() => evaluate<ObservedEvent[]>('window.__coreEvents'), (events) => events.some((event) => event.kind === 'settings' && event.value === 'French'))
  expect((await cli<Settings>('call', 'settings:set', '[{"nativeLanguage":"German"}]')).nativeLanguage).toBe('German')
  await until(() => evaluate<ObservedEvent[]>('window.__coreEvents'), (events) => events.some((event) => event.kind === 'settings' && event.value === 'German'))
  expect((await evaluate<Settings>('window.geckit.settings.get()')).nativeLanguage).toBe('German')
  const message = { provider: 'plugin:fixture', root: project, text: 'complete', mode: 'manual' }
  const id = await evaluate<string>(`window.geckit.chat.send(${JSON.stringify(message)})`)
  await until(() => evaluate<SessionItem[]>(`window.geckit.chat.items(${JSON.stringify(id)})`), (items) => items.some((item) => item.kind === 'theirs' && item.text === 'fixture:complete'))
  await until(() => evaluate<ObservedEvent[]>('window.__coreEvents'), (events) => events.some((event) => event.kind === 'sessions' && event.ids?.includes(id) === true) && events.some((event) => event.kind === 'items' && event.id === id))
  expect((await cli<ChatSession[]>('sessions', 'list')).some((session) => session.id === id)).toBe(true)
  const slow = await evaluate<string>(`window.geckit.chat.send(${JSON.stringify({ ...message, text: 'slow' })})`)
  expect((await evaluate<SessionItem[]>(`window.geckit.chat.items(${JSON.stringify(slow)})`)).some((item) => item.kind === 'theirs' && item.text === 'fixture:slow')).toBe(false)
  await stopDesktop()
  expect((await cli<{ readonly pid: number }>('status')).pid).toBe(owner.pid)
  await until(() => cli<SessionItem[]>('sessions', 'items', slow), (items) => items.some((item) => item.kind === 'theirs' && item.text === 'fixture:slow'))
  const reattached = await startDesktop()
  expect((await cli<{ readonly pid: number }>('status')).pid).toBe(owner.pid)
  expect((await reattached<Settings>('window.geckit.settings.get()')).nativeLanguage).toBe('German')
  expect((await reattached<SessionItem[]>(`window.geckit.chat.items(${JSON.stringify(slow)})`)).some((item) => item.kind === 'theirs' && item.text === 'fixture:slow')).toBe(true)
}, 60_000)
