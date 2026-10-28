import type { ChatSession, SessionImage } from './api'

/** What the gecko shows: the floating panel and the tray follow the same three, and a hop on review comes on top. */
export type GeckoPose = 'asleep' | 'working' | 'waiting'

export interface GeckoState {
  readonly pose: GeckoPose
  /** The conversations waiting for the person, the one that has waited longest first. */
  readonly waiting: readonly string[]
  /** A card has just reached In review, with nothing waiting: the gecko hops once. */
  readonly review: boolean
}

/** What the floating panel is told: its pose, and how many wait for the count. */
export interface GeckoView {
  readonly pose: GeckoPose
  readonly count: number
}

type Counted = Pick<ChatSession, 'id' | 'state' | 'at' | 'status' | 'waits' | 'runs' | 'typing' | 'tasks' | 'question' | 'manager'>

/** On the board's In progress, as the board counts it: a general question and the manager's own are on no board. */
const inProgress = (one: Counted): boolean => one.question !== true && one.manager !== true && one.status !== 'review' && one.status !== 'done'

/** Its turn is over but a helper it started still runs, which wakes it again: not waiting yet, as on the board. */
const onHelpers = (one: Counted): boolean =>
  (one.state === 'idle' || one.state === 'unread') && (one.tasks?.some((task) => task.status === 'running' && task.kind !== 'local_bash' && task.kind !== 'monitor') ?? false)

/** Asking, finished and unread, or a command after ! waiting to be typed into. An error or a card marked Blocked is the card's to say. */
function waitsForYou(one: Counted): boolean {
  if (one.state === 'working' || one.waits === true || onHelpers(one)) return false
  if (one.runs !== undefined) return one.typing === true
  return one.state === 'asks' || one.state === 'unread'
}

/** The one state of every conversation listed, with `before` the list as it was, so a card arriving in In review is seen. Waiting wins over everything. */
export function geckoState(now: readonly Counted[], before: readonly Counted[] = []): GeckoState {
  const counted = now.filter(inProgress)
  const waiting = counted.filter(waitsForYou).sort((one, other) => one.at - other.at).map((one) => one.id)
  const was = new Map(before.map((one) => [one.id, one.status]))
  const review = waiting.length === 0 && now.some((one) => one.status === 'review' && was.has(one.id) && was.get(one.id) !== 'review')
  const pose = waiting.length > 0 ? 'waiting' : counted.some((one) => one.state === 'working') ? 'working' : 'asleep'
  return { pose, waiting, review }
}

/** What the bubble asks, worked out by main when it opens: files dropped on the gecko, how many wait, and whether a screenshot can be taken here. */
export interface GeckoBubble {
  readonly files: number
  readonly waiting: number
  readonly screenshot: boolean
}

/** A choice in the bubble. */
export type GeckoChoice = 'screenshot' | 'task' | 'waiting' | 'open' | 'cancel'

/** Files dropped on the gecko, for a new task or a conversation: the pictures to go with the message, and the paths of the rest for its words. */
export interface GeckoHanded {
  readonly images: readonly SessionImage[]
  readonly paths: readonly string[]
}
