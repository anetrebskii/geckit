import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

import type { Settings } from '../shared/api'
import type { Move, NotesStore, SessionNote } from './sessions'

export interface SessionImport {
  readonly source: string
  readonly target: string
}

export interface MigrationReport {
  readonly imports: number
  readonly migrated: number
  readonly unchanged: number
  readonly missing: number
  readonly favorites: number
  readonly order: number
  readonly dryRun: boolean
  readonly backup?: string
}

export interface MigrationAsked {
  readonly action: 'migrate-codex'
  readonly imports: string
  readonly dryRun: boolean
}

export type MigrationAnswered = { readonly ok: true; readonly report: MigrationReport } | { readonly ok: false; readonly error: string }

export interface MigrationStore {
  readonly notes: NotesStore
  readonly settings: Partial<Settings>
  readonly saveSettings: (change: Partial<Settings>) => void
}

export const sessionImportsPath = (): string => join(process.env['CODEX_HOME'] ?? join(homedir(), '.codex'), 'external_agent_session_imports.json')

export function sessionImports(text: string): SessionImport[] {
  const value: unknown = JSON.parse(text)
  if (value === null || typeof value !== 'object' || !('records' in value) || !Array.isArray(value.records)) throw new Error('The Codex import manifest must contain a records array.')
  const records: readonly unknown[] = value.records
  const imports = new Map<string, SessionImport>()
  for (const record of records) {
    if (record === null || typeof record !== 'object' || !('source_path' in record) || typeof record.source_path !== 'string' || !('imported_thread_id' in record) || typeof record.imported_thread_id !== 'string') throw new Error('A Codex import record has no source path or thread ID.')
    const path = record.source_path.replace(/\\/g, '/')
    if (!path.endsWith('.jsonl')) continue
    const source = basename(path, '.jsonl')
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(source)) continue
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(record.imported_thread_id)) throw new Error('A Codex import record has an invalid thread ID.')
    imports.set(source, { source, target: `codex:${record.imported_thread_id}` })
  }
  return [...imports.values()]
}

export function importedNote(source: SessionNote, target: SessionNote | undefined, sourceId: string, ids: ReadonlyMap<string, string>): SessionNote {
  const { model: _model, reasoning: _reasoning, cut: _cut, queued: _queued, unborn: _unborn, ...durable } = source
  const complete = target?.importedFrom === sourceId && target.importedMetadata === 1
  let note: SessionNote = complete ? target : { ...durable, ...target, importedFrom: sourceId, importedMetadata: 1 }
  if (!complete && target?.importedFrom === sourceId) {
    const moves: Move[] = []
    const previous = (target.moves ?? []).filter((move, at) => at !== 0 || move.at !== target.created || target.created === source.created)
    for (const move of [...(source.moves ?? []), ...previous].sort((one, other) => one.at - other.at)) {
      if (moves.at(-1)?.status !== move.status) moves.push(move)
    }
    const { status: _status, created: _created, moves: _moves, ...kept } = note
    note = { ...kept, ...(target.status === undefined ? {} : { status: target.status }), ...(source.created === undefined ? {} : { created: source.created }), ...(moves.length === 0 ? {} : { moves }) }
  }
  const parent = note.parent
  return {
    ...note,
    ...(note.hidden === true ? {} : { shown: note.shown ?? note.here ?? false }),
    ...(parent === undefined ? {} : { parent: ids.get(parent) ?? parent }),
    ...(note.requests === undefined ? {} : { requests: note.requests.map((kept) => kept.item.kind !== 'request' ? kept : { ...kept, item: { ...kept.item, tasks: kept.item.tasks.map((task) => task.started === undefined ? task : { ...task, started: ids.get(task.started) ?? task.started }) } }) }),
  }
}

export function sessionMigration(notes: Readonly<Record<string, SessionNote>>, settings: Partial<Settings>, imports: readonly SessionImport[], dryRun = false): { notes: Readonly<Record<string, SessionNote>>; settings: Partial<Settings>; report: MigrationReport } {
  const ids = new Map(imports.map((one) => [one.source, one.target]))
  const settingsIds = new Map(imports.filter((one) => notes[one.source] !== undefined && notes[one.target]?.importedMetadata !== 1).map((one) => [one.source, one.target]))
  const migrated = { ...notes }
  let changed = 0
  let missing = 0
  for (const { source, target } of imports) {
    const original = notes[source]
    if (original === undefined) {
      missing++
      continue
    }
    const note = importedNote(original, notes[target], source, ids)
    if (JSON.stringify(note) !== JSON.stringify(notes[target])) {
      migrated[target] = note
      changed++
    }
  }
  const favorites = [...new Set((settings.favorites ?? []).map((id) => settingsIds.get(id) ?? id))]
  const progressOrder = [...new Set((settings.progressOrder ?? []).map((id) => settingsIds.get(id) ?? id))]
  const next: Partial<Settings> = {
    ...settings,
    ...(settings.favorites === undefined ? {} : { favorites }),
    ...(settings.progressOrder === undefined ? {} : { progressOrder }),
    ...(settings.shortcuts === undefined ? {} : { shortcuts: settings.shortcuts.map((shortcut) => shortcut.lastSession === undefined ? shortcut : { ...shortcut, lastSession: settingsIds.get(shortcut.lastSession) ?? shortcut.lastSession }) }),
  }
  return { notes: migrated, settings: next, report: { imports: imports.length, migrated: changed, unchanged: imports.length - changed - missing, missing, favorites: (settings.favorites ?? []).filter((id) => settingsIds.has(id)).length, order: (settings.progressOrder ?? []).filter((id) => settingsIds.has(id)).length, dryRun } }
}

export function migrateCodexMetadata(folder: string, importsFile = sessionImportsPath(), dryRun = false, store?: MigrationStore): MigrationReport {
  const imports = sessionImports(readFileSync(importsFile, 'utf8'))
  const notesPath = join(folder, 'sessions.json')
  const settingsPath = join(folder, 'settings.json')
  const notes = store?.notes.all() ?? (existsSync(notesPath) ? JSON.parse(readFileSync(notesPath, 'utf8')) as Readonly<Record<string, SessionNote>> : {})
  const settings = store?.settings ?? (existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, 'utf8')) as Partial<Settings> : {})
  const migration = sessionMigration(notes, settings, imports, dryRun)
  const settingsChanged = JSON.stringify(settings) !== JSON.stringify(migration.settings)
  if (dryRun || (migration.report.migrated === 0 && !settingsChanged)) return migration.report
  const backup = join(folder, 'backups', `codex-metadata-${new Date().toISOString().replace(/[:.]/g, '-')}`)
  mkdirSync(backup, { recursive: true })
  writeFileSync(join(backup, 'sessions.json'), JSON.stringify(notes, null, 2), { mode: 0o600 })
  writeFileSync(join(backup, 'settings.json'), JSON.stringify(settings, null, 2), { mode: 0o600 })
  writeFileSync(join(backup, 'imports.json'), JSON.stringify(imports, null, 2), { mode: 0o600 })
  if (migration.report.migrated > 0) {
    writeFileSync(`${notesPath}.new`, JSON.stringify(migration.notes, null, 2))
    renameSync(`${notesPath}.new`, notesPath)
  }
  if (settingsChanged) {
    writeFileSync(`${settingsPath}.new`, JSON.stringify(migration.settings, null, 2))
    renameSync(`${settingsPath}.new`, settingsPath)
  }
  if (store !== undefined) {
    store.notes.replace(migration.notes)
    if (settingsChanged) store.saveSettings(migration.settings)
  }
  return { ...migration.report, backup }
}
