import { inProgress } from './api'
import type { ChatSession } from './api'

/** In progress in the order kept for it; a conversation it does not have yet stands on top, newest first. */
export function ordered<Row extends Pick<ChatSession, 'id'>>(rows: readonly Row[], order: readonly string[]): readonly Row[] {
  const place = new Map(order.map((id, index) => [id, index]))
  const fresh = rows.filter((one) => !place.has(one.id))
  const kept = rows.filter((one) => place.has(one.id)).sort((one, other) => (place.get(one.id) ?? 0) - (place.get(other.id) ?? 0))
  return [...fresh, ...kept]
}

/** The order with a conversation that came into In progress put on top, and one that left it taken out. Undefined when nothing changed. */
export function keptOrder(order: readonly string[], all: readonly Pick<ChatSession, 'id' | 'status' | 'at'>[]): readonly string[] | undefined {
  const fresh = all
    .filter((one) => inProgress(one.status) && !order.includes(one.id))
    .sort((one, other) => other.at - one.at)
    .map((one) => one.id)
  const gone = new Set(all.filter((one) => !inProgress(one.status)).map((one) => one.id))
  if (fresh.length === 0 && !order.some((id) => gone.has(id))) return undefined
  return [...fresh, ...order.filter((id) => !gone.has(id))]
}

/** The order with these conversations moved to its top or its bottom. */
export function movedOrder(order: readonly string[], ids: readonly string[], to: 'top' | 'bottom'): readonly string[] {
  const rest = order.filter((id) => !ids.includes(id))
  return to === 'top' ? [...ids, ...rest] : [...rest, ...ids]
}

/** A card's place on the screen, as `getBoundingClientRect` gives it. */
export interface Box {
  readonly top: number
  readonly bottom: number
  readonly left: number
  readonly width: number
}

/**
 * Before which of these cards the pointer stands: in a column, the first whose middle is below it; among tiles,
 * the first of a row below it, or in its own row the first whose middle is to its right. Past them all, after the last.
 */
export function landingIndex(boxes: readonly Box[], x: number, y: number, tiled = false): number {
  const at = boxes.findIndex((box) => {
    if (!tiled) return y < box.top + (box.bottom - box.top) / 2
    return y < box.top || (y < box.bottom && x < box.left + box.width / 2)
  })
  return at === -1 ? boxes.length : at
}
