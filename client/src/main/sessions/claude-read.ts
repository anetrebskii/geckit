import type { BackgroundTask, PlanUsage, PlanWindow, SessionImage, SessionItem } from '../../shared/api'
import { askId, cardId } from './heard'
import type { Signal } from './heard'
import { filesAmong } from './rule'
import type { Wanted } from './rule'
import {
  answeredLine,
  cardFor,
  claudeLine,
  movedLine,
  questionsFromClaude,
  saidLine,
  sentence,
  STOPPED,
  SUMMARISED,
  wantedFromClaude,
} from './wording'

/**
 * Claude Code, read into a transcript.
 *
 * One function for both places its words come from. What `claude -p` streams
 * and what it keeps in its own session file are the same blocks under the same
 * ids - checked against 2.1.278 - so a conversation read back from disk is the
 * conversation that was watched, line for line.
 *
 * Pure: a message in, items and signals out, and a small state between calls.
 * Nothing here starts a process or touches a file, which is what lets the
 * recorded turns in `test/fixtures` stand in for the tool.
 */

type Json = Readonly<Record<string, unknown>>

/** One of Claude Code's permission requests, as it has to be answered. */
export interface ClaudeRequest {
  /** The `request_id` the answer carries back. */
  readonly request: string
  readonly tool: string
  readonly toolUse: string
  readonly input: Json
  /** The tool's own idea of "don't ask again", which "for this session" sends back. */
  readonly suggestions: readonly Json[]
  readonly wanted: Wanted
}

/** What is heard, with a request still carrying what Claude Code needs back. */
export type ClaudeSignal =
  | Exclude<Signal, { kind: 'asks' }>
  | { readonly kind: 'asks'; readonly request: ClaudeRequest }

export interface Reading {
  readonly items: SessionItem[]
  readonly gone: string[]
  readonly signals: ClaudeSignal[]
}

interface Doing {
  readonly item: Extract<SessionItem, { kind: 'did' }>
  readonly tool: string
  readonly input: Json
}

export interface ClaudeState {
  readonly root: string
  /** Lines waiting for their result, by `tool_use` id. */
  readonly tools: Map<string, Doing>
  /** The answer as it grows, before the tool has named the finished message. */
  open: string | undefined
  grown: string
  seq: number
  /** Files changed since the person last spoke. */
  wrote: string[]
  thought: boolean
  interrupted: boolean
  /** Said by the tool itself rather than by the model, which is how it reports a failure. */
  synthetic: string | undefined
  limit: { resetsAt?: number } | undefined
  /** Tasks that went on in the background, whose ending is worth a line. One the tool waits on is not. */
  readonly backgrounded: Set<string>
}

export function claudeState(root: string): ClaudeState {
  return {
    root,
    tools: new Map(),
    open: undefined,
    grown: '',
    seq: 0,
    wrote: [],
    thought: false,
    interrupted: false,
    synthetic: undefined,
    limit: undefined,
    backgrounded: new Set(),
  }
}

const string = (value: unknown): string => (typeof value === 'string' ? value : '')
const object = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {}
const list = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : [])

/** Most of a result that anybody would read. The rest is in the tool's own file. */
const MOST = 4_000

const WRITES = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const COMMANDS = new Set(['Bash', 'PowerShell'])

/** A tool result's content, which is a string or a list of text blocks. */
/**
 * The pictures in a message, up to what is left of the budget.
 *
 * A whole transcript goes to the window in one message, so a conversation full
 * of screenshots is a conversation that would arrive as a hundred megabytes of
 * base64. What does not fit is left out; the words around it still arrive.
 */
function picturesIn(content: unknown, budget: { left: number }): SessionImage[] {
  const out: SessionImage[] = []
  for (const block of list(content)) {
    const one = object(block)
    if (string(one['type']) !== 'image') continue
    const source = object(one['source'])
    const data = string(source['data'])
    if (string(source['type']) !== 'base64' || data === '' || data.length > budget.left) continue
    budget.left -= data.length
    out.push({ media: string(source['media_type']) || 'image/png', data })
  }
  return out
}

function resultText(content: unknown): string {
  if (typeof content === 'string') return content
  return list(content)
    .map((block) => string(object(block)['text']))
    .filter((part) => part !== '')
    .join('\n')
}

const clipped = (body: string): string =>
  body.length > MOST ? `${body.slice(0, MOST)}\n... (${String(body.length - MOST)} more characters)` : body

/** What the person typed, as against what a terminal wrote into the conversation on their behalf. */
const NOT_SAID =
  /^\s*(<(command-|local-command|system-reminder|bash-|task-notification|user-prompt-submit-hook)|Caveat:)/

const INTERRUPTED = /^\[Request interrupted by user/

/** What the tool hands the model when something in the background ends, as it keeps it in the session file. */
const TASK_NOTIFICATION = /^\s*<task-notification>([\s\S]*)<\/task-notification>\s*$/
const tagged = (body: string, tag: string): string => new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(body)?.[1]?.trim() ?? ''

/**
 * The line for something in the background that ended, under the same id
 * watched and read back. One that was stopped says nothing, since whoever
 * stopped it knows; the file keeps it only as a queued command, not a message.
 */
function taskNote(id: string, status: string, summary: string): SessionItem | undefined {
  if (id === '' || summary === '' || status === 'stopped' || status === 'killed') return undefined
  return { kind: 'note', id: `task:${id}`, note: 'task', text: summary }
}

/** A command run with `!`, and what it printed, as the terminal writes them and as GeckIt sends them. */
const BASH_INPUT = /^\s*<bash-input>([\s\S]*)<\/bash-input>\s*$/
const BASH_OUTPUT = /^\s*<bash-stdout>([\s\S]*)<\/bash-stdout>\s*<bash-stderr>([\s\S]*)<\/bash-stderr>\s*$/

/** The text blocks of what a person said, or the whole of it where it is one string. */
const textsOf = (content: unknown): string[] =>
  typeof content === 'string'
    ? [content]
    : list(content)
        .map(object)
        .filter((block) => string(block['type']) === 'text')
        .map((block) => string(block['text']))

/** What is refused is refused in words the assistant can act on. */
export const REFUSED =
  'The person reading said no to this. Do not try it another way; say what you would have done instead.'

/** What was waiting when the mode changed goes back to the tool, whose own check now decides it. */
export const AGAIN =
  'The person changed how this session may act while this was waiting. Make the same tool call again, unchanged.'

/** A result that is a no - said here, or said in a terminal, where the tool has words of its own for it. */
const refused = (said: string): boolean =>
  said.includes(REFUSED) || said.startsWith("The user doesn't want to proceed with this tool use")

const SIGNED_OUT = /\/login|not logged in|invalid api key|authenticat|unauthori[sz]ed|oauth token/i
const LIMIT = /usage limit|hit your limit|limit reached|rate limit/i

function empty(): Reading {
  return { items: [], gone: [], signals: [] }
}

/** The end of the person's turn to speak: what the last one changed is said once. */
function flush(state: ClaudeState, out: Reading): void {
  if (state.wrote.length > 0) {
    state.seq += 1
    out.items.push({ kind: 'wrote', id: `wrote:${String(state.seq)}`, paths: state.wrote })
  }
  state.wrote = []
  state.thought = false
}

/** When an entry was written, which the session file says and the live stream does not. */
function stamped(entry: Json): { at?: number } {
  const at = Date.parse(string(entry['timestamp']))
  return Number.isNaN(at) ? {} : { at }
}

function assistantBlocks(state: ClaudeState, message: Json, out: Reading): void {
  const inner = object(message['message'])
  const id = string(message['uuid'])
  const synthetic = string(inner['model']) === '<synthetic>'

  for (const [index, raw] of list(inner['content']).entries()) {
    const block = object(raw)
    const kind = string(block['type'])
    const item = `${id}:${String(index)}`

    if (kind === 'text') {
      const text = string(block['text'])
      if (state.open !== undefined) {
        out.gone.push(state.open)
        state.open = undefined
        state.grown = ''
      }
      if (text.trim() === '') continue
      if (synthetic) {
        state.synthetic = text
        continue
      }
      out.items.push({ kind: 'theirs', id: item, text, ...stamped(message) })
      out.signals.push({ kind: 'said', text })
      continue
    }

    if (kind === 'thinking') {
      const text = string(block['thinking'])
      // The tool sends the signature and keeps the thought, most of the time.
      // One line a turn says it thought; a line per request would be noise.
      if (text === '' && state.thought) continue
      state.thought = true
      out.items.push({ kind: 'thought', id: item, text })
      continue
    }

    if (kind !== 'tool_use') continue
    const tool = string(block['name'])
    const use = string(block['id'])
    const input = object(block['input'])

    if (WRITES.has(tool)) {
      const path = string(input['file_path']) || string(input['notebook_path'])
      if (path !== '') out.signals.push({ kind: 'writing', paths: [path] })
    }

    const line = claudeLine(tool, input, state.root)
    if (line === undefined) {
      // Nothing is drawn for a question or a plan until it has an answer, but
      // it is kept: read back from disk, the answer is all there is to go on.
      state.tools.set(use, { item: { kind: 'did', id: use, what: '' }, tool, input })
      continue
    }
    // Kept as it will read once it is done, and drawn meanwhile as it reads
    // while it is going: "Reading src/main/index.ts" beside the spinner.
    const did: Doing['item'] = {
      kind: 'did',
      id: use,
      what: line.done,
      ...(line.path === undefined ? {} : { path: line.path }),
    }
    state.tools.set(use, { item: did, tool, input })
    out.items.push({ ...did, what: sentence(line.doing), live: true })
    out.signals.push({ kind: 'doing', what: line.doing })
  }
}

function toolResults(state: ClaudeState, message: Json, out: Reading): boolean {
  let any = false
  for (const raw of list(object(message['message'])['content'])) {
    const block = object(raw)
    if (string(block['type']) !== 'tool_result') continue
    any = true
    const use = string(block['tool_use_id'])
    const doing = state.tools.get(use)
    if (doing === undefined) continue
    state.tools.delete(use)

    const said = resultText(block['content'])
    const failed = block['is_error'] === true

    if (doing.tool === 'AskUserQuestion') {
      const answers = object(object(message['tool_use_result'] ?? message['toolUseResult'])['answers'])
      for (const [index, wanted] of questionsFromClaude(doing.input).entries()) {
        const answer = wanted.kind === 'question' ? string(answers[wanted.question]) : ''
        out.items.push({
          kind: 'card',
          id: cardId(askId(use, index)),
          card: { ...cardFor(wanted, state.root), answered: answeredLine(wanted, answer || 'Nothing', state.root) },
        })
      }
      continue
    }

    if (doing.tool === 'ExitPlanMode') {
      const wanted = wantedFromClaude(doing.tool, doing.input)
      out.items.push({
        kind: 'card',
        id: cardId(use),
        card: { ...cardFor(wanted, state.root), answered: answeredLine(wanted, failed ? 'no' : 'once', state.root) },
      })
      continue
    }

    // Handed back to be tried again, it is drawn where it is tried.
    if (failed && said.includes(AGAIN)) {
      out.gone.push(use)
      continue
    }

    // What was refused did not run, and a line saying it ran would be a lie.
    // Read back from disk the card is all that says it was ever wanted.
    if (failed && refused(said)) {
      const wanted = wantedFromClaude(doing.tool, doing.input)
      out.gone.push(use)
      out.items.push({
        kind: 'card',
        id: cardId(use),
        card: { ...cardFor(wanted, state.root), answered: answeredLine(wanted, 'no', state.root) },
      })
      continue
    }

    // A tool with nothing to say for itself, such as looking up another tool, stays unsaid.
    if (doing.item.what === '') continue

    if (WRITES.has(doing.tool) && !failed) {
      const path = string(doing.input['file_path']) || string(doing.input['notebook_path'])
      for (const file of filesAmong(state.root, [path])) {
        if (!state.wrote.includes(file)) state.wrote = [...state.wrote, file]
      }
    }

    const moved = COMMANDS.has(doing.tool) && object(message['tool_use_result'])['backgroundedByUser'] === true
    const detail = COMMANDS.has(doing.tool)
      ? clipped(`$ ${string(doing.input['command'])}\n${said}`.trimEnd())
      : WRITES.has(doing.tool) || doing.tool === 'Read'
        ? failed
          ? clipped(said)
          : undefined
        : said === ''
          ? undefined
          : clipped(said)

    const { live: _live, ...rest } = doing.item
    out.items.push({
      ...rest,
      ...(moved ? { what: movedLine(doing.input, state.root) } : {}),
      ...(detail === undefined ? {} : { detail }),
    })
  }
  return any
}

/**
 * How much of the context an answer was given, in tokens: everything it read,
 * cached or not, and what it wrote, which the next turn reads back. Nothing
 * where the entry has no usage on it.
 */
export function contextOf(entry: Json): number | undefined {
  const usage = object(object(entry['message'])['usage'])
  const count = (key: string): number => (typeof usage[key] === 'number' ? usage[key] : 0)
  const used =
    count('input_tokens') + count('cache_creation_input_tokens') + count('cache_read_input_tokens') + count('output_tokens')
  return used === 0 ? undefined : used
}

/** The context in the last answer of a conversation read from disk. */
export function lastContext(entries: readonly Json[]): number | undefined {
  for (const entry of [...entries].reverse()) {
    if (string(entry['type']) !== 'assistant' || entry['isSidechain'] === true) continue
    if (string(object(entry['message'])['model']) === '<synthetic>') continue
    const used = contextOf(entry)
    if (used !== undefined) return used
  }
  return undefined
}

/**
 * What a conversation read from disk has cost at API prices, as Claude Code
 * counted it. Each run of the tool keeps its own total and writes it again as
 * it goes, so the last one written for a run is the one that stands, and a
 * conversation taken up three times is three runs added up.
 */
export function costOf(entries: readonly Json[]): number | undefined {
  const runs = new Map<unknown, number>()
  for (const entry of entries) {
    const total = entry['totalCostUSD']
    if (string(entry['type']) === 'cost-state' && typeof total === 'number') runs.set(entry['startTime'], total)
  }
  return runs.size === 0 ? undefined : [...runs.values()].reduce((sum, run) => sum + run, 0)
}

function planWindow(value: unknown): PlanWindow | undefined {
  const window = object(value)
  const part = window['utilization']
  const at = window['resetsAt']
  return typeof part === 'number' && typeof at === 'number' ? { part, resetsAt: at * 1000 } : undefined
}

function plan(fiveHour: PlanWindow | undefined, sevenDay: PlanWindow | undefined): PlanUsage | undefined {
  if (fiveHour === undefined && sevenDay === undefined) return undefined
  return { ...(fiveHour === undefined ? {} : { fiveHour }), ...(sevenDay === undefined ? {} : { sevenDay }) }
}

/** The same windows as the tool's answer to `get_usage` says them: a percentage, and an ISO date. */
function usageWindow(value: unknown): PlanWindow | undefined {
  const window = object(value)
  const part = window['utilization']
  const at = Date.parse(string(window['resets_at']))
  return typeof part === 'number' && !Number.isNaN(at) ? { part: part / 100, resetsAt: at } : undefined
}

/** The plan's windows out of the tool's answer to `get_usage`. Nothing on a key, or where it did not say. */
export function planOf(answer: Json): PlanUsage | undefined {
  const limits = object(answer['rate_limits'])
  return plan(usageWindow(limits['five_hour']), usageWindow(limits['seven_day']))
}

/** One line of what `claude -p --output-format stream-json` prints. */
export function readClaude(state: ClaudeState, message: Json): Reading {
  const out = empty()
  const type = string(message['type'])

  // What a helper it handed off to says is the helper's. The line that handed
  // off is what the person reads, and its result arrives like any other.
  if (message['parent_tool_use_id'] !== undefined && message['parent_tool_use_id'] !== null) {
    return out
  }

  if (type === 'system') {
    const subtype = string(message['subtype'])
    if (subtype === 'init') {
      const model = string(message['model'])
      const mode = string(message['permissionMode'])
      out.signals.push({
        kind: 'started',
        session: string(message['session_id']),
        // 'none' on a plan. A build that does not say is not taken for a key.
        key: !['', 'none'].includes(string(message['apiKeySource'])),
        ...(model === '' ? {} : { model }),
        ...(mode === '' ? {} : { mode }),
      })
    } else if (subtype === 'compact_boundary') {
      state.seq += 1
      out.items.push({
        kind: 'note',
        id: `summarised:${String(state.seq)}`,
        note: 'summarised',
        text: SUMMARISED,
      })
    } else if (subtype === 'status' && string(message['permissionMode']) !== '') {
      out.signals.push({ kind: 'mode', mode: string(message['permissionMode']) })
    } else if (subtype === 'background_tasks_changed') {
      const tasks = list(message['tasks']).map((raw): BackgroundTask => {
        const task = object(raw)
        return { id: string(task['task_id']), kind: string(task['task_type']), what: string(task['description']) }
      })
      for (const task of tasks) state.backgrounded.add(task.id)
      out.signals.push({ kind: 'tasks', tasks })
    } else if (subtype === 'task_started') {
      const id = string(message['task_id'])
      const doing = state.tools.get(string(message['tool_use_id']))
      if (message['is_backgrounded'] === true) state.backgrounded.add(id)
      else if (doing !== undefined && COMMANDS.has(doing.tool)) {
        // A command the tool is waiting on has run long enough to become a task, which can go on without it.
        const line = claudeLine(doing.tool, doing.input, state.root)
        if (line !== undefined) out.items.push({ ...doing.item, what: sentence(line.doing), live: true, lasting: true })
      }
    } else if (subtype === 'task_updated') {
      if (object(message['patch'])['is_backgrounded'] === true) state.backgrounded.add(string(message['task_id']))
    } else if (subtype === 'task_notification') {
      const id = string(message['task_id'])
      if (state.backgrounded.delete(id)) {
        const note = taskNote(id, string(message['status']), string(message['summary']))
        if (note !== undefined) out.items.push(note)
      }
    }
    return out
  }

  if (type === 'stream_event') {
    const event = object(message['event'])
    const kind = string(event['type'])
    if (kind === 'content_block_start' && string(object(event['content_block'])['type']) === 'text') {
      state.seq += 1
      state.open = `growing:${String(state.seq)}`
      state.grown = ''
    } else if (kind === 'content_block_delta' && state.open !== undefined) {
      const delta = object(event['delta'])
      if (string(delta['type']) === 'text_delta') {
        state.grown += string(delta['text'])
        if (state.grown.trim() !== '') out.items.push({ kind: 'theirs', id: state.open, text: state.grown })
      }
    }
    return out
  }

  if (type === 'assistant') {
    assistantBlocks(state, message, out)
    const used = string(object(message['message'])['model']) === '<synthetic>' ? undefined : contextOf(message)
    if (used !== undefined) out.signals.push({ kind: 'spend', used })
    return out
  }

  if (type === 'user') {
    if (toolResults(state, message, out)) return out
    const content = object(message['message'])['content']
    const said = typeof content === 'string' ? content : resultText(content)
    if (INTERRUPTED.test(said)) state.interrupted = true
    return out
  }

  if (type === 'rate_limit_event') {
    const info = object(message['rate_limit_info'])
    const windows = object(info['unifiedWindows'])
    const said = plan(planWindow(windows['five_hour']), planWindow(windows['seven_day']))
    if (said !== undefined) out.signals.push({ kind: 'plan', plan: said })
    if (string(info['status']) === 'rejected') {
      const at = typeof info['resetsAt'] === 'number' ? info['resetsAt'] * 1000 : undefined
      state.limit = at === undefined ? {} : { resetsAt: at }
    }
    return out
  }

  if (type === 'control_request') {
    const request = object(message['request'])
    if (string(request['subtype']) !== 'can_use_tool') return out
    const tool = string(request['tool_name'])
    const input = object(request['input'])
    out.signals.push({
      kind: 'asks',
      request: {
        request: string(message['request_id']),
        tool,
        toolUse: string(request['tool_use_id']),
        input,
        suggestions: list(request['permission_suggestions']).map(object),
        wanted: wantedFromClaude(tool, input),
      },
    })
    return out
  }

  if (type === 'result') {
    // What this run of the tool has cost so far, helpers included; it starts again from nothing each run.
    const cost = message['total_cost_usd']
    if (typeof cost === 'number') out.signals.push({ kind: 'spend', cost })

    // Whatever was still live when the turn ended is not live any more.
    for (const doing of state.tools.values()) {
      if (doing.item.what === '') continue
      const { live: _live, ...rest } = doing.item
      out.items.push(rest)
    }
    state.tools.clear()
    if (state.open !== undefined) {
      out.gone.push(state.open)
      state.open = undefined
    }

    const failed = message['is_error'] === true
    const said = state.synthetic ?? string(message['result'])
    const stopped = state.interrupted
    const limit = state.limit
    state.interrupted = false
    state.synthetic = undefined
    state.limit = undefined

    if (stopped) {
      flush(state, out)
      out.signals.push({ kind: 'ended', how: 'stopped' })
    } else if (!failed && string(message['subtype']) === 'success') {
      flush(state, out)
      out.signals.push({ kind: 'ended', how: 'done' })
    } else if (limit !== undefined || LIMIT.test(said)) {
      flush(state, out)
      out.signals.push({
        kind: 'ended',
        how: 'limit',
        ...(limit?.resetsAt === undefined ? {} : { resetsAt: limit.resetsAt }),
      })
    } else if (SIGNED_OUT.test(said)) {
      out.signals.push({ kind: 'ended', how: 'signedOut', text: said })
    } else {
      flush(state, out)
      out.signals.push({ kind: 'ended', how: 'failed', text: said })
    }
    return out
  }

  return out
}

/** A file written this recently is a conversation somebody is still in. */
const STILL_GOING = 60_000

/**
 * A whole conversation, from the lines of the tool's own session file.
 *
 * The file has what the stream has and more besides - what a terminal typed on
 * the person's behalf, a helper's side of a hand-off, the tool's bookkeeping -
 * so this is `readClaude` with those taken out and the person's own messages
 * put in, since in the stream they are ours and here they are the file's.
 *
 * `quietFor` is how long ago the file was last written. A conversation that
 * ends on something unanswered was stopped - unless it was written a moment
 * ago, in which case it is being held somewhere else and is simply not done.
 */
export function replayClaude(root: string, entries: readonly Json[], quietFor: number): SessionItem[] {
  const state = claudeState(root)
  const budget = { left: 24_000_000 }
  const items = new Map<string, SessionItem>()
  const take = (read: Reading): void => {
    for (const id of read.gone) items.delete(id)
    for (const item of read.items) items.set(item.id, item)
  }
  let open = false
  let shell: string | undefined

  for (const entry of entries) {
    const type = string(entry['type'])
    if (entry['isSidechain'] === true || entry['isMeta'] === true) continue

    if (type === 'user') {
      const content = object(entry['message'])['content']
      const typed =
        typeof content === 'string' ||
        !list(content).some((block) => string(object(block)['type']) === 'tool_result')
      if (!typed) {
        take(readClaude(state, { ...entry, tool_use_result: entry['toolUseResult'] }))
        continue
      }
      if (entry['isCompactSummary'] === true) continue
      // Commands run with `!` are blocks of their own, ahead of what was said with them or alone.
      const words: string[] = []
      for (const [index, text] of textsOf(content).entries()) {
        const told = TASK_NOTIFICATION.exec(text)
        if (told !== null) {
          const body = told[1] ?? ''
          const note = taskNote(tagged(body, 'task-id'), tagged(body, 'status'), tagged(body, 'summary'))
          if (note !== undefined) items.set(note.id, note)
          continue
        }
        const input = BASH_INPUT.exec(text)
        const output = BASH_OUTPUT.exec(text)
        if (input === null && output === null) {
          words.push(text)
          continue
        }
        const out = empty()
        flush(state, out)
        take(out)
        const was = shell === undefined ? undefined : items.get(shell)
        if (output !== null && was?.kind === 'shell') {
          const printed = [output[1] ?? '', output[2] ?? '']
            .filter((one) => one.trim() !== '')
            .map((one) => one.replace(/\n+$/, ''))
            .join('\n')
          items.set(was.id, { ...was, output: printed.trim() === '(Bash completed with no output)' ? '' : printed })
          shell = undefined
        } else if (input !== null) {
          shell = `${string(entry['uuid'])}:shell:${String(index)}`
          items.set(shell, { kind: 'shell', id: shell, command: (input[1] ?? '').trim(), output: '', ...stamped(entry) })
        }
      }
      const said = words.join('\n')
      const pictures = picturesIn(content, budget)
      if (NOT_SAID.test(said)) continue
      if (said.trim() === '' && pictures.length === 0) continue

      const out = empty()
      flush(state, out)
      take(out)
      if (INTERRUPTED.test(said)) {
        items.set(`stopped:${string(entry['uuid'])}`, {
          kind: 'note',
          id: `stopped:${string(entry['uuid'])}`,
          note: 'stopped',
          text: STOPPED,
        })
        open = false
        continue
      }
      items.set(string(entry['uuid']), {
        kind: 'mine',
        id: string(entry['uuid']),
        text: said,
        ...(pictures.length === 0 ? {} : { images: pictures }),
        ...stamped(entry),
      })
      open = true
      continue
    }

    if (type === 'assistant') {
      const inner = object(entry['message'])
      const blocks = list(inner['content']).map(object)
      // Its turn is over when it says something and asks for nothing more.
      open = !(
        string(inner['stop_reason']) === 'end_turn' ||
        blocks.every((block) => string(block['type']) === 'text')
      )
      take(readClaude(state, entry))
      continue
    }

    if (type === 'system' && string(entry['subtype']) === 'compact_boundary') take(readClaude(state, entry))
  }

  const out = empty()
  for (const doing of state.tools.values()) {
    if (doing.item.what === '') continue
    const { live: _live, ...rest } = doing.item
    out.items.push(rest)
  }
  flush(state, out)
  take(out)

  if (open && quietFor > STILL_GOING) {
    items.set('stopped:end', { kind: 'note', id: 'stopped:end', note: 'stopped', text: STOPPED })
  }
  return [...items.values()]
}

/** The first line of the last thing the assistant said, for a row. */
export function lastSaid(entries: readonly Json[]): string {
  for (const entry of [...entries].reverse()) {
    if (string(entry['type']) !== 'assistant' || entry['isSidechain'] === true) continue
    const content = object(entry['message'])['content']
    if (!Array.isArray(content)) continue
    const text = content
      .map((block) => (string(object(block)['type']) === 'text' ? string(object(block)['text']) : ''))
      .join('\n')
    if (text.trim() !== '') return saidLine(text)
  }
  return ''
}

/** What the person typed, from one of the file's entries, or nothing where it was not them. */
export function typed(entry: Json): string {
  if (string(entry['type']) !== 'user' || entry['isSidechain'] === true || entry['isMeta'] === true) return ''
  if (entry['isCompactSummary'] === true) return ''
  const content = object(entry['message'])['content']
  if (list(content).some((block) => string(object(block)['type']) === 'tool_result')) return ''
  return textsOf(content)
    .filter((text) => !/^\s*(<|\[Request interrupted|Caveat:)/.test(text))
    .join('\n')
}
