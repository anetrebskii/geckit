import type { Shortcut, ShortcutDraft } from './api'
import { atTime, civil, localCalendarZone } from './recurrence'

export type PromptKind = 'repeating' | 'scheduled' | 'shortcut'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
/** A run whose latest start passed longer ago than this while GeckIt was not running is Missed, not run. */
export const CATCH_UP = 12 * HOUR
/** How long a run stays in "Ran today". */
export const RAN_KEPT = DAY
export const UNDO_FOR = 6_000

/** A set moment makes a prompt Scheduled, a timetable Repeating, neither a Shortcut; the kind is never stored. */
export function kindOf(prompt: Pick<Shortcut, 'at' | 'cron' | 'recurrence'>): PromptKind {
  if (prompt.at !== undefined) return 'scheduled'
  return prompt.cron !== undefined || prompt.recurrence !== undefined ? 'repeating' : 'shortcut'
}

export function kindError(was: Pick<Shortcut, 'at' | 'cron' | 'recurrence'> | undefined, draft: Pick<ShortcutDraft, 'at' | 'cron' | 'recurrence'>): string | undefined {
  if (draft.at !== undefined && (draft.cron !== undefined || draft.recurrence !== undefined)) return 'Choose one timetable.'
  if (was !== undefined && kindOf(was) !== kindOf(draft)) return 'This prompt cannot change its kind.'
  return undefined
}

export function onceError(at: number, now: number): string | undefined {
  return !Number.isFinite(at) || at < now + MINUTE - 1_000 ? 'Pick a time from now on.' : undefined
}

const zoneOf = (zone?: string): string => zone ?? localCalendarZone()
const pad = (value: number): string => String(value).padStart(2, '0')

/** The moment `day` (a civil date, its UTC fields the wall date) reads `hour`:`minute` in `zone`; an hour that a clock change skips moves on by one. */
function wallMoment(day: Date, hour: number, minute: number, zone?: string): number {
  return atTime(day, `${pad(hour)}:${pad(minute)}`, zoneOf(zone)) ?? atTime(day, `${pad(hour + 1)}:${pad(minute)}`, zoneOf(zone)) ?? day.getTime() + hour * HOUR + minute * MINUTE
}

/** The civil date of `at`, midnight UTC, so days are counted the same in every zone. */
export function civilDay(at: number, zone?: string): Date {
  const wall = civil(at, zoneOf(zone))
  wall.setUTCHours(0, 0, 0, 0)
  return wall
}

const addDays = (day: Date, days: number): Date => new Date(day.getTime() + days * DAY)
const daysBetween = (from: Date, to: Date): number => Math.round((to.getTime() - from.getTime()) / DAY)

/** `day` at the wall time `at` has. */
export function movedTo(at: number, day: Date, zone?: string): number {
  const wall = civil(at, zoneOf(zone))
  return wallMoment(day, wall.getUTCHours(), wall.getUTCMinutes(), zone)
}

export function wallTime(at: number, zone?: string): { readonly hour: number; readonly minute: number } {
  const wall = civil(at, zoneOf(zone))
  return { hour: wall.getUTCHours(), minute: wall.getUTCMinutes() }
}

export const clockText = (at: number, zone?: string): string => {
  const { hour, minute } = wallTime(at, zone)
  return `${pad(hour)}:${pad(minute)}`
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const MONTH_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const WEEKDAY_HEADS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** "Thu 19 Nov" for a civil day. */
export const dayText = (day: Date): string => `${WEEKDAY_SHORT[day.getUTCDay()] ?? ''} ${String(day.getUTCDate())} ${MONTH_SHORT[day.getUTCMonth()] ?? ''}`

/** "Today", "Tomorrow" or "Fri 21 Nov". */
export function dayName(at: number, now: number, zone?: string): string {
  const day = civilDay(at, zone)
  const days = daysBetween(civilDay(now, zone), day)
  return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : dayText(day)
}

/** The Scheduled lead: "Today 15:30", "Tomorrow 10:00", "Fri 21 Nov 10:00". */
export const scheduledLead = (at: number, now: number, zone?: string): string => `${dayName(at, now, zone)} ${clockText(at, zone)}`

/** "In 40 min", "In 18 h", "In 3 days", or "Due" once the set time has passed. */
export function scheduledWhen(at: number, now: number, zone?: string): string {
  if (at <= now) return 'Due'
  const minutes = Math.ceil((at - now) / MINUTE)
  if (minutes < 60) return `In ${String(minutes)} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24 || daysBetween(civilDay(now, zone), civilDay(at, zone)) <= 1) return `In ${String(hours)} h`
  return `In ${String(daysBetween(civilDay(now, zone), civilDay(at, zone)))} days`
}

export interface PostponeChoice {
  readonly label: string
  readonly at: number
}

/** "In 1 hour", "This evening, 18:00" before 17:00, "Tomorrow, 09:00", "Monday, 09:00" or "Next Monday, 09:00" on Mondays. */
export function postponeChoices(now: number, zone?: string): readonly PostponeChoice[] {
  const today = civilDay(now, zone)
  const { hour } = wallTime(now, zone)
  const weekday = today.getUTCDay()
  const toMonday = weekday === 1 ? 7 : (8 - weekday) % 7 || 7
  return [
    { label: 'In 1 hour', at: Math.ceil((now + HOUR) / MINUTE) * MINUTE },
    ...(hour < 17 ? [{ label: 'This evening, 18:00', at: wallMoment(today, 18, 0, zone) }] : []),
    { label: 'Tomorrow, 09:00', at: wallMoment(addDays(today, 1), 9, 0, zone) },
    { label: weekday === 1 ? 'Next Monday, 09:00' : 'Monday, 09:00', at: wallMoment(addDays(today, toMonday), 9, 0, zone) },
  ]
}

/** A new Scheduled prompt's time: tomorrow 09:00. */
export const defaultOnce = (now: number, zone?: string): number => wallMoment(addDays(civilDay(now, zone), 1), 9, 0, zone)

/** A run created on `day` from the calendar: 09:00, or the next whole hour when that is today and 09:00 has passed. */
export function onDay(day: Date, now: number, zone?: string): number {
  const nine = wallMoment(day, 9, 0, zone)
  if (nine > now + MINUTE) return nine
  const { hour } = wallTime(now, zone)
  return wallMoment(day, hour + 1, 0, zone)
}

export const isProblem = (prompt: Pick<Shortcut, 'outcome'>): boolean => prompt.outcome?.state === 'didnt-start' || prompt.outcome?.state === 'missed'

/** How many Scheduled runs need Alex: Didn't start plus Missed. */
export const needYou = (prompts: readonly Pick<Shortcut, 'at' | 'outcome'>[]): number => prompts.filter((one) => one.at !== undefined && isProblem(one)).length
export const needYouSaid = (count: number): string => `${String(count)} need you`

/** The line under a Scheduled row that needs Alex. */
export function problemLine(prompt: Pick<Shortcut, 'outcome'>): string | undefined {
  if (prompt.outcome?.state === 'didnt-start') return `Didn't start: ${prompt.outcome.reason}.`
  if (prompt.outcome?.state === 'missed') return "Missed. GeckIt wasn't running."
  return undefined
}

/** What to do with a Scheduled run due at `now`: run it, late when past its latest start, or call it missed past the catch-up window. */
export function catchUp(latest: number, now: number): { readonly run: true; readonly lateMinutes?: number } | { readonly run: false } {
  if (now - latest > CATCH_UP) return { run: false }
  const late = Math.floor((now - latest) / MINUTE)
  return late >= 2 ? { run: true, lateMinutes: late } : { run: true }
}

/** "Ran 09:12" or "Ran 09:12, 40 min late". */
export function ranLine(outcome: Extract<Shortcut['outcome'], { state: 'ran' }>, zone?: string): string {
  return `Ran ${clockText(outcome.started, zone)}${outcome.lateMinutes === undefined ? '' : `, ${String(outcome.lateMinutes)} min late`}`
}

/** A new prompt of the same kind with every setting but the history, named "{name} copy"; a Scheduled time already past moves to the next day at the same time. */
export function duplicateDraft(prompt: Shortcut | ShortcutDraft, now: number, zone?: string): ShortcutDraft {
  const { id: _id, since: _since, lastRun: _lastRun, lastSession: _lastSession, outcome: _outcome, postponedFrom: _postponedFrom, startWindowMinutes: _window, ...kept } = prompt as Shortcut & ShortcutDraft
  const draft: ShortcutDraft = { ...kept, name: `${prompt.name} copy` }
  if (draft.at === undefined) return draft
  let at = draft.at
  while (onceError(at, now) !== undefined) at = movedTo(at, addDays(civilDay(at, zone), 1), zone)
  return { ...draft, at }
}

/** A Scheduled copy of a Shortcut, for Run later...: tomorrow 09:00, varied. */
export function runLaterDraft(prompt: Shortcut, now: number, zone?: string): ShortcutDraft {
  const { id: _id, since: _since, lastRun: _lastRun, lastSession: _lastSession, outcome: _outcome, postponedFrom: _postponedFrom, cron: _cron, recurrence: _recurrence, ...kept } = prompt
  return { ...kept, at: defaultOnce(now, zone), vary: true, on: true }
}

/** Schedule again from "Ran today": the same prompt tomorrow at the same time. */
export function againDraft(prompt: Shortcut, now: number, zone?: string): ShortcutDraft {
  const { id: _id, since: _since, lastRun: _lastRun, lastSession: _lastSession, outcome: _outcome, postponedFrom: _postponedFrom, ...kept } = prompt
  const at = movedTo(prompt.at ?? defaultOnce(now, zone), addDays(civilDay(now, zone), 1), zone)
  return { ...kept, at }
}

/** The days of the week holding `day`, Monday first. */
export function weekOf(day: Date): readonly Date[] {
  const back = (day.getUTCDay() + 6) % 7
  return Array.from({ length: 7 }, (_, index) => addDays(day, index - back))
}

/** Six rows of weeks covering the month of `day`, Monday first. */
export function monthGrid(day: Date): readonly Date[] {
  const first = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1))
  const start = addDays(first, -((first.getUTCDay() + 6) % 7))
  const last = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0))
  const weeks = Math.ceil((daysBetween(start, last) + 1) / 7)
  return Array.from({ length: weeks * 7 }, (_, index) => addDays(start, index))
}

export const shiftDays = addDays
export const shiftMonths = (day: Date, months: number): Date => new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + months, 1))

/** "November 2026", or "Nov – Dec 2026" when the week spans two months. */
export function weekHeading(days: readonly Date[]): string {
  const first = days[0] ?? new Date(0)
  const last = days[days.length - 1] ?? first
  if (first.getUTCMonth() === last.getUTCMonth()) return `${MONTH_LONG[first.getUTCMonth()] ?? ''} ${String(first.getUTCFullYear())}`
  const year = first.getUTCFullYear() === last.getUTCFullYear() ? '' : ` ${String(first.getUTCFullYear())}`
  return `${MONTH_SHORT[first.getUTCMonth()] ?? ''}${year} – ${MONTH_SHORT[last.getUTCMonth()] ?? ''} ${String(last.getUTCFullYear())}`
}

export const sameDay = (left: Date, right: Date): boolean => left.getTime() === right.getTime()

/** The moment the editor's Date and Time fields name, NaN when the date is not one. */
export function onceFrom(date: string, time: string, zone?: string): number {
  const day = new Date(`${date}T00:00:00Z`)
  const [hour = Number.NaN, minute = Number.NaN] = time.split(':').map(Number)
  return Number.isFinite(day.getTime()) && Number.isFinite(hour) && Number.isFinite(minute) ? wallMoment(day, hour, minute, zone) : Number.NaN
}

/** "2026-11-19" for the editor's Date field. */
export const dateField = (at: number, zone?: string): string => civilDay(at, zone).toISOString().slice(0, 10)

/** A saved prompt as the editor saves it, its history left to the service. */
export function asDraft(prompt: Shortcut): ShortcutDraft {
  const { since: _since, lastRun: _lastRun, lastSession: _lastSession, outcome: _outcome, postponedFrom: _postponedFrom, ...kept } = prompt
  return kept
}
