import { existsSync, readFileSync, statSync } from 'node:fs'
import { connect } from 'node:net'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

import type { SessionItem, SessionStatus } from '../shared/api'
import { claudeFile, listClaude, readClaudeSession, readSessionAt, slug } from '../main/sessions/disk'
import type { Found } from '../main/sessions/disk'
import { belowRoot } from '../main/sessions'
import type { Move } from '../main/sessions'
import { hostOf, isRemote, pathOf } from '../shared/hosts'
import { answerLines, tasksFrom } from './start'
import type { Answer } from './start'

/**
 * GeckIt from a command line, for a session that is asked about the work
 * itself: what was done today, what is still in review, what was said in one
 * of them.
 *
 * It reads the same two files the application does: the conversations are
 * Claude Code's own, and GeckIt's marks are in its settings folder. The one
 * thing that changes anything is `start`, which asks the running application
 * and waits for the person to answer there.
 */

interface Note {
  readonly title?: string
  readonly hidden?: boolean
  readonly status?: SessionStatus
  readonly created?: number
  readonly moves?: readonly Move[]
  readonly parent?: string
  readonly requests?: readonly { readonly item: SessionItem }[]
}

interface Row extends Found {
  readonly root: string
  readonly status?: SessionStatus
  readonly created?: number
  readonly moves: readonly Move[]
  readonly favorite: boolean
  /** Where it actually ran, for one started in a folder below the project's own: `sessions/index.ts`'s `belowRoot` turns this into a root. */
  readonly below?: string
}

/** The root a row's own file is under: the project's, unless it ran in a folder below it. */
const effectiveRoot = (row: Row): string => (row.below === undefined ? row.root : belowRoot(row.root, row.below))

const data = (): string => {
  const said = process.env['GECKIT_DATA']
  if (said !== undefined && said !== '') return said
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'geckit')
  if (process.platform === 'win32') return join(process.env['APPDATA'] ?? homedir(), 'geckit')
  return join(process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), 'geckit')
}

function kept<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(join(data(), name), 'utf8')) as T
  } catch {
    return fallback
  }
}

/** A host's own mirror of Claude Code's conversation files, kept beside GeckIt's own settings. */
const hostFolder = (host: string): string => join(data(), 'hosts', host)

/** Where a conversation started on a host is mirrored here, as `HostDisk` lays it out. */
function hostFile(root: string, id: string): string | undefined {
  const host = hostOf(root)
  return host === undefined ? undefined : join(hostFolder(host), 'projects', slug(pathOf(root)), `${id}.jsonl`)
}

/**
 * A project's conversations, read the way the window would: this computer's
 * own folder for a local one, or the last listing fetched from a host's,
 * kept here in the same shape whether or not the host can be reached now.
 */
async function projectRows(root: string): Promise<(Found & { readonly below?: string })[]> {
  const host = hostOf(root)
  if (host === undefined) return listClaude(root).catch(() => [])
  const path = join(hostFolder(host), 'listed', `${slug(pathOf(root))}.json`)
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as (Found & { readonly below?: string })[]
  } catch {
    return []
  }
}

async function rows(): Promise<Row[]> {
  const settings = kept<{ projects?: string[]; favorites?: string[] }>('settings.json', {})
  const projects = settings.projects ?? []
  const favorites = new Set(settings.favorites ?? [])
  const notes = kept<Record<string, Note>>('sessions.json', {})
  const all: Row[] = []
  for (const root of projects) {
    for (const found of await projectRows(root)) {
      const note = notes[found.id]
      if (note?.hidden === true) continue
      all.push({
        ...found,
        root,
        title: note?.title ?? found.title,
        ...(note?.status === undefined ? {} : { status: note.status }),
        ...(note?.created === undefined ? {} : { created: note.created }),
        moves: note?.moves ?? [],
        favorite: favorites.has(found.id),
      })
    }
  }
  return all.sort((one, other) => other.at - one.at)
}

const midnight = (): number => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today.getTime()
}

/** `2d`, `36h`, `90m` - how far back to look, as a moment in time. */
export function since(said: string): number | undefined {
  const found = /^(\d+)([dhm])$/.exec(said.trim())
  if (found === null) return undefined
  const many = Number(found[1])
  const each = found[2] === 'd' ? 86_400_000 : found[2] === 'h' ? 3_600_000 : 60_000
  return Date.now() - many * each
}

const when = (at: number): string => new Date(at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })

/**
 * When it was started: GeckIt's own record, or for one it never saw begin,
 * when the tool made its file. For a host row that is the mirror kept here,
 * whose own birth is when it was last fetched and not when the conversation
 * was - so that falls back to the row's own time instead of saying something
 * false.
 */
async function started(row: Row): Promise<number | undefined> {
  if (row.created !== undefined) return row.created
  const root = effectiveRoot(row)
  if (isRemote(root)) return row.at
  const path = await claudeFile(root, row.id)
  if (path === undefined) return undefined
  try {
    return statSync(path).birthtimeMs
  } catch {
    return undefined
  }
}

/** Every column it stood in and since when, the start first. */
async function history(row: Row): Promise<{ readonly status: string; readonly at: string }[]> {
  const began = await started(row)
  const moves = row.moves.map((move) => ({ status: move.status === 'progress' ? 'in progress' : move.status, at: move.at }))
  const all = began === undefined || moves.some((move) => move.at <= began) ? moves : [{ status: 'created', at: began }, ...moves]
  return all.map((one) => ({ status: one.status, at: new Date(one.at).toISOString() }))
}

/** What a row is doing, in one word, from GeckIt's mark where it has one. */
const standing = (row: Row): string => row.status ?? 'in progress'

function table(found: readonly Row[]): string {
  if (found.length === 0) return 'Nothing.'
  const said = found.map((row) => [row.favorite ? '*' : ' ', row.id.slice(0, 8), when(row.at), basename(row.root), standing(row), row.title])
  const wide = [0, 1, 2, 3, 4].map((at) => Math.max(...said.map((one) => (one[at] ?? '').length)))
  return said
    .map((one) => one.map((cell, at) => (at === 5 ? cell : cell.padEnd(wide[at] ?? 0))).join('  '))
    .join('\n')
}

const HELP = `geckit - what GeckIt holds, read from a command line.

  geckit sessions [--today] [--since 2d] [--project <name>] [--status review|blocked|done] [--favorites] [--json]
      The conversations, the newest first: a * for a favorite, id, when it last changed, project, how it stands, title.
      --favorites keeps only the favorites.
      --today is since midnight. --since takes 2d, 36h or 90m; one moved between columns in that time counts too.
      --json adds history: when it was created and every move between columns, with the time of each.

  geckit show <id> [--last <n>] [--json]
      When it was created and moved between columns, then what was said in it, the person and Claude, without what the tools printed.
      The id is the one sessions prints; the first few characters are enough. --last keeps only the last n things said.

  geckit start --project <name> [--title <title>] [--goal <condition>] <text>
  geckit start --conversations <file> [--json]
      Asks GeckIt to start conversations, one or a batch of up to 20, and waits for the answer.
      The file, or - for stdin, is an array of { "project", "title", "text", "goal" }.
      GeckIt shows the request in this conversation; nothing starts until the person answers there.
      Prints a line per conversation in the order sent, started or queued with its id, or refused, with the person's note, then their reply.

  geckit linked [<id>] [--json]
      The conversation this one was started from, the ones it started and how each stands, and what it asked for and was refused.

Nothing but start writes anything.`

async function sessions(args: readonly string[]): Promise<string> {
  const has = (flag: string): boolean => args.includes(flag)
  const value = (flag: string): string | undefined => {
    const at = args.indexOf(flag)
    return at < 0 ? undefined : args[at + 1]
  }
  const from = has('--today') ? midnight() : since(value('--since') ?? '')
  const project = value('--project')
  const status = value('--status')
  const favorites = has('--favorites')
  const found = (await rows()).filter(
    (row) =>
      (from === undefined || row.at >= from || row.moves.some((move) => move.at >= from)) &&
      (project === undefined || basename(row.root).toLowerCase().includes(project.toLowerCase())) &&
      (status === undefined || row.status === status) &&
      (!favorites || row.favorite),
  )
  if (!has('--json')) return table(found)
  const said = await Promise.all(
    found.map(async (row) => ({
      id: row.id,
      at: new Date(row.at).toISOString(),
      project: basename(row.root),
      root: row.root,
      status: standing(row),
      title: row.title,
      favorite: row.favorite,
      last: row.stands,
      history: await history(row),
    })),
  )
  return JSON.stringify(said, undefined, 2)
}

async function show(args: readonly string[]): Promise<string> {
  const asked = args.find((one, at) => !one.startsWith('--') && args[at - 1] !== '--last')
  if (asked === undefined) return 'Which conversation? Give the id that sessions prints.'
  const found = (await rows()).filter((row) => row.id.startsWith(asked))
  const row = found[0]
  if (row === undefined) return `No conversation starts with ${asked}.`
  if (found.length > 1) return `${asked} could be any of ${found.length} conversations. Give more of the id.`
  const root = effectiveRoot(row)
  const remote = isRemote(root)
  const path = remote ? hostFile(root, row.id) : await claudeFile(root, row.id)
  if (path === undefined) return 'Claude Code has no file for it any more.'
  if (remote && !existsSync(path)) return 'Its conversation has not been opened in GeckIt yet.'
  const conversation = await (remote ? readSessionAt(path, pathOf(root)) : readClaudeSession(root, row.id)).catch(() => undefined)
  const items = conversation?.items ?? []
  const every = items.flatMap((item) =>
    item.kind === 'mine' || item.kind === 'theirs' ? [{ who: item.kind === 'mine' ? 'Alex' : 'Claude', text: item.text }] : [],
  )
  const last = Number(args[args.indexOf('--last') + 1])
  const said = args.includes('--last') && Number.isInteger(last) && last > 0 ? every.slice(-last) : every
  const moved = await history(row)
  if (args.includes('--json')) {
    return JSON.stringify({ id: row.id, project: basename(row.root), status: standing(row), title: row.title, favorite: row.favorite, history: moved, said }, undefined, 2)
  }
  return [
    `${row.title}  (${basename(row.root)}, ${standing(row)}, ${row.favorite ? 'favorite, ' : ''}${when(row.at)})`,
    ...moved.map((one) => `  ${when(Date.parse(one.at))}  ${one.status}`),
    '',
    ...said.map((one) => `${one.who}:\n${one.text}\n`),
  ].join('\n')
}

/** One request to the running application, answered once the person has answered it there. */
function start(args: readonly string[]): Promise<{ readonly said: string; readonly ok: boolean }> {
  const tasks = tasksFrom(args, (file) => readFileSync(file === '-' ? 0 : file, 'utf8'))
  if (typeof tasks === 'string') return Promise.resolve({ ok: false, said: tasks })
  const from = process.env['CLAUDE_CODE_SESSION_ID']
  if (from === undefined || from === '') return Promise.resolve({ ok: false, said: 'Run this from a Claude Code session.' })
  return new Promise((done) => {
    const socket = connect(join(data(), 'geckit.sock'))
    let rest = ''
    socket.setEncoding('utf8')
    socket.on('connect', () => socket.write(`${JSON.stringify({ from, tasks })}\n`))
    socket.on('data', (part: string) => {
      rest += part
    })
    socket.on('end', () => {
      try {
        const answer = JSON.parse(rest) as Answer
        done(answer.ok ? { ok: true, said: answerLines(answer, args.includes('--json')) } : { ok: false, said: answer.error ?? 'Not started.' })
      } catch {
        done({ ok: false, said: 'GeckIt closed before answering.' })
      }
    })
    socket.on('error', () => done({ ok: false, said: 'GeckIt is not running, so there is nobody to ask.' }))
  })
}

/** What a conversation is linked to: the one that asked for it, the ones it asked for, and what it was refused. */
async function linked(args: readonly string[]): Promise<string> {
  const asked = args.find((one) => !one.startsWith('--')) ?? process.env['CLAUDE_CODE_SESSION_ID']
  if (asked === undefined || asked === '') return 'Run this from a Claude Code session, or give an id.'
  const notes = kept<Record<string, Note>>('sessions.json', {})
  const all = await rows()
  const me = all.find((row) => row.id.startsWith(asked))?.id ?? asked
  const said = (row: Row): { id: string; project: string; status: string; title: string } => ({
    id: row.id,
    project: basename(row.root),
    status: standing(row),
    title: row.title,
  })
  const up = notes[me]?.parent
  const parentRow = up === undefined ? undefined : all.find((row) => row.id === up)
  const parent = parentRow === undefined ? undefined : said(parentRow)
  const started = all.filter((row) => notes[row.id]?.parent === me).map(said)
  const requests = (notes[me]?.requests ?? []).flatMap((one) => (one.item.kind === 'request' ? [one.item] : []))
  const answered = requests.filter((item) => item.answer?.how === 'answered').flatMap((item) => item.tasks)
  const refused = answered.filter((task) => task.started === undefined).map((task) => ({ project: task.project, title: task.title }))
  const replies = requests.flatMap((item) => (item.answer?.reply === undefined ? [] : [item.answer.reply]))
  if (args.includes('--json')) return JSON.stringify({ parent: parent ?? null, started, refused, replies }, undefined, 2)
  const lines = [
    ...(parent === undefined ? [] : [['parent', parent.id, parent.project, parent.status, parent.title]]),
    ...started.map((one) => ['started', one.id, one.project, one.status, one.title]),
    ...refused.map((one) => ['refused', '-', one.project, one.title]),
    ...replies.map((one) => ['replied', one]),
  ]
  if (lines.length === 0) return 'Nothing is linked to this conversation.'
  return lines.map(([head = '', ...cells]) => [head.padEnd(8), ...cells].join('  ')).join('\n')
}

export async function run(args: readonly string[]): Promise<string> {
  const [what, ...rest] = args
  if (what === 'sessions') return sessions(rest)
  if (what === 'show') return show(rest)
  if (what === 'linked') return linked(rest)
  return HELP
}

const [what, ...rest] = process.argv.slice(2)
if (what === 'start') {
  const answer = await start(rest)
  process.stdout.write(`${answer.said}\n`)
  process.exitCode = answer.ok ? 0 : 1
} else {
  const answer = await run(process.argv.slice(2))
  process.stdout.write(`${answer}\n`)
}
