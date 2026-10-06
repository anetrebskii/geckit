import type { ChatSession } from '../../../shared/api'

/** Times the way this computer writes them. */

const DAY = 86_400_000
const TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const DATE = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const DATE_YEAR = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'short' })
const DAY_HEAD = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
const DAY_HEAD_YEAR = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

const sameDay = (one: number, other: number): boolean => new Date(one).toDateString() === new Date(other).toDateString()

/** The clock time alone, "2:41 PM", for a tooltip that says when something was last true rather than how long ago. */
export const clockTime = (at: number): string => TIME.format(at)

const date = (at: number, now: number): string =>
  (new Date(at).getFullYear() === new Date(now).getFullYear() ? DATE : DATE_YEAR).format(at)

/** How long until something happens, in the largest whole unit: "23h", "40m". */
export function left(at: number, now: number): string {
  const minutes = Math.max(1, Math.ceil((at - now) / 60_000))
  return minutes < 60 ? `${String(minutes)}m` : `${String(Math.floor(minutes / 60))}h`
}

const answering = (question: ChatSession): boolean => question.state === 'working' || question.state === 'asks'

/** When a general question goes: a day after its last answer, which one still being answered has not had yet. */
export function deletedIn(question: ChatSession, now: number): string {
  if (question.stays === true) return 'Kept'
  if (answering(question)) return 'Deleted a day after it answers'
  return `Deleted in ${left(question.goes ?? question.at + DAY, now)}`
}

/** What a general question has left, "23h left", or nothing while it is being answered. */
export function questionLeft(question: ChatSession, now: number): string | undefined {
  return answering(question) || question.stays === true ? undefined : `${left(question.goes ?? question.at + DAY, now)} left`
}

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

/** The day a conversation last changed, as a heading: Today, Yesterday, then the date itself. */
function dayOf(at: number, today: string, yesterday: string, year: number): string {
  const said = new Date(at)
  const day = said.toDateString()
  if (day === today) return 'Today'
  if (day === yesterday) return 'Yesterday'
  return (said.getFullYear() === year ? DAY_HEAD : DAY_HEAD_YEAR).format(said)
}

/** The cards under the day they were last touched, the newest day first, or all of them under nothing. */
export function byDay(
  rows: readonly ChatSession[],
  now: number,
  wanted: boolean,
): { readonly heading: string; readonly rows: readonly ChatSession[] }[] {
  if (!wanted) return [{ heading: '', rows }]
  const today = new Date(now).toDateString()
  const yesterday = new Date(now - DAY).toDateString()
  const year = new Date(now).getFullYear()
  const days: { heading: string; rows: ChatSession[] }[] = []
  for (const session of rows) {
    const heading = dayOf(session.statusAt ?? session.at, today, yesterday, year)
    const last = days.at(-1)
    if (last?.heading === heading) last.rows.push(session)
    else days.push({ heading, rows: [session] })
  }
  return days
}
