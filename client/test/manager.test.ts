import { existsSync } from 'node:fs'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { Manager, runManagerCli } from '../src/main/manager'
import type { ManagerCliContext, ManagerDeps } from '../src/main/manager'
import { managerFile, managerProvider } from '../src/main/manager-operations'
import { managerCommands, managerContext, managerHistoryItem, managerMessage, managerVisibleItem, MANAGER_INSTRUCTIONS } from '../src/main/manager-protocol'
import { manage } from '../src/cli/manage'
import type { ManagerActivity, ManagerCliAsked } from '../src/shared/manager'
import { Sessions, memoryNotes } from '../src/main/sessions'
import type { SessionsDeps } from '../src/main/sessions'
import { llmProvider } from '../src/main/sessions/provider'
import type { LlmProvider } from '../src/main/sessions/provider'
import type { ClaudeOptions } from '../src/main/sessions/claude'
import { claudeArgs } from '../src/main/sessions/claude'
import type { Driver, Heard } from '../src/main/sessions/heard'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { SessionItems, Settings } from '../src/shared/api'

interface NativeAnswer { readonly id: string; readonly ask: string; readonly answer: string }

interface Sent {
  readonly id: string
  readonly text: string
  readonly input: string
}

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup() })

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

async function fixture(limit = 0, over: Partial<SessionsDeps> = {}) {
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
      return { send: (text) => { const item = managerHistoryItem({ kind: 'mine', id: 'input', text }); sent.push({ id: options.id, text: item.kind === 'mine' ? item.text : text, input: text }) }, answer: (ask, answer) => answers.push({ id: options.id, ask, answer }), stop: () => hear({ items: [], gone: [], signals: [{ kind: 'ended', how: 'stopped' }] }), end: async () => undefined }
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
  return { manager: active, sessions, root, directory, notes, made, sent, fanned, answers, cli, finish, hear: (id: string, heard: Heard) => hearings.get(id)?.(heard), command, reload: () => { current.manager?.dispose(); const next = new Manager(deps); current.manager = next; return next }, settings: () => settings, set: (change: Partial<Settings>) => { settings = { ...settings, ...change } } }
}

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
    await expect(f.manager.answer(decision.id, decision.choices[1]?.value ?? '')).rejects.toThrow('no longer')
    expect(f.answers).toEqual([])
    const current = (await f.manager.view()).decisions.find((one) => one.title.includes('Calendar'))
    if (current === undefined) throw new Error('Missing replacement decision')
    await f.manager.answer(current.id, current.choices[2]?.value ?? '')
    expect(f.answers.at(-1)).toMatchObject({ id, ask: 'approval', answer: JSON.stringify({ action: 'accept', content: {}, _meta: null, remember: true }) })
    await expect(f.manager.answer(current.id, current.choices[2]?.value ?? '')).rejects.toThrow('no longer')
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
    await expect(f.manager.answer(decisions[1].id, 'once')).rejects.toThrow('no longer')
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
    await expect(answer).rejects.toThrow('not sent')
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
    await expect(f.manager.answer(decision.id, 'once')).rejects.toThrow('no longer')
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

  it('recovers interrupted CLI operations as uncertain without replaying them', async () => {
    const f = await fixture()
    await f.manager.configure({ enabled: true })
    const path = join(f.directory, 'manager.json')
    const stored = JSON.parse(await readFile(path, 'utf8')) as { readonly operations: readonly ManagerActivity[] }
    await writeFile(path, JSON.stringify({ ...stored, operations: [{ id: 'interrupted', at: 1, state: 'running', command: ['sessions', 'start', '--project', f.root, '--text', 'Work', '--goal', 'Finished'] }] }))
    const recovered = f.reload()
    const view = await recovered.view()
    expect(view.state).toBe('paused')
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
