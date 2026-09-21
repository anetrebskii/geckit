import { execFile } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

/**
 * What a project holds, for picking a file or a folder with @.
 *
 * Git's own list where the project is a repository, so what it ignores stays
 * out; otherwise the folder is walked, without node_modules and .git. Kept for
 * a few seconds, since every @ typed asks again.
 */

const MOST = 20_000
const KEPT_FOR = 10_000

const held = new Map<string, { readonly at: number; readonly paths: Promise<string[]> }>()

const lsFiles = (root: string, ...which: string[]): Promise<string[]> =>
  new Promise((done, failed) => {
    execFile(
      'git',
      ['-C', root, '--no-optional-locks', 'ls-files', '-z', ...which],
      { maxBuffer: 64 * 1024 * 1024, timeout: 5000 },
      (error, out) => {
        if (error !== null) failed(error)
        else done(out.split('\0').filter((one) => one !== ''))
      },
    )
  })

// Git still lists a file deleted but not yet committed; it is not there to pick.
async function tracked(root: string): Promise<string[]> {
  const [files, gone] = await Promise.all([
    lsFiles(root, '--cached', '--others', '--exclude-standard'),
    lsFiles(root, '--deleted'),
  ])
  const missing = new Set(gone)
  return files.filter((file) => !missing.has(file))
}

async function walked(root: string): Promise<string[]> {
  const files: string[] = []
  const waiting = [root]
  for (let folder = waiting.shift(); folder !== undefined && files.length < MOST; folder = waiting.shift()) {
    const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue
      const path = join(folder, entry.name)
      if (entry.isDirectory()) waiting.push(path)
      else files.push(relative(root, path))
    }
  }
  return files
}

async function listed(root: string): Promise<string[]> {
  const files = (await tracked(root).catch(() => walked(root))).slice(0, MOST)
  const folders = new Set<string>()
  for (const file of files) {
    for (let at = file.lastIndexOf('/'); at > 0; at = file.lastIndexOf('/', at - 1)) folders.add(`${file.slice(0, at)}/`)
  }
  return [...folders, ...files]
}

/** Every file in the project and every folder that holds one, as paths from it; a folder ends with /. */
export function projectFiles(root: string): Promise<string[]> {
  const was = held.get(root)
  if (was !== undefined && Date.now() - was.at < KEPT_FOR) return was.paths
  const paths = listed(root)
  held.set(root, { at: Date.now(), paths })
  return paths
}
