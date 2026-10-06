import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => process.env['GECKIT_PLUGIN_TEST_HOME'] }, shell: { trashItem: async (path: string) => (await import('node:fs/promises')).rm(path, { recursive: true, force: true }) } }))

import { installPlugin, installedPlugins, loadPlugin, pluginHost, uninstallPlugin, updateInstalledPlugins } from '../src/main/sessions/plugins'
import { llmProvider } from '../src/main/sessions/provider'
import { providerOf } from '../src/shared/api'
import type { ClaudeModel } from '../src/shared/api'
import { isCodexProvider, llmProviderInfo, registerProviderInfo, selectableProviders } from '../src/shared/providers'
import { VpnAdmission } from '../src/main/vpn/admission'
import { VPN_REQUIRED_MESSAGE } from '../src/shared/vpn'

const folders: string[] = []
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
  await writeFile(join(folder, 'index.mjs'), "export const create = (host) => ({ ...host.claude, id: 'plugin:kimi', subscriptionOnly: false, create: async () => 'plugin:kimi:session-1' })")
  const loaded = await loadPlugin(folder, pluginHost(llmProvider({}, 'claude'), llmProvider({}, 'codex')))
  expect(loaded.provider.name).toBe('Kimi Code')
  expect(await loaded.provider.create({ root: '/work', mode: 'auto' })).toBe('plugin:kimi:session-1')
  expect(typeof loaded.provider.hold).toBe('function')
  expect(selectableProviders({ chatProviders: ['claude', 'plugin:kimi'], providerPlugins: [loaded.info] }).map((one) => [one.name, one.icon])).toEqual([['Claude Code', 'claude'], ['Kimi Code', 'terminal']])
})

it('denies plugin evaluation when VPN is required, cancels a reload racing activation, and loads after release', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'geckit-plugin-vpn-'))
  folders.push(folder)
  await writeFile(join(folder, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { id: 'plugin:kimi', family: 'plugin:kimi', name: 'Kimi Code', shortName: 'Kimi', icon: 'terminal', browser: 'none', loginCommand: 'kimi login', planName: '' } }))
  await writeFile(join(folder, 'index.mjs'), "export const create = async (host) => { await host.claude.models(); return { ...host.claude, id: 'plugin:kimi' } }")
  const policy = new VpnAdmission()
  let finish: (models: ClaudeModel[] | undefined) => void = () => undefined
  const pending = new Promise<ClaudeModel[] | undefined>((done) => { finish = done })
  const models = vi.fn().mockReturnValue(pending)
  const dispose = vi.fn()
  const host = pluginHost({ ...llmProvider({}, 'claude'), models, dispose }, llmProvider({}, 'codex'), policy.assert)
  await expect(loadPlugin(folder, host)).rejects.toThrow(VPN_REQUIRED_MESSAGE)
  expect(models).not.toHaveBeenCalled()
  policy.update({ required: false })
  const loading = loadPlugin(folder, host)
  const rejection = expect(loading).rejects.toThrow(VPN_REQUIRED_MESSAGE)
  await vi.waitFor(() => expect(models).toHaveBeenCalledOnce())
  policy.update({ required: true })
  finish(undefined)
  await rejection
  expect(dispose).toHaveBeenCalledOnce()
  policy.update({ required: false })
  expect((await loadPlugin(folder, host)).info.family).toBe('plugin:kimi')
  expect(dispose).toHaveBeenCalledOnce()
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
  await writeFile(join(source, 'index.mjs'), "export const create = (host) => ({ ...host.claude, id: 'plugin:kimi', subscriptionOnly: false })")
  execFileSync('git', ['init', '-q', source])
  execFileSync('git', ['-C', source, 'add', '.'])
  execFileSync('git', ['-C', source, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Add provider'])
  process.env['GECKIT_PLUGIN_TEST_HOME'] = home
  process.env['GIT_CONFIG_COUNT'] = '1'
  process.env['GIT_CONFIG_KEY_0'] = `url.file://${source}.insteadOf`
  process.env['GIT_CONFIG_VALUE_0'] = 'https://github.com/example/kimi.git'
  const host = pluginHost(llmProvider({}, 'claude'), llmProvider({}, 'codex'))
  const loaded = await installPlugin('https://github.com/example/kimi', host)
  expect(loaded.provider.id).toBe('plugin:kimi')
  expect(loaded.provider.subscriptionOnly).toBe(false)
  await expect(installPlugin('https://github.com/example/kimi', host)).rejects.toThrow('already installed')
  const ready = join(home, 'provider-plugins', '.ready-plugin-kimi')
  await mkdir(ready)
  await uninstallPlugin('plugin:kimi')
  expect(await stat(join(home, 'provider-plugins', 'plugin-kimi')).then(() => true, () => false)).toBe(false)
  expect(await stat(ready).then(() => true, () => false)).toBe(false)
  await expect(installPlugin('https://github.com/example/kimi', host)).rejects.toThrow('Restart GeckIt')
})

it('keeps several libraries and applies validated updates on the next start', async () => {
  const home = await mkdtemp(join(tmpdir(), 'geckit-plugin-home-'))
  const sources = await Promise.all(['kimi', 'other'].map((name) => mkdtemp(join(tmpdir(), `geckit-${name}-source-`))))
  folders.push(home, ...sources)
  for (const [at, source] of sources.entries()) {
    const name = at === 0 ? 'kimi' : 'other'
    await writeFile(join(source, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { id: `plugin:${name}`, family: `plugin:${name}`, name, shortName: name, icon: 'terminal', browser: 'none', loginCommand: '', planName: '' } }))
    await writeFile(join(source, 'index.mjs'), `export const create = (host) => ({ ...host.claude, id: 'plugin:${name}' })`)
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
  const host = pluginHost(llmProvider({}, 'claude'), llmProvider({}, 'codex'))
  await installPlugin('https://github.com/example/kimi', host)
  await installPlugin('https://github.com/example/other', host)
  expect((await installedPlugins(host)).map((one) => one.info.source)).toEqual(['https://github.com/example/kimi', 'https://github.com/example/other'])

  const kimi = sources[0]
  if (kimi === undefined) throw new Error('Missing test repository.')
  await writeFile(join(kimi, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { id: 'plugin:kimi', family: 'plugin:kimi', name: 'Kimi 2', shortName: 'Kimi', icon: 'terminal', browser: 'none', loginCommand: '', planName: '' } }))
  execFileSync('git', ['-C', kimi, 'add', '.'])
  execFileSync('git', ['-C', kimi, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Update provider'])
  expect(await updateInstalledPlugins(host)).toEqual({ ready: ['plugin:kimi'], failed: [] })
  expect((await loadPlugin(join(home, 'provider-plugins', 'plugin-kimi'), host)).info.name).toBe('kimi')
  expect((await installedPlugins(host)).find((one) => one.info.id === 'plugin:kimi')?.info.name).toBe('Kimi 2')

  await writeFile(join(kimi, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { id: 'plugin:impostor', family: 'plugin:impostor', name: 'Impostor', shortName: 'Impostor', icon: 'terminal', browser: 'none', loginCommand: '', planName: '' } }))
  execFileSync('git', ['-C', kimi, 'add', '.'])
  execFileSync('git', ['-C', kimi, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Change identity'])
  expect(await updateInstalledPlugins(host)).toEqual({ ready: [], failed: ['plugin-kimi'] })
  expect((await loadPlugin(join(home, 'provider-plugins', 'plugin-kimi'), host)).info.name).toBe('Kimi 2')
  await uninstallPlugin('plugin:kimi')
  expect((await installedPlugins(host)).map((one) => one.info.id)).toEqual(['plugin:other'])
})

it('removes a library while its update is loading and never stages it again', async () => {
  const source = await mkdtemp(join(tmpdir(), 'geckit-update-source-'))
  const home = await mkdtemp(join(tmpdir(), 'geckit-update-home-'))
  folders.push(source, home)
  await writeFile(join(source, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { id: 'plugin:delayed', family: 'plugin:delayed', name: 'Delayed', shortName: 'Delayed', icon: 'terminal', browser: 'none', loginCommand: '', planName: '' } }))
  await writeFile(join(source, 'index.mjs'), "export const create = host => ({ ...host.claude, id: 'plugin:delayed' })")
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
  const host = pluginHost(llmProvider({}, 'claude'), { ...llmProvider({}, 'codex'), models: () => { started(); return release } })
  await installPlugin('https://github.com/example/delayed', host)
  await writeFile(join(source, 'index.mjs'), "export const create = async host => { await host.codex.models(); return { ...host.claude, id: 'plugin:delayed' } }")
  execFileSync('git', ['-C', source, 'add', '.'])
  execFileSync('git', ['-C', source, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Delay update loading'])
  const updating = updateInstalledPlugins(host)
  await loading
  try {
    await uninstallPlugin('plugin:delayed')
    expect(await stat(join(home, 'provider-plugins', 'plugin-delayed')).then(() => true, () => false)).toBe(false)
  } finally { finish(undefined) }
  expect(await updating).toEqual({ ready: [], failed: [] })
  expect(await stat(join(home, 'provider-plugins', '.ready-plugin-delayed')).then(() => true, () => false)).toBe(false)
  expect(await installedPlugins(host)).toEqual([])
})

it('updates Codex Mirror from a replacement to a separate assistant', async () => {
  const source = await mkdtemp(join(tmpdir(), 'geckit-codex-plugin-'))
  const home = await mkdtemp(join(tmpdir(), 'geckit-plugin-home-'))
  folders.push(source, home)
  const provider = { id: 'plugin:codex-mirror', family: 'codex', replaces: 'codex', name: 'Codex Mirror', shortName: 'Codex Mirror', icon: 'codex-mirror', iconPath: 'M8 2 14 8 8 14 2 8Z', browser: 'codex', loginCommand: 'codex login', planName: 'ChatGPT', resumeCommand: 'codex resume {id}', localOnly: true, source: 'https://github.com/anetrebskii/geckit-codex-mirror' }
  await writeFile(join(source, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider }))
  await writeFile(join(source, 'index.mjs'), "export const create = (host) => ({ ...host.codex, id: 'plugin:codex-mirror', replaces: 'codex' })")
  execFileSync('git', ['init', '-q', source])
  execFileSync('git', ['-C', source, 'add', '.'])
  execFileSync('git', ['-C', source, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Add Codex Mirror'])
  process.env['GECKIT_PLUGIN_TEST_HOME'] = home
  process.env['GIT_CONFIG_COUNT'] = '1'
  process.env['GIT_CONFIG_KEY_0'] = `url.file://${source}.insteadOf`
  process.env['GIT_CONFIG_VALUE_0'] = 'https://github.com/anetrebskii/geckit-codex-mirror.git'
  const host = pluginHost(llmProvider({}, 'claude'), llmProvider({}, 'codex'))
  const loaded = await installPlugin('https://github.com/anetrebskii/geckit-codex-mirror', host)
  expect(loaded.provider).toMatchObject({ name: 'Codex Mirror', icon: 'codex-mirror', replaces: 'codex' })
  await writeFile(join(source, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { ...provider, family: 'plugin:codex-mirror', replaces: undefined, runtime: 'codex' } }))
  await writeFile(join(source, 'index.mjs'), "export const create = (host) => ({ ...host.codex, id: 'plugin:codex-mirror', family: 'plugin:codex-mirror', create: async (options) => `plugin:codex-mirror:${(await host.codex.create(options)).slice(6)}` })")
  execFileSync('git', ['-C', source, 'add', '.'])
  execFileSync('git', ['-C', source, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Make Mirror independent'])

  expect(await updateInstalledPlugins(host)).toEqual({ ready: ['plugin:codex-mirror'], failed: [] })
  const updated = (await installedPlugins(host)).find((one) => one.info.id === 'plugin:codex-mirror')
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
