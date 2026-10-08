import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { app, shell } from 'electron'

import type { LlmProviderInfo, PluginUpdateResult } from '../../shared/providers'
import type { SessionProvider } from '../../shared/api'
import { claudeCommand, OFF_PLAN, planOnly } from './account'
import { claudeState, readClaude } from './claude-read'
import { sourceArgs } from './claude'
import { claudeFile } from './disk'
import { askId } from './heard'
import type { LlmProvider } from './provider'
import { questionsFromClaude, wantedFromClaude } from './wording'

export interface PluginHost {
  readonly claude: LlmProvider
  readonly codex: LlmProvider
  readonly claudeCommand: typeof claudeCommand
  readonly offPlan: typeof OFF_PLAN
  readonly planOnly: typeof planOnly
  readonly claudeState: typeof claudeState
  readonly readClaude: typeof readClaude
  readonly claudeFile: typeof claudeFile
  readonly sourceArgs: typeof sourceArgs
  readonly askId: typeof askId
  readonly questionsFromClaude: typeof questionsFromClaude
  readonly wantedFromClaude: typeof wantedFromClaude
}

export const pluginHost = (claude: LlmProvider, codex: LlmProvider): PluginHost => ({
  claude, codex, claudeCommand, offPlan: OFF_PLAN, planOnly, claudeState, readClaude, claudeFile, sourceArgs, askId, questionsFromClaude, wantedFromClaude,
})

interface PluginManifest {
  readonly apiVersion: 1
  readonly entry: string
  readonly provider: LlmProviderInfo
}

interface PluginModule {
  readonly create: (host: PluginHost) => LlmProvider | Promise<LlmProvider>
}

const sameProvider = (current: LlmProviderInfo, next: LlmProviderInfo): boolean =>
  current.id === next.id && (
    (current.family === next.family && current.replaces === next.replaces) ||
    (current.family === 'codex' && current.replaces === 'codex' && next.family === next.id && next.replaces === undefined)
  )

export interface LoadedPlugin {
  readonly provider: LlmProvider
  readonly info: LlmProviderInfo
  readonly path: string
}

const folder = (): string => join(app.getPath('userData'), 'provider-plugins')
const active = new Map<SessionProvider, LlmProvider>()
const removedUntilRestart = new Set<string>()
export const pluginProvider = (family: SessionProvider): LlmProvider | undefined => active.get(family)
const git = (args: readonly string[], timeout = 120_000): Promise<string> => new Promise((done, fail) => {
  execFile('git', [...args], { timeout, maxBuffer: 1024 * 1024 }, (error, stdout) => error === null ? done(stdout.trim()) : fail(error))
})
const pluginId = (id: string): boolean => id === 'claude-tmux' || /^plugin:[a-z][a-z0-9-]*$/.test(id)
const methods = ['account', 'program', 'models', 'limits', 'list', 'search', 'hidden', 'create', 'fork', 'has', 'read', 'links', 'goal', 'setGoal', 'clearGoal', 'hold', 'rename', 'remote', 'mcp', 'browsers', 'correct', 'setInstructions', 'delete', 'dispose'] as const
const capabilities = ['available', 'localOnly', 'subscriptionOnly', 'images', 'remoteControl', 'nativeGoals', 'waitForExit'] as const

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

export const loadPlugin = async (path: string, host: PluginHost): Promise<LoadedPlugin> => {
  const manifest = await manifestAt(path)
  const entry = await realpath(join(path, manifest.entry))
  if (relative(await realpath(resolve(path)), entry).startsWith('..')) throw new Error('Plugin entry leaves its repository.')

  const module = await import(pathToFileURL(entry).href) as Partial<PluginModule>
  if (typeof module.create !== 'function') throw new Error('Plugin must export create(host).')

  const provider = await module.create(host)
  const compatible = typeof provider === 'object' && provider !== null && typeof provider.setInstructions !== 'function'
    ? { ...provider, setInstructions: manifest.provider.replaces === 'codex' ? host.codex.setInstructions : manifest.provider.family === 'claude' ? host.claude.setInstructions : async () => {} }
    : provider
  if (typeof compatible !== 'object' || compatible === null || methods.some((method) => typeof compatible[method] !== 'function') || capabilities.some((field) => typeof compatible[field] !== 'boolean') || typeof compatible.idleMs !== 'number') throw new Error('Plugin does not implement LlmProvider.')
  if (provider.id !== manifest.provider.id) throw new Error('Plugin ID differs from its manifest.')
  return { path, info: manifest.provider, provider: { ...compatible, ...manifest.provider } }
}

export async function installedPlugins(host: PluginHost): Promise<LoadedPlugin[]> {
  await recoverBackups()
  await applyReadyUpdates(host)
  const entries = await readdir(folder(), { withFileTypes: true }).catch(() => [])
  const loaded = await Promise.all(entries.filter((one) => one.isDirectory() && !one.name.startsWith('.')).map(async (one) => {
    const path = join(folder(), one.name)
    const plugin = await loadPlugin(path, host)
    const source = await sourceAt(path).catch(() => undefined)
    return source === undefined ? plugin : { ...plugin, info: { ...plugin.info, source }, provider: { ...plugin.provider, source } }
  }).map((one) => one.catch(() => undefined)))
  const ready = loaded.filter((one): one is LoadedPlugin => one !== undefined)
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
      const destination = join(folder(), manifest.provider.id.replaceAll(':', '-'))
      if (await stat(destination).then(() => true, () => false)) await rm(backup, { recursive: true, force: true })
      else await rename(backup, destination)
    } catch { /* A broken library must not stop GeckIt from opening. */ }
  }
}

async function applyReadyUpdates(host: PluginHost): Promise<void> {
  const entries = await readdir(folder(), { withFileTypes: true }).catch(() => [])
  for (const one of entries.filter((entry) => entry.isDirectory() && entry.name.startsWith('.ready-'))) {
    try {
      const ready = join(folder(), one.name)
      const manifest = await manifestAt(ready).catch(() => undefined)
      if (manifest === undefined) continue
      const destination = join(folder(), manifest.provider.id.replaceAll(':', '-'))
      const current = await manifestAt(destination).catch(() => undefined)
      if (current === undefined || !sameProvider(current.provider, manifest.provider)) continue
      if (await loadPlugin(ready, host).catch(() => undefined) === undefined) continue
      const backup = join(folder(), `.backup-${randomUUID()}`)
      await rename(destination, backup)
      try { await rename(ready, destination) }
      catch (error) { await rename(backup, destination); throw error }
      await rm(backup, { recursive: true, force: true })
    } catch { /* Keep the current provider if the staged version cannot be applied. */ }
  }
}

export async function installPlugin(given: string, host: PluginHost): Promise<LoadedPlugin> {
  const url = githubUrl(given)
  await mkdir(folder(), { recursive: true })
  const staging = join(folder(), `.install-${randomUUID()}`)
  try {
    await git(['clone', '--depth', '1', url, staging])
    const manifest = await manifestAt(staging)
    if (removedUntilRestart.has(join(folder(), manifest.provider.id.replaceAll(':', '-')))) throw new Error('Restart GeckIt before adding this library again.')
    if (manifest.provider.replaces === 'codex' && active.has('codex')) throw new Error('A Codex replacement plugin is already installed.')
    const destination = join(folder(), manifest.provider.id.replaceAll(':', '-'))
    if (await stat(destination).then(() => true, () => false)) throw new Error(`${manifest.provider.name} is already installed.`)
    await rename(staging, destination)
    try {
      const found = await loadPlugin(destination, host)
      const source = url.replace(/\.git$/, '')
      const loaded = { ...found, info: { ...found.info, source }, provider: { ...found.provider, source } }
      active.set(loaded.provider.family, loaded.provider)
      return loaded
    }
    catch (error) { await rm(destination, { recursive: true, force: true }); throw error }
  } finally { await rm(staging, { recursive: true, force: true }) }
}

export async function uninstallPlugin(id: string): Promise<LlmProviderInfo> {
  if (!pluginId(id)) throw new Error('Invalid provider ID.')
  const name = id.replaceAll(':', '-')
  const destination = join(folder(), name)
  const manifest = await manifestAt(destination)
  if (manifest.provider.id !== id) throw new Error('Installed provider ID does not match.')
  removedUntilRestart.add(destination)
  try { await shell.trashItem(destination) }
  catch (error) { removedUntilRestart.delete(destination); throw error }
  await rm(join(folder(), `.ready-${name}`), { recursive: true, force: true }).catch(() => undefined)
  const entries = await readdir(folder(), { withFileTypes: true }).catch(() => [])
  for (const entry of entries.filter((one) => one.isDirectory() && one.name.startsWith('.backup-'))) {
    const backup = join(folder(), entry.name)
    if ((await manifestAt(backup).catch(() => undefined))?.provider.id === id) await rm(backup, { recursive: true, force: true }).catch(() => undefined)
  }
  return manifest.provider
}

export async function updateInstalledPlugins(host: PluginHost): Promise<PluginUpdateResult> {
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
      const next = await loadPlugin(staging, host)
      if (removedUntilRestart.has(destination)) return undefined
      if (!sameProvider(current.provider, next.info)) throw new Error('Updated plugin changed its provider identity.')
      const ready = join(folder(), `.ready-${current.provider.id.replaceAll(':', '-')}`)
      await rm(ready, { recursive: true, force: true })
      await rename(staging, ready)
      if (removedUntilRestart.has(destination)) {
        await rm(ready, { recursive: true, force: true })
        return undefined
      }
      return current.provider.id
    } finally { await rm(staging, { recursive: true, force: true }) }
  }))
  return {
    ready: checked.flatMap((one) => one.status === 'fulfilled' && one.value !== undefined ? [one.value] : []),
    failed: checked.flatMap((one, at) => one.status === 'rejected' ? [libraries[at]?.name ?? 'library'] : []),
  }
}
