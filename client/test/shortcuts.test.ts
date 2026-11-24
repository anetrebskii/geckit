import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CalendarRecurrence, Settings, Shortcut } from '../src/shared/api'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import { nextTimed } from '../src/shared/schedule'

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

  it('keeps the conversations its runs started, newest first, and keeps them through a save', async () => {
    const { cron: _cron, ...byHand } = morning
    held.shortcuts = [{ ...byHand, runSessions: [{ session: 'older', at: 1 }] }]
    startShortcuts({ start, rename, busy: () => busy })
    start.mockResolvedValueOnce('session-2')
    await runShortcut('m', 'hand')
    await runShortcut('m', 'hand')
    const now = at('2026-09-22T09:00:10')
    expect(held.shortcuts[0]?.runSessions).toEqual([{ session: 'session-1', at: now }, { session: 'session-2', at: now }, { session: 'older', at: 1 }])
    saveShortcut({ ...byHand, name: 'Renamed' })
    expect(held.shortcuts[0]?.runSessions).toHaveLength(3)
  })

  it('starts each run with its checklist, and an older goal as a one-item checklist', async () => {
    const checklist = { items: [{ id: 'a', title: 'Inbox read', check: 'none' as const }, { id: 'b', title: 'Plan written', check: 'person' as const }] }
    held.shortcuts = [{ ...morning, checklist }]
    expect(await runShortcut('m', 'hand')).toBe('session-1')
    expect(start).toHaveBeenCalledExactlyOnceWith({ root: '/p', mode: 'auto', text: 'Review what came in overnight', provider: 'claude', checklist })
    start.mockClear()
    held.shortcuts = [{ ...morning, goal: "today's plan is written" }]
    await runShortcut('m', 'hand')
    expect(start).toHaveBeenCalledExactlyOnceWith({ root: '/p', mode: 'auto', text: 'Review what came in overnight', provider: 'claude', checklist: { items: [{ id: 'goal', title: "today's plan is written", check: 'none' }] } })
  })

  it('saves a checklist without states, an older goal as one item, and nothing when both are empty', () => {
    expect(saveShortcut({ ...morning, checklist: { items: [{ id: 'a', title: ' Done ', check: 'none', state: 'passed' }] } }).checklist).toEqual({ items: [{ id: 'a', title: 'Done', check: 'none' }] })
    const old = saveShortcut({ ...morning, goal: '  it holds  ' })
    expect(old.goal).toBeUndefined()
    expect(old.checklist?.items.map((one) => one.title)).toEqual(['it holds'])
    expect(saveShortcut({ ...morning, goal: '   ', checklist: { items: [] } }).checklist).toBeUndefined()
  })

  it('saves and runs a Codex shortcut with its model and reasoning by hand and timetable', async () => {
    saveShortcut({ ...morning, provider: 'codex', model: 'codex-model', reasoning: 'high', goal: 'Tests pass' })
    expect(held.shortcuts[0]).toMatchObject({ provider: 'codex', model: 'codex-model', reasoning: 'high', checklist: { items: [{ id: 'goal', title: 'Tests pass', check: 'none' }] } })
    startShortcuts({ start, rename, busy: () => busy })
    await vi.waitFor(() => expect(start).toHaveBeenCalled())
    expect(start).toHaveBeenCalledExactlyOnceWith({ root: '/p', mode: 'auto', text: morning.prompt, provider: 'codex', model: 'codex-model', reasoning: 'high', checklist: { items: [{ id: 'goal', title: 'Tests pass', check: 'none' }] } })
    start.mockClear()
    await runShortcut('m', 'hand')
    expect(start).toHaveBeenCalledExactlyOnceWith({ root: '/p', mode: 'auto', text: morning.prompt, provider: 'codex', model: 'codex-model', reasoning: 'high', checklist: { items: [{ id: 'goal', title: 'Tests pass', check: 'none' }] } })
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
    expect(start).toHaveBeenCalledExactlyOnceWith({ root: '/p', mode: 'auto', text: morning.prompt, provider: 'codex', checklist: { items: [{ id: 'goal', title: 'An old Claude goal', check: 'none' }] } })
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
    expect(() => saveShortcut(byHand)).toThrow('This prompt cannot change its kind.')
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

  it('runs a varied start once across polling and manual starts, then catches up once after downtime', async () => {
    const candidates = Array.from({ length: 40 }, (_, index): Shortcut => ({ ...morning, id: `vary-${String(index)}`, since: at('2026-09-22T08:00'), vary: true }))
    const varied = candidates.find((one) => (nextTimed(one, one.since) ?? 0) > at('2026-09-22T09:02'))
    expect(varied).toBeDefined()
    if (varied === undefined) return
    held.shortcuts = [varied]
    const chosen = nextTimed(varied, varied.since) ?? 0
    startShortcuts({ start, rename, busy: () => busy })
    await vi.advanceTimersByTimeAsync(20_000)
    expect(start).not.toHaveBeenCalled()
    await runShortcut(varied.id, 'hand')
    expect(held.shortcuts[0]?.since).toBe(varied.since)
    vi.setSystemTime(chosen - 21_000)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(start).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(20_000)
    expect(start).toHaveBeenCalledTimes(2)
    expect(held.shortcuts[0]?.since).toBeGreaterThanOrEqual(at('2026-09-22T09:00'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(start).toHaveBeenCalledTimes(2)
    vi.setSystemTime(at('2026-09-28T12:00'))
    await vi.advanceTimersByTimeAsync(60_000)
    expect(start).toHaveBeenCalledTimes(3)
  })

  it('keeps the drawn start for unrelated edits and draws again for a timing change, the switch or a resume', () => {
    const varied: Shortcut = { ...morning, vary: true }
    held.shortcuts = [varied]
    const chosen = nextTimed(varied, Date.now())
    const renamed = saveShortcut({ ...varied, name: 'Changed name', prompt: 'Changed prompt' })
    expect(renamed.since).toBe(varied.since)
    expect(nextTimed(renamed, Date.now())).toBe(chosen)
    expect(saveShortcut({ ...renamed, vary: false }).since).toBe(Date.now())
    vi.setSystemTime(at('2026-09-22T10:00'))
    expect(saveShortcut({ ...renamed, cron: '0 11 * * *' }).since).toBe(Date.now())
    const paused = saveShortcut({ ...morning, vary: true, on: false })
    vi.setSystemTime(at('2026-09-22T12:00'))
    expect(saveShortcut({ ...paused, on: true }).since).toBe(Date.now())
  })

  it('takes an older client\'s start window as Vary start time, and never a kind change', () => {
    expect(saveShortcut({ ...morning, startWindowMinutes: 60 }).vary).toBe(true)
    const { cron: _cron, ...manual } = morning
    const { id: _id, ...fresh } = manual
    expect(saveShortcut({ ...fresh, startWindowMinutes: 30 }).vary).toBeUndefined()
    held.shortcuts = [morning]
    expect(() => saveShortcut({ ...manual, id: 'm' })).toThrow('cannot change its kind')
    expect(() => saveShortcut({ ...manual, id: 'm', at: Date.now() + 3_600_000 })).toThrow('cannot change its kind')
  })

  describe('a Scheduled prompt', () => {
    const notice = vi.fn()
    const { cron: _cron, ...byHand } = morning
    const once = (change: Partial<Shortcut> = {}): Shortcut => ({ ...byHand, id: 'once', at: at('2026-09-22T09:00'), since: at('2026-09-21T12:00'), ...change })
    const clean = (one: Shortcut): Shortcut => one
    beforeEach(() => notice.mockClear())

    it('starts at its time and records that it ran, once', async () => {
      held.shortcuts = [clean(once())]
      startShortcuts({ start, rename, busy: () => busy, notice })
      await vi.waitFor(() => expect(held.shortcuts[0]?.outcome?.state).toBe('ran'))
      expect(held.shortcuts[0]?.outcome).toMatchObject({ state: 'ran', session: 'session-1' })
      await vi.advanceTimersByTimeAsync(60_000)
      expect(start).toHaveBeenCalledTimes(1)
      expect(notice).not.toHaveBeenCalled()
    })

    it('says why it did not start, with one notice, and is never dropped', async () => {
      held.chatProviders = ['codex']
      held.shortcuts = [clean(once())]
      startShortcuts({ start, rename, busy: () => busy, notice })
      await vi.waitFor(() => expect(held.shortcuts[0]?.outcome?.state).toBe('didnt-start'))
      expect(held.shortcuts[0]?.outcome).toEqual({ state: 'didnt-start', reason: "Claude isn't available" })
      expect(notice).toHaveBeenCalledExactlyOnceWith("Morning review didn't start", "Claude isn't available. Run it or postpone it in Scheduled.")
      await vi.advanceTimersByTimeAsync(60_000)
      expect(notice).toHaveBeenCalledTimes(1)
      expect(start).not.toHaveBeenCalled()
    })

    it('runs late within 12 hours and is missed after, without running', async () => {
      vi.setSystemTime(at('2026-09-22T10:00'))
      held.shortcuts = [clean(once())]
      startShortcuts({ start, rename, busy: () => busy, notice })
      await vi.waitFor(() => expect(held.shortcuts[0]?.outcome?.state).toBe('ran'))
      expect(held.shortcuts[0]?.outcome).toMatchObject({ lateMinutes: 60 })
      start.mockClear()
      vi.setSystemTime(at('2026-09-22T21:01'))
      held.shortcuts = [clean(once())]
      startShortcuts({ start, rename, busy: () => busy, notice })
      expect(held.shortcuts[0]?.outcome).toEqual({ state: 'missed' })
      expect(start).not.toHaveBeenCalled()
    })

    it('postpones to a new time, keeping the first set time and clearing a problem', async () => {
      const { postponeShortcut } = await import('../src/main/shortcuts')
      held.shortcuts = [clean(once({ outcome: { state: 'missed' } }))]
      const moved = postponeShortcut('once', at('2026-09-23T09:00'))
      expect(moved).toMatchObject({ at: at('2026-09-23T09:00'), postponedFrom: at('2026-09-22T09:00'), since: Date.now() })
      expect(moved.outcome).toBeUndefined()
      expect(postponeShortcut('once', at('2026-09-24T09:00')).postponedFrom).toBe(at('2026-09-22T09:00'))
      expect(() => postponeShortcut('once', Date.now())).toThrow('Pick a time from now on.')
      expect(() => postponeShortcut('m', at('2026-09-24T09:00'))).toThrow()
    })

    it('records a run by hand and forgets a ran prompt after 24 hours', async () => {
      held.shortcuts = [clean(once({ at: at('2026-09-23T09:00') }))]
      startShortcuts({ start, rename, busy: () => busy, notice })
      expect(await runShortcut('once', 'hand')).toBe('session-1')
      expect(held.shortcuts[0]?.outcome).toMatchObject({ state: 'ran' })
      vi.setSystemTime(Date.now() + 24 * 60 * 60_000 + 60_000)
      await vi.advanceTimersByTimeAsync(20_000)
      expect(held.shortcuts).toEqual([])
    })
  })

  it('persists Manager targets and uses its real routing dependency for hand and cron runs', async () => {
    const manager = vi.fn(async () => 'manager-session')
    held.shortcuts = [{ ...morning, cron: '0 9 * * *', since: at('2026-09-22T08:00'), target: 'manager', provider: 'codex', model: 'unused', reasoning: 'high', goal: 'unused' }]
    held.chatProviders = []
    const saved = saveShortcut(held.shortcuts[0] ?? morning)
    expect(saved).toMatchObject({ target: 'manager', cron: '0 9 * * *' })
    expect(saved.provider).toBeUndefined()
    expect(saved.model).toBeUndefined()
    expect(saved.reasoning).toBeUndefined()
    expect(saved.goal).toBeUndefined()
    expect(saved.checklist).toBeUndefined()
    startShortcuts({ start, rename, busy: () => false, manager })
    await vi.waitFor(() => expect(manager).toHaveBeenCalledTimes(1))
    expect(start).not.toHaveBeenCalled()
    expect(rename).not.toHaveBeenCalled()
    expect(held.shortcuts[0]?.lastSession).toBe('manager-session')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(manager).toHaveBeenCalledTimes(1)
    expect(await runShortcut('m', 'hand')).toBe('manager-session')
    expect(manager).toHaveBeenCalledTimes(2)
  })

  it('shares concurrent Manager runs, never invents a timetable, and never resurrects deleted shortcuts', async () => {
    let admit: ((id: string) => void) | undefined
    const manager = vi.fn(() => new Promise<string>((resolve) => { admit = resolve }))
    const { cron: _cron, ...manual } = morning
    held.shortcuts = [{ ...manual, target: 'manager' }]
    startShortcuts({ start, rename, busy: () => false, manager })
    await vi.advanceTimersByTimeAsync(20_000)
    expect(manager).not.toHaveBeenCalled()
    const first = runShortcut('m', 'hand')
    const second = runShortcut('m', 'hand')
    expect(first).toBe(second)
    expect(manager).toHaveBeenCalledTimes(1)
    expect(held.shortcuts[0]?.cron).toBeUndefined()
    held.shortcuts = []
    admit?.('manager-session')
    expect(await first).toBe('manager-session')
    expect(held.shortcuts).toEqual([])
  })

  it('does not fall back to worker execution when Manager admission fails or is unsupported', async () => {
    held.shortcuts = [{ ...morning, target: 'manager' }]
    startShortcuts({ start, rename, busy: () => false })
    expect(await runShortcut('m', 'hand')).toBeUndefined()
    expect(start).not.toHaveBeenCalled()
    const manager = vi.fn(async (): Promise<string> => { throw new Error('Manager is disabled') })
    startShortcuts({ start, rename, busy: () => false, manager })
    expect(await runShortcut('m', 'hand')).toBeUndefined()
    expect(start).not.toHaveBeenCalled()
    expect(held.shortcuts[0]?.lastSession).toBeUndefined()
  })

  it('clears the old target session and ignores late receipts after a target edit', async () => {
    let admit: ((id: string) => void) | undefined
    const manager = vi.fn(() => new Promise<string>((resolve) => { admit = resolve }))
    const { cron: _cron, ...manual } = morning
    held.shortcuts = [{ ...manual, lastSession: 'old-worker' }]
    const changed = saveShortcut({ ...manual, target: 'manager' })
    expect(changed.lastSession).toBeUndefined()
    startShortcuts({ start, rename, busy: () => true, manager })
    const pending = runShortcut('m', 'hand')
    expect(manager).toHaveBeenCalledTimes(1)
    saveShortcut(manual)
    admit?.('manager-session')
    expect(await pending).toBe('manager-session')
    expect(held.shortcuts[0]?.target).toBeUndefined()
    expect(held.shortcuts[0]?.lastSession).toBeUndefined()
  })

})
