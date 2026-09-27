import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import type { Folders } from '../shared/api'

/** One level of the Mac's folders, for the phone to choose a project from where there is no folder dialog. */
export function foldersIn(path: string | undefined): Folders {
  const at = resolve(path === undefined || path === '' ? homedir() : path)
  let names: string[] = []
  try {
    names = readdirSync(at, { withFileTypes: true })
      .filter((one) => one.isDirectory() && !one.name.startsWith('.'))
      .map((one) => one.name)
      .sort((one, other) => one.localeCompare(other))
  } catch {
    // Not a folder, or not ours to read: nothing under it.
  }
  return {
    path: at,
    ...(at === dirname(at) ? {} : { up: dirname(at) }),
    git: existsSync(join(at, '.git')),
    folders: names.map((name) => ({ name, path: join(at, name), git: existsSync(join(at, name, '.git')) })),
  }
}
