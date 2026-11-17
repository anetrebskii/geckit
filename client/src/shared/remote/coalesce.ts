import type { SessionItem, SessionItems } from '../api'
import type { CoreEvent } from '../../core/events'

const LATEST = new Set<CoreEvent['name']>(['chat:sessions', 'chat:listStatus', 'chat:accountChanged', 'chat:plan', 'chat:plans', 'lineup:changed', 'employees:changed', 'settings:changed', 'hosts:changed', 'manager:view', 'channels:changed', 'peer:shares', 'speech:model'])

/** Folds a burst of events into fewer that leave a listener in the same state: whole-state events keep their last, item updates of one conversation become one. */
export function coalesceEvents(events: readonly CoreEvent[]): CoreEvent[] {
  const slots: (CoreEvent | { readonly key: string })[] = []
  const at = new Map<string, number>()
  const merged = new Map<string, { readonly name: 'chat:items' | 'manager:items'; readonly id: string; readonly items: Map<string, SessionItem>; readonly gone: Set<string> }>()
  const place = (key: string, slot: CoreEvent | { readonly key: string }): void => {
    const before = at.get(key)
    if (before !== undefined) slots[before] = { key: '' }
    at.set(key, slots.length)
    slots.push(slot)
  }
  for (const event of events) {
    if (event.name === 'chat:items' || event.name === 'manager:items') {
      const update: SessionItems = event.args[0]
      const key = `${event.name}\n${update.id}`
      const held = merged.get(key) ?? { name: event.name, id: update.id, items: new Map<string, SessionItem>(), gone: new Set<string>() }
      merged.set(key, held)
      for (const id of update.gone ?? []) { held.items.delete(id); held.gone.add(id) }
      for (const item of update.items) held.items.set(item.id, item)
      place(key, { key })
    } else if (LATEST.has(event.name)) place(event.name, event)
    else slots.push(event)
  }
  return slots.flatMap((slot): CoreEvent[] => {
    if ('name' in slot) return [slot]
    const held = merged.get(slot.key)
    if (held === undefined) return []
    const items: SessionItems = { id: held.id, items: [...held.items.values()], ...(held.gone.size === 0 ? {} : { gone: [...held.gone] }) }
    return [{ name: held.name, args: [items] } as CoreEvent]
  })
}
