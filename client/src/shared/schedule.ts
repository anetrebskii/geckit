import type { Shortcut } from './api'

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

function timetable(cron: string): Timetable | undefined {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return undefined
  const [minutes, hours, days, months, weekdays] = parts.map((part, at) => field(part, FIELDS[at] ?? FIELDS[0]))
  if (minutes === undefined || hours === undefined || days === undefined || months === undefined || weekdays === undefined) return undefined
  if (weekdays.has(7)) weekdays.add(0)
  return { minutes, hours, days, months, weekdays, anyDay: parts[2] === '*', anyWeekday: parts[4] === '*' }
}

export function isCron(cron: string): boolean {
  return timetable(cron) !== undefined
}

/** Cron's own rule: with both the day of the month and the day of the week given, either will do. */
function onDay(table: Timetable, at: Date): boolean {
  const day = table.days.has(at.getDate())
  const weekday = table.weekdays.has(at.getDay())
  if (!table.anyDay && !table.anyWeekday) return day || weekday
  return day && weekday
}

/** Far enough for the 29th of February. */
const LOOK_AHEAD = 5 * 366 * 24 * 60 * 60_000

/** The first minute after `after` the timetable names, in local time, or nothing for a line cron would not take or a date that never comes. */
export function nextRun(cron: string, after: number): number | undefined {
  const table = timetable(cron)
  if (table === undefined) return undefined
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
export function nextTimed(shortcut: Shortcut, after: number): number | undefined {
  return shortcut.on && shortcut.cron !== undefined ? nextRun(shortcut.cron, Math.max(shortcut.since, after)) : undefined
}

/** A run missed while the machine slept or the app was closed is one run once it is back, as launchd does it. */
export function isDue(shortcut: Shortcut, now: number): boolean {
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
export function describeTime(at: number, now: number): string {
  const date = new Date(at)
  const days = Math.round((new Date(at).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000)
  const day =
    days === 0
      ? 'Today'
      : days === 1
        ? 'Tomorrow'
        : days === -1
          ? 'Yesterday'
          : date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })
  return `${day} at ${clock(date.getHours(), date.getMinutes())}`
}
