import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, it } from 'vitest'

import { readPreferences, setConfiguration, writePreferences } from '../src/core/configuration'
import { applyConfigurationImport, exportConfiguration, importableConfiguration, IMPORT_PENDING, stageConfigurationImport } from '../src/core/configuration-transfer'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { Shortcut } from '../src/shared/api'
import type { Employee } from '../src/shared/employees'

const folders: string[] = []
const folder = (): string => {
  const path = mkdtempSync(join(tmpdir(), 'geckit-transfer-'))
  folders.push(path)
  return path
}
const bytes = (path: string, name: string): string => readFileSync(join(path, name), 'utf8')
afterEach(() => { for (const path of folders.splice(0)) rmSync(path, { recursive: true, force: true }) })

it('exports all reusable sections and imports on a fresh load with private backups and destination state', () => {
  const source = folder()
  const destination = folder()
  const shortcut: Shortcut = { id: 'review', name: 'Review', root: '/app', prompt: 'Check it', mode: 'manual', on: true, since: 123, lastSession: 'private-run' }
  const employee: Employee = { id: 'engineer', name: 'Max', role: 'Engineer', description: 'Use existing patterns', avatar: 'employee-01', revision: 1, archived: false }
  writePreferences(source, { ...DEFAULT_SETTINGS, theme: 'dark', shortcuts: [shortcut], phoneKey: 'source-secret', client: 'source-client' })
  setConfiguration(source, { employees: [employee], manager: { instructions: 'My policy' } })
  const exported = exportConfiguration(source)
  expect(importableConfiguration(exported)).toMatchObject({ general: { theme: 'dark' }, employees: [employee], manager: { instructions: 'My policy' }, shortcuts: [{ id: 'review' }] })
  expect(exported).not.toMatch(/source-secret|source-client|private-run|"since"/)
  writePreferences(destination, { ...DEFAULT_SETTINGS, phoneKey: 'destination-secret', client: 'destination-client' })
  writeFileSync(join(destination, 'manager.json'), '{"inbox":[{"text":"keep work"}]}')
  const before = bytes(destination, 'settings.json')
  const local = bytes(destination, 'local-state.json')
  stageConfigurationImport(destination, exported)
  expect(bytes(destination, 'settings.json')).toBe(before)
  expect(() => stageConfigurationImport(destination, exported)).toThrow('already waiting')
  applyConfigurationImport(destination)
  expect(existsSync(join(destination, IMPORT_PENDING))).toBe(false)
  expect(bytes(destination, 'local-state.json')).toBe(local)
  expect(bytes(destination, 'manager.json')).toContain('keep work')
  const backup = readdirSync(join(destination, 'backups')).find((name) => name.startsWith('configuration-import-'))
  expect(backup).toBeDefined()
  expect(bytes(join(destination, 'backups', backup ?? ''), 'settings.json')).toBe(before)
  expect(bytes(join(destination, 'backups', backup ?? ''), 'local-state.json')).toBe(local)
  const loaded = readPreferences(destination)
  expect(loaded).toMatchObject({ theme: 'dark', phoneKey: 'destination-secret', client: 'destination-client', shortcuts: [{ id: 'review' }] })
  expect(loaded?.shortcuts?.[0]?.since).toBeGreaterThan(123)
  if (process.platform !== 'win32') expect(statSync(join(destination, 'settings.json')).mode & 0o777).toBe(0o600)
})

it.each([
  '', '{', 'null', '[]', '{"version":2}', '{"theme":"dark"}',
  '{"version":1,"general":{"theme":"wrong"}}',
  '{"version":1,"assistants":{"chatProviders":[null]}}',
  '{"version":1,"projects":{"profiles":[{}]}}',
  '{"version":1,"shortcuts":[null]}',
  '{"version":1,"manager":{"enabled":"yes"}}',
  '{"version":1,"phoneKey":"do not transfer"}',
])('rejects invalid imports before staging or changing active configuration: %s', (text) => {
  const path = folder()
  writePreferences(path, { theme: 'light' })
  const before = bytes(path, 'settings.json')
  expect(() => stageConfigurationImport(path, text)).toThrow('not a supported GeckIt configuration')
  expect(bytes(path, 'settings.json')).toBe(before)
  expect(existsSync(join(path, IMPORT_PENDING))).toBe(false)
})

it('preserves the original and pending import when backup creation fails', () => {
  const path = folder()
  writePreferences(path, { theme: 'light' })
  const before = bytes(path, 'settings.json')
  stageConfigurationImport(path, '{"version":1,"general":{"theme":"dark"}}')
  writeFileSync(join(path, 'backups'), 'blocked')
  expect(() => applyConfigurationImport(path)).toThrow()
  expect(bytes(path, 'settings.json')).toBe(before)
  expect(existsSync(join(path, IMPORT_PENDING))).toBe(true)
  rmSync(join(path, 'backups'))
  mkdirSync(join(path, 'settings.json.new'))
  expect(() => applyConfigurationImport(path)).toThrow()
  expect(bytes(path, 'settings.json')).toBe(before)
  expect(existsSync(join(path, IMPORT_PENDING))).toBe(true)
})

it('preserves legacy destination identity before applying the replacement', () => {
  const path = folder()
  writeFileSync(join(path, 'settings.json'), '{"phoneKey":"keep-legacy-key","client":"keep-client"}')
  stageConfigurationImport(path, '{"version":1,"general":{"theme":"dark"}}')
  applyConfigurationImport(path)
  expect(readPreferences(path)).toMatchObject({ theme: 'dark', phoneKey: 'keep-legacy-key', client: 'keep-client' })
})
