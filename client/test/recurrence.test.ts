import { describe, expect, it, vi } from 'vitest'

import type { CalendarRecurrence } from '../src/shared/api'
import { defaultRecurrence, describeRecurrence, nextRecurrence, recurrenceEnded, recurrenceError, sameRecurrence } from '../src/shared/recurrence'

const at = (text: string): number => new Date(text).getTime()
const weekly: CalendarRecurrence = { start: '2026-10-13', time: '09:00', interval: 2, unit: 'week', weekdays: [2, 4], monthly: 'day', end: { kind: 'never' } }
const zone = 'UTC'

describe('calendar recurrence', () => {
  it('anchors selected days to Monday-start weeks and excludes dates before start', () => {
    expect(nextRecurrence(weekly, at('2026-10-12T00:00Z'), zone)).toBe(at('2026-10-13T09:00Z'))
    expect(nextRecurrence(weekly, at('2026-10-13T09:00Z'), zone)).toBe(at('2026-10-15T09:00Z'))
    expect(nextRecurrence(weekly, at('2026-10-15T09:00Z'), zone)).toBe(at('2026-10-27T09:00Z'))
    expect(nextRecurrence({ ...weekly, weekdays: [1, 2] }, at('2026-10-12T00:00Z'), zone)).toBe(at('2026-10-13T09:00Z'))
    expect(describeRecurrence(weekly)).toBe('Every 2 weeks on Tuesday and Thursday at 09:00')
    expect(describeRecurrence({ ...weekly, unit: 'year' })).toBe('Every 2 years on Oct 13 at 09:00')
  })

  it('skips absent monthly and yearly dates and selects ordinal and last weekdays', () => {
    const month: CalendarRecurrence = { ...weekly, start: '2026-01-31', interval: 1, unit: 'month' }
    expect(nextRecurrence(month, at('2026-01-31T09:00Z'), zone)).toBe(at('2026-03-31T09:00Z'))
    expect(nextRecurrence({ ...weekly, interval: 1, unit: 'month', monthly: 'ordinal' }, at('2026-10-13T09:00Z'), zone)).toBe(at('2026-11-10T09:00Z'))
    expect(nextRecurrence({ ...weekly, interval: 1, unit: 'month', monthly: 'last' }, at('2026-10-13T09:00Z'), zone)).toBe(at('2026-10-27T09:00Z'))
    expect(nextRecurrence({ ...month, monthly: 'ordinal' }, at('2026-01-31T09:00Z'), zone)).toBe(at('2026-05-30T09:00Z'))
    expect(nextRecurrence({ ...weekly, start: '2024-02-29', interval: 1, unit: 'year' }, at('2024-02-29T09:00Z'), zone)).toBe(at('2028-02-29T09:00Z'))
    expect(nextRecurrence({ ...weekly, start: '2026-10-13', interval: 12, unit: 'year' }, at('2026-10-13T09:00Z'), zone)).toBe(at('2038-10-13T09:00Z'))
  })

  it('limits eligible dates and expires after the final local day', () => {
    const after: CalendarRecurrence = { ...weekly, end: { kind: 'after', count: 3 } }
    expect(nextRecurrence(after, at('2026-10-15T09:00Z'), zone)).toBe(at('2026-10-27T09:00Z'))
    expect(nextRecurrence(after, at('2026-10-27T09:00Z'), zone)).toBeUndefined()
    expect(recurrenceEnded(after, at('2026-10-27T09:00:10Z'), zone)).toBe(false)
    expect(recurrenceEnded(after, at('2026-10-28T00:00Z'), zone)).toBe(true)
    const through: CalendarRecurrence = { ...weekly, end: { kind: 'on', date: '2026-10-15' } }
    expect(nextRecurrence(through, at('2026-10-13T09:00Z'), zone)).toBe(at('2026-10-15T09:00Z'))
    expect(nextRecurrence(through, at('2026-10-15T09:00Z'), zone)).toBeUndefined()
    expect(recurrenceEnded(through, at('2026-10-16T00:00Z'), zone)).toBe(true)
  })

  it('uses the scheduling computer zone, skips gaps and counts a fold once', () => {
    const daily: CalendarRecurrence = { ...weekly, start: '2026-03-07', time: '02:30', interval: 1, unit: 'day', end: { kind: 'after', count: 2 } }
    expect(nextRecurrence(daily, at('2026-03-07T08:00Z'), 'America/New_York')).toBe(at('2026-03-09T06:30Z'))
    expect(nextRecurrence(daily, at('2026-03-09T06:30Z'), 'America/New_York')).toBeUndefined()
    const fold: CalendarRecurrence = { ...daily, start: '2026-11-01', time: '01:30', end: { kind: 'never' } }
    expect(nextRecurrence(fold, at('2026-11-01T00:00Z'), 'America/New_York')).toBe(at('2026-11-01T05:30Z'))
    expect(nextRecurrence(fold, at('2026-11-01T05:30Z'), 'America/New_York')).toBe(at('2026-11-02T06:30Z'))
    expect(defaultRecurrence(at('2026-10-12T23:00Z'), '09:00', 'Europe/Samara').start).toBe('2026-10-13')
    expect(nextRecurrence(weekly, at('2026-10-12T23:00Z'), 'Europe/Samara')).toBe(at('2026-10-13T05:00Z'))
  })

  it('rejects invalid and impossible rules with actionable errors', () => {
    expect(recurrenceError({ ...weekly, start: '2026-02-31' }, zone)).toBe('Choose a start date and time.')
    expect(recurrenceError({ ...weekly, interval: 0.5 }, zone)).toBe('Enter a whole number of 1 or more.')
    expect(recurrenceError({ ...weekly, weekdays: [] }, zone)).toBe('Choose at least one day.')
    expect(recurrenceError({ ...weekly, end: { kind: 'on', date: '2026-10-12' } }, zone)).toBe('Choose an end date on or after the start date.')
    expect(recurrenceError({ ...weekly, weekdays: [1], end: { kind: 'on', date: '2026-10-13' } }, zone)).toBe('This recurrence has no occurrences.')
    expect(recurrenceError({ ...weekly, end: { kind: 'after', count: 10_001 } }, zone)).toBe('Enter a whole number from 1 to 10,000.')
    expect(recurrenceError({ ...weekly, interval: 10_000, unit: 'year', end: { kind: 'after', count: 2 } }, zone)).toBe('This recurrence extends beyond year 9999.')
    expect(recurrenceError({ ...weekly, start: '2026-10-13', time: '00:00', end: { kind: 'on', date: '2026-10-13' } }, zone)).toBeUndefined()
    const malformed = { ...weekly }
    Object.defineProperty(malformed, 'weekdays', { value: null })
    expect(nextRecurrence(malformed, Date.now(), zone)).toBeUndefined()
    expect(describeRecurrence(malformed)).toBe('Custom recurrence')
  })

  it('retains finite endpoints for more than 64 immutable rules and reuses them on repeated list queries', () => {
    const rules: CalendarRecurrence[] = Array.from({ length: 65 }, (_item, index) => ({ ...weekly, start: new Date(Date.UTC(2026, 9, 13 + index)).toISOString().slice(0, 10), interval: 1, unit: 'day', end: { kind: 'after', count: 100 } }))
    const parts = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts')
    try {
      for (const rule of rules) nextRecurrence(rule, at('2026-10-13T00:00Z'), 'America/New_York')
      const cold = parts.mock.calls.length
      parts.mockClear()
      for (const rule of rules) nextRecurrence(rule, at('2026-10-13T00:00Z'), 'America/New_York')
      expect(parts.mock.calls.length).toBeLessThan(cold / 10)
    } finally { parts.mockRestore() }
  })

  it('requires matching saved recurrence fields while allowing reordered properties and weekdays', () => {
    const rule: CalendarRecurrence = { ...weekly, end: { kind: 'after', count: 13 } }
    const { end: _end, weekdays: _days, ...rest } = rule
    expect(sameRecurrence(rule, { end: { count: 13, kind: 'after' }, weekdays: [4, 2], ...rest })).toBe(true)
    expect(sameRecurrence(rule, undefined)).toBe(false)
    expect(sameRecurrence(undefined, rule)).toBe(false)
    expect(sameRecurrence(undefined, undefined)).toBe(true)
    expect(sameRecurrence(rule, { ...rule, time: '10:00' })).toBe(false)
    expect(sameRecurrence(rule, { ...rule, weekdays: [2] })).toBe(false)
    expect(sameRecurrence(rule, { ...rule, end: { kind: 'after', count: 12 } })).toBe(false)
    expect(sameRecurrence(rule, { ...rule, end: { kind: 'never' } })).toBe(false)
    const through: CalendarRecurrence = { ...rule, end: { kind: 'on', date: '2027-01-01' } }
    expect(sameRecurrence(through, { ...through })).toBe(true)
    expect(sameRecurrence(through, { ...through, end: { kind: 'on', date: '2027-01-02' } })).toBe(false)
    expect(sameRecurrence(weekly, { ...weekly })).toBe(true)
  })
})
