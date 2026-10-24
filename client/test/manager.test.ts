import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { TelegramAttachments } from '../src/main/telegram-attachments'
import { Manager, runManagerCli } from '../src/main/manager'
import type { ManagerCliContext, ManagerDeps } from '../src/main/manager'
import { ManagerOperations, managerFile, managerProvider, managerReadOnly } from '../src/main/manager-operations'
import { managerCommands, managerContext, managerHistoryItem, managerMessage, managerVisibleItem, MANAGER_INSTRUCTIONS } from '../src/main/manager-protocol'
import { manage } from '../src/cli/manage'
import type { ManagerActivity, ManagerCliAnswered, ManagerCliAsked, ManagerReplyOrigin, ManagerView } from '../src/shared/manager'
import { Sessions, memoryNotes } from '../src/main/sessions'
import type { SessionsDeps } from '../src/main/sessions'
import { llmProvider } from '../src/main/sessions/provider'
import type { LlmProvider } from '../src/main/sessions/provider'
import type { ClaudeOptions } from '../src/main/sessions/claude'
import { claudeArgs } from '../src/main/sessions/claude'
import type { Driver, Heard } from '../src/main/sessions/heard'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { SessionItems, Settings } from '../src/shared/api'
import { VPN_IP_CONFIGURATION_ERROR, VPN_IP_UNAVAILABLE_ERROR, vpnIpMismatchError, vpnIpPausedError } from '../src/shared/vpn-ip'

interface NativeAnswer { readonly id: string; readonly ask: string; readonly answer: string }

interface Sent {
  readonly id: string
  readonly text: string
  readonly input: string
}

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { vi.useRealTimers(); for (const cleanup of cleanups.splice(0)) await cleanup() })

function library() {
  const made: ClaudeOptions[] = []
  const sent: Sent[] = []
  const hearing = new Map<string, (heard: Heard) => void>()
  let created = 0
  const create = vi.fn<LlmProvider['create']>(async () => `plugin:manager-test:${String(++created)}`)
  const provider: LlmProvider = {
    ...llmProvider({}, 'claude'), id: 'plugin:manager-test', family: 'plugin:manager-test', name: 'Manager test library',
    create, list: async () => [], read: async () => undefined, has: async () => false,
    program: async () => undefined, limits: async () => ({ windows: new Map<string, number | undefined>() }), goal: async () => undefined,
    models: async () => [{ value: 'library-model', name: 'Library model' }, { value: 'library-other', name: 'Other library model' }],
    account: async () => ({ provider: 'plugin:manager-test', here: true, signedIn: true }),
    hold: (options, hear) => {
      made.push(options)
      hearing.set(options.id, hear)
      return { send: (text) => { const item = managerHistoryItem({ kind: 'mine', id: 'input', text }); sent.push({ id: options.id, text: item.kind === 'mine' ? item.text : text, input: text }) }, answer: () => undefined, stop: () => hear({ items: [], gone: [], signals: [{ kind: 'ended', how: 'stopped' }] }), end: async () => undefined }
    },
  }
  return { provider, create, made, sent, finish: (id: string, text = 'Coordinated') => hearing.get(id)?.({ items: [{ kind: 'theirs', id: `reply:${String(sent.length)}`, text }], gone: [], signals: [{ kind: 'ended', how: 'done' }] }) }
}

async function fixture(limit = 0, over: Partial<SessionsDeps> = {}, inject?: Driver['inject']) {
  const directory = await mkdtemp(join(tmpdir(), 'geckit-manager-'))
  const root = join(directory, 'project')
  await mkdir(root)
  let settings: Settings = { ...DEFAULT_SETTINGS, projects: [root], chatProviders: ['claude', 'codex'], chatProvider: 'claude', vpnIpCheck: false }
  const current: { manager?: Manager } = {}
  const notes = memoryNotes()
  const made: ClaudeOptions[] = []
  const sent: Sent[] = []
  const fanned: SessionItems[] = []
  const answers: NativeAnswer[] = []
  const cli: { readonly args: readonly string[]; readonly context: ManagerCliContext }[] = []
  let callCli: ManagerDeps['cli'] | undefined
  const hearings = new Map<string, (heard: Heard) => void>()
  const sessions = new Sessions({
    notes,
    changed: (all) => current.manager?.observeSessions(all),
    items: (items) => fanned.push(items),
    account: () => undefined,
    notify: () => undefined,
    claude: (options, hear): Driver => {
      made.push(options)
      hearings.set(options.id, hear)
      return { ...(inject === undefined ? {} : { inject }), send: (text) => { const item = managerHistoryItem({ kind: 'mine', id: 'input', text }); sent.push({ id: options.id, text: item.kind === 'mine' ? item.text : text, input: text }) }, answer: (ask, answer) => answers.push({ id: options.id, ask, answer }), stop: () => hear({ items: [], gone: [], signals: [{ kind: 'ended', how: 'stopped' }] }), end: async () => undefined }
    },
    disk: { list: async () => [], read: async () => undefined, has: async () => false },
    claudeAccount: async () => ({ here: true, signedIn: true, plan: 'Max' }),
    claudeModels: async () => [{ value: 'sonnet', name: 'Sonnet' }, { value: 'missing', name: 'Missing', disabled: true }],
    claudeProgram: async () => undefined,
    usage: async () => ({ windows: new Map<string, number | undefined>() }),
    limit: () => limit,
    ...over,
  })
  const deps: ManagerDeps = { directory, sessions, notes, settings: () => settings, saveSettings: (change) => settings = { ...settings, ...change }, cli: async (args, context) => {
    cli.push({ args, context })
    if (callCli !== undefined) return callCli(args, context)
    const result = await current.manager?.command({ action: 'manage', args, session: context.session, token: context.token, operation: context.operation })
    if (result === undefined || !result.ok) throw new Error(result?.error ?? 'Manager missing')
    return result.result
  } }
  const manager = new Manager(deps)
  current.manager = manager
  const active = manager
  cleanups.push(async () => { current.manager?.dispose(); sessions.dispose(); await rm(directory, { recursive: true, force: true }) })
  const finish = (id: string, text: string): void => hearings.get(id)?.({ items: [{ kind: 'theirs', id: `answer:${sent.length}`, text }], gone: [], signals: [{ kind: 'ended', how: 'done' }] })
  const command = (id: string, args: readonly string[]): string => `I will coordinate that.\n\n\`\`\`geckit\n${JSON.stringify({ id, args })}\n\`\`\``
  return { manager: active, sessions, root, directory, notes, made, sent, fanned, answers, cli, finish, hear: (id: string, heard: Heard) => hearings.get(id)?.(heard), command, setCli: (run: ManagerDeps['cli'] | undefined) => { callCli = run }, reload: () => { current.manager?.dispose(); const next = new Manager(deps); current.manager = next; return next }, settings: () => settings, set: (change: Partial<Settings>) => { settings = { ...settings, ...change } } }
}

describe('Manager CLI delivery recovery', () => {
  const settle = async (): Promise<void> => { for (let turn = 0; turn < 8; turn++) await new Promise<void>((resolve) => setImmediate(resolve)) }

  it('reconciles a saved attach approval from fresh managed ownership without attaching or granting approval', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Coordinate existing workers')
    await settle()
    const worker = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'Existing work' }, 'other', 'existing-worker')
    const args = ['sessions', 'attach', '--id', worker]
    f.finish(id, f.command('attach-existing', args))
    await settle()
    const decision = (await f.manager.view()).decisions[0]
    if (decision === undefined) throw new Error('Missing attach approval')
    expect(f.cli).toHaveLength(0)
    f.notes.set(worker, { ...f.notes.all()[worker], managerOwner: 'manager' })
    const attach = vi.spyOn(f.notes, 'set')
    const restored = f.reload()
    const view = await restored.view()
    expect(view.decisions).toEqual([])
    expect(view.activity[0]).toMatchObject({ id: 'attach-existing', state: 'done', result: expect.stringContaining('alreadyManaged') })
    expect(view.activity[0]).not.toHaveProperty('approved')
    await expect(restored.answer(decision.id, 'allow')).resolves.toMatchObject({ answer: expect.stringContaining('no longer pending') })
    await expect(restored.answer(decision.id, 'allow')).resolves.toMatchObject({ answer: expect.stringContaining('no longer pending') })
    expect(attach.mock.calls.filter(([target]) => target === worker)).toEqual([])
    expect(f.cli).toHaveLength(0)
  })

  it.each(['done', 'failed'] as const)('preserves an existing %s attach receipt while retiring its stale decision', async (state) => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const worker = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'Existing work' }, 'manager', 'existing-worker')
    const path = join(f.directory, 'manager.json')
    const stored = JSON.parse(await readFile(path, 'utf8')) as Pick<ManagerView, 'config'>
    const args = ['sessions', 'attach', '--id', worker]
    const receipt: ManagerActivity & { readonly approved: true } = { id: 'attach-receipt', at: 123, command: args, state, result: 'Original host receipt', approved: true }
    await writeFile(path, JSON.stringify({ ...stored, operations: [receipt], decisions: [{ id: 'stale-attach', command: { id: receipt.id, args }, title: 'Allow attach?', choices: [{ label: 'Allow', value: 'allow' }] }] }))
    const restored = f.reload()
    expect((await restored.view()).decisions).toEqual([])
    expect((await restored.view()).activity).toEqual([receipt])
    const saved = JSON.parse(await readFile(path, 'utf8')) as { readonly operations: readonly ManagerActivity[] }
    expect(saved.operations).toEqual([receipt])
    expect(f.cli).toHaveLength(0)
  })

  it.each(['unknown', 'removed project', 'manager', 'question'] as const)('does not satisfy an attach approval for a %s target from ownership alone', async (kind) => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const worker = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'Existing work' }, 'manager', 'existing-worker')
    const rows = await f.sessions.allForManager([f.root])
    const path = join(f.directory, 'manager.json')
    const stored = JSON.parse(await readFile(path, 'utf8')) as Pick<ManagerView, 'config'>
    const args = ['sessions', 'attach', '--id', worker]
    await writeFile(path, JSON.stringify({ ...stored, decisions: [{ id: 'pending-attach', command: { id: 'attach', args }, title: 'Allow attach?', choices: [{ label: 'Allow', value: 'allow' }] }] }))
    vi.spyOn(f.sessions, 'allForManager').mockResolvedValue(kind === 'unknown' ? [] : rows.map((row) => row.id !== worker ? row : { ...row, ...(kind === 'removed project' ? { project: '/unregistered' } : kind === 'manager' ? { manager: true } : { question: true }) }))
    const restored = f.reload()
    expect((await restored.view()).decisions.map((one) => one.id)).toEqual(['pending-attach'])
    expect((await restored.view()).activity).toEqual([])
    expect(f.cli).toHaveLength(0)
  })

  it('binds a pending operation ID to its original arguments and requires its actual approval', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true, delegation: 'approve' })
    const id = await f.manager.send('Delegate work')
    await settle()
    const args = ['sessions', 'start', '--project', f.root, '--text', 'Original task', '--goal', 'Verified']
    f.finish(id, f.command('bound-start', args))
    await settle()
    const decision = (await f.manager.view()).decisions[0]
    if (decision === undefined) throw new Error('Missing start approval')
    f.finish(id, f.command('bound-start', ['sessions', 'start', '--project', f.root, '--text', 'Changed task', '--goal', 'Different']))
    await settle()
    expect(f.sent.at(-1)?.text).toContain('different pending request')
    expect((await f.manager.view()).decisions[0]?.id).toBe(decision.id)
    expect(f.cli).toHaveLength(0)
    await f.manager.answer(decision.id, 'allow')
    await f.manager.answer(decision.id, 'allow')
    expect(f.cli).toHaveLength(1)
    expect(f.cli[0]?.args).toEqual(args)
  })

  it('retains genuine attach approval and refuses revoked authority after refreshing current state', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Coordinate an existing worker')
    await settle()
    const worker = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'Existing work' }, 'other', 'unmanaged-worker')
    f.finish(id, f.command('genuine-attach', ['sessions', 'attach', '--id', worker]))
    await settle()
    const decision = (await f.manager.view()).decisions[0]
    if (decision === undefined) throw new Error('Missing attach approval')
    const rows = await f.sessions.allForManager([f.root])
    let refresh: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { refresh = resolve })
    const listing = vi.spyOn(f.sessions, 'allForManager').mockImplementationOnce(async () => { await gate; return rows })
    let authorized = true
    const answer = f.manager.answer(decision.id, 'allow', () => authorized)
    authorized = false
    refresh?.()
    await expect(answer).rejects.toThrow('request changed')
    listing.mockRestore()
    expect(f.notes.all()[worker]?.managerOwner).toBe('other')
    expect((await f.manager.view()).decisions[0]?.id).toBe(decision.id)
    expect(f.cli).toHaveLength(0)
    await f.manager.answer(decision.id, 'allow')
    expect(f.notes.all()[worker]?.managerOwner).toBe('manager')
    expect(f.cli).toHaveLength(1)
    await f.manager.answer(decision.id, 'allow')
    expect(f.cli).toHaveLength(1)
  })

  it('keeps reviewed uploads uncertain across restart and rejects replays without blocking unrelated commands', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.open()
    const path = join(f.directory, 'manager.json')
    const stored = JSON.parse(await readFile(path, 'utf8')) as Pick<ManagerView, 'config'>
    const args = ['telegram', 'send-file', '--id', 'worker', '--path', 'report.txt']
    await writeFile(path, JSON.stringify({ ...stored, paused: true, pauseReason: 'user', operations: [{ id: 'uncertain-upload', at: 1, state: 'uncertain', command: args }], decisions: [{ id: 'review-upload', uncertain: true, command: { id: 'uncertain-upload', args }, title: 'Check state', choices: [{ label: 'I checked its state', value: 'reviewed' }] }] }))
    const restored = f.reload()
    await expect(restored.answer('review-upload', 'reviewed')).resolves.toMatchObject({ state: 'paused', answer: expect.stringContaining('Delivery remains uncertain') })
    await expect(restored.answer('review-upload', 'reviewed')).resolves.toMatchObject({ answer: expect.stringContaining('no longer pending') })
    expect((await restored.view()).activity[0]?.state).toBe('uncertain')
    expect(f.cli).toHaveLength(0)
    const again = f.reload()
    await again.resume()
    await settle()
    f.finish(id, `${f.command('uncertain-upload', args)}\n${f.command('renamed-upload', args)}\n${f.command('fresh-read', ['sessions', 'list'])}`)
    await settle()
    expect(f.cli.map((one) => one.args)).toEqual([['sessions', 'list']])
    expect((await again.view()).error).toBeUndefined()
    expect((await again.view()).decisions).toEqual([])
    expect((await again.view()).activity.find((one) => one.id === 'uncertain-upload')?.state).toBe('uncertain')
    expect((await again.view()).activity.find((one) => one.id === 'fresh-read')?.state).toBe('done')
  })

  it.each([false, true])('blocks caption and default-format variants of a legacy uncertain upload after restart (reviewed: %s)', async (reviewed) => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.open()
    const worker = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'Prepare report' }, 'manager', 'legacy-report-worker')
    await writeFile(join(f.root, 'report.txt'), 'Report')
    const path = join(f.directory, 'manager.json')
    const stored = JSON.parse(await readFile(path, 'utf8')) as Pick<ManagerView, 'config'>
    const args = ['telegram', 'send-file', '--id', worker, '--path', 'report.txt']
    await writeFile(path, JSON.stringify({ ...stored, paused: true, pauseReason: 'user', operations: [{ id: 'legacy-upload', at: 1, state: 'uncertain', command: args, result: 'Previous Telegram delivery is uncertain. Check the paired chat before requesting another file send.', ...(reviewed ? { reviewed: true } : {}) }] }))
    const restored = f.reload()
    await restored.resume()
    await settle()
    f.finish(id, `${f.command('changed-caption', [...args, '--caption', 'New caption'])}\n${f.command('explicit-default', ['telegram', 'send-file', '--as', 'document', '--path', './report.txt', '--json', '--id', worker])}\n${f.command('lexical-path', ['telegram', 'send-file', '--path', 'folder/../report.txt', '--id', worker])}\n${f.command('unrelated-read', ['sessions', 'list'])}`)
    await settle()
    expect(f.cli.map((one) => one.args)).toEqual([['sessions', 'list']])
    const view = await restored.view()
    expect(view.error).toBeUndefined()
    expect(view.activity.find((one) => one.id === 'legacy-upload')?.state).toBe('uncertain')
    expect(view.activity.find((one) => one.id === 'unrelated-read')?.state).toBe('done')
  })

  it.each([
    ['capabilities'], ['providers', 'list'], ['providers', 'models', '--provider', 'claude'],
    ['projects', 'list'], ['projects', 'provider', '--project', 'project'],
    ['files', 'read'], ['files', 'list'], ['sessions', 'list'], ['sessions', 'show'], ['settings', 'show'],
  ])('recognizes the read-only command %j', (...args) => expect(managerReadOnly(args)).toBe(true))

  it.each([
    ['projects', 'provider', '--project', 'project', '--provider', 'claude'], ['projects', 'provider', '--clear'],
    ['projects', 'create'], ['files', 'write'], ['sessions', 'start'], ['sessions', 'send'], ['telegram', 'send-file'], ['new-command'],
  ])('does not classify mutation %j as a safe read', (...args) => expect(managerReadOnly(args)).toBe(false))

  it('returns a failed read as context and continues with a fresh read without pausing', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Read current work')
    await settle()
    f.setCli(async () => { throw new Error('GeckIt timed out. Delivery is uncertain.') })
    f.finish(id, f.command('read-timeout', ['sessions', 'list']))
    await settle()
    expect(await f.manager.view()).toMatchObject({ state: 'working', activity: [{ id: 'read-timeout', state: 'failed' }], decisions: [] })
    expect(f.sent.at(-1)?.text).toContain('Retry a fresh read')
    f.setCli(undefined)
    f.finish(id, f.command('fresh-read', ['sessions', 'list']))
    await settle()
    expect((await f.manager.view()).activity[0]).toMatchObject({ id: 'fresh-read', state: 'done' })
    expect(f.cli).toHaveLength(2)
  })

  it('recovers a lost CLI reply from its durable host receipt without creating a second worker', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Delegate work')
    await settle()
    f.setCli(async (args, context) => {
      const answer = await f.manager.command({ action: 'manage', args, ...context })
      expect(answer.ok).toBe(true)
      const stored = JSON.parse(await readFile(join(f.directory, 'manager.json'), 'utf8')) as { readonly operations: readonly ManagerActivity[] }
      expect(stored.operations.at(-1)?.state).toBe('done')
      throw new Error('CLI delivery is uncertain after timeout')
    })
    const command = f.command('one-worker', ['sessions', 'start', '--project', f.root, '--text', 'Implement the fix', '--goal', 'Verified'])
    f.finish(id, command)
    await vi.waitFor(async () => {
      expect(f.sent.at(-1)?.text).toContain('Recovered the host receipt')
      expect(await f.manager.view()).toMatchObject({ state: 'working', activity: [{ id: 'one-worker', state: 'done' }], decisions: [] })
      expect((await f.manager.view()).workers).toHaveLength(1)
    })
    f.finish(id, command)
    await vi.waitFor(() => expect(f.sent.at(-1)?.text).toContain('Already handled; this command was not run again.'))
    expect(f.cli).toHaveLength(1)
    expect((await f.manager.view()).workers).toHaveLength(1)
  })

  it('records a late host completion after timeout and retires its uncertainty without resending', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Delegate work')
    await settle()
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const start = f.sessions.startManaged.bind(f.sessions)
    const create = vi.spyOn(f.sessions, 'startManaged').mockImplementation(async (...args) => { const worker = await start(...args); await gate; return worker })
    let pending: Promise<ManagerCliAnswered> | undefined
    f.setCli(async (args, context) => { pending = f.manager.command({ action: 'manage', args, ...context }); await settle(); throw new Error('CLI timed out') })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    f.finish(id, f.command('late-worker', ['sessions', 'start', '--project', f.root, '--text', 'Implement the fix', '--goal', 'Verified']))
    await vi.waitFor(async () => expect((await f.manager.view()).activity[0]?.state).toBe('uncertain'))
    expect((await f.manager.view()).state).toBe('blocked')
    await vi.advanceTimersByTimeAsync(5_000)
    await settle()
    expect(f.sent.at(-1)?.text).toContain('Unresolved operations')
    expect(f.sent.at(-1)?.text).toContain('late-worker')
    release?.()
    await pending
    await settle()
    expect(create).toHaveBeenCalledTimes(1)
    expect((await f.manager.view()).activity[0]?.state).toBe('done')
    expect((await f.manager.view()).decisions).toEqual([])
    f.finish(id, 'Reconciled current work')
    await settle()
    expect(f.sent.some((one) => one.text.includes('The original operation completed'))).toBe(true)
  })

  it.each(['read', 'mutation'] as const)('automatically migrates the saved delivery pause for a %s and drains queued work', async (kind) => {
    const f = await fixture()
    await f.manager.configure({ enabled: true, chatModel: 'sonnet' })
    const id = await f.manager.open()
    const worker = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'Continue working' }, 'manager', 'keep-worker')
    const path = join(f.directory, 'manager.json')
    const stored = JSON.parse(await readFile(path, 'utf8')) as Pick<ManagerView, 'config'>
    const args = kind === 'read' ? ['sessions', 'show', '--id', worker, '--last', '2'] : ['telegram', 'send-file', '--id', worker, '--path', 'report.txt']
    await writeFile(path, JSON.stringify({ ...stored, paused: true, error: 'CLI delivery is uncertain. Review current state before resuming.', operations: [{ id: 'saved-uncertain', command: args, state: 'uncertain', at: 1 }], decisions: [{ id: 'review', command: { id: 'saved-uncertain', args }, uncertain: true, choices: [{ label: 'I checked its state', value: 'reviewed' }] }], inbox: [{ id: 'queued', text: 'Next Telegram request', source: 'telegram', state: 'queued', at: 1 }] }))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const recovered = f.reload()
    await settle()
    expect((await recovered.view()).state).toBe('blocked')
    await vi.advanceTimersByTimeAsync(5_000)
    await settle()
    expect(f.sent.at(-1)?.text).toContain('Automatic recovery.')
    const view = await recovered.view()
    expect(view.session?.id).toBe(id)
    expect(view.config.chatModel).toBe('sonnet')
    expect(view.workers.find((one) => one.id === worker)?.state).toBe('working')
    expect(view.decisions).toHaveLength(kind === 'read' ? 0 : 1)
    expect(view.activity[0]?.state).toBe(kind === 'read' ? 'failed' : 'uncertain')
    f.finish(id, 'Reconciled without replay')
    await settle()
    expect(f.sent.at(-1)?.text).toBe('[Telegram]\nNext Telegram request')
    expect(f.cli).toHaveLength(0)
  })

  it('keeps an explicit pause after uncertainty across restart', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Coordinate')
    await settle()
    f.setCli(async () => { throw new Error('CLI delivery is uncertain') })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    f.finish(id, f.command('unknown-send', ['sessions', 'send', '--id', 'worker', '--text', 'Possibly delivered']))
    await settle()
    await f.manager.pause()
    const recovered = f.reload()
    await settle()
    await vi.advanceTimersByTimeAsync(120_000)
    expect((await recovered.view()).state).toBe('paused')
    expect(f.sent).toHaveLength(1)
    expect(f.cli).toHaveLength(1)
  })

  it('discards remaining actions from an interrupted output and reconciles before queued requests', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Coordinate')
    await settle()
    await f.manager.send('Next request')
    f.setCli(async () => { throw new Error('CLI delivery is uncertain') })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    f.finish(id, `${f.command('unknown-send', ['sessions', 'send', '--id', 'worker', '--text', 'Possibly delivered'])}\n${f.command('dependent-send', ['sessions', 'send', '--id', 'worker', '--text', 'Do the next step'])}`)
    await settle()
    expect(f.cli).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(5_000)
    await settle()
    expect(f.sent.at(-1)?.text).toContain('Automatic recovery.')
    f.finish(id, 'Reconciled actual state')
    await settle()
    expect(f.sent.at(-1)?.text).toBe('Next request')
    expect(f.cli).toHaveLength(1)
  })
})

describe('Manager automatic recovery', () => {
  const settle = async (): Promise<void> => { for (let turn = 0; turn < 8; turn++) await new Promise<void>((resolve) => setImmediate(resolve)) }

  it('recovers a failed turn once before queued input without replaying it or disturbing workers', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true, chatModel: 'sonnet' })
    const worker = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'Keep working' }, 'manager', 'recovery-worker')
    const id = await f.manager.send('Possibly delivered request', 'telegram')
    await settle()
    await f.manager.send('Next request', 'telegram')
    await f.manager.send('Last request', 'telegram')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    f.hear(id, { items: [], gone: [], signals: [{ kind: 'ended', how: 'failed', text: 'Connection lost' }] })
    expect(await f.manager.view()).toMatchObject({ state: 'blocked', error: 'Did not finish', queued: 2 })
    for (let repeat = 0; repeat < 3; repeat++) f.manager.observeSessions(await f.sessions.allForManager([f.root]))
    await vi.advanceTimersByTimeAsync(4_999)
    expect(f.sent.filter((one) => one.id === id)).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    await settle()
    expect(f.sent.filter((one) => one.id === id)).toHaveLength(2)
    expect(f.sent.at(-1)?.text).toContain('Automatic recovery.')
    expect(f.sent.at(-1)?.text).toContain('Do not replay interrupted messages or past operations.')
    expect(await f.manager.view()).toMatchObject({ state: 'working', session: { id }, config: { chatModel: 'sonnet' } })
    f.finish(id, 'Reconciled')
    await settle()
    expect(f.sent.at(-1)?.text).toBe('[Telegram]\nNext request')
    f.finish(id, 'Next complete')
    await settle()
    expect(f.sent.at(-1)?.text).toBe('[Telegram]\nLast request')
    f.finish(id, 'Last complete')
    await settle()
    expect((await f.manager.view()).error).toBeUndefined()
    expect(f.sent.filter((one) => one.text === '[Telegram]\nPossibly delivered request')).toHaveLength(1)
    expect((await f.manager.view()).workers.find((one) => one.id === worker)?.state).toBe('working')
    expect(f.cli).toHaveLength(0)
  })

  it('backs off repeated failures to one minute and resets only after a completed turn', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Coordinate')
    await settle()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    for (const delay of [5_000, 10_000, 20_000, 40_000, 60_000, 60_000]) {
      const count = f.sent.length
      f.hear(id, { items: [], gone: [], signals: [{ kind: 'ended', how: 'failed' }] })
      await vi.advanceTimersByTimeAsync(delay - 1)
      expect(f.sent).toHaveLength(count)
      await vi.advanceTimersByTimeAsync(1)
      await settle()
      expect(f.sent).toHaveLength(count + 1)
    }
    f.finish(id, 'Recovered')
    await settle()
    await f.manager.send('New request')
    await settle()
    f.hear(id, { items: [], gone: [], signals: [{ kind: 'ended', how: 'failed' }] })
    const count = f.sent.length
    await vi.advanceTimersByTimeAsync(5_000)
    await settle()
    expect(f.sent).toHaveLength(count + 1)
  })

  it('accepts a late completed result and cancels an unnecessary recovery', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Coordinate')
    await settle()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    f.hear(id, { items: [], gone: [], signals: [{ kind: 'ended', how: 'failed' }] })
    f.finish(id, 'Completed after the disconnect')
    await settle()
    expect((await f.manager.view()).error).toBeUndefined()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(f.sent).toHaveLength(1)
  })

  it('recovers a saved failure after reload with retained inbox and backing identity', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Interrupted request')
    await settle()
    await f.manager.send('Saved pending request')
    f.hear(id, { items: [], gone: [], signals: [{ kind: 'ended', how: 'failed' }] })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const reloaded = f.reload()
    await settle()
    await vi.advanceTimersByTimeAsync(5_000)
    await settle()
    expect(f.sent.at(-1)?.text).toContain('Automatic recovery.')
    expect((await reloaded.view()).session?.id).toBe(id)
    f.finish(id, 'Current work reconciled')
    await settle()
    expect(f.sent.at(-1)?.text).toBe('Saved pending request')
    expect(f.sent.filter((one) => one.text === 'Interrupted request')).toHaveLength(1)
  })

  it('reconciles an interrupted send after restart without resending its input', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.open()
    const path = join(f.directory, 'manager.json')
    const stored = JSON.parse(await readFile(path, 'utf8')) as Pick<ManagerView, 'config'>
    await writeFile(path, JSON.stringify({ ...stored, inbox: [
      { id: 'interrupted-send', text: 'Possibly delivered', source: 'telegram', at: 1, state: 'sending' },
      { id: 'queued-next', text: 'Waiting request', source: 'desktop', at: 2, state: 'queued' },
    ] }))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const recovered = f.reload()
    await settle()
    expect((await recovered.view()).state).toBe('blocked')
    await vi.advanceTimersByTimeAsync(5_000)
    await settle()
    expect(f.sent).toHaveLength(1)
    expect(f.sent[0]?.text).toContain('Automatic recovery.')
    f.finish(id, 'Reconciled actual state')
    await settle()
    expect(f.sent.at(-1)?.text).toBe('Waiting request')
    expect(f.sent.some((one) => one.text.includes('Possibly delivered'))).toBe(false)
  })

  it.each(['pause', 'disable', 'dispose', 'retry', 'restart'] as const)('cancels the pending retry on %s', async (action) => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Coordinate')
    await settle()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    f.hear(id, { items: [], gone: [], signals: [{ kind: 'ended', how: 'failed' }] })
    if (action === 'disable') await f.manager.configure({ enabled: false })
    else if (action === 'dispose') f.manager.dispose()
    else await f.manager[action]()
    await settle()
    const count = f.sent.length
    await vi.advanceTimersByTimeAsync(60_000)
    await settle()
    expect(f.sent).toHaveLength(count)
  })

  it.each(['blocked', 'limit', 'signedOut', 'offPlan'] as const)('does not retry a native %s refusal', async (how) => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Coordinate')
    await settle()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    f.hear(id, { items: [], gone: [], signals: [{ kind: 'ended', how }] })
    await settle()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(f.sent).toHaveLength(1)
    const reloaded = f.reload()
    await settle()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(f.sent).toHaveLength(1)
    expect((await reloaded.view()).session?.id).toBe(id)
  })

  it.each([VPN_IP_CONFIGURATION_ERROR, 'VPN unavailable', `${vpnIpMismatchError('8.8.8.8')} Extra hook refusal`, vpnIpMismatchError('127.0.0.1')])('keeps non-transient guard failure %s held for manual retry', async (error) => {
    const f = await fixture(0, { beforeSend: () => { throw new Error(error) } })
    await f.manager.configure({ enabled: true })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await f.manager.send('Guarded request')
    await settle()
    expect((await f.manager.view()).state).toBe('blocked')
    const stored = await readFile(join(f.directory, 'manager.json'), 'utf8')
    await vi.advanceTimersByTimeAsync(60_000)
    await settle()
    expect(f.made).toHaveLength(0)
    expect(await readFile(join(f.directory, 'manager.json'), 'utf8')).toBe(stored)
  })

  it.each([VPN_IP_UNAVAILABLE_ERROR, vpnIpMismatchError('8.8.8.8')])('revalidates an unavailable public IP and sends the held request once before queued input (%s)', async (guardError) => {
    let unavailable = true
    const check = vi.fn(() => { if (unavailable) throw new Error(guardError) })
    const f = await fixture(0, { beforeSend: check })
    await f.manager.configure({ enabled: true })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const id = await f.manager.send('Held Telegram request', 'telegram')
    await settle()
    await f.manager.send('Next request', 'telegram')
    expect(await f.manager.view()).toMatchObject({ state: 'blocked', error: guardError, queued: 1 })
    expect(f.made).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(5_000)
    await settle()
    expect(check).toHaveBeenCalledTimes(2)
    expect(f.made).toHaveLength(0)
    expect(f.notes.all()[id]?.heldOperation?.kind).toBe('message')
    unavailable = false
    await vi.advanceTimersByTimeAsync(9_999)
    expect(f.sent).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    await settle()
    expect(check.mock.calls.length).toBeGreaterThan(2)
    expect(f.sent.map((one) => one.text)).toEqual(['[Telegram]\nHeld Telegram request'])
    expect(f.notes.all()[id]?.guardError).toBeUndefined()
    expect(f.notes.all()[id]?.heldOperation).toBeUndefined()
    expect(await f.manager.view()).toMatchObject({ state: 'working', session: { id } })
    f.finish(id, 'Held request complete')
    await settle()
    expect(f.sent.map((one) => one.text)).toEqual(['[Telegram]\nHeld Telegram request', '[Telegram]\nNext request'])
  })

  it.each([VPN_IP_UNAVAILABLE_ERROR, vpnIpMismatchError('8.8.8.8')])('recovers a lookup hold saved by the old manual-only policy after reload (%s)', async (guardError) => {
    let unavailable = true
    const f = await fixture(0, { beforeSend: () => { if (unavailable) throw new Error(guardError) } })
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Saved held request')
    await settle()
    const path = join(f.directory, 'manager.json')
    const saved = JSON.parse(await readFile(path, 'utf8')) as Pick<ManagerView, 'config'>
    await writeFile(path, JSON.stringify({ ...saved, manualRecovery: true, error: 'Not sent' }))
    unavailable = false
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const reloaded = f.reload()
    await settle()
    await vi.advanceTimersByTimeAsync(5_000)
    await settle()
    expect(f.sent.map((one) => one.text)).toEqual(['Saved held request'])
    expect(await reloaded.view()).toMatchObject({ state: 'working', session: { id } })
    expect((await reloaded.view()).error).toBeUndefined()
  })

  it.each([VPN_IP_UNAVAILABLE_ERROR, vpnIpMismatchError('8.8.8.8')])('manual retry revalidates the original held message without queuing behind it (%s)', async (guardError) => {
    let unavailable = true
    const f = await fixture(0, { beforeSend: () => { if (unavailable) throw new Error(guardError) } })
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Retry this held message')
    await settle()
    unavailable = false
    await f.manager.retry()
    await settle()
    expect(f.sent.map((one) => one.text)).toEqual(['Retry this held message'])
    expect(f.notes.all()[id]?.queued ?? []).toHaveLength(0)
    expect((await f.manager.view()).error).toBeUndefined()
  })

  it('keeps bounded revalidation through unavailable and mismatch until the current IP passes', async () => {
    let error = VPN_IP_UNAVAILABLE_ERROR
    const check = vi.fn(() => { if (error !== '') throw new Error(error) })
    const f = await fixture(0, { beforeSend: check })
    await f.manager.configure({ enabled: true })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await f.manager.send('Guarded request')
    await settle()
    error = vpnIpMismatchError('8.8.8.8')
    await vi.advanceTimersByTimeAsync(5_000)
    await settle()
    expect((await f.manager.view()).error).toBe(error)
    await vi.advanceTimersByTimeAsync(120_000)
    await settle()
    expect(check).toHaveBeenCalledTimes(5)
    expect(f.made).toHaveLength(0)
    error = ''
    await vi.advanceTimersByTimeAsync(60_000)
    await settle()
    expect(f.sent.map((one) => one.text)).toEqual(['Guarded request'])
  })

  it('does not retry a held native approval answer after a lookup failure', async () => {
    let unavailable = false
    const f = await fixture(0, { beforeSend: () => { if (unavailable) throw new Error(VPN_IP_UNAVAILABLE_ERROR) } })
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Coordinate')
    await settle()
    f.hear(id, { items: [], gone: [], signals: [{ kind: 'asks', ask: 'approval', wanted: { kind: 'command', command: 'inspect project' } }] })
    const decision = (await f.manager.view()).decisions[0]
    if (decision === undefined) throw new Error('Missing native decision')
    unavailable = true
    await expect(f.manager.answer(decision.id, 'once')).rejects.toThrow('Answer was not sent')
    expect(f.notes.all()[id]?.heldOperation?.kind).toBe('answer')
    unavailable = false
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    expect(await f.sessions.retryManager(id, 'Do not send')).toBe(false)
    await vi.advanceTimersByTimeAsync(120_000)
    await settle()
    expect(f.answers).toHaveLength(0)
    expect(f.sent).toHaveLength(1)
  })

  it('does not revalidate a saved message hold while a native question is pending', async () => {
    const check = vi.fn(() => undefined)
    const f = await fixture(0, { beforeSend: check })
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Coordinate')
    await settle()
    f.hear(id, { items: [], gone: [], signals: [{ kind: 'asks', ask: 'approval', wanted: { kind: 'command', command: 'inspect project' } }] })
    const heldOperation = { kind: 'message' as const, message: { session: id, root: f.root, mode: 'manual' as const, text: 'Held unsent request' }, go: true }
    f.notes.set(id, { ...f.notes.all()[id], guardError: vpnIpMismatchError('8.8.8.8'), heldOperation })
    const calls = check.mock.calls.length
    expect(f.sessions.pendingForManager(id)).toHaveLength(1)
    expect(await f.sessions.retryManager(id, 'Reconcile only after native answer')).toBe(false)
    expect(check).toHaveBeenCalledTimes(calls)
    expect(f.notes.all()[id]?.heldOperation).toEqual(heldOperation)
    expect(f.answers).toHaveLength(0)
    expect(f.sent).toHaveLength(1)
  })

  it.each(['pause', 'disable', 'restart'] as const)('cancels a mismatch retry in flight on %s', async (action) => {
    let rechecking = false
    let release: (() => void) | undefined
    const f = await fixture(0, { beforeSend: () => {
      if (!rechecking) throw new Error(vpnIpMismatchError('8.8.8.8'))
      return new Promise<void>((resolve) => { release = resolve })
    } })
    await f.manager.configure({ enabled: true })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await f.manager.send('Never deliver after cancellation')
    await settle()
    rechecking = true
    await vi.advanceTimersByTimeAsync(5_000)
    await settle()
    expect(release).toBeDefined()
    if (action === 'disable') await f.manager.configure({ enabled: false })
    else await f.manager[action]()
    release?.()
    await settle()
    expect(f.sent.some((one) => one.text.includes('Never deliver after cancellation'))).toBe(false)
  })

  it.each([VPN_IP_UNAVAILABLE_ERROR, vpnIpMismatchError('8.8.8.8')])('reconciles an active turn paused by the VPN monitor without replaying the original input (%s)', async (guardError) => {
    let unavailable = false
    let policy: string | undefined
    const f = await fixture(0, { vpnMonitor: () => policy, beforeSend: () => { if (unavailable) throw new Error(guardError) } })
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Already delivered request')
    await settle()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    unavailable = true
    policy = 'approved'
    f.sessions.again()
    await settle()
    expect(f.notes.all()[id]?.guardError).toBe(vpnIpPausedError(guardError))
    expect(f.notes.all()[id]?.heldOperation?.kind).toBe('continue')
    unavailable = false
    policy = undefined
    await vi.advanceTimersByTimeAsync(5_000)
    await settle()
    expect(f.sent).toHaveLength(2)
    expect(f.sent.at(-1)?.text).toContain('Automatic recovery.')
    expect(f.sent.filter((one) => one.text === 'Already delivered request')).toHaveLength(1)
    expect((await f.manager.view()).error).toBeUndefined()
  })

  it('retries only the selected provider and ignores recovery creation finishing after pause', async () => {
    const plugin = library()
    const f = await fixture(0, { plugins: [plugin.provider] })
    f.set({ chatProviders: ['claude', 'plugin:manager-test'], providerPlugins: [plugin.provider] })
    plugin.create.mockRejectedValueOnce(new Error('Temporarily unavailable'))
    await expect(f.manager.configure({ enabled: true, provider: 'plugin:manager-test' })).rejects.toThrow('Temporarily unavailable')
    let accept: ((id: string) => void) | undefined
    plugin.create.mockImplementationOnce(() => new Promise<string>((resolve) => { accept = resolve }))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const recovered = f.reload()
    await settle()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(plugin.create).toHaveBeenCalledTimes(2)
    await recovered.pause()
    accept?.('plugin:manager-test:late-recovery')
    await settle()
    expect((await recovered.view()).state).toBe('paused')
    expect(plugin.sent).toHaveLength(0)
    expect(f.made).toHaveLength(0)
  })

  it('retries a temporary creation error without falling back to another assistant', async () => {
    const plugin = library()
    const f = await fixture(0, { plugins: [plugin.provider] })
    f.set({ chatProviders: ['claude', 'plugin:manager-test'], providerPlugins: [plugin.provider] })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    plugin.create.mockRejectedValueOnce(new Error('Temporary library outage'))
    await expect(f.manager.configure({ enabled: true, provider: 'plugin:manager-test' })).rejects.toThrow('Temporary library outage')
    await vi.advanceTimersByTimeAsync(5_000)
    await settle()
    expect(plugin.create).toHaveBeenCalledTimes(2)
    expect(plugin.sent).toHaveLength(1)
    expect(plugin.sent[0]?.text).toContain('Automatic recovery.')
    expect((await f.manager.view()).config.provider).toBe('plugin:manager-test')
    expect(f.made).toHaveLength(0)
  })
})

describe('Manager reply provenance', () => {
  it('binds real worker-event turns to their causal tasks, preserving multiple candidates and ownership', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const manager = await f.manager.open()
    const first = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'First task' }, 'manager', 'reply-first')
    const second = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'Second task' }, 'manager', 'reply-second')
    const responses: { readonly text: string; readonly origin: ManagerReplyOrigin }[] = []
    f.manager.onResponse((text, origin) => responses.push({ text, origin }))
    f.finish(first, 'First result')
    await vi.waitFor(() => expect(f.sent.some((one) => one.id === manager && one.text.includes(first))).toBe(true))
    f.finish(second, 'Second result')
    f.finish(manager, 'First task report')
    await vi.waitFor(() => expect(responses.some((one) => one.text === 'First task report')).toBe(true))
    expect(responses.find((one) => one.text === 'First task report')?.origin.workers).toEqual([first])
    await vi.waitFor(() => expect(f.sent.some((one) => one.id === manager && one.text.includes(second))).toBe(true))
    f.finish(manager, 'Second task report')
    await vi.waitFor(() => expect(responses.some((one) => one.text === 'Second task report')).toBe(true))
    expect(responses.find((one) => one.text === 'Second task report')?.origin.workers).toEqual([second])
    const reference = { session: manager, workers: [first], chatId: 81, messageId: 101, text: 'First task report' }
    await f.manager.reply('Correct original', 'reply-original', reference)
    await vi.waitFor(() => expect(f.sent.some((one) => one.text.includes('Correct original') && one.text.includes(first))).toBe(true))
    expect(f.sent.filter((one) => one.id === first || one.id === second)).toHaveLength(2)
    await expect(f.manager.reply('Do not attach', 'forged', { ...reference, workers: ['manual-session'] })).rejects.toThrow('no longer authorized')
    await expect(f.manager.reply('Do not attach', 'forged-manager', { ...reference, session: 'manual-session' })).rejects.toThrow('no longer authorized')
    let checks = 0
    await expect(f.manager.reply('Revoked during refresh', 'revoked-refresh', reference, () => ++checks < 2)).rejects.toThrow('no longer authorized')
    checks = 0
    await expect(f.manager.reply('Revoked during open', 'revoked-open', reference, () => ++checks < 3)).rejects.toThrow('no longer authorized')
    expect(f.sent.some((one) => one.text.includes('Revoked during'))).toBe(false)
    f.finish(manager, 'Reply received')
    await vi.waitFor(() => expect(responses.some((one) => one.text === 'Reply received')).toBe(true))
    await f.manager.send('Reconcile both', 'event', 'mixed-tasks', [first, second])
    await vi.waitFor(() => expect(f.sent.some((one) => one.text.includes('Reconcile both'))).toBe(true))
    f.finish(manager, 'Both reports')
    await vi.waitFor(() => expect(responses.some((one) => one.text === 'Both reports')).toBe(true))
    expect(responses.find((one) => one.text === 'Both reports')?.origin.workers).toEqual([first, second])
    expect((await f.manager.view()).workers.map((one) => one.id)).toEqual(expect.arrayContaining([first, second]))
    const { managerOwner: _owner, ...detached } = f.notes.all()[first] ?? {}
    f.notes.set(first, detached)
    await expect(f.manager.reply('Old task detached', 'detached', reference)).rejects.toThrow('no longer authorized')
  })
})

describe('Manager session inspection', () => {
  it('reads only the retained current backing without starting work, including disabled providers and Manager', async () => {
    const f = await fixture()
    await expect(f.manager.inspect('missing')).rejects.toThrow('Manager session changed')
    await f.manager.configure({ enabled: true })
    const id = await f.manager.open()
    expect(await f.manager.inspect(id)).toEqual({ id, items: [] })
    expect(f.made).toHaveLength(0)
    await f.manager.configure({ enabled: false })
    f.set({ chatProviders: [] })
    expect((await f.manager.view()).session?.id).toBe(id)
    expect(await f.manager.inspect(id)).toEqual({ id, items: [] })
    expect(f.made).toHaveLength(0)
    expect(f.settings().chatProviders).toEqual([])
    await expect(f.sessions.items(id)).rejects.toThrow('Use Telegram')
    await expect(f.sessions.inspectManager('ordinary')).rejects.toThrow('not a Manager session')
  })

  it('streams only current Manager items with role instructions and CLI blocks removed', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.open()
    const heard: SessionItems[] = []
    const off = f.manager.onItems((items) => heard.push(items))
    await f.manager.send('Check the project.', 'telegram')
    await vi.waitFor(() => expect(f.made).toHaveLength(1))
    f.hear(id, { items: [{ kind: 'theirs', id: 'inspection-answer', text: 'Checking.\n\n```geckit\n{"id":"inspect-only","args":["sessions","list"]}\n```' }], gone: [], signals: [] })
    const snapshot = await f.manager.inspect(id)
    expect(JSON.stringify(snapshot)).not.toContain(MANAGER_INSTRUCTIONS)
    expect(JSON.stringify(snapshot)).not.toContain('```geckit')
    expect(snapshot.items).toContainEqual(expect.objectContaining({ kind: 'theirs', id: 'inspection-answer', text: 'Checking.' }))
    expect(heard.flatMap((items) => items.items)).toContainEqual(expect.objectContaining({ kind: 'theirs', id: 'inspection-answer', text: 'Checking.' }))
    expect(f.fanned.some((items) => items.id === id)).toBe(false)
    off()
    const count = heard.length
    f.hear(id, { items: [], gone: ['inspection-answer'], signals: [] })
    expect(heard).toHaveLength(count)
    await f.manager.restart()
    await expect(f.manager.inspect(id)).rejects.toThrow('Manager session changed')
  })

  it('rejects a read that finishes after the current session is replaced', async () => {
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const f = await fixture(0, { disk: { list: async () => [], has: async () => false, read: async () => { await gate; return undefined } } })
    await f.manager.configure({ enabled: true })
    const id = await f.manager.open()
    const read = f.manager.inspect(id)
    const rejected = expect(read).rejects.toThrow('Manager session changed')
    await f.manager.restart()
    release?.()
    await rejected
  })
})

describe('Manager session', () => {
  it('retains the normal Claude runtime and permissions without stripping tools or customization', () => {
    const args = claudeArgs({ id: 'session', mode: 'manual', resume: false, managerPrompt: 'Only GeckIt CLI' })
    expect(args).toEqual(expect.arrayContaining(['--chrome', '--permission-mode', 'manual']))
    expect(args).not.toContain('--tools')
    expect(args).not.toContain('--safe-mode')
    expect(args).not.toContain('--strict-mcp-config')
    expect(args).not.toContain('--bare')
    expect(args).not.toContain('--dangerously-skip-permissions')
  })

  it('runs a retained Telegram session, rejects ordinary chat access and never broadcasts its transcript', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true, chatModel: 'sonnet' })
    const id = await f.manager.open()
    await expect(f.sessions.send({ session: id, root: f.root, mode: 'auto', text: 'Bypass Telegram' })).rejects.toThrow('Use Telegram to talk to Manager.')
    await f.manager.send('Coordinate my projects', 'telegram')
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    expect(f.made[0]?.managerPrompt).toContain('Your role is coordination through GeckIt CLI')
    expect(f.sent[0]?.input).toContain(MANAGER_INSTRUCTIONS)
    expect(f.made[0]?.model).toBe('sonnet')
    expect(f.made[0]?.mode).toBe(f.settings().chatMode)
    await expect(f.sessions.shell({ session: id, root: f.root, command: 'touch escaped' })).rejects.toThrow('restricted CLI')
    expect(await f.sessions.remote(id, true)).toHaveProperty('error')
    f.finish(id, f.command('discover', ['projects', 'list']))
    await vi.waitFor(() => expect(f.cli).toHaveLength(1))
    await vi.waitFor(() => expect(f.sent).toHaveLength(2))
    expect(f.sent[1]?.text).toContain('[GeckIt CLI result]')
    await expect(f.sessions.items(id)).rejects.toThrow('Use Telegram to talk to Manager.')
    await expect(f.sessions.links(id)).rejects.toThrow('Use Telegram to talk to Manager.')
    expect(f.fanned.filter((one) => one.id === id)).toEqual([])
    expect((await f.manager.view()).session?.id).toBe(id)
  })

  it('hides current, archived and durable-role histories from discovery while keeping managed workers usable', async () => {
    const plugin = library()
    const rows: Awaited<ReturnType<LlmProvider['list']>> = []
    const provider: LlmProvider = { ...plugin.provider, list: async () => rows, search: async () => rows.map((row) => ({ id: row.id, root: row.root, count: 1, said: 'Matching task' })), hidden: async () => rows.map((row) => ({ ...row, cwd: row.root, driven: true })) }
    const f = await fixture(0, { plugins: [provider], there: async () => true })
    f.set({ chatProviders: ['plugin:manager-test'], chatProvider: 'plugin:manager-test', providerPlugins: [provider] })
    await f.manager.configure({ enabled: true, provider: 'plugin:manager-test' })
    const original = await f.manager.send('Only Telegram', 'telegram')
    await vi.waitFor(() => expect(plugin.sent).toHaveLength(1))
    await f.manager.pause()
    const next = (await f.manager.restart()).session?.id ?? ''
    const worker = await f.sessions.startManaged({ root: f.root, mode: 'auto', provider: 'plugin:manager-test', text: 'Worker task' }, 'manager', 'visible-worker')
    const legacy = 'plugin:manager-test:old-role'
    f.notes.set(legacy, { managerPrompt: MANAGER_INSTRUCTIONS, title: 'Old manager', cut: { root: f.root, at: Date.now() } })
    for (const id of [original, next, worker, legacy]) rows.push({ id, root: f.root, title: id, stands: '', at: Date.now(), driven: false })
    expect((await f.sessions.list([f.root])).map((one) => one.id)).toEqual([worker])
    expect((await f.sessions.allForManager([f.root])).filter((one) => one.manager === true).map((one) => one.id)).toEqual(expect.arrayContaining([original, next]))
    expect((await f.sessions.search([f.root], 'task')).map((one) => one.id)).toEqual([worker])
    expect(f.sessions.queuedHolding([f.root], 'Telegram')).toEqual([])
    const hidden = (await f.sessions.hidden([f.root], false)).flatMap((folder) => folder.chats).map((one) => one.id)
    expect(f.sessions.cutOff()).toEqual([])
    for (const id of [original, next, legacy]) {
      expect(hidden).not.toContain(id)
      expect(() => f.sessions.watching(id)).not.toThrow()
      expect(f.sessions.watched()).toBeUndefined()
      expect(f.sessions.isManager(id)).toBe(true)
      await expect(f.sessions.items(id)).rejects.toThrow('Use Telegram to talk to Manager.')
      await expect(f.sessions.links(id)).rejects.toThrow('Use Telegram to talk to Manager.')
      await expect(f.sessions.send({ session: id, root: f.root, mode: 'auto', text: 'Bypass' })).rejects.toThrow('Use Telegram to talk to Manager.')
      expect(() => f.sessions.bring(id)).toThrow('Use Telegram to talk to Manager.')
    }
    expect(f.sessions.isManager(worker)).toBe(false)
    expect((await f.sessions.list([f.root]))[0]).toMatchObject({ id: worker, managerManaged: true })
    expect((await f.sessions.items(worker)).some((one) => one.kind === 'mine' && one.text === 'Worker task')).toBe(true)
    await f.sessions.send({ session: worker, root: f.root, mode: 'auto', text: 'Normal worker follow-up' })
    const restored = f.reload()
    expect((await restored.view()).session?.id).toBe(next)
    expect((await f.sessions.list([f.root])).map((one) => one.id)).toEqual([worker])
  })

  it('reports a delivered native answer even when the next provider refresh fails', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const worker = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'Inspect project' }, 'manager', 'refresh-worker')
    f.hear(worker, { items: [], gone: [], signals: [{ kind: 'asks', ask: 'approval', wanted: { kind: 'command', command: 'inspect project' } }] })
    const decision = (await f.manager.view()).decisions[0]
    if (decision === undefined) throw new Error('Missing native approval')
    const refresh = vi.spyOn(f.sessions, 'allForManager').mockRejectedValue(new Error('Provider refresh unavailable'))
    await expect(f.manager.answer(decision.id, 'once')).resolves.toMatchObject({ answer: 'Answer sent.', decisions: [] })
    expect(f.answers).toEqual([{ id: worker, ask: 'approval', answer: 'once' }])
    expect(refresh).not.toHaveBeenCalled()
  })

  it('reports a recorded uncertainty review even when a subsequent provider refresh would fail', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const path = join(f.directory, 'manager.json')
    const stored = JSON.parse(await readFile(path, 'utf8')) as Pick<ManagerView, 'config'>
    const args = ['telegram', 'send-file', '--id', 'worker', '--path', 'report.txt']
    await writeFile(path, JSON.stringify({ ...stored, operations: [{ id: 'upload', at: 1, command: args, state: 'uncertain' }], decisions: [{ id: 'review', uncertain: true, command: { id: 'upload', args }, title: 'Check state', choices: [{ label: 'I checked its state', value: 'reviewed' }] }] }))
    const restored = f.reload()
    const rows = await f.sessions.allForManager([f.root])
    const refresh = vi.spyOn(f.sessions, 'allForManager').mockResolvedValueOnce(rows).mockRejectedValue(new Error('Provider refresh unavailable'))
    await expect(restored.answer('review', 'reviewed')).resolves.toMatchObject({ answer: expect.stringContaining('Review recorded'), decisions: [], activity: [{ id: 'upload', state: 'uncertain' }] })
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(f.cli).toHaveLength(0)
  })

  it('answers a current Manager permission through the Telegram decision without exposing its transcript', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Coordinate', 'telegram')
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    f.hear(id, { items: [], gone: [], signals: [{ kind: 'asks', ask: 'native-approval', wanted: { kind: 'command', command: 'inspect project' } }] })
    const decision = (await f.manager.view()).decisions[0]
    expect(decision).toMatchObject({ title: expect.stringContaining('inspect project'), choices: expect.arrayContaining([{ label: 'Allow once', value: 'once' }]) })
    expect(f.answers).toEqual([])
    await expect(f.sessions.answer(id, 'native-approval', 'once')).rejects.toThrow('Use Telegram to talk to Manager.')
    if (decision === undefined) throw new Error('Missing native decision')
    await f.manager.answer(decision.id, 'once')
    expect(f.answers).toEqual([{ id, ask: 'native-approval', answer: 'once' }])
    expect((await f.manager.view()).decisions).toEqual([])
    expect(f.fanned.filter((one) => one.id === id)).toEqual([])
  })

  it('binds native worker actions to the exact current request and supports Computer Use remember semantics', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'Check Mail' }, 'manager', 'native-worker')
    const wanted = { kind: 'elicitation', serverName: 'cua_repl', message: 'Allow Computer Use to use "Mail"?', fields: [], rememberAllowed: true } as const
    f.hear(id, { items: [], gone: [], signals: [{ kind: 'asks', ask: 'approval', wanted }] })
    const decision = (await f.manager.view()).decisions.find((one) => one.title.includes('Mail'))
    if (decision === undefined) throw new Error('Missing native decision')
    expect(decision.choices.map((one) => one.label)).toEqual(['Decline', 'Allow once', 'Allow for this session'])
    await expect(f.manager.answer(decision.id, 'yes')).rejects.toThrow('choices')
    f.hear(id, { items: [], gone: [], signals: [{ kind: 'asks', ask: 'approval', wanted: { ...wanted, message: 'Allow Computer Use to use "Calendar"?' } }] })
    await expect(f.manager.answer(decision.id, decision.choices[1]?.value ?? '')).resolves.toMatchObject({ answer: expect.stringContaining('no longer pending') })
    expect(f.answers).toEqual([])
    const current = (await f.manager.view()).decisions.find((one) => one.title.includes('Calendar'))
    if (current === undefined) throw new Error('Missing replacement decision')
    await f.manager.answer(current.id, current.choices[2]?.value ?? '')
    expect(f.answers.at(-1)).toMatchObject({ id, ask: 'approval', answer: JSON.stringify({ action: 'accept', content: {}, _meta: null, remember: true }) })
    await expect(f.manager.answer(current.id, current.choices[2]?.value ?? '')).resolves.toMatchObject({ answer: expect.stringContaining('no longer pending') })
    expect(f.answers).toHaveLength(1)
  })

  it('keeps approvals in their worker and expires old buttons when the coordinator restarts', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const first = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'First' }, 'manager', 'first')
    const second = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'Second' }, 'manager', 'second')
    for (const id of [first, second]) f.hear(id, { items: [], gone: [], signals: [{ kind: 'asks', ask: 'same-id', wanted: { kind: 'command', command: 'same command' } }] })
    const decisions = (await f.manager.view()).decisions
    expect(decisions).toHaveLength(2)
    if (decisions[0] === undefined || decisions[1] === undefined) throw new Error('Missing worker decisions')
    await f.manager.answer(decisions[0].id, 'once')
    expect(f.answers).toHaveLength(1)
    expect((await f.manager.view()).decisions.map((one) => one.id)).toEqual([decisions[1].id])
    await f.manager.restart()
    await expect(f.manager.answer(decisions[1].id, 'once')).resolves.toMatchObject({ answer: expect.stringContaining('no longer pending') })
    const current = (await f.manager.view()).decisions[0]
    if (current === undefined) throw new Error('Missing fresh decision')
    await f.manager.answer(current.id, 'no')
    expect(f.answers).toHaveLength(2)
    expect(new Set(f.answers.map((one) => one.id)).size).toBe(2)
  })

  it('uses exact plan and question choices while leaving unsupported free-text questions to GeckIt', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'Task' }, 'manager', 'questions')
    f.hear(id, { items: [], gone: [], signals: [{ kind: 'asks', ask: 'plan', wanted: { kind: 'start', plan: 'Make the requested change' } }] })
    const plan = (await f.manager.view()).decisions[0]
    expect(plan?.choices).toEqual([{ label: 'Keep reading only', value: 'no' }, { label: 'Start', value: 'once' }])
    await f.manager.answer(plan?.id ?? '', 'once')
    f.hear(id, { items: [], gone: [], signals: [{ kind: 'asks', ask: 'question', wanted: { kind: 'question', question: 'Which project?', choices: ['First', 'Second'] } }] })
    const question = (await f.manager.view()).decisions[0]
    await expect(f.manager.answer(question?.id ?? '', 'unlisted')).rejects.toThrow('choices')
    await f.manager.answer(question?.id ?? '', 'Second')
    expect(f.answers.map((one) => one.answer)).toEqual(['once', 'Second'])
    f.hear(id, { items: [], gone: [], signals: [{ kind: 'asks', ask: 'free', wanted: { kind: 'question', question: 'Write the details', choices: [] } }] })
    expect((await f.manager.view()).decisions[0]).toMatchObject({ title: expect.stringContaining('native GeckIt UI'), choices: [] })
  })

  it('rejects a changed request, concurrent answer and revoked authority after the native guard waits', async () => {
    let pending = false
    const gate: { release?: () => void } = {}
    const release = (): void => gate.release?.()
    const f = await fixture(0, { beforeSend: async () => { if (pending) await new Promise<void>((done) => { gate.release = done }) } })
    await f.manager.configure({ enabled: true })
    const id = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'A task' }, 'manager', 'guarded')
    const wanted = { kind: 'command', command: 'first command' } as const
    f.hear(id, { items: [], gone: [], signals: [{ kind: 'asks', ask: 'approval', wanted }] })
    const first = (await f.manager.view()).decisions[0]
    if (first === undefined) throw new Error('Missing first decision')
    pending = true
    const answer = f.manager.answer(first.id, 'once')
    await vi.waitFor(() => expect(gate.release).toBeDefined())
    await expect(f.manager.answer(first.id, 'once')).rejects.toThrow('not sent')
    f.hear(id, { items: [], gone: [], signals: [{ kind: 'asks', ask: 'approval', wanted }] })
    release()
    await expect(answer).resolves.toMatchObject({ answer: expect.stringContaining('no longer pending') })
    expect(f.answers).toEqual([])
    const current = (await f.manager.view()).decisions[0]
    expect(current?.id).not.toBe(first.id)
    if (current === undefined) throw new Error('Missing replacement')
    let authorized = true
    delete gate.release
    const revoked = f.manager.answer(current.id, 'once', () => authorized)
    await vi.waitFor(() => expect(gate.release).toBeDefined())
    authorized = false
    release()
    await expect(revoked).rejects.toThrow('not sent')
    expect(f.answers).toEqual([])
    pending = false
    await f.manager.answer(current.id, 'no')
    expect(f.answers).toEqual([{ id, ask: 'approval', answer: 'no' }])
  })

  it('retains refused native guard decisions and does not approve after disable or backing restart', async () => {
    let allowed = true
    const f = await fixture(0, { beforeSend: async () => { if (!allowed) throw new Error('VPN refused') } })
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Coordinate')
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    f.hear(id, { items: [], gone: [], signals: [{ kind: 'asks', ask: 'native', wanted: { kind: 'command', command: 'inspect' } }] })
    const decision = (await f.manager.view()).decisions[0]
    if (decision === undefined) throw new Error('Missing decision')
    allowed = false
    await expect(f.manager.answer(decision.id, 'once')).rejects.toThrow('not sent')
    expect((await f.manager.view()).decisions[0]?.id).toBe(decision.id)
    expect(f.answers).toEqual([])
    allowed = true
    await f.manager.restart()
    await expect(f.manager.answer(decision.id, 'once')).resolves.toMatchObject({ answer: expect.stringContaining('no longer pending') })
    await f.manager.configure({ enabled: false })
    await expect(f.manager.answer(decision.id, 'once')).rejects.toThrow('disabled')
    expect(f.answers).toEqual([])
  })

  it('requires the native UI for typed, URL, unsupported and oversized requests without approval buttons', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'A task' }, 'manager', 'forms')
    for (const wanted of [
      { kind: 'elicitation', serverName: 'form', message: 'Name?', fields: [{ name: 'name', label: 'Name', type: 'string', required: true }] },
      { kind: 'elicitation', serverName: 'form', message: 'Sign in', fields: [], url: 'https://example.com/login' },
      { kind: 'elicitation', serverName: 'form', message: 'Unsupported', fields: [], error: 'Unsupported schema' },
      { kind: 'command', command: 'x'.repeat(25_000) },
    ] as const) {
      f.hear(id, { items: [], gone: [], signals: [{ kind: 'asks', ask: 'form', wanted }] })
      const decision = (await f.manager.view()).decisions[0]
      expect(decision?.title).toContain('native GeckIt UI')
      expect(decision?.choices).toEqual([])
      await expect(f.manager.answer(decision?.id ?? '', 'once')).rejects.toThrow('choices')
    }
    expect(f.answers).toEqual([])
    expect((await f.sessions.items(id)).some((one) => one.kind === 'card' && one.card.answered === undefined)).toBe(true)
  })

  it('normalizes actual aggregated Manager output and hidden command gaps while preserving code', async () => {
    const f = await fixture()
    const replies: string[] = []
    f.manager.onResponse((text) => replies.push(text))
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Coordinate')
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    f.hear(id, { items: [
      { kind: 'theirs', id: 'empty', text: ' \n\n ' },
      { kind: 'theirs', id: 'reply', text: `First.\n\n${f.command('discover-gaps', ['capabilities'])}\n\n\nLast.\n\n\n` },
    ], gone: [], signals: [{ kind: 'ended', how: 'done' }] })
    await vi.waitFor(() => expect(replies).toHaveLength(1))
    expect(replies[0]).toBe('First.\n\nI will coordinate that.\n\nLast.')
    expect(managerMessage('```ts\n  first\n\n\n  second\n```')).toBe('```ts\n  first\n\n\n  second\n```')
  })

  it('requires enabled assistants and rejects unavailable models without fallback', async () => {
    const f = await fixture()
    await expect(f.manager.configure({ enabled: true, provider: 'plugin:disabled' })).rejects.toThrow('disabled')
    await expect(f.manager.configure({ enabled: true, chatModel: 'missing' })).rejects.toThrow('unavailable')
    f.set({ chatProviders: [] })
    await expect(f.manager.configure({ enabled: true })).rejects.toThrow('disabled')
    expect(f.made).toHaveLength(0)
  })

  it('runs every enabled library through its real ID, normal create/hold/send contract, model and role on resumed turns', async () => {
    const plugin = library()
    const f = await fixture(0, { plugins: [plugin.provider] })
    f.set({ chatProviders: ['plugin:manager-test'], chatProvider: 'plugin:manager-test', chatMode: 'plan', providerPlugins: [plugin.provider] })
    await f.manager.configure({ enabled: true, provider: 'plugin:manager-test', chatModel: 'library-model', instructions: 'Coordinate all my projects.' })
    const id = await f.manager.send('Start coordinating')
    await vi.waitFor(() => expect(plugin.sent).toHaveLength(1))
    expect(id).toBe('plugin:manager-test:1')
    expect(plugin.create).toHaveBeenCalledWith(expect.objectContaining({ mode: 'plan', model: 'library-model' }))
    expect(plugin.made[0]).toMatchObject({ id, model: 'library-model', mode: 'plan', resume: false })
    expect(plugin.sent[0]?.input).toContain(MANAGER_INSTRUCTIONS)
    expect(plugin.sent[0]?.input).toContain('Coordinate all my projects.')
    plugin.finish(id)
    await vi.waitFor(async () => expect((await f.manager.view()).state).toBe('idle'))
    await f.manager.configure({ chatModel: 'library-other' })
    await f.manager.send('Continue coordinating')
    await vi.waitFor(() => expect(plugin.made).toHaveLength(2))
    expect(plugin.made[1]).toMatchObject({ id, model: 'library-other', mode: 'plan', resume: true })
    expect(plugin.sent[1]?.input).toContain(MANAGER_INSTRUCTIONS)
    expect(plugin.sent[1]?.text).toBe('Continue coordinating')
    expect(plugin.create).toHaveBeenCalledTimes(1)
    expect(f.made).toHaveLength(0)
  })

  it('chooses the enabled app default on first setup and never implicitly creates Claude when it is disabled', async () => {
    const plugin = library()
    const f = await fixture(0, { plugins: [plugin.provider] })
    f.set({ chatProviders: ['plugin:manager-test'], chatProvider: 'claude', providerPlugins: [plugin.provider] })
    const manager = f.reload()
    await manager.configure({ enabled: true })
    expect((await manager.view()).config.provider).toBe('plugin:manager-test')
    expect((await manager.view()).providers).toEqual([{ provider: 'plugin:manager-test', available: true }])
    expect(plugin.create).toHaveBeenCalledTimes(1)
    expect(f.made).toHaveLength(0)
  })

  it('switches only the manager backing provider and preserves workers, pause state and queued requests', async () => {
    const plugin = library()
    const f = await fixture(1, { plugins: [plugin.provider] })
    f.set({ chatProviders: ['claude', 'plugin:manager-test'], providerPlugins: [plugin.provider] })
    const worker = await f.sessions.startManaged({ root: f.root, mode: 'auto', text: 'Working independently' }, 'manager', 'existing-work')
    await f.manager.configure({ enabled: true })
    const original = await f.manager.send('First accepted request')
    await vi.waitFor(async () => expect((await f.manager.view()).session?.queued).toHaveLength(1))
    await f.manager.send('Second accepted request')
    await f.manager.pause()
    const switched = await f.manager.configure({ provider: 'plugin:manager-test', chatModel: 'library-model' })
    expect(switched.state).toBe('paused')
    expect(switched.workers.map((one) => one.id)).toContain(worker)
    expect(switched.session?.id).toBe('plugin:manager-test:1')
    expect(switched.session?.id).not.toBe(original)
    expect(f.notes.all()[worker]?.managerOwner).toBe('manager')
    expect(plugin.sent).toHaveLength(0)
    await expect(f.sessions.send({ session: original, root: f.root, mode: 'auto', text: 'Old history' })).rejects.toThrow('Use Telegram to talk to Manager.')
    await f.manager.resume()
    f.finish(worker, 'Done')
    f.sessions.carryOn(switched.session?.id ?? '')
    await vi.waitFor(() => expect(plugin.sent).toHaveLength(1))
    expect(plugin.sent[0]?.text).toContain('Reconcile current managed tasks')
    plugin.finish(switched.session?.id ?? '')
    await vi.waitFor(() => expect(plugin.sent.length).toBeGreaterThan(1))
    expect(plugin.sent.map((one) => one.text)).not.toContain('Second accepted request')
    expect(f.made.filter((one) => one.id === worker)).toHaveLength(1)
    const stored = JSON.parse(await readFile(join(f.directory, 'manager.json'), 'utf8')) as { readonly inbox: readonly { readonly text: string; readonly state: string }[] }
    expect(stored.inbox.find((one) => one.text === 'First accepted request')?.state).toBe('queued')
    expect(stored.inbox.find((one) => one.text === 'Second accepted request')?.state).toBe('queued')
  })

  it('keeps provider creation failure blocked without fallback and retries the selected provider', async () => {
    const plugin = library()
    const f = await fixture(0, { plugins: [plugin.provider] })
    f.set({ chatProviders: ['claude', 'plugin:manager-test'], providerPlugins: [plugin.provider] })
    await f.manager.configure({ enabled: true })
    const previous = await f.manager.open()
    plugin.create.mockRejectedValueOnce(new Error('Library login is missing'))
    await expect(f.manager.configure({ provider: 'plugin:manager-test' })).rejects.toThrow('Library login is missing')
    expect(await f.manager.view()).toMatchObject({ state: 'blocked', config: { provider: 'plugin:manager-test' }, error: 'Library login is missing' })
    expect((await f.manager.view()).session).toBeUndefined()
    expect(f.manager.owns(previous)).toBe(true)
    const recovered = await f.manager.retry()
    expect(recovered.session?.id).toBe('plugin:manager-test:1')
    expect(f.made).toHaveLength(0)
  })

  it('cancels stale provider creation and cannot block a newer successful selection with its rejection', async () => {
    const plugin = library()
    const f = await fixture(0, { plugins: [plugin.provider] })
    f.set({ chatProviders: ['claude', 'plugin:manager-test'], providerPlugins: [plugin.provider] })
    let reject: ((reason: Error) => void) | undefined
    plugin.create.mockImplementationOnce(() => new Promise<string>((_resolve, no) => { reject = no }))
    const pending = f.manager.configure({ enabled: true, provider: 'plugin:manager-test' })
    const rejected = expect(pending).rejects.toThrow('Old provider failed')
    await vi.waitFor(() => expect(reject).toBeDefined())
    await f.manager.configure({ provider: 'claude' })
    reject?.(new Error('Old provider failed'))
    await rejected
    expect(await f.manager.view()).toMatchObject({ state: 'idle', config: { provider: 'claude' } })
    expect((await f.manager.view()).error).toBeUndefined()
  })

  it('keeps late provider creation archived when Manager is disabled while starting', async () => {
    const plugin = library()
    const f = await fixture(0, { plugins: [plugin.provider] })
    f.set({ chatProviders: ['plugin:manager-test'], providerPlugins: [plugin.provider] })
    let accept: ((id: string) => void) | undefined
    plugin.create.mockImplementationOnce(() => new Promise<string>((yes) => { accept = yes }))
    const pending = f.manager.configure({ enabled: true, provider: 'plugin:manager-test' })
    const cancelled = expect(pending).rejects.toThrow('setup changed')
    await vi.waitFor(() => expect(accept).toBeDefined())
    await f.manager.configure({ enabled: false })
    accept?.('plugin:manager-test:late')
    await cancelled
    expect(await f.manager.view()).toMatchObject({ state: 'off', config: { enabled: false } })
    expect((await f.manager.view()).session).toBeUndefined()
    expect((await f.manager.view()).error).toBeUndefined()
    expect(f.manager.owns('plugin:manager-test:late')).toBe(true)
    expect(plugin.sent).toHaveLength(0)
  })

  it('keeps the newer selected model when a prior provider creation completes late', async () => {
    const plugin = library()
    const f = await fixture(0, { plugins: [plugin.provider] })
    f.set({ chatProviders: ['plugin:manager-test'], providerPlugins: [plugin.provider] })
    let accept: ((id: string) => void) | undefined
    plugin.create.mockImplementationOnce(() => new Promise<string>((yes) => { accept = yes }))
    const initial = f.manager.configure({ enabled: true, provider: 'plugin:manager-test', chatModel: 'library-model' })
    const cancelled = expect(initial).rejects.toThrow('setup changed')
    await vi.waitFor(() => expect(accept).toBeDefined())
    await f.manager.configure({ chatModel: 'library-other' })
    accept?.('plugin:manager-test:old-model')
    await cancelled
    await f.manager.send('Use the selected model')
    await vi.waitFor(() => expect(plugin.sent).toHaveLength(1))
    expect(plugin.made[0]).toMatchObject({ id: 'plugin:manager-test:1', model: 'library-other' })
    expect((await f.manager.view()).error).toBeUndefined()
    expect(f.manager.owns('plugin:manager-test:old-model')).toBe(true)
  })

  it('ignores a stale send failure after replacement and retains pending requests without replaying the interrupted turn', async () => {
    const plugin = library()
    let reject: ((error: Error) => void) | undefined
    let checks = 0
    const f = await fixture(0, { plugins: [plugin.provider], beforeSend: () => ++checks === 1 ? new Promise<void>((_yes, no) => { reject = no }) : undefined })
    f.set({ chatProviders: ['claude', 'plugin:manager-test'], providerPlugins: [plugin.provider] })
    await f.manager.configure({ enabled: true })
    const previous = await f.manager.send('Possibly interrupted request')
    await vi.waitFor(() => expect(reject).toBeDefined())
    await f.manager.send('Accepted pending request')
    const replacement = await f.manager.configure({ provider: 'plugin:manager-test' })
    reject?.(new Error('Old VPN check rejected'))
    await vi.waitFor(() => expect(plugin.sent).toHaveLength(1))
    expect(plugin.sent[0]?.text).toContain('Manager provider changed')
    expect((await f.manager.view()).error).toBeUndefined()
    expect(f.made).toHaveLength(0)
    expect(replacement.session?.id).not.toBe(previous)
    plugin.finish(replacement.session?.id ?? '')
    await vi.waitFor(() => expect(plugin.sent).toHaveLength(2))
    expect(plugin.sent[1]?.text).toBe('Accepted pending request')
    expect(plugin.sent.map((one) => one.text)).not.toContain('Possibly interrupted request')
  })

  it('strips only generated context at native history ingress and preserves literal user marker content', () => {
    const prompt = `${MANAGER_INSTRUCTIONS}\nUser preferences for coordination:\nStay focused.`
    const literal = '[GeckIt internal Manager context v1]\nMy user content\n[/GeckIt internal Manager context v1]\n\nKeep this.'
    const native = managerHistoryItem({ kind: 'mine', id: 'native', text: managerContext(prompt, literal) })
    expect(native).toMatchObject({ text: literal })
    expect(managerVisibleItem(native)).toMatchObject({ text: literal })
    const previous = prompt.replace('Desktop provides setup, recovery and read-only inspection.', 'Desktop provides setup and recovery only.')
    expect(managerHistoryItem({ kind: 'mine', id: 'previous', text: managerContext(previous, literal) })).toMatchObject({ text: literal })
    expect(managerHistoryItem({ kind: 'mine', id: 'user', text: literal })).toMatchObject({ text: literal })
  })

  it('fails closed when a retained manager loses its durable role, including ordinary adopted session sends', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.open()
    f.notes.replace({})
    const reloaded = f.reload()
    await expect(reloaded.open()).rejects.toThrow('instructions are missing')
    await expect(reloaded.send('Do work')).rejects.toThrow('instructions are missing')
    await expect(f.sessions.sendManager({ session: id, root: f.root, mode: 'manual', text: 'Bypass' })).rejects.toThrow('instructions are missing')
    await expect(f.sessions.send({ session: id, root: f.root, mode: 'auto', text: 'Bypass ordinary chat' })).rejects.toThrow('Use Telegram to talk to Manager.')
    expect(f.made).toHaveLength(0)
    const recovered = await reloaded.restart()
    expect(recovered.session?.id).not.toBe(id)
    await vi.waitFor(() => expect(f.made).toHaveLength(1))
    expect(f.made[0]?.managerPrompt).toContain('role is coordination')
  })

  it('does not execute output queued from a backing session after replacing it', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Coordinate')
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    f.finish(id, f.command('stale-discovery', ['projects', 'list']))
    await f.manager.restart()
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(f.cli).toHaveLength(0)
    expect((await f.manager.view()).session?.id).not.toBe(id)
  })

  it('treats slash and shell prefixes as literal requests', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    await f.manager.send('/goal implement everything')
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    expect(f.sent[0]?.text).toBe('[User request]\n/goal implement everything')
    expect(f.made[0]?.managerPrompt).toContain('role is coordination')
  })

  it('respects the ordinary concurrency limit and resumes queued manager turns with the restricted role', async () => {
    const f = await fixture(1)
    const worker = await f.sessions.send({ root: f.root, mode: 'manual', text: 'Existing task' })
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Coordinate after the current task')
    await vi.waitFor(async () => expect((await f.manager.view()).session?.queued).toHaveLength(1))
    expect(f.made).toHaveLength(1)
    expect((await f.manager.view()).state).not.toBe('blocked')
    f.finish(worker, 'Finished')
    f.sessions.carryOn(id)
    await vi.waitFor(() => expect(f.made).toHaveLength(2))
    expect(f.made[1]?.managerPrompt).toContain('role is coordination')
    expect(f.sent[1]?.text).toBe('Coordinate after the current task')
  })

  it('recovers interrupted CLI operations as uncertain without pausing or replaying them', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const path = join(f.directory, 'manager.json')
    const stored = JSON.parse(await readFile(path, 'utf8')) as { readonly operations: readonly ManagerActivity[] }
    await writeFile(path, JSON.stringify({ ...stored, operations: [{ id: 'interrupted', at: 1, state: 'running', command: ['sessions', 'start', '--project', f.root, '--text', 'Work', '--goal', 'Finished'] }] }))
    const recovered = f.reload()
    const view = await recovered.view()
    expect(view.state).toBe('blocked')
    expect(view.activity[0]?.state).toBe('uncertain')
    expect(view.decisions[0]?.choices).toEqual([{ label: 'I checked its state', value: 'reviewed' }])
    expect(f.cli).toHaveLength(0)
    expect(f.sent).toHaveLength(0)
  })

  it('keeps all projects visible, routes worker preference explicitly and deduplicates worker creation', async () => {
    const f = await fixture()
    f.set({ profile: 'one', profiles: [{ id: 'one', name: 'No projects', projects: [] }], projectAssistants: [{ root: f.root, provider: 'claude' }] })
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Implement a fix')
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    const start = f.command('start-fix', ['sessions', 'start', '--project', f.root, '--text', 'Fix the regression. Preserve existing behavior. Check tests.', '--goal', 'The regression test passes'])
    f.finish(id, start)
    await vi.waitFor(() => expect(f.cli).toHaveLength(1))
    await vi.waitFor(async () => expect((await f.manager.view()).workers).toHaveLength(1))
    const worker = (await f.manager.view()).workers[0]
    expect(worker?.root).toBe(f.root)
    expect(worker?.provider ?? 'claude').toBe('claude')
    expect(f.notes.all()[worker?.id ?? '']?.managerOperation).toBe('start-fix')
    await vi.waitFor(() => expect(f.sent.filter((one) => one.id === id)).toHaveLength(2))
    f.finish(id, start)
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(f.cli).toHaveLength(1)
    expect((await f.manager.view()).workers).toHaveLength(1)
  })

  it('requires a bound confirmation for worker starts under approve policy and stale answers do nothing', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true, delegation: 'approve' })
    const id = await f.manager.send('Fix a bug')
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    f.finish(id, f.command('pending-worker', ['sessions', 'start', '--project', f.root, '--text', 'Fix a bug', '--goal', 'Tests pass']))
    await vi.waitFor(async () => expect((await f.manager.view()).decisions).toHaveLength(1))
    expect(f.cli).toHaveLength(0)
    const decision = (await f.manager.view()).decisions[0]
    await f.manager.answer(decision?.id ?? '', 'allow')
    await vi.waitFor(async () => expect((await f.manager.view()).workers).toHaveLength(1))
    await f.manager.answer(decision?.id ?? '', 'allow')
    expect(f.cli).toHaveLength(1)
  })

  it('rejects spoofed CLI operations and unknown flags, and preserves literal shell-like content', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Show projects')
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    const spoof = await f.manager.command({ action: 'manage', args: ['projects', 'list'], session: id, token: 'invented', operation: 'fake' })
    expect(spoof).toMatchObject({ ok: false })
    f.finish(id, f.command('bad-flag', ['projects', 'list', '--shell', 'touch escaped']))
    await vi.waitFor(async () => expect((await f.manager.view()).activity[0]?.state).toBe('failed'))
    expect((await f.manager.view()).activity[0]?.result).toContain('Unsupported flag')
    expect(managerCommands('```geckit\n{"id":"literal","args":["files","write","--text","$(touch nope); echo hi"]}\n```')[0]?.args.at(-1)).toBe('$(touch nope); echo hi')
    expect(() => managerCommands('```geckit\n{"id":"bad","args":[3]}\n```')).toThrow('invalid')
    expect(managerVisibleItem({ kind: 'theirs', id: '1', text: 'Hello\n```geckit\npartial' })).toMatchObject({ text: 'Hello' })
  })

  it('pauses only coordination, retains queued Telegram messages once, and resumes without replacing workers', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.open()
    await f.manager.pause()
    await f.manager.send('Fix a bug', 'telegram', 'telegram:1')
    await f.manager.send('Fix a bug', 'telegram', 'telegram:1')
    expect(f.sent).toHaveLength(0)
    expect((await f.manager.view()).state).toBe('paused')
    await f.manager.resume()
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    expect(f.sent[0]?.text).toContain('Reconcile current managed tasks')
    f.finish(id, 'Current state reconciled.')
    await vi.waitFor(() => expect(f.sent).toHaveLength(2))
    expect(f.sent[1]).toMatchObject({ id, text: '[Telegram]\nFix a bug' })
    const stored = JSON.parse(await readFile(join(f.directory, 'manager.json'), 'utf8')) as { inbox: { id: string }[] }
    expect(stored.inbox.filter((one) => one.id === 'telegram:1')).toHaveLength(1)
  })

  it('shows disabled providers and stopped turns as blocked with recovery', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Manage tasks')
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    f.sessions.stop(id)
    await vi.waitFor(async () => expect((await f.manager.view()).state).toBe('blocked'))
    expect((await f.manager.view()).error).toContain('stopped')
    f.set({ chatProviders: ['codex'] })
    expect((await f.manager.view()).error).toContain('disabled')
    await expect(f.manager.send('Continue')).rejects.toThrow('disabled')
  })

  it('passes CLI arguments without invoking a shell or leaking its token into output', async () => {
    const f = await fixture()
    const script = join(f.directory, 'capture.mjs')
    const marker = join(f.directory, 'should-not-exist')
    await writeFile(script, 'process.stdout.write(JSON.stringify(process.argv.slice(2)))')
    const text = `$(touch ${marker}); echo surprise`
    const result = await runManagerCli(process.execPath, script, ['files', 'write', '--text', text], { data: f.directory, token: 'private-token', session: 'session', operation: 'operation' })
    expect(JSON.parse(result)).toEqual(['files', 'write', '--text', text])
    expect(existsSync(marker)).toBe(false)
    expect(result).not.toContain('private-token')
  })

  it('transports literal management arguments through the real local CLI socket', async () => {
    const f = await fixture()
    const requests: ManagerCliAsked[] = []
    const server = createServer((socket) => {
      let input = ''
      socket.setEncoding('utf8')
      socket.on('data', (part: string) => {
        input += part
        if (!input.includes('\n')) return
        const asked = JSON.parse(input) as ManagerCliAsked
        requests.push(asked)
        socket.end(`${JSON.stringify({ ok: true, result: JSON.stringify({ args: asked.args }) })}\n`)
      })
    })
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(join(f.directory, 'geckit.sock'), resolve) })
    try {
      const result = await manage(['projects', 'list'], f.directory, { GECKIT_MANAGER_SESSION: 'real-session', GECKIT_MANAGER_TOKEN: 'socket-secret', GECKIT_MANAGER_OPERATION: 'list-1' })
      expect(result.ok).toBe(true)
      expect(JSON.parse(result.said)).toEqual({ args: ['projects', 'list'] })
      expect(requests).toEqual([{ action: 'manage', args: ['projects', 'list'], session: 'real-session', token: 'socket-secret', operation: 'list-1' }])
      expect(result.said).not.toContain('socket-secret')
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
  })

  it('dispatches to a registered project retained only in another profile', async () => {
    const f = await fixture()
    const hiddenRoot = join(f.directory, 'profile-project')
    await mkdir(hiddenRoot)
    f.set({ profiles: [{ id: 'other', name: 'Other profile', projects: [hiddenRoot] }], profile: '' })
    await f.manager.configure({ enabled: true })
    const id = await f.manager.send('Work in the other project')
    await vi.waitFor(() => expect(f.sent).toHaveLength(1))
    f.finish(id, f.command('profile-worker', ['sessions', 'start', '--project', hiddenRoot, '--text', 'Investigate the issue', '--goal', 'Evidence found']))
    await vi.waitFor(async () => expect((await f.manager.view()).workers[0]?.root).toBe(hiddenRoot))
    expect(f.notes.all()[(await f.manager.view()).workers[0]?.id ?? '']?.parent).toBe(id)
    expect((await f.manager.view()).activity[0]?.state).toBe('done')
  })
})

describe('Manager provider and project boundaries', () => {
  it('uses task choice, then project preference, then configured default and never substitutes', () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, chatProvider: 'claude', projectAssistants: [{ root: '/project', provider: 'codex' }] }
    expect(managerProvider(settings, '/project')).toEqual({ provider: 'codex', reason: 'project' })
    expect(managerProvider(settings, '/project', 'claude')).toEqual({ provider: 'claude', reason: 'task' })
    expect(managerProvider(settings, '/other')).toEqual({ provider: 'claude', reason: 'default' })
    expect(() => managerProvider({ ...settings, chatProviders: ['claude'] }, '/project')).toThrow('disabled')
    expect(() => managerProvider({ ...settings, chatProviders: [] }, '/other')).toThrow('disabled')
    expect(() => managerProvider(settings, 'ssh://host/project', 'codex')).toThrow('host')
  })

  it('rejects traversal, outside links, protected-file links, config edits and SSH local fallback', async () => {
    const f = await fixture()
    const outside = join(f.directory, 'outside.txt')
    await writeFile(outside, 'private')
    await symlink(outside, join(f.root, 'outside-link'))
    await mkdir(join(f.root, '.git'))
    await writeFile(join(f.root, '.git', 'config'), 'private config')
    await symlink(join(f.root, '.git', 'config'), join(f.root, 'inside-link'))
    await expect(managerFile(f.root, '../outside.txt')).rejects.toThrow('outside')
    await expect(managerFile(f.root, 'outside-link')).rejects.toThrow('outside')
    await expect(managerFile(f.root, 'inside-link')).rejects.toThrow('protected')
    await expect(managerFile(f.root, '.env', true)).rejects.toThrow('Credential')
    await expect(managerFile(f.root, 'AGENTS.md', true)).rejects.toThrow('Credential')
    await expect(managerFile('ssh://host/project', 'file.txt')).rejects.toThrow('Remote')
    expect(await managerFile(f.root, 'notes.txt', true)).toBe(join(await realpath(f.root), 'notes.txt'))
  })
})


describe('Manager explicit Telegram file operations', () => {
  it('copies actual inputs without overwrite and selects only an owned local project deliverable', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const manager = await f.manager.open()
    const worker = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'Make report' }, 'manager', 'file-worker')
    const attachments = new TelegramAttachments(f.directory)
    const input = attachments.put(Buffer.from('document contents'), 'input.txt', 'text/plain')
    const sent = vi.fn(async () => 901)
    const operations = new ManagerOperations({ attachments, sessions: f.sessions, notes: f.notes, settings: f.settings, saveSettings: (change) => { f.set(change); return f.settings() }, owner: 'manager', managed: (id) => f.manager.manages(id), managerSession: () => manager, telegramFile: () => sent })
    const copied = JSON.parse(await operations.run(['attachments', 'send', '--attachment', input.id, '--id', worker, '--text', 'Use this document'], 'copy')) as { readonly path: string; readonly projectCopy: string }
    expect(copied).toMatchObject({ status: 'queued', attempt: 'copy', queued: expect.any(String) })
    expect(copied).not.toHaveProperty('delivered')
    expect(await readFile(copied.path, 'utf8')).toBe('document contents')
    expect(copied.projectCopy).toContain('retained until user/project cleanup')
    await writeFile(copied.path, 'user edit')
    await expect(operations.run(['attachments', 'send', '--attachment', input.id, '--id', worker, '--text', 'Use this document'], 'copy-again')).rejects.toThrow()
    expect(await readFile(copied.path, 'utf8')).toBe('user edit')
    await writeFile(join(f.root, 'report.txt'), 'selected deliverable')
    const result = JSON.parse(await operations.run(['telegram', 'send-file', '--id', worker, '--path', 'report.txt'], 'send')) as { readonly sent: boolean; readonly messageId: number }
    expect(result).toMatchObject({ sent: true, messageId: 901 })
    expect(sent).toHaveBeenCalledWith(Buffer.from('selected deliverable'), 'report.txt', 'application/octet-stream', '', 'document', { session: manager, workers: [worker] }, expect.any(Function))
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=', 'base64')
    await writeFile(join(f.root, 'result.png'), png)
    const photoResult = JSON.parse(await operations.run(['telegram', 'send-file', '--id', worker, '--path', 'result.png', '--as', 'photo', '--caption', 'Selected image'], 'send-photo')) as { readonly as: string; readonly sent: boolean }
    expect(photoResult).toMatchObject({ as: 'photo', sent: true })
    expect(sent).toHaveBeenLastCalledWith(png, 'result.png', 'image/png', 'Selected image', 'photo', { session: manager, workers: [worker] }, expect.any(Function))
    const manual = await f.sessions.send({ root: f.root, mode: 'manual', text: 'Unrelated manual conversation' })
    await expect(operations.run(['telegram', 'send-file', '--id', manual, '--path', 'report.txt'], 'manual-session')).rejects.toThrow('not managed')
    const remoteRoot = 'ssh://fixture-host/project'
    f.set({ projects: [...f.settings().projects, remoteRoot] })
    const remote = await f.sessions.startManaged({ root: remoteRoot, mode: 'manual', text: 'Remote task uses the fake driver' }, 'manager', 'remote-file-worker')
    await expect(operations.run(['telegram', 'send-file', '--id', remote, '--path', 'report.txt'], 'remote-send')).rejects.toThrow('no local fallback')
    await expect(operations.run(['attachments', 'send', '--attachment', input.id, '--id', remote, '--text', 'Read input'], 'remote-input')).rejects.toThrow('no local fallback')
    await expect(operations.run(['telegram', 'send-file', '--id', manager, '--path', 'report.txt'], 'wrong-owner')).rejects.toThrow('worker')
    await expect(operations.run(['telegram', 'send-file', '--id', worker, '--path', '../private.txt'], 'escape')).rejects.toThrow('outside')
    await writeFile(join(f.directory, 'private.txt'), 'private')
    await symlink(join(f.directory, 'private.txt'), join(f.root, 'linked.txt'))
    await expect(operations.run(['telegram', 'send-file', '--id', worker, '--path', 'linked.txt'], 'linked')).rejects.toThrow('outside')
    await writeFile(join(f.root, '.env'), 'secret')
    await expect(operations.run(['telegram', 'send-file', '--id', worker, '--path', '.env'], 'credential')).rejects.toThrow('Credential')
    await expect(operations.run(['telegram', 'send-file', '--id', worker, '--path', 'report.txt', '--caption', 'x'.repeat(1025)], 'caption')).rejects.toThrow('1024')
    await expect(operations.run(['telegram', 'send-file', '--id', worker, '--path', 'report.txt', '--as', 'photo'], 'photo')).rejects.toThrow('raster')
    expect(sent).toHaveBeenCalledTimes(2)
  })

  it('revalidates Manager authority and registered project after asynchronous work before any upload', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const manager = await f.manager.open()
    const worker = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'Report' }, 'manager', 'revoked-file-worker')
    await writeFile(join(f.root, 'report.txt'), 'deliverable')
    let authorized = true
    const sent = vi.fn(async () => 1)
    const operations = new ManagerOperations({ sessions: f.sessions, notes: f.notes, settings: f.settings, saveSettings: () => f.settings(), owner: 'manager', managed: () => true, managerSession: () => manager, authorized: () => authorized, telegramFile: () => { authorized = false; return sent } })
    await expect(operations.run(['telegram', 'send-file', '--id', worker, '--path', 'report.txt'], 'revoked')).rejects.toThrow('no longer authorized')
    expect(sent).not.toHaveBeenCalled()
    f.set({ projects: [], profiles: [] })
    await expect(operations.run(['telegram', 'send-file', '--id', worker, '--path', 'report.txt'], 'unregistered')).rejects.toThrow('registered')
  })
})


describe('worker delivery receipts and explicit recovery', () => {
  const operationsFor = (f: Awaited<ReturnType<typeof fixture>>): ManagerOperations => new ManagerOperations({ sessions: f.sessions, notes: f.notes, settings: f.settings, saveSettings: () => f.settings(), owner: 'manager', managed: () => true, managerSession: () => 'manager' })

  it('reports VPN refusal as blocked instead of delivered and exposes the exact attempt', async () => {
    let allowed = true
    const f = await fixture(0, { beforeSend: async () => { if (!allowed) throw new Error(VPN_IP_UNAVAILABLE_ERROR) } })
    const worker = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'Initial' }, 'manager', 'worker')
    f.finish(worker, 'Done')
    allowed = false
    const operations = operationsFor(f)
    const receipt: object = JSON.parse(await operations.run(['sessions', 'send', '--id', worker, '--text', 'Retained exact work'], 'blocked-send')) as object
    expect(receipt).toMatchObject({ id: worker, status: 'blocked', attempt: 'blocked-send', reason: VPN_IP_UNAVAILABLE_ERROR })
    expect(receipt).not.toHaveProperty('delivered')
    expect(f.sent.filter((one) => one.id === worker).map((one) => one.text)).toEqual(['Initial'])
    expect(JSON.parse(await operations.run(['sessions', 'show', '--id', worker], 'inspect'))).toMatchObject({ delivery: receipt })
  })

  it('uses explicit retry to resume the exact held work and reports a queued ordinary follow-up separately', async () => {
    let allowed = true
    const f = await fixture(0, { beforeSend: async () => { if (!allowed) throw new Error(VPN_IP_UNAVAILABLE_ERROR) } })
    const worker = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'Initial' }, 'manager', 'worker')
    f.finish(worker, 'Done')
    allowed = false
    const operations = operationsFor(f)
    await operations.run(['sessions', 'send', '--id', worker, '--text', 'Exact held work'], 'held')
    allowed = true
    expect(JSON.parse(await operations.run(['sessions', 'retry', '--id', worker], 'retry-exact'))).toMatchObject({ id: worker, attempt: 'retry-exact', status: 'accepted', acceptance: 'host' })
    expect(f.sent.filter((one) => one.id === worker).map((one) => one.text)).toEqual(['Initial', 'Exact held work'])
    expect(JSON.parse(await operations.run(['sessions', 'send', '--id', worker, '--text', 'Later work'], 'later'))).toMatchObject({ status: 'queued', queued: expect.any(String) })
  })

  it('refuses unsupported direct steering without queueing or restarting work', async () => {
    const f = await fixture()
    const worker = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'Initial' }, 'manager', 'worker')
    const operations = operationsFor(f)
    expect(JSON.parse(await operations.run(['sessions', 'steer', '--id', worker, '--text', 'Correction now'], 'steer'))).toMatchObject({ id: worker, status: 'unsupported', attempt: 'steer' })
    expect((await f.sessions.list([f.root])).find((one) => one.id === worker)?.queued).toBeUndefined()
    expect(f.made).toHaveLength(1)
    expect(f.sent.filter((one) => one.id === worker)).toHaveLength(1)
  })
})


describe('retry and steer command bridge', () => {
  it('carries literal steering and retry receipts through CLI socket and reconciles duplicate operations after reload', async () => {
    const inject = vi.fn<NonNullable<Driver['inject']>>(async () => undefined)
    const f = await fixture(0, {}, inject)
    const requests: ManagerCliAsked[] = []
    const server = createServer((socket) => {
      let input = ''
      socket.setEncoding('utf8')
      socket.on('data', (part: string) => {
        input += part
        if (!input.includes('\n')) return
        const asked = JSON.parse(input) as ManagerCliAsked
        requests.push(asked)
        void f.manager.command(asked).then((answer) => socket.end(`${JSON.stringify(answer)}\n`))
      })
    })
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(join(f.directory, 'geckit.sock'), resolve) })
    f.setCli(async (args, context) => {
      const response = await manage(args, context.data, { GECKIT_MANAGER_SESSION: context.session, GECKIT_MANAGER_TOKEN: context.token, GECKIT_MANAGER_OPERATION: context.operation })
      if (!response.ok) throw new Error(response.said)
      return response.said
    })
    try {
      await f.manager.configure({ enabled: true })
      const manager = await f.manager.send('Coordinate current work')
      await vi.waitFor(() => expect(f.sent.some((one) => one.id === manager)).toBe(true))
      const worker = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'Original' }, 'manager', 'bridge-worker')
      const steer = ['sessions', 'steer', '--id', worker, '--text', 'Literal $(no shell); correction']
      f.finish(manager, f.command('bridge-steer', steer))
      await vi.waitFor(async () => expect((await f.manager.view()).activity.find((one) => one.id === 'bridge-steer')).toMatchObject({ state: 'done', result: expect.stringContaining('"status":"steered"') }))
      expect(inject).toHaveBeenCalledExactlyOnceWith(steer[5], undefined, [])
      f.finish(manager, f.command('bridge-retry', ['sessions', 'retry', '--id', worker]))
      await vi.waitFor(async () => expect((await f.manager.view()).activity.find((one) => one.id === 'bridge-retry')).toMatchObject({ state: 'done', result: expect.stringContaining('"status":"blocked"') }))
      expect(requests.map((one) => one.operation)).toEqual(['bridge-steer', 'bridge-retry'])
      const restored = f.reload()
      await restored.resume()
      f.finish(manager, f.command('bridge-steer', steer))
      await new Promise<void>((resolve) => setImmediate(resolve))
      expect(inject).toHaveBeenCalledTimes(1)
      expect((await restored.view()).activity.find((one) => one.id === 'bridge-steer')?.result).toContain('"status":"steered"')
      expect((await f.sessions.list([f.root])).find((one) => one.id === worker)?.queued).toBeUndefined()
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())) }
  })

  it('does not emit a new failed worker event from historical state while retry is pending', async () => {
    let rejectCheck: ((error: Error) => void) | undefined
    let checking = false
    const f = await fixture(0, { beforeSend: () => checking ? new Promise<void>((_resolve, reject) => { rejectCheck = reject }) : undefined })
    await f.manager.configure({ enabled: true })
    const worker = await f.sessions.startManaged({ root: f.root, mode: 'manual', text: 'Original' }, 'manager', 'pending-worker')
    f.hear(worker, { items: [], gone: [], signals: [{ kind: 'ended', how: 'failed', text: 'Previous failure' }] })
    const send = vi.spyOn(f.manager, 'send')
    checking = true
    const retry = f.sessions.retryWithReceipt(worker, 'current-retry')
    expect(send.mock.calls.filter((call) => call[1] === 'event')).toEqual([])
    rejectCheck?.(new Error(VPN_IP_UNAVAILABLE_ERROR))
    expect(await retry).toMatchObject({ status: 'blocked', attempt: 'current-retry' })
    expect(send.mock.calls.filter((call) => call[1] === 'event').some((call) => call[0].includes('"attempt":"current-retry"') && call[0].includes('"status":"blocked"'))).toBe(true)
  })
})
