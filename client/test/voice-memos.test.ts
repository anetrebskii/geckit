import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { VoiceMemosSource, voiceMemosDirectory } from '../src/main/voice-memos'
import { SourcePending } from '../src/main/manager-intake'
import type { ManagerSourceConfig } from '../src/shared/manager-intake'

const paths: string[] = []
afterEach(() => { for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true }) })
function library(schema = true) {
  const directory = mkdtempSync(join(tmpdir(), 'geckit-memo-fixture-')); paths.push(directory)
  const database = join(directory, 'CloudRecordings.db')
  execFileSync('/usr/bin/sqlite3', [database, schema ? "CREATE TABLE ZCLOUDRECORDING (ZUNIQUEID TEXT, ZPATH TEXT, ZDATE REAL, ZCUSTOMLABEL TEXT, ZDURATION REAL); INSERT INTO ZCLOUDRECORDING VALUES ('uuid-1','memo.m4a',800000000,'An idea',4);" : 'CREATE TABLE OTHER (id TEXT);'])
  writeFileSync(join(directory, 'memo.m4a'), Buffer.from('incomplete fixture audio'))
  const config: ManagerSourceConfig = { id: 'memo-fixture', kind: 'voice-memos', enabled: true, directory }
  const transcribe = vi.fn(async () => 'Transcript')
  let now = 1_800_000_000_000
  const source = new VoiceMemosSource(config, { platform: 'darwin', transcribe, now: () => now })
  return { directory, database, source, transcribe, advance: () => { now += 60_000 } }
}

describe.skipIf(process.platform !== 'darwin')('Voice Memos native SQLite snapshot fixture', () => {
  it('reads only the isolated fixture schema and leaves original bytes and directory unchanged', async () => {
    const f = library(), original = readFileSync(f.database), audio = readFileSync(join(f.directory, 'memo.m4a')), names = readdirSync(f.directory)
    expect(await f.source.status()).toEqual({ state: 'ready' })
    const first = await f.source.list()
    expect(first.items).toHaveLength(1)
    expect(first.items[0]).toMatchObject({ id: 'uuid-1', title: 'An idea', createdAt: 1_778_307_200_000 })
    expect((await f.source.list(first.cursor)).items[0]?.revision).toBe(first.items[0]?.revision)
    expect(readFileSync(f.database)).toEqual(original); expect(readFileSync(join(f.directory, 'memo.m4a'))).toEqual(audio); expect(readdirSync(f.directory)).toEqual(names)
    expect(f.transcribe).not.toHaveBeenCalled()
    await expect(f.source.read(first.items[0]!)).rejects.toBeInstanceOf(SourcePending)
  })
  it('fails closed on a different schema and on recording paths outside the configured directory', async () => {
    const unsupported = library(false); await expect(unsupported.source.list()).rejects.toThrow('unsupported')
    const outside = library(); execFileSync('/usr/bin/sqlite3', [outside.database, "UPDATE ZCLOUDRECORDING SET ZPATH='../private.m4a';"])
    await expect(outside.source.list()).rejects.toThrow('outside')
    expect(outside.transcribe).not.toHaveBeenCalled()
  })
  it('changes revision when synced audio changes and waits rather than reading partial audio', async () => {
    const f = library(); const first = await f.source.list(); f.advance()
    writeFileSync(join(f.directory, 'memo.m4a'), 'changed audio bytes')
    const second = await f.source.list()
    expect(second.items[0]?.revision).not.toBe(first.items[0]?.revision)
    await expect(f.source.read(second.items[0]!)).rejects.toBeInstanceOf(SourcePending)
    expect(f.transcribe).not.toHaveBeenCalled()
  })
})

it('reports unsupported platforms without assuming an Apple API or a synced directory', async () => {
  const source = new VoiceMemosSource({ id: 'memos', kind: 'voice-memos', enabled: true, directory: '/not/a/library' }, { platform: 'win32', transcribe: async () => '' })
  expect(await source.status()).toMatchObject({ state: 'blocked', detail: expect.stringContaining('macOS') })
})

it('expands the standard home directory spelling without inventing another user path', () => {
  expect(voiceMemosDirectory('~/Library/Group Containers/test')).toBe(join(homedir(), 'Library/Group Containers/test'))
  expect(voiceMemosDirectory('/absolute/recordings')).toBe('/absolute/recordings')
})

it.skipIf(process.platform !== 'darwin')('converts an isolated synthetic WAV through real afconvert before the substituted transcription boundary', async () => {
  const f = library()
  const pcm = Buffer.alloc(44 + 96_000)
  pcm.write('RIFF', 0); pcm.writeUInt32LE(pcm.length - 8, 4); pcm.write('WAVEfmt ', 8); pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(48_000, 24); pcm.writeUInt32LE(96_000, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(96_000, 40)
  writeFileSync(join(f.directory, 'memo.wav'), pcm)
  execFileSync('/usr/bin/sqlite3', [f.database, "UPDATE ZCLOUDRECORDING SET ZPATH='memo.wav';"])
  let now = 1_800_000_000_000
  const source = new VoiceMemosSource({ id: 'synthetic', kind: 'voice-memos', enabled: true, directory: f.directory }, { now: () => now, transcribe: async (path) => { const converted = readFileSync(path); expect(converted.toString('ascii', 0, 4)).toBe('RIFF'); expect(converted.readUInt32LE(24)).toBe(16_000); return 'Substituted transcript' } })
  const listed = await source.list(); now += 60_000
  expect(await source.read(listed.items[0]!)).toEqual({ transcript: 'Substituted transcript' })
  expect(readFileSync(join(f.directory, 'memo.wav'))).toEqual(pcm)
})

it.skipIf(process.platform !== 'darwin')('reads an uncheckpointed live WAL snapshot without modifying original DB, WAL or SHM', async () => {
  const f = library()
  const child = spawn('/usr/bin/sqlite3', [f.database], { stdio: ['pipe', 'pipe', 'pipe'] })
  try {
    await new Promise<void>((resolve, reject) => {
      let output = ''
      const timer = setTimeout(() => reject(new Error('SQLite fixture did not become ready')), 5_000)
      child.once('error', (error) => { clearTimeout(timer); reject(error) })
      child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); if (output.includes('fixture-ready')) { clearTimeout(timer); resolve() } })
      child.stdin.write("PRAGMA journal_mode=WAL;\nPRAGMA wal_autocheckpoint=0;\nINSERT INTO ZCLOUDRECORDING VALUES ('wal-uuid','memo.m4a',800000001,'In WAL',4);\nSELECT 'fixture-ready';\n")
    })
    expect(existsSync(`${f.database}-wal`)).toBe(true)
    const database = readFileSync(f.database), wal = readFileSync(`${f.database}-wal`), shm = readFileSync(`${f.database}-shm`)
    const listed = await f.source.list()
    expect(listed.items.map((item) => item.id)).toContain('wal-uuid')
    expect(readFileSync(f.database)).toEqual(database); expect(readFileSync(`${f.database}-wal`)).toEqual(wal); expect(readFileSync(`${f.database}-shm`)).toEqual(shm)
    expect(f.transcribe).not.toHaveBeenCalled()
  } finally {
    const ended = new Promise<void>((resolve) => child.once('close', () => resolve()))
    child.stdin.end(); await ended
  }
})
