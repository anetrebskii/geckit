import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'

import { configuration, copyConfiguration, readPreferences, setConfiguration, writePreferences } from '../src/core/configuration'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { Settings, Shortcut } from '../src/shared/api'
import type { Configuration, UnsectionedSettings } from '../src/shared/configuration'
import type { Employee } from '../src/shared/employees'
import { DEFAULT_MANAGER_CONFIG } from '../src/shared/manager'

const folders: string[] = []
const directory = (): string => {
  const folder = mkdtempSync(join(tmpdir(), 'geckit-configuration-'))
  folders.push(folder)
  return folder
}
const file = (folder: string, name = 'settings.json'): string => join(folder, name)
const contents = (folder: string, name = 'settings.json'): string => readFileSync(file(folder, name), 'utf8')
const employee: Employee = { id: 'engineer', name: 'Max', role: 'Engineer', description: 'Keep instructions', avatar: 'employee-01', archived: false, revision: 2 }
const shortcut: Shortcut = { id: 'daily', name: 'Review', root: '/work/app', prompt: 'Review changes', mode: 'manual', provider: 'claude', employeeId: employee.id, cron: '0 9 * * *', on: true, since: 123, lastRun: 456, lastSession: 'source-session' }

afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })

describe('sectioned configuration', () => {
  it('accounts for every Settings field in configuration, local state or runtime-derived metadata', () => {
    expectTypeOf<UnsectionedSettings>().toEqualTypeOf<never>()
  })

  it('migrates all owners once, keeps exact originals and separates credentials and work history', () => {
    const folder = directory()
    const settings: Settings = { ...DEFAULT_SETTINGS, theme: 'dark', phoneKey: 'private-pairing', client: 'source-client', projects: ['/work/app'], shortcuts: [shortcut], favorites: ['source-session'], transcriptions: [{ id: 'heard', text: 'Private transcript', at: 1, source: 'microphone' }] }
    const originals = {
      'settings.json': JSON.stringify(settings),
      'employees.json': JSON.stringify([employee]),
      'manager.json': JSON.stringify({ config: { ...DEFAULT_MANAGER_CONFIG, instructions: 'Keep preferences' }, inbox: [{ text: 'Private queued work' }], sessionId: 'source-manager' }),
    }
    for (const [name, text] of Object.entries(originals)) writeFileSync(file(folder, name), text)
    const config = configuration(folder)
    expect(config).toMatchObject({ version: 1, general: { theme: 'dark' }, projects: { projects: ['/work/app'] }, employees: [employee], manager: { instructions: 'Keep preferences' }, shortcuts: [expect.objectContaining({ employeeId: employee.id })] })
    expect(contents(folder)).not.toMatch(/private-pairing|source-client|source-session|source-manager|Private transcript|Private queued work|lastRun|lastSession|"since"/)
    expect(readPreferences(folder)).toMatchObject({ phoneKey: 'private-pairing', client: 'source-client', favorites: ['source-session'], shortcuts: [shortcut] })
    for (const [name, text] of Object.entries(originals)) expect(contents(join(folder, 'backups', 'configuration-v1'), name)).toBe(text)
    expect(contents(folder, 'manager.json')).toBe(originals['manager.json'])
    const bytes = contents(folder)
    expect(configuration(folder)).toEqual(config)
    expect(contents(folder)).toBe(bytes)
    if (process.platform !== 'win32') expect(statSync(file(folder)).mode & 0o777).toBe(0o600)
  })

  it('preserves interleaved owners and unknown fields without rewriting configuration for local history', () => {
    const folder = directory()
    writeFileSync(file(folder), JSON.stringify({ version: 1, general: { theme: 'light', futureOption: 'retained' }, futureSection: { value: 42 } }))
    writePreferences(folder, { theme: 'dark', shortcuts: [shortcut] })
    setConfiguration(folder, { employees: [employee] })
    setConfiguration(folder, { manager: { instructions: 'Independent write' } })
    writePreferences(folder, { nativeLanguage: 'Russian' })
    expect(JSON.parse(contents(folder))).toMatchObject({ general: { theme: 'dark', nativeLanguage: 'Russian', futureOption: 'retained' }, futureSection: { value: 42 }, employees: [employee], manager: { instructions: 'Independent write' } })
    const before = contents(folder)
    writePreferences(folder, { shortcuts: [{ ...shortcut, since: 900, lastRun: 900, lastSession: 'new-session' }] })
    expect(contents(folder)).toBe(before)
    expect(readPreferences(folder)?.shortcuts?.[0]).toMatchObject({ since: 900, lastSession: 'new-session' })
  })

  it('copies only reusable configuration, preserving destination identity and starting fresh shortcut history', () => {
    const source = directory()
    const destination = directory()
    writePreferences(source, { ...DEFAULT_SETTINGS, phoneKey: 'source-key', client: 'source-client', favorites: ['source-session'], shortcuts: [shortcut] })
    setConfiguration(source, { employees: [employee], manager: { ...DEFAULT_MANAGER_CONFIG, instructions: 'Use my preferences' } })
    writePreferences(destination, { ...DEFAULT_SETTINGS, phoneKey: 'destination-key', client: 'destination-client' })
    writeFileSync(file(destination, 'manager.json'), JSON.stringify({ inbox: [{ text: 'Destination queued task' }] }))
    copyFileSync(file(source), file(destination))
    const imported = readPreferences(destination)
    expect(configuration(destination)).toMatchObject({ employees: [employee], manager: { instructions: 'Use my preferences' } })
    expect(imported).toMatchObject({ phoneKey: 'destination-key', client: 'destination-client', favorites: [], shortcuts: [expect.objectContaining({ id: 'daily', employeeId: employee.id })] })
    expect(imported?.shortcuts?.[0]).not.toHaveProperty('lastSession')
    expect(imported?.shortcuts?.[0]?.since).toBeGreaterThan(456)
    expect(readPreferences(destination)?.shortcuts?.[0]?.since).toBe(imported?.shortcuts?.[0]?.since)
    expect(contents(destination, 'manager.json')).toContain('Destination queued task')
  })

  it.each(['{', 'null', '[]', '{"version":2}', '{"general":{}}', '{"version":1,"employees":[null]}', '{"version":1,"projects":[]}', '{"version":1,"manager":null}'])('preserves malformed or unsupported configuration: %s', (text) => {
    const folder = directory()
    writeFileSync(file(folder), text)
    expect(() => writePreferences(folder, { theme: 'dark' })).toThrow()
    expect(contents(folder)).toBe(text)
    expect(existsSync(file(folder, 'local-state.json'))).toBe(false)
  })

  it('keeps legacy input recoverable when backup or atomic replacement fails', () => {
    const folder = directory()
    const legacy = JSON.stringify({ theme: 'dark', phoneKey: 'secret' })
    writeFileSync(file(folder), legacy)
    writeFileSync(file(folder, 'backups'), 'blocked')
    expect(() => configuration(folder)).toThrow()
    expect(contents(folder)).toBe(legacy)
    rmSync(file(folder, 'backups'))
    mkdirSync(file(folder, 'settings.json.new'))
    expect(() => configuration(folder)).toThrow()
    expect(contents(folder)).toBe(legacy)
    expect(contents(join(folder, 'backups', 'configuration-v1'))).toBe(legacy)
  })

  it('reads both formats without mutation from the standalone CLI path', () => {
    const folder = directory()
    const legacy = JSON.stringify({ projects: ['/work'], favorites: ['favorite'] })
    writeFileSync(file(folder), legacy)
    expect(readPreferences(folder, false)).toEqual({ projects: ['/work'], favorites: ['favorite'] })
    expect(contents(folder)).toBe(legacy)
    expect(existsSync(file(folder, 'backups'))).toBe(false)
    configuration(folder)
    expect(readPreferences(folder, false)).toMatchObject({ projects: ['/work'], favorites: ['favorite'] })
  })

  it('preserves local state as well as configuration when preparing a preference write fails', () => {
    const folder = directory()
    writePreferences(folder, { theme: 'light', phoneKey: 'keep-key' })
    const before = contents(folder)
    const local = contents(folder, 'local-state.json')
    mkdirSync(file(folder, 'settings.json.new'))
    expect(() => writePreferences(folder, { theme: 'dark', phoneKey: 'discard-key' })).toThrow()
    expect(contents(folder)).toBe(before)
    expect(contents(folder, 'local-state.json')).toBe(local)
  })

  it('does not revive deleted sections from stale legacy employee or Manager files', () => {
    const folder = directory()
    writeFileSync(file(folder), JSON.stringify({ version: 1 } satisfies Configuration))
    writeFileSync(file(folder, 'employees.json'), JSON.stringify([employee]))
    writeFileSync(file(folder, 'manager.json'), JSON.stringify({ config: { instructions: 'Stale instructions' } }))
    expect(configuration(folder).employees).toBeUndefined()
    expect(configuration(folder).manager).toBeUndefined()
  })

  it('initializes development data from reusable configuration without altering the installed copy', () => {
    const source = directory()
    const destination = directory()
    writePreferences(source, { ...DEFAULT_SETTINGS, phone: true, phoneKey: 'installed-key' })
    setConfiguration(source, { employees: [employee], manager: { instructions: 'Shared instructions' } })
    const before = contents(source)
    copyConfiguration(source, destination)
    expect(configuration(destination)).toMatchObject({ integrations: { phone: false }, employees: [employee], manager: { instructions: 'Shared instructions' } })
    expect(readPreferences(destination)?.phoneKey).toBeUndefined()
    expect(contents(source)).toBe(before)
  })

  it('initializes from legacy installed data without migrating or copying source identity', () => {
    const source = directory()
    const destination = directory()
    const legacy = JSON.stringify({ theme: 'dark', phone: true, phoneKey: 'installed-key', shortcuts: [shortcut] })
    writeFileSync(file(source), legacy)
    writeFileSync(file(source, 'employees.json'), JSON.stringify([employee]))
    writeFileSync(file(source, 'manager.json'), JSON.stringify({ config: { instructions: 'Legacy preferences' }, inbox: [{ text: 'Private work' }] }))
    copyConfiguration(source, destination)
    expect(configuration(destination)).toMatchObject({ general: { theme: 'dark' }, integrations: { phone: false }, employees: [employee], manager: { instructions: 'Legacy preferences' } })
    expect(contents(destination)).not.toMatch(/installed-key|Private work|source-session/)
    expect(contents(source)).toBe(legacy)
    expect(existsSync(file(source, 'backups'))).toBe(false)
  })
})
