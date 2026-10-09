import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, readdir, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import { basename, join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { app, shell } from 'electron'

import type { LlmProviderInfo, PluginUpdateResult, ProviderPluginFailure } from '../../shared/providers'
import { independentProviderInfo } from '../../shared/providers'
import type { SessionProvider } from '../../shared/api'
import type { LlmProvider } from './provider'
import type { PluginContext, PluginLogger } from './plugin-api'
import { pluginLogger } from './plugin-logs'

interface PluginManifest {
  readonly apiVersion: 1
  readonly entry: string
  readonly provider: LlmProviderInfo
}

interface PluginModule {
  readonly create: (context: PluginContext) => LlmProvider | Promise<LlmProvider>
}

const sameProvider = (current: LlmProviderInfo, next: LlmProviderInfo): boolean =>
  independentProviderInfo(current).id === independentProviderInfo(next).id

export interface LoadedPlugin {
  readonly provider: LlmProvider
  readonly info: LlmProviderInfo
  readonly path: string
}

const folder = (): string => join(app.getPath('userData'), 'provider-plugins')
const active = new Map<SessionProvider, LlmProvider>()
const removedUntilRestart = new Set<string>()
let loadFailures: readonly ProviderPluginFailure[] = []
export const providerPluginFailures = (): readonly ProviderPluginFailure[] => loadFailures
export const pluginProvider = (family: SessionProvider): LlmProvider | undefined => active.get(family)
const git = (args: readonly string[], timeout = 120_000): Promise<string> => new Promise((done, fail) => {
  execFile('git', [...args], { timeout, maxBuffer: 1024 * 1024 }, (error, stdout) => error === null ? done(stdout.trim()) : fail(error))
})
const pluginId = (id: string): id is LlmProviderInfo['id'] => id === 'claude-tmux' || /^plugin:[a-z][a-z0-9-]*$/.test(id)
const methods = ['account', 'program', 'models', 'limits', 'list', 'search', 'hidden', 'create', 'fork', 'has', 'read', 'links', 'goal', 'setGoal', 'clearGoal', 'hold', 'rename', 'remote', 'mcp', 'browsers', 'correct', 'setInstructions', 'delete', 'dispose'] as const
const capabilities = ['available', 'localOnly', 'subscriptionOnly', 'images', 'remoteControl', 'nativeGoals', 'waitForExit'] as const

const libraryPath = async (id: LlmProviderInfo['id']): Promise<string> => {
  const normalized = id === 'claude-tmux' ? 'plugin:claude-tmux' : id
  const current = join(folder(), normalized.replaceAll(':', '-'))
  if (await stat(current).then(() => true, () => false)) return current
  const legacy = join(folder(), 'claude-tmux')
  if (normalized === 'plugin:claude-tmux' && await stat(legacy).then(() => true, () => false)) return legacy
  return join(folder(), id.replaceAll(':', '-'))
}

const independentProvider = (provider: LlmProvider, info: LlmProviderInfo): LlmProvider => {
  if (provider.family === info.family) return { ...provider, ...info }
  const { replaces: _replaces, transport: _transport, ...driver } = provider
  const external = (id: string): string => id.startsWith(`${info.family}:`) ? id : `${info.family}:${provider.family === 'codex' ? id.replace(/^codex:/, '') : id}`
  const native = (id: string): string => {
    if (!id.startsWith(`${info.family}:`)) return id
    const thread = id.slice(info.family.length + 1)
    return provider.family === 'codex' ? `codex:${thread}` : thread
  }
  return {
    ...driver,
    ...info,
    account: async () => ({ ...await provider.account(), provider: info.family }),
    list: async (roots) => (await provider.list(roots)).map((row) => ({ ...row, id: external(row.id), ...(row.importedFrom === undefined ? {} : { importedFrom: external(row.importedFrom) }) })),
    search: async (roots, asked) => (await provider.search(roots, asked)).map((row) => ({ ...row, id: external(row.id) })),
    hidden: async (from, to, include) => (await provider.hidden(from, to, (id) => include(external(id)))).map((row) => ({ ...row, id: external(row.id) })),
    create: async (options) => external(await provider.create(options)),
    fork: async (root, id, at, mode, model) => {
      const forked = await provider.fork(root, native(id), at, mode, model)
      return { ...forked, id: external(forked.id), ...(forked.fork === undefined ? {} : { fork: { ...forked.fork, from: external(forked.fork.from) } }) }
    },
    has: (root, id) => provider.has(root, native(id)),
    read: (root, id) => provider.read(root, native(id)),
    links: (root, id) => provider.links(root, native(id)),
    goal: (root, id) => provider.goal(root, native(id)),
    setGoal: (id, objective) => provider.setGoal(native(id), objective),
    clearGoal: (id) => provider.clearGoal(native(id)),
    hold: (options, hear, left) => provider.hold({ ...options, id: native(options.id), ...(options.fork === undefined ? {} : { fork: { ...options.fork, from: native(options.fork.from) } }) }, (heard) => hear({ ...heard, signals: heard.signals.map((signal) => signal.kind === 'started' ? { ...signal, session: external(signal.session) } : signal) }), left),
    rename: (id, name, driver) => provider.rename(native(id), name, driver),
    delete: (root, id) => provider.delete(root, native(id)),
  }
}

const manifestAt = async (path: string): Promise<PluginManifest> => {
  const parsed: object = JSON.parse(await readFile(join(path, 'geckit-plugin.json'), 'utf8')) as object
  if (!('apiVersion' in parsed) || parsed.apiVersion !== 1 || !('entry' in parsed) || typeof parsed.entry !== 'string' || !('provider' in parsed) || typeof parsed.provider !== 'object' || parsed.provider === null) throw new Error('Invalid GeckIt plugin manifest.')
  const provider = parsed.provider
  if (!('id' in provider) || typeof provider.id !== 'string' || !pluginId(provider.id) || !('family' in provider) || typeof provider.family !== 'string' || !('name' in provider) || typeof provider.name !== 'string' || !('shortName' in provider) || typeof provider.shortName !== 'string' || !('icon' in provider) || typeof provider.icon !== 'string' || !('browser' in provider) || !['none', 'claude', 'codex'].includes(String(provider.browser)) || !('loginCommand' in provider) || typeof provider.loginCommand !== 'string' || !('planName' in provider) || typeof provider.planName !== 'string') throw new Error('Invalid provider metadata.')
  if ('iconPath' in provider && (typeof provider.iconPath !== 'string' || provider.iconPath.length > 2048)) throw new Error('Invalid provider icon.')
  if ('resumeCommand' in provider && typeof provider.resumeCommand !== 'string') throw new Error('Invalid provider resume command.')
  if ('runtime' in provider && provider.runtime !== 'codex') throw new Error('Invalid provider runtime.')
  if ('instructions' in provider && provider.instructions !== 'claude' && provider.instructions !== 'codex' && provider.instructions !== 'own') throw new Error('Invalid provider instructions.')
  const transport = 'transport' in provider ? provider.transport : undefined
  const replaces = 'replaces' in provider ? provider.replaces : undefined
  if (provider.id === 'claude-tmux' ? provider.family !== 'claude' || transport !== 'tmux' || replaces !== undefined : replaces === 'codex' ? provider.family !== 'codex' || transport !== undefined : replaces !== undefined || provider.family !== provider.id || transport !== undefined) throw new Error('Plugin provider ID does not match its family and transport.')
  if (parsed.entry !== 'index.mjs') throw new Error('Plugin entry must be index.mjs.')
  return parsed as PluginManifest
}

async function loadPluginSnapshot(path: string): Promise<LoadedPlugin> {
  const snapshot = join(folder(), `.active-${randomUUID()}`)
  try {
    await cp(path, snapshot, { recursive: true })
    return await loadPlugin(snapshot)
  } catch (error) {
    await rm(snapshot, { recursive: true, force: true })
    throw error
  }
}

const withPluginLogs = (provider: LlmProvider, log: PluginLogger): LlmProvider => ({
  ...provider,
  limits: async (models) => {
    const requestId = randomUUID()
    const started = Date.now()
    log.write('debug', 'limits.host.requested', { requestId, modelCount: models.length })
    try {
      const limits = await provider.limits(models)
      log.write('debug', 'limits.host.completed', { requestId, durationMs: Date.now() - started })
      return limits
    } catch (error) {
      log.write('error', 'limits.host.failed', { requestId, durationMs: Date.now() - started })
      throw error
    }
  },
  dispose: () => {
    log.write('info', 'plugin.dispose.requested')
    return provider.dispose()
  },
})

export const loadPlugin = async (path: string): Promise<LoadedPlugin> => {
  const manifest = await manifestAt(path)
  const info = independentProviderInfo(manifest.provider)
  const name = basename(path)
  const loadKind = name.startsWith('.active-') ? 'snapshot' : /^\.(?:ready|update|install|reinstall)-/.test(name) ? 'candidate' : 'repository'
  const log = pluginLogger(info, { loadId: randomUUID(), loadKind })
  log.write('info', 'plugin.load.started')
  let stage: 'entry' | 'module' | 'factory' | 'contract' = 'entry'
  try {
    const entry = await realpath(join(path, manifest.entry))
    if (relative(await realpath(resolve(path)), entry).startsWith('..')) throw new Error('Plugin entry leaves its repository.')

    const moduleUrl = pathToFileURL(entry)
    moduleUrl.searchParams.set('geckit', randomUUID())
    stage = 'module'
    const module = await import(moduleUrl.href) as Partial<PluginModule>
    if (typeof module.create !== 'function') throw new Error('Plugin must export create().')

    stage = 'factory'
    const provider = await module.create({ log })
    stage = 'contract'
    const compatible = typeof provider === 'object' && provider !== null && typeof provider.setInstructions !== 'function'
      ? { ...provider, setInstructions: async () => {} }
      : provider
    if (typeof compatible !== 'object' || compatible === null || methods.some((method) => typeof compatible[method] !== 'function') || capabilities.some((field) => typeof compatible[field] !== 'boolean') || typeof compatible.idleMs !== 'number') throw new Error('Plugin does not implement LlmProvider.')
    if (provider.id !== manifest.provider.id) throw new Error('Plugin ID differs from its manifest.')
    const loaded = { path, info, provider: withPluginLogs(independentProvider({ ...compatible, ...manifest.provider }, info), log) }
    log.write('info', 'plugin.load.completed')
    return loaded
  } catch (error) {
    log.write('error', 'plugin.load.failed', { stage })
    throw error
  }
}

export async function installedPlugins(): Promise<LoadedPlugin[]> {
  await recoverBackups()
  await applyReadyUpdates()
  const entries = await readdir(folder(), { withFileTypes: true }).catch(() => [])
  const attempts = await Promise.all(entries.filter((one) => one.isDirectory() && !one.name.startsWith('.')).map(async (one) => {
    const path = join(folder(), one.name)
    try {
      const plugin = await loadPluginSnapshot(path)
      const source = await sourceAt(path).catch(() => undefined)
      return { plugin: source === undefined ? plugin : { ...plugin, info: { ...plugin.info, source }, provider: { ...plugin.provider, source } } }
    } catch (error) {
      const manifest = await manifestAt(path).catch(() => undefined)
      const source = await sourceAt(path).catch(() => undefined)
      const info = manifest === undefined ? undefined : independentProviderInfo(manifest.provider)
      const resolvedSource = source ?? info?.source
      return {
        failure: {
          ...(info === undefined ? {} : { id: info.id }),
          name: info?.name ?? basename(path),
          icon: info?.icon ?? 'terminal',
          ...(resolvedSource === undefined ? {} : { source: resolvedSource }),
          error: error instanceof Error ? error.message : String(error),
        } satisfies ProviderPluginFailure,
      }
    }
  }))
  const ready = attempts.flatMap((one) => 'plugin' in one ? [one.plugin] : [])
  loadFailures = attempts.flatMap((one) => 'failure' in one ? [one.failure] : [])
  for (const one of ready) active.set(one.provider.family, one.provider)
  return ready
}

const githubUrl = (given: string): string => {
  const url = new URL(given)
  const parts = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean)
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || parts.length !== 2 || parts.some((part) => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(part))) throw new Error('Enter a public GitHub repository URL.')
  return `https://github.com/${parts[0]}/${parts[1]}.git`
}

const sourceAt = async (path: string): Promise<string> =>
  githubUrl(await git(['-C', path, 'config', '--get', 'remote.origin.url'])).replace(/\.git$/, '')

async function recoverBackups(): Promise<void> {
  const entries = await readdir(folder(), { withFileTypes: true }).catch(() => [])
  for (const one of entries.filter((entry) => entry.isDirectory() && entry.name.startsWith('.backup-'))) {
    try {
      const backup = join(folder(), one.name)
      const manifest = await manifestAt(backup).catch(() => undefined)
      if (manifest === undefined) continue
      const destination = await libraryPath(manifest.provider.id)
      if (await stat(destination).then(() => true, () => false)) {
        if (one.name.startsWith('.backup-reinstall-')) {
          await rm(destination, { recursive: true, force: true })
          await rename(backup, destination)
        } else await rm(backup, { recursive: true, force: true })
      } else await rename(backup, destination)
    } catch { /* A broken library must not stop GeckIt from opening. */ }
  }
  const copies = await readdir(folder(), { withFileTypes: true }).catch(() => [])
  await Promise.all(copies.filter((one) => one.isDirectory() && one.name.startsWith('.active-')).map((one) => rm(join(folder(), one.name), { recursive: true, force: true }).catch(() => undefined)))
}

async function applyReadyUpdates(): Promise<void> {
  const entries = await readdir(folder(), { withFileTypes: true }).catch(() => [])
  for (const one of entries.filter((entry) => entry.isDirectory() && entry.name.startsWith('.ready-'))) {
    try {
      const ready = join(folder(), one.name)
      const manifest = await manifestAt(ready).catch(() => undefined)
      if (manifest === undefined) continue
      const destination = await libraryPath(manifest.provider.id)
      const current = await manifestAt(destination).catch(() => undefined)
      if (current === undefined || !sameProvider(current.provider, manifest.provider)) continue
      const candidate = await loadPlugin(ready).catch(() => undefined)
      if (candidate === undefined) continue
      await candidate.provider.dispose()
      const backup = join(folder(), `.backup-${randomUUID()}`)
      await rename(destination, backup)
      try { await rename(ready, destination) }
      catch (error) { await rename(backup, destination); throw error }
      await rm(backup, { recursive: true, force: true })
    } catch { /* Keep the current provider if the staged version cannot be applied. */ }
  }
}


export async function applyReadyPlugin(id: string): Promise<LoadedPlugin> {
  if (!pluginId(id)) throw new Error('Invalid provider ID.')
  const destination = await libraryPath(id)
  const current = await manifestAt(destination)
  if (independentProviderInfo(current.provider).id !== id && current.provider.id !== id) throw new Error('Installed provider ID does not match.')
  const entries = await readdir(folder(), { withFileTypes: true }).catch(() => [])
  let ready: string | undefined
  for (const entry of entries.filter((one) => one.isDirectory() && one.name.startsWith('.ready-'))) {
    const path = join(folder(), entry.name)
    const manifest = await manifestAt(path).catch(() => undefined)
    if (manifest !== undefined && independentProviderInfo(manifest.provider).id === id) {
      ready = path
      break
    }
  }
  if (ready === undefined) throw new Error('No update is ready for this library. Check for updates and try again.')

  const candidate = await loadPlugin(ready)
  if (!sameProvider(current.provider, candidate.info) || candidate.info.id !== id) {
    await candidate.provider.dispose()
    throw new Error('Updated plugin changed its provider identity.')
  }
  await candidate.provider.dispose()

  const backup = join(folder(), `.backup-${randomUUID()}`)
  await rename(destination, backup)
  try {
    await rename(ready, destination)
    const loaded = await loadPluginSnapshot(destination)
    const source = await sourceAt(destination).catch(() => current.provider.source)
    const updated = source === undefined
      ? loaded
      : { ...loaded, info: { ...loaded.info, source }, provider: { ...loaded.provider, source } }
    active.set(updated.provider.family, updated.provider)
    return updated
  } catch (error) {
    try { await rename(destination, ready) }
    catch { await rm(destination, { recursive: true, force: true }).catch(() => undefined) }
    await rename(backup, destination)
    throw error
  }
}

export async function installPlugin(given: string): Promise<LoadedPlugin> {
  const url = githubUrl(given)
  await mkdir(folder(), { recursive: true })
  const staging = join(folder(), `.install-${randomUUID()}`)
  try {
    await git(['clone', '--depth', '1', url, staging])
    const manifest = await manifestAt(staging)
    const destination = await libraryPath(manifest.provider.id)
    if (removedUntilRestart.has(destination) || removedUntilRestart.has(join(folder(), independentProviderInfo(manifest.provider).id.replaceAll(':', '-'))) || removedUntilRestart.has(join(folder(), 'claude-tmux')) && independentProviderInfo(manifest.provider).id === 'plugin:claude-tmux') throw new Error('Restart GeckIt before adding this library again.')
    if (await stat(destination).then(() => true, () => false)) throw new Error(`${manifest.provider.name} is already installed.`)
    await rename(staging, destination)
    try {
      const found = await loadPluginSnapshot(destination)
      const source = url.replace(/\.git$/, '')
    const loaded = { ...found, info: { ...found.info, source }, provider: { ...found.provider, source } }
    active.set(loaded.provider.family, loaded.provider)
    loadFailures = loadFailures.filter((one) => one.id !== loaded.info.id)
    return loaded
    }
    catch (error) { await rm(destination, { recursive: true, force: true }); throw error }
  } finally { await rm(staging, { recursive: true, force: true }) }
}

export async function reinstallFailedPlugin(id: string): Promise<LoadedPlugin> {
  const failure = loadFailures.find((one) => one.id === id)
  if (failure?.source === undefined) throw new Error('A GitHub source could not be identified for this library.')
  const url = githubUrl(failure.source)
  await mkdir(folder(), { recursive: true })
  const staging = join(folder(), `.reinstall-${randomUUID()}`)
  const backup = join(folder(), `.backup-reinstall-${randomUUID()}`)
  let destination: string | undefined
  try {
    await git(['clone', '--depth', '1', url, staging])
    const manifest = await manifestAt(staging)
    const info = independentProviderInfo(manifest.provider)
    if (info.id !== id) throw new Error('The repository now contains a different provider.')
    destination = await libraryPath(id)
    const current = await manifestAt(destination)
    if (independentProviderInfo(current.provider).id !== id) throw new Error('The installed provider ID does not match.')
    await rename(destination, backup)
    try {
      await rename(staging, destination)
      const loaded = await loadPluginSnapshot(destination)
      const source = url.replace(/\.git$/, '')
      const reinstalled = { ...loaded, info: { ...loaded.info, source }, provider: { ...loaded.provider, source } }
      await rm(backup, { recursive: true, force: true })
      active.set(reinstalled.provider.family, reinstalled.provider)
      loadFailures = loadFailures.filter((one) => one.id !== id)
      return reinstalled
    } catch (error) {
      await rm(destination, { recursive: true, force: true }).catch(() => undefined)
      await rename(backup, destination)
      throw error
    }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

export async function uninstallPlugin(id: string): Promise<LlmProviderInfo> {
  if (!pluginId(id)) throw new Error('Invalid provider ID.')
  const destination = await libraryPath(id)
  const name = destination.slice(folder().length + 1)
  const manifest = await manifestAt(destination)
  if (independentProviderInfo(manifest.provider).id !== id && manifest.provider.id !== id) throw new Error('Installed provider ID does not match.')
  removedUntilRestart.add(destination)
  try { await shell.trashItem(destination) }
  catch (error) { removedUntilRestart.delete(destination); throw error }
  await rm(join(folder(), `.ready-${name}`), { recursive: true, force: true }).catch(() => undefined)
  if (name !== id.replaceAll(':', '-')) await rm(join(folder(), `.ready-${id.replaceAll(':', '-')}`), { recursive: true, force: true }).catch(() => undefined)
  const entries = await readdir(folder(), { withFileTypes: true }).catch(() => [])
  for (const entry of entries.filter((one) => one.isDirectory() && one.name.startsWith('.backup-'))) {
    const backup = join(folder(), entry.name)
    const stored = await manifestAt(backup).catch(() => undefined)
    if (stored !== undefined && independentProviderInfo(stored.provider).id === id) await rm(backup, { recursive: true, force: true }).catch(() => undefined)
  }
  const info = independentProviderInfo(manifest.provider)
  loadFailures = loadFailures.filter((one) => one.id !== info.id)
  return info
}

export async function updateInstalledPlugins(): Promise<PluginUpdateResult> {
  const entries = await readdir(folder(), { withFileTypes: true }).catch(() => [])
  const libraries = entries.filter((one) => one.isDirectory() && !one.name.startsWith('.'))
  const checked = await Promise.allSettled(libraries.map(async (one) => {
    const destination = join(folder(), one.name)
    if (removedUntilRestart.has(destination)) return undefined
    const current = await manifestAt(destination)
    const source = await sourceAt(destination)
    const staging = join(folder(), `.update-${randomUUID()}`)
    try {
      await git(['clone', '--depth', '1', `${source}.git`, staging])
      const [before, after] = await Promise.all([
        git(['-C', destination, 'rev-parse', 'HEAD']),
        git(['-C', staging, 'rev-parse', 'HEAD']),
      ])
      if (before === after) return undefined
      const next = await loadPlugin(staging)
      try {
        if (removedUntilRestart.has(destination)) return undefined
        if (!sameProvider(current.provider, next.info)) throw new Error('Updated plugin changed its provider identity.')
      } finally { await next.provider.dispose() }
      const ready = join(folder(), `.ready-${current.provider.id.replaceAll(':', '-')}`)
      await rm(ready, { recursive: true, force: true })
      await rename(staging, ready)
      if (removedUntilRestart.has(destination)) {
        await rm(ready, { recursive: true, force: true })
        return undefined
      }
      return independentProviderInfo(current.provider).id
    } finally { await rm(staging, { recursive: true, force: true }) }
  }))
  return {
    ready: checked.flatMap((one) => one.status === 'fulfilled' && one.value !== undefined ? [one.value] : []),
    failed: checked.flatMap((one, at) => one.status === 'rejected' ? [libraries[at]?.name ?? 'library'] : []),
  }
}
