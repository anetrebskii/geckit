import { describe, expect, it } from 'vitest'

import type { Shortcut } from '../src/shared/api'
import { cronOf, describeCron, isCron, isDue, nextRun, nextTimed, whenOf } from '../src/shared/schedule'

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
})
