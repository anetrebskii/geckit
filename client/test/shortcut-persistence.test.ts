import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, it, vi } from 'vitest'

import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { CalendarRecurrence, Settings, ShortcutDraft } from '../src/shared/api'
import { sameRecurrence } from '../src/shared/recurrence'
import { saveShortcut as checkedSave } from '../src/shared/shortcut-save'
import { isDue, nextTimed } from '../src/shared/schedule'

const state = vi.hoisted(() => ({ folder: '' }))
vi.mock('../src/core/platform', () => ({ dataDirectory: () => state.folder }))
vi.mock('electron', () => ({ app: { getPath: () => state.folder }, powerMonitor: { on: vi.fn() } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))

const { saveShortcut } = await import('../src/main/shortcuts')

it('acknowledges and persists custom recurrence through the actual main save and settings store', async () => {
  state.folder = mkdtempSync(join(tmpdir(), 'geckit-shortcut-save-'))
  const path = join(state.folder, 'settings.json')
  writeFileSync(path, JSON.stringify({ ...DEFAULT_SETTINGS, phoneKey: 'fixture' }))
  const recurrence: CalendarRecurrence = { start: '2026-10-13', time: '09:00', interval: 2, unit: 'week', weekdays: [2, 4], monthly: 'day', end: { kind: 'after', count: 13 } }
  const draft: ShortcutDraft = { name: 'Review', root: '/fixture', prompt: 'Review pull requests', mode: 'auto', on: true, recurrence }
  try {
    const { getSettings, setSettings } = await import('../src/main/store')
    const saved = await checkedSave({ save: async (next) => saveShortcut(next) }, getSettings(), draft)
    const created = JSON.parse(readFileSync(path, 'utf8')) as Settings
    expect(sameRecurrence(recurrence, saved.recurrence)).toBe(true)
    expect(created.shortcuts).toEqual([saved])
    expect(created.calendarRecurrenceVersion).toBeUndefined()
    expect(created.calendarTimeZone).toBeUndefined()

    expect(getSettings().calendarRecurrenceVersion).toBe(1)
    const advertised: Partial<Settings> = { calendarRecurrenceVersion: 1 }
    Object.defineProperty(advertised, 'calendarRecurrenceVersion', { value: 0, enumerable: true })
    expect(setSettings(advertised).calendarRecurrenceVersion).toBe(1)

    const editedRule: CalendarRecurrence = { ...recurrence, time: '18:15', end: { kind: 'on', date: '2027-01-05' } }
    const edited = await checkedSave({ save: async (next) => saveShortcut(next) }, getSettings(), { ...saved, recurrence: editedRule })
    const editedDisk = JSON.parse(readFileSync(path, 'utf8')) as Settings
    expect(sameRecurrence(editedRule, edited.recurrence)).toBe(true)
    expect(editedDisk.shortcuts).toEqual([edited])

    vi.resetModules()
    const reloaded = await import('../src/main/store')
    expect(reloaded.getSettings().shortcuts).toEqual([edited])
    expect(reloaded.getSettings().calendarRecurrenceVersion).toBe(1)
  } finally { rmSync(state.folder, { recursive: true, force: true }) }
})

it('persists the chosen CRON window and progress through settings reloads and protects support metadata', async () => {
  state.folder = mkdtempSync(join(tmpdir(), 'geckit-window-save-'))
  const path = join(state.folder, 'settings.json')
  writeFileSync(path, JSON.stringify({ ...DEFAULT_SETTINGS, phoneKey: 'fixture' }))
  vi.resetModules()
  try {
    const store = await import('../src/main/store')
    const main = await import('../src/main/shortcuts')
    const draft: ShortcutDraft = { name: 'Window review', root: '/fixture', prompt: 'Review pull requests', mode: 'auto', on: true, cron: '0 9 * * *', startWindowMinutes: 60 }
    const saved = await checkedSave({ save: async (next) => main.saveShortcut(next) }, store.getSettings(), draft)
    const chosen = nextTimed(saved, saved.since)
    const disk = JSON.parse(readFileSync(path, 'utf8')) as Settings
    expect(disk.shortcuts).toEqual([saved])
    expect(disk.cronStartWindowVersion).toBeUndefined()
    expect(store.getSettings().cronStartWindowVersion).toBe(1)
    const falseSupport: Partial<Settings> = {}
    Object.defineProperty(falseSupport, 'cronStartWindowVersion', { value: 0, enumerable: true })
    expect(store.setSettings(falseSupport).cronStartWindowVersion).toBe(1)
    expect(() => store.setSettings({ shortcuts: [{ ...saved, startWindowMinutes: 0 }] })).toThrow('whole number')
    expect(store.getSettings().shortcuts).toEqual([saved])

    vi.resetModules()
    const reloaded = await import('../src/main/store')
    const restored = reloaded.getSettings().shortcuts[0]
    expect(restored).toEqual(saved)
    expect(reloaded.getSettings().cronStartWindowVersion).toBe(1)
    expect(restored === undefined ? undefined : nextTimed(restored, restored.since)).toBe(chosen)

    writeFileSync(path, JSON.stringify({ ...disk, shortcuts: [{ ...saved, startWindowMinutes: null }, saved] }))
    vi.resetModules()
    const malformed = await import('../src/main/store')
    const invalid = malformed.getSettings().shortcuts[0]
    expect(invalid === undefined ? true : isDue(invalid, (chosen ?? 0) + 86_400_000)).toBe(false)
    expect(malformed.getSettings().shortcuts[1]).toEqual(saved)
  } finally { rmSync(state.folder, { recursive: true, force: true }) }
})


it('preserves a Manager target and explicit paused timetable through disk reload without adding one to manual shortcuts', async () => {
  state.folder = mkdtempSync(join(tmpdir(), 'geckit-manager-shortcut-save-'))
  const path = join(state.folder, 'settings.json')
  writeFileSync(path, JSON.stringify({ ...DEFAULT_SETTINGS, phoneKey: 'fixture' }))
  vi.resetModules()
  try {
    const store = await import('../src/main/store')
    const main = await import('../src/main/shortcuts')
    const manual = await checkedSave({ save: async (draft) => main.saveShortcut(draft) }, store.getSettings(), { name: 'Recordings', root: '/fixture', prompt: 'Check recordings and create tasks', mode: 'auto', on: true, target: 'manager' })
    expect(manual.cron).toBeUndefined()
    expect(manual.recurrence).toBeUndefined()
    const paused = await checkedSave({ save: async (draft) => main.saveShortcut(draft) }, store.getSettings(), { ...manual, cron: '0 10 * * *', on: false })
    expect(paused).toMatchObject({ target: 'manager', cron: '0 10 * * *', on: false })
    const disk = JSON.parse(readFileSync(path, 'utf8')) as Settings
    expect(disk.shortcuts).toEqual([paused])
    expect(disk.managerShortcutsVersion).toBeUndefined()
    vi.resetModules()
    const restored = await import('../src/main/store')
    expect(restored.getSettings().shortcuts).toEqual([paused])
    expect(restored.getSettings().managerShortcutsVersion).toBe(1)
  } finally { rmSync(state.folder, { recursive: true, force: true }) }
})
