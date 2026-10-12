import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CalendarRecurrence, Settings, Shortcut } from '../src/shared/api'
import { DEFAULT_SETTINGS } from '../src/shared/api'

const held = vi.hoisted(() => ({ shortcuts: [] as Shortcut[], chatProviders: ['claude', 'codex'] as Settings['chatProviders'], writeFails: false }))

vi.mock('electron', () => ({ powerMonitor: { on: vi.fn() } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))
vi.mock('../src/main/store', () => ({
  getSettings: () => ({ ...DEFAULT_SETTINGS, ...held }),
  setSettings: (change: Partial<Settings>) => {
    if (held.writeFails) throw new Error('Could not write settings')
    if (change.shortcuts !== undefined) held.shortcuts = [...change.shortcuts]
  },
}))

const { runShortcut, saveShortcut, startShortcuts } = await import('../src/main/shortcuts')

const at = (text: string): number => new Date(text).getTime()

const morning: Shortcut = {
  id: 'm',
  name: 'Morning review',
  root: '/p',
  prompt: 'Review what came in overnight',
  mode: 'auto',
  cron: '0 9 * * *',
  on: true,
  since: at('2026-09-21T09:00'),
}
const custom: CalendarRecurrence = { start: '2026-09-21', time: '09:00', interval: 1, unit: 'day', weekdays: [1], monthly: 'day', end: { kind: 'after', count: 3 } }

describe('the shortcuts', () => {
  const start = vi.fn(async () => 'session-1')
  const rename = vi.fn()
  let busy = false

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(at('2026-09-22T09:00:10'))
    held.shortcuts = [morning]
    held.chatProviders = ['claude', 'codex']
    held.writeFails = false
    start.mockClear()
    rename.mockClear()
    busy = false
  })

  afterEach(() => vi.useRealTimers())

  it('starts a conversation with the prompt when a timed one is due, names it, and counts it as run', async () => {
    startShortcuts({ start, rename, busy: () => busy })
    await vi.waitFor(() => expect(rename).toHaveBeenCalled())
    expect(start).toHaveBeenCalledWith({ root: '/p', mode: 'auto', text: 'Review what came in overnight', provider: 'claude' })
    expect(rename).toHaveBeenCalledWith('session-1', 'Morning review')
    const ran = at('2026-09-22T09:00:10')
    expect(held.shortcuts[0]).toMatchObject({ lastRun: ran, since: ran, lastSession: 'session-1' })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('never starts one with no timetable by itself, and a run by hand leaves the timetable where it was', async () => {
    const { cron: _cron, ...byHand } = morning
    held.shortcuts = [byHand, { ...morning, id: 't', since: at('2026-09-22T09:00') }]
    startShortcuts({ start, rename, busy: () => busy })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(start).not.toHaveBeenCalled()
    expect(await runShortcut('m', 'hand')).toBe('session-1')
    expect(await runShortcut('t', 'hand')).toBe('session-1')
    expect(held.shortcuts[1]).toMatchObject({ since: at('2026-09-22T09:00'), lastSession: 'session-1' })
  })

  it('sends the goal after the prompt, into the conversation the run started', async () => {
    held.shortcuts = [{ ...morning, goal: "today's plan is written" }]
    expect(await runShortcut('m', 'hand')).toBe('session-1')
    expect(start).toHaveBeenNthCalledWith(1, { root: '/p', mode: 'auto', text: 'Review what came in overnight', provider: 'claude' })
    expect(start).toHaveBeenNthCalledWith(2, { session: 'session-1', root: '/p', mode: 'auto', text: "/goal today's plan is written" })
  })

  it('keeps a goal only where there is one, trimmed', () => {
    expect(saveShortcut({ ...morning, goal: '  it holds  ' }).goal).toBe('it holds')
    expect(saveShortcut({ ...morning, goal: '   ' }).goal).toBeUndefined()
  })

  it('saves and runs a Codex shortcut with its model and reasoning by hand and timetable', async () => {
    saveShortcut({ ...morning, provider: 'codex', model: 'codex-model', reasoning: 'high', goal: 'Tests pass' })
    expect(held.shortcuts[0]).toMatchObject({ provider: 'codex', model: 'codex-model', reasoning: 'high', goal: 'Tests pass' })
    startShortcuts({ start, rename, busy: () => busy })
    await vi.waitFor(() => expect(start).toHaveBeenCalled())
    expect(start).toHaveBeenCalledExactlyOnceWith({ root: '/p', mode: 'auto', text: morning.prompt, provider: 'codex', model: 'codex-model', reasoning: 'high', goal: 'Tests pass' })
    start.mockClear()
    await runShortcut('m', 'hand')
    expect(start).toHaveBeenCalledExactlyOnceWith({ root: '/p', mode: 'auto', text: morning.prompt, provider: 'codex', model: 'codex-model', reasoning: 'high', goal: 'Tests pass' })
  })

  it('keeps explicit Default reasoning and clears Codex-only settings when changed to Claude', () => {
    expect(saveShortcut({ ...morning, provider: 'codex', reasoning: '' }).reasoning).toBe('')
    expect(saveShortcut({ ...morning, provider: 'claude', reasoning: 'high' }).reasoning).toBeUndefined()
  })

  it('skips disabled assistants without running a different assistant or counting it as run', async () => {
    held.chatProviders = ['claude']
    held.shortcuts = [{ ...morning, provider: 'codex' }]
    startShortcuts({ start, rename, busy: () => busy })
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await runShortcut('m', 'hand')).toBeUndefined()
    expect(start).not.toHaveBeenCalled()
    expect(held.shortcuts[0]?.lastRun).toBeUndefined()
    held.chatProviders = ['codex']
    await runShortcut('m', 'hand')
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ provider: 'codex' }))
    start.mockClear()
    held.shortcuts = [morning]
    expect(await runShortcut('m', 'hand')).toBeUndefined()
    expect(start).not.toHaveBeenCalled()
  })

  it('skips Codex on a remote project and carries saved goals into Codex runs', async () => {
    held.shortcuts = [{ ...morning, provider: 'codex', root: 'ssh://box/work' }]
    startShortcuts({ start, rename, busy: () => busy })
    expect(await runShortcut('m', 'hand')).toBeUndefined()
    expect(start).not.toHaveBeenCalled()
    held.shortcuts = [{ ...morning, provider: 'codex', goal: 'An old Claude goal' }]
    await runShortcut('m', 'hand')
    expect(start).toHaveBeenCalledExactlyOnceWith({ root: '/p', mode: 'auto', text: morning.prompt, provider: 'codex', goal: 'An old Claude goal' })
  })

  it('lets a timed run go while the last one is still going, rather than piling it up', async () => {
    held.shortcuts = [{ ...morning, lastSession: 'still-going' }]
    busy = true
    startShortcuts({ start, rename, busy: () => busy })
    await vi.advanceTimersByTimeAsync(0)
    expect(start).not.toHaveBeenCalled()
    expect(held.shortcuts[0]?.since).toBe(Date.now())
  })

  it('keeps when it ran through an edit, whatever a window sends, and counts a new time from now', async () => {
    startShortcuts({ start, rename, busy: () => busy })
    await runShortcut('m', 'timetable')
    const ran = held.shortcuts[0]
    saveShortcut({ ...morning, name: 'Renamed', lastRun: 1, lastSession: 'old' } as Shortcut)
    expect(held.shortcuts[0]).toMatchObject({ name: 'Renamed', lastRun: ran?.lastRun, lastSession: 'session-1', since: ran?.since })
    vi.setSystemTime(at('2026-09-22T12:00'))
    saveShortcut({ ...morning, cron: '0 10 * * *' })
    expect(held.shortcuts[0]?.since).toBe(at('2026-09-22T12:00'))
    const { cron: _cron, ...byHand } = morning
    expect(saveShortcut(byHand).cron).toBeUndefined()
  })

  it('runs a finite custom series once after downtime, permits manual runs, and preserves progress on stale edits', async () => {
    const { cron: _cron, ...manual } = morning
    held.shortcuts = [{ ...manual, recurrence: custom }]
    startShortcuts({ start, rename, busy: () => busy })
    await vi.waitFor(() => expect(rename).toHaveBeenCalled())
    const since = held.shortcuts[0]?.since
    await runShortcut('m', 'hand')
    expect(held.shortcuts[0]?.since).toBe(since)
    const { end, ...unchanged } = custom
    const edited = saveShortcut({ ...manual, recurrence: { end, ...unchanged }, name: 'New name' })
    expect(edited).toMatchObject({ since, lastSession: 'session-1', recurrence: custom })
    vi.setSystemTime(at('2026-09-23T09:00:10'))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(start).toHaveBeenCalledTimes(3)
    vi.setSystemTime(at('2026-09-24T09:00'))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(start).toHaveBeenCalledTimes(3)
    expect(await runShortcut('m', 'hand')).toBe('session-1')
  })

  it('resumes only future dates, keeps the anchor, and resets only the cursor for a changed recurrence', () => {
    const { cron: _cron, ...manual } = morning
    held.shortcuts = [{ ...manual, recurrence: custom, on: false }]
    const resumed = saveShortcut({ ...manual, recurrence: custom, on: true })
    expect(resumed.since).toBe(Date.now())
    expect(resumed.recurrence).toEqual(custom)
    vi.setSystemTime(at('2026-09-22T12:00'))
    const changed = saveShortcut({ ...resumed, recurrence: { ...custom, time: '14:00' } })
    expect(changed.since).toBe(Date.now())
  })

  it('rejects deleted and invalid drafts, including ambiguous cron plus custom rules', () => {
    expect(() => saveShortcut({ ...morning, id: 'gone' })).toThrow('deleted')
    expect(() => saveShortcut({ ...morning, recurrence: custom })).toThrow('one timetable')
    const { cron: _cron, ...manual } = morning
    expect(() => saveShortcut({ ...manual, recurrence: { ...custom, interval: 0 } })).toThrow('whole number')
    expect(held.shortcuts).toEqual([morning])
  })

  it('does not launch an expired custom catch-up, while final-day delayed ticks still run', async () => {
    const { cron: _cron, ...manual } = morning
    held.shortcuts = [{ ...manual, recurrence: custom }]
    vi.setSystemTime(at('2026-09-24T09:00'))
    startShortcuts({ start, rename, busy: () => busy })
    await vi.advanceTimersByTimeAsync(20_000)
    expect(start).not.toHaveBeenCalled()
    vi.setSystemTime(at('2026-09-23T09:00:10'))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('consumes skipped and failed custom dates without moving the count endpoint', async () => {
    const { cron: _cron, ...manual } = morning
    held.shortcuts = [{ ...manual, recurrence: custom, lastSession: 'still-going' }]
    busy = true
    startShortcuts({ start, rename, busy: () => busy })
    expect(held.shortcuts[0]?.since).toBe(Date.now())
    expect(start).not.toHaveBeenCalled()
    busy = false
    start.mockRejectedValueOnce(new Error('launch failed'))
    vi.setSystemTime(at('2026-09-23T09:00:10'))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(start).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(40_000)
    expect(start).toHaveBeenCalledTimes(1)
    vi.setSystemTime(at('2026-09-24T09:00'))
    await vi.advanceTimersByTimeAsync(20_000)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('skips malformed persisted rules without preventing a valid shortcut from starting', async () => {
    const { cron: _cron, ...manual } = morning
    held.shortcuts = [{ ...manual, id: 'bad', recurrence: { ...custom, interval: 0 } }, { ...manual, recurrence: custom }]
    startShortcuts({ start, rename, busy: () => busy })
    await vi.waitFor(() => expect(rename).toHaveBeenCalled())
    expect(start).toHaveBeenCalledTimes(1)
    expect(held.shortcuts[0]?.lastRun).toBeUndefined()
    expect(held.shortcuts[1]?.lastSession).toBe('session-1')
  })

  it('retains history and never launches after a failed persistence update', async () => {
    startShortcuts({ start, rename, busy: () => busy })
    await vi.waitFor(() => expect(rename).toHaveBeenCalled())
    const before = [...held.shortcuts]
    start.mockClear()
    held.writeFails = true
    expect(await runShortcut('m', 'hand')).toBeUndefined()
    expect(start).not.toHaveBeenCalled()
    expect(held.shortcuts).toEqual(before)
  })
})
