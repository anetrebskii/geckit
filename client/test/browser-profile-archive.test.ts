import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync, gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { browser, BROWSER_HELP } from '../src/cli/browser'
import { acquireTestLock, browserStateFolder, saveTestAccount, testAccount } from '../src/cli/browser-lifecycle'
import { exportTestProfile, importTestProfile, profileArchiveCommand } from '../src/cli/profile-archive'
import { deleteTestProfile, makeTestAccount, profilesFolder, testBrowsersState } from '../src/cli/testing'

const roots: string[] = []
const temporary = (): string => { const root = mkdtempSync(join(tmpdir(), 'geckit-profile-archive-')); roots.push(root); return root }
const bridge = (root: string): string => join(root, '.geckit', 'browser')
const profile = (root: string, name = 'source'): string => { const directory = join(profilesFolder(root), name); mkdirSync(directory, { recursive: true }); return directory }
const header = { type: 'profile', format: 'geckit-browser-profile', version: 2, profile: { name: 'source', note: 'GitHub as alex' }, source: { browser: 'camoufox', platform: 'linux' }, createdAt: 1 }
const archive = (root: string, records: readonly object[]): string => { const path = join(root, 'input.geckit-profile.gz'); writeFileSync(path, gzipSync(records.map((record) => JSON.stringify(record)).join('\n') + '\n')); return path }
const end = { type: 'end', entries: 0, bytes: 0 }
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('profile archive round trip', () => {
  it('streams browser files and account note into a private archive and restores a new profile', async () => {
    const root = temporary()
    const directory = profile(root)
    mkdirSync(join(directory, 'Default', 'nested'), { recursive: true })
    mkdirSync(join(directory, 'Default', 'Cache'), { recursive: true })
    writeFileSync(join(directory, 'Default', 'Bookmarks'), '{"name":"Saved"}')
    writeFileSync(join(directory, 'Default', 'nested', 'empty'), '')
    const binary = Buffer.alloc(190_000)
    for (let at = 0; at < binary.length; at++) binary[at] = at % 251
    writeFileSync(join(directory, 'Default', 'Cookies'), binary)
    writeFileSync(join(directory, 'Default', 'Cache', 'transient'), 'skip')
    saveTestAccount('source', 'GitHub as alex', bridge(root))
    const file = await exportTestProfile('source', join(root, 'backup.geckit-profile.gz'), { root })
    expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(gunzipSync(readFileSync(file)).toString()).not.toContain('transient')
    const destination = temporary()
    await importTestProfile(file, 'restored', { root: destination })
    const restored = join(profilesFolder(destination), 'restored')
    expect(readFileSync(join(restored, 'Default', 'Bookmarks'), 'utf8')).toBe('{"name":"Saved"}')
    expect(readFileSync(join(restored, 'Default', 'Cookies'))).toEqual(binary)
    expect(statSync(join(restored, 'Default', 'nested', 'empty')).size).toBe(0)
    expect(existsSync(join(restored, 'Default', 'Cache'))).toBe(false)
    expect(testAccount('restored', bridge(destination))?.note).toBe('GitHub as alex')
    expect(testBrowsersState(destination).profiles).toEqual([{ name: 'restored', note: 'GitHub as alex', open: false }])
  })

  it('supports an empty legacy profile without inventing an account note', async () => {
    const root = temporary()
    profile(root)
    const file = await exportTestProfile('source', join(root, 'empty.gz'), { root })
    await importTestProfile(file, 'restored', { root })
    expect(testAccount('restored', bridge(root))).toBeUndefined()
    expect(readdirSync(join(profilesFolder(root), 'restored'))).toEqual([])
  })
})

describe('profile archive refusal', () => {
  it('refuses a Chrome archive instead of opening it as Firefox data', async () => {
    const root = temporary()
    const input = archive(root, [{ ...header, version: 1, source: { platform: 'darwin', chromeVersion: '158' } }, end])
    await expect(importTestProfile(input, 'restored', { root })).rejects.toThrow('Chrome profile')
    expect(existsSync(join(profilesFolder(root), 'restored'))).toBe(false)
  })

  it('preserves existing output and refuses an output inside the source', async () => {
    const root = temporary()
    const directory = profile(root)
    const output = join(root, 'existing.gz')
    writeFileSync(output, 'precious')
    await expect(exportTestProfile('source', output, { root })).rejects.toThrow('output file already exists')
    expect(readFileSync(output, 'utf8')).toBe('precious')
    await expect(exportTestProfile('source', join(directory, 'backup.gz'), { root })).rejects.toThrow('outside the profile')
    expect(readdirSync(directory)).toEqual([])
  })

  it('refuses open, launching, singleton-locked and lifecycle-locked profiles', async () => {
    const root = temporary()
    const directory = profile(root)
    const folder = bridge(root)
    mkdirSync(join(folder, 'hosts'), { recursive: true })
    const card = join(folder, 'hosts', 'live.json')
    writeFileSync(card, JSON.stringify({ label: 'test:source', pid: process.pid, tabs: [], focused: 0, t: Date.now() }))
    const output = join(root, 'backup.gz')
    await expect(exportTestProfile('source', output, { root })).rejects.toThrow('Close geckit:source')
    rmSync(card)
    writeFileSync(join(folder, 'pending.launch'), JSON.stringify({ name: 'source' }))
    await expect(exportTestProfile('source', output, { root })).rejects.toThrow('Close geckit:source')
    rmSync(join(folder, 'pending.launch'))
    symlinkSync('departed-host-1234', join(directory, 'SingletonLock'))
    await expect(exportTestProfile('source', output, { root })).rejects.toThrow('Close geckit:source')
    rmSync(join(directory, 'SingletonLock'))
    const unlock = acquireTestLock('source', folder)
    expect(unlock).toBeTypeOf('function')
    try { await expect(exportTestProfile('source', output, { root })).rejects.toThrow('Close geckit:source') } finally { unlock?.() }
    expect(existsSync(output)).toBe(false)
  })

  it('cleans partial output when a non-regular profile entry is encountered', async () => {
    const root = temporary()
    const directory = profile(root)
    writeFileSync(join(directory, 'Bookmarks'), 'saved')
    symlinkSync('Bookmarks', join(directory, 'shortcut'))
    const output = join(root, 'backup.gz')
    await expect(exportTestProfile('source', output, { root })).rejects.toThrow('only regular files')
    expect(existsSync(output)).toBe(false)
    expect(readFileSync(join(directory, 'Bookmarks'), 'utf8')).toBe('saved')
  })

  it('reaps departed lifecycle locks and ignores driver cards for departed processes', async () => {
    const root = temporary()
    profile(root)
    const folder = bridge(root)
    const locks = join(browserStateFolder(folder), 'test-locks')
    mkdirSync(locks, { recursive: true })
    mkdirSync(join(folder, 'hosts'), { recursive: true })
    writeFileSync(join(locks, 'source.lock'), '2147483647')
    writeFileSync(join(folder, 'hosts', 'departed.json'), JSON.stringify({ label: 'test:source', pid: 2147483647, tabs: [], focused: 0, t: Date.now() }))
    await exportTestProfile('source', join(root, 'backup.gz'), { root })
    expect(readdirSync(locks)).toEqual([])
  })

  it('preserves a destination profile and metadata collision', async () => {
    const root = temporary()
    const directory = profile(root, 'existing')
    writeFileSync(join(directory, 'Bookmarks'), 'keep')
    const input = archive(root, [header, end])
    await expect(importTestProfile(input, 'existing', { root })).rejects.toThrow('different --name')
    expect(readFileSync(join(directory, 'Bookmarks'), 'utf8')).toBe('keep')
    saveTestAccount('metadata-only', 'Keep this note', bridge(root))
    await expect(importTestProfile(input, 'metadata-only', { root })).rejects.toThrow('different --name')
    expect(testAccount('metadata-only', bridge(root))?.note).toBe('Keep this note')
  })

  it('blocks concurrent destination creation while an import publishes', async () => {
    const root = temporary()
    const input = archive(root, [header, end])
    const importing = importTestProfile(input, 'restored', { root })
    expect(() => makeTestAccount('restored', 'Other account', root, true)).toThrow('in use')
    await importing
    expect(testAccount('restored', bridge(root))?.note).toBe('GitHub as alex')
  })

  it.each(['../outside', '/absolute', 'C:/drive', 'a\\b', './relative', 'a//b', 'a/../outside', 'zero\0byte', 'CON', 'Default/aux.txt', 'com1.db', 'lpt9', 'trailing.', 'trailing ', 'bad?name', 'control\nchar'])('rejects unsafe archive path %s and cleans staging', async (path) => {
    const root = temporary()
    const input = archive(root, [header, { type: 'file', path, size: 0 }, { type: 'end', entries: 1, bytes: 0 }])
    await expect(importTestProfile(input, 'restored', { root })).rejects.toThrow('unsafe profile path')
    expect(readdirSync(profilesFolder(root))).toEqual([])
    expect(testAccount('restored', bridge(root))).toBeUndefined()
  })

  it.each([
    [header, { type: 'symlink', path: 'link', target: '/outside' }, end],
    [header, { type: 'file', path: 'Bookmarks', size: 2 }, { type: 'chunk', data: 'eA==' }, { type: 'end', entries: 1, bytes: 2 }],
    [header, { type: 'directory', path: 'Default' }, { type: 'directory', path: 'default' }, { type: 'end', entries: 2, bytes: 0 }],
    [header, { type: 'file', path: 'nested/file', size: 0 }, { type: 'end', entries: 1, bytes: 0 }],
    [header, { type: 'file', path: 'Bookmarks', size: 0 }, { type: 'file', path: 'Bookmarks', size: 0 }, { type: 'end', entries: 2, bytes: 0 }],
    [header, { type: 'file', path: 'huge', size: 11 * 1024 ** 3 }, end],
    [header, { type: 'chunk', data: 'eA==' }, end],
    [header, end, { type: 'directory', path: 'later' }],
    [{ ...header, profile: { name: '../invalid' } }, end],
    [{ ...header, version: 3 }, end],
    [header],
  ])('rejects malformed records and removes incomplete imports (%#)', async (...records) => {
    const root = temporary()
    const input = archive(root, records)
    await expect(importTestProfile(input, 'restored', { root })).rejects.toThrow()
    expect(readdirSync(profilesFolder(root))).toEqual([])
    expect(testAccount('restored', bridge(root))).toBeUndefined()
  })

  it('verifies the gzip trailer after the end record before publishing', async () => {
    const root = temporary()
    const input = archive(root, [header, end])
    const bytes = readFileSync(input)
    writeFileSync(input, bytes.subarray(0, bytes.length - 5))
    await expect(importTestProfile(input, 'restored', { root })).rejects.toThrow()
    expect(readdirSync(profilesFolder(root))).toEqual([])
  })
})

describe('profile lifecycle and CLI', () => {
  it('does not leave metadata or a partial profile when creation fails', () => {
    const root = temporary()
    mkdirSync(profilesFolder(root), { recursive: true })
    writeFileSync(join(profilesFolder(root), 'blocked'), 'keep')
    expect(() => makeTestAccount('blocked', 'Account', root, true)).toThrow('already exists')
    expect(testAccount('blocked', bridge(root))).toBeUndefined()
    expect(readFileSync(join(profilesFolder(root), 'blocked'), 'utf8')).toBe('keep')
    symlinkSync('missing', join(profilesFolder(root), 'dangling'))
    expect(() => makeTestAccount('dangling', 'Account', root, true)).toThrow('already exists')
    expect(testAccount('dangling', bridge(root))).toBeUndefined()
    const state = browserStateFolder(bridge(root))
    mkdirSync(state, { recursive: true })
    writeFileSync(join(state, 'accounts'), 'blocks account store')
    expect(() => makeTestAccount('failed', 'Account', root, true)).toThrow()
    expect(existsSync(join(profilesFolder(root), 'failed'))).toBe(false)
    expect(readFileSync(join(state, 'accounts'), 'utf8')).toBe('blocks account store')
    expect(readdirSync(join(state, 'test-locks'))).toEqual([])
  })

  it('creates profiles once under the lifecycle lock and keeps metadata in the injected root', () => {
    const root = temporary()
    makeTestAccount('work', 'GitHub as alex', root, true)
    expect(testAccount('work', bridge(root))?.note).toBe('GitHub as alex')
    expect(() => makeTestAccount('work', 'Changed', root, true)).toThrow('already exists')
    expect(testAccount('work', bridge(root))?.note).toBe('GitHub as alex')
    makeTestAccount('work', 'Changed', root)
    expect(testAccount('work', bridge(root))?.note).toBe('Changed')
    const unlock = acquireTestLock('work', bridge(root))
    try {
      expect(() => deleteTestProfile('work', root)).toThrow('in use')
      expect(() => makeTestAccount('work', 'Again', root)).toThrow('in use')
      expect(existsSync(join(profilesFolder(root), 'work'))).toBe(true)
    } finally { unlock?.() }
    deleteTestProfile('work', root)
    expect(testAccount('work', bridge(root))).toBeUndefined()
    expect(existsSync(join(profilesFolder(root), 'work'))).toBe(false)
    expect(readdirSync(join(browserStateFolder(bridge(root)), 'test-locks'))).toEqual([])
  })

  it('gives transfer usage, accurate success wording and rejects unknown profile subcommands', async () => {
    const root = temporary()
    profile(root)
    const file = join(root, 'transfer.gz')
    expect((await profileArchiveCommand(['export', 'source'], { root })).ok).toBe(false)
    expect((await profileArchiveCommand(['export', 'source', '--output', file, '--unexpected'], { root })).ok).toBe(false)
    expect((await profileArchiveCommand(['export', 'source', '--ouput', file], { root })).ok).toBe(false)
    expect((await profileArchiveCommand(['import', file, '--name', 'restored', '--name', 'ignored'], { root })).ok).toBe(false)
    const exported = await profileArchiveCommand(['export', 'test:source', '--output', file], { root })
    expect(exported).toMatchObject({ ok: true })
    expect(exported.said).toContain(file)
    expect(exported.said).toContain('sensitive website data')
    const imported = await profileArchiveCommand(['import', file, '--name', 'restored'], { root })
    expect(imported.ok).toBe(true)
    expect(imported.said).toContain('geckit browser start geckit:restored')
    expect(imported.said).toContain('may need to be set up again')
    expect(BROWSER_HELP).toContain('profiles export <name> --output <file>')
    expect(BROWSER_HELP).toContain('computer executing the CLI')
    expect((await browser(['profiles', 'nonsense'])).ok).toBe(false)
  })
})
