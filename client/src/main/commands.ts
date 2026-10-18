import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { app } from 'electron'

import { isRemote } from '../shared/hosts'

/**
 * The commands and skills Claude Code says it has, for picking one with /.
 *
 * The tool names them only once it has started, so the last list each project
 * was given is kept on disk: a conversation whose process has been let go, or a
 * new one, still has something to offer. A project the tool has not started in
 * yet gets the last local list, since the built-in commands and the
 * person's own skills are the same in every folder; the skills and commands
 * that project keeps in its own .claude folder are left out of it.
 */

const FILE = 'commands.json'

interface Kept {
  readonly roots: Readonly<Record<string, readonly string[]>>
  readonly local: readonly string[]
}

let kept: Kept | undefined

const path = (): string => {
  const folder = app.getPath('userData')
  mkdirSync(folder, { recursive: true })
  return join(folder, FILE)
}

function load(): Kept {
  if (kept !== undefined) return kept
  try {
    const read = JSON.parse(readFileSync(path(), 'utf8')) as Partial<Kept> & { readonly last?: Kept['local'] }
    const roots = read.roots ?? {}
    kept = { roots, local: read.local ?? (Object.keys(roots).some(isRemote) ? [] : read.last ?? []) }
  } catch {
    kept = { roots: {}, local: [] }
  }
  return kept
}

/** What a project keeps for itself: a folder per skill, a file per command. A host's are not read from here. */
function ownOf(root: string): ReadonlySet<string> {
  if (isRemote(root)) return new Set()
  const listed = (folder: string): string[] => {
    try {
      return readdirSync(join(root, '.claude', folder), { withFileTypes: true })
        .filter((entry) => folder === 'skills' ? entry.isDirectory() : entry.isFile() && entry.name.endsWith('.md'))
        .map((entry) => entry.name.replace(/\.md$/, ''))
    } catch {
      return []
    }
  }
  return new Set([...listed('skills'), ...listed('commands')])
}

const same = (one: readonly string[] | undefined, other: readonly string[]): boolean =>
  one !== undefined && one.length === other.length && one.every((name, at) => name === other[at])

export function keepCommands(root: string, names: readonly string[]): void {
  const now = load()
  const own = ownOf(root)
  const local = isRemote(root) ? now.local : names.filter((name) => !own.has(name))
  if (same(now.roots[root], names) && same(now.local, local)) return
  kept = { roots: { ...now.roots, [root]: names }, local }
  try {
    writeFileSync(`${path()}.new`, JSON.stringify(kept))
    renameSync(`${path()}.new`, path())
  } catch {
    // Only the list for the next start is lost; this run keeps it.
  }
}

export const commandsFor = (root: string): readonly string[] => load().roots[root] ?? (isRemote(root) ? [] : load().local)
