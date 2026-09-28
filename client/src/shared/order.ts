import type { ChatSession } from './api'

/** In progress in the order it was dragged to; a conversation it does not have yet stands on top, newest first. */
export function ordered<Row extends Pick<ChatSession, 'id'>>(rows: readonly Row[], order: readonly string[]): readonly Row[] {
  if (order.length === 0) return rows
  const place = new Map(order.map((id, index) => [id, index]))
  const fresh = rows.filter((one) => !place.has(one.id))
  const kept = rows.filter((one) => place.has(one.id)).sort((one, other) => (place.get(one.id) ?? 0) - (place.get(other.id) ?? 0))
  return [...fresh, ...kept]
}
