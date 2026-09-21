import { homedir } from 'node:os'
import { basename } from 'node:path'

import type { CardAnswer, SessionCard } from '../../shared/api'
import { modelName } from '../../shared/api'
import { within } from './rule'
import type { Wanted } from './rule'

/**
 * Every sentence a session says that is GeckIt's own, in one place.
 *
 * What the assistant says is the assistant's; this is only what is said about
 * what it did.
 */

/** One thing the assistant did: said as done, and as being done for the row. */
export interface Line {
  /** "Read src/main/index.ts" */
  readonly done: string
  /** "reading src/main/index.ts", after "Working - ". */
  readonly doing: string
  /** A file in this project the line is about, which makes it pressable. */
  readonly path?: string
}

/** "reading src/main/index.ts" as a line of its own rather than after "Working - ". */
export const sentence = (doing: string): string => doing.charAt(0).toUpperCase() + doing.slice(1)

/** A path the way the project names it, or whole with the home folder as `~`. */
export function shown(root: string, path: string): string {
  const inside = within(root, path)
  if (inside !== undefined) return inside
  const home = homedir()
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/** The first line of something, cut where a row would cut it anyway. */
export function firstLine(said: string, most = 120): string {
  const line =
    said
      .split('\n')
      .map((one) => one.trim())
      .find((one) => one !== '') ?? ''
  return line.length > most ? `${line.slice(0, most - 1).trimEnd()}...` : line
}

/** Prose with the Markdown's marks taken out, for a line that draws none. */
export function plain(said: string): string {
  return said
    .replace(/^\s*(```|~~~).*$/gm, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/^\s*(#{1,6}|>|[-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/gm, '')
}

/** The first line of something the assistant said, as a row says it. */
export const saidLine = (said: string, most?: number): string => firstLine(plain(said), most)

const literal = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * A command as a line says it: without the `cd` into this folder that the tool
 * puts in front of everything, and with the project's own paths as the project
 * names them.
 *
 * A card is where a command is read whole, because that is where it is decided.
 * A line is where it is recognised afterwards, and eighty characters of where
 * this machine keeps its projects is what stops anybody recognising it.
 */
export function tidy(command: string, root: string): string {
  const folder = root.replace(/\/+$/, '')
  const named = `(?:${literal(folder)}|"${literal(folder)}"|'${literal(folder)}')`
  const home = homedir()
  return command
    .trim()
    .replace(new RegExp(`^cd\\s+${named}/?\\s*(?:&&|;)\\s*`), '')
    .split(`${folder}/`)
    .join('')
    .split(folder)
    .join('.')
    .split(`${home}/`)
    .join('~/')
}

const host = (url: string): string => {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

const about = (root: string, path: string): Pick<Line, 'path'> => {
  const inside = within(root, path)
  return inside === undefined ? {} : { path: inside }
}

/**
 * The line for one of Claude Code's tools, or nothing for the ones that are
 * the tool talking to itself - its todo list, its search for its own tools.
 */
export function claudeLine(
  tool: string,
  input: Readonly<Record<string, unknown>>,
  root: string,
): Line | undefined {
  const path = text(input['file_path']) || text(input['notebook_path']) || text(input['path'])
  switch (tool) {
    case 'Read': {
      const name = shown(root, path)
      return { done: `Read ${name}`, doing: `reading ${name}`, ...about(root, path) }
    }
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit': {
      const name = shown(root, path)
      return { done: `Changed ${name}`, doing: `changing ${name}`, ...about(root, path) }
    }
    case 'Bash':
    case 'PowerShell': {
      const command = firstLine(tidy(text(input['command']), root))
      return { done: `Ran ${command}`, doing: `running ${command}` }
    }
    case 'Grep': {
      const pattern = text(input['pattern'])
      return { done: `Searched the project for ${pattern}`, doing: `searching for ${pattern}` }
    }
    case 'Glob': {
      const pattern = text(input['pattern'])
      return { done: `Looked for ${pattern}`, doing: `looking for ${pattern}` }
    }
    case 'WebFetch': {
      const where = host(text(input['url']))
      return { done: `Opened ${where}`, doing: `opening ${where}` }
    }
    case 'WebSearch': {
      const query = text(input['query'])
      return { done: `Searched the web for ${query}`, doing: `searching the web for ${query}` }
    }
    case 'Task':
    case 'Agent': {
      const what = firstLine(text(input['description']) || text(input['prompt']), 80)
      return { done: `Handed off: ${what}`, doing: `handing off: ${what}` }
    }
    case 'Skill': {
      const skill = text(input['skill'])
      return { done: `Used the ${skill} skill`, doing: `using the ${skill} skill` }
    }
    case 'AskUserQuestion':
    case 'ExitPlanMode':
    case 'EnterPlanMode':
    case 'TodoWrite':
    case 'TaskCreate':
    case 'TaskUpdate':
    case 'TaskGet':
    case 'TaskList':
    case 'ToolSearch':
      return undefined
    default: {
      // `mcp__server__tool`, which reads better as the tool and where it is from.
      const parts = /^mcp__(.+?)__(.+)$/.exec(tool)
      const name = parts === null ? tool : `${parts[2] ?? tool} from ${parts[1] ?? ''}`
      return { done: `Used ${name}`, doing: `using ${name}` }
    }
  }
}

/** What one of Claude Code's permission requests is asking for. */
export function wantedFromClaude(tool: string, input: Readonly<Record<string, unknown>>): Wanted {
  const path = text(input['file_path']) || text(input['notebook_path'])
  switch (tool) {
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return { kind: 'write', paths: [path] }
    case 'Bash':
    case 'PowerShell':
      return { kind: 'command', command: text(input['command']) }
    case 'WebFetch':
      return { kind: 'web', url: text(input['url']) }
    case 'WebSearch':
      return { kind: 'web', url: text(input['query']) }
    case 'Read':
      return { kind: 'read', path: path || text(input['path']) }
    case 'Grep':
    case 'Glob':
      return { kind: 'read', path: text(input['path']) }
    case 'ExitPlanMode':
      return { kind: 'start', plan: text(input['plan']) }
    case 'AskUserQuestion':
      return questionsFromClaude(input)[0] ?? { kind: 'question', question: '', choices: [] }
    default:
      return { kind: 'other', tool, detail: JSON.stringify(input, undefined, 2) }
  }
}

/**
 * Everything one AskUserQuestion asks. It may ask several things in one go,
 * and each is a card of its own, answered in turn.
 */
export function questionsFromClaude(input: Readonly<Record<string, unknown>>): Wanted[] {
  const questions = Array.isArray(input['questions']) ? input['questions'] : []
  return questions.map((raw) => {
    const one = (raw ?? {}) as Readonly<Record<string, unknown>>
    const options = Array.isArray(one['options']) ? one['options'] : []
    return {
      kind: 'question',
      question: text(one['question']),
      choices: options
        .map((option) => text((option as Readonly<Record<string, unknown>>)['label']))
        .filter((label) => label !== ''),
    }
  })
}

/** The card for something that may not go ahead unasked. */
export function cardFor(wanted: Wanted, root: string): SessionCard {
  const folder = `in ${basename(root)}`
  switch (wanted.kind) {
    case 'command':
      return { kind: 'permission', title: 'Wants to run a command', detail: wanted.command, where: folder }
    case 'write': {
      const inside = wanted.paths.map((path) => within(root, path))
      if (inside.every((path) => path !== undefined)) {
        return { kind: 'permission', title: `Wants to change ${inside.join(', ')}` }
      }
      return {
        kind: 'permission',
        title: 'Wants to change a file',
        detail: wanted.paths.map((path) => shown(root, path)).join('\n'),
        where: 'Outside this project',
      }
    }
    case 'read': {
      const inside = within(root, wanted.path)
      if (inside !== undefined) return { kind: 'permission', title: `Wants to read ${inside}` }
      return {
        kind: 'permission',
        title: 'Wants to read a file',
        detail: shown(root, wanted.path),
        where: 'Outside this project',
      }
    }
    case 'web':
      return { kind: 'permission', title: 'Wants to open a web page', detail: wanted.url }
    case 'question':
      return { kind: 'question', title: wanted.question, choices: wanted.choices }
    case 'start':
      return { kind: 'start', title: 'Wants to start making these changes', detail: wanted.plan }
    case 'other':
      return { kind: 'permission', title: `Wants to use ${wanted.tool}`, detail: wanted.detail }
  }
}

/** What is named after "Allowed:", which is the thing and not the sentence about it. */
function subject(wanted: Wanted, root: string): string {
  switch (wanted.kind) {
    case 'command':
      return firstLine(tidy(wanted.command, root))
    case 'write':
      return wanted.paths.map((path) => shown(root, path)).join(', ')
    case 'read':
      return shown(root, wanted.path)
    case 'web':
      return wanted.url
    case 'start':
      return 'making changes'
    case 'question':
      return wanted.question
    case 'other':
      return wanted.tool
  }
}

/** The one line a card folds to once it has its answer. */
export function answeredLine(wanted: Wanted, answer: CardAnswer | string, root: string): string {
  if (wanted.kind === 'question') return `Answered: ${answer}`
  const what = subject(wanted, root)
  if (answer === 'once') return `Allowed: ${what}`
  if (answer === 'session') return `Allowed for this session: ${what}`
  return `Not allowed: ${what}`
}

/** A row's second line while a card is up. */
export function waitingFor(wanted: Wanted): string {
  switch (wanted.kind) {
    case 'command':
      return 'Wants to run a command'
    case 'write':
      return 'Wants to change a file'
    case 'read':
      return 'Wants to read a file'
    case 'web':
      return 'Wants to open a web page'
    case 'question':
      return 'Asked you a question'
    case 'start':
      return 'Wants to start making changes'
    case 'other':
      return `Wants to use ${wanted.tool}`
  }
}

/** A clock time the way this computer writes one, with the day where it is not today. */
export function clock(at: number, now: number): string {
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(at)
  if (new Date(at).toDateString() === new Date(now).toDateString()) return time
  const day = new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(at)
  return `${day} ${time}`
}

/** "Your Claude plan's limit is used up until 15:00." - and without the time where the tool gave none. */
export function limitText(resetsAt: number | undefined, now: number): string {
  const plan = "Your Claude plan's limit is used up"
  return resetsAt === undefined || resetsAt <= now ? `${plan}.` : `${plan} until ${clock(resetsAt, now)}.`
}

export function limitStands(resetsAt: number | undefined, now: number): string {
  return resetsAt === undefined || resetsAt <= now
    ? 'Limit reached'
    : `Limit reached - back at ${clock(resetsAt, now)}`
}

export const FAILED = 'Claude Code stopped before it finished.'

/** Said where Auto was chosen and Claude Code did not take it up. */
export function noAutoMode(model: string | undefined): string {
  const which = model === undefined ? 'this model' : modelName(model)
  return `Claude Code has no auto mode for ${which}, so this conversation asks first, as in Manual.`
}

export const SUMMARISED = 'Earlier messages were summarised by Claude Code.'

export const STOPPED = 'Stopped.'
