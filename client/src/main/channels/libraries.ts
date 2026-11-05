import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cp, mkdir, readdir, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { corePlatform, dataDirectory } from '../../core/platform'
import type { ChannelField, ChannelId, ChannelInfo } from '../../shared/channels'
import { channelId } from '../../shared/channels'
import type { ChannelModule } from './channel-api'

export interface LoadedChannel {
  readonly info: ChannelInfo
  readonly path: string
  readonly module: ChannelModule
}

const folder = (): string => join(dataDirectory(), 'channel-libraries')
const exists = (path: string): Promise<boolean> => stat(path).then(() => true, () => false)
const git = (args: readonly string[], timeout = 120_000): Promise<string> => new Promise((done, fail) => {
  execFile('git', [...args], { timeout, maxBuffer: 1024 * 1024 }, (error, stdout) => error === null ? done(stdout.trim()) : fail(error))
})
const libraryPath = (id: ChannelId): string => join(folder(), id.replaceAll(':', '-'))

export const githubUrl = (given: string): string => {
  const url = new URL(given)
  const parts = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean)
  if (url.protocol !== 'https:' || url.hostname !== 'github.com' || parts.length !== 2 || parts.some((part) => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(part))) throw new Error('Enter a public GitHub repository URL.')
  return `https://github.com/${parts[0]}/${parts[1]}.git`
}

const sourceAt = async (path: string): Promise<string | undefined> => {
  const url = await git(['-C', path, 'config', '--get', 'remote.origin.url']).catch(() => undefined)
  if (url === undefined) return undefined
  try { return githubUrl(url).replace(/\.git$/, '') } catch { return undefined }
}

const field = (value: object): ChannelField => {
  if (!('key' in value) || typeof value.key !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(value.key)) throw new Error('Invalid channel field key.')
  if (!('label' in value) || typeof value.label !== 'string' || value.label.trim() === '') throw new Error(`Channel field ${value.key} has no label.`)
  if (!('type' in value) || !['text', 'secret', 'list', 'boolean'].includes(String(value.type))) throw new Error(`Channel field ${value.key} has an unknown type.`)
  if ('required' in value && typeof value.required !== 'boolean') throw new Error(`Channel field ${value.key} has an invalid required flag.`)
  if ('help' in value && typeof value.help !== 'string') throw new Error(`Channel field ${value.key} has invalid help.`)
  if ('default' in value) {
    const fallback = value.default
    const ok = value.type === 'boolean' ? typeof fallback === 'boolean' : value.type === 'list' ? Array.isArray(fallback) && fallback.every((one) => typeof one === 'string') : value.type === 'text' && typeof fallback === 'string'
    if (!ok) throw new Error(`Channel field ${value.key} has an invalid default.`)
  }
  return value as ChannelField
}

export async function channelManifest(path: string): Promise<ChannelInfo & { readonly entry: string }> {
  const parsed = JSON.parse(await readFile(join(path, 'geckit-plugin.json'), 'utf8')) as object | null
  if (parsed === null || typeof parsed !== 'object' || !('apiVersion' in parsed) || parsed.apiVersion !== 1 || !('kind' in parsed) || parsed.kind !== 'channel') throw new Error('This repository is not a GeckIt channel library.')
  if (!('entry' in parsed) || parsed.entry !== 'index.mjs') throw new Error('Channel entry must be index.mjs.')
  if (!('channel' in parsed) || typeof parsed.channel !== 'object' || parsed.channel === null) throw new Error('Invalid channel metadata.')
  const channel = parsed.channel
  if (!('id' in channel) || typeof channel.id !== 'string' || !channelId(channel.id)) throw new Error('Channel ID must look like channel:<lowercase-slug>.')
  if (!('name' in channel) || typeof channel.name !== 'string' || channel.name.trim() === '') throw new Error('Channel has no name.')
  if (!('icon' in channel) || typeof channel.icon !== 'string') throw new Error('Channel has no icon.')
  if ('description' in channel && typeof channel.description !== 'string') throw new Error('Invalid channel description.')
  const fields = 'config' in parsed ? parsed.config : []
  if (!Array.isArray(fields) || fields.some((one) => one === null || typeof one !== 'object')) throw new Error('Channel config must be a list of fields.')
  const read = (fields as object[]).map(field)
  if (new Set(read.map((one) => one.key)).size !== read.length) throw new Error('Channel config repeats a field.')
  return { id: channel.id, name: channel.name, icon: channel.icon, ...('description' in channel ? { description: channel.description as string } : {}), fields: read, entry: parsed.entry }
}

export async function loadChannel(path: string): Promise<LoadedChannel> {
  const { entry, ...info } = await channelManifest(path)
  const snapshot = join(folder(), `.active-${randomUUID()}`)
  await mkdir(folder(), { recursive: true })
  await cp(path, snapshot, { recursive: true })
  try {
    const file = await realpath(join(snapshot, entry))
    if (relative(await realpath(resolve(snapshot)), file).startsWith('..')) throw new Error('Channel entry leaves its repository.')
    const url = pathToFileURL(file)
    url.searchParams.set('geckit', randomUUID())
    const module = await import(url.href) as Partial<ChannelModule>
    if (typeof module.create !== 'function') throw new Error('Channel library must export create().')
    const source = await sourceAt(path)
    return { info: source === undefined ? info : { ...info, source }, path, module: module as ChannelModule }
  } catch (error) {
    await rm(snapshot, { recursive: true, force: true })
    throw error
  }
}

export async function installedChannels(): Promise<{ readonly loaded: readonly LoadedChannel[]; readonly failures: readonly { readonly id?: ChannelId; readonly name: string; readonly source?: string; readonly error: string }[] }> {
  const entries = await readdir(folder(), { withFileTypes: true }).catch(() => [])
  await Promise.all(entries.filter((one) => one.isDirectory() && one.name.startsWith('.')).map((one) => rm(join(folder(), one.name), { recursive: true, force: true }).catch(() => undefined)))
  const attempts = await Promise.all(entries.filter((one) => one.isDirectory() && !one.name.startsWith('.')).map(async (one) => {
    const path = join(folder(), one.name)
    try { return { loaded: await loadChannel(path) } }
    catch (error) {
      const manifest = await channelManifest(path).catch(() => undefined)
      const source = await sourceAt(path)
      return { failure: { ...(manifest === undefined ? {} : { id: manifest.id }), name: manifest?.name ?? one.name, ...(source === undefined ? {} : { source }), error: error instanceof Error ? error.message : String(error) } }
    }
  }))
  return { loaded: attempts.flatMap((one) => 'loaded' in one ? [one.loaded] : []), failures: attempts.flatMap((one) => 'failure' in one ? [one.failure] : []) }
}

export async function installChannel(given: string, installed: (id: ChannelId) => boolean): Promise<LoadedChannel> {
  const url = githubUrl(given)
  await mkdir(folder(), { recursive: true })
  const staging = join(folder(), `.install-${randomUUID()}`)
  try {
    await git(['clone', '--depth', '1', url, staging])
    const manifest = await channelManifest(staging)
    const destination = libraryPath(manifest.id)
    if (installed(manifest.id) || await exists(destination)) throw new Error(`${manifest.name} is already installed.`)
    await rename(staging, destination)
    try { return await loadChannel(destination) }
    catch (error) { await rm(destination, { recursive: true, force: true }); throw error }
  } finally { await rm(staging, { recursive: true, force: true }) }
}

export async function removeChannelLibrary(id: ChannelId): Promise<void> {
  const destination = libraryPath(id)
  if (!await exists(destination)) return
  const trash = corePlatform().trash
  if (trash === undefined) await rm(destination, { recursive: true, force: true })
  else await trash(destination)
}

/** Fetches a newer commit of the library, checks it loads and swaps it in. Undefined when it is current. */
export async function updateChannel(id: ChannelId, swap: (next: LoadedChannel) => Promise<void>): Promise<LoadedChannel | undefined> {
  const destination = libraryPath(id)
  const source = await sourceAt(destination)
  if (source === undefined) return undefined
  const staging = join(folder(), `.update-${randomUUID()}`)
  try {
    await git(['clone', '--depth', '1', `${source}.git`, staging])
    const [before, after] = await Promise.all([git(['-C', destination, 'rev-parse', 'HEAD']), git(['-C', staging, 'rev-parse', 'HEAD'])])
    if (before === after) return undefined
    const manifest = await channelManifest(staging)
    if (manifest.id !== id) throw new Error('The repository now contains a different channel.')
    const backup = join(folder(), `.backup-${randomUUID()}`)
    await rename(destination, backup)
    try {
      await rename(staging, destination)
      const next = await loadChannel(destination)
      await swap(next)
      await rm(backup, { recursive: true, force: true })
      return next
    } catch (error) {
      await rm(destination, { recursive: true, force: true }).catch(() => undefined)
      await rename(backup, destination)
      throw error
    }
  } finally { await rm(staging, { recursive: true, force: true }) }
}
