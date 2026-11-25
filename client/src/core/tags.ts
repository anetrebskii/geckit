import { randomUUID } from 'node:crypto'
import type { TaskTag } from '../shared/api'
import { cleanTagName, findTag, TAG_COLORS } from '../shared/tags'

export { changedTags, cleanTagName, findTag, matchesTags, knownTags, TAG_NAME_MAX } from '../shared/tags'

/** The tags these names are, the ones that do not exist yet added at the end with the next colour. */
export function createTags(catalog: readonly TaskTag[], names: readonly string[], now: number, id: () => string = randomUUID): { readonly catalog: readonly TaskTag[]; readonly tags: readonly TaskTag[] } {
  let next = [...catalog]
  const tags: TaskTag[] = []
  for (const raw of names) {
    const name = cleanTagName(raw)
    const found = findTag(next, name)
    if (found !== undefined) {
      tags.push(found)
      continue
    }
    const made = { id: id(), name, color: next.length % TAG_COLORS, used: now }
    next = [...next, made]
    tags.push(made)
  }
  return { catalog: next, tags }
}

export function editTag(catalog: readonly TaskTag[], id: TaskTag['id'], change: { readonly name?: string; readonly color?: number }): readonly TaskTag[] {
  const tag = catalog.find((one) => one.id === id)
  if (tag === undefined) throw new Error('This tag no longer exists.')
  const name = change.name === undefined ? tag.name : cleanTagName(change.name)
  const taken = findTag(catalog, name)
  if (taken !== undefined && taken.id !== id) throw new Error('A tag with this name exists')
  const color = change.color === undefined ? tag.color : clampColor(change.color)
  return catalog.map((one) => (one.id === id ? { ...one, name, color } : one))
}

export const usedTags = (catalog: readonly TaskTag[], ids: readonly TaskTag['id'][], now: number): readonly TaskTag[] =>
  catalog.map((one) => (ids.includes(one.id) ? { ...one, used: now } : one))

export function deleteTag(catalog: readonly TaskTag[], filter: readonly string[], id: TaskTag['id']): { readonly catalog: readonly TaskTag[]; readonly filter: readonly string[] } {
  return { catalog: catalog.filter((one) => one.id !== id), filter: filter.filter((one) => one !== id) }
}

export const clampColor = (color: number): number => (Number.isInteger(color) && color >= 0 && color < TAG_COLORS ? color : 0)

/** What a settings file holds, made safe: well-formed tags with a name each once, and a filter naming only those. */
export function normalTags(found: unknown, filter: unknown): { readonly taskTags: readonly TaskTag[]; readonly tagFilter: readonly string[] } {
  const taskTags: TaskTag[] = []
  for (const one of Array.isArray(found) ? (found as unknown[]) : []) {
    if (typeof one !== 'object' || one === null) continue
    const { id, name, color, used } = one as Record<string, unknown>
    if (typeof id !== 'string' || id === '' || typeof name !== 'string') continue
    let clean: string
    try {
      clean = cleanTagName(name)
    } catch {
      continue
    }
    if (taskTags.some((tag) => tag.id === id) || findTag(taskTags, clean) !== undefined) continue
    taskTags.push({ id, name: clean, color: typeof color === 'number' ? clampColor(color) : 0, used: typeof used === 'number' ? used : 0 })
  }
  const asked = Array.isArray(filter) ? (filter as unknown[]).filter((one): one is string => typeof one === 'string') : []
  const tagFilter = asked.includes('none') ? ['none'] : asked.filter((one, at) => asked.indexOf(one) === at && taskTags.some((tag) => tag.id === one))
  return { taskTags, tagFilter }
}
