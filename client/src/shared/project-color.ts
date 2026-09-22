import type { Settings } from './api'

/** The colours a project can have, each a `--project-N` token drawn for both themes; none is the green, red, orange or amber that already mean something. */
export const PROJECT_COLORS = ['Sky', 'Blue', 'Violet', 'Magenta', 'Pink', 'Teal', 'Sand', 'Slate']

const valid = (color: number | undefined): color is number =>
  color !== undefined && Number.isInteger(color) && color >= 0 && color < PROJECT_COLORS.length

const hashed = (root: string): number => {
  let hash = 2166136261
  for (let at = 0; at < root.length; at++) hash = Math.imul(hash ^ root.charCodeAt(at), 16777619)
  return (hash >>> 0) % PROJECT_COLORS.length
}

/** The colour a project was given, or for a folder never on the list, the one its path gives. */
export function projectColor(root: string, { projectColors }: Pick<Settings, 'projectColors'>): number {
  const color = projectColors[root]
  return valid(color) ? color : hashed(root)
}

/**
 * Colours for the listed projects that have none yet, kept from then on so no project changes colour by itself.
 * Each takes the colour whose latest user is furthest down the list, which is newest first: with more projects than colours, the ones in use at the same time still differ, and a colour is shared with a project not opened for a while.
 */
export function withColors({ projects, projectColors }: Pick<Settings, 'projects' | 'projectColors'>): Settings['projectColors'] {
  const colors: Record<string, number> = { ...projectColors }
  for (const root of projects) {
    if (valid(colors[root])) continue
    const last = (color: number): number => {
      const at = projects.findIndex((one) => one !== root && colors[one] === color)
      return at === -1 ? Infinity : at
    }
    colors[root] = PROJECT_COLORS.reduce((best, _name, color) => (last(color) > last(best) ? color : best), 0)
  }
  return colors
}
