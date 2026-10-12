import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, it, vi } from 'vitest'

import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { CalendarRecurrence, Settings, ShortcutDraft } from '../src/shared/api'
import { sameRecurrence } from '../src/shared/recurrence'
import { saveShortcut as checkedSave } from '../src/shared/shortcut-save'

const state = vi.hoisted(() => ({ folder: '' }))
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
