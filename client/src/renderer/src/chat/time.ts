/** Times the way this computer writes them. */

const DAY = 86_400_000
const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const DATE_YEAR = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'short' })

const sameDay = (one: number, other: number): boolean => new Date(one).toDateString() === new Date(other).toDateString()

const date = (at: number, now: number): string =>
  (new Date(at).getFullYear() === new Date(now).getFullYear() ? DATE : DATE_YEAR).format(at)

/** When a message was said: the time today, with the day before that. */
export function stamp(at: number, now: number): string {
  if (sameDay(at, now)) return TIME.format(at)
  if (sameDay(at, now - DAY)) return `Yesterday ${TIME.format(at)}`
  return `${date(at, now)}, ${TIME.format(at)}`
}

/**
 * When a conversation last changed, as short as a row in a list allows.
 * Under a heading that already says Yesterday, yesterday is its clock time.
 */
export function ago(at: number, now: number, dayHeaded = false): string {
  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${String(minutes)}m`
  if (sameDay(at, now)) return TIME.format(at)
  if (sameDay(at, now - DAY)) return dayHeaded ? TIME.format(at) : 'Yesterday'
  if (now - at < 6 * DAY) return WEEKDAY.format(at)
  return date(at, now)
}
