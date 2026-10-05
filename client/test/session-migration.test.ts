import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { migrateCodexMetadata, sessionImports, sessionMigration } from '../src/main/session-migration'
import type { SessionImport } from '../src/main/session-migration'
import { memoryNotes } from '../src/main/sessions'
import type { SessionNote } from '../src/main/sessions'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { Settings } from '../src/shared/api'

const SOURCE = '11111111-1111-4111-8111-111111111111'
const CHILD = '22222222-2222-4222-8222-222222222222'
const TARGET = 'codex:019f0000-0000-7000-8000-000000000001'
const CHILD_TARGET = 'codex:019f0000-0000-7000-8000-000000000002'
const IMPORTS: SessionImport[] = [{ source: SOURCE, target: TARGET }, { source: CHILD, target: CHILD_TARGET }]
const NOTE: SessionNote = { title: 'Finished work', renamed: true, mode: 'manual', here: true, unread: false, shown: true, hidden: false, status: 'done', created: 100, seen: 300, moves: [{ status: 'progress', at: 100 }, { status: 'review', at: 200 }, { status: 'done', at: 300 }] }
const folders: string[] = []

function fixture(notes: Readonly<Record<string, SessionNote>>, settings: Partial<Settings> = {}): { folder: string; manifest: string } {
  const folder = mkdtempSync(join(tmpdir(), 'geckit-metadata-'))
  folders.push(folder)
  const manifest = join(folder, 'imports.json')
  writeFileSync(join(folder, 'sessions.json'), JSON.stringify(notes))
  writeFileSync(join(folder, 'settings.json'), JSON.stringify(settings))
  writeFileSync(manifest, JSON.stringify({ records: IMPORTS.map((one) => ({ source_path: `/home/alex/.claude/projects/-work-app/${one.source}.jsonl`, imported_thread_id: one.target.slice(6) })) }))
  return { folder, manifest }
}

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('Claude conversation metadata imported into Codex', () => {
  it('uses the import manifest on Unix and Windows and ignores helper transcripts', () => {
    expect(sessionImports(JSON.stringify({ records: [
      { source_path: `/home/.claude/projects/-work/${SOURCE}.jsonl`, imported_thread_id: TARGET.slice(6) },
      { source_path: `C:\\Users\\Alex\\.claude\\projects\\work\\${CHILD}.jsonl`, imported_thread_id: CHILD_TARGET.slice(6) },
      { source_path: '/home/.claude/projects/work/subagents/agent-abcd.jsonl', imported_thread_id: 'helper' },
    ] }))).toEqual(IMPORTS)
  })

  it('preserves the original status and exact creation and move dates without copying Claude runtime state', () => {
    const source: SessionNote = { ...NOTE, model: 'claude-opus-4-6', cut: { root: '/work', at: 400 }, queued: [], unborn: '/work' }
    const result = sessionMigration({ [SOURCE]: source }, {}, IMPORTS)
    expect(result.notes[SOURCE]).toEqual(source)
    expect(result.notes[TARGET]).toEqual({ ...NOTE, importedFrom: SOURCE, importedMetadata: 1 })
    expect(result.report).toMatchObject({ imports: 2, migrated: 1, missing: 1 })
  })

  it('keeps changes already made to the Codex conversation and its chosen model', () => {
    const target: SessionNote = { title: 'Codex title', status: 'review', model: 'gpt-6.1-sol', reasoning: 'high', moves: [{ status: 'review', at: 500 }] }
    const result = sessionMigration({ [SOURCE]: NOTE, [TARGET]: target }, {}, IMPORTS)
    expect(result.notes[TARGET]).toMatchObject({ ...target, created: 100, importedFrom: SOURCE, importedMetadata: 1 })
  })

  it('keeps outside sessions off the board and preserves explicit visibility through repeated migration', () => {
    const first = sessionMigration({ [SOURCE]: { seen: 100 } }, {}, IMPORTS)
    expect(first.notes[TARGET]).toMatchObject({ seen: 100, shown: false })
    const brought = sessionMigration({ ...first.notes, [TARGET]: { ...first.notes[TARGET], shown: true } }, {}, IMPORTS)
    expect(brought.notes[TARGET]?.shown).toBe(true)
    const hidden = sessionMigration({ ...brought.notes, [TARGET]: { ...brought.notes[TARGET], hidden: true, shown: false } }, {}, IMPORTS)
    expect(hidden.notes[TARGET]).toMatchObject({ hidden: true, shown: false })
    expect(sessionMigration(hidden.notes, {}, IMPORTS).report.migrated).toBe(0)
    const unshown = sessionMigration({ ...hidden.notes, [TARGET]: { ...hidden.notes[TARGET], hidden: false } }, {}, IMPORTS)
    expect(unshown.notes[TARGET]).toMatchObject({ hidden: false, shown: false })
    expect(unshown.report.migrated).toBe(0)
  })

  it('repairs the shallow importer history and removes its synthetic move at import time', () => {
    const target: SessionNote = { ...(NOTE.title === undefined ? {} : { title: NOTE.title }), importedFrom: SOURCE, created: 1000, status: 'review', moves: [{ status: 'done', at: 1000 }, { status: 'review', at: 1100 }] }
    const result = sessionMigration({ [SOURCE]: NOTE, [TARGET]: target }, {}, IMPORTS)
    expect(result.notes[TARGET]).toMatchObject({ created: 100, status: 'review', moves: [...(NOTE.moves ?? []), { status: 'review', at: 1100 }] })
  })

  it('does not restore an old Done status when a migrated conversation was moved back to In progress', () => {
    const first = sessionMigration({ [SOURCE]: NOTE }, {}, IMPORTS)
    const target = first.notes[TARGET]
    const { status: _status, title: _title, ...changed } = target ?? {}
    const notes = { ...first.notes, [TARGET]: { ...changed, moves: [...(changed.moves ?? []), { status: 'progress' as const, at: 1000 }] } }
    const second = sessionMigration(notes, first.settings, IMPORTS)
    expect(second.notes[TARGET]).toEqual(notes[TARGET])
    expect(second.report.migrated).toBe(0)
  })

  it('does not use the old importer timestamp as an unknown creation or completion date', () => {
    const source: SessionNote = { title: 'Old work', status: 'done' }
    const target: SessionNote = { ...source, importedFrom: SOURCE, created: 1000, moves: [{ status: 'done', at: 1000 }, { status: 'review', at: 1100 }], status: 'review' }
    const result = sessionMigration({ [SOURCE]: source, [TARGET]: target }, {}, IMPORTS)
    expect(result.notes[TARGET]?.created).toBeUndefined()
    expect(result.notes[TARGET]?.moves).toEqual([{ status: 'review', at: 1100 }])
  })

  it('preserves later favorites and ordering after the app adds original Claude IDs back to its board', () => {
    const first = sessionMigration({ [SOURCE]: NOTE }, { favorites: [SOURCE], progressOrder: [SOURCE] }, IMPORTS)
    const settings: Partial<Settings> = { favorites: [SOURCE], progressOrder: [SOURCE, 'other', TARGET] }
    const second = sessionMigration(first.notes, settings, IMPORTS)
    expect(second.settings).toEqual(settings)
    expect(second.report).toMatchObject({ migrated: 0, favorites: 0, order: 0 })
  })

  it('maps favorites, board order, shortcuts and parent and child conversation links without duplicates', () => {
    const notes: Readonly<Record<string, SessionNote>> = {
      [SOURCE]: { ...NOTE, requests: [{ after: undefined, item: { kind: 'request', id: 'request:1', tasks: [{ project: 'app', title: 'Child', text: 'Do it', started: CHILD }] } }] },
      [CHILD]: { parent: SOURCE, title: 'Child', hidden: true },
    }
    const settings: Partial<Settings> = { favorites: [SOURCE, TARGET, 'other'], progressOrder: ['other', CHILD, SOURCE], shortcuts: [{ id: 'shortcut', name: 'Work', root: '/work', prompt: 'Do it', mode: 'auto', on: true, since: 1, lastSession: SOURCE }] }
    const result = sessionMigration(notes, settings, IMPORTS)
    expect(result.settings.favorites).toEqual([TARGET, 'other'])
    expect(result.settings.progressOrder).toEqual(['other', CHILD_TARGET, TARGET])
    expect(result.settings.shortcuts?.[0]?.lastSession).toBe(TARGET)
    expect(result.notes[CHILD_TARGET]).toMatchObject({ parent: TARGET, hidden: true })
    expect(result.notes[TARGET]?.requests?.[0]?.item).toMatchObject({ tasks: [{ started: CHILD_TARGET }] })
    expect(sessionMigration(result.notes, result.settings, IMPORTS).report.migrated).toBe(0)
  })

  it('writes nothing during a dry run', () => {
    const { folder, manifest } = fixture({ [SOURCE]: NOTE }, { favorites: [SOURCE] })
    const before = readFileSync(join(folder, 'sessions.json'), 'utf8')
    const result = migrateCodexMetadata(folder, manifest, true)
    expect(result).toMatchObject({ dryRun: true, migrated: 1, favorites: 1 })
    expect(readFileSync(join(folder, 'sessions.json'), 'utf8')).toBe(before)
    expect(existsSync(join(folder, 'backups'))).toBe(false)
  })

  it('backs up both files before writing and is a no-op when repeated', () => {
    const notes = { [SOURCE]: NOTE }
    const settings = { favorites: [SOURCE], progressOrder: [SOURCE], theme: 'dark' as const }
    const { folder, manifest } = fixture(notes, settings)
    const result = migrateCodexMetadata(folder, manifest)
    expect(result.backup).toBeDefined()
    expect(JSON.parse(readFileSync(join(result.backup ?? '', 'sessions.json'), 'utf8'))).toEqual(notes)
    expect(JSON.parse(readFileSync(join(result.backup ?? '', 'settings.json'), 'utf8'))).toEqual(settings)
    expect(JSON.parse(readFileSync(join(folder, 'sessions.json'), 'utf8'))[TARGET]).toMatchObject({ created: 100, status: 'done', moves: NOTE.moves })
    expect(JSON.parse(readFileSync(join(folder, 'settings.json'), 'utf8'))).toEqual({ ...settings, favorites: [TARGET], progressOrder: [TARGET] })
    const repeated = migrateCodexMetadata(folder, manifest)
    expect(repeated).toMatchObject({ migrated: 0, favorites: 0, order: 0 })
    expect(repeated.backup).toBeUndefined()
  })

  it('migrates the running app snapshot rather than stale disk data and replaces its cached notes', () => {
    const { folder, manifest } = fixture({ [SOURCE]: { status: 'review' } })
    const notes = memoryNotes()
    notes.set(SOURCE, NOTE)
    let settings: Partial<Settings> = { ...DEFAULT_SETTINGS, favorites: [SOURCE] }
    const result = migrateCodexMetadata(folder, manifest, false, { notes, settings, saveSettings: (next) => { settings = next } })
    expect(result.migrated).toBe(1)
    expect(notes.all()[TARGET]).toMatchObject({ status: 'done', moves: NOTE.moves })
    expect(settings.favorites).toEqual([TARGET])
    expect(JSON.parse(readFileSync(join(result.backup ?? '', 'sessions.json'), 'utf8'))[SOURCE]).toEqual(NOTE)
  })

  it('rejects a malformed manifest before backing up or changing metadata', () => {
    const { folder, manifest } = fixture({ [SOURCE]: NOTE })
    writeFileSync(manifest, JSON.stringify({ records: [{ source_path: '/work/file.jsonl' }] }))
    expect(() => migrateCodexMetadata(folder, manifest)).toThrow('source path or thread ID')
    expect(existsSync(join(folder, 'backups'))).toBe(false)
    expect(JSON.parse(readFileSync(join(folder, 'sessions.json'), 'utf8'))).toEqual({ [SOURCE]: NOTE })
  })
})
