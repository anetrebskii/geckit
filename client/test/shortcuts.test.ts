import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Settings, Shortcut } from '../src/shared/api'

const held = vi.hoisted(() => ({ shortcuts: [] as Shortcut[] }))

vi.mock('electron', () => ({ powerMonitor: { on: vi.fn() } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))
vi.mock('../src/main/store', () => ({
  getSettings: () => ({ shortcuts: held.shortcuts }) as unknown as Settings,
  setSettings: (change: Partial<Settings>) => {
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

describe('the shortcuts', () => {
  const start = vi.fn(async () => 'session-1')
  const rename = vi.fn()
  let busy = false

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(at('2026-09-22T09:00:10'))
    held.shortcuts = [morning]
    start.mockClear()
    rename.mockClear()
    busy = false
  })

  afterEach(() => vi.useRealTimers())

  it('starts a conversation with the prompt when a timed one is due, names it, and counts it as run', async () => {
    startShortcuts({ start, rename, busy: () => busy })
    await vi.waitFor(() => expect(rename).toHaveBeenCalled())
    expect(start).toHaveBeenCalledWith({ root: '/p', mode: 'auto', text: 'Review what came in overnight' })
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
    expect(start).toHaveBeenNthCalledWith(1, { root: '/p', mode: 'auto', text: 'Review what came in overnight' })
    expect(start).toHaveBeenNthCalledWith(2, { session: 'session-1', root: '/p', mode: 'auto', text: "/goal today's plan is written" })
  })

  it('keeps a goal only where there is one, trimmed', () => {
    expect(saveShortcut({ ...morning, goal: '  it holds  ' }).goal).toBe('it holds')
    expect(saveShortcut({ ...morning, goal: '   ' }).goal).toBeUndefined()
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
})
