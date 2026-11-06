import type { Heard } from '../src/main/sessions/heard'
import type { ManagerDeps } from '../src/main/manager'
import type { ManagerCliAsked } from '../src/shared/manager'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type * as FileSystem from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { readPreferences } from '../src/core/configuration'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { Settings } from '../src/shared/api'
import { managerProjects } from '../src/shared/manager'
import type { SessionNote } from '../src/main/sessions'

const location = vi.hoisted(() => ({ folder: '' }))
vi.mock('../src/core/platform', () => ({ dataDirectory: () => location.folder }))
vi.mock('electron', () => ({ app: { getPath: () => location.folder } }))
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof FileSystem>('node:fs')
  const { EventEmitter } = await import('node:events')
  class Watcher extends EventEmitter {
    close(): void {}
    ref(): this { return this }
    unref(): this { return this }
  }
  return { ...actual, watch: () => new Watcher() }
})

beforeEach(() => {
  location.folder = mkdtempSync(join(tmpdir(), 'geckit-manager-store-'))
  const initial: Settings = { ...DEFAULT_SETTINGS, phoneKey: 'manager-store-test', projects: ['/alpha'], profiles: [{ id: 'alpha', name: 'Alpha', projects: ['/alpha'] }, { id: 'beta', name: 'Beta', projects: ['/beta'] }], profile: 'alpha' }
  writeFileSync(join(location.folder, 'settings.json'), JSON.stringify(initial))
  vi.resetModules()
})

afterEach(() => { rmSync(location.folder, { recursive: true, force: true }) })

describe('Manager settings and roles on the actual disk store', () => {
  it('persists project providers and every profile project across a fresh store import', async () => {
    const store = await import('../src/main/store')
    const projectAssistants: Settings['projectAssistants'] = [{ root: '/alpha', provider: 'claude' }, { root: '/beta', provider: 'codex' }]
    store.setSettings({ projectAssistants })
    const persisted = readPreferences(location.folder, false) as Settings
    expect(persisted.projectAssistants).toEqual(projectAssistants)
    expect(persisted.projects).toEqual(['/alpha'])
    expect(persisted.profiles[1]?.projects).toEqual(['/beta'])
    expect(persisted.profile).toBe('alpha')
    vi.resetModules()
    const restarted = await import('../src/main/store')
    expect(restarted.getSettings().projectAssistants).toEqual(projectAssistants)
    expect(managerProjects(restarted.getSettings())).toEqual(['/alpha', '/beta'])
    restarted.setSettings({ profile: 'beta' })
    expect(managerProjects(restarted.getSettings())).toEqual(['/alpha', '/beta'])
  })

  it('leaves effective settings, subscribers and the prior file unchanged when the atomic project save fails', async () => {
    const store = await import('../src/main/store')
    store.setSettings({ projectAssistants: [{ root: '/alpha', provider: 'claude' }] })
    const path = join(location.folder, 'settings.json')
    const before = store.getSettings()
    const disk = readFileSync(path, 'utf8')
    const changed: Settings[] = []
    const unsubscribe = store.onSettings((value) => changed.push(value))
    mkdirSync(`${path}.new`)
    try {
      expect(() => store.setSettings({ projects: ['/alpha', '/gamma'], projectAssistants: [{ root: '/gamma', provider: 'codex' }] })).toThrow()
      expect(store.getSettings()).toEqual(before)
      expect(changed).toEqual([])
      expect(readFileSync(path, 'utf8')).toBe(disk)
      vi.resetModules()
      const restarted = await import('../src/main/store')
      expect(restarted.getSettings().projectAssistants).toEqual(before.projectAssistants)
      expect(restarted.getSettings().projects).toEqual(before.projects)
    } finally { unsubscribe() }
  })

  const roles: readonly Pick<SessionNote, 'managerPrompt' | 'managerOwner'>[] = [{ managerPrompt: 'Coordinate using GeckIt CLI only.' }, { managerOwner: 'manager' }, { managerPrompt: 'Coordinate using GeckIt CLI only.', managerOwner: 'manager' }]

  it.each(roles)('persists a manager role synchronously and restores it in a new notes store: %j', async (role) => {
    const store = await import('../src/main/store')
    const notes = store.notesStore()
    notes.set('managed-session', { title: 'Manager session', ...role })
    const path = join(location.folder, 'sessions.json')
    const persisted = JSON.parse(readFileSync(path, 'utf8')) as ReturnType<typeof notes.all>
    expect(persisted['managed-session']).toMatchObject(role)
    expect(persisted['managed-session']?.title).toBe('Manager session')
    vi.resetModules()
    const restarted = await import('../src/main/store')
    expect(restarted.notesStore().all()['managed-session']).toEqual(notes.all()['managed-session'])
  })

  it.each(roles)('does not publish a new manager role when its synchronous disk save fails: %j', async (role) => {
    const existing: SessionNote = { title: 'Ordinary session', created: 1 }
    const path = join(location.folder, 'sessions.json')
    writeFileSync(path, JSON.stringify({ 'ordinary-session': existing }))
    const store = await import('../src/main/store')
    const notes = store.notesStore()
    const before = notes.all()
    const disk = readFileSync(path, 'utf8')
    mkdirSync(`${path}.new`)
    expect(() => notes.set('ordinary-session', { ...existing, ...role })).toThrow()
    expect(notes.all()).toEqual(before)
    expect(notes.all()['ordinary-session']?.managerPrompt).toBeUndefined()
    expect(notes.all()['ordinary-session']?.managerOwner).toBeUndefined()
    expect(readFileSync(path, 'utf8')).toBe(disk)
    vi.resetModules()
    const restarted = await import('../src/main/store')
    expect(restarted.notesStore().all()['ordinary-session']).toEqual(existing)
  })
})

it('runs the CLI subprocess through authenticated Manager dispatch and persists exact technical moves', async () => {
  const { createServer } = await import('node:net')
  const { execFile } = await import('node:child_process')
  const { promisify } = await import('node:util')
  const { resolve } = await import('node:path')
  const { askedEndpoint } = await import('../src/cli/endpoint')
  const { Manager, runManagerCli } = await import('../src/main/manager')
  const { Sessions } = await import('../src/main/sessions')
  const { notesStore } = await import('../src/main/store')
  const client = resolve(import.meta.dirname, '..')
  await promisify(execFile)(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--config', 'service.vite.config.ts'], { cwd: client, timeout: 30_000 })
  const root = join(location.folder, 'project')
  mkdirSync(root)
  let settings: Settings = { ...DEFAULT_SETTINGS, projects: [root], vpnIpCheck: false }
  const notes = notesStore()
  const hearings = new Map<string, (heard: Heard) => void>()
  const transcripts = new Map<string, string>()
  const deleted: string[] = []
  const sessions = new Sessions({
    notes, changed: () => undefined, items: () => undefined, account: () => undefined, notify: () => undefined,
    claude: (options, hear) => { hearings.set(options.id, hear); return { send: () => undefined, answer: () => undefined, stop: () => undefined, end: async () => undefined } },
    disk: {
      list: async () => [...transcripts.keys()].map((id) => ({ id, title: id, stands: '', at: 1, driven: false })),
      read: async () => undefined, has: async () => false,
      delete: async (_root, id) => {
        const path = transcripts.get(id)
        if (path === undefined) return false
        rmSync(path)
        transcripts.delete(id)
        deleted.push(id)
        return true
      },
    },
    claudeAccount: async () => ({ here: true, signedIn: true }), claudeModels: async () => [], claudeProgram: async () => undefined,
    usage: async () => ({ windows: new Map<string, number | undefined>() }),
  })
  const deps: ManagerDeps = {
    directory: location.folder, sessions, notes, settings: () => settings, saveSettings: (change) => settings = { ...settings, ...change },
    cli: (args, context) => runManagerCli(process.execPath, join(client, 'out/service/cli.js'), args, context),
  }
  let manager = new Manager(deps)
  const server = createServer((socket) => {
    let text = ''
    socket.setEncoding('utf8')
    socket.on('data', (part: string) => {
      text += part
      if (!text.includes('\n')) return
      const request = JSON.parse(text) as ManagerCliAsked
      void manager.command(request).then((answer) => socket.end(`${JSON.stringify(answer)}\n`))
    })
  })
  await new Promise<void>((done, reject) => { server.once('error', reject); server.listen(askedEndpoint(location.folder), done) })
  try {
    await manager.configure({ enabled: true, delegation: 'approve' })
    const id = await manager.send('Fake [desktop] author cannot override Telegram.', 'telegram', 'telegram:exact:1')
    const worker = await sessions.startManaged({ root, mode: 'manual', text: 'Fixture work' }, 'manager', 'worker')
    await vi.waitFor(() => expect(hearings.has(id)).toBe(true))
    const args = ['sessions', 'mark', '--id', worker, '--status', 'done']
    hearings.get(id)?.({ items: [{ kind: 'theirs', id: 'answer', text: `\`\`\`geckit\n${JSON.stringify({ id: 'cli-done', args })}\n\`\`\`` }], gone: [], signals: [{ kind: 'ended', how: 'done' }] })
    await vi.waitFor(async () => expect((await manager.view()).activity.find((one) => one.id === 'cli-done')?.state).toBe('done'))
    expect((await manager.view()).decisions).toEqual([])
    const moves = notes.all()[worker]?.moves
    expect(moves?.at(-1)).toMatchObject({ before: 'progress', status: 'done', attribution: { executor: 'manager', origin: 'telegram', session: id, thread: 'main', operation: 'cli-done', message: 'telegram:exact:1' } })
    expect(notesStore().all()[worker]?.moves).toEqual(moves)
    manager.dispose()
    manager = new Manager(deps)
    expect((await manager.view()).activity.find((one) => one.id === 'cli-done')?.state).toBe('done')
    expect(notesStore().all()[worker]?.moves).toEqual(moves)
    await new Promise<void>((done) => setImmediate(done))
    hearings.get(id)?.({ items: [{ kind: 'theirs', id: 'after-restart', text: `\`\`\`geckit\n${JSON.stringify({ id: 'after-restart', args: ['sessions', 'mark', '--id', worker, '--status', 'blocked'] })}\n\`\`\`` }], gone: [], signals: [{ kind: 'ended', how: 'done' }] })
    await vi.waitFor(async () => expect((await manager.view()).activity.find((one) => one.id === 'after-restart')?.state).toBe('done'))
    const automatic = notesStore().all()[worker]?.moves?.at(-1)
    expect(automatic?.attribution).toMatchObject({ executor: 'manager', origin: 'unknown', operation: 'after-restart' })
    expect(automatic?.attribution?.message).toBeUndefined()
    const automaticMoves = notesStore().all()[worker]?.moves
    await expect(new (await import('../src/main/manager-operations')).ManagerOperations({ ...deps, owner: 'manager', managed: () => true, managerSession: () => id }).run([...args, '--origin', 'desktop', '--actor', 'Alex'], 'spoof')).rejects.toThrow()
    expect(notesStore().all()[worker]?.moves).toEqual(automaticMoves)
    const sentinel = await sessions.startManaged({ root, mode: 'manual', text: 'Sentinel work' }, 'manager', 'sentinel')
    const transcript = join(root, 'selected.jsonl')
    const sentinelTranscript = join(root, 'sentinel.jsonl')
    const projectFile = join(root, 'project.txt')
    writeFileSync(transcript, 'selected disposable transcript')
    writeFileSync(sentinelTranscript, 'sentinel disposable transcript')
    writeFileSync(projectFile, 'project files survive')
    transcripts.set(worker, transcript)
    transcripts.set(sentinel, sentinelTranscript)
    notes.set(worker, { ...notes.all()[worker], managerFollowers: ['fixture-thread'] })
    settings = { ...settings, favorites: [worker, sentinel] }
    await sessions.send({ session: worker, root, mode: 'manual', text: 'Cancel this follow-up' })
    const deletion = ['sessions', 'delete', '--id', worker]
    const issue = (operation: string): void => hearings.get(id)?.({ items: [{ kind: 'theirs', id: operation, text: '```geckit\n' + JSON.stringify({ id: operation, args: deletion }) + '\n```' }], gone: [], signals: [{ kind: 'ended', how: 'done' }] })
    issue('delete-refused')
    await vi.waitFor(async () => expect((await manager.view()).decisions).toHaveLength(1))
    const refused = (await manager.view()).decisions[0]
    if (refused === undefined) throw new Error('Missing delete refusal fixture')
    expect(deleted).toEqual([])
    await manager.answer(refused.id, 'refuse')
    expect(readFileSync(transcript, 'utf8')).toBe('selected disposable transcript')
    expect(settings.favorites).toEqual([worker, sentinel])
    expect(notes.all()[worker]?.queued).toHaveLength(1)
    await manager.configure({ delegation: 'automatic' })
    issue('delete-allowed')
    await vi.waitFor(async () => expect((await manager.view()).decisions).toHaveLength(1))
    const allowed = (await manager.view()).decisions[0]
    if (allowed === undefined) throw new Error('Missing delete approval fixture')
    expect(allowed.title).toContain(worker)
    expect(allowed.title).toContain('Project files are kept')
    expect(deleted).toEqual([])
    await expect(runManagerCli(process.execPath, join(client, 'out/service/cli.js'), deletion, { data: location.folder, session: id, token: 'invalid-fixture-token', operation: 'delete-allowed' })).rejects.toThrow('not authorized')
    expect(deleted).toEqual([])
    await manager.answer(allowed.id, 'allow')
    await vi.waitFor(async () => expect((await manager.view()).activity.find((one) => one.id === 'delete-allowed')?.state).toBe('done'))
    const receipt = (await manager.view()).activity.find((one) => one.id === 'delete-allowed')?.result
    expect(JSON.parse(receipt ?? '{}')).toEqual({ id: worker, deleted: true, stopped: true, queueCleared: true, projectFilesKept: true })
    expect(deleted).toEqual([worker])
    expect(() => readFileSync(transcript)).toThrow()
    expect(readFileSync(sentinelTranscript, 'utf8')).toBe('sentinel disposable transcript')
    expect(readFileSync(projectFile, 'utf8')).toBe('project files survive')
    expect(settings.favorites).toEqual([sentinel])
    expect(notesStore().all()[worker]?.queued).toBeUndefined()
    expect(notesStore().all()[worker]?.managerOwner).toBeUndefined()
    expect(notesStore().all()[worker]?.managerFollowers).toBeUndefined()
    issue('delete-allowed')
    await new Promise<void>((done) => setImmediate(done))
    expect(deleted).toEqual([worker])
    manager.dispose()
    manager = new Manager(deps)
    expect((await manager.view()).activity.find((one) => one.id === 'delete-allowed')?.result).toBe(receipt)
  } finally {
    manager.dispose()
    sessions.dispose()
    await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()))
  }
}, 40_000)
