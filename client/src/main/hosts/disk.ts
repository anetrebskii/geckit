import { appendFile, mkdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { hostOf, pathOf } from '../../shared/hosts'
import type { Link } from '../../shared/links'
import type { GoalRead } from '../sessions/claude-read'
import { edgesOf, forkPointAt, goalAt, linksAt, readSessionAt, rowFrom, slug } from '../sessions/disk'
import type { Conversation, Found } from '../sessions/disk'
import type { Hosts } from './hosts'
import { deleteScript, edgesScript, growScript, hasScript, listScript } from './run-script'
import { runOn } from './ssh'

/**
 * Claude Code's conversations on a host, read the way `disk.ts` reads them here.
 *
 * The tool only ever adds to a conversation's file, so a copy kept on this
 * computer is brought up to date by fetching what was added since, and the
 * readers that already know the files read the copy. A list needs only the
 * two ends of each file, and only of the files that changed since the last.
 */

/** How many conversations are read for the list, as for a local project. */
const MOST = 200

/** How many files' ends are fetched in one go. */
const BATCH = 25

/** A list asked for again this soon is answered from the last. */
const FRESH = 4_000

interface Listed {
  readonly file: string
  readonly id: string
  readonly size: number
  readonly at: number
}

/** What `listScript` printed, one file a line. */
export function readListing(out: string): Listed[] {
  return out.split('\n').flatMap((line) => {
    const [file = '', size = '', at = ''] = line.split('\t')
    const id = /\/([A-Za-z0-9-]+)\.jsonl$/.exec(file)?.[1]
    if (id === undefined || !/^\d+$/.test(size.trim()) || !/^\d+$/.test(at.trim())) return []
    return [{ file, id, size: Number(size.trim()), at: Number(at.trim()) * 1000 }]
  })
}

/** What `edgesScript` printed: each file's first part, and its last where it was sent. */
export function readEdges(out: string): Map<string, { readonly head: Buffer; readonly tail?: Buffer }> {
  const found = new Map<string, { head: Buffer; tail?: Buffer }>()
  let file: string | undefined
  let part: string[] = []
  let head: Buffer | undefined
  for (const line of out.split('\n')) {
    if (line.startsWith('@@') && line !== '@@' && line !== '@@.') {
      file = line.slice(2)
      part = []
      head = undefined
      continue
    }
    if (file === undefined) continue
    if (line === '@@') {
      head = Buffer.from(part.join(''), 'base64')
      part = []
      continue
    }
    if (line === '@@.') {
      const tail = part.length === 0 ? undefined : Buffer.from(part.join(''), 'base64')
      found.set(file, { head: head ?? Buffer.alloc(0), ...(tail === undefined ? {} : { tail }) })
      file = undefined
      continue
    }
    part.push(line.trim())
  }
  return found
}

const within = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}/`)

export class HostDisk {
  readonly #hosts: Hosts
  readonly #folder: string
  /** Rows read before, by file, kept while the file is the size and age it was. */
  readonly #rows = new Map<string, { readonly size: number; readonly at: number; readonly row: Found | undefined }>()
  readonly #listed = new Map<string, { readonly at: number; readonly rows: Promise<(Found & { readonly below?: string })[]> }>()

  constructor(hosts: Hosts, folder: string) {
    this.#hosts = hosts
    this.#folder = folder
  }

  #host(root: string): ReturnType<Hosts['config']> {
    const id = hostOf(root)
    return id === undefined ? undefined : this.#hosts.config(id)
  }

  list(root: string): Promise<(Found & { readonly below?: string })[]> {
    const was = this.#listed.get(root)
    if (was !== undefined && Date.now() - was.at < FRESH) return was.rows
    const rows = this.#list(root)
    this.#listed.set(root, { at: Date.now(), rows })
    return rows
  }

  async #list(root: string): Promise<(Found & { readonly below?: string })[]> {
    const host = this.#host(root)
    if (host === undefined) return []
    const path = pathOf(root)
    const own = slug(path)
    const ran = await runOn(host, this.#hosts.setup(), listScript(own), { timeout: 30_000 })
    if (ran.code !== 0) return []
    const files = readListing(ran.out.toString('utf8')).sort((one, other) => other.at - one.at)
    const near = (file: Listed): boolean => !file.file.startsWith(`${own}/`)
    const below = (cwd: string | undefined): string | undefined => (cwd !== undefined && cwd !== path && within(cwd, path) ? cwd : undefined)

    const stale = files.filter((file) => {
      const kept = this.#rows.get(file.file)
      return kept === undefined || kept.size !== file.size || kept.at !== file.at
    })
    for (let from = 0; from < stale.length && from < MOST * 2; from += BATCH) {
      const batch = stale.slice(from, from + BATCH)
      const got = await runOn(host, this.#hosts.setup(), edgesScript(batch), { timeout: 60_000 })
      if (got.code !== 0) break
      const read = readEdges(got.out.toString('utf8'))
      for (const file of batch) {
        const ends = read.get(file.file)
        if (ends === undefined) continue
        this.#rows.set(file.file, { size: file.size, at: file.at, row: rowFrom(file, edgesOf(ends.head, ends.tail, file.size)) })
      }
    }

    const found: (Found & { readonly below?: string })[] = []
    for (const file of files) {
      if (found.length >= MOST) break
      const row = this.#rows.get(file.file)?.row
      if (row === undefined) continue
      const at = below(row.cwd)
      if (near(file) && at === undefined) continue
      found.push(at === undefined ? row : { ...row, below: at })
    }
    return found
  }

  /** The copy of one conversation's file here, brought up to date. */
  async #mirror(root: string, id: string): Promise<string | undefined> {
    const host = this.#host(root)
    if (host === undefined || !/^[A-Za-z0-9-]+$/.test(id)) return undefined
    const file = `${slug(pathOf(root))}/${id}.jsonl`
    const local = join(this.#folder, host.id, 'projects', file)
    const size = await stat(local).then(
      (found) => found.size,
      () => 0,
    )
    const ran = await runOn(host, this.#hosts.setup(), growScript(file, size), { timeout: 120_000 })
    if (ran.code !== 0) return size > 0 ? local : undefined
    await mkdir(dirname(local), { recursive: true })
    if (ran.out.length > 0) {
      // Only whole lines are kept, so the next time starts where a line does.
      const end = ran.out.lastIndexOf(10)
      if (end >= 0) await appendFile(local, ran.out.subarray(0, end + 1))
      else if (size === 0) return undefined
    } else if (size === 0) {
      return undefined
    }
    return local
  }

  async read(root: string, id: string): Promise<Conversation | undefined> {
    const local = await this.#mirror(root, id)
    return local === undefined ? undefined : readSessionAt(local, pathOf(root))
  }

  async has(root: string, id: string): Promise<boolean> {
    const host = this.#host(root)
    if (host === undefined || !/^[A-Za-z0-9-]+$/.test(id)) return false
    const ran = await runOn(host, this.#hosts.setup(), hasScript(`${slug(pathOf(root))}/${id}.jsonl`), { timeout: 30_000 })
    return ran.out.toString('utf8').trim() === 'yes'
  }

  async delete(root: string, id: string): Promise<boolean> {
    const host = this.#host(root)
    if (host === undefined || !/^[A-Za-z0-9-]+$/.test(id)) return false
    const file = `${slug(pathOf(root))}/${id}.jsonl`
    const ran = await runOn(host, this.#hosts.setup(), deleteScript(file), { timeout: 30_000 })
    await rm(join(this.#folder, host.id, 'projects', file), { force: true })
    this.#listed.delete(root)
    return ran.code === 0
  }

  async goal(root: string, id: string): Promise<GoalRead> {
    const local = await this.#mirror(root, id)
    return local === undefined ? {} : goalAt(local)
  }

  async forkPoint(root: string, id: string, at: number): Promise<string | undefined> {
    const local = await this.#mirror(root, id)
    return local === undefined ? undefined : forkPointAt(local, at)
  }

  /** The links of a conversation, from the copy as it stands: a card asks on every list, and that is not worth a connection. */
  async links(root: string, id: string): Promise<Link[]> {
    const host = this.#host(root)
    if (host === undefined) return []
    const local = join(this.#folder, host.id, 'projects', `${slug(pathOf(root))}/${id}.jsonl`)
    return linksAt(local).catch(() => [])
  }

  /** Forgets a host's copies when it is removed. */
  async forget(host: string): Promise<void> {
    await rm(join(this.#folder, host, 'projects'), { recursive: true, force: true })
  }
}
