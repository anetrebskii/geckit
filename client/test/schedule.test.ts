import { describe, expect, it } from 'vitest'

import type { CalendarRecurrence, Shortcut } from '../src/shared/api'
import { cronOf, describeCron, drawnStart, dueRun, isCron, isDue, nextRun, nextSet, nextTimed, spreadOf, whenOf } from '../src/shared/schedule'

const at = (text: string): number => new Date(text).getTime()

describe('a timetable', () => {
  it('names the next minute it runs, in local time', () => {
    expect(nextRun('0 9 * * 1-5', at('2026-09-22T10:00'))).toBe(at('2026-09-23T09:00'))
    expect(nextRun('0 9 * * 1-5', at('2026-09-25T09:00'))).toBe(at('2026-09-28T09:00'))
    expect(nextRun('*/15 * * * *', at('2026-09-22T10:07:30'))).toBe(at('2026-09-22T10:15'))
    expect(nextRun('30 * * * *', at('2026-09-22T23:45'))).toBe(at('2026-09-23T00:30'))
    expect(nextRun('0 0 29 2 *', at('2026-09-22T00:00'))).toBe(at('2028-02-29T00:00'))
  })

  it('takes either day where both the day of the month and of the week are given, as cron does', () => {
    expect(nextRun('0 8 1 * 1', at('2026-09-22T10:00'))).toBe(at('2026-09-28T08:00'))
    expect(nextRun('0 8 1 * 0', at('2026-09-28T10:00'))).toBe(at('2026-10-01T08:00'))
    expect(nextRun('0 8 * * 7', at('2026-09-22T10:00'))).toBe(at('2026-09-27T08:00'))
  })

  it('turns down what cron would not take', () => {
    for (const bad of ['', '* * * *', '60 * * * *', '* 24 * * *', '5-1 * * * *', '*/0 * * * *', 'a * * * *', '0 0 31 2 *']) {
      expect(nextRun(bad, at('2026-09-22T10:00'))).toBeUndefined()
    }
    expect(isCron('0 9 * * 1-5')).toBe(true)
    expect(isCron('0 9 * *')).toBe(false)
  })

  it('reads back into the named timetables the editor offers, and anything else stays a cron line', () => {
    const named = ['5 * * * *', '0 9 * * *', '30 18 * * 1-5', '0 9 * * 1']
    for (const cron of named) expect(cronOf(whenOf(cron))).toBe(cron)
    expect(whenOf('0 9 * * 1-5')).toEqual({ kind: 'weekdays', hour: 9, minute: 0 })
    expect(whenOf('0 9 * * 7')).toEqual({ kind: 'week', weekday: 0, hour: 9, minute: 0 })
    expect(whenOf('0 */2 * * *')).toEqual({ kind: 'cron', cron: '0 */2 * * *' })
    expect(describeCron('5 * * * *')).toBe('Every hour at 05 past')
    expect(describeCron('0 9 * * 1')).toMatch(/^Every Monday at 0?9:00/)
    expect(describeCron('0 */2 * * *')).toBe('On cron 0 */2 * * *')
  })
})

describe('a timed shortcut', () => {
  const schedule: Shortcut = {
    id: 's',
    name: 'Morning review',
    root: '/p',
    prompt: 'Review what came in overnight',
    cron: '0 9 * * *',
    mode: 'auto',
    on: true,
    since: at('2026-09-21T09:00'),
  }

  it('is due once its next time has come, and a day missed is one run and not several', () => {
    expect(isDue(schedule, at('2026-09-22T08:59'))).toBe(false)
    expect(isDue(schedule, at('2026-09-22T09:00'))).toBe(true)
    expect(isDue(schedule, at('2026-09-25T14:00'))).toBe(true)
    expect(isDue({ ...schedule, since: at('2026-09-25T14:00') }, at('2026-09-25T14:01'))).toBe(false)
  })

  it('is never due while it is paused, or with no timetable at all', () => {
    expect(isDue({ ...schedule, on: false }, at('2026-09-25T14:00'))).toBe(false)
    const { cron: _cron, ...byHand } = schedule
    expect(isDue(byHand, at('2026-09-25T14:00'))).toBe(false)
    expect(nextTimed(byHand, at('2026-09-25T14:00'))).toBeUndefined()
  })

  it('coalesces custom missed dates only through the last occurrence day and preserves a fixed count', () => {
    const { cron: _cron, ...byHand } = schedule
    const rule: CalendarRecurrence = { start: '2026-09-21', time: '09:00', interval: 1, unit: 'day', weekdays: [1], monthly: 'day', end: { kind: 'after', count: 3 } }
    const custom: Shortcut = { ...byHand, since: at('2026-09-21T08:00'), recurrence: rule }
    expect(isDue(custom, at('2026-09-23T09:00:10'))).toBe(true)
    expect(isDue(custom, at('2026-09-24T00:00'))).toBe(false)
    expect(nextTimed(custom, at('2026-09-22T09:00'))).toBe(at('2026-09-23T09:00'))
    expect(nextTimed(custom, at('2026-09-23T09:00'))).toBeUndefined()
    expect(isDue({ ...custom, since: at('2026-09-23T09:00:10') }, at('2026-09-23T12:00'))).toBe(false)
    expect(isDue({ ...custom, on: false }, at('2026-09-23T09:00'))).toBe(false)
    expect(isDue({ ...custom, cron: '0 9 * * *' }, at('2026-09-23T09:00'))).toBe(false)
    expect(isDue({ ...custom, recurrence: { ...rule, unit: 'year', interval: 10_000 } }, at('2026-09-23T09:00'))).toBe(false)
  })
})

describe('Vary start time', () => {
  const anchor = at('2026-09-22T09:00')
  const shortcut: Shortcut = { id: 'vary-a', name: 'Review', root: '/p', prompt: 'Review', mode: 'auto', on: true, cron: '0 9 * * *', vary: true, since: anchor - 2 * 60 * 60_000 }

  it('draws a stable whole minute within 30 minutes either side, kept through serialization and unrelated edits', () => {
    const chosen = nextTimed(shortcut, shortcut.since) ?? 0
    expect(chosen).toBeGreaterThanOrEqual(anchor - 30 * 60_000)
    expect(chosen).toBeLessThanOrEqual(anchor + 30 * 60_000)
    expect(chosen % 60_000).toBe(0)
    const renamed: Shortcut = { ...shortcut, name: 'Renamed', prompt: 'Changed' }
    expect(nextTimed(renamed, shortcut.since)).toBe(chosen)
    expect(nextTimed(JSON.parse(JSON.stringify(shortcut)) as Shortcut, shortcut.since)).toBe(chosen)
  })

  it('lands either side of the set time across 20 saves, never before the save', () => {
    const offsets = Array.from({ length: 20 }, (_, index) => {
      const since = anchor - (40 + index) * 60_000
      const start = nextTimed({ ...shortcut, since }, since) ?? 0
      expect(start).toBeGreaterThanOrEqual(since + 60_000)
      return (start - anchor) / 60_000
    })
    expect(offsets.every((one) => one >= -30 && one <= 30)).toBe(true)
    expect(offsets.some((one) => one < 0)).toBe(true)
    expect(offsets.some((one) => one > 0)).toBe(true)
    const late = anchor - 10 * 60_000
    for (let index = 0; index < 20; index++) expect(drawnStart({ ...shortcut, id: `late-${String(index)}`, since: late }, anchor)).toBeGreaterThan(late)
  })

  it('caps the spread at a quarter of the gap for hourly and shorter repeats', () => {
    expect(spreadOf(shortcut, anchor, anchor + 86_400_000)).toBe(30 * 60_000)
    expect(spreadOf(shortcut, anchor, anchor + 60 * 60_000)).toBe(15 * 60_000)
    expect(spreadOf(shortcut, anchor, anchor + 15 * 60_000)).toBe(3 * 60_000)
    expect(spreadOf({ vary: false }, anchor, anchor + 86_400_000)).toBe(0)
    const hourly: Shortcut = { ...shortcut, cron: '0 * * * *' }
    for (let index = 0; index < 20; index++) {
      const since = anchor - 60 * 60_000 + index * 60 * 60_000
      const run = dueRun({ ...hourly, since }, since + 2 * 60 * 60_000)
      expect(run).toBeDefined()
      if (run !== undefined) expect(Math.abs(run.start - run.anchor)).toBeLessThanOrEqual(15 * 60_000)
    }
  })

  it('shows the set time, which is past while a varied run is due, and counts a run from its set time once', () => {
    const run = dueRun(shortcut, anchor + 31 * 60_000)
    expect(run?.anchor).toBe(anchor)
    expect(run?.latest).toBe(anchor + 30 * 60_000)
    const later: Shortcut = { ...shortcut, id: 'vary-later' }
    const chosen = Array.from({ length: 40 }, (_, index) => ({ ...later, id: `vary-${String(index)}` })).find((one) => (nextTimed(one, one.since) ?? 0) > anchor + 60_000)
    expect(chosen).toBeDefined()
    if (chosen === undefined) return
    expect(nextSet(chosen, anchor + 30_000)).toBe(anchor)
    const ran: Shortcut = { ...chosen, since: anchor }
    expect(isDue(ran, anchor + 40 * 60_000)).toBe(false)
    expect(nextSet(ran, anchor + 40 * 60_000)).toBe(anchor + 86_400_000)
  })

  it('starts at the set time when not varied, and keeps one-run catch-up and pause', () => {
    const exact: Shortcut = { ...shortcut, vary: false }
    expect(nextTimed(exact, exact.since)).toBe(anchor)
    expect(isDue(shortcut, anchor + 5 * 86_400_000)).toBe(true)
    expect(isDue({ ...shortcut, on: false }, anchor + 5 * 86_400_000)).toBe(false)
    expect(isDue({ ...shortcut, since: anchor + 5 * 86_400_000 }, anchor + 5 * 86_400_000)).toBe(false)
  })

  it('reads the set time in the scheduling computer\'s zone', () => {
    const raw = at('2026-09-22T13:00:00Z')
    const host: Shortcut = { ...shortcut, vary: false, since: raw - 60_000 }
    expect(nextTimed(host, host.since, 'America/New_York')).toBe(raw)
    expect(nextRun('30 2 * * *', at('2026-03-08T06:00:00Z'), 'America/New_York')).toBe(at('2026-03-09T06:30:00Z'))
  })

  it('runs a Scheduled prompt once at its set time and never after its outcome', () => {
    const once: Shortcut = { id: 'once', name: 'Plan', root: '/p', prompt: 'Plan', mode: 'auto', on: true, at: anchor, since: anchor - 3 * 60 * 60_000 }
    expect(nextTimed(once, once.since)).toBe(anchor)
    expect(isDue(once, anchor - 1)).toBe(false)
    expect(isDue(once, anchor)).toBe(true)
    expect(isDue({ ...once, since: anchor + 1 }, anchor + 60_000)).toBe(false)
    expect(isDue({ ...once, outcome: { state: 'missed' } }, anchor + 60_000)).toBe(false)
    const varied: Shortcut = { ...once, vary: true }
    const start = nextTimed(varied, varied.since) ?? 0
    expect(Math.abs(start - anchor)).toBeLessThanOrEqual(30 * 60_000)
  })
})
