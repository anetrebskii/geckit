import { appendFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { hostOf, pathOf, remoteRoot } from '../../shared/hosts'
import type { HostConfig } from '../../shared/hosts'
import type { Link } from '../../shared/links'
import type { GoalRead } from '../sessions/claude-read'
import { edges, edgesOf, forkPointAt, goalAt, linksAt, readSessionAt, rowFrom, slug } from '../sessions/disk'
import type { Conversation, Found } from '../sessions/disk'
import type { HostsLike } from './hosts'
import { deleteScript, edgesScript, growScript, hasScript, listScript, readGrow } from './run-script'
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
  readonly #hosts: HostsLike
  readonly #folder: string
  /** Rows read before, by file, kept while the file is the size and age it was. */
  readonly #rows = new Map<string, { readonly size: number; readonly at: number; readonly row: Found | undefined }>()
  readonly #listed = new Map<string, { readonly at: number; readonly rows: Promise<(Found & { readonly below?: string })[]> }>()
  /** One file touched at a time: the promise of whichever fetch or delete for it is already in flight, so neither ever lands after the other. */
  readonly #mirroring = new Map<string, Promise<unknown>>()

  constructor(hosts: HostsLike, folder: string) {
    this.#hosts = hosts
    this.#folder = folder
  }

  #host(root: string): HostConfig | undefined {
    const id = hostOf(root)
    return id === undefined ? undefined : this.#hosts.config(id)
  }

  /** Where the mirror of a project's files on a host is kept, whether or not any of it has been fetched yet. */
  mirrorFolder(hostId: string, root: string): string {
    return join(this.#folder, hostId, 'projects', slug(pathOf(root)))
  }

  #listingPath(hostId: string, root: string): string {
    return join(this.#folder, hostId, 'listed', `${slug(pathOf(root))}.json`)
  }

  /** The listing as it last stood, read from disk: what a host not connected answers with rather than nothing. */
  async #cachedListing(root: string): Promise<(Found & { readonly below?: string })[]> {
    const host = this.#host(root)
    if (host === undefined) return []
    try {
      return JSON.parse(await readFile(this.#listingPath(host.id, root), 'utf8')) as (Found & { readonly below?: string })[]
    } catch {
      return []
    }
  }

  async #keepListing(root: string, rows: readonly (Found & { readonly below?: string })[]): Promise<void> {
    const host = this.#host(root)
    if (host === undefined) return
    const path = this.#listingPath(host.id, root)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(rows)).catch(() => undefined)
  }

  /**
   * A project's conversations on its host. A host that is not connected is not
   * reached for this - a card asking for it is not worth what a list costs -
   * and the last listing read is answered instead, kept here so it survives a
   * restart too.
   */
  list(root: string): Promise<(Found & { readonly below?: string })[]> {
    const host = this.#host(root)
    if (host === undefined) return Promise.resolve([])
    if (this.#hosts.state(host.id) !== 'up') return this.#cachedListing(root)
    const was = this.#listed.get(root)
    if (was !== undefined && Date.now() - was.at < FRESH) return was.rows
    // A listing that could not be read keeps the last one, here and on disk, rather than an empty board.
    const rows = this.#list(root).then(async (found) => {
      if (found === undefined) return this.#cachedListing(root)
      await this.#keepListing(root, found)
      return found
    })
    this.#listed.set(root, { at: Date.now(), rows })
    return rows
  }

  /** The listing read live from the host, or nothing where the host could not be read. */
  async #list(root: string): Promise<(Found & { readonly below?: string })[] | undefined> {
    const host = this.#host(root)
    if (host === undefined) return undefined
    const path = pathOf(root)
    const own = slug(path)
    const ran = await runOn(host, this.#hosts.setup(), listScript(own), { timeout: 30_000 })
    if (ran.code !== 0) {
      this.#hosts.noteFailure?.(host.id, ran)
      return undefined
    }
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

  /**
   * The copy of one conversation's file here, brought up to date. A host that
   * is not connected is not reached for this either - the copy already here
   * answers `read`, `goal` and `forkPoint` as it last stood.
   *
   * Two calls for the same file are never let run at once - each waits its
   * turn behind the one before it - so the bytes grown are never fetched
   * twice and appended twice.
   */
  async #mirror(root: string, id: string): Promise<string | undefined> {
    const host = this.#host(root)
    if (host === undefined || !/^[A-Za-z0-9-]+$/.test(id)) return undefined
    const file = `${slug(pathOf(root))}/${id}.jsonl`
    const local = join(this.#folder, host.id, 'projects', file)
    const before = this.#mirroring.get(file) ?? Promise.resolve()
    const turn = before.catch(() => undefined).then(() => this.#mirrorOnce(host, file, local))
    this.#mirroring.set(file, turn)
    try {
      return await turn
    } finally {
      if (this.#mirroring.get(file) === turn) this.#mirroring.delete(file)
    }
  }

  /** One fetch of what a file grew by, never two of them at once for the same file (see `#mirror`). */
  async #mirrorOnce(host: HostConfig, file: string, local: string): Promise<string | undefined> {
    const size = await stat(local).then(
      (found) => found.size,
      () => 0,
    )
    if (this.#hosts.state(host.id) !== 'up') return size > 0 ? local : undefined
    const ran = await runOn(host, this.#hosts.setup(), growScript(file, size), { timeout: 20_000 })
    if (ran.code !== 0) {
      this.#hosts.noteFailure?.(host.id, ran)
      return size > 0 ? local : undefined
    }
    const { size: remote, grown } = readGrow(ran.out)
    // Smaller than the mirror already kept: the file was cut short or begun again on the host, so what is kept here is dropped and it is fetched whole.
    if (remote < size) {
      await rm(local, { force: true })
      return this.#mirrorOnce(host, file, local)
    }
    await mkdir(dirname(local), { recursive: true })
    if (grown.length > 0) {
      // Only whole lines are kept, so the next time starts where a line does.
      const end = grown.lastIndexOf(10)
      if (end >= 0) await appendFile(local, grown.subarray(0, end + 1))
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

  /**
   * Whether a conversation is on its host. A card is not worth asking for
   * this, and neither is a wrong answer worth Sessions starting a fresh run
   * in place of one only out of reach for now: not up, or the call itself
   * failing, answers from what is kept here rather than saying it is gone.
   */
  async has(root: string, id: string): Promise<boolean> {
    const host = this.#host(root)
    if (host === undefined || !/^[A-Za-z0-9-]+$/.test(id)) return false
    const file = `${slug(pathOf(root))}/${id}.jsonl`
    const known = await this.#knownHere(root, id, file)
    if (this.#hosts.state(host.id) !== 'up') return known
    const ran = await runOn(host, this.#hosts.setup(), hasScript(file), { timeout: 30_000 })
    if (ran.code !== 0) {
      this.#hosts.noteFailure?.(host.id, ran)
      return known
    }
    return ran.out.toString('utf8').trim() === 'yes' || known
  }

  /** A copy kept here, or a row of it in the last listing read: either says it was seen, whether or not the host answers now. */
  async #knownHere(root: string, id: string, file: string): Promise<boolean> {
    const host = this.#host(root)
    if (host === undefined) return false
    const local = join(this.#folder, host.id, 'projects', file)
    if (await stat(local).then(() => true, () => false)) return true
    const rows = await this.#cachedListing(root)
    return rows.some((row) => row.id === id)
  }

  /**
   * Deletes a conversation on its host, its mirror here, and its row in the
   * listing kept for when the host is not connected - the last of those is
   * what `has` and a board shown from a cached listing read, so left behind
   * it would keep saying a deleted conversation is still there. Goes through
   * the same one-at-a-time queue as `#mirror`, so a fetch already in flight
   * for the file cannot land after the delete and leave a mirror behind it.
   */
  async delete(root: string, id: string): Promise<boolean> {
    const host = this.#host(root)
    if (host === undefined || !/^[A-Za-z0-9-]+$/.test(id)) return false
    const file = `${slug(pathOf(root))}/${id}.jsonl`
    const local = join(this.#folder, host.id, 'projects', file)
    const before = this.#mirroring.get(file) ?? Promise.resolve()
    const turn = before.catch(() => undefined).then(() => this.#deleteOnce(host, root, id, file, local))
    this.#mirroring.set(file, turn)
    try {
      return await turn
    } finally {
      if (this.#mirroring.get(file) === turn) this.#mirroring.delete(file)
    }
  }

  /** One delete, never run at the same time as a fetch of the same file's mirror (see `delete`). */
  async #deleteOnce(host: HostConfig, root: string, id: string, file: string, local: string): Promise<boolean> {
    const ran = await runOn(host, this.#hosts.setup(), deleteScript(file), { timeout: 30_000 })
    if (ran.code !== 0) this.#hosts.noteFailure?.(host.id, ran)
    await rm(local, { force: true })
    this.#rows.delete(file)
    this.#listed.delete(root)
    await this.#dropFromCachedListing(host.id, root, id)
    return ran.code === 0
  }

  /** The row of a deleted conversation dropped from the listing kept on disk for when the host is not connected, so `has` and a board shown from it do not go on saying it is there. */
  async #dropFromCachedListing(hostId: string, root: string, id: string): Promise<void> {
    const path = this.#listingPath(hostId, root)
    const rows = await readFile(path, 'utf8').then(
      (text) => JSON.parse(text) as (Found & { readonly below?: string })[],
      () => undefined,
    )
    if (rows === undefined) return
    const kept = rows.filter((row) => row.id !== id)
    if (kept.length === rows.length) return
    await writeFile(path, JSON.stringify(kept)).catch(() => undefined)
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

  /**
   * Every conversation known here from any host, last written from one time up
   * to another, for Hidden conversations: the same search `everyClaude` does
   * of `~/.claude/projects`, but of the copies kept here and, for one never
   * opened here, the row its project's last listing kept of it, so nothing is
   * asked of a host for it. `cwd` comes back as the project's root, host and
   * all, so it is matched against a project the way a local row's already is.
   */
  async every(from: number, to: number, wanted: (id: string) => boolean): Promise<Found[]> {
    const found: Found[] = []
    const seen = new Set<string>()
    for (const hostId of await readdir(this.#folder).catch(() => [])) {
      const host = this.#hosts.config(hostId)
      if (host === undefined) continue
      const projects = join(this.#folder, hostId, 'projects')
      for (const slugged of await readdir(projects).catch(() => [])) {
        const folder = join(projects, slugged)
        for (const name of await readdir(folder).catch(() => [])) {
          if (!name.endsWith('.jsonl')) continue
          const id = name.slice(0, -'.jsonl'.length)
          if (!wanted(id)) continue
          const path = join(folder, name)
          const file = await stat(path).catch(() => undefined)
          if (file === undefined || file.size === 0 || file.mtimeMs < from || file.mtimeMs >= to) continue
          const row = rowFrom({ id, at: file.mtimeMs }, await edges(path, file.size).catch(() => ({ head: [], tail: [], cut: '' })))
          if (row === undefined) continue
          seen.add(id)
          found.push(row.cwd === undefined ? row : { ...row, cwd: remoteRoot(hostId, row.cwd) })
        }
      }
      const listed = join(this.#folder, hostId, 'listed')
      for (const name of await readdir(listed).catch(() => [])) {
        const rows = await readFile(join(listed, name), 'utf8').then(
          (text) => JSON.parse(text) as (Found & { readonly below?: string })[],
          () => [],
        )
        for (const { below: _below, ...row } of rows) {
          if (seen.has(row.id) || row.at < from || row.at >= to || !wanted(row.id)) continue
          seen.add(row.id)
          found.push(row.cwd === undefined ? row : { ...row, cwd: remoteRoot(hostId, row.cwd) })
        }
      }
    }
    return found
  }

  /**
   * Forgets a host's copies when it is removed: the folders on disk, and what
   * was kept of it in memory, so a list or a row read a moment later never
   * answers from a host that is no longer here.
   */
  async forget(host: string): Promise<void> {
    await rm(join(this.#folder, host, 'projects'), { recursive: true, force: true })
    await rm(join(this.#folder, host, 'listed'), { recursive: true, force: true })
    for (const root of [...this.#listed.keys()]) if (hostOf(root) === host) this.#listed.delete(root)
    // Rows are kept by the host's own path, which does not name the host: cleared whole rather than left to answer for a host that is gone.
    this.#rows.clear()
  }
}
