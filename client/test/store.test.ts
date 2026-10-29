import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, it, vi } from 'vitest'

import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { CalendarRecurrence, Settings, Shortcut } from '../src/shared/api'
import { Sessions } from '../src/main/sessions'
import { llmProvider } from '../src/main/sessions/provider'
import { VpnSessionMonitor } from '../src/main/sessions/vpn-monitor'
import { isDue } from '../src/shared/schedule'

const state = vi.hoisted(() => ({ folder: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.folder } }))

const { getSettings, onSettings, setSettings } = await import('../src/main/store')

function loadVpnSettings(change: Partial<Settings> = {}): void {
  state.folder = mkdtempSync(join(tmpdir(), 'geckit-vpn-settings-'))
  writeFileSync(join(state.folder, 'settings.json'), JSON.stringify({ ...DEFAULT_SETTINGS, phoneKey: 'vpn-test', ...change }))
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

it('reads a column chosen by an earlier build as that column ticked, and In review as every column', () => {
  loadVpnSettings({ boardColumn: 'done' } as Partial<Settings>)
  try {
    expect(getSettings().boardColumns).toEqual(['done'])
    expect(getSettings()).not.toHaveProperty('boardColumn')
  } finally {
    rmSync(state.folder, { recursive: true, force: true })
  }
  loadVpnSettings({ boardColumn: 'review' } as Partial<Settings>)
  try {
    expect(getSettings().boardColumns).toEqual([])
  } finally {
    rmSync(state.folder, { recursive: true, force: true })
  }
})

it('reads a card an earlier build put in In review as In progress', async () => {
  state.folder = mkdtempSync(join(tmpdir(), 'geckit-review-notes-'))
  try {
    writeFileSync(join(state.folder, 'sessions.json'), JSON.stringify({ a: { title: 'Was in review', status: 'review', moves: [{ status: 'review', at: 1 }] }, b: { status: 'done' } }))
    const { notesStore } = await import('../src/main/store')
    const notes = notesStore().all()
    expect(notes['a']).toEqual({ title: 'Was in review', moves: [{ status: 'review', at: 1 }] })
    expect(notes['b']).toEqual({ status: 'done' })
  } finally {
    rmSync(state.folder, { recursive: true, force: true })
  }
})

it('saves canonical VPN addresses and validates the entire settings change before applying it', async () => {
  loadVpnSettings()
  try {
    const saved = setSettings({ vpnAllowedIps: ['8.8.8.8', '2001:4860:4860:0:0:0:0:8888', '8.8.8.8'], vpnIpCheck: true })
    expect(saved.vpnAllowedIps).toEqual(['8.8.8.8', '2001:4860:4860::8888'])
    expect(() => setSettings({ theme: 'dark', vpnAllowedIps: ['8.8.8.8', 'bad'] })).toThrow('Invalid address: bad')
    expect(getSettings()).toEqual(saved)
    expect(() => setSettings({ vpnAllowedIps: [] })).toThrow('no valid public IP addresses')
    expect(setSettings({ vpnIpCheck: false }).vpnAllowedIps).toEqual(saved.vpnAllowedIps)
  } finally {
    rmSync(state.folder, { recursive: true, force: true })
  }
})

it('rejects enabling the VPN check without saved public addresses', async () => {
  loadVpnSettings()
  try {
    expect(() => setSettings({ vpnIpCheck: true })).toThrow('no valid public IP addresses')
    expect(getSettings().vpnIpCheck).toBe(false)
  } finally {
    rmSync(state.folder, { recursive: true, force: true })
  }
})

it('keeps protection enabled but clears an unusable saved list rather than weakening it', async () => {
  loadVpnSettings({ vpnIpCheck: true, vpnAllowedIps: ['8.8.8.8', 'bad'] })
  try {
    expect(getSettings().vpnIpCheck).toBe(true)
    expect(getSettings().vpnAllowedIps).toEqual([])
    expect(setSettings({ vpnIpCheck: false }).vpnIpCheck).toBe(false)
  } finally {
    rmSync(state.folder, { recursive: true, force: true })
  }
})

it('preserves the effective configuration and does not broadcast if a VPN save cannot be persisted', () => {
  loadVpnSettings({ vpnAllowedIps: ['8.8.8.8'] })
  const originalFolder = state.folder
  const before = getSettings()
  const changed: Settings[] = []
  const stop = onSettings((settings) => changed.push(settings))
  try {
    state.folder = join(originalFolder, 'settings.json')
    expect(() => setSettings({ vpnIpCheck: true })).toThrow()
    expect(getSettings()).toEqual(before)
    expect(changed).toEqual([])
  } finally {
    state.folder = originalFolder
    stop()
    rmSync(originalFolder, { recursive: true, force: true })
  }
})

it.each(['false', 0, null])('treats an ambiguous persisted enable value as enabled: %s', (vpnIpCheck) => {
  loadVpnSettings()
  try {
    writeFileSync(join(state.folder, 'settings.json'), JSON.stringify({ ...DEFAULT_SETTINGS, phoneKey: 'vpn-test', vpnIpCheck, vpnAllowedIps: ['8.8.8.8'] }))
    const stop = onSettings(() => {})
    stop()
    expect(getSettings().vpnIpCheck).toBe(true)
    expect(getSettings().vpnAllowedIps).toEqual(['8.8.8.8'])
  } finally {
    rmSync(state.folder, { recursive: true, force: true })
  }
})

it.each([true, false])('ignores legacy stopping false while master VPN checking is %s', async (vpnIpCheck) => {
  loadVpnSettings()
  vi.useFakeTimers()
  let active = true
  const failed = vi.fn<(explanation: string) => void>(() => { active = false; monitor.refresh() })
  const check = vi.fn(async () => { throw new Error('VPN mismatch') })
  const monitor = new VpnSessionMonitor({
    active: () => active,
    beforeSend: check,
    failed,
    vpnMonitor: () => {
      const settings = getSettings()
      return settings.vpnIpCheck ? JSON.stringify(settings.vpnAllowedIps) : undefined
    },
  })
  try {
    writeFileSync(join(state.folder, 'settings.json'), JSON.stringify({ ...DEFAULT_SETTINGS, phoneKey: 'vpn-test', vpnIpCheck, vpnAllowedIps: ['8.8.8.8'], vpnStopOnFailure: false }))
    const stop = onSettings(() => {})
    stop()
    expect(getSettings().vpnIpCheck).toBe(vpnIpCheck)
    expect(getSettings()).not.toHaveProperty('vpnStopOnFailure')
    expect(readFileSync(join(state.folder, 'settings.json'), 'utf8')).not.toContain('vpnStopOnFailure')
    monitor.refresh()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(check).toHaveBeenCalledTimes(vpnIpCheck ? 1 : 0)
    expect(failed).toHaveBeenCalledTimes(vpnIpCheck ? 1 : 0)
    if (vpnIpCheck) expect(failed).toHaveBeenCalledWith('VPN mismatch')
  } finally {
    monitor.dispose()
    vi.useRealTimers()
    rmSync(state.folder, { recursive: true, force: true })
  }
})

it('discards legacy periodic-stop changes without weakening enabled VPN protection', () => {
  loadVpnSettings({ vpnIpCheck: true, vpnAllowedIps: ['8.8.8.8'] })
  try {
    const change: Partial<Settings> = { theme: 'dark' }
    Object.defineProperty(change, 'vpnStopOnFailure', { value: false, enumerable: true })
    const saved = setSettings(change)
    expect(saved).toMatchObject({ theme: 'dark', vpnIpCheck: true, vpnAllowedIps: ['8.8.8.8'] })
    expect(saved).not.toHaveProperty('vpnStopOnFailure')
    expect(readFileSync(join(state.folder, 'settings.json'), 'utf8')).not.toContain('vpnStopOnFailure')
    expect(setSettings({ vpnIpCheck: false }).vpnAllowedIps).toEqual(['8.8.8.8'])
    expect(setSettings({ vpnIpCheck: true }).vpnIpCheck).toBe(true)
  } finally {
    rmSync(state.folder, { recursive: true, force: true })
  }
})

const calendar: CalendarRecurrence = { start: '2026-10-13', time: '09:00', interval: 2, unit: 'week', weekdays: [2, 4], monthly: 'ordinal', end: { kind: 'after', count: 13 } }
const scheduled: Shortcut = { id: 'calendar', name: 'Review', root: '/work', prompt: 'Review', mode: 'auto', on: true, since: 1, recurrence: calendar }

it('round-trips custom rules and ignores stale phone time-zone metadata without writing it', () => {
  loadVpnSettings()
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
  loadVpnSettings({ shortcuts: [scheduled] })
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
  loadVpnSettings({ shortcuts: [malformed, scheduled] })
  try {
    expect(isDue(malformed, Date.now())).toBe(false)
    const saved = setSettings({ shortcuts: [malformed, { ...scheduled, lastRun: 42, since: 42 }] })
    expect(saved.shortcuts[1]?.lastRun).toBe(42)
    expect(saved.shortcuts[0]).toEqual(malformed)
  } finally { rmSync(state.folder, { recursive: true, force: true }) }
})

it('broadcasts a changed runtime computer zone once without persisting a phone preference', () => {
  loadVpnSettings()
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

it('persists the chosen task folder across board changes and a fresh settings load', async () => {
  state.folder = mkdtempSync(join(tmpdir(), 'geckit-task-folder-'))
  writeFileSync(join(state.folder, 'settings.json'), JSON.stringify({ projects: ['/first', '/chosen'], phoneKey: 'key' }))
  try {
    vi.resetModules()
    const initial = await import('../src/main/store')
    expect(initial.getSettings().newTaskRoot).toBe('')
    initial.setSettings({ newTaskRoot: '/chosen' })
    initial.setSettings({ chatProjects: ['/first'] })
    const persisted = JSON.parse(readFileSync(join(state.folder, 'settings.json'), 'utf8')) as Settings
    expect(persisted.newTaskRoot).toBe('/chosen')
    vi.resetModules()
    const restarted = await import('../src/main/store')
    expect(restarted.getSettings().newTaskRoot).toBe('/chosen')
    expect(restarted.getSettings().chatProjects).toEqual(['/first'])
  } finally {
    rmSync(state.folder, { recursive: true, force: true })
  }
})

it('loads legacy builtin model settings and persists independent model choices across restarts', async () => {
  state.folder = mkdtempSync(join(tmpdir(), 'geckit-provider-models-'))
  writeFileSync(join(state.folder, 'settings.json'), JSON.stringify({ chatModel: 'opus', codexModel: 'gpt-5.4', phoneKey: 'key' }))
  try {
    vi.resetModules()
    const initial = await import('../src/main/store')
    const { modelPreference, providerModel } = await import('../src/shared/providers')
    expect(initial.getSettings().providerModels).toEqual([])
    expect(providerModel(initial.getSettings(), 'plugin:opencode-ollama')).toBe('')
    initial.setSettings(modelPreference(initial.getSettings(), 'plugin:claude-tmux', 'sonnet'))
    initial.setSettings(modelPreference(initial.getSettings(), 'plugin:opencode-ollama', 'ollama/qwen3:8b'))
    initial.setSettings(modelPreference(initial.getSettings(), 'plugin:claude-tmux', ''))
    vi.resetModules()
    const restarted = await import('../src/main/store')
    expect(providerModel(restarted.getSettings(), 'claude')).toBe('opus')
    expect(providerModel(restarted.getSettings(), 'codex')).toBe('gpt-5.4')
    expect(providerModel(restarted.getSettings(), 'plugin:claude-tmux')).toBe('')
    expect(providerModel(restarted.getSettings(), 'plugin:opencode-ollama')).toBe('ollama/qwen3:8b')
  } finally {
    rmSync(state.folder, { recursive: true, force: true })
  }
})

it('persists prepared copies and edited empty drafts through real Notes reloads without provider work', async () => {
  state.folder = mkdtempSync(join(tmpdir(), 'geckit-prepared-copy-'))
  const { notesStore } = await import('../src/main/store')
  const provider = {
    ...llmProvider({}, 'claude'),
    id: 'plugin:prepared' as const,
    family: 'plugin:prepared' as const,
    available: true,
    nativeGoals: true,
    list: async () => [],
    create: vi.fn(async () => 'plugin:prepared:real'),
    read: vi.fn(async () => undefined),
    goal: vi.fn(async () => undefined),
    hold: vi.fn<ReturnType<typeof llmProvider>['hold']>(),
    delete: vi.fn(async () => false),
  }
  const make = (notes: ReturnType<typeof notesStore>): Sessions => new Sessions({
    notes, plugins: [provider], changed: () => undefined, items: () => undefined,
    account: () => undefined, notify: () => undefined,
    disk: { list: async () => [], read: async () => undefined, has: async () => false },
    usage: async () => ({ windows: new Map() }),
  })
  vi.useFakeTimers()
  try {
    const original = notesStore()
    const first = make(original)
    const id = first.prepare({ provider: 'plugin:prepared', root: '/work/copy', mode: 'plan', model: 'initial', text: 'Overview and /saved.md' })
    expect(readFileSync(join(state.folder, 'sessions.json'), 'utf8')).toContain('Overview and /saved.md')
    first.savePreparedDraft(id, { text: '', model: 'edited', reasoning: 'high' })
    await vi.advanceTimersByTimeAsync(250)
    first.dispose()
    const reread = notesStore()
    expect(reread).not.toBe(original)
    expect(reread.all()[id]).toMatchObject({ prepared: { text: '' }, model: 'edited', reasoning: 'high', unborn: '/work/copy' })
    const restarted = make(reread)
    expect(await restarted.list(['/work/copy'])).toMatchObject([{ id, prepared: true, chosen: 'edited', reasoning: 'high', mode: 'plan' }])
    expect(restarted.preparedDraft(id)).toBe('')
    expect(await restarted.items(id)).toEqual([])
    restarted.watching(id)
    await restarted.resumeQueues()
    expect(provider.create).not.toHaveBeenCalled()
    expect(provider.read).not.toHaveBeenCalled()
    expect(provider.goal).not.toHaveBeenCalled()
    expect(provider.hold).not.toHaveBeenCalled()
    expect(reread.all()[id]?.queued).toBeUndefined()
    expect(await restarted.remove([id])).toEqual([id])
    expect(provider.delete).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(250)
    restarted.dispose()
    const deleted = make(notesStore())
    expect(await deleted.list(['/work/copy'])).toEqual([])
    deleted.dispose()
  } finally {
    vi.useRealTimers()
    rmSync(state.folder, { recursive: true, force: true })
  }
})

it('does not publish a prepared copy if its initial Notes write fails', async () => {
  state.folder = mkdtempSync(join(tmpdir(), 'geckit-prepared-failure-'))
  const { notesStore } = await import('../src/main/store')
  const originalFolder = state.folder
  const notes = notesStore()
  const changed = vi.fn()
  const sessions = new Sessions({ notes, changed, items: () => undefined, account: () => undefined, notify: () => undefined })
  try {
    writeFileSync(join(originalFolder, 'not-a-directory'), '')
    state.folder = join(originalFolder, 'not-a-directory')
    expect(() => sessions.prepare({ root: '/work', mode: 'manual', text: 'Keep this only if saved' })).toThrow()
    expect(notes.all()).toEqual({})
    expect(changed).not.toHaveBeenCalled()
  } finally {
    sessions.dispose()
    state.folder = originalFolder
    rmSync(originalFolder, { recursive: true, force: true })
  }
})
