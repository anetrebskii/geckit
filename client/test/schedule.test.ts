import { describe, expect, it } from 'vitest'

import type { CalendarRecurrence, Shortcut } from '../src/shared/api'
import { cronOf, describeCron, describeStartWindow, isCron, isDue, nextRun, nextTimed, startWindowError, whenOf } from '../src/shared/schedule'

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

describe('a CRON start window', () => {
  const anchor = at('2026-09-22T09:00')
  const shortcut: Shortcut = { id: 'window-a', name: 'Review', root: '/p', prompt: 'Review', mode: 'auto', on: true, cron: '0 9 * * *', startWindowMinutes: 60, since: anchor - 60_000 }

  it('chooses a stable whole minute within the window, including through serialization and unrelated edits', () => {
    const chosen = nextTimed(shortcut, shortcut.since)
    expect(chosen).toBeGreaterThanOrEqual(anchor)
    expect(chosen).toBeLessThanOrEqual(anchor + 60 * 60_000)
    expect((chosen ?? 1) % 60_000).toBe(0)
    const renamed: Shortcut = { ...shortcut, name: 'Renamed', prompt: 'Changed' }
    expect(nextTimed(renamed, shortcut.since)).toBe(chosen)
    expect(nextTimed(JSON.parse(JSON.stringify(shortcut)) as Shortcut, shortcut.since)).toBe(chosen)
    expect(describeStartWindow(shortcut)).toBe('Random start within 60 minutes')
  })

  it('varies across occurrences and shortcut identities without requiring unique consecutive minutes', () => {
    const days = Array.from({ length: 20 }, (_, index) => {
      const since = shortcut.since + index * 86_400_000
      return ((nextTimed({ ...shortcut, since }, since) ?? 0) - (anchor + index * 86_400_000)) / 60_000
    })
    const identities = Array.from({ length: 20 }, (_, index) => nextTimed({ ...shortcut, id: `window-${String(index)}` }, shortcut.since))
    expect(new Set(days).size).toBeGreaterThan(1)
    expect(new Set(identities).size).toBeGreaterThan(1)
  })

  it('keeps the pending chosen minute after the raw CRON minute, and consumes it only once', () => {
    const chosen = nextTimed(shortcut, shortcut.since) ?? 0
    expect(chosen).toBeGreaterThan(anchor + 60_000)
    expect(nextTimed(shortcut, anchor + 60_000)).toBe(chosen)
    expect(nextTimed(shortcut, chosen - 1)).toBe(chosen)
    expect(isDue(shortcut, chosen - 1)).toBe(false)
    expect(isDue(shortcut, chosen)).toBe(true)
    const consumed: Shortcut = { ...shortcut, since: chosen + 20_000 }
    expect(isDue(consumed, chosen + 40_000)).toBe(false)
    expect(nextTimed(consumed, chosen + 40_000)).toBeGreaterThan(anchor + 86_400_000 - 1)
  })

  it('caps overlapping windows before the next raw occurrence, including every-minute CRON', () => {
    const frequent: Shortcut = { ...shortcut, cron: '*/15 * * * *', startWindowMinutes: 1440 }
    for (let index = 0; index < 20; index++) {
      const since = shortcut.since + index * 15 * 60_000
      const next = nextTimed({ ...frequent, since }, since)
      expect(next).toBeGreaterThanOrEqual(anchor + index * 15 * 60_000)
      expect(next).toBeLessThan(anchor + (index + 1) * 15 * 60_000)
    }
    const minute: Shortcut = { ...shortcut, cron: '* * * * *', startWindowMinutes: 1440 }
    expect(nextTimed(minute, shortcut.since)).toBe(anchor)
    expect(nextTimed(minute, anchor + 10_000)).toBe(anchor + 60_000)
  })

  it('retains one-run catch-up, pause and manual-run semantics', () => {
    expect(isDue(shortcut, anchor + 5 * 86_400_000)).toBe(true)
    expect(isDue({ ...shortcut, on: false }, anchor + 5 * 86_400_000)).toBe(false)
    const manual: Shortcut = { ...shortcut, lastRun: anchor }
    expect(nextTimed(manual, shortcut.since)).toBe(nextTimed(shortcut, shortcut.since))
    expect(isDue({ ...shortcut, since: anchor + 5 * 86_400_000 }, anchor + 5 * 86_400_000)).toBe(false)
  })

  it('shows the same host-zone chosen instant on a phone in another zone', () => {
    const raw = at('2026-09-22T13:00:00Z')
    const host: Shortcut = { ...shortcut, since: raw - 60_000 }
    const chosen = nextTimed(host, host.since, 'America/New_York') ?? 0
    expect(chosen).toBeGreaterThan(raw + 60_000)
    expect(chosen).toBeLessThanOrEqual(raw + 60 * 60_000)
    expect(nextTimed(host, raw + 60_000, 'America/New_York')).toBe(chosen)
    expect(nextRun(host.cron ?? '', host.since, 'America/New_York')).toBe(raw)
    expect(nextTimed({ ...host, startWindowMinutes: 1440, cron: '* * * * *' }, host.since, 'America/New_York')).toBe(raw)
  })

  it('keeps pending windows across midnight and a repeated daylight-saving hour', () => {
    const midnight: Shortcut = { ...shortcut, cron: '0 23 * * *', startWindowMinutes: 1440, since: at('2026-09-22T22:59:00Z') }
    const midnightChosen = nextTimed(midnight, midnight.since, 'UTC') ?? 0
    expect(midnightChosen).toBeGreaterThan(at('2026-09-23T00:00:00Z'))
    expect(nextTimed(midnight, at('2026-09-23T00:00:00Z'), 'UTC')).toBe(midnightChosen)

    const fall: Shortcut = { ...shortcut, cron: '30 1 * * *', startWindowMinutes: 120, since: at('2026-11-01T05:29:00Z') }
    const windows = Array.from({ length: 30 }, (_, index) => ({ ...fall, id: `fall-${String(index)}` }))
    const repeated = windows.find((one) => {
      const chosen = nextTimed(one, one.since, 'America/New_York') ?? 0
      return chosen > at('2026-11-01T06:15:00Z') && chosen < at('2026-11-01T06:30:00Z')
    })
    expect(repeated).toBeDefined()
    if (repeated === undefined) return
    const chosen = nextTimed(repeated, repeated.since, 'America/New_York')
    expect(nextTimed(repeated, at('2026-11-01T06:10:00Z'), 'America/New_York')).toBe(chosen)
    expect(nextRun(fall.cron ?? '', at('2026-11-01T05:30:00Z'), 'America/New_York')).toBe(at('2026-11-02T06:30:00Z'))
    expect(nextRun('30 2 * * *', at('2026-03-08T06:00:00Z'), 'America/New_York')).toBe(at('2026-03-09T06:30:00Z'))
  })

  it('refuses malformed persisted windows rather than silently running at an exact time', () => {
    for (const minutes of [0, -1, 1.5, 1441, Number.NaN, Number.POSITIVE_INFINITY]) {
      const invalid = { ...shortcut, startWindowMinutes: minutes }
      expect(startWindowError(invalid)).toBe('Enter a whole number from 1 to 1,440.')
      expect(nextTimed(invalid, shortcut.since)).toBeUndefined()
      expect(isDue(invalid, anchor + 86_400_000)).toBe(false)
    }
    const { cron: _cron, ...manual } = shortcut
    expect(startWindowError(manual)).toContain('CRON timetable')
    expect(nextTimed(manual, shortcut.since)).toBeUndefined()
    expect(startWindowError({ ...shortcut, startWindowMinutes: 1 })).toBeUndefined()
    expect(startWindowError({ ...shortcut, startWindowMinutes: 1440 })).toBeUndefined()
  })
})
