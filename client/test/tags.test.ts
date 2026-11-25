import { describe, expect, it } from 'vitest'

import { clampColor, createTags, deleteTag, editTag, normalTags, usedTags } from '../src/core/tags'
import type { TaskTag } from '../src/shared/api'
import { changedTags, cleanTagName, knownTags, matchesTags, tagLookup, TOO_LONG } from '../src/shared/tags'

const ids = (): (() => string) => {
  let next = 0
  return () => `t${String(++next)}`
}

const urgent: TaskTag = { id: 'a', name: 'Urgent', color: 0, used: 1 }
const client: TaskTag = { id: 'b', name: 'Client', color: 1, used: 2 }

describe('tag names', () => {
  it('trims and takes 1 to 32 characters', () => {
    expect(cleanTagName('  Urgent ')).toBe('Urgent')
    expect(() => cleanTagName('   ')).toThrow('A tag needs a name.')
    expect(cleanTagName('x'.repeat(32))).toHaveLength(32)
    expect(() => cleanTagName('x'.repeat(33))).toThrow(TOO_LONG)
  })
})

describe('createTags', () => {
  it('makes the new names with the next colour and reuses existing ones ignoring case', () => {
    const made = createTags([urgent, client], ['urgent', ' Later ', 'later'], 9, ids())
    expect(made.tags.map((one) => one.name)).toEqual(['Urgent', 'Later', 'Later'])
    expect(made.catalog).toHaveLength(3)
    expect(made.catalog[2]).toEqual({ id: 't1', name: 'Later', color: 2, used: 9 })
  })

  it('rotates through the 8 colours', () => {
    const many = createTags([], Array.from({ length: 9 }, (_none, at) => `tag ${String(at)}`), 0, ids())
    expect(many.catalog.map((one) => one.color)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 0])
  })
})

describe('editTag', () => {
  it('renames and recolours', () => {
    expect(editTag([urgent, client], 'a', { name: 'Hot', color: 5 })[0]).toEqual({ ...urgent, name: 'Hot', color: 5 })
  })

  it('refuses a name another tag has, and a gone tag', () => {
    expect(() => editTag([urgent, client], 'a', { name: 'client' })).toThrow('A tag with this name exists')
    expect(editTag([urgent, client], 'a', { name: 'URGENT' })[0]?.name).toBe('URGENT')
    expect(() => editTag([urgent], 'z', { name: 'x' })).toThrow('This tag no longer exists.')
  })

  it('keeps colours inside the palette', () => {
    expect(clampColor(9)).toBe(0)
    expect(clampColor(1.5)).toBe(0)
    expect(clampColor(7)).toBe(7)
  })
})

describe('deleteTag and usedTags', () => {
  it('takes the tag out of the catalog and the filter', () => {
    expect(deleteTag([urgent, client], ['a', 'b'], 'a')).toEqual({ catalog: [client], filter: ['b'] })
  })

  it('marks the tags used now', () => {
    expect(usedTags([urgent, client], ['b'], 50).map((one) => one.used)).toEqual([1, 50])
  })
})

describe('normalTags', () => {
  it('drops malformed and repeated tags and filters naming gone ones', () => {
    const found = [urgent, { id: 'c', name: 'urgent', color: 2, used: 0 }, { id: 'd', name: '' }, { id: 'e', name: 'Ok', color: 12 }, 'junk']
    const normal = normalTags(found, ['a', 'gone', 'a'])
    expect(normal.taskTags.map((one) => one.id)).toEqual(['a', 'e'])
    expect(normal.taskTags[1]?.color).toBe(0)
    expect(normal.tagFilter).toEqual(['a'])
    expect(normalTags(undefined, ['none', 'a']).tagFilter).toEqual(['none'])
    expect(normalTags('x', 'y')).toEqual({ taskTags: [], tagFilter: [] })
  })
})

describe('matching and changing a task', () => {
  it('filters by any of the chosen tags, or by none', () => {
    expect(matchesTags({ tags: ['a'] }, [])).toBe(true)
    expect(matchesTags({ tags: ['a'] }, ['b', 'a'])).toBe(true)
    expect(matchesTags({ tags: ['a'] }, ['b'])).toBe(false)
    expect(matchesTags({}, ['none'])).toBe(true)
    expect(matchesTags({ tags: ['a'] }, ['none'])).toBe(false)
  })

  it('adds at the end once and removes', () => {
    expect(changedTags(['a', 'b'], ['c', 'a', 'c'], ['b'])).toEqual(['a', 'c'])
    expect(changedTags(undefined, ['a'], ['a'])).toEqual([])
  })

  it('resolves ids to tags, skipping gone ones, and returns the same array for the same list', () => {
    expect(knownTags(['b', 'gone', 'a'], [urgent, client])).toEqual([client, urgent])
    const lookup = tagLookup([urgent, client])
    const tags = ['a', 'b']
    expect(lookup({ tags })).toEqual([urgent, client])
    expect(lookup({ tags })).toBe(lookup({ tags }))
    expect(lookup({})).toBe(lookup({ tags: [] }))
  })
})
