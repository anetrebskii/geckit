import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => process.env['GECKIT_PLUGIN_TEST_HOME'] }, shell: { trashItem: async (path: string) => (await import('node:fs/promises')).rm(path, { recursive: true, force: true }) } }))

import { installPlugin, installedPlugins, loadPlugin, uninstallPlugin, updateInstalledPlugins } from '../src/main/sessions/plugins'
import { flushPluginLogs } from '../src/main/sessions/plugin-logs'
import type { PluginLogEntry } from '../src/main/sessions/plugin-logs'
import { providerOf } from '../src/shared/api'
import type { ClaudeModel } from '../src/shared/api'
import { isCodexProvider, llmProviderInfo, registerProviderInfo, selectableProviders } from '../src/shared/providers'

const folders: string[] = []
const methods = ['account', 'program', 'models', 'limits', 'list', 'search', 'hidden', 'create', 'fork', 'has', 'read', 'links', 'goal', 'setGoal', 'clearGoal', 'hold', 'rename', 'remote', 'mcp', 'browsers', 'correct', 'setInstructions', 'delete', 'dispose']
const own = `{ available: true, localOnly: false, subscriptionOnly: true, images: false, remoteControl: false, nativeGoals: false, idleMs: 600000, waitForExit: false, ${methods.map((method) => `${method}: async () => undefined`).join(', ')} }`
const pluginLogEntries = async (home: string, id = 'plugin-logged'): Promise<PluginLogEntry[]> => {
  const path = join(home, 'provider-logs', `${id}.jsonl`)
  await flushPluginLogs(path)
  return (await readFile(path, 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as PluginLogEntry)
}
const loggingPlugin = async (path: string, source: string): Promise<void> => {
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { id: 'plugin:logged', family: 'plugin:logged', name: 'Logged', shortName: 'Logged', icon: 'terminal', browser: 'none', loginCommand: '', planName: '' } }))
  await writeFile(join(path, 'index.mjs'), source)
}
afterEach(async () => {
  delete process.env['GECKIT_PLUGIN_TEST_HOME']
  delete process.env['GIT_CONFIG_COUNT']
  delete process.env['GIT_CONFIG_KEY_0']
  delete process.env['GIT_CONFIG_VALUE_0']
  delete process.env['GIT_CONFIG_KEY_1']
  delete process.env['GIT_CONFIG_VALUE_1']
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })))
})

it('loads an external provider that implements the whole interface', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'geckit-plugin-'))
  folders.push(folder)
  await writeFile(join(folder, 'geckit-plugin.json'), JSON.stringify({
    apiVersion: 1,
    entry: 'index.mjs',
    provider: { id: 'plugin:kimi', family: 'plugin:kimi', name: 'Kimi Code', shortName: 'Kimi', icon: 'terminal', browser: 'none', loginCommand: 'kimi login', planName: '', resumeCommand: 'kimi resume {id}' },
  }))
  await writeFile(join(folder, 'index.mjs'), `export const create = () => ({ ...${own}, id: 'plugin:kimi', subscriptionOnly: false, create: async () => 'plugin:kimi:session-1' })`)
  const loaded = await loadPlugin(folder)
  expect(loaded.provider.name).toBe('Kimi Code')
  expect(await loaded.provider.create({ root: '/work', mode: 'auto' })).toBe('plugin:kimi:session-1')
  expect(typeof loaded.provider.hold).toBe('function')
  expect(selectableProviders({ chatProviders: ['claude', 'plugin:kimi'], providerPlugins: [loaded.info] }).map((one) => [one.name, one.icon])).toEqual([['Claude Code', 'claude'], ['Kimi Code', 'terminal']])
})

it('passes only a scoped logger to new factories and audits concurrent host limits without logging arguments', async () => {
  const home = await mkdtemp(join(tmpdir(), 'geckit-logged-plugin-'))
  folders.push(home)
  process.env['GECKIT_PLUGIN_TEST_HOME'] = home
  const path = join(home, 'source')
  await loggingPlugin(path, `export const create = (context) => {
    if (Object.keys(context).join(',') !== 'log') throw new Error('Unexpected host access');
    context.log.write('info', 'plugin.initialized', { ready: true });
    return { ...${own}, id: 'plugin:logged', create: async () => context.log.path,
      limits: async (models) => { if (models.length > 0) throw new Error('private backend body'); return { windows: new Map() }; }
    };
  }`)
  const loaded = await loadPlugin(path)
  expect(await loaded.provider.create({ root: '/private/root', mode: 'auto' })).toBe(join(home, 'provider-logs', 'plugin-logged.jsonl'))
  await Promise.all([
    expect(loaded.provider.limits([])).resolves.toEqual({ windows: new Map() }),
    expect(loaded.provider.limits(['private model argument'])).rejects.toThrow('private backend body'),
  ])
  loaded.provider.dispose()
  const entries = await pluginLogEntries(home)
  expect(entries.map((entry) => entry.event)).toEqual([
    'plugin.load.started', 'plugin.initialized', 'plugin.load.completed',
    'limits.host.requested', 'limits.host.requested', 'limits.host.completed', 'limits.host.failed', 'plugin.dispose.requested',
  ])
  expect(new Set(entries.map((entry) => entry.fields?.['loadId'])).size).toBe(1)
  expect(entries.every((entry) => entry.fields?.['loadKind'] === 'repository')).toBe(true)
  const requested = entries.filter((entry) => entry.event === 'limits.host.requested')
  expect(requested.map((entry) => entry.fields?.['modelCount'])).toEqual([0, 1])
  expect(entries.find((entry) => entry.event === 'limits.host.completed')?.fields?.['requestId']).toBe(requested[0]?.fields?.['requestId'])
  expect(entries.find((entry) => entry.event === 'limits.host.failed')?.fields?.['requestId']).toBe(requested[1]?.fields?.['requestId'])
  expect(JSON.stringify(entries)).not.toMatch(/private backend body|private model argument|private\/root/)
})

it('keeps no-argument factories working and distinguishes candidates and snapshots sharing a log', async () => {
  const home = await mkdtemp(join(tmpdir(), 'geckit-legacy-logs-'))
  folders.push(home)
  process.env['GECKIT_PLUGIN_TEST_HOME'] = home
  for (const name of ['.update-test', '.active-test']) {
    const path = join(home, name)
    await loggingPlugin(path, `export const create = () => ({ ...${own}, id: 'plugin:logged', limits: async () => ({ windows: new Map() }) })`)
    await (await loadPlugin(path)).provider.limits([])
  }
  const entries = await pluginLogEntries(home)
  expect(entries.filter((entry) => entry.event === 'plugin.load.started').map((entry) => entry.fields?.['loadKind'])).toEqual(['candidate', 'snapshot'])
  expect(new Set(entries.map((entry) => entry.fields?.['loadId'])).size).toBe(2)
  expect(entries.filter((entry) => entry.event === 'limits.host.completed')).toHaveLength(2)
})

it('records failed loading without capturing errors or interrupting successful loads after storage failures', async () => {
  const home = await mkdtemp(join(tmpdir(), 'geckit-failed-logs-'))
  folders.push(home)
  process.env['GECKIT_PLUGIN_TEST_HOME'] = home
  const path = join(home, 'source')
  await loggingPlugin(path, `export const create = () => { throw new Error('private prompt in error'); }`)
  await expect(loadPlugin(path)).rejects.toThrow('private prompt in error')
  const entries = await pluginLogEntries(home)
  expect(entries.map((entry) => entry.event)).toEqual(['plugin.load.started', 'plugin.load.failed'])
  expect(JSON.stringify(entries)).not.toContain('private prompt')
  await rm(join(home, 'provider-logs'), { recursive: true })
  await writeFile(join(home, 'provider-logs'), 'block logging')
  await loggingPlugin(path, `export const create = () => ({ ...${own}, id: 'plugin:logged', limits: async () => ({ windows: new Map() }) })`)
  const loaded = await loadPlugin(path)
  await expect(loaded.provider.limits([])).resolves.toEqual({ windows: new Map() })
  await expect(flushPluginLogs(join(home, 'provider-logs', 'plugin-logged.jsonl'))).resolves.toBeUndefined()
})


it('installs a public GitHub provider through git and loads it at startup', async () => {
  const source = await mkdtemp(join(tmpdir(), 'geckit-plugin-source-'))
  const home = await mkdtemp(join(tmpdir(), 'geckit-plugin-home-'))
  folders.push(source, home)
  await writeFile(join(source, 'geckit-plugin.json'), JSON.stringify({
    apiVersion: 1,
    entry: 'index.mjs',
    provider: { id: 'plugin:kimi', family: 'plugin:kimi', name: 'Kimi Code', shortName: 'Kimi', icon: 'terminal', browser: 'none', loginCommand: 'kimi login', planName: '' },
  }))
  await writeFile(join(source, 'index.mjs'), `export const create = () => ({ ...${own}, id: 'plugin:kimi', subscriptionOnly: false })`)
  execFileSync('git', ['init', '-q', source])
  execFileSync('git', ['-C', source, 'add', '.'])
  execFileSync('git', ['-C', source, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Add provider'])
  process.env['GECKIT_PLUGIN_TEST_HOME'] = home
  process.env['GIT_CONFIG_COUNT'] = '1'
  process.env['GIT_CONFIG_KEY_0'] = `url.file://${source}.insteadOf`
  process.env['GIT_CONFIG_VALUE_0'] = 'https://github.com/example/kimi.git'
  const loaded = await installPlugin('https://github.com/example/kimi')
  expect(loaded.provider.id).toBe('plugin:kimi')
  expect(loaded.provider.subscriptionOnly).toBe(false)
  await expect(installPlugin('https://github.com/example/kimi')).rejects.toThrow('already installed')
  const ready = join(home, 'provider-plugins', '.ready-plugin-kimi')
  await mkdir(ready)
  await uninstallPlugin('plugin:kimi')
  expect(await stat(join(home, 'provider-plugins', 'plugin-kimi')).then(() => true, () => false)).toBe(false)
  expect(await stat(ready).then(() => true, () => false)).toBe(false)
  await expect(installPlugin('https://github.com/example/kimi')).rejects.toThrow('Restart GeckIt')
})

it('keeps several libraries and applies validated updates on the next start', async () => {
  const home = await mkdtemp(join(tmpdir(), 'geckit-plugin-home-'))
  const sources = await Promise.all(['kimi', 'other'].map((name) => mkdtemp(join(tmpdir(), `geckit-${name}-source-`))))
  folders.push(home, ...sources)
  for (const [at, source] of sources.entries()) {
    const name = at === 0 ? 'kimi' : 'other'
    await writeFile(join(source, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { id: `plugin:${name}`, family: `plugin:${name}`, name, shortName: name, icon: 'terminal', browser: 'none', loginCommand: '', planName: '' } }))
    await writeFile(join(source, 'index.mjs'), `export const create = () => ({ ...${own}, id: 'plugin:${name}' })`)
    execFileSync('git', ['init', '-q', source])
    execFileSync('git', ['-C', source, 'add', '.'])
    execFileSync('git', ['-C', source, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Add provider'])
  }
  process.env['GECKIT_PLUGIN_TEST_HOME'] = home
  process.env['GIT_CONFIG_COUNT'] = '2'
  for (const [at, source] of sources.entries()) {
    process.env[`GIT_CONFIG_KEY_${at}`] = `url.file://${source}.insteadOf`
    process.env[`GIT_CONFIG_VALUE_${at}`] = `https://github.com/example/${at === 0 ? 'kimi' : 'other'}.git`
  }
  await installPlugin('https://github.com/example/kimi')
  await installPlugin('https://github.com/example/other')
  expect((await installedPlugins()).map((one) => one.info.source)).toEqual(['https://github.com/example/kimi', 'https://github.com/example/other'])

  const kimi = sources[0]
  if (kimi === undefined) throw new Error('Missing test repository.')
  await writeFile(join(kimi, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { id: 'plugin:kimi', family: 'plugin:kimi', name: 'Kimi 2', shortName: 'Kimi', icon: 'terminal', browser: 'none', loginCommand: '', planName: '' } }))
  execFileSync('git', ['-C', kimi, 'add', '.'])
  execFileSync('git', ['-C', kimi, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Update provider'])
  expect(await updateInstalledPlugins()).toEqual({ ready: ['plugin:kimi'], failed: [] })
  expect((await loadPlugin(join(home, 'provider-plugins', 'plugin-kimi'))).info.name).toBe('kimi')
  expect((await installedPlugins()).find((one) => one.info.id === 'plugin:kimi')?.info.name).toBe('Kimi 2')

  await writeFile(join(kimi, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { id: 'plugin:impostor', family: 'plugin:impostor', name: 'Impostor', shortName: 'Impostor', icon: 'terminal', browser: 'none', loginCommand: '', planName: '' } }))
  execFileSync('git', ['-C', kimi, 'add', '.'])
  execFileSync('git', ['-C', kimi, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Change identity'])
  expect(await updateInstalledPlugins()).toEqual({ ready: [], failed: ['plugin-kimi'] })
  expect((await loadPlugin(join(home, 'provider-plugins', 'plugin-kimi'))).info.name).toBe('Kimi 2')
  await uninstallPlugin('plugin:kimi')
  expect((await installedPlugins()).map((one) => one.info.id)).toEqual(['plugin:other'])
})

it('removes a library while its update is loading and never stages it again', async () => {
  const source = await mkdtemp(join(tmpdir(), 'geckit-update-source-'))
  const home = await mkdtemp(join(tmpdir(), 'geckit-update-home-'))
  folders.push(source, home)
  await writeFile(join(source, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { id: 'plugin:delayed', family: 'plugin:delayed', name: 'Delayed', shortName: 'Delayed', icon: 'terminal', browser: 'none', loginCommand: '', planName: '' } }))
  await writeFile(join(source, 'index.mjs'), `export const create = () => ({ ...${own}, id: 'plugin:delayed' })`)
  execFileSync('git', ['init', '-q', source])
  execFileSync('git', ['-C', source, 'add', '.'])
  execFileSync('git', ['-C', source, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Add provider'])
  process.env['GECKIT_PLUGIN_TEST_HOME'] = home
  process.env['GIT_CONFIG_COUNT'] = '1'
  process.env['GIT_CONFIG_KEY_0'] = `url.file://${source}.insteadOf`
  process.env['GIT_CONFIG_VALUE_0'] = 'https://github.com/example/delayed.git'
  let started = (): void => undefined
  let finish = (_models: ClaudeModel[] | undefined): void => undefined
  const loading = new Promise<void>((resolve) => { started = resolve })
  const release = new Promise<ClaudeModel[] | undefined>((resolve) => { finish = resolve })
  Object.assign(globalThis, { geckitPluginLoading: () => { started(); return release } })
  await installPlugin('https://github.com/example/delayed')
  await writeFile(join(source, 'index.mjs'), `export const create = async () => { await globalThis.geckitPluginLoading(); return { ...${own}, id: 'plugin:delayed' } }`)
  execFileSync('git', ['-C', source, 'add', '.'])
  execFileSync('git', ['-C', source, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Delay update loading'])
  const updating = updateInstalledPlugins()
  await loading
  try {
    await uninstallPlugin('plugin:delayed')
    expect(await stat(join(home, 'provider-plugins', 'plugin-delayed')).then(() => true, () => false)).toBe(false)
  } finally { finish(undefined) }
  expect(await updating).toEqual({ ready: [], failed: [] })
  expect(await stat(join(home, 'provider-plugins', '.ready-plugin-delayed')).then(() => true, () => false)).toBe(false)
  expect(await installedPlugins()).toEqual([])
})

it('updates Codex Mirror from a replacement to a separate assistant', async () => {
  const source = await mkdtemp(join(tmpdir(), 'geckit-codex-plugin-'))
  const home = await mkdtemp(join(tmpdir(), 'geckit-plugin-home-'))
  folders.push(source, home)
  const provider = { id: 'plugin:codex-mirror', family: 'codex', replaces: 'codex', name: 'Codex Mirror', shortName: 'Codex Mirror', icon: 'codex-mirror', iconPath: 'M8 2 14 8 8 14 2 8Z', browser: 'codex', loginCommand: 'codex login', planName: 'ChatGPT', resumeCommand: 'codex resume {id}', localOnly: true, source: 'https://github.com/anetrebskii/geckit-codex-mirror' }
  await writeFile(join(source, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider }))
  await writeFile(join(source, 'index.mjs'), `export const create = () => ({ ...${own}, id: 'plugin:codex-mirror', replaces: 'codex' })`)
  execFileSync('git', ['init', '-q', source])
  execFileSync('git', ['-C', source, 'add', '.'])
  execFileSync('git', ['-C', source, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Add Codex Mirror'])
  process.env['GECKIT_PLUGIN_TEST_HOME'] = home
  process.env['GIT_CONFIG_COUNT'] = '1'
  process.env['GIT_CONFIG_KEY_0'] = `url.file://${source}.insteadOf`
  process.env['GIT_CONFIG_VALUE_0'] = 'https://github.com/anetrebskii/geckit-codex-mirror.git'
  const loaded = await installPlugin('https://github.com/anetrebskii/geckit-codex-mirror')
  expect(loaded.provider).toMatchObject({ id: 'plugin:codex-mirror', family: 'plugin:codex-mirror', name: 'Codex Mirror', icon: 'codex-mirror' })
  expect(loaded.provider.replaces).toBeUndefined()
  await writeFile(join(source, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { ...provider, family: 'plugin:codex-mirror', replaces: undefined, runtime: 'codex' } }))
  await writeFile(join(source, 'index.mjs'), `export const create = () => ({ ...${own}, id: 'plugin:codex-mirror', family: 'plugin:codex-mirror', create: async () => 'plugin:codex-mirror:session-1' })`)
  execFileSync('git', ['-C', source, 'add', '.'])
  execFileSync('git', ['-C', source, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Make Mirror independent'])

  expect(await updateInstalledPlugins()).toEqual({ ready: ['plugin:codex-mirror'], failed: [] })
  const updated = (await installedPlugins()).find((one) => one.info.id === 'plugin:codex-mirror')
  expect(updated?.info).toMatchObject({ family: 'plugin:codex-mirror', name: 'Codex Mirror', icon: 'codex-mirror' })
  expect(updated?.info.replaces).toBeUndefined()
  registerProviderInfo(updated === undefined ? [] : [updated.info])
  expect(isCodexProvider('codex')).toBe(true)
  expect(isCodexProvider('plugin:codex-mirror')).toBe(true)
  expect(isCodexProvider('plugin:kimi')).toBe(false)
  expect(providerOf('plugin:codex-mirror:session-1')).toBe('plugin:codex-mirror')
  expect(llmProviderInfo('codex', 'stream', updated === undefined ? [] : [updated.info]).name).toBe('Codex')
  const choices = selectableProviders({ chatProviders: ['claude', 'codex', 'plugin:codex-mirror'], providerPlugins: updated === undefined ? [] : [updated.info] })
  expect(choices.map((one) => one.name)).toEqual(['Claude Code', 'Codex', 'Codex Mirror'])
  expect(selectableProviders({ chatProviders: ['claude', 'plugin:codex-mirror'], providerPlugins: updated === undefined ? [] : [updated.info] }).map((one) => one.name)).toEqual(['Claude Code', 'Codex Mirror'])
})
