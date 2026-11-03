import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

export const fileAt = (root: string, path: string): string =>
  path === '~' || path.startsWith('~/') ? resolve(homedir(), path.slice(2)) : resolve(root, path)

export const isThere = (root: string, path: string): Promise<boolean> =>
  stat(fileAt(root, path)).then(() => true, () => false)
