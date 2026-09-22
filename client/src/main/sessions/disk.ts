import { open, readdir, realpath, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { SessionGoal, SessionItem, WorkItem } from '../../shared/api'
import { workItem } from '../../shared/links'
import { costOf, goalOf, lastContext, lastSaid, replayClaude, STILL_GOING, typed } from './claude-read'
import type { GoalRead } from './claude-read'
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
  readonly work?: WorkItem
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

/**
 * Throw one conversation away, wherever the tool filed it, with the folder of
 * the same name beside it where its helpers' conversations and long tool
 * results are kept. Nothing keeps a copy.
 */
export async function deleteClaude(root: string, id: string): Promise<boolean> {
  const path = await claudeFile(root, id)
  if (path === undefined) return false
  await rm(path, { force: true })
  await rm(path.slice(0, -'.jsonl'.length), { recursive: true, force: true })
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
    const work = workItem(asked)
    found.push({
      id: file.id,
      title,
      stands: lastSaid(tail.length > 0 ? tail : head) || firstLine(named('last-prompt', 'lastPrompt')),
      at: file.at,
      driven: entrypoint.startsWith('sdk'),
      ...(model === undefined ? {} : { model }),
      ...(used === undefined ? {} : { used }),
      ...(work === undefined ? {} : { work }),
    })
  }
  return found
}

const CHUNK = 2 * 1024 * 1024

/**
 * The entries of a conversation file, read a piece at a time. The main process
 * also carries every keystroke to the windows, and a hundred megabytes decoded
 * and parsed in one go held them all up for a quarter of a second.
 */
async function entriesOf(path: string, wanted: (line: string) => boolean = () => true): Promise<Json[]> {
  const entries: Json[] = []
  const take = (line: string): void => {
    if (line.trim() === '' || !wanted(line)) return
    try {
      entries.push(JSON.parse(line) as Json)
    } catch {
      // A line still being written is read once it is whole.
    }
  }
  const file = await open(path, 'r')
  try {
    let carry = Buffer.alloc(0)
    for (;;) {
      const { buffer, bytesRead } = await file.read(Buffer.alloc(CHUNK), 0, CHUNK, null)
      if (bytesRead === 0) break
      const joined = Buffer.concat([carry, buffer.subarray(0, bytesRead)])
      const end = joined.lastIndexOf(10)
      if (end < 0) {
        carry = joined
        continue
      }
      for (const line of joined.subarray(0, end).toString('utf8').split('\n')) take(line)
      carry = joined.subarray(end + 1)
    }
    take(carry.toString('utf8'))
  } finally {
    await file.close()
  }
  return entries
}

/** One conversation read whole: what was said, and what it has cost where the tool counted it. */
export interface Conversation {
  readonly items: SessionItem[]
  readonly cost?: number
  readonly goal?: SessionGoal
}

/** One conversation, whole. Undefined where the tool has no file for it. */
/** The last conversations read, by file, reused while the file is as it was; a hundred megabytes takes a quarter of a second to read again. */
const kept = new Map<string, { readonly size: number; readonly written: number; readonly conversation: Conversation }>()
const KEEP = 8

export async function readClaudeSession(root: string, id: string): Promise<Conversation | undefined> {
  const path = await claudeFile(root, id)
  if (path === undefined) return undefined
  const found = await stat(path)
  const was = kept.get(path)
  if (was !== undefined && was.size === found.size && was.written === found.mtimeMs) return was.conversation
  const entries = await entriesOf(path)
  const cost = costOf(entries)
  const { goal } = goalOf(entries)
  const quietFor = Date.now() - found.mtimeMs
  const conversation = {
    items: replayClaude(root, entries, quietFor),
    ...(cost === undefined ? {} : { cost }),
    ...(goal === undefined ? {} : { goal }),
  }
  // One read while it may still be going is read again, as it says Stopped once it has been quiet a minute.
  kept.delete(path)
  if (quietFor > STILL_GOING) kept.set(path, { size: found.size, written: found.mtimeMs, conversation })
  if (kept.size > KEEP) kept.delete(kept.keys().next().value ?? '')
  return conversation
}

/** Where a conversation's goal stands, from its lines about goals alone. */
export async function readGoal(root: string, id: string): Promise<GoalRead> {
  const path = await claudeFile(root, id)
  if (path === undefined) return {}
  return goalOf(await entriesOf(path, (line) => line.includes('"goal_status"')))
}
