import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, it, vi } from 'vitest'

import { version } from '../package.json'
import { askedEndpoint } from '../src/cli/endpoint'
import { listenRpc, rpcEndpoint } from '../src/core/rpc'
import type { RpcEvent } from '../src/core/rpc'
import { connectDesktop, ServiceCompatibilityError } from '../src/main/service-client'
import type { DesktopServiceClient } from '../src/main/service-client'
import type { ServiceEvents, ServiceMethods } from '../src/service/application'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import { DEFAULT_MANAGER_CONFIG } from '../src/shared/manager'

type Snapshot = Awaited<ReturnType<ServiceMethods['service:bootstrap']>>
const cleanup: (() => void | Promise<void>)[] = []

afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })

function directory(): string {
  const path = mkdtempSync(join(tmpdir(), 'geckit-desktop-client-'))
  cleanup.push(() => { rmSync(path, { recursive: true, force: true }) })
  return path
}

function snapshot(): Snapshot {
  return {
    sessions: [], lineup: { working: 0, limit: 6 }, settings: DEFAULT_SETTINGS,
    employees: { employees: [] }, hosts: [], prompts: [],
    telegram: { state: 'disconnected', pendingLate: 0 }, shares: [], working: [], wanting: 0, watched: undefined,
    manager: { config: DEFAULT_MANAGER_CONFIG, state: 'off', workers: [], activity: [], providers: [], decisions: [], queued: 0 },
    speech: { state: 'absent', received: 0, total: 1 }, home: tmpdir(), platform: process.platform, name: 'Fixture host',
  }
}

function hello(change: Partial<Awaited<ReturnType<ServiceMethods['desktop:hello']>>> = {}): Awaited<ReturnType<ServiceMethods['desktop:hello']>> {
  return { protocol: 1, version, methods: [], migration: { available: false, hosts: [], telegram: false }, ...change }
}

async function attach(path: string, onEvent: (event: RpcEvent<ServiceEvents>) => void = () => undefined, onConnect?: (state: Snapshot) => void, onDisconnect?: () => void): Promise<DesktopServiceClient> {
  const client = await connectDesktop({ directory: path, executable: '/missing-geckit-runtime', script: '/missing-service.js', onEvent, ...(onConnect === undefined ? {} : { onConnect }), ...(onDisconnect === undefined ? {} : { onDisconnect }) })
  cleanup.push(() => { client.close() })
  return client
}

it('attaches to an existing service, publishes bootstrap before buffered events, and leaves the server running on close', async () => {
  const path = directory()
  writeFileSync(join(path, 'operator-token'), 'secret', { mode: 0o600 })
  const initial = snapshot()
  const changed = { ...initial.settings, nativeLanguage: 'French' }
  const order: string[] = []
  const methods = {
    'desktop:hello': () => hello(),
    'service:bootstrap': async () => {
      server.broadcast('settings:changed', changed)
      await new Promise<void>((resolve) => setTimeout(resolve, 20))
      return initial
    },
    'settings:get': () => changed,
  } satisfies Pick<ServiceMethods, 'desktop:hello' | 'service:bootstrap' | 'settings:get'>
  const server = listenRpc<typeof methods, ServiceEvents>(path, 'secret', methods)
  cleanup.push(server.close)
  await server.ready
  const client = await attach(path, (event) => { order.push(event.name) }, (state) => { order.push('bootstrap'); expect(state.settings).toEqual(initial.settings) })
  expect(order).toEqual(['bootstrap', 'settings:changed'])
  expect(client.snapshot.name).toBe('Fixture host')
  expect(await client.call('settings:get')).toEqual(changed)
  client.close()
  expect(client.connected).toBe(false)
  await expect(client.call('settings:get')).rejects.toThrow('disconnected')
  const second = await attach(path)
  expect(second.connected).toBe(true)
})

it('rejects disconnected and uncertain writes, reconnects to fresh credentials, and does not replay mutations', async () => {
  const path = directory()
  const token = join(path, 'operator-token')
  writeFileSync(token, 'first', { mode: 0o600 })
  const initial = snapshot()
  let mutations = 0
  let replayed = 0
  let connections = 0
  let disconnections = 0
  const firstMethods = {
    'desktop:hello': () => hello(),
    'service:bootstrap': () => initial,
    'settings:set': async () => { mutations++; return new Promise<Snapshot['settings']>(() => undefined) },
  }
  const first = listenRpc<typeof firstMethods, ServiceEvents>(path, 'first', firstMethods)
  cleanup.push(first.close)
  await first.ready
  const client = await attach(path, undefined, () => { connections++ }, () => { disconnections++ })
  const pending = client.call('settings:set', { nativeLanguage: 'French' }).then(() => 'unexpected success', (error: Error) => error.message)
  await vi.waitFor(() => expect(mutations).toBe(1))
  await first.close()
  await vi.waitFor(() => expect(disconnections).toBe(1))
  expect(await pending).toMatch(/disconnect|closed/i)
  await expect(client.call('settings:set', { nativeLanguage: 'Spanish' })).rejects.toThrow('disconnected')
  writeFileSync(token, 'second', { mode: 0o600 })
  const next = { ...initial, name: 'Restarted fixture host' }
  const secondMethods = {
    'desktop:hello': () => hello(),
    'service:bootstrap': () => next,
    'settings:set': () => { replayed++; return initial.settings },
  }
  const second = listenRpc<typeof secondMethods, ServiceEvents>(path, 'second', secondMethods)
  cleanup.push(second.close)
  await second.ready
  await vi.waitFor(() => expect(connections).toBe(2), { timeout: 4_000 })
  expect(client.snapshot.name).toBe('Restarted fixture host')
  expect(client.connected).toBe(true)
  expect(replayed).toBe(0)
  expect(mutations).toBe(1)
})

it('preserves a legacy socket without launching or deleting files', async () => {
  if (process.platform === 'win32') return
  const path = directory()
  const legacy = askedEndpoint(path)
  writeFileSync(legacy, 'legacy socket placeholder')
  await expect(attach(path)).rejects.toThrow('without service control')
  expect(readFileSync(legacy, 'utf8')).toBe('legacy socket placeholder')
  expect(existsSync(join(path, 'service.log'))).toBe(false)
})

it.each([
  { component: 'version', greeting: hello({ version: '99.0.0' }) },
  { component: 'protocol', greeting: hello({ protocol: 99 }) },
])('rejects an incompatible service $component before loading or changing state', async ({ component, greeting }) => {
  const path = directory()
  writeFileSync(join(path, 'operator-token'), 'secret', { mode: 0o600 })
  const bootstrap = vi.fn(() => snapshot())
  const methods = { 'desktop:hello': () => greeting, 'service:bootstrap': bootstrap }
  const server = listenRpc<typeof methods, ServiceEvents>(path, 'secret', methods)
  cleanup.push(server.close)
  await server.ready
  await expect(attach(path)).rejects.toMatchObject({ name: 'ServiceCompatibilityError', component })
  expect(bootstrap).not.toHaveBeenCalled()
})

it('reports a service without negotiation support immediately', async () => {
  const path = directory()
  writeFileSync(join(path, 'operator-token'), 'secret', { mode: 0o600 })
  const bootstrap = vi.fn(() => snapshot())
  const methods = { 'service:bootstrap': bootstrap }
  const server = listenRpc<typeof methods, ServiceEvents>(path, 'secret', methods)
  cleanup.push(server.close)
  await server.ready
  await expect(attach(path)).rejects.toBeInstanceOf(ServiceCompatibilityError)
  expect(bootstrap).not.toHaveBeenCalled()
})

it('waits for owner, credentials, and control socket release before allowing an update', async () => {
  const path = directory()
  const ownerFile = join(path, 'service-owner.json')
  const tokenFile = join(path, 'operator-token')
  writeFileSync(ownerFile, 'fixture owner')
  writeFileSync(tokenFile, 'secret', { mode: 0o600 })
  let acknowledged = false
  let released = false
  const methods = {
    'desktop:hello': () => hello(),
    'service:bootstrap': () => snapshot(),
    'service:shutdownForUpdate': () => { acknowledged = true; return { ready: true } },
  }
  const server = listenRpc<typeof methods, ServiceEvents>(path, 'secret', methods, undefined, (method) => {
    if (method !== 'service:shutdownForUpdate') return
    setTimeout(() => {
      void server.close().then(() => {
        rmSync(ownerFile)
        rmSync(tokenFile)
        released = true
      })
    }, 100)
  })
  cleanup.push(server.close)
  await server.ready
  const client = await attach(path)
  let finished = false
  const updating = client.shutdownForUpdate().then(() => { finished = true })
  await vi.waitFor(() => expect(acknowledged).toBe(true), { interval: 5 })
  expect(finished).toBe(false)
  expect(released).toBe(false)
  await updating
  expect(released).toBe(true)
  expect(client.connected).toBe(false)
  await expect(client.call('settings:get')).rejects.toThrow('disconnected')
})

it('preserves the connection when the service refuses an update shutdown', async () => {
  const path = directory()
  writeFileSync(join(path, 'operator-token'), 'secret', { mode: 0o600 })
  const methods = {
    'desktop:hello': () => hello(),
    'service:bootstrap': () => snapshot(),
    'settings:get': () => DEFAULT_SETTINGS,
    'service:shutdownForUpdate': () => { throw new Error('A conversation is still working.') },
  }
  const server = listenRpc<typeof methods, ServiceEvents>(path, 'secret', methods)
  cleanup.push(server.close)
  await server.ready
  const client = await attach(path)
  await expect(client.shutdownForUpdate()).rejects.toThrow('still working')
  expect(client.connected).toBe(true)
  expect(await client.call('settings:get')).toEqual(DEFAULT_SETTINGS)
})

it('launches a detached Node service once, captures private logs, and leaves it alive when desktop disconnects', async () => {
  const path = directory()
  const script = join(path, 'fixture-service.cjs')
  const stateFile = join(path, 'snapshot.json')
  writeFileSync(stateFile, JSON.stringify(snapshot()))
  writeFileSync(script, `
const fs = require('node:fs')
const net = require('node:net')
const v8 = require('node:v8')
const path = require('node:path')
const directory = process.argv[process.argv.indexOf('--data') + 1]
const sockets = new Set()
const endpoint = process.env.GECKIT_FIXTURE_ENDPOINT
const state = JSON.parse(fs.readFileSync(path.join(directory, 'snapshot.json'), 'utf8'))
const send = (socket, message) => { const body = v8.serialize(message); const header = Buffer.alloc(4); header.writeUInt32BE(body.length); socket.write(Buffer.concat([header, body])) }
const server = net.createServer(socket => {
  sockets.add(socket)
  socket.on('close', () => sockets.delete(socket))
  let rest = Buffer.alloc(0)
  socket.on('data', part => {
    rest = Buffer.concat([rest, part])
    while (rest.length >= 4 && rest.length >= rest.readUInt32BE(0) + 4) {
      const length = rest.readUInt32BE(0)
      const message = v8.deserialize(rest.subarray(4, length + 4))
      rest = rest.subarray(length + 4)
      if (message.kind === 'hello' && message.token === 'fixture-token') send(socket, {kind:'accepted'})
      else if (message.kind === 'request') send(socket, {kind:'result',id:message.id,value:message.name === 'desktop:hello' ? ${JSON.stringify(hello())} : message.name === 'service:bootstrap' ? state : state.settings})
    }
  })
})
fs.writeFileSync(path.join(directory, 'operator-token'), 'fixture-token', {mode:0o600})
fs.writeFileSync(path.join(directory, 'fixture.pid'), String(process.pid))
fs.writeFileSync(path.join(directory, 'fixture-args.json'), JSON.stringify(process.argv.slice(2)))
fs.writeFileSync(path.join(directory, 'fixture-env.json'), JSON.stringify(Object.fromEntries(['CODEX_THREAD_ID','CLAUDE_CODE_SESSION_ID','CLAUDECODE','GECKIT_MANAGER_SESSION','GECKIT_MANAGER_TOKEN','GECKIT_MANAGER_OPERATION','ANTHROPIC_API_KEY','OPENAI_API_KEY'].map(key => [key,process.env[key] ?? null]))))
server.listen(endpoint, () => console.log('fixture service listening'))
process.on('SIGTERM', () => { for (const socket of sockets) socket.destroy(); server.close(() => process.exit(0)) })
`)
  const client = await connectDesktop({ directory: path, executable: process.execPath, script, args: ['--app-home', '/fixture app', '--source'], env: { GECKIT_FIXTURE_ENDPOINT: rpcEndpoint(path), CODEX_THREAD_ID: 'parent-thread', CLAUDE_CODE_SESSION_ID: 'parent-claude', CLAUDECODE: '1', GECKIT_MANAGER_SESSION: 'parent-manager', GECKIT_MANAGER_TOKEN: 'parent-token', GECKIT_MANAGER_OPERATION: 'parent-operation', ANTHROPIC_API_KEY: 'explicit-anthropic-auth', OPENAI_API_KEY: 'explicit-openai-auth' }, onEvent: () => undefined })
  cleanup.push(async () => {
    client.close()
    const pid = Number(readFileSync(join(path, 'fixture.pid'), 'utf8'))
    try { process.kill(pid, 'SIGTERM') } catch { return }
    await vi.waitFor(() => { expect(() => process.kill(pid, 0)).toThrow() }, { timeout: 4_000 })
  })
  const pid = Number(readFileSync(join(path, 'fixture.pid'), 'utf8'))
  expect(client.snapshot.name).toBe('Fixture host')
  expect(JSON.parse(readFileSync(join(path, 'fixture-args.json'), 'utf8'))).toEqual(['--app-home', '/fixture app', '--source', '--data', path])
  expect(JSON.parse(readFileSync(join(path, 'fixture-env.json'), 'utf8'))).toEqual({ CODEX_THREAD_ID: null, CLAUDE_CODE_SESSION_ID: null, CLAUDECODE: null, GECKIT_MANAGER_SESSION: null, GECKIT_MANAGER_TOKEN: null, GECKIT_MANAGER_OPERATION: null, ANTHROPIC_API_KEY: 'explicit-anthropic-auth', OPENAI_API_KEY: 'explicit-openai-auth' })
  client.close()
  expect(() => process.kill(pid, 0)).not.toThrow()
  expect(readFileSync(join(path, 'service.log'), 'utf8')).toContain('fixture service listening')
  if (process.platform !== 'win32') expect(statSync(join(path, 'service.log')).mode & 0o777).toBe(0o600)
})
