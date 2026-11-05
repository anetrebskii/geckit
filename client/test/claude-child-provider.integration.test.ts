import { appendFile, cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { configureCorePlatform, corePlatform } from '../src/core/platform'
import { loadPlugin } from '../src/main/sessions/plugins'
import { flushPluginLogs } from '../src/main/sessions/plugin-logs'
import { Sessions, memoryNotes } from '../src/main/sessions'
import { ManagerOperations } from '../src/main/manager-operations'
import { DEFAULT_SETTINGS } from '../src/shared/api'

const candidate = process.env['GECKIT_CHILD_PROVIDER_CANDIDATE']
const originalPlatform = corePlatform()
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); configureCorePlatform(originalPlatform) })

it.skipIf(candidate === undefined)('carries real built tmux discovery through plugin remapping, Sessions, Manager list/show and restart using isolated transcript fixtures', async () => {
  if (candidate === undefined) return
  const folder = await mkdtemp(join(tmpdir(), 'geckit-child-contract-'))
  const config = join(folder, 'claude')
  const root = join(folder, 'project')
  const data = join(folder, 'geckit')
  const source = join(folder, 'candidate')
  const project = join(config, 'projects', root.replace(/[^A-Za-z0-9]/g, '-'))
  const parent = join(project, 'parent.jsonl')
  const helpers = join(project, 'parent', 'subagents')
  const base = Date.now()
  let now = base
  vi.spyOn(Date, 'now').mockImplementation(() => now)
  vi.stubEnv('CLAUDE_CONFIG_DIR', config)
  configureCorePlatform({ directory: () => data, source: () => true })
  const notes = memoryNotes()
  const id = 'plugin:claude-tmux:parent'
  notes.set(id, { here: true, managerOwner: 'manager' })
  const timestamp = (time: number): string => new Date(time).toISOString()
  const launch = (child: string): string => JSON.stringify({ type: 'user', timestamp: timestamp(base - 1000), toolUseResult: { isAsync: true, agentId: child }, message: { content: [] } }) + '\n'
  const terminal = (child: string, status: string): string => JSON.stringify({ type: 'user', timestamp: timestamp(now), message: { content: `<task-notification><task-id>${child}</task-id><status>${status}</status></task-notification>` } }) + '\n'
  try {
    await Promise.all([mkdir(helpers, { recursive: true }), mkdir(root), mkdir(source), mkdir(data)])
    await Promise.all(['index.mjs', 'geckit-plugin.json'].map((file) => cp(join(candidate, file), join(source, file))))
    await writeFile(join(source, 'tmux-binaries.json'), JSON.stringify({ files: {} }))
    await writeFile(parent, JSON.stringify({ type: 'user', timestamp: timestamp(base - 2000), cwd: root, message: { content: 'Fixture parent request' } }) + '\n' + launch('one') + launch('two'))
    await writeFile(join(helpers, 'agent-one.jsonl'), JSON.stringify({ type: 'assistant', timestamp: timestamp(base), isSidechain: true, message: { content: [{ type: 'tool_use', id: 'tool1', name: 'mcp__claude-in-chrome__navigate', input: {} }] } }) + '\n')
    const loaded = await loadPlugin(source)
    const make = (): Sessions => new Sessions({ notes, plugins: [loaded.provider], changed: () => undefined, items: () => undefined, account: () => undefined, notify: () => undefined, disk: { list: async () => [{ id: 'parent', title: 'Plain mirror', stands: '', at: base, driven: false }], read: async () => undefined, has: async () => false }, now: () => now })
    const sessions = make()
    const settings = { ...DEFAULT_SETTINGS, projects: [root], chatProviders: ['plugin:claude-tmux' as const] }
    const operations = new ManagerOperations({ sessions, notes, settings: () => settings, saveSettings: () => settings, owner: 'manager', managed: () => true, managerSession: () => 'manager' })
    try {
      const rows = await sessions.list([root])
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ id, state: 'working', tasks: [expect.objectContaining({ id: 'one', activity: 'browser', status: 'running' }), expect.objectContaining({ id: 'two', status: 'running' })] })
      expect(rows[0]?.canInject).toBeUndefined()
      expect(rows[0]?.canStopTasks).toBeUndefined()
      expect(JSON.parse(await operations.run(['sessions', 'list'], 'list'))).toEqual(expect.arrayContaining([expect.objectContaining({ id, state: 'working', canInject: false, canStopTasks: false, tasks: rows[0]?.tasks })]))
      expect(JSON.parse(await operations.run(['sessions', 'show', '--id', id], 'show'))).toMatchObject({ id, state: 'working', tasks: rows[0]?.tasks })
      now += 1
      await appendFile(parent, terminal('two', 'failed'))
      expect((await sessions.list([root]))[0]).toMatchObject({ state: 'working', tasks: [expect.objectContaining({ status: 'running' }), expect.objectContaining({ status: 'failed' })] })
      now += 120001
      const restarted = make()
      try {
        expect((await restarted.list([root]))[0]).toMatchObject({ state: 'idle', tasks: [expect.objectContaining({ status: 'unknown' }), expect.objectContaining({ status: 'failed' })] })
        await appendFile(parent, terminal('one', 'stopped') + launch('one'))
        expect((await restarted.list([root]))[0]).toMatchObject({ state: 'idle', tasks: [expect.objectContaining({ status: 'stopped' }), expect.objectContaining({ status: 'failed' })] })
      } finally { restarted.dispose() }
    } finally { sessions.dispose(); loaded.provider.dispose(); await flushPluginLogs(join(data, 'provider-logs', 'plugin-claude-tmux.jsonl')) }
  } finally { await rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 }) }
})
