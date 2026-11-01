import type { Shortcut } from './api'
import { atTime, calendarDate, civil, localCalendarZone, nextRecurrence, recurrenceEnded } from './recurrence'

/** The five fields of a cron line, and the values each may hold; a weekday of 7 is Sunday, as 0 is. */
const FIELDS = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 7 },
] as const

const PART = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/

interface Timetable {
  readonly minutes: ReadonlySet<number>
  readonly hours: ReadonlySet<number>
  readonly days: ReadonlySet<number>
  readonly months: ReadonlySet<number>
  readonly weekdays: ReadonlySet<number>
  readonly anyDay: boolean
  readonly anyWeekday: boolean
}

function field(text: string, { min, max }: { readonly min: number; readonly max: number }): Set<number> | undefined {
  const values = new Set<number>()
  for (const part of text.split(',')) {
    const found = PART.exec(part)
    if (found === null) return undefined
    const [, range = '', step] = found
    const [from, to] = range === '*' ? [min, max] : range.split('-').map(Number)
    const first = from ?? min
    const last = to ?? (step === undefined ? first : max)
    const by = step === undefined ? 1 : Number(step)
    if (first < min || last > max || first > last || by < 1) return undefined
    for (let value = first; value <= last; value += by) values.add(value)
  }
  return values
}

const timetables = new Map<string, Timetable | undefined>()

function timetable(cron: string): Timetable | undefined {
  if (timetables.has(cron)) return timetables.get(cron)
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return undefined
  const [minutes, hours, days, months, weekdays] = parts.map((part, at) => field(part, FIELDS[at] ?? FIELDS[0]))
  if (minutes === undefined || hours === undefined || days === undefined || months === undefined || weekdays === undefined) return undefined
  if (weekdays.has(7)) weekdays.add(0)
  const table = { minutes, hours, days, months, weekdays, anyDay: parts[2] === '*', anyWeekday: parts[4] === '*' }
  if (timetables.size >= 64) timetables.clear()
  timetables.set(cron, table)
  return table
}

export function isCron(cron: string): boolean {
  return timetable(cron) !== undefined
}

/** Cron's own rule: with both the day of the month and the day of the week given, either will do. */
function onDay(table: Timetable, at: Date, utc = false): boolean {
  const day = table.days.has(utc ? at.getUTCDate() : at.getDate())
  const weekday = table.weekdays.has(utc ? at.getUTCDay() : at.getDay())
  if (!table.anyDay && !table.anyWeekday) return day || weekday
  return day && weekday
}

/** Far enough for the 29th of February. */
const LOOK_AHEAD = 5 * 366 * 24 * 60 * 60_000

export function startWindowError(shortcut: Pick<Shortcut, 'cron' | 'recurrence' | 'startWindowMinutes'>): string | undefined {
  const minutes = shortcut.startWindowMinutes
  if (minutes === undefined) return undefined
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) return 'Enter a whole number from 1 to 1,440.'
  if (typeof shortcut.cron !== 'string' || shortcut.recurrence !== undefined || !isCron(shortcut.cron)) return 'Choose a CRON timetable for a start window.'
  return undefined
}

function selectedStart(shortcut: Pick<Shortcut, 'id' | 'startWindowMinutes'>, anchor: number, following: number | undefined): number {
  let hash = 2166136261
  for (const character of `${shortcut.id}:${String(anchor)}`) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b)
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35)
  hash = (hash ^ (hash >>> 16)) >>> 0
  const minutes = Math.min(shortcut.startWindowMinutes ?? 0, following === undefined ? 1440 : Math.max(0, Math.ceil((following - anchor) / 60_000) - 1))
  return anchor + Math.floor((hash / 4294967296) * (minutes + 1)) * 60_000
}

function pendingAnchor(cron: string, after: number, since: number, minutes: number, zone?: string): number | undefined {
  const table = timetable(cron)
  if (table === undefined) return undefined
  const earliest = Math.max(since + 1, after - minutes * 60_000)
  if (earliest > after) return undefined
  if (zone !== undefined && zone !== localCalendarZone()) {
    const nowWall = civil(after, zone).getTime()
    const earliestWall = civil(earliest, zone).getTime()
    const wall = new Date(Math.max(nowWall, after + earliestWall - earliest))
    wall.setUTCSeconds(0, 0)
    const end = Math.min(nowWall, earliestWall) - 60_000
    for (; wall.getTime() >= end; wall.setUTCMinutes(wall.getUTCMinutes() - 1)) {
      if (!table.months.has(wall.getUTCMonth() + 1) || !onDay(table, wall, true) || !table.hours.has(wall.getUTCHours()) || !table.minutes.has(wall.getUTCMinutes())) continue
      const candidate = atTime(wall, `${String(wall.getUTCHours()).padStart(2, '0')}:${String(wall.getUTCMinutes()).padStart(2, '0')}`, zone)
      if (candidate !== undefined && candidate <= after) return candidate >= earliest ? candidate : undefined
    }
    return undefined
  }
  // Only the latest raw occurrence can still be pending because windows end before the next one.
  for (let time = Math.floor(after / 60_000) * 60_000; time >= earliest; time -= 60_000) {
    const at = new Date(time)
    if (!table.months.has(at.getMonth() + 1) || !onDay(table, at) || !table.hours.has(at.getHours()) || !table.minutes.has(at.getMinutes())) continue
    at.setHours(at.getHours(), at.getMinutes(), 0, 0)
    if (at.getTime() === time) return time
  }
  return undefined
}

/** The first minute after `after` the timetable names, in local time, or nothing for a line cron would not take or a date that never comes. */
export function nextRun(cron: string, after: number, zone?: string): number | undefined {
  const table = timetable(cron)
  if (table === undefined) return undefined
  if (zone !== undefined && zone !== localCalendarZone()) {
    const at = civil(after, zone)
    at.setUTCSeconds(0, 0)
    at.setUTCMinutes(at.getUTCMinutes() + 1)
    const end = at.getTime() + LOOK_AHEAD
    while (at.getTime() <= end) {
      if (!table.months.has(at.getUTCMonth() + 1)) {
        at.setUTCMonth(at.getUTCMonth() + 1, 1)
        at.setUTCHours(0, 0, 0, 0)
      } else if (!onDay(table, at, true)) {
        at.setUTCDate(at.getUTCDate() + 1)
        at.setUTCHours(0, 0, 0, 0)
      } else if (!table.hours.has(at.getUTCHours())) {
        at.setUTCHours(at.getUTCHours() + 1, 0, 0, 0)
      } else if (!table.minutes.has(at.getUTCMinutes())) {
        at.setUTCMinutes(at.getUTCMinutes() + 1, 0, 0)
      } else {
        const candidate = atTime(at, `${String(at.getUTCHours()).padStart(2, '0')}:${String(at.getUTCMinutes()).padStart(2, '0')}`, zone)
        if (candidate !== undefined && candidate > after) return candidate
        at.setUTCMinutes(at.getUTCMinutes() + 1)
      }
    }
    return undefined
  }
  const at = new Date(after)
  at.setSeconds(0, 0)
  at.setMinutes(at.getMinutes() + 1)
  while (at.getTime() - after <= LOOK_AHEAD) {
    if (!table.months.has(at.getMonth() + 1)) {
      at.setMonth(at.getMonth() + 1, 1)
      at.setHours(0, 0, 0, 0)
    } else if (!onDay(table, at)) {
      at.setDate(at.getDate() + 1)
      at.setHours(0, 0, 0, 0)
    } else if (!table.hours.has(at.getHours())) {
      at.setHours(at.getHours() + 1, 0, 0, 0)
    } else if (!table.minutes.has(at.getMinutes())) {
      at.setMinutes(at.getMinutes() + 1, 0, 0)
    } else {
      return at.getTime()
    }
  }
  return undefined
}

/** When a shortcut next runs by itself, or nothing for one run by hand or paused. */
export function nextTimed(shortcut: Pick<Shortcut, 'id' | 'on' | 'since' | 'cron' | 'recurrence' | 'startWindowMinutes'>, after: number, zone?: string): number | undefined {
  if (!shortcut.on || startWindowError(shortcut) !== undefined) return undefined
  if (shortcut.recurrence !== undefined) return shortcut.cron === undefined ? nextRecurrence(shortcut.recurrence, Math.max(shortcut.since, after), zone) : undefined
  if (shortcut.cron === undefined) return undefined
  if (shortcut.startWindowMinutes !== undefined) {
    const pending = pendingAnchor(shortcut.cron, after, shortcut.since, shortcut.startWindowMinutes, zone)
    if (pending !== undefined) {
      const chosen = selectedStart(shortcut, pending, nextRun(shortcut.cron, pending, zone))
      if (chosen > after) return chosen
    }
  }
  const cronZone = shortcut.startWindowMinutes === undefined ? undefined : zone
  const anchor = nextRun(shortcut.cron, Math.max(shortcut.since, after), cronZone)
  return anchor === undefined || shortcut.startWindowMinutes === undefined ? anchor : selectedStart(shortcut, anchor, nextRun(shortcut.cron, anchor, cronZone))
}

export function describeStartWindow(shortcut: Pick<Shortcut, 'startWindowMinutes'>): string {
  return shortcut.startWindowMinutes === undefined ? '' : `Random start within ${String(shortcut.startWindowMinutes)} minutes`
}

/** A run missed while the machine slept or the app was closed is one run once it is back, as launchd does it. */
export function isDue(shortcut: Shortcut, now: number): boolean {
  if (shortcut.recurrence !== undefined && recurrenceEnded(shortcut.recurrence, now)) return false
  const next = nextTimed(shortcut, shortcut.since)
  return next !== undefined && next <= now
}

/** The timetables the editor offers by name; anything else is edited as the cron line itself. */
export type When =
  | { readonly kind: 'hour'; readonly minute: number }
  | { readonly kind: 'day' | 'weekdays'; readonly hour: number; readonly minute: number }
  | { readonly kind: 'week'; readonly weekday: number; readonly hour: number; readonly minute: number }
  | { readonly kind: 'cron'; readonly cron: string }

const NUMBER = '([0-9]|[1-5][0-9])'
const HOUR = '([0-9]|1[0-9]|2[0-3])'

export function whenOf(cron: string): When {
  const line = cron.trim().replace(/\s+/g, ' ')
  const hourly = new RegExp(`^${NUMBER} \\* \\* \\* \\*$`).exec(line)
  if (hourly !== null) return { kind: 'hour', minute: Number(hourly[1]) }
  const daily = new RegExp(`^${NUMBER} ${HOUR} \\* \\* (\\*|1-5|[0-7])$`).exec(line)
  if (daily === null) return { kind: 'cron', cron: line }
  const [, minute, hour, weekday = '*'] = daily
  const time = { hour: Number(hour), minute: Number(minute) }
  if (weekday === '*') return { kind: 'day', ...time }
  if (weekday === '1-5') return { kind: 'weekdays', ...time }
  return { kind: 'week', weekday: Number(weekday) % 7, ...time }
}

export function cronOf(when: When): string {
  switch (when.kind) {
    case 'hour':
      return `${String(when.minute)} * * * *`
    case 'day':
      return `${String(when.minute)} ${String(when.hour)} * * *`
    case 'weekdays':
      return `${String(when.minute)} ${String(when.hour)} * * 1-5`
    case 'week':
      return `${String(when.minute)} ${String(when.hour)} * * ${String(when.weekday)}`
    case 'cron':
      return when.cron.trim()
  }
}

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const clock = (hour: number, minute: number): string =>
  new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** "Every weekday at 9:00", or the cron line where it is not one of the named timetables. */
export function describeCron(cron: string): string {
  const when = whenOf(cron)
  switch (when.kind) {
    case 'hour':
      return `Every hour at ${String(when.minute).padStart(2, '0')} past`
    case 'day':
      return `Every day at ${clock(when.hour, when.minute)}`
    case 'weekdays':
      return `Every weekday at ${clock(when.hour, when.minute)}`
    case 'week':
      return `Every ${WEEKDAYS[when.weekday] ?? ''} at ${clock(when.hour, when.minute)}`
    case 'cron':
      return `On cron ${when.cron}`
  }
}

/** "Today at 9:00", "Tomorrow at 9:00", "Mon 29 Sep at 9:00". */
const timeFormatters = new Map<string, Intl.DateTimeFormat>()
const dayFormatters = new Map<string, Intl.DateTimeFormat>()
function timeFormatter(zone: string | undefined, day: boolean): Intl.DateTimeFormat {
  const cache = day ? dayFormatters : timeFormatters
  const key = zone ?? ''
  const found = cache.get(key)
  if (found !== undefined) return found
  const made = new Intl.DateTimeFormat(undefined, { ...(zone === undefined ? {} : { timeZone: zone }), ...(day ? { weekday: 'short', day: 'numeric', month: 'short' } as const : { hour: 'numeric', minute: '2-digit' } as const) })
  if (cache.size >= 16) cache.clear()
  cache.set(key, made)
  return made
}

export function describeTime(at: number, now: number, zone?: string): string {
  const date = new Date(at)
  const days = zone === undefined ? Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000) : (new Date(calendarDate(at, zone)).getTime() - new Date(calendarDate(now, zone)).getTime()) / 86_400_000
  const day =
    days === 0
      ? 'Today'
      : days === 1
        ? 'Tomorrow'
        : days === -1
          ? 'Yesterday'
          : timeFormatter(zone, true).format(date)
  return `${day} at ${timeFormatter(zone, false).format(date)}`
}
