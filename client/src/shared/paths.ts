/**
 * Paths the assistant wrote without a link, found so they can become one.
 *
 * Only what looks like a path is offered, and only what is on disk is drawn
 * as a link, so "and/or" or a branch name is asked about and stays text.
 */

const NOT_A_PATH = /[\s'"`<>|;&()*?$={},]/
const LINE = /(:\d+(-\d+)?)+$|#L\d+(-L?\d+)?$/

/** The path inline code names, without a line number after it: `client/package.json:14-17`. */
export function pathIn(code: string): string | undefined {
  if (NOT_A_PATH.test(code) || code.includes('://') || code.startsWith('-')) return undefined
  const path = code.replace(LINE, '')
  return path.includes('/') || /\.\w{1,10}$/.test(path) ? path : undefined
}

const SCHEME = /^[a-z][a-z\d+.-]*:/i

/** The file a Markdown link points at, when it points at one: `[paths.ts](src/shared/paths.ts#L12)`. */
export function pathOfLink(href: string): string | undefined {
  const local = href.startsWith('file://') ? href.slice('file://'.length) : href
  if (local === '' || local.startsWith('#') || SCHEME.test(local)) return undefined
  let path = local
  try {
    path = decodeURI(local)
  } catch {
    // A stray % is part of the name.
  }
  return path.replace(LINE, '')
}

// A path inside a sentence has at least one slash; a full stop after it ends the sentence.
const BARE = /(?<![\w.~/@+:-])(?:~\/|\/)?[\w.@+-]+(?:\/[\w.@+-]+)+\/?/g

export interface Said {
  readonly text: string
  readonly path: boolean
}

/** A sentence cut at the paths in it. */
export function pathsIn(text: string): Said[] {
  const parts: Said[] = []
  let at = 0
  for (const found of text.matchAll(BARE)) {
    const path = found[0].replace(/\.+$/, '')
    if (!path.includes('/')) continue
    if (found.index > at) parts.push({ text: text.slice(at, found.index), path: false })
    parts.push({ text: path, path: true })
    at = found.index + path.length
  }
  if (at < text.length) parts.push({ text: text.slice(at), path: false })
  return parts
}

/** The @ being typed where the caret is: `@src/ma`, with the caret after it. */
export function mentionAt(text: string, caret: number): { readonly from: number; readonly asked: string } | undefined {
  const found = /(?:^|\s)@([^\s@]*)$/.exec(text.slice(0, caret))
  const asked = found?.[1]
  return asked === undefined ? undefined : { from: caret - asked.length - 1, asked }
}

const depth = (path: string): number => path.replace(/\/$/, '').split('/').length - 1

const nameOf = (path: string): string => path.replace(/\/$/, '').split('/').pop() ?? path

/**
 * The paths that fit what was typed after @, best first: a name that starts
 * with it, then a name or a path that holds it. Nothing typed is the top of
 * the project; a folder typed to its / is what is in it.
 */
export function pathsFor(paths: readonly string[], asked: string, most = 12): string[] {
  const lower = asked.toLowerCase()
  // Nothing typed after the last / is looking through a folder, so it reads like one: folders, then by name.
  const browsing = lower === '' || lower.endsWith('/')
  const kind = (path: string): number => (browsing && !path.endsWith('/') ? 1 : 0)
  const rank = (path: string): number => {
    const low = path.toLowerCase()
    if (lower === '') return depth(path) === 0 ? 0 : -1
    if (lower.endsWith('/')) return low.startsWith(lower) && low !== lower && depth(path.slice(lower.length)) === 0 ? 0 : -1
    const name = nameOf(low)
    if (name.startsWith(lower)) return 0
    if (name.includes(lower) || low.startsWith(lower)) return 1
    return low.includes(lower) ? 2 : -1
  }
  return paths
    .map((path) => ({ path, rank: rank(path) }))
    .filter((one) => one.rank >= 0)
    .sort(
      (one, other) =>
        one.rank - other.rank ||
        kind(one.path) - kind(other.path) ||
        depth(one.path) - depth(other.path) ||
        (browsing ? 0 : one.path.length - other.path.length) ||
        one.path.localeCompare(other.path),
    )
    .slice(0, most)
    .map((one) => one.path)
}
