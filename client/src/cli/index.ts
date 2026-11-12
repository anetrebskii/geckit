import { product } from './product'
import { productCommand, PRODUCT_COMMANDS } from '../shared/product-cli'
import { formatStatusMove } from '../shared/status-history'
import { remoteCli, remoteCommand } from './remote'
import { defaultDataDirectory } from '../core/platform'
import { readPreferences } from '../core/configuration'
import { service } from './service'
import { readSettings } from './settings'
import { readEmployees } from './employees'
import { PROMPTS } from '../prompts/prompts'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { connect } from 'node:net'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { providerOf } from '../shared/api'
import type { ChatSession, SessionItem, SessionStatus } from '../shared/api'
import { claudeFile, listClaude, readClaudeSession, readSessionAt, slug } from '../main/sessions/disk'
import type { Conversation, Found } from '../main/sessions/disk'
import type { Move, SessionNote } from '../main/sessions'
import { CodexSessions } from '../main/sessions/codex'
import { belowRoot, hostOf, isRemote, pathOf } from '../shared/hosts'
import { askedEndpoint } from './endpoint'
import { answerLines, appNamed, requestingSession, tasksFrom } from './start'
import type { Answer } from './start'
import { migrate } from './migrate'
import { manage, managerCommand } from './manage'
import { browser, browserHost } from './browser'
import { testBrowser } from './testing'
import { computerArg, onComputer } from './computer'

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

let codex: CodexSessions | undefined
const codexClient = (): CodexSessions => codex ??= new CodexSessions()

const data = defaultDataDirectory

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
  const settings = readPreferences(data(), false) ?? {}
  const projects = settings.projects ?? []
  const favorites = new Set(settings.favorites ?? [])
  const notes = kept<Record<string, SessionNote>>('sessions.json', {})
  const found: (Found & { root: string; created?: number; below?: string })[] = []
  if (settings.chatProviders === undefined || settings.chatProviders.includes('claude')) for (const root of projects) found.push(...(await projectRows(root)).map((one) => ({ ...one, root })))
  if (settings.chatProviders === undefined || settings.chatProviders.includes('codex')) found.push(...await codexClient().list(projects.filter((root) => !isRemote(root))))
  if ((settings.providerPlugins?.length ?? 0) > 0) {
    const reply = await product(['sessions', 'list'], data())
    if (!reply.ok) throw new Error(`Provider history needs the running GeckIt service: ${reply.said}`)
    const current = JSON.parse(reply.said) as readonly ChatSession[]
    for (const one of current) if (providerOf(one.id).startsWith('plugin:')) found.push({ id: one.id, root: one.root, title: one.title, stands: one.stands, at: one.at, driven: one.here })
  }
  const all: Row[] = []
  for (const one of found) {
    const note = notes[one.id]
    if (note?.hidden === true) continue
    all.push({
      ...one,
      title: note?.title ?? one.title,
      ...(note?.status === undefined ? {} : { status: note.status }),
      ...(note?.created === undefined ? {} : { created: note.created }),
      moves: note?.moves ?? [],
      favorite: favorites.has(one.id),
    })
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
  if (providerOf(row.id) === 'codex') return undefined
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
async function history(row: Row): Promise<{ readonly status: string; readonly at: string; readonly detail?: string; readonly move?: Move }[]> {
  const began = await started(row)
  const moves = row.moves.map((move) => ({ status: move.status === 'progress' ? 'in progress' : move.status, at: move.at, detail: formatStatusMove(move), move }))
  const all = began === undefined || moves.some((move) => move.at <= began) ? moves : [{ status: 'created', at: began }, ...moves]
  return all.map((one) => ({ ...one, at: new Date(one.at).toISOString() }))
}

/** What a row is doing, in one word, from GeckIt's mark where it has one. */
// What an earlier build kept as In review is In progress now.
const standing = (row: Row): string => (row.status === 'todo' || row.status === 'blocked' || row.status === 'done' || row.status === 'archived' ? row.status : 'in progress')

function table(found: readonly Row[]): string {
  if (found.length === 0) return 'Nothing.'
  const said = found.map((row) => [row.favorite ? '*' : ' ', providerOf(row.id) === 'claude' ? row.id.slice(0, 8) : row.id, when(row.at), basename(row.root), standing(row), row.title])
  const wide = [0, 1, 2, 3, 4].map((at) => Math.max(...said.map((one) => (one[at] ?? '').length)))
  return said
    .map((one) => one.map((cell, at) => (at === 5 ? cell : cell.padEnd(wide[at] ?? 0))).join('  '))
    .join('\n')
}

const HELP = `geckit service - control a running headless service (run service help for commands).\n\ngeckit - what GeckIt holds, read from a command line.

  --host <id-or-name> selects one paired GeckIt computer; --host local selects this computer.
  --computer remains a compatible alias. No local fallback on target errors.

  geckit browser <command>
      The person's own Chrome through the GeckIt Browser extension: tabs, page text, clicks, typing, screenshots. geckit browser help lists the commands.

  geckit sessions [--today] [--since 2d] [--project <name>] [--provider claude|codex] [--status todo|blocked|done|archived] [--favorites] [--json]
      The conversations, the newest first: a * for a favorite, id, when it last changed, project, how it stands, title.
      --favorites keeps only the favorites.
      --today is since midnight. --since takes 2d, 36h or 90m; one moved between columns in that time counts too.
      --json adds history: when it was created and every move between columns, with the time of each.

  geckit show <id> [--last <n>] [--json]
      When it was created and moved between columns, then what the person and assistant said, without what the tools printed.
      The id is the one sessions prints; the first few characters are enough. --last keeps only the last n things said.

  geckit start --project <name> [--title <title>] [--goal <condition>] [--provider <provider>] <text>
  geckit start --conversations <file> [--json]
      Asks GeckIt to start conversations, one or a batch of up to 20, and waits for the answer.
      The file, or - for stdin, is an array of { "project", "title", "text", "goal", "provider" }.
      GeckIt shows the request in this conversation; nothing starts until the person answers there.
      Another program asks with --app <its name>: the request is a card of its own on the board, in the first project, gone once answered.
      Prints a line per conversation in the order sent, started or queued with its id, or refused, with the person's note, then their reply.

  geckit linked [<id>] [--json]
      The conversation this one was started from, the ones it started and how each stands, and what it asked for and was refused.

  geckit migrate-codex [--imports <file>] [--dry-run] [--json]
      Copies Claude conversation metadata to imported Codex conversations using Codex's import manifest.
      Preserves status, creation and move dates, titles, visibility and links. Moves favorites and board order to Codex.
      Existing Codex metadata is kept. --dry-run previews changes; applying saves a backup before writing.

  geckit settings schema|show
  geckit settings edit --patch <JSON-object> [--expected <JSON-object>]
      Read or patch supported preferences without product confirmation. Schema lists fields and boundaries.
      Arrays replace; maps merge entries. Read back after a write or uncertain response.

  geckit employees list|current|show <employee-id>|memory <employee-id> [--cursor <next>]
      Read employee roles, current assignment and available assigned conversation history from the running app.
      A next cursor continues history, including long messages; unavailable sources are named explicitly.

  geckit employees tasks <employee-id> [--json]
  geckit employees shortcuts [<employee-id>|none] [--json]
      An employee's conversations and how each stands; the shortcuts of one employee, of none, or all of them.

  geckit employees create --name <name> [--role <role>] [--description <text>|--description-file <file>] [--avatar <1-12>]
  geckit employees edit <employee-id> [--name <name>] [--role <role>] [--description <text>|--description-file <file>] [--avatar <1-12>]
  geckit employees archive|restore <employee-id>
  geckit employees assign <session-id> <employee-id|none>
  geckit employees manager [--json]
  geckit employees manager edit [--instructions <text>|--instructions-file <file>] [--avatar <1-12>]
  geckit employees shortcut add <employee-id|none> [--target manager|task] --name <name> --project <name> (--prompt <text>|--prompt-file <file>)
      [--goal <text>] [--every <when>|--cron "<expr>"] [--start-window-minutes <N|none>] [--provider <id>] [--model <id>] [--reasoning <effort>] [--mode manual|auto|plan]
  geckit employees shortcut edit <shortcut-id> [the same options as add; --every none makes it by hand only]
  geckit employees shortcut pause|resume|remove|run <shortcut-id>
  geckit employees shortcut give <shortcut-id> <employee-id|none>
      Change the team. <when> is "hour", "hour 15", "day 9:00", "weekdays 9:00" or "week monday 9:00".
      --start-window-minutes picks one random start within N minutes after each CRON time (1-1440); none restores exact timing.
      --project names a folder as geckit start does. An employee or shortcut may be named by its id or its exact name.
      Archiving pauses an employee's timetables until it is restored; nothing missed meanwhile is run.
      Manager's instructions are written into GECKIT.md for the Manager session; --instructions "" clears them.
      --goal "" removes a goal; --reasoning (Codex only) takes default, none, minimal, low, medium, high, xhigh, max or ultra.
      Settings (including Manager instructions/portrait) and shortcuts apply without product confirmation.
      Other team changes from a conversation are shown there and wait for the person's Allow;
      from a terminal it is made at once. Prints a line for what changed.

  geckit instructions [providers|app]
      Build instructions for AI agents. Includes plugin contract, independent Codex example and verification steps.
      providers is the default; app explains desktop and phone builds.

  Product configuration and control (operator terminal; same commands accept --host):
${PRODUCT_COMMANDS.map((one) => `    geckit ${one}`).join('\n')}
  Run capabilities on the selected target for schemas, authority and native-only boundaries.

  Manager sessions additionally use capabilities, providers, projects, files,
  sessions, settings, attachments, channels send-file and telegram through the running app's authenticated CLI interface.
  Run capabilities in Manager for supported operations and named limitations.

Outside Manager, product configuration/control commands, start, migrate-codex, settings edit and employee changes can write. Native permission answers remain in the bound human flow.
Authenticated Manager commands can make the changes advertised by capabilities.`

async function sessions(args: readonly string[]): Promise<string> {
  const has = (flag: string): boolean => args.includes(flag)
  const value = (flag: string): string | undefined => {
    const at = args.indexOf(flag)
    return at < 0 ? undefined : args[at + 1]
  }
  const from = has('--today') ? midnight() : since(value('--since') ?? '')
  const project = value('--project')
  const status = value('--status')
  const provider = value('--provider')
  const favorites = has('--favorites')
  const found = (await rows()).filter(
    (row) =>
      (from === undefined || row.at >= from || row.moves.some((move) => move.at >= from)) &&
      (project === undefined || basename(row.root).toLowerCase().includes(project.toLowerCase())) &&
      (status === undefined || row.status === status) &&
      (provider === undefined || providerOf(row.id) === provider) &&
      (!favorites || row.favorite),
  )
  if (!has('--json')) return table(found)
  const said = await Promise.all(
    found.map(async (row) => ({
      id: row.id,
      provider: providerOf(row.id),
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
  const found = (await rows()).filter((row) => row.id.startsWith(asked) || row.id.startsWith(`codex:${asked}`))
  const row = found[0]
  if (row === undefined) return `No conversation starts with ${asked}.`
  if (found.length > 1) return `${asked} could be any of ${found.length} conversations. Give more of the id.`
  const root = effectiveRoot(row)
  const remote = isRemote(root)
  const provider = providerOf(row.id)
  let conversation: Conversation | undefined
  if (provider.startsWith('plugin:')) {
    const reply = await product(['sessions', 'show', '--id', row.id, '--last', '1000'], data())
    if (!reply.ok) throw new Error(reply.said)
    const shown = JSON.parse(reply.said) as { readonly items: readonly SessionItem[] }
    conversation = { items: [...shown.items], tasks: [] }
  } else if (provider === 'codex') conversation = await codexClient().read(root, row.id)
  else {
    const path = remote ? hostFile(root, row.id) : await claudeFile(root, row.id)
    if (path === undefined) return 'Claude Code has no file for it any more.'
    if (remote && !existsSync(path)) return 'Its conversation has not been opened in GeckIt yet.'
    conversation = await (remote ? readSessionAt(path, pathOf(root)) : readClaudeSession(root, row.id)).catch(() => undefined)
  }
  const items = conversation?.items ?? []
  const every = items.flatMap((item) =>
    item.kind === 'mine' || item.kind === 'theirs' ? [{ who: item.kind === 'mine' ? 'Alex' : provider === 'codex' ? 'Codex' : provider.startsWith('plugin:') ? provider : 'Claude', text: item.text }] : [],
  )
  const last = Number(args[args.indexOf('--last') + 1])
  const said = args.includes('--last') && Number.isInteger(last) && last > 0 ? every.slice(-last) : every
  const moved = await history(row)
  if (args.includes('--json')) {
    return JSON.stringify({ id: row.id, provider, project: basename(row.root), status: standing(row), title: row.title, favorite: row.favorite, history: moved, said }, undefined, 2)
  }
  return [
    `${row.title}  (${basename(row.root)}, ${standing(row)}, ${row.favorite ? 'favorite, ' : ''}${when(row.at)})`,
    ...moved.map((one) => `  ${one.detail ?? `${when(Date.parse(one.at))}  ${one.status}`}`),
    '',
    ...said.map((one) => `${one.who}:\n${one.text}\n`),
  ].join('\n')
}

/** One request to the running application, answered once the person has answered it there. */
export function start(args: readonly string[]): Promise<{ readonly said: string; readonly ok: boolean }> {
  const tasks = tasksFrom(args, (file) => readFileSync(file === '-' ? 0 : file, 'utf8'))
  if (typeof tasks === 'string') return Promise.resolve({ ok: false, said: tasks })
  const app = appNamed(args)
  if (app === '') return Promise.resolve({ ok: false, said: 'geckit start --app <name of the program asking> ...' })
  const from = requestingSession()
  if (from === undefined && app === undefined) return Promise.resolve({ ok: false, said: 'Run this from a Claude Code or Codex session, or name the program with --app.' })
  return new Promise((done) => {
    const socket = connect(askedEndpoint(data()))
    let rest = ''
    socket.setEncoding('utf8')
    socket.on('connect', () => socket.write(`${JSON.stringify(app === undefined ? { from, tasks } : { app, tasks })}\n`))
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
  const asked = args.find((one) => !one.startsWith('--')) ?? requestingSession()
  if (asked === undefined || asked === '') return 'Run this from a Claude Code or Codex session, or give an id.'
  const notes = kept<Record<string, SessionNote>>('sessions.json', {})
  const all = await rows()
  const me = all.find((row) => row.id.startsWith(asked) || row.id.startsWith(`codex:${asked}`))?.id ?? asked
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
  try {
    if (managerCommand(args)) return (await manage(args, data())).said
    const [what, ...rest] = args
    if (remoteCommand(what) && what !== undefined) return (await remoteCli(what, rest)).said
    if (productCommand(args)) return (await product(args, data())).said
    if (what === 'service') return (await service(rest, data())).said
    if (what === 'settings') return (await readSettings(rest, data())).said
    if (what === 'employees') return (await readEmployees(rest, data())).said
    if (what === 'browser') return (await browser(rest)).said
    if (what === 'instructions') {
      if (rest[0] === undefined || rest[0] === 'providers') return `${PROMPTS.build.provider}\n`
      if (rest[0] === 'app') return `${PROMPTS.build.app}\n`
      throw new Error('Use geckit instructions providers or geckit instructions app.')
    }
    if (what === 'sessions') return await sessions(rest)
    if (what === 'show') return await show(rest)
    if (what === 'linked') return await linked(rest)
    if (what === 'migrate-codex') return (await migrate(rest, data())).said
    return HELP
  } finally {
    codex?.dispose()
    codex = undefined
  }
}

if (process.argv[1] !== undefined && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const routed = computerArg(process.argv.slice(2))
  const args = typeof routed === 'string' ? [] : routed.args
  const [what, ...rest] = args
  if (typeof routed === 'string' || routed.computer !== undefined) {
    const answer = typeof routed === 'string' ? { ok: false, said: routed } : managerCommand(routed.args) || process.env['GECKIT_MANAGER_SESSION'] !== undefined ? await manage(process.argv.slice(2), data()) : productCommand(routed.args) || routed.args.includes('--help') || routed.args[0] === 'help' || ['settings', 'employees', 'computers', 'devices', 'access'].includes(routed.args[0] ?? '') && requestingSession() === undefined && !process.env['CLAUDECODE'] ? await product(routed.args, data(), routed.computer) : await onComputer(routed.computer ?? '', routed.args)
    process.stdout.write(`${answer.said}\n`)
    process.exitCode = answer.ok ? 0 : 1
  } else if (what === 'browser-host') {
    browserHost()
  } else if (what === 'browser-test') {
    await testBrowser(rest[0] ?? '').catch((error: unknown) => { process.stdout.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exit(1) })
  } else if (what === 'browser') {
    const answer = await browser(rest)
    process.stdout.write(`${answer.said}\n`)
    process.exitCode = answer.ok ? 0 : 1
  } else if (managerCommand(args)) {
    const answer = await manage(args, data())
    process.stdout.write(`${answer.said}\n`)
    process.exitCode = answer.ok ? 0 : 1
  } else if (productCommand(args)) {
    const answer = await product(args, data())
    process.stdout.write(`${answer.said}\n`)
    process.exitCode = answer.ok ? 0 : 1
  } else if (remoteCommand(what) && what !== undefined) {
    const answer = await remoteCli(what, rest)
    process.stdout.write(`${answer.said}\n`)
    process.exitCode = answer.ok ? 0 : 1
  } else if (what === 'service') {
    const answer = await service(rest, data())
    process.stdout.write(`${answer.said}\n`)
    process.exitCode = answer.ok ? 0 : 1
  } else if (what === 'settings') {
    const answer = await readSettings(rest, data())
    process.stdout.write(`${answer.said}\n`)
    process.exitCode = answer.ok ? 0 : 1
  } else if (what === 'employees') {
    const answer = await readEmployees(rest, data())
    process.stdout.write(`${answer.said}\n`)
    process.exitCode = answer.ok ? 0 : 1
  } else if (what === 'start') {
    const answer = await start(rest)
    process.stdout.write(`${answer.said}\n`)
    process.exitCode = answer.ok ? 0 : 1
  } else if (what === 'migrate-codex') {
    const answer = await migrate(rest, data())
    process.stdout.write(`${answer.said}\n`)
    process.exitCode = answer.ok ? 0 : 1
  } else {
    const answer = await run(args)
    process.stdout.write(`${answer}\n`)
  }
}
