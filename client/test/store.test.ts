import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, it, vi } from 'vitest'

import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { CalendarRecurrence, Settings, Shortcut } from '../src/shared/api'
import { isDue } from '../src/shared/schedule'

const state = vi.hoisted(() => ({ folder: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.folder } }))

const { getSettings, onSettings, setSettings } = await import('../src/main/store')

function loadSettings(change: Partial<Settings> = {}): void {
  state.folder = mkdtempSync(join(tmpdir(), 'geckit-calendar-settings-'))
  writeFileSync(join(state.folder, 'settings.json'), JSON.stringify({ ...DEFAULT_SETTINGS, phoneKey: 'calendar-test', ...change }))
  const stop = onSettings(() => {})
  stop()
}

it('updates open windows when settings.json is replaced outside GeckIt', async () => {
  state.folder = mkdtempSync(join(tmpdir(), 'geckit-settings-'))
  const path = join(state.folder, 'settings.json')
  const initial: Settings = { ...DEFAULT_SETTINGS, projects: ['/old'], projectColors: { '/old': 0 }, phoneKey: 'key' }
  writeFileSync(path, JSON.stringify(initial))
  expect(getSettings().projects).toEqual(['/old'])

  const changed: Settings[] = []
  const stop = onSettings((settings) => changed.push(settings))
  try {
    const edited: Settings = { ...initial, projects: ['/new', '/old'] }
    writeFileSync(`${path}.new`, JSON.stringify(edited))
    renameSync(`${path}.new`, path)

    await vi.waitFor(() => expect(changed).toHaveLength(1), { timeout: 2000 })
    expect(changed[0]?.projects).toEqual(['/new', '/old'])
    expect(getSettings().projects).toEqual(['/new', '/old'])

    setSettings({ theme: 'dark' })
    expect(changed).toHaveLength(2)
    await new Promise((done) => setTimeout(done, 350))
    expect(changed).toHaveLength(2)
  } finally {
    stop()
    rmSync(state.folder, { recursive: true, force: true })
  }
})

const calendar: CalendarRecurrence = { start: '2026-10-13', time: '09:00', interval: 2, unit: 'week', weekdays: [2, 4], monthly: 'ordinal', end: { kind: 'after', count: 13 } }
const scheduled: Shortcut = { id: 'calendar', name: 'Review', root: '/work', prompt: 'Review', mode: 'auto', on: true, since: 1, recurrence: calendar }

it('round-trips custom rules and ignores stale phone time-zone metadata without writing it', () => {
  loadSettings()
  try {
    const saved = setSettings({ shortcuts: [scheduled], calendarTimeZone: 'America/New_York' })
    expect(saved.shortcuts).toEqual([scheduled])
    expect(saved.calendarTimeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone)
    const persisted: Settings = JSON.parse(readFileSync(join(state.folder, 'settings.json'), 'utf8')) as Settings
    expect(persisted.shortcuts).toEqual([scheduled])
    expect(persisted.calendarTimeZone).toBeUndefined()
    const stop = onSettings(() => {})
    stop()
    expect(getSettings().shortcuts).toEqual([scheduled])
    expect(() => setSettings({ shortcuts: [{ ...scheduled, recurrence: { ...calendar, interval: 0 } }] })).toThrow('whole number')
    expect(getSettings().shortcuts).toEqual([scheduled])
  } finally { rmSync(state.folder, { recursive: true, force: true }) }
})

it('keeps settings and notifications unchanged when a shortcut write fails', () => {
  loadSettings({ shortcuts: [scheduled] })
  const originalFolder = state.folder
  const before = getSettings()
  const changes: Settings[] = []
  const stop = onSettings((settings) => changes.push(settings))
  try {
    state.folder = join(originalFolder, 'settings.json')
    expect(() => setSettings({ shortcuts: [{ ...scheduled, name: 'Changed' }] })).toThrow()
    expect(getSettings()).toEqual(before)
    expect(changes).toEqual([])
  } finally {
    state.folder = originalFolder
    stop()
    rmSync(originalFolder, { recursive: true, force: true })
  }
})

it('carries a malformed stored rule safely without blocking another shortcut history update', () => {
  const malformed: Shortcut = { ...scheduled, id: 'bad', recurrence: { ...calendar, interval: 0 } }
  loadSettings({ shortcuts: [malformed, scheduled] })
  try {
    expect(isDue(malformed, Date.now())).toBe(false)
    const saved = setSettings({ shortcuts: [malformed, { ...scheduled, lastRun: 42, since: 42 }] })
    expect(saved.shortcuts[1]?.lastRun).toBe(42)
    expect(saved.shortcuts[0]).toEqual(malformed)
  } finally { rmSync(state.folder, { recursive: true, force: true }) }
})

it('broadcasts a changed runtime computer zone once without persisting a phone preference', () => {
  loadSettings()
  const before = getSettings()
  const changes: Settings[] = []
  const stop = onSettings((settings) => changes.push(settings))
  const options = Intl.DateTimeFormat().resolvedOptions()
  const nextZone = options.timeZone === 'Asia/Tokyo' ? 'Europe/Samara' : 'Asia/Tokyo'
  const resolved = vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ ...options, timeZone: nextZone })
  vi.useFakeTimers()
  try {
    vi.setSystemTime(Date.now() + 120_000)
    expect(getSettings().calendarTimeZone).toBe(nextZone)
    expect(changes).toHaveLength(1)
    expect(changes[0]?.calendarTimeZone).toBe(nextZone)
    expect(getSettings().shortcuts).toEqual(before.shortcuts)
    expect(changes).toHaveLength(1)
  } finally {
    resolved.mockRestore()
    vi.useRealTimers()
    stop()
    rmSync(state.folder, { recursive: true, force: true })
  }
})
