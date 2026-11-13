import { execFile, spawn } from 'node:child_process'
import type { ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { connect, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { afterAll, beforeAll, expect, it } from 'vitest'

import type { ChatSession, SessionItem, SessionMessage, Shortcut } from '../src/shared/api'
import type { OperatorAnswered, ServiceAsked } from '../src/core/operator'
import type { EmployeesView } from '../src/shared/employees'
import type { ManagerView } from '../src/shared/manager'
import type { ChannelsView } from '../src/shared/channels'
import { askedEndpoint } from '../src/cli/endpoint'
import { connectRpc } from '../src/core/rpc'
import { parseConfiguration } from '../src/core/configuration'
import type { ServiceEvents, ServiceMethods } from '../src/service/application'

const exec = promisify(execFile)
const client = resolve(import.meta.dirname, '..')
let folder: string
let directory: string
let project: string
let env: NodeJS.ProcessEnv
let running: ChildProcess | undefined
let output = ''

async function eventually<T>(read: () => Promise<T>, check: (value: T) => boolean, timeout = 8_000): Promise<T> {
  const until = Date.now() + timeout
  for (;;) {
    const value = await read()
    if (check(value)) return value
    if (Date.now() > until) throw new Error(`Timed out. Service output: ${output}`)
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
}

async function start(): Promise<void> {
  output = ''
  running = spawn(process.execPath, ['--import', join(import.meta.dirname, 'fixtures', 'headless', 'stall-fetch.mjs'), join(folder, 'service', 'service.js'), '--data', directory], { cwd: client, env, stdio: ['ignore', 'pipe', 'pipe'] })
  running.stdout?.on('data', (part: Buffer) => { output += part.toString() })
  running.stderr?.on('data', (part: Buffer) => { output += part.toString() })
  await eventually(async () => output, (value) => value.includes('GeckIt service ready.'))
}

async function cli(...args: string[]): Promise<string> {
  try {
    const result = await exec(process.execPath, [join(folder, 'service', 'cli.js'), 'service', ...args], { cwd: client, env, timeout: 10_000 })
    return result.stdout.trim()
  } catch (error) {
    if (error instanceof Error && 'stdout' in error) throw new Error(`${String(error.stdout)}\n${output}`, { cause: error })
    throw error
  }
}

async function read<T>(...args: string[]): Promise<T> { return JSON.parse(await cli(...args)) as T }
async function items(id: string): Promise<SessionItem[]> { return read('sessions', 'items', id) }
async function send(text: string): Promise<string> {
  const message: SessionMessage = { provider: 'plugin:fixture', root: project, text, mode: 'manual' }
  return (await read<{ readonly id: string }>('sessions', 'start', JSON.stringify(message))).id
}

async function raw(ask: ServiceAsked): Promise<OperatorAnswered> {
  return new Promise((resolve, reject) => {
    const socket = connect(askedEndpoint(directory))
    let text = ''
    socket.setEncoding('utf8')
    socket.once('error', reject)
    socket.once('connect', () => socket.write(`${JSON.stringify(ask)}\n`))
    socket.on('data', (part: string) => { text += part; if (text.includes('\n')) { socket.destroy(); resolve(JSON.parse(text) as OperatorAnswered) } })
  })
}

beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'geckit-headless-'))
  await exec(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'service.vite.config.ts', '--outDir', join(folder, 'service')], { cwd: client, timeout: 30_000 })
  directory = join(folder, 'data')
  project = join(folder, 'project')
  await mkdir(project)
  await mkdir(join(folder, 'home'))
  const plugin = join(directory, 'provider-plugins', 'plugin-fixture')
  await cp(join(import.meta.dirname, 'fixtures', 'headless'), plugin, { recursive: true })
  await writeFile(join(plugin, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { id: 'plugin:fixture', family: 'plugin:fixture', name: 'Fixture', shortName: 'Fixture', icon: 'terminal', browser: 'none', loginCommand: '', planName: '' } }))
  const channel = join(directory, 'channel-libraries', 'channel-probe')
  await mkdir(channel, { recursive: true })
  await writeFile(join(channel, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, kind: 'channel', entry: 'index.mjs', channel: { id: 'channel:probe', name: 'Probe', icon: 'chat' }, config: [{ key: 'token', label: 'Token', type: 'secret', required: true }] }))
  await writeFile(join(channel, 'index.mjs'), `export function create(context) {
  return {
    start: async () => {
      const id = await context.conversations.start({ root: context.projects()[0].root, text: 'complete', provider: 'plugin:fixture', mode: 'manual' })
      context.conversations.watch(id, (event) => { if (event.kind === 'items') for (const item of event.items) if (item.kind === 'theirs') context.store.set('heard', item.text) })
      context.status('connected', context.secret('token') === 'probe-secret' ? 'token ok' : 'token missing')
    },
    stop: async () => undefined,
  }
}`)
  await writeFile(join(directory, 'settings.json'), JSON.stringify({ chatProviders: ['plugin:fixture'], chatProvider: 'plugin:fixture', vpnIpCheck: false, guideClaude: false, guideCodex: false, workingAtOnce: 0 }))
  env = { ...process.env, GECKIT_DATA: directory, GECKIT_VAULT_KEY: Buffer.alloc(32, 13).toString('base64'), GECKIT_LLAMA_SERVER: process.execPath, HOME: join(folder, 'home'), CODEX_HOME: join(folder, 'codex'), CLAUDE_CONFIG_DIR: join(folder, 'claude') }
  for (const key of ['DISPLAY', 'CODEX_THREAD_ID', 'CLAUDE_CODE_SESSION_ID', 'GECKIT_MANAGER_SESSION', 'GECKIT_MANAGER_TOKEN', 'GECKIT_MANAGER_OPERATION', 'CLAUDECODE', 'GECKIT_SOURCE_CLI', 'GECKIT_SOURCE_GUIDE', 'GECKIT_SOURCE_CODEX_GUIDE']) delete env[key]
  await start()
  await cli('projects', 'add', project)
}, 30_000)

afterAll(async () => {
  if (running?.exitCode === null && running.signalCode === null) { const closed = once(running, 'exit'); running.kill('SIGTERM'); await closed }
  if (folder !== undefined) await rm(folder, { recursive: true, force: true })
}, 20_000)

it('runs without display or Electron, rejects competitors and private-socket callers', async () => {
  expect(await read<{ readonly state: string }>('status')).toMatchObject({ state: 'ready' })
  expect((await stat(join(directory, 'operator-token'))).mode & 0o777).toBe(0o600)
  if (process.platform !== 'win32') expect((await stat(askedEndpoint(directory))).mode & 0o777).toBe(0o600)
  await expect(exec(process.execPath, [join(folder, 'service', 'service.js'), '--data', directory], { cwd: client, env, timeout: 5_000 })).rejects.toThrow('already running')
  expect(await raw({ action: 'operator', args: ['shutdown'], token: 'wrong' })).toEqual({ ok: false, error: 'Operator access denied.' })
  await expect(exec(process.execPath, [join(folder, 'service', 'cli.js'), 'service', 'status'], { cwd: client, env: { ...env, CODEX_THREAD_ID: 'agent' } })).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('Operator access denied.') })
  expect(await cli('projects', 'add', project)).toContain(project)
  const id = await send('complete')
  await eventually(() => items(id), (all) => all.some((one) => one.kind === 'theirs' && one.text === 'fixture:complete'))
}, 20_000)

it('applies agent settings and shortcuts through real CLI/handlers without approval, persists and runs the changed prompt', async () => {
  const agent = async (...args: string[]): Promise<string> => (await exec(process.execPath, [join(folder, 'service', 'cli.js'), ...args], { cwd: client, env: { ...env, CODEX_THREAD_ID: 'isolated-agent' }, timeout: 5_000 })).stdout.trim()
  expect(JSON.parse(await agent('settings', 'schema'))).toHaveProperty('fields.theme')
  await agent('settings', 'edit', '--patch', JSON.stringify({ theme: 'dark', workingAtOnce: 3, phrases: ['Preserve this'] }))
  expect(JSON.parse(await agent('settings', 'show'))).toMatchObject({ theme: 'dark', workingAtOnce: 3, phrases: ['Preserve this'] })
  expect(parseConfiguration(await readFile(join(directory, 'settings.json'), 'utf8')).general).toMatchObject({ theme: 'dark', workingAtOnce: 3 })
  const before = await readFile(join(directory, 'settings.json'), 'utf8')
  for (const patch of [{ theme: 'blue' }, { workingAtOnce: -1 }, { chatProvider: 'codex' }, { chatProviders: ['codex'] }, { theme: 'light', workingAtOnce: -1 }]) {
    await expect(agent('settings', 'edit', '--patch', JSON.stringify(patch))).rejects.toMatchObject({ code: 1 })
    expect(await readFile(join(directory, 'settings.json'), 'utf8')).toBe(before)
  }
  await expect(agent('settings', 'edit', '--patch', '{"theme":"light"}', '--expected', '{"theme":"system"}')).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('changed') })
  await agent('employees', 'shortcut', 'add', 'none', '--name', 'Agent shortcut', '--project', 'project', '--prompt', 'before', '--provider', 'plugin:fixture', '--cron', '0 10 * * *', '--start-window-minutes', '15')
  const list = async (): Promise<Shortcut[]> => JSON.parse(await agent('employees', 'shortcuts', '--json')) as Shortcut[]
  const shortcut = (await list()).find((one) => one.name === 'Agent shortcut')
  if (shortcut === undefined) throw new Error('Shortcut missing')
  await agent('employees', 'shortcut', 'edit', shortcut.id, '--prompt', 'applied-agent-shortcut')
  await agent('employees', 'shortcut', 'pause', shortcut.id)
  expect((await list()).find((one) => one.id === shortcut.id)).toMatchObject({ on: false, cron: '0 10 * * *', startWindowMinutes: 15 })
  await agent('employees', 'shortcut', 'resume', shortcut.id)
  await expect(agent('employees', 'shortcut', 'edit', shortcut.id, '--cron', 'bad')).rejects.toMatchObject({ code: 1, stdout: expect.stringContaining('cron') })
  expect((await list()).find((one) => one.id === shortcut.id)).toMatchObject({ prompt: 'applied-agent-shortcut', on: true, cron: '0 10 * * *' })
  await agent('employees', 'shortcut', 'run', shortcut.id)
  const ran = (await list()).find((one) => one.id === shortcut.id)
  await eventually(() => items(ran?.lastSession ?? ''), (all) => all.some((one) => one.kind === 'theirs' && one.text === 'fixture:applied-agent-shortcut'))
  const stored = parseConfiguration(await readFile(join(directory, 'settings.json'), 'utf8'))
  expect(stored.shortcuts).toEqual(expect.arrayContaining([expect.objectContaining({ id: shortcut.id, prompt: 'applied-agent-shortcut' })]))
  expect(stored.shortcuts?.find((one) => one.id === shortcut.id)).not.toHaveProperty('lastSession')
  const pending = await Promise.all((await read<ChatSession[]>('sessions', 'list')).map((one) => items(one.id)))
  expect(pending.flat().some((one) => one.kind === 'team-request')).toBe(false)
  const exited = once(running!, 'exit'); running?.kill('SIGTERM'); await exited
  await start()
  expect(JSON.parse(await agent('settings', 'show'))).toMatchObject({ theme: 'dark', workingAtOnce: 3, phrases: ['Preserve this'] })
  expect((await list()).find((one) => one.id === shortcut.id)).toMatchObject({ prompt: 'applied-agent-shortcut', lastSession: ran?.lastSession })
  await agent('employees', 'shortcut', 'remove', shortcut.id)
  expect((await list()).some((one) => one.id === shortcut.id)).toBe(false)
  await agent('settings', 'edit', '--patch', '{"workingAtOnce":1}')
  const occupied = await send('hang')
  await eventually(() => read<ChatSession[]>('sessions', 'list'), (all) => all.some((one) => one.id === occupied && one.state === 'working'))
  const queued = await send('applied-new-concurrency')
  await eventually(() => read<ChatSession[]>('sessions', 'list'), (all) => all.some((one) => one.id === queued && one.waits))
  expect((await items(queued)).some((one) => one.kind === 'theirs')).toBe(false)
  await agent('settings', 'edit', '--patch', '{"workingAtOnce":3}')
  await eventually(() => items(queued), (all) => all.some((one) => one.kind === 'theirs' && one.text === 'fixture:applied-new-concurrency'), 15_000)
  await cli('sessions', 'stop', occupied)
  await agent('settings', 'edit', '--patch', '{"workingAtOnce":0}')
}, 30_000)

it('executes authenticated Manager settings and saved-shortcut commands through its real subprocess CLI without decisions', async () => {
  await cli('manager', 'configure', JSON.stringify({ enabled: true, provider: 'plugin:fixture', delegation: 'approve' }))
  let sequence = 0
  const execute = async (args: readonly string[]): Promise<ManagerView> => {
    const id = `agent-settings-${String(++sequence)}`
    await cli('manager', 'send', `fixture-command:${JSON.stringify({ id, args })}`)
    const view = await eventually(() => read<ManagerView>('manager', 'view'), (current) => current.decisions.length > 0 || current.activity.some((one) => one.id === id && one.state !== 'running'))
    expect(view.decisions).toEqual([])
    expect(view.activity.find((one) => one.id === id)).toMatchObject({ state: 'done' })
    await eventually(() => read<ManagerView>('manager', 'view'), (current) => current.state === 'idle')
    return view
  }
  await execute(['settings', 'edit', '--patch', '{"theme":"light","workingAtOnce":4}'])
  expect(await read('settings', 'get')).toMatchObject({ theme: 'light', workingAtOnce: 4 })
  await execute(['settings', 'manager-edit', '--instructions', 'Saved without decision', '--expected-instructions', ''])
  await execute(['employees', 'shortcut', 'add', 'none', '--name', 'Manager-created task', '--project', 'project', '--prompt', 'manager-created-shortcut', '--provider', 'plugin:fixture'])
  const all = await read<Shortcut[]>('employees', 'shortcuts', '--json')
  const shortcut = all.find((one) => one.name === 'Manager-created task')
  if (shortcut === undefined) throw new Error('Manager shortcut missing')
  await execute(['employees', 'shortcut', 'edit', shortcut.id, '--prompt', 'manager-edited-shortcut'])
  await execute(['employees', 'shortcuts', '--json'])
  await execute(['employees', 'shortcut', 'run', shortcut.id])
  const ran = (await read<Shortcut[]>('employees', 'shortcuts', '--json')).find((one) => one.id === shortcut.id)
  await eventually(() => items(ran?.lastSession ?? ''), (current) => current.some((one) => one.kind === 'theirs' && one.text === 'fixture:manager-edited-shortcut'))
  await execute(['employees', 'shortcut', 'remove', shortcut.id])
  expect((await read<Shortcut[]>('employees', 'shortcuts', '--json')).some((one) => one.id === shortcut.id)).toBe(false)
  expect(parseConfiguration(await readFile(join(directory, 'settings.json'), 'utf8')).manager?.instructions).toBe('Saved without decision')
  await cli('manager', 'configure', JSON.stringify({ enabled: false }))
  await cli('settings', 'set', '{"workingAtOnce":0}')
}, 30_000)

it('runs Manager Done/archive/resume through real CLI, preserves transcript across restart and terminates the canceled worker process', async () => {
  await cli('manager', 'configure', JSON.stringify({ enabled: true, provider: 'plugin:fixture', delegation: 'automatic' }))
  let sequence = 0
  const execute = async (args: readonly string[]): Promise<string> => {
    const id = `lifecycle-${String(++sequence)}`
    await cli('manager', 'send', `fixture-command:${JSON.stringify({ id, args })}`)
    const view = await eventually(() => read<ManagerView>('manager', 'view'), (current) => current.activity.some((one) => one.id === id && one.state !== 'running'))
    const result = view.activity.find((one) => one.id === id)
    expect(result).toMatchObject({ state: 'done' })
    await eventually(() => read<ManagerView>('manager', 'view'), (current) => current.state === 'idle')
    return result?.result ?? ''
  }
  const started: Pick<ChatSession, 'id'> = JSON.parse(await execute(['sessions', 'start', '--project', project, '--text', 'lifecycle-original', '--goal', 'Original result is present'])) as Pick<ChatSession, 'id'>
  const worker = started.id
  const row = async (): Promise<ChatSession | undefined> => (await read<ChatSession[]>('sessions', 'list')).find((one) => one.id === worker)
  await eventually(() => items(worker), (all) => all.some((one) => one.kind === 'theirs' && one.text === 'fixture:lifecycle-original'))
  expect((await row())?.status).not.toBe('done')
  await execute(['sessions', 'show', '--id', worker])
  await execute(['sessions', 'mark', '--id', worker, '--status', 'done'])
  expect(await row()).toMatchObject({ status: 'done' })
  await execute(['sessions', 'send', '--id', worker, '--text', 'lifecycle-correction'])
  expect((await row())?.status).toBeUndefined()
  await eventually(() => items(worker), (all) => all.some((one) => one.kind === 'theirs' && one.text === 'fixture:lifecycle-correction'))
  await execute(['sessions', 'send', '--id', worker, '--text', 'hang'])
  const workerPid = Number(await readFile(join(directory, 'fixture-child.pid'), 'utf8'))
  expect(() => process.kill(workerPid, 0)).not.toThrow()
  await execute(['sessions', 'send', '--id', worker, '--text', 'must-not-run-after-cancellation'])
  expect((await row())?.queued).toHaveLength(1)
  await execute(['sessions', 'mark', '--id', worker, '--status', 'archived'])
  expect(await row()).toMatchObject({ status: 'archived' })
  expect((await row())?.queued ?? []).toEqual([])
  expect(() => process.kill(workerPid, 0)).toThrow()
  expect((await items(worker)).some((one) => one.kind === 'theirs' && one.text === 'fixture:lifecycle-original')).toBe(true)
  const exited = once(running!, 'exit'); running?.kill('SIGTERM'); await exited
  await start()
  expect(await row()).toMatchObject({ status: 'archived' })
  expect((await items(worker)).some((one) => one.kind === 'theirs' && one.text === 'fixture:lifecycle-correction')).toBe(true)
  expect((await items(worker)).some((one) => one.kind === 'theirs' && one.text.includes('must-not-run-after-cancellation'))).toBe(false)
  await execute(['sessions', 'show', '--id', worker])
  await execute(['sessions', 'send', '--id', worker, '--text', 'lifecycle-resumed'])
  expect((await row())?.status).toBeUndefined()
  await eventually(() => items(worker), (all) => all.some((one) => one.kind === 'theirs' && one.text === 'fixture:lifecycle-resumed'))
  const independent: Pick<ChatSession, 'id'> = JSON.parse(await execute(['sessions', 'start', '--project', project, '--text', 'independent-lifecycle-task', '--goal', 'Separate result'])) as Pick<ChatSession, 'id'>
  expect(independent.id).not.toBe(worker)
  await eventually(() => items(independent.id), (all) => all.some((one) => one.kind === 'theirs' && one.text === 'fixture:independent-lifecycle-task'))
  expect((await items(worker)).some((one) => one.kind === 'theirs' && one.text.includes('independent-lifecycle-task'))).toBe(false)
  await cli('manager', 'configure', JSON.stringify({ enabled: false }))
}, 30_000)

it('runs a channel library with a sealed secret and only the folders granted to it', async () => {
  expect(await read<ChannelsView>('call', 'channels:view', '[]')).toMatchObject({ channels: [{ id: 'channel:slack', builtIn: true, state: 'off' }, { id: 'channel:discord', builtIn: true, state: 'off' }, { id: 'channel:probe', state: 'off' }] })
  expect(await read<ChannelsView>('call', 'channels:configure', JSON.stringify(['channel:probe', { enabled: true, projects: [project] }]))).toMatchObject({ channels: [{ id: 'channel:slack' }, { id: 'channel:discord' }, { state: 'setup', says: 'Fill in Token.' }] })
  await read<ChannelsView>('call', 'channels:configure', JSON.stringify(['channel:probe', { secrets: { token: 'probe-secret' } }]))
  await eventually(() => read<ChannelsView>('call', 'channels:view', '[]'), (view) => { const probe = view.channels.find((one) => one.id === 'channel:probe'); return probe?.state === 'connected' && probe.says === 'token ok' && probe.conversations === 1 })
  const state = join(directory, 'channels', 'channel-probe.json')
  await eventually(async () => readFile(state, 'utf8').catch(() => ''), (text) => text.includes('fixture:complete'))
  expect(await readFile(join(directory, 'settings.json'), 'utf8')).not.toContain('probe-secret')
  expect((await readFile(join(directory, 'channels', 'channel-probe.secrets'))).toString('utf8')).not.toContain('probe-secret')
  expect(await read<ChannelsView>('call', 'channels:configure', JSON.stringify(['channel:probe', { enabled: false }]))).toMatchObject({ channels: [{ id: 'channel:slack' }, { id: 'channel:discord' }, { id: 'channel:probe', state: 'off' }] })
}, 20_000)

it('keeps working after the operator disconnects and requires an explicit native answer', async () => {
  const token = (await readFile(join(directory, 'operator-token'), 'utf8')).trim()
  await new Promise<void>((resolve, reject) => {
    const socket = connect(askedEndpoint(directory))
    socket.once('error', reject)
    socket.once('connect', () => { socket.write(`${JSON.stringify({ action: 'operator', token, args: ['sessions', 'start', JSON.stringify({ root: project, text: 'slow', mode: 'manual', provider: 'plugin:fixture' })] })}\n`, () => { socket.destroy(); resolve() }) })
  })
  await eventually(async () => { const all = await read<ChatSession[]>('sessions', 'list'); return (await Promise.all(all.map((one) => items(one.id)))).flat() }, (all) => all.some((one) => one.kind === 'theirs' && one.text === 'fixture:slow'))
  const id = await send('wait')
  const pending = await eventually(() => read<SessionItem[]>('sessions', 'pending', id), (all) => all.some((one) => one.kind === 'card'))
  const card = pending.find((one) => one.kind === 'card')
  expect(card?.kind === 'card' && card.card.answered).toBeUndefined()
  await cli('sessions', 'answer', id, card?.id ?? '', 'once')
  await eventually(() => items(id), (all) => all.some((one) => one.kind === 'theirs' && one.text === 'approved:once'))
  await expect(cli('sessions', 'answer', id, card?.id ?? '', 'once')).rejects.toThrow('no longer pending')
  const proposed = raw({ action: 'employees', args: ['create', '--name', 'Requested employee'], session: id })
  const team = await eventually(() => read<SessionItem[]>('sessions', 'pending', id), (all) => all.some((one) => one.kind === 'team-request'))
  const change = team.find((one) => one.kind === 'team-request')
  expect((await read<EmployeesView>('employees', 'list')).employees.some((one) => one.name === 'Requested employee')).toBe(false)
  await cli('sessions', 'answer-team', id, change?.id ?? '', 'allow')
  expect(await proposed).toMatchObject({ ok: true, result: expect.stringContaining('Created employee Requested employee') })
}, 20_000)

it('preserves program-request approval, settings and history through a clean restart', async () => {
  await cli('manager', 'configure', JSON.stringify({ instructions: 'Headless test instructions', delegation: 'approve' }))
  expect((await read<ManagerView>('manager', 'view')).config.instructions).toBe('Headless test instructions')
  await cli('employees', 'create', '--name', 'Headless operator', '--role', 'Engineer')
  expect((await read<EmployeesView>('employees', 'list')).employees).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Headless operator' })]))
  await cli('employees', 'shortcut', 'add', 'none', '--name', 'Headless shortcut', '--project', 'project', '--prompt', 'shortcut', '--provider', 'plugin:fixture', '--mode', 'manual')
  const shortcut = (await read<Shortcut[]>('employees', 'shortcuts', '--json'))[0]
  expect(shortcut).toBeDefined()
  await cli('employees', 'shortcut', 'run', shortcut?.id ?? '')
  const ran = (await read<Shortcut[]>('employees', 'shortcuts', '--json'))[0]
  await eventually(() => items(ran?.lastSession ?? ''), (all) => all.some((one) => one.kind === 'theirs' && one.text === 'fixture:shortcut'))
  const requested = raw({ app: 'integration test', tasks: [{ project: 'project', text: 'proposed', provider: 'plugin:fixture' }] })
  const rows = await eventually(() => read<ChatSession[]>('sessions', 'list'), (all) => all.some((one) => one.state === 'asks'))
  const row = rows.find((one) => one.state === 'asks')
  expect(row).toBeDefined()
  const pending = await read<SessionItem[]>('sessions', 'pending', row?.id ?? '')
  const request = pending.find((one) => one.kind === 'request')
  expect(request).toBeDefined()
  await cli('sessions', 'answer-request', row?.id ?? '', request?.id ?? '', JSON.stringify({ start: [false], notes: ['not now'] }))
  expect(await requested).toMatchObject({ ok: true, tasks: [{ answer: 'refused' }] })
  await cli('settings', 'set', JSON.stringify({ workingAtOnce: 2 }))
  const before = await read<ChatSession[]>('sessions', 'list')
  const id = await send('hang')
  await eventually(() => read<ChatSession[]>('sessions', 'list'), (all) => all.some((one) => one.id === id))
  const child = Number(await readFile(join(directory, 'fixture-child.pid'), 'utf8'))
  expect((await stat(join(directory, 'find-model-fetch-started'))).isFile()).toBe(true)
  const exited = once(running!, 'exit')
  expect(await cli('shutdown')).toBe('GeckIt service stopped.')
  await exited
  expect(running?.exitCode).toBe(0)
  expect(() => process.kill(child, 0)).toThrow()
  await expect(stat(join(directory, 'service-owner.json'))).rejects.toThrow()
  await expect(stat(join(directory, 'operator-token'))).rejects.toThrow()
  await start()
  expect(await read('settings', 'get')).toMatchObject({ workingAtOnce: 2 })
  expect((await read<ManagerView>('manager', 'view')).config.instructions).toBe('Headless test instructions')
  expect((await read<EmployeesView>('employees', 'list')).employees).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Headless operator' })]))
  expect(await read<Shortcut[]>('employees', 'shortcuts', '--json')).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Headless shortcut' })]))
  const after = await read<ChatSession[]>('sessions', 'list')
  expect(after.map((one) => one.id)).toEqual(expect.arrayContaining(before.map((one) => one.id)))
  expect(after.some((one) => one.id === id)).toBe(true)
  expect(Number(await readFile(join(directory, 'fixture-child.pid'), 'utf8'))).toBe(child)
  const exitedAgain = once(running!, 'exit'); running?.kill('SIGTERM'); await exitedAgain
  expect(running?.exitCode).toBe(0)
}, 20_000)

it('rejects import during work, then imports through a real service shutdown and fresh startup', async () => {
  await start()
  const token = (await readFile(join(directory, 'operator-token'), 'utf8')).trim()
  const rpc = await connectRpc<ServiceMethods, ServiceEvents>(directory, token, () => undefined)
  try {
    const text = await rpc.call('configuration:export')
    const original = parseConfiguration(text)
    const next = JSON.stringify({ ...original, general: { ...original.general, theme: 'dark' }, manager: { ...original.manager, instructions: 'Imported instructions' } })
    const id = await send('hang')
    await eventually(() => read<ChatSession[]>('sessions', 'list'), (all) => all.some((one) => one.id === id && one.state === 'working'))
    await expect(rpc.call('service:importConfiguration', next)).rejects.toThrow('Finish or stop active and queued work')
    await expect(stat(join(directory, 'configuration-import.json'))).rejects.toThrow()
    await cli('sessions', 'stop', id)
    await eventually(() => read<ChatSession[]>('sessions', 'list'), (all) => all.every((one) => one.state !== 'working'))
    const local = await readFile(join(directory, 'local-state.json'), 'utf8')
    const before = await readFile(join(directory, 'settings.json'), 'utf8')
    const exited = once(running!, 'exit')
    expect(await rpc.call('service:importConfiguration', next)).toEqual({ ready: true })
    await exited
    expect(running?.exitCode).toBe(0)
    expect(await readFile(join(directory, 'settings.json'), 'utf8')).toBe(before)
    await start()
    expect(await read('settings', 'get')).toMatchObject({ theme: 'dark' })
    expect((await read<ManagerView>('manager', 'view')).config.instructions).toBe('Imported instructions')
    expect((await read<EmployeesView>('employees', 'list')).employees).toEqual(original.employees)
    expect(JSON.parse(await readFile(join(directory, 'local-state.json'), 'utf8'))).toMatchObject(JSON.parse(local))
    await expect(stat(join(directory, 'configuration-import.json'))).rejects.toThrow()
  } finally { rpc.close() }
}, 20_000)

it('does not unlink an existing legacy listener without ownership metadata', async () => {
  const legacy = join(folder, 'legacy'); await mkdir(legacy)
  const socket = createServer()
  await new Promise<void>((resolve, reject) => { socket.once('error', reject); socket.listen(askedEndpoint(legacy), resolve) })
  try {
    await expect(exec(process.execPath, [join(folder, 'service', 'service.js'), '--data', legacy], { cwd: client, env, timeout: 5_000 })).rejects.toThrow('socket already exists')
    const connection = connect(askedEndpoint(legacy)); await once(connection, 'connect'); connection.destroy()
  } finally { await new Promise<void>((resolve) => socket.close(() => resolve())) }
})
