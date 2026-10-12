import type { CalendarRecurrence } from './api'

const DAY = 86_400_000
const LAST_DATE = Date.UTC(9999, 11, 31)
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export const RECURRENCE_DAYS = [1, 2, 3, 4, 5, 6, 0] as const
const zones = new Map<string, Intl.DateTimeFormat>()
const endpoints = new WeakMap<CalendarRecurrence, { readonly zone: string; readonly final: number | undefined }>()
const dateLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const yearlyLabel = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })

function formatter(zone: string): Intl.DateTimeFormat {
  const kept = zones.get(zone)
  if (kept !== undefined) return kept
  const made = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  if (zones.size >= 16) zones.clear()
  zones.set(zone, made)
  return made
}

let zoneAt = 0
let currentZone = 'UTC'
export function localCalendarZone(): string {
  if (Date.now() - zoneAt >= 60_000 || Date.now() < zoneAt || zoneAt === 0) {
    currentZone = Intl.DateTimeFormat().resolvedOptions().timeZone
    zoneAt = Date.now()
  }
  return currentZone
}

function civil(at: number, zone: string): Date {
  const parts = formatter(zone).formatToParts(at)
  const value = (key: Intl.DateTimeFormatPartTypes): number => Number(parts.find((one) => one.type === key)?.value)
  const date = new Date(0)
  date.setUTCFullYear(value('year'), value('month') - 1, value('day'))
  date.setUTCHours(value('hour'), value('minute'), value('second'), 0)
  return date
}

export function calendarDate(at: number, zone = localCalendarZone()): string {
  return civil(at, zone).toISOString().slice(0, 10)
}

function dateOf(text: string): Date | undefined {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text) || text.startsWith('0000')) return undefined
  const date = new Date(`${text}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? date : undefined
}

function atTime(date: Date, time: string, zone: string): number | undefined {
  const [hour = 0, minute = 0] = time.split(':').map(Number)
  const wanted = new Date(date)
  wanted.setUTCHours(hour, minute, 0, 0)
  if (zone === localCalendarZone()) {
    const local = new Date(0)
    local.setFullYear(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    local.setHours(hour, minute, 0, 0)
    return local.getFullYear() === date.getUTCFullYear() && local.getMonth() === date.getUTCMonth() && local.getDate() === date.getUTCDate() && local.getHours() === hour && local.getMinutes() === minute ? local.getTime() : undefined
  }
  const target = wanted.getTime()
  const matches: number[] = []
  for (const around of [target - DAY, target, target + DAY]) {
    const offset = civil(around, zone).getTime() - around
    const candidate = target - offset
    if (civil(candidate, zone).getTime() === target) matches.push(candidate)
  }
  return matches.length === 0 ? undefined : Math.min(...matches)
}

function firstError(rule: CalendarRecurrence): string | undefined {
  if (rule === null || typeof rule !== 'object' || dateOf(rule.start) === undefined || typeof rule.time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(rule.time)) return 'Choose a start date and time.'
  if (!Number.isSafeInteger(rule.interval) || rule.interval < 1) return 'Enter a whole number of 1 or more.'
  if (!['day', 'week', 'month', 'year'].includes(rule.unit)) return 'Choose a recurrence unit.'
  if (!Array.isArray(rule.weekdays) || rule.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || (rule.unit === 'week' && rule.weekdays.length === 0)) return 'Choose at least one day.'
  if (!['day', 'ordinal', 'last'].includes(rule.monthly)) return 'Choose a monthly pattern.'
  if (rule.end === null || typeof rule.end !== 'object') return 'Choose an end condition.'
  switch (rule.end.kind) {
    case 'never': return undefined
    case 'on': return dateOf(rule.end.date) === undefined || rule.end.date < rule.start ? 'Choose an end date on or after the start date.' : undefined
    case 'after': return !Number.isSafeInteger(rule.end.count) || rule.end.count < 1 || rule.end.count > 10_000 ? 'Enter a whole number from 1 to 10,000.' : undefined
    default: return 'Choose an end condition.'
  }
}

function periodDates(rule: CalendarRecurrence, start: Date, period: number): readonly Date[] {
  const date = new Date(start)
  if (rule.unit === 'day') date.setUTCDate(date.getUTCDate() + period * rule.interval)
  else if (rule.unit === 'week') {
    date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7 + period * rule.interval * 7)
    return [...new Set(rule.weekdays)].sort((a, b) => (a + 6) % 7 - (b + 6) % 7).map((day) => {
      const chosen = new Date(date)
      chosen.setUTCDate(chosen.getUTCDate() + (day + 6) % 7)
      return chosen
    }).filter((one) => one >= start && one.getTime() <= LAST_DATE)
  } else {
    const month = start.getUTCMonth() + (rule.unit === 'month' ? period * rule.interval : 0)
    const year = start.getUTCFullYear() + (rule.unit === 'year' ? period * rule.interval : 0)
    date.setUTCFullYear(year, month, 1)
    if (rule.unit === 'month' && rule.monthly !== 'day') {
      const weekday = start.getUTCDay()
      if (rule.monthly === 'last') {
        date.setUTCMonth(date.getUTCMonth() + 1, 0)
        date.setUTCDate(date.getUTCDate() - (date.getUTCDay() - weekday + 7) % 7)
      } else {
        date.setUTCDate(1 + (weekday - date.getUTCDay() + 7) % 7 + Math.floor((start.getUTCDate() - 1) / 7) * 7)
      }
    } else date.setUTCDate(start.getUTCDate())
    const expectedMonth = ((month % 12) + 12) % 12
    if (date.getUTCMonth() !== expectedMonth) return []
  }
  return Number.isFinite(date.getTime()) && date >= start && date.getTime() <= LAST_DATE ? [date] : []
}

function periodAt(rule: CalendarRecurrence, start: Date, date: Date): number {
  const elapsed = rule.unit === 'day' ? (date.getTime() - start.getTime()) / DAY
    : rule.unit === 'week' ? (date.getTime() - start.getTime()) / (7 * DAY)
      : rule.unit === 'month' ? (date.getUTCFullYear() - start.getUTCFullYear()) * 12 + date.getUTCMonth() - start.getUTCMonth()
        : date.getUTCFullYear() - start.getUTCFullYear()
  return Math.max(0, Math.floor(elapsed / rule.interval) - 1)
}

function candidates(rule: CalendarRecurrence, after: number, zone: string, count?: number): number | undefined {
  const start = dateOf(rule.start)
  if (start === undefined) return undefined
  const afterDate = civil(after, zone)
  afterDate.setUTCHours(0, 0, 0, 0)
  const from = count === undefined ? periodAt(rule, start, afterDate) : 0
  const last = periodAt(rule, start, new Date(LAST_DATE)) + 3
  let seen = 0
  for (let period = from; period <= last; period += 1) {
    for (const date of periodDates(rule, start, period)) {
      if (rule.end.kind === 'on' && date.getTime() > (dateOf(rule.end.date)?.getTime() ?? 0)) return undefined
      const at = atTime(date, rule.time, zone)
      if (at === undefined) continue
      seen += 1
      if (count !== undefined) {
        if (seen === count) return at
      } else if (at > after) return at
    }
  }
  return undefined
}

function finalOccurrence(rule: CalendarRecurrence, zone: string): number | undefined {
  if (rule.end.kind !== 'after') return undefined
  const kept = endpoints.get(rule)
  if (kept?.zone === zone) return kept.final
  const final = candidates(rule, 0, zone, rule.end.count)
  endpoints.set(rule, { zone, final })
  return final
}

export function recurrenceError(rule: CalendarRecurrence, zone = localCalendarZone()): string | undefined {
  const error = firstError(rule)
  if (error !== undefined) return error
  const start = dateOf(rule.start)
  if (start === undefined || candidates(rule, (atTime(start, '00:00', zone) ?? start.getTime() - DAY) - 1, zone) === undefined) return 'This recurrence has no occurrences.'
  if (rule.end.kind === 'after' && finalOccurrence(rule, zone) === undefined) return 'This recurrence extends beyond year 9999.'
  return undefined
}

export function sameRecurrence(left: CalendarRecurrence | undefined, right: CalendarRecurrence | undefined): boolean {
  if (left === undefined || right === undefined) return left === right
  if (firstError(left) !== undefined || firstError(right) !== undefined) return false
  if (left.start !== right.start || left.time !== right.time || left.interval !== right.interval || left.unit !== right.unit || left.monthly !== right.monthly) return false
  const leftDays = new Set(left.weekdays)
  const rightDays = new Set(right.weekdays)
  if (leftDays.size !== rightDays.size || [...leftDays].some((day) => !rightDays.has(day))) return false
  if (left.end.kind === 'never') return right.end.kind === 'never'
  if (left.end.kind === 'on') return right.end.kind === 'on' && left.end.date === right.end.date
  return right.end.kind === 'after' && left.end.count === right.end.count
}

export function nextRecurrence(rule: CalendarRecurrence, after: number, zone = localCalendarZone()): number | undefined {
  if (firstError(rule) !== undefined) return undefined
  const next = candidates(rule, after, zone)
  if (next === undefined) return undefined
  if (rule.end.kind !== 'after') return next
  const final = finalOccurrence(rule, zone)
  return final === undefined || next > final ? undefined : next
}

export function recurrenceEnded(rule: CalendarRecurrence, now: number, zone = localCalendarZone()): boolean {
  if (firstError(rule) !== undefined) return true
  if (rule.end.kind === 'on') return calendarDate(now, zone) > rule.end.date
  if (rule.end.kind === 'after') {
    const final = finalOccurrence(rule, zone)
    return final === undefined || calendarDate(now, zone) > calendarDate(final, zone)
  }
  return false
}

export function defaultRecurrence(now: number, time = '09:00', zone = localCalendarZone()): CalendarRecurrence {
  const start = calendarDate(now, zone)
  return { start, time, interval: 1, unit: 'week', weekdays: [dateOf(start)?.getUTCDay() ?? 1], monthly: 'day', end: { kind: 'never' } }
}

export function monthlyLabels(rule: Pick<CalendarRecurrence, 'start'>): readonly string[] {
  const start = dateOf(rule.start)
  if (start === undefined) return ['Monthly on a date', 'Monthly on a weekday', 'Monthly on the last weekday']
  const ordinal = ['first', 'second', 'third', 'fourth', 'fifth'][Math.floor((start.getUTCDate() - 1) / 7)] ?? 'first'
  return [`Monthly on day ${String(start.getUTCDate())}`, `Monthly on the ${ordinal} ${DAYS[start.getUTCDay()] ?? ''}`, `Monthly on the last ${DAYS[start.getUTCDay()] ?? ''}`]
}

export function describeRecurrence(rule: CalendarRecurrence): string {
  if (firstError(rule) !== undefined) return 'Custom recurrence'
  const unit = rule.interval === 1 ? rule.unit : `${rule.interval} ${rule.unit}s`
  const days = RECURRENCE_DAYS.filter((day) => rule.weekdays.includes(day)).map((day) => DAYS[day])
  const dayNames = days.length <= 2 ? days.join(' and ') : `${days.slice(0, -1).join(', ')} and ${days.at(-1) ?? ''}`
  const pattern = rule.unit === 'week' ? ` on ${dayNames}` : rule.unit === 'month' ? ` ${monthlyLabels(rule)[rule.monthly === 'day' ? 0 : rule.monthly === 'ordinal' ? 1 : 2]?.replace('Monthly ', '') ?? ''}` : rule.unit === 'year' ? ` on ${yearlyLabel.format(dateOf(rule.start))}` : ''
  const end = rule.end.kind === 'after' ? `, after ${String(rule.end.count)} occurrences` : rule.end.kind === 'on' ? `, through ${dateLabel.format(dateOf(rule.end.date))}` : ''
  return `Every ${unit}${pattern} at ${rule.time}${end}`
}
