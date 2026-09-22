import { describe, expect, it } from 'vitest'

import { PROJECT_COLORS, projectColor, withColors } from '../src/shared/project-color'

const root = (at: number): string => `/Users/me/Projects/p${String(at)}`
const newestFirst = (count: number): string[] => Array.from({ length: count }, (_, at) => root(count - 1 - at))

/** Projects added one at a time, as the list grows in use: each goes to the front. */
function added(count: number): Record<string, number> {
  let projectColors: Record<string, number> = {}
  for (let at = 1; at <= count; at++) projectColors = withColors({ projects: newestFirst(at), projectColors })
  return projectColors
}

describe('a project colour', () => {
  it('differs for every project while there are colours enough', () => {
    const colors = added(PROJECT_COLORS.length)
    expect(new Set(Object.values(colors)).size).toBe(PROJECT_COLORS.length)
  })

  it('past that, is shared with the project used longest ago, never with one used lately', () => {
    const before = added(PROJECT_COLORS.length)
    const after = added(PROJECT_COLORS.length + 1)
    const newest = after[root(PROJECT_COLORS.length)]
    expect(newest).toBe(before[root(0)])
    const recent = newestFirst(PROJECT_COLORS.length + 1).slice(1, PROJECT_COLORS.length)
    expect(recent.map((one) => after[one])).not.toContain(newest)
  })

  it('stays as it was given when the list is reordered, grows, or a colour is chosen for another', () => {
    const colors = added(12)
    const reordered = withColors({ projects: [...newestFirst(12)].reverse(), projectColors: colors })
    expect(reordered).toEqual(colors)
    const chosen = withColors({ projects: newestFirst(12), projectColors: { ...colors, [root(0)]: 3 } })
    expect({ ...chosen, [root(0)]: colors[root(0)] }).toEqual(colors)
  })

  it('is filled in once for projects listed before colours were, the newest first', () => {
    const colors = withColors({ projects: newestFirst(5), projectColors: {} })
    expect(newestFirst(5).map((one) => colors[one])).toEqual([0, 1, 2, 3, 4])
  })

  it('comes from the path alone for a folder never on the list, and for a colour that is not in the palette', () => {
    expect(projectColor('/tmp/x', { projectColors: {} })).toBe(projectColor('/tmp/x', { projectColors: { '/tmp/x': 99 } }))
    expect(projectColor('/tmp/x', { projectColors: {} })).toBeLessThan(PROJECT_COLORS.length)
  })
})
