import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, lstat, mkdtemp, realpath, rm, stat } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { promisify } from 'node:util'

import type { Json } from '../shared/elicitation'
import { jsonObject } from '../shared/elicitation'
import type { ManagerSourceConfig, SourceItem, TaskSource } from '../shared/manager-intake'
import { SourcePending } from './manager-intake'

const run = promisify(execFile)
export const voiceMemosDirectory = (directory: string): string => directory.startsWith('~/') ? join(homedir(), directory.slice(2)) : directory
interface FileIdentity { readonly size: number; readonly mtimeMs: number; readonly ino: number }
const identity = async (path: string): Promise<FileIdentity> => { const file = await lstat(path); if (!file.isFile() || file.isSymbolicLink()) throw new Error('Voice Memos requires regular local files.'); return { size: file.size, mtimeMs: file.mtimeMs, ino: file.ino } }
const same = (left: FileIdentity, right: FileIdentity): boolean => left.size === right.size && left.mtimeMs === right.mtimeMs && left.ino === right.ino
const optionalIdentity = async (path: string): Promise<FileIdentity | undefined> => { try { return await identity(path) } catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined; throw error } }
const sameOptional = (left: FileIdentity | undefined, right: FileIdentity | undefined): boolean => left === undefined || right === undefined ? left === right : same(left, right)
const digest = (value: string): string => createHash('sha256').update(value).digest('hex')

export interface VoiceMemosDeps {
  readonly transcribe: (wav: string) => Promise<string>
  readonly platform?: NodeJS.Platform
  readonly now?: () => number
}

export class VoiceMemosSource implements TaskSource {
  readonly id: ManagerSourceConfig['id']
  readonly capabilities = { audio: true, transcript: false }
  readonly #config: ManagerSourceConfig
  readonly #deps: VoiceMemosDeps
  readonly #observed = new Map<SourceItem['revision'], { readonly at: number; readonly identity: FileIdentity }>()
  constructor(config: ManagerSourceConfig, deps: VoiceMemosDeps) { this.id = config.id; this.#config = { ...config, directory: voiceMemosDirectory(config.directory) }; this.#deps = deps }
  async status(): ReturnType<TaskSource['status']> {
    if ((this.#deps.platform ?? process.platform) !== 'darwin') return { state: 'blocked', detail: 'Voice Memos intake is available only on macOS.' }
    try { await identity(join(this.#config.directory, 'CloudRecordings.db')); return { state: 'ready' } } catch { return { state: 'blocked', detail: 'Cannot read the Voice Memos database. Check the configured Recordings directory and macOS privacy access. GeckIt does not change permissions.' } }
  }
  async list(_cursor?: string): ReturnType<TaskSource['list']> {
    const temporary = await mkdtemp(join(tmpdir(), 'geckit-memo-db-'))
    const database = join(this.#config.directory, 'CloudRecordings.db')
    try {
      const before = await identity(database), wal = await optionalIdentity(`${database}-wal`)
      await copyFile(database, join(temporary, 'CloudRecordings.db'))
      if (wal !== undefined) await copyFile(`${database}-wal`, join(temporary, 'CloudRecordings.db-wal'))
      if (!same(before, await identity(database)) || !sameOptional(wal, await optionalIdentity(`${database}-wal`))) throw new SourcePending('Voice Memos is syncing. Waiting for a stable database snapshot.')
      const query = async (sql: string): Promise<Json> => JSON.parse((await run('/usr/bin/sqlite3', ['-readonly', '-json', join(temporary, 'CloudRecordings.db'), sql], { timeout: 15_000, maxBuffer: 8 * 1024 * 1024 })).stdout || '[]') as Json
      const columns = await query('PRAGMA table_info(ZCLOUDRECORDING);')
      const names = Array.isArray(columns) ? columns.flatMap((column) => { const value = jsonObject(column)?.['name']; return typeof value === 'string' ? [value] : [] }) : []
      if (!['ZUNIQUEID', 'ZPATH', 'ZDATE', 'ZCUSTOMLABEL', 'ZDURATION'].every((name) => names.includes(name))) throw new Error('This Voice Memos database format is unsupported. No recordings were processed.')
      const rows = await query('SELECT ZUNIQUEID, ZPATH, ZDATE, ZCUSTOMLABEL, ZDURATION FROM ZCLOUDRECORDING;')
      if (!Array.isArray(rows)) throw new Error('Voice Memos returned unsupported metadata.')
      const items: SourceItem[] = []
      for (const row of rows) {
        const value = jsonObject(row)
        if (value === undefined || typeof value['ZUNIQUEID'] !== 'string' || typeof value['ZPATH'] !== 'string' || typeof value['ZDATE'] !== 'number' || typeof value['ZDURATION'] !== 'number' || value['ZDURATION'] <= 0) continue
        const location = await this.#location(value['ZPATH'])
        const file = await optionalIdentity(location)
        if (file === undefined) continue
        const title = typeof value['ZCUSTOMLABEL'] === 'string' && value['ZCUSTOMLABEL'].trim() !== '' ? value['ZCUSTOMLABEL'].slice(0, 300) : 'Voice memo'
        const revision = digest(JSON.stringify([value['ZUNIQUEID'], value['ZDATE'], value['ZDURATION'], title, file]))
        if (!this.#observed.has(revision)) this.#observed.set(revision, { at: this.#deps.now?.() ?? Date.now(), identity: file })
        items.push({ id: value['ZUNIQUEID'], title, revision, location, createdAt: (value['ZDATE'] + 978307200) * 1000 })
      }
      const revisions = new Set(items.map((item) => item.revision))
      for (const revision of this.#observed.keys()) if (!revisions.has(revision)) this.#observed.delete(revision)
      return { items, cursor: digest(JSON.stringify(items.map((item) => [item.id, item.revision]))) }
    } finally { await rm(temporary, { recursive: true, force: true }) }
  }
  async #location(path: string): Promise<string> {
    const root = await realpath(this.#config.directory)
    const location = isAbsolute(path) ? path : resolve(root, path)
    const within = relative(root, location)
    if (within.startsWith('..') || isAbsolute(within) || !['.m4a', '.wav', '.caf'].some((extension) => basename(location).toLowerCase().endsWith(extension))) throw new Error('Voice Memos metadata refers outside its configured recording directory.')
    const actual = await realpath(location).catch(() => location)
    if (actual !== location) throw new Error('Voice Memos symbolic recording paths are unsupported.')
    return location
  }
  async read(item: SourceItem): ReturnType<TaskSource['read']> {
    const location = await this.#location(item.location)
    const observed = this.#observed.get(item.revision)
    const file = await identity(location)
    if (observed === undefined || !same(file, observed.identity) || (this.#deps.now?.() ?? Date.now()) - observed.at < 30_000 || file.size < 1 || file.size > 500 * 1024 * 1024) throw new SourcePending('Waiting for recording to finish syncing.')
    const directory = await mkdtemp(join(tmpdir(), 'geckit-memo-audio-'))
    try {
      const input = join(directory, `source-${basename(location)}`), output = join(directory, 'normalized.wav')
      await copyFile(location, input)
      if (!same(file, await identity(location)) || (await stat(input)).size !== file.size) throw new SourcePending('Recording changed while syncing. Waiting for a stable copy.')
      await run('/usr/bin/afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', input, output], { timeout: 120_000, maxBuffer: 1024 * 1024 })
      const transcript = await this.#deps.transcribe(output)
      if (!same(file, await identity(location))) throw new SourcePending('Recording changed during transcription. Review waits for the latest revision.')
      return { transcript }
    } finally { await rm(directory, { recursive: true, force: true }) }
  }
}
