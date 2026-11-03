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
import { askedEndpoint } from '../src/cli/endpoint'

const exec = promisify(execFile)
const client = resolve(import.meta.dirname, '..')
let folder: string
let directory: string
let project: string
let env: NodeJS.ProcessEnv
let running: ChildProcess | undefined
let output = ''

async function eventually<T>(read: () => Promise<T>, check: (value: T) => boolean): Promise<T> {
  const until = Date.now() + 8_000
  for (;;) {
    const value = await read()
    if (check(value)) return value
    if (Date.now() > until) throw new Error(`Timed out. Service output: ${output}`)
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
}

async function start(): Promise<void> {
  output = ''
  running = spawn(process.execPath, [join(folder, 'service', 'service.js'), '--data', directory], { cwd: client, env, stdio: ['ignore', 'pipe', 'pipe'] })
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
  await exec(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'service.vite.config.ts'], { cwd: client, timeout: 30_000 })
  folder = await mkdtemp(join(tmpdir(), 'geckit-headless-'))
  await cp(join(client, 'out', 'service'), join(folder, 'service'), { recursive: true })
  directory = join(folder, 'data')
  project = join(folder, 'project')
  await mkdir(project)
  await mkdir(join(folder, 'home'))
  const plugin = join(directory, 'provider-plugins', 'plugin-fixture')
  await cp(join(import.meta.dirname, 'fixtures', 'headless'), plugin, { recursive: true })
  await writeFile(join(plugin, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { id: 'plugin:fixture', family: 'plugin:fixture', name: 'Fixture', shortName: 'Fixture', icon: 'terminal', browser: 'none', loginCommand: '', planName: '' } }))
  await writeFile(join(directory, 'settings.json'), JSON.stringify({ chatProviders: ['plugin:fixture'], chatProvider: 'plugin:fixture', vpnIpCheck: false, guideClaude: false, guideCodex: false, workingAtOnce: 0 }))
  env = { ...process.env, GECKIT_DATA: directory, GECKIT_VAULT_KEY: Buffer.alloc(32, 13).toString('base64'), HOME: join(folder, 'home'), CODEX_HOME: join(folder, 'codex'), CLAUDE_CONFIG_DIR: join(folder, 'claude') }
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

it('does not unlink an existing legacy listener without ownership metadata', async () => {
  const legacy = join(folder, 'legacy'); await mkdir(legacy)
  const socket = createServer()
  await new Promise<void>((resolve, reject) => { socket.once('error', reject); socket.listen(askedEndpoint(legacy), resolve) })
  try {
    await expect(exec(process.execPath, [join(folder, 'service', 'service.js'), '--data', legacy], { cwd: client, env, timeout: 5_000 })).rejects.toThrow('socket already exists')
    const connection = connect(askedEndpoint(legacy)); await once(connection, 'connect'); connection.destroy()
  } finally { await new Promise<void>((resolve) => socket.close(() => resolve())) }
})
