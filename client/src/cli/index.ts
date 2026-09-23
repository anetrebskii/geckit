import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

import type { SessionStatus } from '../shared/api'
import { claudeFile, listClaude, readClaudeSession } from '../main/sessions/disk'
import type { Found } from '../main/sessions/disk'

/**
 * GeckIt from a command line, for a session that is asked about the work
 * itself: what was done today, what is still in review, what was said in one
 * of them.
 *
 * It reads the same two files the application does and never writes: the
 * conversations are Claude Code's own, and GeckIt's marks are in its settings
 * folder. The window does not have to be open, and nothing here can change
 * what is in it.
 */

interface Note {
  readonly title?: string
  readonly hidden?: boolean
  readonly status?: SessionStatus
}

interface Row extends Found {
  readonly root: string
  readonly status?: SessionStatus
}

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

async function rows(): Promise<Row[]> {
  const projects = kept<{ projects?: string[] }>('settings.json', {}).projects ?? []
  const notes = kept<Record<string, Note>>('sessions.json', {})
  const all: Row[] = []
  for (const root of projects) {
    for (const found of await listClaude(root).catch(() => [])) {
      const note = notes[found.id]
      if (note?.hidden === true) continue
      all.push({ ...found, root, title: note?.title ?? found.title, ...(note?.status === undefined ? {} : { status: note.status }) })
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

/** What a row is doing, in one word, from GeckIt's mark where it has one. */
const standing = (row: Row): string => row.status ?? 'in progress'

function table(found: readonly Row[]): string {
  if (found.length === 0) return 'Nothing.'
  const said = found.map((row) => [row.id.slice(0, 8), when(row.at), basename(row.root), standing(row), row.title])
  const wide = [0, 1, 2, 3].map((at) => Math.max(...said.map((one) => (one[at] ?? '').length)))
  return said
    .map((one) => one.map((cell, at) => (at === 4 ? cell : cell.padEnd(wide[at] ?? 0))).join('  '))
    .join('\n')
}

const HELP = `geckit - what GeckIt holds, read from a command line.

  geckit sessions [--today] [--since 2d] [--project <name>] [--status review|blocked|done] [--json]
      The conversations, the newest first: id, when it last changed, project, how it stands, title.
      --today is since midnight. --since takes 2d, 36h or 90m.

  geckit show <id> [--json]
      What was said in one conversation, the person and Claude, without what the tools printed.
      The id is the one sessions prints; the first few characters are enough.

Nothing here writes anything.`

async function sessions(args: readonly string[]): Promise<string> {
  const has = (flag: string): boolean => args.includes(flag)
  const value = (flag: string): string | undefined => {
    const at = args.indexOf(flag)
    return at < 0 ? undefined : args[at + 1]
  }
  const from = has('--today') ? midnight() : since(value('--since') ?? '')
  const project = value('--project')
  const status = value('--status')
  const found = (await rows()).filter(
    (row) =>
      (from === undefined || row.at >= from) &&
      (project === undefined || basename(row.root).toLowerCase().includes(project.toLowerCase())) &&
      (status === undefined || row.status === status),
  )
  return has('--json')
    ? JSON.stringify(
        found.map((row) => ({ id: row.id, at: new Date(row.at).toISOString(), project: basename(row.root), root: row.root, status: standing(row), title: row.title, last: row.stands })),
        undefined,
        2,
      )
    : table(found)
}

async function show(args: readonly string[]): Promise<string> {
  const asked = args.find((one) => !one.startsWith('--'))
  if (asked === undefined) return 'Which conversation? Give the id that sessions prints.'
  const found = (await rows()).filter((row) => row.id.startsWith(asked))
  const row = found[0]
  if (row === undefined) return `No conversation starts with ${asked}.`
  if (found.length > 1) return `${asked} could be any of ${found.length} conversations. Give more of the id.`
  if ((await claudeFile(row.root, row.id)) === undefined) return 'Claude Code has no file for it any more.'
  const items = (await readClaudeSession(row.root, row.id))?.items ?? []
  const said = items.flatMap((item) =>
    item.kind === 'mine' || item.kind === 'theirs' ? [{ who: item.kind === 'mine' ? 'Alex' : 'Claude', text: item.text }] : [],
  )
  if (args.includes('--json')) {
    return JSON.stringify({ id: row.id, project: basename(row.root), status: standing(row), title: row.title, said }, undefined, 2)
  }
  return [`${row.title}  (${basename(row.root)}, ${standing(row)}, ${when(row.at)})`, '', ...said.map((one) => `${one.who}:\n${one.text}\n`)].join('\n')
}

export async function run(args: readonly string[]): Promise<string> {
  const [what, ...rest] = args
  if (what === 'sessions') return sessions(rest)
  if (what === 'show') return show(rest)
  return HELP
}

const answer = await run(process.argv.slice(2))
process.stdout.write(`${answer}\n`)
