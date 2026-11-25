import type { ChatSession, TaskTag } from './api'

export const TAG_NAME_MAX = 32
/** The project palette's colours, which tags take turns with. */
export const TAG_COLORS = 8
/** The most tags a card or a header shows before "+N". */
export const TAGS_SHOWN = 3

export const TOO_LONG = `Tag names are up to ${String(TAG_NAME_MAX)} characters`

export function cleanTagName(name: string): string {
  const clean = name.trim()
  if (clean === '') throw new Error('A tag needs a name.')
  if (clean.length > TAG_NAME_MAX) throw new Error(TOO_LONG)
  return clean
}

export const findTag = (catalog: readonly TaskTag[], name: string): TaskTag | undefined => {
  const lower = name.trim().toLowerCase()
  return catalog.find((one) => one.name.toLowerCase() === lower)
}

/** A task's tags that still exist, in its own order. */
export const knownTags = (tags: ChatSession['tags'], catalog: readonly TaskTag[]): readonly TaskTag[] =>
  (tags ?? []).flatMap((id) => catalog.find((one) => one.id === id) ?? [])

export const matchesTags = (session: Pick<ChatSession, 'tags'>, filter: readonly string[]): boolean =>
  filter.length === 0 || (filter.includes('none') ? (session.tags ?? []).length === 0 : (session.tags ?? []).some((id) => filter.includes(id)))

/** A task's tags with these added at the end and those taken off, each once. */
export function changedTags(tags: ChatSession['tags'], add: readonly string[], remove: readonly string[]): readonly string[] {
  const kept = (tags ?? []).filter((one) => !remove.includes(one))
  return [...kept, ...add.filter((one, at) => !kept.includes(one) && add.indexOf(one) === at && !remove.includes(one))]
}

/** A task's tags from the catalog, the same array each time for the same list, so a row drawn from it is not drawn again. */
export function tagLookup(catalog: readonly TaskTag[]): (session: Pick<ChatSession, 'tags'>) => readonly TaskTag[] {
  const byId = new Map(catalog.map((one) => [one.id, one]))
  const none: readonly TaskTag[] = []
  const made = new WeakMap<readonly string[], readonly TaskTag[]>()
  return (session) => {
    if (session.tags === undefined || session.tags.length === 0) return none
    const found = made.get(session.tags) ?? session.tags.flatMap((id) => byId.get(id) ?? [])
    made.set(session.tags, found)
    return found
  }
}
