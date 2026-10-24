import { createHash } from 'node:crypto'
import { basename, posix } from 'node:path'

/**
 * Where `geckit start` and the application meet: a socket file in the data
 * folder, or on Windows a named pipe, since Node there listens on nothing
 * else. Pipes are one namespace for the whole machine and a name is ASCII at
 * best, so the folder is told apart by a hash of it, written however it was
 * written: the installed GeckIt, a copy run from the source and another
 * person's copy keep apart.
 */

export const SOCKET_NAME = 'geckit.sock'

/** A path with forward slashes: every shell on Windows reads them, and in a shell script a backslash would be an escape. */
export const forwardSlashes = (path: string): string => path.replace(/\\/g, '/')

export function askedEndpoint(folder: string, platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'win32') return posix.join(folder, SOCKET_NAME)
  const same = forwardSlashes(folder).replace(/\/+$/, '').toLowerCase()
  const name = basename(same).replace(/[^A-Za-z0-9_-]+/g, '-')
  return `\\\\.\\pipe\\geckit-${name}-${createHash('sha1').update(same).digest('hex').slice(0, 12)}`
}

/** A socket file is on disk, to be removed before listening and after; a pipe is not. */
export const endpointOnDisk = (platform: NodeJS.Platform = process.platform): boolean => platform !== 'win32'
