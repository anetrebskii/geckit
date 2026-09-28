import type { PlaceUsage, PlanUsage } from '../../../shared/api'

/**
 * The accounts behind some places, each once. A plan's windows are an
 * account's, so places signed in to the same account are one item, named by
 * the first of them; a place whose account could not be read stands alone.
 * This computer comes first, then hosts by name, so the order never moves.
 */
export interface PlanItem {
  readonly places: readonly string[]
  readonly entry: PlaceUsage | undefined
}

export function accountsOf(places: readonly string[], plans: readonly PlaceUsage[], nameOf: (place: string) => string): PlanItem[] {
  const ordered = [...new Set(places)].sort((one, other) => (one === '' ? -1 : other === '' ? 1 : nameOf(one).localeCompare(nameOf(other))))
  const items = new Map<string, { places: string[]; entry: PlaceUsage | undefined }>()
  for (const place of ordered) {
    const entry = plans.find((one) => one.place === place)
    const key = entry?.account === undefined ? `place:${place}` : `account:${entry.account}`
    const held = items.get(key)
    if (held === undefined) items.set(key, { places: [place], entry })
    else held.places.push(place)
  }
  return [...items.values()]
}

/** The places the projects are on: '' for this computer, a host's id for one on a host. */
export const placesOf = (roots: readonly string[], hostOf: (root: string) => string | undefined): string[] => [
  ...new Set(roots.map((root) => hostOf(root) ?? '')),
]

/** An item's windows: this computer's come fresh with every turn, a host's as that host last measured them. */
export const usageOf = (item: PlanItem, local: PlanUsage | undefined): PlanUsage | undefined =>
  item.places.includes('') ? (local ?? item.entry?.usage) : item.entry?.usage
