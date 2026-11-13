import { createReadStream, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync } from 'node:fs'
import { open, type FileHandle } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, posix, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip, createGzip } from 'node:zlib'
import { acquireTestLock, browserStateFolder, forgetTestAccount, saveTestAccount, testAccount, type TestAccount } from './browser-lifecycle'
import { profiles } from './browser'
import { profilesFolder, testingCamoufox, testName, validTestName } from './testing'

const MAX_ENTRIES = 100_000
const MAX_BYTES = 10 * 1024 ** 3
const CHUNK_BYTES = 64 * 1024
const MAX_RECORD_BYTES = 128 * 1024
const CACHES = new Set(['Cache', 'Code Cache', 'GPUCache', 'DawnCache', 'GrShaderCache', 'ShaderCache', 'cache2', 'startupCache', 'shader-cache', 'BrowserMetrics', 'Crashpad', 'component_crx_cache'])
const SINGLETONS = new Set(['SingletonLock', 'SingletonSocket', 'SingletonCookie', 'DevToolsActivePort', 'parent.lock', '.parentlock', 'lock'])

type ProfileMetadata = Pick<TestAccount, 'name'> & Partial<Pick<TestAccount, 'note'>>
interface ArchiveHeader { readonly type: 'profile'; readonly format: 'geckit-browser-profile'; readonly version: 2; readonly profile: ProfileMetadata; readonly source: { readonly platform: string; readonly browser: 'camoufox'; readonly browserVersion?: string }; readonly createdAt: number }
interface DirectoryRecord { readonly type: 'directory'; readonly path: string }
type FileRecord = Omit<DirectoryRecord, 'type'> & { readonly type: 'file'; readonly size: number }
interface ChunkRecord { readonly type: 'chunk'; readonly data: string }
interface EndRecord { readonly type: 'end'; readonly entries: number; readonly bytes: number }
type ArchiveRecord = ArchiveHeader | DirectoryRecord | FileRecord | ChunkRecord | EndRecord
interface ArchiveOptions { readonly root?: string; readonly folder?: string }

const invalid = (): Error => new Error('This is not a valid, complete GeckIt browser profile archive.')
const present = (path: string): boolean => { try { lstatSync(path); return true } catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false; throw error } }
const named = (name: string): void => { if (!validTestName(name)) throw new Error('Name the profile with lowercase letters, digits and hyphens, such as github-work.') }
const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true } catch { return false } }
const busy = (name: string): Error => new Error(`Close geckit:${name} before exporting it. Its browser data is still in use.`)

function checkIdle(name: string, folder: string, directory: string): void {
  if (profiles(folder).some((one) => one.label === `geckit:${name}` && alive(one.pid))) throw busy(name)
  if ([...SINGLETONS].some((one) => one !== '.parentlock' && one !== 'parent.lock' && present(join(directory, one)))) throw busy(name)
  if (!existsSync(folder)) return
  for (const file of readdirSync(folder).filter((one) => one.endsWith('.launch'))) {
    let value: unknown
    try { value = JSON.parse(readFileSync(join(folder, file), 'utf8')) } catch { continue }
    if (typeof value === 'object' && value !== null && 'name' in value && value.name === name) throw busy(name)
  }
}

function safePath(path: string): string {
  if (path.length === 0 || path.length > 4096 || /[\\:<>"|?*]/.test(path) || [...path].some((character) => character.charCodeAt(0) < 32) || posix.isAbsolute(path) || path.split('/').some((part) => part === '' || part === '.' || part === '..' || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) throw new Error('The archive contains an unsafe profile path.')
  return path
}

function parseRecord(line: string): ArchiveRecord {
  const value: unknown = JSON.parse(line)
  if (typeof value !== 'object' || value === null || !('type' in value)) throw invalid()
  if (value.type === 'profile' && 'version' in value && value.version === 1) throw new Error('This archive contains a Chrome profile. Camoufox requires a Firefox profile; create a new profile and sign in again.')
  if (value.type === 'profile' && 'format' in value && value.format === 'geckit-browser-profile' && 'version' in value && value.version === 2 && 'profile' in value && typeof value.profile === 'object' && value.profile !== null && 'name' in value.profile && typeof value.profile.name === 'string' && validTestName(value.profile.name) && 'source' in value && typeof value.source === 'object' && value.source !== null && 'browser' in value.source && value.source.browser === 'camoufox' && 'platform' in value.source && typeof value.source.platform === 'string' && value.source.platform.length <= 40 && 'createdAt' in value && typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)) {
    const note = 'note' in value.profile ? value.profile.note : undefined
    const browserVersion = 'browserVersion' in value.source ? value.source.browserVersion : undefined
    if (note !== undefined && (typeof note !== 'string' || note.length === 0 || note.length > 120 || note.trim().replace(/\s+/g, ' ') !== note)) throw invalid()
    if (browserVersion !== undefined && (typeof browserVersion !== 'string' || browserVersion.length > 100)) throw invalid()
    return { type: 'profile', format: value.format, version: value.version, profile: { name: value.profile.name, ...(typeof note === 'string' ? { note } : {}) }, source: { browser: 'camoufox', platform: value.source.platform, ...(typeof browserVersion === 'string' ? { browserVersion } : {}) }, createdAt: value.createdAt }
  }
  if ((value.type === 'directory' || value.type === 'file') && 'path' in value && typeof value.path === 'string') {
    const path = safePath(value.path)
    if (value.type === 'directory') return { type: 'directory', path }
    if ('size' in value && typeof value.size === 'number' && Number.isSafeInteger(value.size) && value.size >= 0 && value.size <= MAX_BYTES) return { type: 'file', path, size: value.size }
  }
  if (value.type === 'chunk' && 'data' in value && typeof value.data === 'string' && value.data.length > 0 && value.data.length <= Math.ceil(CHUNK_BYTES / 3) * 4) return { type: 'chunk', data: value.data }
  if (value.type === 'end' && 'entries' in value && typeof value.entries === 'number' && Number.isSafeInteger(value.entries) && value.entries >= 0 && 'bytes' in value && typeof value.bytes === 'number' && Number.isSafeInteger(value.bytes) && value.bytes >= 0) return { type: 'end', entries: value.entries, bytes: value.bytes }
  throw invalid()
}

export async function exportTestProfile(name: string, output: string, options: ArchiveOptions = {}): Promise<string> {
  named(name)
  const root = options.root ?? homedir()
  const folder = options.folder ?? join(root, '.geckit', 'browser')
  const directory = join(profilesFolder(root), name)
  const unlock = acquireTestLock(name, folder)
  if (unlock === undefined) throw busy(name)
  let created = false
  const target = resolve(output)
  try {
    if (!present(directory)) throw new Error(`There is no geckit:${name}.`)
    if (!lstatSync(directory).isDirectory()) throw new Error('The profile directory must not be a symbolic link.')
    checkIdle(name, folder, directory)
    const source = realpathSync(directory)
    const parent = realpathSync(dirname(target))
    if (parent === source || parent.startsWith(`${source}${sep}`)) throw new Error('Choose an output path outside the profile being exported.')
    if (present(target)) throw new Error('The output file already exists. Choose another --output path.')
    const account = testAccount(name, folder)
    const camoufox = testingCamoufox(root)
    const header: ArchiveHeader = { type: 'profile', format: 'geckit-browser-profile', version: 2, profile: { name, ...(account === undefined ? {} : { note: account.note }) }, source: { browser: 'camoufox', platform: process.platform, ...(camoufox === undefined ? {} : { browserVersion: camoufox.version }) }, createdAt: Date.now() }
    let entries = 0
    let bytes = 0
    const seen = new Set<string>()
    async function* walk(path: string): AsyncGenerator<ArchiveRecord> {
      for (const entry of readdirSync(join(directory, path), { withFileTypes: true })) {
        if (SINGLETONS.has(entry.name) || (entry.isDirectory() && CACHES.has(entry.name))) continue
        const relative = safePath(path === '' ? entry.name : `${path}/${entry.name}`)
        const key = relative.normalize('NFC').toLowerCase()
        if (seen.has(key)) throw new Error('The profile contains conflicting file paths.')
        seen.add(key)
        if (++entries > MAX_ENTRIES) throw new Error('The profile has more than 100000 archive entries.')
        const file = join(directory, relative)
        const stat = lstatSync(file)
        if (stat.isDirectory()) { yield { type: 'directory', path: relative }; yield* walk(relative); continue }
        if (!stat.isFile()) throw new Error(`Cannot export ${relative}: only regular files and directories are supported.`)
        bytes += stat.size
        if (bytes > MAX_BYTES) throw new Error('The profile exceeds the 10 GiB archive limit.')
        yield { type: 'file', path: relative, size: stat.size }
        const input = await open(file, 'r')
        try {
          const buffer = Buffer.alloc(CHUNK_BYTES)
          let received = 0
          for (;;) {
            const chunk = await input.read(buffer, 0, buffer.length, null)
            if (chunk.bytesRead === 0) break
            received += chunk.bytesRead
            if (received > stat.size) throw new Error('The profile changed during export. Close its browser and retry.')
            yield { type: 'chunk', data: buffer.subarray(0, chunk.bytesRead).toString('base64') }
          }
          if (received !== stat.size) throw new Error('The profile changed during export. Close its browser and retry.')
        } finally { await input.close() }
      }
    }
    async function* records(): AsyncGenerator<string> {
      yield `${JSON.stringify(header)}\n`
      for await (const record of walk('')) yield `${JSON.stringify(record)}\n`
      yield `${JSON.stringify({ type: 'end', entries, bytes } satisfies EndRecord)}\n`
    }
    const file = await open(target, 'wx', 0o600)
    created = true
    await pipeline(Readable.from(records()), createGzip(), file.createWriteStream())
    return target
  } catch (error) {
    if (created) rmSync(target, { force: true })
    throw error
  } finally { unlock() }
}

export async function importTestProfile(input: string, name: string, options: ArchiveOptions = {}): Promise<void> {
  named(name)
  const root = options.root ?? homedir()
  const folder = options.folder ?? join(root, '.geckit', 'browser')
  const destination = join(profilesFolder(root), name)
  const unlock = acquireTestLock(name, folder)
  if (unlock === undefined) throw new Error(`geckit:${name} is in use. Import with a different --name.`)
  let staging: string | undefined
  let published = false
  let output: FileHandle | undefined
  try {
    const account = join(browserStateFolder(folder), 'accounts', `${name}.json`)
    if (present(destination) || present(account)) throw new Error(`geckit:${name} already exists. Import with a different --name.`)
    checkIdle(name, folder, destination)
    mkdirSync(profilesFolder(root), { recursive: true, mode: 0o700 })
    staging = mkdtempSync(join(profilesFolder(root), '.import-'))
    const stage = staging
    let header: ArchiveHeader | undefined
    let ended = false
    let remaining = 0
    let entries = 0
    let bytes = 0
    const paths = new Set<string>()
    const directories = new Set<string>(['.'])
    const accept = async (record: ArchiveRecord): Promise<void> => {
      if (ended) throw invalid()
      if (header === undefined) { if (record.type !== 'profile') throw invalid(); header = record; return }
      if (record.type === 'profile') throw invalid()
      if (record.type === 'chunk') {
        if (output === undefined) throw invalid()
        const chunk = Buffer.from(record.data, 'base64')
        if (chunk.length === 0 || chunk.length > CHUNK_BYTES || chunk.length > remaining || chunk.toString('base64') !== record.data) throw invalid()
        await output.writeFile(chunk)
        remaining -= chunk.length
        if (remaining === 0) { await output.close(); output = undefined }
        return
      }
      if (remaining !== 0) throw invalid()
      if (record.type === 'end') { if (record.entries !== entries || record.bytes !== bytes) throw invalid(); ended = true; return }
      const key = record.path.normalize('NFC').toLowerCase()
      if (paths.has(key) || !directories.has(posix.dirname(record.path))) throw new Error('The archive contains duplicate or conflicting profile paths.')
      paths.add(key)
      if (++entries > MAX_ENTRIES) throw new Error('The archive has more than 100000 entries.')
      const target = join(stage, record.path)
      if (record.type === 'directory') { mkdirSync(target, { mode: 0o700 }); directories.add(record.path); return }
      bytes += record.size
      if (bytes > MAX_BYTES) throw new Error('The archive exceeds the 10 GiB restore limit.')
      output = await open(target, 'wx', 0o600)
      remaining = record.size
      if (remaining === 0) { await output.close(); output = undefined }
    }
    let refused: unknown
    await pipeline(createReadStream(resolve(input)), createGunzip(), async (source: AsyncIterable<Buffer>) => {
      try {
        let held = Buffer.alloc(0)
        for await (const chunk of source) {
          held = Buffer.concat([held, chunk])
          let end = held.indexOf(10)
          while (end >= 0) {
            if (end > MAX_RECORD_BYTES) throw invalid()
            await accept(parseRecord(held.subarray(0, end).toString('utf8')))
            held = held.subarray(end + 1)
            end = held.indexOf(10)
          }
          if (held.length > MAX_RECORD_BYTES) throw invalid()
        }
        if (held.length !== 0 || !ended || header === undefined || output !== undefined) throw invalid()
      } catch (error) { refused = error; throw error }
    }).catch((error: unknown) => { throw refused ?? error })
    if (header === undefined) throw invalid()
    if (present(destination) || present(account)) throw new Error(`geckit:${name} already exists. Import with a different --name.`)
    renameSync(stage, destination)
    published = true
    if (header.profile.note !== undefined) saveTestAccount(name, header.profile.note, folder)
  } catch (error) {
    if (output !== undefined) await output.close()
    if (published) { rmSync(destination, { recursive: true, force: true }); forgetTestAccount(name, folder) }
    throw error
  } finally {
    if (staging !== undefined) rmSync(staging, { recursive: true, force: true })
    unlock()
  }
}

export async function profileArchiveCommand(rest: readonly string[], options: ArchiveOptions = {}): Promise<{ readonly ok: boolean; readonly said: string }> {
  const [command, value] = rest
  try {
    if (command === 'export') {
      const output = rest[3]
      if (rest.length !== 4 || rest[2] !== '--output' || value === undefined || value.startsWith('--') || output === undefined || output.startsWith('--')) throw new Error('Use geckit browser profiles export <name> --output <file>.')
      const name = testName(value) ?? value
      const path = await exportTestProfile(name, output, options)
      return { ok: true, said: `Exported geckit:${name} to ${path}. Sign-ins and saved passwords may need to be set up again on another computer. This archive can contain sensitive website data.` }
    }
    const name = rest[3]
    if (command !== 'import' || rest.length !== 4 || rest[2] !== '--name' || value === undefined || value.startsWith('--') || name === undefined || name.startsWith('--')) throw new Error('Use geckit browser profiles import <file> --name <new-name>.')
    const target = testName(name) ?? name
    await importTestProfile(value, target, options)
    return { ok: true, said: `Imported geckit:${target}. Open it with geckit browser start geckit:${target} and check your accounts. Sign-ins and saved passwords may need to be set up again on this computer.` }
  } catch (error) { return { ok: false, said: error instanceof Error ? error.message : String(error) } }
}
