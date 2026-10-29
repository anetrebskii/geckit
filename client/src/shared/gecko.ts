import { inProgress as onBoard } from './api'
import type { ChatSession, SessionImage } from './api'

/** What the gecko shows: the floating panel and the tray follow the same three, and a hop on a goal reached comes on top. */
export type GeckoPose = 'asleep' | 'working' | 'waiting'

export interface GeckoState {
  readonly pose: GeckoPose
  /** The conversations waiting for the person, the one that has waited longest first. */
  readonly waiting: readonly string[]
  /** A card's goal has just been reached, with nothing waiting: the gecko hops once. */
  readonly reached: boolean
}

/** What the floating panel is told: its pose, and how many wait for the count. */
export interface GeckoView {
  readonly pose: GeckoPose
  readonly count: number
}

type Counted = Pick<ChatSession, 'id' | 'state' | 'at' | 'status' | 'goalMet' | 'waits' | 'runs' | 'typing' | 'tasks' | 'question' | 'manager'>

/** On the board's In progress, as the board counts it: a general question and the manager's own are on no board. */
const inProgress = (one: Counted): boolean => one.question !== true && one.manager !== true && onBoard(one.status)

/** Its turn is over but a helper it started still runs, which wakes it again: not waiting yet, as on the board. */
const onHelpers = (one: Counted): boolean =>
  (one.state === 'idle' || one.state === 'unread') && (one.tasks?.some((task) => task.status === 'running' && task.kind !== 'local_bash' && task.kind !== 'monitor') ?? false)

/** Asking, finished and unread, or a command after ! waiting to be typed into. An error or a card marked Blocked is the card's to say. */
function waitsForYou(one: Counted): boolean {
  if (one.state === 'working' || one.waits === true || onHelpers(one)) return false
  if (one.runs !== undefined) return one.typing === true
  return one.state === 'asks' || one.state === 'unread'
}

/** The one state of every conversation listed, with `before` the list as it was, so a goal just reached is seen. Working wins: while one works it types, and what waits shows only in its count. */
export function geckoState(now: readonly Counted[], before: readonly Counted[] = []): GeckoState {
  const counted = now.filter(inProgress)
  const waiting = counted.filter(waitsForYou).sort((one, other) => one.at - other.at).map((one) => one.id)
  const was = new Map(before.map((one) => [one.id, one.goalMet]))
  const reached = waiting.length === 0 && now.some((one) => one.goalMet !== undefined && was.has(one.id) && was.get(one.id) !== one.goalMet)
  const pose = counted.some((one) => one.state === 'working') ? 'working' : waiting.length > 0 ? 'waiting' : 'asleep'
  return { pose, waiting, reached }
}

/** Files dropped on the gecko, or words said to it, for a new task or a conversation: the pictures to go with the message, the paths of the rest for its words, and what was said. */
export interface GeckoHanded {
  readonly images: readonly SessionImage[]
  readonly paths: readonly string[]
  readonly text?: string
}

/** What the gecko is drawn doing: its state, or what the person is doing with it. Done is the happy look after a hop; look is with its menu open; catch while files are dragged over it, got as it takes them. */
export type GeckoShown = 'asleep' | 'working' | 'waiting' | 'done' | 'look' | 'catch' | 'got' | 'camera' | 'listen'

export interface GeckoNow {
  readonly pose: GeckoPose
  /** A card's goal was reached since it last dozed. */
  readonly done: boolean
  /** Left alone long enough, waiting or done, it has fallen asleep. */
  readonly dozing: boolean
  readonly menu: boolean
  readonly drag: boolean
  readonly got: boolean
  readonly camera: boolean
  readonly listen: boolean
}

/** One pose at a time: what the person does with it first, then waiting, working, done, and asleep. Dozing puts waiting and done to sleep; working keeps working. */
export function geckoShown(now: GeckoNow): GeckoShown {
  if (now.drag) return 'catch'
  if (now.got) return 'got'
  if (now.camera) return 'camera'
  if (now.listen) return 'listen'
  if (now.menu) return 'look'
  if (now.pose === 'waiting' && !now.dozing) return 'waiting'
  if (now.pose === 'working') return 'working'
  if (now.done && !now.dozing) return 'done'
  return 'asleep'
}

/** How long it waits, or looks happy after a hop, with no hover, click or new event, before it falls asleep. */
export const DOZE = 5 * 60_000

/** Whether it can fall asleep from here: only waiting and done do; working keeps working, and nothing dozes while the person is doing something with it. */
export const canDoze = (now: Omit<GeckoNow, 'dozing'>): boolean =>
  !now.menu && !now.drag && !now.got && !now.camera && !now.listen && (now.pose === 'waiting' || (now.pose === 'asleep' && now.done))

/** What its menu offers. */
export type GeckoAction = 'screenshot' | 'task' | 'voice' | 'waiting' | 'open'

export interface GeckoItem {
  readonly action: GeckoAction
  readonly label: string
  /** The count on its disc: how many wait. */
  readonly count?: number
}

/** The menu around the gecko, clockwise from the top: a screenshot only where one can be taken, the waiting conversation only while one waits. */
export function geckoItems({ waiting, screenshot }: { readonly waiting: number; readonly screenshot: boolean }): readonly GeckoItem[] {
  return [
    ...(screenshot ? [{ action: 'screenshot' as const, label: 'Screenshot' }] : []),
    { action: 'task', label: 'New task' },
    { action: 'voice', label: 'Voice task' },
    ...(waiting > 0 ? [{ action: 'waiting' as const, label: 'Waiting', count: waiting }] : []),
    { action: 'open', label: 'Open GeckIt' },
  ]
}

export interface Box {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** The gecko's side, from small to large; it stays square. */
export const GECKO_MIN = 72
export const GECKO_MAX = 320
export const GECKO_SIDE = 120

export const geckoSide = (side: number): number => Math.round(Math.max(GECKO_MIN, Math.min(GECKO_MAX, side)))

/** A box moved, not shrunk, until all of it is inside the area; one larger than the area keeps its top left inside. */
export function keptIn(box: Box, area: Box): Box {
  const x = Math.max(area.x, Math.min(box.x, area.x + area.width - box.width))
  const y = Math.max(area.y, Math.min(box.y, area.y + area.height - box.height))
  return { ...box, x: Math.round(x), y: Math.round(y) }
}

/** The menu laid out around the gecko: its window on the screen and, inside it, the gecko and each item's centre. */
export interface GeckoRing {
  readonly window: Box
  readonly gecko: Box
  readonly items: readonly { readonly x: number; readonly y: number }[]
  /** How much the discs and labels are scaled from their full size, with the gecko. */
  readonly scale: number
}

/** An item's disc at full size, and the room its label takes under it. */
const DISC = 62
const LABEL = 30
const ITEM = 92
/** Room round each item for its shadow, its swell in focus and the spring of its way out, which the window's edge would cut. */
const ROOM = 24

/** Where each item can stand on the screen: within the area, the label too. */
const fits = (x: number, y: number, scale: number, area: Box): boolean =>
  x - (ITEM / 2) * scale - ROOM >= area.x &&
  x + (ITEM / 2) * scale + ROOM <= area.x + area.width &&
  y - (DISC / 2) * scale - ROOM >= area.y &&
  y + (DISC / 2 + LABEL) * scale + ROOM <= area.y + area.height

/**
 * The items on a circle round the gecko, the first at the top, as the demo has them; near an edge of the screen they spread over the
 * part of the circle that is on it, and the circle grows until they have room. All of it stays on the gecko's screen.
 */
export function geckoRing(gecko: Box, area: Box, count: number): GeckoRing {
  const scale = Math.min(1, Math.max(0.75, gecko.width / 200))
  const cx = gecko.x + gecko.width / 2
  const cy = gecko.y + gecko.height / 2
  // Apart along the circle, no closer than a disc and a half.
  const apart = DISC * 1.45 * scale
  let points: { x: number; y: number }[] = []
  // Clear of the gecko's corners, where its count sits.
  for (let radius = gecko.width * Math.SQRT1_2 + (DISC / 2) * scale + 4; points.length === 0 && radius < 2000; radius += 12) {
    const at = (degrees: number): { x: number; y: number } => ({ x: cx + Math.cos((degrees * Math.PI) / 180) * radius, y: cy + Math.sin((degrees * Math.PI) / 180) * radius })
    const open = Array.from({ length: 360 }, (_one, degrees) => {
      const point = at(degrees - 90)
      return fits(point.x, point.y, scale, area)
    })
    const step = (apart / radius) * (180 / Math.PI)
    if (open.every(Boolean)) {
      if (360 / count >= step) points = Array.from({ length: count }, (_one, n) => at(-90 + (360 * n) / count))
      continue
    }
    // The longest run of open degrees, going round past 0.
    let best = { from: 0, length: 0 }
    for (let from = 0; from < 360; from += 1) {
      if (!open[from] || open[(from + 359) % 360]) continue
      let length = 0
      while (length < 360 && open[(from + length) % 360]) length += 1
      if (length > best.length) best = { from, length }
    }
    const span = best.length - 1
    // The first item at the end of the arc nearer the top.
    const fromTop = (degrees: number): number => Math.min(degrees % 360, 360 - (degrees % 360))
    const ahead = fromTop(best.from) <= fromTop(best.from + span)
    const along = (n: number): number => (ahead ? best.from + (span * n) / (count - 1) : best.from + span - (span * n) / (count - 1))
    if (count === 1 && best.length > 0) points = [at(best.from + span / 2 - 90)]
    else if (count > 1 && span / (count - 1) >= step) points = Array.from({ length: count }, (_one, n) => at(along(n) - 90))
  }
  const reach = { x: (ITEM / 2) * scale + ROOM, top: (DISC / 2) * scale + ROOM, bottom: (DISC / 2 + LABEL) * scale + ROOM }
  const left = Math.floor(Math.min(gecko.x, ...points.map((one) => one.x - reach.x)))
  const top = Math.floor(Math.min(gecko.y, ...points.map((one) => one.y - reach.top)))
  const right = Math.ceil(Math.max(gecko.x + gecko.width, ...points.map((one) => one.x + reach.x)))
  const bottom = Math.ceil(Math.max(gecko.y + gecko.height, ...points.map((one) => one.y + reach.bottom)))
  return {
    window: { x: left, y: top, width: right - left, height: bottom - top },
    gecko: { ...gecko, x: gecko.x - left, y: gecko.y - top },
    items: points.map((one) => ({ x: Math.round(one.x - left), y: Math.round(one.y - top) })),
    scale,
  }
}
