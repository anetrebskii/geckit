import { open, readdir, realpath, rm, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { BackgroundTask, SessionGoal, SessionItem, WorkItem } from '../../shared/api'
import type { Link } from '../../shared/links'
import { linksInText, workItem } from '../../shared/links'
import { costOf, goalOf, lastContext, lastSaid, replayClaude, saidIn, STILL_GOING, tasksOf, typed } from './claude-read'
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
  /** The folder it was started in, as the tool wrote it down. */
  readonly cwd?: string
}

const string = (value: unknown): string => (typeof value === 'string' ? value : '')

export const slug = (root: string): string => root.replace(/[^A-Za-z0-9]/g, '-')

// Somebody who keeps the tool's folder elsewhere says so the way the tool asks them to.
const base = (): string => join(process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude'), 'projects')

/** The folder under the name it was started in, and under the one it resolves to. */
async function names(root: string): Promise<string[]> {
  const real = await realpath(root).catch(() => root)
  return [...new Set([root, real])]
}

/** Where the tool files this folder, under the name it was started in or the one it resolves to. */
export async function folders(root: string): Promise<string[]> {
  return (await names(root)).map((path) => join(base(), slug(path)))
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
export const EDGE = 64 * 1024

/** How many conversations are read for the list. */
const MOST = 200

/** The lines of a window into a file: one that starts past the beginning or ends before the end starts and ends mid-line. */
function linesIn(bytes: Buffer, from: number, size: number, keepCut: (cut: string) => void): Json[] {
  const whole = bytes.toString('utf8').split('\n')
  if (from > 0) whole.shift()
  if (from + bytes.length < size && from === 0) keepCut(whole.pop() ?? '')
  else if (from + bytes.length < size) whole.pop()
  return whole.flatMap((line) => {
    try {
      return line.trim() === '' ? [] : [JSON.parse(line) as Json]
    } catch {
      return []
    }
  })
}

/** The two ends of a file, as a row is read from them: the file's first part, and its last where it is longer than both. */
export interface Edges {
  readonly head: Json[]
  readonly tail: Json[]
  readonly cut: string
}

/** The ends of a file from its bytes: all of it where it is short, or its first and last `EDGE` bytes. */
export function edgesOf(head: Buffer, tail: Buffer | undefined, size: number): Edges {
  let cut = ''
  const keep = (line: string): void => {
    cut = line
  }
  if (tail === undefined || size <= EDGE * 2) return { head: linesIn(head, 0, size, keep), tail: [], cut }
  const first = linesIn(head, 0, size, keep)
  return { head: first, tail: linesIn(tail, size - tail.length, size, keep), cut }
}

export async function edges(path: string, size: number): Promise<Edges> {
  const file = await open(path, 'r')
  try {
    const part = async (from: number, length: number): Promise<Buffer> => {
      const { buffer, bytesRead } = await file.read(Buffer.alloc(length), 0, length, from)
      return buffer.subarray(0, bytesRead)
    }
    if (size <= EDGE * 2) return edgesOf(await part(0, size), undefined, size)
    return edgesOf(await part(0, EDGE), await part(size - EDGE, EDGE), size)
  } finally {
    await file.close()
  }
}

/** The words of a message with a picture, which runs past the end of the head; they come before the picture. */
function cutWords(line: string): string {
  if (!line.includes('"type":"user"') || line.includes('"isSidechain":true') || line.includes('"isMeta":true')) return ''
  const found = /"content":\[\{"type":"text","text":("(?:[^"\\]|\\.)*")/.exec(line)?.[1]
  if (found === undefined) return ''
  const words = string(JSON.parse(found))
  return /^\s*(<|\[Request interrupted|Caveat:)/.test(words) ? '' : words
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

interface Kept {
  readonly id: string
  readonly path: string
  readonly at: number
  readonly size: number
}

async function filesIn(folder: string): Promise<Kept[]> {
  const files: Kept[] = []
  for (const name of await readdir(folder).catch(() => [])) {
    if (!name.endsWith('.jsonl')) continue
    const path = join(folder, name)
    const found = await stat(path).catch(() => undefined)
    if (found?.isFile() !== true || found.size === 0) continue
    files.push({ id: name.slice(0, -'.jsonl'.length), path, at: found.mtimeMs, size: found.size })
  }
  return files
}

const within = (path: string, folder: string): boolean => path === folder || path.startsWith(`${folder}/`)

/**
 * Every conversation the tool has about this folder, newest first, and the ones
 * started in a folder below it, which say where in `below`.
 */
export async function listClaude(root: string): Promise<(Found & { readonly below?: string })[]> {
  const heads = await names(root)
  const own = heads.map(slug)
  // The tool files a folder below under a name that starts with this one's, as does a folder beside it named the same and more.
  const near = (await readdir(base()).catch(() => [])).filter((name) => own.some((one) => name.startsWith(`${one}-`)))
  const files = [
    ...(await Promise.all(own.map((name) => filesIn(join(base(), name))))).flat(),
    ...(await Promise.all(near.map(async (name) => (await filesIn(join(base(), name))).map((file) => ({ ...file, near: true }))))).flat(),
  ]
  const below = (cwd: string | undefined): string | undefined =>
    cwd !== undefined && !heads.includes(cwd) && heads.some((head) => within(cwd, head)) ? cwd : undefined
  const found = await rowsOf(files, (row, file) => !('near' in file) || below(row.cwd) !== undefined, MOST)
  return found.map((row) => {
    const at = below(row.cwd)
    return at === undefined ? row : { ...row, below: at }
  })
}

/** Where the system keeps what it throws away soon: helpers' scratch folders and test runs, nothing to resume. */
const TEMPORARY = ['/private/tmp/', '/private/var/folders/', '/tmp/', '/var/folders/']

/**
 * Every conversation the tool has kept that was last written from one time up
 * to another, in whatever folder, but a temporary one. `wanted` passes over
 * the ones already known before their files are read.
 */
export async function everyClaude(from: number, to: number, wanted: (id: string) => boolean): Promise<Found[]> {
  const temporary = TEMPORARY.map((path) => slug(path))
  const kept = (await readdir(base()).catch(() => [])).filter((name) => !temporary.some((one) => name.startsWith(one)))
  const files = (await Promise.all(kept.map((name) => filesIn(join(base(), name)))))
    .flat()
    .filter((file) => file.at >= from && file.at < to && wanted(file.id))
  return rowsOf(files, (row) => row.cwd !== undefined && !TEMPORARY.some((path) => `${row.cwd ?? ''}/`.startsWith(path)), Infinity)
}

/** The rows of these files, newest first, as many as are asked for of those `kept` keeps. */
async function rowsOf<File extends Kept>(files: File[], kept: (row: Found, file: File) => boolean, most: number): Promise<Found[]> {
  files.sort((one, other) => other.at - one.at)
  const found: Found[] = []
  for (const file of files) {
    if (found.length >= most) break
    const row = rowFrom(file, await edges(file.path, file.size).catch(() => ({ head: [], tail: [], cut: '' })))
    if (row !== undefined && kept(row, file)) found.push(row)
  }
  return found
}

/** A conversation's row from the two ends of its file, or nothing for a file with nobody in it. */
export function rowFrom(file: { readonly id: string; readonly at: number }, { head, tail, cut }: Edges): Found | undefined {
  const all = [...head, ...tail]
  const named = (type: string, key: string): string =>
    string([...all].reverse().find((entry) => string(entry['type']) === type)?.[key])

  const asked = head.map(typed).find((words) => words.trim() !== '') || cutWords(cut)
  // A first message that is one pasted file fills the head on its own, and the
  // words are past the end of it; the other end still has some.
  const said = asked || (tail.map(typed).find((words) => words.trim() !== '') ?? '')
  const title = named('custom-title', 'customTitle') || named('ai-title', 'aiTitle') || firstLine(said, 80)
  // A file with nobody in it: opened and closed, or the tool's own bookkeeping.
  if (title === '') return undefined

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
  const cwd = string(all.find((entry) => string(entry['cwd']) !== '')?.['cwd'])
  return {
    id: file.id,
    title,
    stands: lastSaid(tail.length > 0 ? tail : head) || firstLine(named('last-prompt', 'lastPrompt')),
    at: file.at,
    driven: entrypoint.startsWith('sdk'),
    ...(model === undefined ? {} : { model }),
    ...(used === undefined ? {} : { used }),
    ...(work === undefined ? {} : { work }),
    ...(cwd === '' ? {} : { cwd }),
  }
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
  /** What it put in the background, all of it ended: the process that held them is gone. */
  readonly tasks: BackgroundTask[]
}

/** One conversation, whole. Undefined where the tool has no file for it. */
/** The last conversations read, by file, reused while the file is as it was; a hundred megabytes takes a quarter of a second to read again. */
const kept = new Map<string, { readonly size: number; readonly written: number; readonly conversation: Conversation }>()
const KEEP = 8

export async function readClaudeSession(root: string, id: string): Promise<Conversation | undefined> {
  const path = await claudeFile(root, id)
  return path === undefined ? undefined : readSessionAt(path, root)
}

/** One conversation from its file, wherever the file is; `root` is the folder its paths are shown from. */
export async function readSessionAt(path: string, root: string): Promise<Conversation> {
  const found = await stat(path)
  const was = kept.get(path)
  if (was !== undefined && was.size === found.size && was.written === found.mtimeMs) return was.conversation
  const entries = await entriesOf(path)
  const cost = costOf(entries)
  const { goal } = goalOf(entries)
  const quietFor = Date.now() - found.mtimeMs
  const conversation = {
    items: replayClaude(root, entries, quietFor),
    tasks: tasksOf(entries),
    ...(cost === undefined ? {} : { cost }),
    ...(goal === undefined ? {} : { goal }),
  }
  // One read while it may still be going is read again, as it says Stopped once it has been quiet a minute.
  kept.delete(path)
  if (quietFor > STILL_GOING) kept.set(path, { size: found.size, written: found.mtimeMs, conversation })
  if (kept.size > KEEP) kept.delete(kept.keys().next().value ?? '')
  return conversation
}

/** The links read out of a file, kept while the file is as it was: a card asks for its count on every list. */
const linked = new Map<string, { readonly size: number; readonly written: number; readonly links: Link[] }>()

/**
 * The links written in a conversation, from the lines that carry one. A
 * hundred megabytes is read in a quarter of a second this way, where replaying
 * the whole of it to the same end takes several.
 */
export async function readLinks(root: string, id: string): Promise<Link[]> {
  const path = await claudeFile(root, id)
  return path === undefined ? [] : linksAt(path)
}

/** The links written in a conversation's file, wherever the file is. */
export async function linksAt(path: string): Promise<Link[]> {
  const found = await stat(path)
  const was = linked.get(path)
  if (was !== undefined && was.size === found.size && was.written === found.mtimeMs) return was.links
  const entries = await entriesOf(path, (line) => line.includes('http'))
  const links = linksInText(entries.map(saidIn))
  linked.delete(path)
  linked.set(path, { size: found.size, written: found.mtimeMs, links })
  if (linked.size > LINKED) linked.delete(linked.keys().next().value ?? '')
  return links
}

const LINKED = 200

/** Where a conversation's goal stands, from its lines about goals alone. */
export async function readGoal(root: string, id: string): Promise<GoalRead> {
  const path = await claudeFile(root, id)
  return path === undefined ? {} : goalAt(path)
}

export async function goalAt(path: string): Promise<GoalRead> {
  return goalOf(await entriesOf(path, (line) => line.includes('"goal_status"')))
}

/**
 * The last message of a conversation written by `at`, for a copy of it to end
 * on. An answer still waiting on a tool at that moment is left out with the
 * whole of its message, since a copy cannot end on a call with no result.
 */
export async function forkPoint(root: string, id: string, at: number): Promise<string | undefined> {
  const path = await claudeFile(root, id)
  return path === undefined ? undefined : forkPointAt(path, at)
}

export async function forkPointAt(path: string, at: number): Promise<string | undefined> {
  const said = (await entriesOf(path, (line) => line.includes('"uuid"'))).filter(
    (entry) =>
      (entry['type'] === 'user' || entry['type'] === 'assistant') &&
      entry['isSidechain'] !== true &&
      typeof entry['uuid'] === 'string' &&
      Date.parse(String(entry['timestamp'])) <= at,
  )
  const messageOf = (entry: Json): unknown => (entry['message'] as Json | undefined)?.['id']
  const calls = (entry: Json): boolean => {
    const content = (entry['message'] as Json | undefined)?.['content']
    return Array.isArray(content) && content.some((block) => (block as Json | null)?.['type'] === 'tool_use')
  }
  let end = said.length - 1
  const last = said[end]
  if (last?.['type'] === 'assistant' && said.some((entry) => entry['type'] === 'assistant' && messageOf(entry) === messageOf(last) && calls(entry))) {
    while (end >= 0 && said[end]?.['type'] === 'assistant' && messageOf(said[end] as Json) === messageOf(last)) end -= 1
  }
  const point = said[end]?.['uuid']
  return typeof point === 'string' ? point : undefined
}
