import { open, readdir, readFile, realpath, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { SessionItem } from '../../shared/api'
import { costOf, lastContext, lastSaid, replayClaude, typed } from './claude-read'
import { firstLine } from './wording'

/**
 * Claude Code's conversations about a folder, read from where it keeps them.
 *
 * `~/.claude/projects/<the folder's path, with everything but letters and
 * digits made a dash>/<session id>.jsonl` - one file per conversation, written
 * by the tool and only ever read here. Nothing else under `~/.claude` is
 * opened: the folder next door holds how the person is signed in, and that is
 * not a thing this application may know.
 *
 * This is what makes a conversation started in a terminal show up in the
 * window, and what lets one started in the window be picked up in a terminal.
 */

type Json = Readonly<Record<string, unknown>>

/** A conversation found on disk, as much of it as a row needs. */
export interface Found {
  readonly id: string
  readonly title: string
  /** The first line of the last thing said. */
  readonly stands: string
  readonly at: number
  /** Started by a program rather than by somebody at a terminal. */
  readonly driven: boolean
  /** What last answered in it, as the tool names it. */
  readonly model?: string
  /** Tokens in the context after the last answer. */
  readonly used?: number
}

const string = (value: unknown): string => (typeof value === 'string' ? value : '')

const slug = (root: string): string => root.replace(/[^A-Za-z0-9]/g, '-')

/** Where the tool files this folder, under the name it was started in or the one it resolves to. */
export async function folders(root: string): Promise<string[]> {
  // Somebody who keeps the tool's folder elsewhere says so the way the tool asks them to.
  const base = join(process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude'), 'projects')
  const real = await realpath(root).catch(() => root)
  return [...new Set([root, real])].map((path) => join(base, slug(path)))
}

/** Where one conversation is kept, if it is. */
export async function claudeFile(root: string, id: string): Promise<string | undefined> {
  if (!/^[A-Za-z0-9-]+$/.test(id)) return undefined
  for (const folder of await folders(root)) {
    const path = join(folder, `${id}.jsonl`)
    const there = await stat(path).then(
      (found) => found.isFile(),
      () => false,
    )
    if (there) return path
  }
  return undefined
}

/**
 * The most that is read of a file for its row. A conversation with pasted
 * screenshots runs to tens of megabytes, and a folder somebody works in every
 * day has hundreds of them; the title is near one end and the last thing said
 * is near the other.
 */
const EDGE = 64 * 1024

/** How many conversations are read for the list. */
const MOST = 200

async function edges(path: string, size: number): Promise<{ head: Json[]; tail: Json[] }> {
  const file = await open(path, 'r')
  try {
    const lines = async (from: number, length: number): Promise<Json[]> => {
      const { buffer, bytesRead } = await file.read(Buffer.alloc(length), 0, length, from)
      const whole = buffer.subarray(0, bytesRead).toString('utf8').split('\n')
      // A window into the middle of a file starts and ends mid-line.
      if (from > 0) whole.shift()
      if (from + length < size) whole.pop()
      return whole.flatMap((line) => {
        try {
          return line.trim() === '' ? [] : [JSON.parse(line) as Json]
        } catch {
          return []
        }
      })
    }
    if (size <= EDGE * 2) return { head: await lines(0, size), tail: [] }
    return { head: await lines(0, EDGE), tail: await lines(size - EDGE, EDGE) }
  } finally {
    await file.close()
  }
}

/** Throw one conversation away, wherever the tool filed it. Nothing keeps a copy. */
export async function deleteClaude(root: string, id: string): Promise<boolean> {
  const path = await claudeFile(root, id)
  if (path === undefined) return false
  await rm(path, { force: true })
  return true
}

/** Every conversation the tool has about this folder, newest first. */
export async function listClaude(root: string): Promise<Found[]> {
  const files: { id: string; path: string; at: number; size: number }[] = []
  for (const folder of await folders(root)) {
    for (const name of await readdir(folder).catch(() => [])) {
      if (!name.endsWith('.jsonl')) continue
      const path = join(folder, name)
      const found = await stat(path).catch(() => undefined)
      if (found?.isFile() !== true || found.size === 0) continue
      files.push({ id: name.slice(0, -'.jsonl'.length), path, at: found.mtimeMs, size: found.size })
    }
  }
  files.sort((one, other) => other.at - one.at)

  const found: Found[] = []
  for (const file of files.slice(0, MOST)) {
    const { head, tail } = await edges(file.path, file.size).catch(() => ({ head: [], tail: [] }))
    const all = [...head, ...tail]
    const named = (type: string, key: string): string =>
      string([...all].reverse().find((entry) => string(entry['type']) === type)?.[key])

    const asked = head.map(typed).find((words) => words.trim() !== '') ?? ''
    const title = named('custom-title', 'customTitle') || named('ai-title', 'aiTitle') || firstLine(asked, 80)
    // A file with nobody in it: opened and closed, or the tool's own bookkeeping.
    if (title === '') continue

    const entrypoint = string(all.find((entry) => string(entry['entrypoint']) !== '')?.['entrypoint'])
    // `<synthetic>` is the tool speaking for itself - a limit, a refusal - and not a model.
    const model = [...all]
      .reverse()
      .map((entry) =>
        string(entry['type']) === 'assistant'
          ? string(((entry['message'] ?? {}) as Json)['model'])
          : '',
      )
      .find((name) => name !== '' && name !== '<synthetic>')
    const used = lastContext(tail.length > 0 ? tail : head)
    found.push({
      id: file.id,
      title,
      stands: lastSaid(tail.length > 0 ? tail : head) || firstLine(named('last-prompt', 'lastPrompt')),
      at: file.at,
      driven: entrypoint.startsWith('sdk'),
      ...(model === undefined ? {} : { model }),
      ...(used === undefined ? {} : { used }),
    })
  }
  return found
}

/** One conversation read whole: what was said, and what it has cost where the tool counted it. */
export interface Conversation {
  readonly items: SessionItem[]
  readonly cost?: number
}

/** One conversation, whole. Undefined where the tool has no file for it. */
export async function readClaudeSession(root: string, id: string): Promise<Conversation | undefined> {
  const path = await claudeFile(root, id)
  if (path === undefined) return undefined
  const [source, found] = await Promise.all([readFile(path, 'utf8'), stat(path)])
  const entries = source.split('\n').flatMap((line) => {
    try {
      return line.trim() === '' ? [] : [JSON.parse(line) as Json]
    } catch {
      return []
    }
  })
  const cost = costOf(entries)
  return { items: replayClaude(root, entries, Date.now() - found.mtimeMs), ...(cost === undefined ? {} : { cost }) }
}
