import type { SessionItem, SessionItems } from './api'

export function updatedItems(held: readonly SessionItem[], updates: readonly Pick<SessionItems, 'items' | 'gone'>[]): SessionItem[] {
  const kept = new Map(held.map((item) => [item.id, item]))
  for (const update of updates) {
    for (const id of update.gone ?? []) kept.delete(id)
    for (const item of update.items) kept.set(item.id, item)
  }
  return [...kept.values()]
}
