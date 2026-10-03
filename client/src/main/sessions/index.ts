import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename } from 'node:path'

import { letGo, taken } from '../lineup'
import { importedNote } from '../session-migration'
import type { Standing } from '../lineup'

import type {
  BackgroundTask,
  Browser,
  CardAnswer,
  ChatFound,
  ChatSession,
  Lineup,
  HiddenChat,
  HiddenFolder,
  HiddenReason,
  ClaudeAccount,
  ClaudeModel,
  ClaudeProgram,
  CutOff,
  McpServer,
  PlanUsage,
  ReasoningEffort,
  RequestChoice,
  RequestTask,
  SessionGoal,
  SessionImage,
  SessionItem,
  SessionItems,
  SessionMessage,
  SessionMode,
  SessionProvider,
  SessionNotice,
  SessionState,
  SessionStatus,
  ShellCommand,
  TaskOutput,
  WorkItem,
} from '../../shared/api'
import { providerOf, sessionMode } from '../../shared/api'
import { hostOf, isRemote, pathOf, remoteRoot } from '../../shared/hosts'
import type { Link } from '../../shared/links'
import { linksIn, workItem } from '../../shared/links'
import { claudeAccount, claudeProgram } from './account'
import { holdClaude } from './claude'
import type { CodexSessions } from './codex'
import { browsersOf, readBrowsers } from './chrome'
import { claudeFile, deleteClaude, everyClaude, forkPoint, listClaude, readClaudeSession, readGoal, readLinks, standsIn } from './disk'
import type { GoalRead } from './claude-read'
import type { Conversation } from './disk'
import { cardId } from './heard'
import type { Driver, Heard, Signal } from './heard'
import { readMcp, serversOf } from './mcp'
import type { McpChange } from './mcp'
import { claudeModels } from './models'
import type { Wanted } from './rule'
import { asksToType, runInTerminal, runShell, toldClaude, wantsKeyboard } from './shell'
import type { Running } from './shell'
import { taskFile, taskOutput } from './tasks'
import { readUsage } from './usage'
import type { Usage } from './usage'
import {
  answeredLine,
  cardFor,
  FAILED,
  firstLine,
  limitStands,
  limitText,
  noAutoMode,
  saidLine,
  shown,
  STOPPED,
  waitingFor,
} from './wording'

/**
 * Every conversation this application is holding, across every project.
 *
 * Claude Code keeps the conversations; this keeps what the tool's own file
 * cannot say back - which mode a conversation runs in, what was renamed, what
 * has been read - and what only a window needs: where each one stands, and
 * which of them is waiting for an answer.
 */

export interface SessionNote {
  readonly importedFrom?: string
  readonly importedMetadata?: number
  readonly title?: string
  /** The person named it themselves, so Claude Code is told the name and a terminal and the phone show it too. */
  readonly renamed?: boolean
  readonly mode?: SessionMode
  readonly model?: string
  readonly reasoning?: SessionMessage['reasoning']
  /** Started in this application rather than in a terminal. */
  readonly here?: boolean
  readonly unread?: boolean
  readonly hidden?: boolean
  /** Brought onto the board by hand, though a program started it. */
  readonly shown?: boolean
  /** When it was last in front in the window, for the search to offer what was used last. */
  readonly seen?: number
  readonly status?: SessionStatus
  readonly goal?: SessionGoal | undefined
  /** A turn is running, where and since when; still here on a start, it was cut off by GeckIt closing. */
  readonly cut?: { readonly root: string; readonly at: number }
  /** Messages waiting for the turn before them, kept so a restart does not lose them. */
  readonly queued?: readonly Queued[]
  /** Begun with a message that waits for a slot, and so nothing on disk yet: the project it is in. */
  readonly unborn?: string
  /** When GeckIt first wrote anything about it. */
  readonly created?: number
  /** Every move between columns, oldest first, so what was done can be told with when. */
  readonly moves?: readonly Move[]
  /** A general question, kept here so a restart does not lose it. */
  readonly question?: boolean
  /** When a general question that has gone quiet is deleted. */
  readonly goes?: number
  /** A general question kept for good rather than deleted a day after its last answer. */
  readonly stays?: boolean
  /** What a general question last said, its second line in the menu after a restart. */
  readonly stands?: string
  /** The conversation that asked for this one with `geckit start`. */
  readonly parent?: string
  /** What it asked for with `geckit start` and how each was answered, which the tool's own file has no place for. */
  readonly requests?: readonly Kept[]
}

export interface Move {
  readonly status: SessionStatus | 'progress'
  readonly at: number
}

/**
 * The note as it is to be kept: when it was first written and every change of
 * column carried over from the one before, whatever the change left out, and a
 * move added where the column is not the one it was in.
 */
export function withMoves(was: SessionNote | undefined, note: SessionNote, at: number): SessionNote {
  const now = note.status ?? 'progress'
  const before = was === undefined ? undefined : (was.status ?? 'progress')
  const moves = was?.moves ?? []
  const created = was === undefined ? at : was.created
  return {
    ...note,
    ...(created === undefined ? {} : { created }),
    ...(now === before ? (moves.length === 0 ? {} : { moves }) : { moves: [...moves, { status: now, at }] }),
  }
}

interface Queued {
  readonly id: string
  readonly message: SessionMessage
  /** When it was queued, which is where a conversation started with it copies this one up to. */
  readonly at?: number
}

export interface NotesStore {
  all(): Readonly<Record<string, SessionNote>>
  set(id: string, note: SessionNote): void
  replace(notes: Readonly<Record<string, SessionNote>>): void
}

export function memoryNotes(): NotesStore {
  let kept: Record<string, SessionNote> = {}
  return {
    all: () => kept,
    set: (id, note) => {
      kept[id] = note
    },
    replace: (notes) => { kept = { ...notes } },
  }
}

interface Row {
  readonly id: string
  readonly root: string
  /** The project it is listed under, where it was started in a folder below. */
  readonly project?: string
  readonly title: string
  readonly stands: string
  readonly at: number
  readonly driven: boolean
  readonly model?: string
  readonly actualReasoning?: ReasoningEffort
  /** Tokens in the context after the last answer. */
  readonly used?: number
  readonly work?: WorkItem
}

export type { SessionNotice } from '../../shared/api'

export interface SessionsDeps {
  readonly codex?: Pick<CodexSessions, 'account' | 'models' | 'create' | 'list' | 'read' | 'turns' | 'search' | 'delete' | 'rename' | 'hold' | 'dispose' | 'goal' | 'setGoal' | 'clearGoal'>
  readonly notes: NotesStore
  readonly changed: (sessions: readonly ChatSession[]) => void
  readonly items: (items: SessionItems) => void
  readonly account: (account: ClaudeAccount) => void
  /** How much of the plan is spent, each time a turn says so. */
  readonly plan?: (plan: PlanUsage) => void
  /** Said only where the chat window is not showing that conversation. */
  readonly notify: (notice: SessionNotice) => void
  /** Points the window at a conversation it is not showing, without bringing it forward. */
  readonly show?: (id: string) => void
  /** How many conversations may work at once; nought, or none given, is no limit. */
  readonly limit?: () => number
  /** In progress as it was dragged into order on the board, which is who a free slot goes to first. */
  readonly order?: () => readonly string[]
  /** How full the conversations working are, each time it may have changed. */
  readonly lineup?: (lineup: Lineup) => void
  readonly later?: (run: () => void, ms: number) => () => void
  // What follows is the outside world, replaceable so the rules can be tested without it.
  readonly claude?: typeof holdClaude
  readonly disk?: {
    list(root: string): Promise<readonly (Omit<Row, 'root' | 'project'> & { readonly below?: string })[]>
    read(root: string, id: string): Promise<Conversation | undefined>
    has(root: string, id: string): Promise<boolean>
    delete?(root: string, id: string): Promise<boolean>
    goal?(root: string, id: string): Promise<GoalRead>
    forkPoint?(root: string, id: string, at: number): Promise<string | undefined>
    links?(root: string, id: string): Promise<Link[]>
    every?: typeof everyClaude
  }
  readonly there?: (path: string) => Promise<boolean>
  readonly claudeAccount?: () => Promise<ClaudeAccount>
  /** The models the tool has, for a project's own root where one is given: a host's may not be this computer's. */
  readonly claudeModels?: (root?: string) => Promise<ClaudeModel[] | undefined>
  readonly claudeProgram?: () => Promise<ClaudeProgram | undefined>
  readonly usage?: (models: readonly string[]) => Promise<Usage>
  readonly mcp?: (root: string, change?: McpChange) => Promise<McpServer[] | undefined>
  readonly browsers?: (root: string, pick?: string) => Promise<Browser[] | undefined>
  readonly shell?: typeof runShell
  /** What a task in the background printed, where it is not on this computer to read. */
  readonly taskOutput?: (root: string, session: string, task: BackgroundTask) => Promise<TaskOutput | undefined>
  /** Opens a terminal in the folder with the command typed in, for one that wants a keyboard. Without it, it is run here anyway. `status` is where it is to write the exit code once the command is done, for one that wants a keyboard. */
  readonly terminal?: (root: string, command: string, status?: string) => void
  readonly now?: () => number
}

/** Something said about a session that the tool's own file will not say back. */
export interface Kept {
  /** The item it was under, so it goes back where it was. */
  readonly after: string | undefined
  readonly item: SessionItem
}

interface Live {
  id: string
  readonly root: string
  title: string
  mode: SessionMode
  driver: Driver | undefined
  /** The mode the process was started in, which for Claude Code cannot change without starting it again. */
  runs: SessionMode
  /** The model chosen under the field, as the tool is handed it. Nothing is Default. */
  chosen: string | undefined
  reasoning: SessionMessage['reasoning']
  ranReasoning: SessionMessage['reasoning']
  actualReasoning: ReasoningEffort | undefined
  /** The model the process was started with, which cannot change without starting it again either. */
  ran: string | undefined
  /** The tool has a conversation under this id, so it is picked up rather than begun. */
  begun: boolean
  messages: number
  items: Map<string, SessionItem>
  kept: Kept[]
  /** The line of a thing being asked about, taken down while its card is up. */
  held: Map<string, SessionItem>
  state: SessionState
  stands: string
  said: string
  at: number
  model: string | undefined
  /** Tokens in the context after the last answer. */
  used: number | undefined
  /** What it cost in the runs of the tool its file counts, and in the run holding it now. */
  spent: number | undefined
  running: number | undefined
  asks: Map<string, Wanted>
  grants: Set<string>
  /** The message the turn in hand was started with, for the turn that does not finish. */
  last: string | undefined
  quiet: NodeJS.Timeout | undefined
  /** Remote Control is on, and where the conversation is on claude.ai. The process is kept while it is. */
  remote: string | undefined
  /** Commands typed after `!` that have finished since the last message, for the next one to hand to Claude. */
  told: { readonly id: string; readonly blocks: readonly string[] }[]
  /** Commands still running, by the item showing them. */
  commands: Map<string, Running>
  /** The item of a command that has stopped on a question, until it prints again or is typed to. */
  typing: string | undefined
  /** What the tool has had in the background, running or ended, until the person clears what ended. */
  tasks: readonly BackgroundTask[]
  /** The name Claude Code was last told, so it is told again after a start or a change. */
  named: string | undefined
  back: NodeJS.Timeout | undefined
  stopping: NodeJS.Timeout | undefined
  /** Set with /goal, as the tool's file last said or as it was just sent. */
  goal: SessionGoal | undefined
  goalStatus: Extract<SessionStatus, 'review' | 'blocked'> | undefined
  /** The goal was cleared while the turn ran, and the tool is told once it has stopped. */
  clearing: boolean
  /** Messages sent while it worked, oldest first. */
  queued: Queued[]
  /** Its turn ended in a failure, so its queued messages are left for the person rather than sent. */
  parked: boolean
  /** Started as a copy of another conversation, which its first run is told. */
  fork: { readonly from: string; readonly at?: string } | undefined
  /** A general question, which is never listed and is thrown away a day after it has gone quiet. */
  readonly question: boolean
  /** When the question is thrown away, counted from when it last went quiet. */
  goes: number | undefined
  /** A question kept for good, which is never thrown away. */
  stays: boolean
}

/** `/goal <condition>` sets one, and `/goal clear` or one of the tool's other words for it ends it early. */
const GOAL = /^\/goal\s+([\s\S]+)$/
const CLEAR_GOAL = new Set(['clear', 'stop', 'off', 'reset', 'none', 'cancel'])

/** The condition a message sets as the goal, `''` where it clears the goal, and nothing where it is not about one. */
function goalSent(text: string): string | undefined {
  const goal = GOAL.exec(text.trim())?.[1]?.trim()
  return goal === undefined || !CLEAR_GOAL.has(goal.toLowerCase()) ? goal : ''
}

/** How long an idle session keeps its process. */
const QUIET = 10 * 60_000

/** How long a general question is kept once it has gone quiet. */
const QUESTION_KEPT = 24 * 60 * 60_000
/** A job done, the queue is looked at after a pause somewhere in here, so a conversation answered straight away keeps going. Approved tasks start this far apart too. */
const PAUSE = { least: 3_000, most: 10_000 }

const pause = (): number => PAUSE.least + Math.random() * (PAUSE.most - PAUSE.least)

function after(run: () => void, ms: number): () => void {
  const timer = setTimeout(run, ms)
  return () => clearTimeout(timer)
}

const running = (task: BackgroundTask): boolean => task.status === 'running'

/** Tasks as they stand once their process is gone, which took every one still running with it. */
const ended = (tasks: readonly BackgroundTask[]): readonly BackgroundTask[] =>
  tasks.map((task) => (running(task) ? { ...task, status: 'stopped', ended: Date.now() } : task))

/** How long Stop waits to be heard before the process is ended instead. */
const STOP_HEARD = 5_000

/** How long a command typed after ! has to say nothing, after a question, to be taken as waiting for an answer. */
const ASKS_AFTER = 1_500

/** How long the plan's windows, once asked, are taken to stand. */
const MEASURED_FOR = 60_000

/** How far back Hidden conversations reads before it is asked for older ones: what is looked for there is remembered as recent. */
const HIDDEN_FOR = 30 * 24 * 60 * 60_000

/** The nearest project a folder is in, where it is in one. */
const projectOf = (path: string, projects: readonly string[]): string | undefined =>
  projects
    .filter((one) => path === one || path.startsWith(`${one}/`))
    .sort((one, other) => other.length - one.length)[0]

const there = (path: string): Promise<boolean> =>
  stat(path).then(
    (found) => found.isDirectory(),
    () => false,
  )

/**
 * `below` as a host's own listing gives it back: a raw path on the host's
 * computer, since that is all a script run over ssh knows to say. Read here as
 * a project root is everywhere else, `ssh://<host><path>`, unless it is one already.
 */
export const belowRoot = (root: string, below: string): string => {
  const host = hostOf(root)
  return host === undefined || isRemote(below) ? below : remoteRoot(host, below)
}


/** What "for this session" is remembered under, or nothing where it cannot be. */
function grantKeys(wanted: Wanted): string[] {
  switch (wanted.kind) {
    case 'command':
      return [`command:${wanted.command}`]
    case 'write':
      return wanted.paths.map((path) => `write:${path}`)
    case 'read':
      return [`read:${wanted.path}`]
    case 'web':
      try {
        return [`web:${new URL(wanted.url).host}`]
      } catch {
        return [`web:${wanted.url}`]
      }
    case 'other':
      return [`other:${wanted.tool}`]
    case 'question':
    case 'start':
      return []
  }
}

/** A task in a request, with the folder it starts in. */
export interface Asking extends RequestTask {
  readonly root: string
}

/** How each task in a request was answered, in the order asked, and what the person said back. */
export interface RequestAnswered {
  readonly tasks: readonly { readonly answer: 'started' | 'queued' | 'refused'; readonly id?: string; readonly note?: string }[]
  readonly reply?: string
}

interface Pending {
  readonly session: string
  readonly roots: readonly string[]
  readonly mode: SessionMode
  readonly answered: (answered: RequestAnswered | undefined) => void
}

/**
 * GeckIt's own `geckit start`, run as itself: the request it makes is the
 * question, so Claude Code's own permission for it would ask the same thing
 * twice. A heredoc feeding it tasks is let through too, but nothing chained.
 */
const GECKIT_START = /^(?:~|\$HOME|\/[^\s;&|<>`$]*)\/\.geckit\/bin\/geckit(?:-local)? start(?: [^;&|<>`$\n]*?)?(?: <<-?'([A-Z_]+)')?$/

export function startsConversations(command: string): boolean {
  const [first = '', ...rest] = command.trim().split('\n')
  const matched = GECKIT_START.exec(first)
  if (matched === null) return false
  const tag = matched[1]
  return tag === undefined ? rest.length === 0 : rest.indexOf(tag) === rest.length - 1
}

const conversations = (count: number): string => (count === 1 ? 'a conversation' : `${String(count)} conversations`)

export class Sessions {
  readonly #deps: SessionsDeps
  readonly #live = new Map<string, Live>()
  /** Requests from `geckit start` waiting for an answer, by the item showing them. */
  readonly #requests = new Map<string, Pending>()
  readonly #rows = new Map<string, Row>()
  #watching: string | undefined
  #goalWatch: ReturnType<typeof setInterval> | undefined
  #plan: PlanUsage | undefined
  /** How much context each model may hold, as the tool measures it; nothing for one it would not say. */
  readonly #windows = new Map<string, number | undefined>()
  #measured = -Infinity
  #measuring: Promise<void> | undefined
  /** What the tool said it has, kept once said: a vendor ships a model far less often than a window is opened. */
  #models: Promise<ClaudeModel[] | undefined> | undefined
  /** The Claude Code that answers, as last looked at, and when. The models and windows above were asked of it. */
  #program: ClaudeProgram | undefined
  #looked = -Infinity
  #looking: Promise<void> | undefined
  /** Counts the versions seen, so a window the one before measured is not kept once it lands. */
  #generation = 0
  /** Given a slot and not seen working yet, and since when. */
  /** The look at the queue waiting out its pause. */
  #glancing: (() => void) | undefined

  constructor(deps: SessionsDeps) {
    this.#deps = deps
    // Conversations begun with a message that was still waiting for a slot when GeckIt closed.
    for (const [id, note] of Object.entries(deps.notes.all())) {
      if (note.unborn === undefined || (note.queued ?? []).length === 0) continue
      const live = this.#fresh(id, note.unborn, note.title ?? '', sessionMode(note.mode))
      live.queued = [...(note.queued ?? [])]
      live.chosen = note.model
      live.reasoning = note.reasoning
    }
    // The general questions held when GeckIt last closed, each deleted when its day runs out.
    for (const [id, note] of Object.entries(deps.notes.all())) {
      if ((note.question !== true && note.stays !== true) || note.hidden === true) continue
      const live = this.#fresh(id, homedir(), note.title ?? '', sessionMode(note.mode), true)
      live.begun = true
      live.stays = note.stays === true
      live.at = note.seen ?? live.at
      live.stands = note.stands ?? ''
      // Kept before its last answer was written down: the transcript has it.
      if (note.stands === undefined) {
        void standsIn(live.root, id)
          .then((stands) => {
            if (stands === '' || live.stands !== '' || live.state !== 'idle') return
            live.stands = stands
            this.#keepNote(live)
            this.#changed()
          })
          .catch(() => undefined)
      }
      if (live.stays) continue
      live.goes = note.goes ?? live.at + QUESTION_KEPT
      live.quiet = setTimeout(() => void this.remove([id]), Math.max(0, live.goes - this.#now()))
    }
  }

  /** Writes down a general question as it stands, so a restart brings it back with the time it has left. */
  #keepNote(live: Live): void {
    const { goes: _goes, stays: _stays, ...note } = this.#deps.notes.all()[live.id] ?? {}
    this.#deps.notes.set(live.id, {
      ...note,
      question: true,
      title: live.title,
      seen: live.at,
      ...(live.stands === '' || live.state !== 'idle' ? {} : { stands: live.stands }),
      ...(live.stays ? { stays: true } : {}),
      ...(live.goes === undefined ? {} : { goes: live.goes }),
    })
  }

  #now(): number {
    return this.#deps.now?.() ?? Date.now()
  }

  #note(id: string, change: SessionNote): void {
    if (this.#live.get(id)?.question === true) return
    this.#deps.notes.set(id, { ...this.#deps.notes.all()[id], ...change })
  }

  #queue(live: Live, queued: Queued[]): void {
    live.queued = queued
    if (live.question) return
    const { queued: _was, ...note } = this.#deps.notes.all()[live.id] ?? {}
    this.#deps.notes.set(live.id, queued.length === 0 ? note : { ...note, queued })
  }

  // --- what the window asks ---------------------------------------------------

  async account(provider: SessionProvider = 'claude'): Promise<ClaudeAccount> {
    if (provider === 'codex') return this.#deps.codex?.account() ?? { provider, here: false, signedIn: undefined }
    const [account, program] = await Promise.all([(this.#deps.claudeAccount ?? claudeAccount)(), this.#look()])
    return program === undefined ? account : { ...account, program }
  }

  /**
   * Which Claude Code answers, looked at again at most once a minute: when the
   * plan is measured, and when the model menu is opened. Nothing else says it
   * was updated, and GeckIt may have been open for weeks.
   */
  async #look(): Promise<ClaudeProgram | undefined> {
    if (this.#looking === undefined && this.#now() - this.#looked >= MEASURED_FOR) {
      this.#looked = this.#now()
      this.#looking = (this.#deps.claudeProgram ?? claudeProgram)()
        .then((program) => {
          if (program !== undefined) this.#took(program)
        })
        .catch(() => undefined)
        .finally(() => {
          this.#looking = undefined
        })
    }
    await this.#looking
    return this.#program
  }

  /**
   * Another version has other models and measures windows its own way: what
   * was asked of the one before is forgotten, asked again, and every window
   * is told which one answers now.
   */
  #took(program: ClaudeProgram): void {
    const before = this.#program?.version
    this.#program = program
    if (before === undefined || before === program.version) return
    this.#models = undefined
    this.#windows.clear()
    this.#generation += 1
    this.#changed()
    void this.measure()
    void this.account().then((account) => this.#deps.account(account))
  }

  /**
   * The models the tool says it has, or nothing where it did not say.
   *
   * Asked when the menu under the composer is opened, which is a press, and
   * not when a window is: asking Claude Code means starting it. Every opening
   * asks here, and is answered from what was kept until another version of
   * Claude Code answers.
   */
  async models(root?: string, provider: SessionProvider = 'claude'): Promise<ClaudeModel[] | undefined> {
    if (provider === 'codex') return root !== undefined && isRemote(root) ? undefined : this.#deps.codex?.models()
    // A host's own claude may name other models than this computer's, and is not kept the same way: it is asked fresh each time, and nothing is said where it cannot be asked cheaply.
    if (root !== undefined && isRemote(root)) return (this.#deps.claudeModels ?? claudeModels)(root)
    await this.#look()
    if (this.#models === undefined) {
      this.#models = (this.#deps.claudeModels ?? claudeModels)()
      // Not having said is not kept: the next opening of the menu asks again.
      void this.#models.then((said) => {
        if (said === undefined) this.#models = undefined
      })
    }
    return this.#models
  }

  /** Every conversation about these projects, read again from where the tool keeps them. */
  async list(roots: readonly string[]): Promise<ChatSession[]> {
    for (const root of roots) {
      const found = await (this.#deps.disk?.list ?? listClaude)(root).catch(() => [])
      for (const [id, row] of this.#rows) if ((row.project ?? row.root) === root) this.#rows.delete(id)
      for (const { below, ...row } of found) {
        // A folder below two projects is the nearer one's.
        const held = this.#rows.get(row.id)
        if (below !== undefined && held !== undefined && (held.project ?? held.root).length > root.length) continue
        this.#rows.set(row.id, below === undefined ? { ...row, root } : { ...row, root: belowRoot(root, below), project: root })
      }
    }
    const codexRows = await this.#deps.codex?.list(roots.filter((root) => !isRemote(root))) ?? []
    const importedIds = new Map(codexRows.flatMap((row) => row.importedFrom === undefined ? [] : [[row.importedFrom, row.id] as const]))
    let imported = false
    const notes = { ...this.#deps.notes.all() }
    for (const row of codexRows) {
      const note = this.#deps.notes.all()[row.id]
      if (row.importedFrom !== undefined && note?.importedFrom === undefined) {
        const original = this.#deps.notes.all()[row.importedFrom]
        const source = this.#rows.get(row.importedFrom)
        const visible = original?.hidden !== true && (original?.here === true || original?.shown === true || (source !== undefined && !source.driven))
        const migrated = importedNote(original ?? {}, note, row.importedFrom, importedIds)
        notes[row.id] = { ...migrated, importedMetadata: 0, here: migrated.here ?? false, shown: migrated.shown ?? visible, hidden: migrated.hidden ?? !visible }
        imported = true
      }
      this.#rows.set(row.id, row)
    }
    if (imported) this.#deps.notes.replace(notes)
    const goalRows = codexRows.filter((row) => this.#live.get(row.id)?.driver === undefined && (this.#deps.notes.all()[row.id]?.goal !== undefined || row.id === this.#watching))
    const messages = goalRows.map((row) => this.#live.get(row.id)?.messages)
    const goals = await Promise.all(goalRows.map((row) => this.#deps.codex?.goal(row.id).catch(() => undefined)))
    for (const [index, row] of goalRows.entries()) {
      const goal = goals[index]
      const note = this.#deps.notes.all()[row.id]
      if (goal === undefined || note === undefined) continue
      const shown = goal === null || goal.status === 'complete' ? undefined : { condition: goal.objective, checks: 0 }
      const live = this.#live.get(row.id)
      if (live?.messages !== messages[index] || live?.driver !== undefined || (live?.queued.length ?? 0) > 0) continue
      if (goal !== null && goal.status === 'complete' && live !== undefined && live.messages > 0 && live.goal === undefined) continue
      if (live !== undefined) live.goal = shown
      const status = goal !== null && (goal.status === 'complete' || goal.status === 'blocked' || goal.status === 'budgetLimited' || goal.status === 'usageLimited') && note.status === undefined
        ? goal.status === 'complete' ? 'review' : 'blocked'
        : note.status
      this.#note(row.id, { goal: shown, ...(status === undefined ? {} : { status }) })
    }
    // A model not seen before is measured, so its rows can say how much context it holds.
    if ([...this.#rows.values()].some((row) => providerOf(row.id) === 'claude' && row.model !== undefined && !this.#windows.has(row.model))) void this.measure()
    return this.#listed(roots)
  }

  /** Reads a host's projects again once it comes up, and tells the windows: its conversations were not read while it was not connected. */
  async refresh(roots: readonly string[]): Promise<void> {
    await this.list(roots)
    this.#changed()
  }

  #listed(roots?: readonly string[]): ChatSession[] {
    const ids = new Set([...this.#rows.keys(), ...this.#live.keys()])
    const sessions: ChatSession[] = []
    for (const id of ids) {
      const row = this.#rows.get(id)
      const live = this.#live.get(id)
      const note = this.#deps.notes.all()[id]
      const where = live?.root ?? row?.root
      const project = row?.project
      // A general question is in no project, and every list carries it, so a phone reading the list again keeps its questions.
      if (where === undefined || (roots !== undefined && !roots.includes(project ?? where) && live?.question !== true)) continue
      if (note?.hidden === true) continue
      if ((live === undefined || (providerOf(id) === 'codex' && !live.question)) && row?.driven === true && note?.here !== true && note?.shown !== true) continue
      // Held only because it was looked at, and the tool has nothing under that id any more.
      if (live !== undefined && row === undefined && !live.begun && live.state === 'idle' && live.last === undefined && live.items.size === 0 && live.queued.length === 0) {
        continue
      }
      const quiet = live === undefined || live.state === 'idle'
      const model = live?.model ?? row?.model
      const used = live?.used ?? row?.used
      const window = model === undefined ? undefined : this.#windows.get(model)
      const cost = live?.spent === undefined && live?.running === undefined ? undefined : (live.spent ?? 0) + (live.running ?? 0)
      const chosen = live === undefined ? note?.model : live.chosen
      const reasoning = live === undefined ? note?.reasoning : live.reasoning
      const actualReasoning = live?.actualReasoning ?? row?.actualReasoning
      const runs = [...(live?.commands.keys() ?? [])].map((key) => live?.items.get(key)).find((item) => item?.kind === 'shell')
      // One begun here is not on disk yet the first time it is listed.
      const first = row === undefined ? [...(live?.items.values() ?? [])].find((item) => item.kind === 'mine') : undefined
      const work = row?.work ?? (first?.kind === 'mine' ? workItem(first.text) : undefined)
      const queued = live?.queued ?? note?.queued ?? []
      const asking = this.#asking(id)
      const goal = live?.goal ?? note?.goal
      sessions.push({
        id,
        ...(providerOf(id) === 'codex' ? { provider: 'codex' } : {}),
        root: where,
        ...(project === undefined ? {} : { project }),
        title: note?.title ?? live?.title ?? row?.title ?? '',
        stands:
          (asking !== undefined
            ? `Wants to start ${conversations(asking)}`
            : quiet
            ? runs !== undefined
              ? live?.typing === runs.id
                ? `!${runs.command} waits for you to type`
                : `Running !${runs.command}`
              : note?.cut !== undefined
                ? 'Stopped when GeckIt closed'
                : live?.stands || row?.stands
            : live.stands) ?? '',
        state: asking !== undefined ? 'asks' : quiet && note?.unread === true ? 'unread' : (live?.state ?? 'idle'),
        at: Math.max(live?.at ?? 0, row?.at ?? 0),
        here: note?.here === true,
        mode: live?.mode ?? sessionMode(note?.mode),
        ...(model === undefined ? {} : { model }),
        ...(chosen === undefined ? {} : { chosen }),
        ...(providerOf(id) === 'codex' ? { reasoning: reasoning ?? actualReasoning ?? '' } : {}),
        ...(actualReasoning === undefined ? {} : { actualReasoning }),
        ...(note?.seen === undefined ? {} : { seen: note.seen }),
        ...(live?.remote === undefined ? {} : { remote: live.remote }),
        ...(live === undefined || live.tasks.length === 0 ? {} : { tasks: live.tasks }),
        ...(goal === undefined ? {} : { goal }),
        ...(runs === undefined ? {} : { runs: runs.command }),
        ...(runs !== undefined && live?.typing === runs.id ? { typing: true } : {}),
        ...(work === undefined ? {} : { work }),
        ...(note?.status === undefined ? {} : { status: note.status }),
        ...(queued.length === 0
          ? {}
          : { queued: queued.map(({ id: key, message }) => ({ id: key, text: message.text, images: message.images?.length ?? 0 })) }),
        ...(live !== undefined && this.#waiting(live) ? { waits: true } : {}),
        ...(live?.question === true ? { question: true } : {}),
        ...(live?.goes === undefined ? {} : { goes: live.goes }),
        ...(live?.stays === true ? { stays: true } : {}),
        ...(note?.parent === undefined ? {} : { parent: note.parent }),
        ...(note?.created === undefined ? {} : { created: note.created }),
        ...(used === undefined && cost === undefined
          ? {}
          : {
              spend: {
                ...(used === undefined ? {} : { used }),
                ...(window === undefined ? {} : { window }),
                ...(cost === undefined ? {} : { cost }),
              },
            }),
      })
    }
    return sessions.sort((one, other) => other.at - one.at)
  }

  #changed(): void {
    const all = this.#listed()
    this.#deps.changed(all)
    this.#deps.lineup?.({ working: taken(this.#standing(all)), limit: this.#deps.limit?.() ?? 0 })
  }

  /** Has queued messages of its own to send and no turn running, so it waits for a slot. One cut off by GeckIt closing waits for its continue instead. */
  #waiting(live: Live): boolean {
    return (
      live.queued.length > 0 &&
      live.state !== 'working' &&
      live.state !== 'asks' &&
      !live.parked &&
      !live.clearing &&
      this.#deps.notes.all()[live.id]?.cut === undefined
    )
  }

  #standing(all: readonly ChatSession[]): Standing[] {
    return all.map((one) => {
      const live = this.#live.get(one.id)
      return {
        id: one.id,
        state: one.state,
        at: one.at,
        ...(one.status === undefined ? {} : { status: one.status }),
        ...(one.question === true ? { question: true } : {}),
        waiting: live !== undefined && this.#waiting(live),
      }
    })
  }

  /** A message to this conversation may go now: there is no limit, or fewer are working than the limit. */
  #may(): boolean {
    const limit = this.#deps.limit?.() ?? 0
    return limit === 0 || taken(this.#standing(this.#listed())) < limit
  }

  /** A job is done: after the pause, the cards are looked at from the top and those with queued messages start, as many as there is room for. */
  #glance(): void {
    if (this.#glancing !== undefined) return
    const limit = this.#deps.limit?.() ?? 0
    this.#glancing = (this.#deps.later ?? after)(
      () => {
        this.#glancing = undefined
        for (const id of letGo(this.#standing(this.#listed()), this.#deps.limit?.() ?? 0, this.#deps.order?.() ?? [])) this.carryOn(id)
      },
      limit === 0 ? 0 : pause(),
    )
  }

  /** Queued messages holding every word asked, in these projects: all there is to find in a conversation not begun yet, which has no file. */
  queuedHolding(roots: readonly string[], asked: string): ChatFound[] {
    const words = asked.toLowerCase().split(/\s+/).filter((word) => word !== '')
    if (words.length === 0) return []
    return this.#listed(roots).flatMap((one) => {
      const hits = (this.#live.get(one.id)?.queued ?? []).filter((queued) => words.every((word) => queued.message.text.toLowerCase().includes(word)))
      const last = hits.at(-1)
      return last === undefined ? [] : [{ id: one.id, root: one.root, count: hits.length, said: last.message.text.replace(/\s+/g, ' ').trim().slice(0, 160) }]
    })
  }

  searchCodex(roots: readonly string[], asked: string): Promise<ChatFound[]> {
    return this.#deps.codex?.search(roots.filter((root) => !isRemote(root)), asked) ?? Promise.resolve([])
  }

  /** The limit changed: whatever it makes room for goes now. */
  again(): void {
    this.#changed()
    this.#glance()
  }

  /** How many conversations a session is waiting to be let start, where it is. */
  #asking(id: string): number | undefined {
    const live = this.#live.get(id)
    const waiting = [...this.#requests].filter(([, pending]) => pending.session === id)
    if (live === undefined || waiting.length === 0) return undefined
    return waiting.reduce((count, [key]) => {
      const item = live.items.get(key)
      return count + (item?.kind === 'request' ? item.tasks.length : 0)
    }, 0)
  }

  /**
   * Claude asks, with `geckit start`, for conversations to be started. The
   * request is shown in the conversation that asked and nothing starts until
   * the person answers; the answer comes back as one, for every task at once.
   * Nothing comes back where the command stopped waiting first.
   */
  request(session: string, tasks: readonly Asking[], mode: SessionMode, gone: AbortSignal): Promise<RequestAnswered | undefined> {
    const live = this.#live.get(session) ?? this.#adopt(session)
    if (live === undefined) return Promise.resolve(undefined)
    const item: SessionItem = { kind: 'request', id: `request:${randomUUID()}`, tasks: tasks.map(({ root: _root, ...task }) => task) }
    live.kept.push({ after: [...live.items.keys()].at(-1), item })
    live.items.set(item.id, item)
    live.at = this.#now()
    return new Promise((answered) => {
      this.#requests.set(item.id, { session, roots: tasks.map((task) => task.root), mode, answered })
      gone.addEventListener('abort', () => this.#withdrawn(item.id))
      this.#deps.items({ id: live.id, items: [item] })
      this.#changed()
      if (this.#watching === live.id) return
      const projects = [...new Set(tasks.map((task) => task.project))].join(', ')
      this.#deps.notify({
        session: live.id,
        title: `Wants to start ${conversations(tasks.length)} - ${projects}`,
        subtitle: this.#deps.notes.all()[live.id]?.title ?? live.title,
        body: tasks.map((task) => task.title).join('\n'),
        asks: true,
        request: item.id,
      })
    })
  }

  /** The person's answer to a request: the ticked tasks start a pause apart, each with its note, and the rest are refused. */
  async answerRequest(request: string, choice: RequestChoice): Promise<void> {
    const pending = this.#requests.get(request)
    const live = pending === undefined ? undefined : this.#live.get(pending.session)
    const item = live?.items.get(request)
    if (pending === undefined || live === undefined || item?.kind !== 'request') return
    this.#requests.delete(request)
    const reply = choice.reply?.trim() || undefined
    const tasks: RequestTask[] = []
    const waits = new Set<string>()
    for (const [index, task] of item.tasks.entries()) {
      const root = pending.roots[index]
      if (choice.start[index] !== true || root === undefined) {
        tasks.push(task)
        continue
      }
      const note = choice.notes[index]?.trim() || undefined
      const text = note === undefined ? task.text : `${task.text}\n\nNote: ${note}`
      const noted = note === undefined ? {} : { note }
      if (tasks.some((one) => one.started !== undefined)) await new Promise<void>((resolve) => (this.#deps.later ?? after)(resolve, pause()))
      const id = await this.send({ root, mode: pending.mode, text })
      this.#note(id, { parent: live.id })
      if (task.goal !== undefined) await this.send({ session: id, root, mode: pending.mode, text: `/goal ${task.goal}` })
      const child = this.#live.get(id)
      if (child !== undefined && this.#waiting(child)) waits.add(id)
      tasks.push({ ...task, started: id, ...noted })
    }
    this.#settle(live, { ...item, tasks, answer: { how: 'answered', where: choice.where, ...(reply === undefined ? {} : { reply }) } })
    pending.answered({
      tasks: tasks.map((task) =>
        task.started !== undefined
          ? { answer: waits.has(task.started) ? 'queued' : 'started', id: task.started, ...(task.note === undefined ? {} : { note: task.note }) }
          : { answer: 'refused' },
      ),
      ...(reply === undefined ? {} : { reply }),
    })
  }

  /** A conversation given a slot: the first of its queued messages goes. */
  carryOn(id: string): void {
    const live = this.#live.get(id) ?? this.#adopt(id)
    const next = live?.queued[0]
    if (live === undefined || next === undefined) return
    this.#queue(live, live.queued.slice(1))
    void this.send({ ...next.message, mode: live.mode }, true)
  }

  /** Start all, from a notice: every task starts, with no notes. */
  startAll(request: string, where: 'mac' | 'phone'): Promise<void> {
    const item = [...this.#live.values()].map((live) => live.items.get(request)).find((one) => one !== undefined)
    const count = item?.kind === 'request' ? item.tasks.length : 0
    return this.answerRequest(request, { start: Array<boolean>(count).fill(true), notes: [], where })
  }

  /** The command that asked stopped waiting, so nothing it asked for will start. */
  #withdrawn(request: string): void {
    const pending = this.#requests.get(request)
    if (pending === undefined) return
    this.#requests.delete(request)
    const live = this.#live.get(pending.session)
    const item = live?.items.get(request)
    if (live !== undefined && item?.kind === 'request') this.#settle(live, { ...item, answer: { how: 'withdrawn' } })
    else this.#changed()
    pending.answered(undefined)
  }

  /** A request as it was answered, shown and written down, so it is still there after a restart and `geckit linked` can read it. */
  #settle(live: Live, item: Extract<SessionItem, { kind: 'request' }>): void {
    live.items.set(item.id, item)
    const kept = live.kept.find((one) => one.item.id === item.id)
    const put: Kept = { after: kept?.after, item }
    live.kept = live.kept.map((one) => (one.item.id === item.id ? put : one))
    const written = (this.#deps.notes.all()[live.id]?.requests ?? []).filter((one) => one.item.id !== item.id)
    this.#note(live.id, { requests: [...written, put] })
    this.#deps.items({ id: live.id, items: [item] })
    this.#changed()
  }

  /**
   * A session's transcript. Read again from the tool's own file unless this
   * window is the one holding the conversation, so that one continued in a
   * terminal in the meantime is the one that is shown and replied to.
   */
  async items(id: string): Promise<SessionItem[]> {
    const live = this.#live.get(id) ?? this.#adopt(id)
    if (live === undefined) return []
    if (live.driver === undefined) {
      const spent = live.spent
      const goal = live.goal
      await this.#reread(live)
      // What it cost is only in the file, so the row learns it here.
      if (live.spent !== spent || live.goal?.condition !== goal?.condition) this.#changed()
    } else if (providerOf(id) === 'codex') await this.#goal(live)
    return [...live.items.values()]
  }

  /** The links written in a session, from what is held where it is running here and from its file where it is not. */
  async links(id: string): Promise<Link[]> {
    const live = this.#live.get(id)
    if (live?.driver !== undefined) return linksIn([...live.items.values()])
    const root = live?.root ?? this.#rows.get(id)?.root
    if (root !== undefined && providerOf(id) === 'codex') return linksIn((await this.#deps.codex?.read(root, id))?.items ?? [])
    return root === undefined ? [] : (this.#deps.disk?.links ?? readLinks)(root, id)
  }

  /** Start holding in memory a session the tool listed. */
  #adopt(id: string): Live | undefined {
    const row = this.#rows.get(id)
    if (row === undefined) return undefined
    const note = this.#deps.notes.all()[id]
    const live = this.#fresh(id, row.root, note?.title ?? row.title, sessionMode(note?.mode))
    live.begun = true
    live.stands = row.stands
    live.at = row.at
    live.model = row.model
    live.used = row.used
    live.chosen = note?.model
    live.reasoning = note?.reasoning
    live.goal = note?.goal
    live.queued = [...(note?.queued ?? [])]
    live.kept = [...(note?.requests ?? [])]
    return live
  }

  #fresh(id: string, root: string, title: string, mode: SessionMode, question = false): Live {
    const live: Live = {
      id,
      root,
      title,
      mode,
      driver: undefined,
      runs: mode,
      chosen: undefined,
      reasoning: undefined,
      ranReasoning: undefined,
      actualReasoning: undefined,
      ran: undefined,
      begun: false,
      messages: 0,
      items: new Map(),
      kept: [],
      held: new Map(),
      state: 'idle',
      stands: '',
      said: '',
      at: this.#now(),
      model: undefined,
      used: undefined,
      spent: undefined,
      running: undefined,
      asks: new Map(),
      grants: new Set(),
      last: undefined,
      quiet: undefined,
      remote: undefined,
      told: [],
      commands: new Map(),
    typing: undefined,
      tasks: [],
      named: undefined,
      back: undefined,
      stopping: undefined,
      goal: undefined,
      goalStatus: undefined,
      clearing: false,
      queued: [],
      parked: false,
      fork: undefined,
      question,
      goes: undefined,
      stays: false,
    }
    this.#live.set(id, live)
    return live
  }

  async #reread(live: Live): Promise<void> {
    const conversation = await (providerOf(live.id) === 'codex' ? this.#deps.codex?.read(live.root, live.id) : (this.#deps.disk?.read ?? readClaudeSession)(live.root, live.id))?.catch(() => undefined)
    if (conversation === undefined) return
    const read = conversation.items
    // Nothing holds it, so every run of the tool it had has written what it cost.
    live.spent = conversation.cost
    live.running = undefined
    live.goal = conversation.goal
    if (providerOf(live.id) === 'codex') this.#note(live.id, { goal: live.goal })
    // What it put in the background the last time it ran, on the first read of it alone: they are
    // ended, and once the list is here it is the process and the person who say what is in it.
    if (live.items.size === 0) live.tasks = [...conversation.tasks, ...live.tasks]

    const items = new Map(read.map((item) => [item.id, item]))
    // What only this window knows goes back where it was, unless the file says it too.
    const mine = read.filter((item) => item.kind === 'mine')
    for (const kept of live.kept) {
      if (items.has(kept.item.id)) continue
      if (kept.item.kind === 'mine') {
        const text = kept.item.text
        const same = mine.find((item) => item.kind === 'mine' && item.text === text)
        if (same !== undefined) {
          items.set(same.id, { ...same, unsent: true })
          continue
        }
      }
      if (kept.after === undefined || !items.has(kept.after)) {
        items.set(kept.item.id, kept.item)
        continue
      }
      const ordered = [...items.entries()]
      const at = ordered.findIndex(([key]) => key === kept.after)
      ordered.splice(at + 1, 0, [kept.item.id, kept.item])
      items.clear()
      for (const [key, item] of ordered) items.set(key, item)
    }
    live.items = items
  }

  /** `go` is a message that is part of a turn already given its slot, so the limit never holds it. */
  async send(message: SessionMessage, go = false): Promise<string> {
    let live = message.session === undefined ? undefined : (this.#live.get(message.session) ?? this.#adopt(message.session))
    if (live === undefined) {
      const root = message.question === true ? homedir() : message.root
      const provider = message.session === undefined ? message.provider ?? 'claude' : providerOf(message.session)
      if (provider === 'codex' && isRemote(root)) throw new Error('Codex is available for local projects. Choose Claude Code for this host.')
      if (provider === 'codex' && this.#deps.codex === undefined) throw new Error('Codex is not available. Install Codex and run codex login in a terminal.')
      const id = provider === 'codex' ? message.session ?? await this.#deps.codex?.create(root, message.mode, message.model) : randomUUID()
      if (id === undefined) throw new Error('Codex is not available. Install Codex and run codex login in a terminal.')
      live =
        message.question === true
          ? this.#fresh(id, root, firstLine(message.text, 80), message.mode, true)
          : this.#fresh(id, root, firstLine(message.text, 80), message.mode)
      if (provider === 'codex' && message.session !== undefined) {
        live.begun = true
        await this.#reread(live)
      }
      if (live.question) this.#keepNote(live)
    } else if (live.driver === undefined) {
      await this.#reread(live)
    }
    const nativeGoal = providerOf(live.id) === 'codex' ? goalSent(message.text) : undefined
    if (nativeGoal !== undefined && nativeGoal.toLowerCase() !== 'pause' && nativeGoal.toLowerCase() !== 'resume') {
      if (this.#deps.codex === undefined || (await this.#deps.codex.account()).key === true) throw new Error('Sign in with your ChatGPT plan to change a Codex goal.')
      if (nativeGoal === '') {
        await this.#deps.codex.clearGoal(live.id)
        this.#signal(live, { kind: 'goal', goal: undefined })
      } else {
        const goal = await this.#deps.codex.setGoal(live.id, nativeGoal)
        this.#signal(live, { kind: 'goal', goal: { condition: goal.objective, checks: 0 }, status: goal.status })
        if (this.#deps.notes.all()[live.id]?.status !== undefined) this.mark(live.id, undefined)
      }
      return live.id
    }
    live.messages += 1
    live.goalStatus = undefined
    if (this.#deps.notes.all()[live.id]?.status !== undefined) this.mark(live.id, undefined)
    const busy = live.state === 'working' || live.state === 'asks'
    // Written by the person, it is theirs again to be sent; a message waits behind the ones already queued, and for a slot.
    if (!go) live.parked = false
    const held = !busy && !go && !live.question && (live.queued.length > 0 || !this.#may())
    if (busy || held) {
      // A goal keeps the turn going until it holds, so it is cleared by stopping the turn and clearing it once it has.
      if (busy && live.goal !== undefined && goalSent(message.text) === '') {
        live.goal = undefined
        live.clearing = true
        this.stop(live.id)
        this.#changed()
        return live.id
      }
      // A goal waiting its turn stands on the row already, as one sent straight away does.
      const waiting = message.goal?.trim() || (providerOf(live.id) === 'codex' ? undefined : goalSent(message.text))
      if (waiting !== undefined && waiting !== '') live.goal = { condition: waiting, checks: 0 }
      if (message.goal?.trim()) this.#note(live.id, { goal: live.goal })
      this.#queue(live, [...live.queued, { id: `queued:${randomUUID()}`, message: { ...message, session: live.id }, at: this.#now() }])
      if (!live.begun && !this.#rows.has(live.id) && !live.question) this.#note(live.id, { title: live.title, mode: live.mode, unborn: live.root })
      this.#changed()
      return live.id
    }
    if (this.#deps.notes.all()[live.id]?.unborn !== undefined) {
      const { unborn: _unborn, ...note } = this.#deps.notes.all()[live.id] ?? {}
      this.#deps.notes.set(live.id, note)
    }

    live.reasoning = message.reasoning
    live.mode = message.mode
    // A conversation begun with a command is named after what is first said in it, and so is the one carried on in after `/clear`, which has no name yet either.
    if ((!live.begun || live.title === '') && ![...live.items.values()].some((item) => item.kind === 'mine')) {
      live.title = firstLine(message.text, 80) || live.title
    }
    if (live.chosen !== message.model) {
      live.chosen = message.model
      // What the tool last said answers is not what will. It says again when the turn begins.
      live.model = undefined
    }
    clearTimeout(live.back)
    // The goal holds from the moment it is sent; the file says the rest once the turn is over.
    const goal = message.goal?.trim() || (providerOf(live.id) === 'codex' ? undefined : goalSent(message.text))
    if (goal !== undefined) live.goal = goal === '' ? undefined : { condition: goal, checks: 0 }

    // The message is in the transcript before anything can go wrong with it.
    const again = message.again === undefined ? undefined : live.items.get(message.again)
    const saying = again?.kind === 'mine' ? again : message
    const gone = [...live.items.values()]
      .filter((item) => item.kind === 'note' && (item.note === 'failed' || item.note === 'limit'))
      .map((item) => item.id)
    for (const id of gone) live.items.delete(id)
    live.kept = live.kept.filter((kept) => !gone.includes(kept.item.id) && kept.item.id !== again?.id)
    const mine: SessionItem =
      again?.kind === 'mine'
        ? {
            kind: 'mine',
            id: again.id,
            text: again.text,
            ...(again.images === undefined ? {} : { images: again.images }),
            at: this.#now(),
          }
        : {
            kind: 'mine',
            id: `mine:${randomUUID()}`,
            text: message.text,
            ...(message.images === undefined || message.images.length === 0 ? {} : { images: message.images }),
            at: this.#now(),
          }
    live.items.set(mine.id, mine)
    live.last = mine.id

    // A session runs on a plan or not at all. Asked of the tool again here,
    // where something is about to be started, because what the window was told
    // is as old as its last look. A host's own claude is checked by starting
    // it, not by this computer's account: this computer may be signed in with
    // a key while the host it reaches is on a plan, or the other way round.
    if (live.driver === undefined && !isRemote(live.root) && (await this.account(providerOf(live.id))).key === true) {
      this.#deps.items({ id: live.id, items: [mine], gone })
      this.#ended(live, { kind: 'ended', how: 'offPlan' })
      return live.id
    }

    live.state = 'working'
    live.stands = 'Working'
    live.at = this.#now()

    try {
      await this.#hold(live)
      if (providerOf(live.id) === 'codex' && message.goal?.trim()) await this.#deps.codex?.setGoal(live.id, message.goal.trim())
      if (providerOf(live.id) === 'codex' && message.goal?.trim()) this.#note(live.id, { goal: live.goal })
    } catch (error) {
      this.#deps.items({ id: live.id, items: [mine], gone })
      this.#ended(live, { kind: 'ended', how: 'failed', text: error instanceof Error ? error.message : String(error) })
      return live.id
    }

    this.#note(live.id, {
      mode: live.mode,
      ...(live.chosen === undefined ? {} : { model: live.chosen }),
      reasoning: live.reasoning,
      here: this.#deps.notes.all()[live.id]?.here ?? !live.begun,
      title: this.#deps.notes.all()[live.id]?.title ?? live.title,
      // Written as the turn starts, since a crash leaves no chance to write anything as it ends.
      cut: { root: live.root, at: this.#now() },
    })
    this.#deps.items({ id: live.id, items: [mine], gone })
    this.#changed()
    live.begun = true
    // The tool's file has the commands from here on, with the message they went with.
    const told = live.told
    live.told = []
    live.kept = live.kept.filter((kept) => !told.some((one) => one.id === kept.item.id))
    live.driver?.send(saying.text, saying.images, told.flatMap((one) => one.blocks))
    return live.id
  }

  /**
   * A command typed after `!`: run in the project folder, shown in the
   * conversation, and handed to Claude with the next message, the way the
   * terminal's `!` is. One that wants a keyboard is opened in a terminal
   * instead, and waited for there.
   */
  async shell(asked: ShellCommand): Promise<string> {
    let live = asked.session === undefined ? undefined : (this.#live.get(asked.session) ?? this.#adopt(asked.session))
    const command = asked.command.trim()
    if (live === undefined) {
      const provider = asked.session === undefined ? asked.provider ?? 'claude' : providerOf(asked.session)
      if (provider === 'codex' && isRemote(asked.root)) throw new Error('Codex is available for local projects.')
      if (provider === 'codex' && this.#deps.codex === undefined) throw new Error('Codex is not available.')
      const id = provider === 'codex' ? asked.session ?? await this.#deps.codex?.create(asked.root, 'auto') : randomUUID()
      if (id === undefined) throw new Error('Codex is not available.')
      live = this.#fresh(id, asked.root, firstLine(`!${command}`, 80), sessionMode(undefined))
      if (provider === 'codex' && asked.session !== undefined) {
        live.begun = true
        await this.#reread(live)
      } else this.#note(id, { here: true })
    } else if (live.driver === undefined) {
      await this.#reread(live)
    }
    const held = live
    const terminal = wantsKeyboard(command) ? this.#deps.terminal : undefined
    // In a conversation Claude has answered in, a command is answered as soon as it ends, so the turn goes on without being told to.
    const wanted = [...held.items.values()].some((one) => one.kind === 'theirs')
    const item: SessionItem = {
      kind: 'shell',
      id: `shell:${randomUUID()}`,
      command,
      output: '',
      at: this.#now(),
      running: true,
      ...(terminal === undefined ? {} : { terminal: true }),
    }
    held.kept.push({ after: [...held.items.keys()].at(-1), item })
    held.items.set(item.id, item)
    held.at = this.#now()
    this.#deps.items({ id: held.id, items: [item] })

    const show = (next: SessionItem): void => {
      if (this.#live.get(held.id) !== held) return
      held.items.set(next.id, next)
      held.kept = held.kept.map((kept) => (kept.item.id === next.id ? { ...kept, item: next } : kept))
      this.#deps.items({ id: held.id, items: [next] })
    }
    // What it prints is drawn a few times a second, not once a line.
    let printed = ''
    let drawing: NodeJS.Timeout | undefined
    let quiet: NodeJS.Timeout | undefined
    const typed = (asks: boolean): void => {
      if ((held.typing === item.id) === asks) return
      held.typing = asks ? item.id : held.typing === item.id ? undefined : held.typing
      this.#changed()
    }
    const running =
      terminal === undefined
        ? (this.#deps.shell ?? runShell)(held.root, command, (output) => {
            printed = output
            drawing ??= setTimeout(() => {
              drawing = undefined
              if (held.commands.has(item.id)) show({ ...item, output: printed })
            }, 100)
            typed(false)
            clearTimeout(quiet)
            quiet = setTimeout(() => {
              if (held.commands.has(item.id)) typed(asksToType(printed))
            }, ASKS_AFTER)
          })
        : runInTerminal(held.root, command, terminal)
    held.commands.set(item.id, running)
    this.#changed()
    void running.done.then((ran) => {
      clearTimeout(drawing)
      clearTimeout(quiet)
      if (held.typing === item.id) held.typing = undefined
      held.commands.delete(item.id)
      const { running: _running, ...rest } = item
      show({
        ...rest,
        output: ran.output,
        ...(ran.stopped ? { stopped: true } : ran.code !== undefined && ran.code !== 0 ? { code: ran.code } : {}),
      })
      held.told.push({ id: item.id, blocks: toldClaude(command, ran) })
      this.#changed()
      if (!wanted || ran.stopped || this.#live.get(held.id) !== held) return
      void this.send({
        session: held.id,
        root: held.root,
        mode: held.mode,
        text: 'I ran it.',
        ...(held.chosen === undefined ? {} : { model: held.chosen }),
        ...(held.reasoning === undefined ? {} : { reasoning: held.reasoning }),
      })
    })
    return held.id
  }

  stopShell(id: string, item: string): void {
    this.#live.get(id)?.commands.get(item)?.stop()
  }

  typeShell(id: string, item: string, text: string): void {
    const live = this.#live.get(id)
    live?.commands.get(item)?.write?.(text)
    if (live?.typing !== item) return
    live.typing = undefined
    this.#changed()
  }

  /** A command the tool is waiting on, sent on in the background: the turn goes on, and so does the command. */
  toBackground(id: string, item: string): void {
    void this.#live.get(id)?.driver?.control?.({ subtype: 'background_tasks', tool_use_id: item }).catch(() => undefined)
  }

  stopTask(id: string, task: string): void {
    void this.#live.get(id)?.driver?.control?.({ subtype: 'stop_task', task_id: task }).catch(() => undefined)
  }

  /** Takes one that has ended off the list, as x does in the terminal's `/tasks`. */
  clearTask(id: string, task: string): void {
    const live = this.#live.get(id)
    if (live === undefined || !live.tasks.some((one) => one.id === task && one.status !== 'running')) return
    live.tasks = live.tasks.filter((one) => one.id !== task)
    this.#changed()
  }

  /** What a task in the background has printed so far, or what a helper has said and done. */
  async taskOutput(id: string, task: string): Promise<TaskOutput | undefined> {
    const live = this.#live.get(id)
    const one = live?.tasks.find((each) => each.id === task)
    if (live === undefined || one === undefined) return undefined
    const elsewhere = this.#deps.taskOutput
    if (elsewhere !== undefined) {
      const read = await elsewhere(live.root, live.id, one)
      if (read !== undefined) return read
      // A host not reached for it is not a reason to read this computer's own files instead: there is nothing of this task's here.
      if (isRemote(live.root)) return undefined
    }
    return taskOutput(live.root, one.output ?? (await taskFile(live.root, live.id, one.id)), one.kind)
  }

  /** Have a process holding the conversation, started the way its mode needs. */
  async #hold(live: Live): Promise<void> {
    clearTimeout(live.quiet)

    // The tool takes its model when a conversation is taken up, and is told how it may act when it starts, so
    // another model or a change of mind is a new start. Let go of before it is ended, so Remote Control carries over.
    if (live.driver !== undefined && (live.ran !== live.chosen || live.runs !== live.mode || live.ranReasoning !== live.reasoning)) {
      const old = live.driver
      live.driver = undefined
      live.tasks = ended(live.tasks)
      if (providerOf(live.id) === 'codex') await old.end()
      else void old.end()
    }
    if (live.driver !== undefined) return

    const resume = live.begun || (await (this.#deps.disk?.has ?? has)(live.root, live.id))
    // A new run counts from nothing, so the one before it is counted in with the earlier ones.
    if (live.running !== undefined) live.spent = (live.spent ?? 0) + live.running
    live.running = undefined
    live.runs = live.mode
    live.ran = live.chosen
    live.ranReasoning = live.reasoning
    const hold = providerOf(live.id) === 'codex' ? this.#deps.codex?.hold.bind(this.#deps.codex) : (this.#deps.claude ?? holdClaude)
    if (hold === undefined) throw new Error('Codex is not available.')
    const driver = hold(
      {
        root: live.root,
        id: live.id,
        resume,
        mode: live.mode,
        ...(live.chosen === undefined ? {} : { model: live.chosen }),
        ...(live.reasoning === undefined ? {} : { reasoning: live.reasoning }),
        ...(resume || live.fork === undefined ? {} : { fork: live.fork }),
      },
      (heard) => this.#hear(live, heard),
      () => {
        if (live.driver !== driver) return
        live.driver = undefined
        // What ran in the background went with the process. What it printed is still there to read.
        if (live.remote === undefined && !live.tasks.some(running)) return
        live.remote = undefined
        live.tasks = ended(live.tasks)
        this.#changed()
      },
    )
    live.driver = driver
    if (live.remote !== undefined) void this.#remoteOn(live).catch(() => this.#remoteOff(live))
  }

  /**
   * Remote Control for one conversation: on, it can be continued from claude.ai
   * or the Claude app, and the process holding it here stays up until it is
   * turned off. Says where it is on claude.ai, or why the tool would not.
   */
  async remote(id: string, on: boolean): Promise<{ readonly url?: string; readonly error?: string }> {
    const live = this.#live.get(id) ?? this.#adopt(id)
    if (live === undefined) return { error: 'This conversation is not here any more.' }
    if (!on) {
      await live.driver?.control?.({ subtype: 'remote_control', enabled: false }).catch(() => undefined)
      this.#remoteOff(live)
      return {}
    }
    // This computer's own account is what a local session runs on; a host's is its own, and is not asked here.
    if (!isRemote(live.root) && (await this.account()).key === true) {
      return { error: 'That claude is signed in with an API key, and GeckIt only runs sessions on a plan.' }
    }
    try {
      await this.#hold(live)
      return { url: await this.#remoteOn(live) }
    } catch (error) {
      this.#remoteOff(live)
      return { error: error instanceof Error ? error.message : String(error) }
    }
  }

  async #remoteOn(live: Live): Promise<string> {
    const control = live.driver?.control
    if (control === undefined) throw new Error('Claude Code is not running for this conversation.')
    const answer = await control({ subtype: 'remote_control', enabled: true, name: this.#deps.notes.all()[live.id]?.title ?? live.title })
    const url = typeof answer['session_url'] === 'string' ? answer['session_url'] : ''
    live.remote = url
    this.#changed()
    return url
  }

  #remoteOff(live: Live): void {
    if (live.remote === undefined) return
    live.remote = undefined
    this.#rest(live)
    this.#changed()
  }

  /**
   * The MCP servers Claude Code has for a project and how each stands, with a
   * server switched on or off first where one was. The conversation's own
   * process is asked where it has one, so a switch holds in it at once;
   * otherwise a process in the folder is, and the switch holds from the next start.
   */
  async mcp(root: string, id?: string, change?: McpChange): Promise<McpServer[] | undefined> {
    const control = id === undefined ? undefined : this.#live.get(id)?.driver?.control
    if (control !== undefined) {
      try {
        if (change !== undefined) await control({ subtype: 'mcp_toggle', serverName: change.name, enabled: change.enabled })
        return serversOf(await control({ subtype: 'mcp_status' }))
      } catch {
        // Asked of a process of its own instead, which the switch is saved for anyway.
      }
    }
    return (this.#deps.mcp ?? readMcp)(root, change)
  }

  /**
   * The Chromes the extension is signed in to, with one picked first where one
   * was. The conversation's own process is asked where it has one, so the
   * choice holds in it at once; otherwise a process in the folder is.
   */
  async browsers(root: string, id?: string, pick?: string): Promise<Browser[] | undefined> {
    const control = id === undefined ? undefined : this.#live.get(id)?.driver?.control
    if (control !== undefined) {
      try {
        if (pick !== undefined) await control({ subtype: 'select_chrome_browser', device_id: pick })
        return browsersOf(await control({ subtype: 'get_chrome_browsers' }))
      } catch {
        // Asked of a process of its own instead, which the choice is saved for anyway.
      }
    }
    return (this.#deps.browsers ?? readBrowsers)(root, pick)
  }

  answer(id: string, card: string, answer: CardAnswer | string): void {
    const live = this.#live.get(id)
    const ask = card.startsWith('card:') ? card.slice('card:'.length) : card
    const wanted = live?.asks.get(ask)
    if (live === undefined || wanted === undefined) return
    live.asks.delete(ask)

    if (answer === 'session') for (const key of grantKeys(wanted)) live.grants.add(key)
    if (wanted.kind === 'start' && answer !== 'no') {
      // The tool leaves plan mode by itself once the plan is let go ahead.
      live.mode = 'manual'
      live.runs = 'manual'
      this.#note(live.id, { mode: 'manual' })
    }

    const before = [...live.items.keys()]
    // The tool names paths on its own computer, so a card about a host is read against that, not the `ssh://` root that names it.
    const folder = pathOf(live.root)
    const folded: SessionItem = {
      kind: 'card',
      id: cardId(ask),
      card: { ...cardFor(wanted, folder), answered: answeredLine(wanted, answer, folder) },
    }
    live.items.set(folded.id, folded)
    live.kept.push({ after: before[before.indexOf(folded.id) - 1], item: folded })
    // What was allowed goes on under the line that says so, which is the order it happened in.
    const line = live.held.get(ask)
    live.held.delete(ask)
    const on = answer === 'no' || line === undefined ? [] : [line]
    for (const item of on) live.items.set(item.id, item)
    this.#deps.items({ id: live.id, items: [folded, ...on] })

    if (live.asks.size === 0) {
      const doing = on[0]?.kind === 'did' ? on[0].what : ''
      live.state = 'working'
      live.stands = doing === '' ? 'Working' : `Working - ${doing.charAt(0).toLowerCase()}${doing.slice(1)}`
    } else {
      live.stands = waitingFor([...live.asks.values()][0] ?? wanted)
    }
    this.#changed()
    live.driver?.answer(ask, answer)
  }

  /**
   * A mode chosen under the field holds from now, not from the next message:
   * Claude Code is moved between Manual and Auto as it runs, and what is
   * waiting when it goes into Auto is handed back, so its own check decides it.
   * Plan is still a new start at the next message.
   */
  mode(id: string, mode: SessionMode): void {
    const live = this.#live.get(id)
    if (live === undefined || live.mode === mode) return
    live.mode = mode
    this.#note(live.id, { mode })

    if (live.driver?.permit !== undefined && live.runs !== 'plan' && mode !== 'plan' && live.runs !== mode) {
      live.runs = mode
      const again =
        mode === 'auto'
          ? [...live.asks].filter(([, wanted]) => wanted.kind !== 'question' && wanted.kind !== 'start').map(([ask]) => ask)
          : []
      for (const ask of again) {
        live.asks.delete(ask)
        live.held.delete(ask)
        live.items.delete(cardId(ask))
      }
      if (again.length > 0) {
        const next = [...live.asks.values()][0]
        live.state = next === undefined ? 'working' : 'asks'
        live.stands = next === undefined ? 'Working' : waitingFor(next)
        this.#deps.items({ id: live.id, items: [], gone: again.map(cardId) })
      }
      live.driver.permit(mode, again)
    }
    this.#changed()
  }

  stop(id: string): void {
    const live = this.#live.get(id)
    for (const running of live?.commands.values() ?? []) running.stop()
    if (live === undefined || (live.state !== 'working' && live.state !== 'asks')) return
    if (live.driver === undefined) {
      this.#ended(live, { kind: 'ended', how: 'stopped' })
      return
    }
    live.driver.stop()
    // A tool that does not answer Stop is stopped the other way.
    clearTimeout(live.stopping)
    live.stopping = setTimeout(() => {
      if (live.state !== 'working' && live.state !== 'asks') return
      live.driver?.end()
      live.driver = undefined
      this.#ended(live, { kind: 'ended', how: 'stopped' })
    }, STOP_HEARD)
  }

  /** A message taken out of the queue before it went, to be cancelled or typed again. */
  unqueue(id: string, queued: string): SessionMessage | undefined {
    const live = this.#live.get(id) ?? this.#adopt(id)
    const taken = live?.queued.find((one) => one.id === queued)
    if (live === undefined || taken === undefined) return undefined
    this.#queue(live, live.queued.filter((one) => one !== taken))
    this.#changed()
    return taken.message
  }

  /** A picture that waits with a queued message, whole. */
  queuedPicture(id: string, queued: string, index: number): SessionImage | undefined {
    const live = this.#live.get(id) ?? this.#adopt(id)
    return live?.queued.find((one) => one.id === queued)?.message.images?.[index]
  }

  /** A message waiting in the queue, said again in other words. Its place in the queue and its pictures stay. */
  requeue(id: string, queued: string, text: string): void {
    const live = this.#live.get(id) ?? this.#adopt(id)
    const at = live?.queued.findIndex((one) => one.id === queued) ?? -1
    const said = text.trim()
    if (live === undefined || at === -1 || said === '') return
    const was = live.queued[at]
    if (was === undefined) return
    this.#queue(
      live,
      live.queued.map((one, index) => (index === at ? { id: one.id, message: { ...was.message, text: said } } : one)),
    )
    this.#changed()
  }

  /**
   * A message taken out of the queue and started as a conversation of its own, in the same project and mode:
   * empty, or with this one's history as it stood when the message was queued.
   */
  async delegate(id: string, queued: string, history = false): Promise<string | undefined> {
    const from = this.#live.get(id) ?? this.#adopt(id)
    const at = from?.queued.find((one) => one.id === queued)?.at ?? this.#now()
    const taken = this.unqueue(id, queued)
    if (taken === undefined || from === undefined) return undefined
    const { session: _from, again: _again, ...message } = taken
    const mode = from.mode
    if (!history) return this.send({ ...message, mode, provider: providerOf(id) })
    if (providerOf(id) === 'codex') {
      const turns = await this.#deps.codex?.turns(id) ?? []
      const point = turns.findLast((turn) => turn.status !== 'inProgress' && turn.startedAt !== null && turn.startedAt * 1000 <= at)?.id
      const next = await this.#deps.codex?.create(from.root, mode, from.chosen, { from: id, ...(point === undefined ? {} : { at: point }) })
      if (next === undefined) return undefined
      const live = this.#fresh(next, from.root, firstLine(message.text, 80), mode)
      live.begun = true
      this.#note(next, { here: true })
      return this.send({ ...message, mode, session: next })
    }
    const point = await (this.#deps.disk?.forkPoint ?? forkPoint)(from.root, id, at).catch(() => undefined)
    const live = this.#fresh(randomUUID(), from.root, firstLine(message.text, 80), mode)
    live.fork = { from: id, ...(point === undefined ? {} : { at: point }) }
    const read = await (this.#deps.disk?.read ?? readClaudeSession)(from.root, id).catch(() => undefined)
    const items = read?.items ?? []
    const upTo = items.findLastIndex((item) => 'at' in item && item.at !== undefined && item.at <= at)
    for (const item of items.slice(0, upTo + 1)) live.items.set(item.id, item)
    return this.send({ ...message, mode, session: live.id })
  }

  /** On a start, the conversations a closed GeckIt left with queued messages wait for a slot again, top of the board first. */
  async resumeQueues(): Promise<void> {
    for (const [id, note] of Object.entries(this.#deps.notes.all())) {
      const first = note.queued?.[0]
      if (first === undefined || this.#live.has(id)) continue
      if (!this.#rows.has(id)) await this.list([first.message.root])
      // Its turn is not continued: what was queued behind it goes instead, when a slot is free.
      this.#uncut(id)
      this.#adopt(id)
    }
    this.#changed()
    this.#glance()
  }

  /** Marked in review, blocked or done; nothing takes the mark off. */
  mark(id: string, status: SessionStatus | undefined): void {
    const { status: _was, cut, ...note } = this.#deps.notes.all()[id] ?? {}
    // Marked, it is dealt with, and no longer waits to be continued; put back into progress, it still does.
    this.#deps.notes.set(id, status === undefined ? { ...note, ...(cut === undefined ? {} : { cut }) } : { ...note, status })
    this.#changed()
  }

  /** The conversations whose turn was running when GeckIt last closed, newest first. */
  /**
   * Conversations still running on their hosts from before GeckIt last closed,
   * held again as working: their runs are picked up where they were read to.
   */
  async reattach(runs: readonly { readonly id: string; readonly root: string }[]): Promise<void> {
    for (const run of runs) {
      if (this.#live.has(run.id)) continue
      const note = this.#deps.notes.all()[run.id]
      const live = this.#fresh(run.id, run.root, note?.title ?? '', sessionMode(note?.mode))
      live.begun = true
      live.chosen = note?.model
      live.reasoning = note?.reasoning
      // Working only where a turn was running when GeckIt closed; the rest of what it says comes on the stream.
      live.state = note?.cut === undefined ? 'idle' : 'working'
      live.queued = [...(note?.queued ?? [])]
      this.#uncut(run.id)
      // What was said before is read from the file first; the stream then carries on from where it was read to.
      await this.#reread(live).catch(() => undefined)
      await this.#hold(live)
      this.#changed()
    }
  }

  cutOff(): CutOff[] {
    return Object.entries(this.#deps.notes.all())
      .flatMap(([id, note]) =>
        note.cut === undefined || note.hidden === true || this.#live.has(id) || (note.queued?.length ?? 0) > 0
          ? []
          : [{ id, root: note.cut.root, title: note.title ?? '', at: note.cut.at }],
      )
      .sort((one, other) => other.at - one.at)
  }

  /** Sends "continue" to one that was cut off, in the mode and with the model it had. */
  async proceed(id: string): Promise<void> {
    const note = this.#deps.notes.all()[id]
    const cut = note?.cut
    if (note === undefined || cut === undefined) return
    // Another profile's project is not read yet, and without its row the message would start a new conversation.
    if (!this.#rows.has(id) && !this.#live.has(id)) await this.list([cut.root])
    if (!this.#rows.has(id) && !this.#live.has(id)) {
      this.#uncut(id)
      return
    }
    // It carries on a turn that had its slot when GeckIt closed, so it goes ahead of what was queued behind that turn.
    await this.send(
      {
        session: id,
        root: cut.root,
        mode: sessionMode(note.mode),
        text: 'continue',
        ...(note.model === undefined ? {} : { model: note.model }),
        ...(note.reasoning === undefined ? {} : { reasoning: note.reasoning }),
      },
      true,
    )
  }

  #uncut(id: string): void {
    const { cut, ...note } = this.#deps.notes.all()[id] ?? {}
    if (cut !== undefined) this.#deps.notes.set(id, note)
  }

  rename(id: string, title: string): void {
    const name = title.trim()
    if (name === '') return
    this.#note(id, { title: name, renamed: true })
    const live = this.#live.get(id)
    if (providerOf(id) === 'codex') this.#deps.codex?.rename(id, name)
    if (live !== undefined) {
      live.title = name
      this.#name(live)
    }
    this.#changed()
  }

  /**
   * The name Claude Code itself keeps for the conversation, which is what a
   * terminal and the phone show. `host` is the tool's word for a name the
   * person gave in the application holding it, and is what has it pushed to
   * Remote Control as well; without a process there is nothing to tell, so it
   * is told at the next start.
   */
  #name(live: Live): void {
    const note = this.#deps.notes.all()[live.id]
    const title = note?.title
    if (note?.renamed !== true || title === undefined || live.driver?.control === undefined) return
    live.named = title
    void live.driver
      .control({ subtype: 'rename_session', title, source: 'host', session_id: live.id })
      .catch(() => (live.named = undefined))
  }

  /**
   * What the tool kept and no board lists: hidden by hand, started by a
   * program, or in a folder that is no project. The last 30 days, or what is
   * older than that. A general question asked here is in no project and is not
   * one of them.
   */
  async hidden(projects: readonly string[], older: boolean): Promise<HiddenFolder[]> {
    const notes = this.#deps.notes.all()
    const edge = this.#now() - HIDDEN_FOR
    const listed = (id: string): boolean => {
      const row = this.#rows.get(id)
      const note = notes[id]
      if (note?.hidden === true) return false
      return note?.here === true || note?.shown === true || (row !== undefined && !row.driven)
    }
    const found = await (this.#deps.disk?.every ?? everyClaude)(older ? 0 : edge, older ? edge : Infinity, (id) => !listed(id))
    for (const row of this.#rows.values()) {
      if (providerOf(row.id) !== 'codex' || listed(row.id) || row.at < (older ? 0 : edge) || row.at >= (older ? edge : Infinity)) continue
      found.push({ ...row, cwd: row.root })
    }
    // Which reason, if any, keeps each row worth showing, before a folder is even asked for: figured once per row so a folder shared by several rows is asked about only once below.
    const candidates = found
      .map((row) => {
        const where = row.cwd ?? ''
        const project = projectOf(where, projects)
        const note = notes[row.id]
        // A program's conversation in the home folder is a general question asked here, which is never listed.
        if (row.driven && where === homedir() && note?.hidden !== true) return undefined
        const reason: HiddenReason | undefined =
          note?.hidden === true
            ? 'hidden'
            : row.driven && note?.here !== true && note?.shown !== true
              ? 'driven'
              : project === undefined && note?.here !== true
                ? 'terminal'
                : undefined
        return reason === undefined ? undefined : { row, where, note, reason }
      })
      .filter((one): one is NonNullable<typeof one> => one !== undefined)
    const ask = this.#deps.there ?? there
    const folderNames = [...new Set(candidates.map((one) => one.where))]
    const standing = new Map(await Promise.all(folderNames.map(async (where): Promise<[string, boolean]> => [where, await ask(where)])))
    const folders = new Map<string, HiddenChat[]>()
    for (const { row, where, note, reason } of candidates) {
      if (standing.get(where) !== true) continue
      const chats = folders.get(where) ?? []
      chats.push({ id: row.id, title: note?.title ?? row.title, stands: row.stands, at: row.at, reason })
      folders.set(where, chats)
    }
    return [...folders]
      .map(([path, chats]) => {
        const project = projectOf(path, projects)
        return { path, ...(project === undefined ? {} : { project }), chats }
      })
      .sort((one, other) => (other.chats[0]?.at ?? 0) - (one.chats[0]?.at ?? 0))
  }

  /** Put a conversation from Hidden conversations on the board. */
  bring(id: string): void {
    this.#note(id, { hidden: false, shown: true })
    this.#changed()
  }

  /** Keeps a general question for good, or lets it go a day after its last answer again. */
  keep(id: string, stays: boolean): void {
    const live = this.#live.get(id)
    if (live?.question !== true || live.stays === stays) return
    live.stays = stays
    if (stays) {
      live.goes = undefined
      if (live.driver === undefined) clearTimeout(live.quiet)
      this.#keepNote(live)
      this.#changed()
    } else if (live.state === 'idle') {
      this.#rest(live)
    } else {
      this.#keepNote(live)
      this.#changed()
    }
  }

  hide(id: string): void {
    this.#note(id, { hidden: true })
    void this.#letGo(id)
    this.#changed()
  }

  /**
   * Every conversation's id held here, live or only listed, whose root a test
   * says yes to - a host going for good, say, asking what else that keeps
   * track of one by id (favorites) should let go of too. Only what has already
   * been read into memory this run: one never listed here is not among these.
   */
  ids(matches: (root: string) => boolean): string[] {
    const ids = new Set<string>()
    for (const [id, row] of this.#rows) if (matches(row.root)) ids.add(id)
    for (const [id, live] of this.#live) if (matches(live.root)) ids.add(id)
    return [...ids]
  }

  /**
   * Throw conversations away, the files the tool keeps them in and all, and say which files went.
   *
   * There is no copy of them anywhere, which is why the window asks first. The list is sent once, after the last of them.
   */
  async remove(ids: readonly string[]): Promise<string[]> {
    const gone: string[] = []
    for (const id of ids) {
      const root = this.#live.get(id)?.root ?? this.#rows.get(id)?.root
      if (root === undefined) continue
      // The tool writes to the file as it exits, so it goes first.
      await this.#letGo(id)
      const removed = providerOf(id) === 'codex' ? this.#deps.codex?.delete(id) : (this.#deps.disk?.delete ?? deleteClaude)(root, id)
      if (await removed?.catch(() => false)) gone.push(id)
      this.#rows.delete(id)
      this.#note(id, { hidden: true })
    }
    this.#changed()
    return gone
  }

  /** Stop holding a session, leaving whatever the tool has on disk alone. */
  async #letGo(id: string): Promise<void> {
    const live = this.#live.get(id)
    if (live === undefined) return
    clearTimeout(live.quiet)
    for (const running of live.commands.values()) running.stop()
    const ended = live.driver?.end()
    this.#live.delete(id)
    await ended
  }

  /**
   * Let go of a session about to be continued in a terminal.
   *
   * The process holding it keeps the conversation in memory and would answer
   * the next message from where it stood, without whatever was said in the
   * terminal; taken up again from the tool's own file, it has all of it. A
   * turn that is running is left to run.
   */
  handOver(id: string): void {
    const live = this.#live.get(id)
    if (live === undefined || live.state === 'working' || live.state === 'asks') return
    clearTimeout(live.quiet)
    live.driver?.end()
    live.driver = undefined
  }

  /** The session the chat window is showing while it is in front, or none. */
  /** The folder of the conversation in front, and which one it is: links said in it are about that folder's computer. */
  watched(): { readonly id: string; readonly root: string } | undefined {
    const id = this.#watching
    if (id === undefined) return undefined
    const root = this.#live.get(id)?.root ?? this.#rows.get(id)?.root
    return root === undefined ? undefined : { id, root }
  }

  watching(id: string | undefined): void {
    clearInterval(this.#goalWatch)
    this.#goalWatch = undefined
    this.#watching = id
    if (id === undefined) return
    const unread = this.#deps.notes.all()[id]?.unread === true
    this.#note(id, { seen: this.#now(), ...(unread ? { unread: false } : {}) })
    if (unread) this.#changed()
    if (providerOf(id) === 'codex') {
      const refresh = (): void => {
        const live = this.#live.get(id) ?? this.#adopt(id)
        if (live !== undefined) void this.#goal(live)
      }
      refresh()
      this.#goalWatch = setInterval(refresh, 2_000)
    }
  }

  /** Taken as read without being opened: the mark on the row is pressed. */
  read(id: string): void {
    if (this.#deps.notes.all()[id]?.unread !== true) return
    this.#note(id, { unread: false })
    this.#changed()
  }

  /** The plan's windows as last reported, for a window opened since. */
  plan(): PlanUsage | undefined {
    return this.#plan
  }

  /**
   * Ask the tool, without a turn, how much of the plan is spent and how much
   * context the models in the list may hold. The plan is asked at most once a
   * minute however often a window comes to the front; a model not measured
   * yet is asked about whenever it turns up, after the one being asked now.
   */
  measure(): Promise<void> {
    if (this.#measuring !== undefined) return this.#measuring.then(() => this.measure())
    const models = new Set<string>()
    for (const row of this.#rows.values()) if (providerOf(row.id) === 'claude' && row.model !== undefined) models.add(row.model)
    for (const live of this.#live.values()) if (providerOf(live.id) === 'claude' && live.model !== undefined) models.add(live.model)
    const unknown = [...models].filter((model) => !this.#windows.has(model))
    if (unknown.length === 0 && this.#now() - this.#measured < MEASURED_FOR) return Promise.resolve()
    this.#measured = this.#now()
    void this.#look()
    const generation = this.#generation
    this.#measuring = (this.#deps.usage ?? readUsage)(unknown)
      .then((usage) => {
        // Measured by the version before, where it changed meanwhile: the new one is asked once this is over.
        if (generation === this.#generation) for (const model of unknown) this.#windows.set(model, usage.windows.get(model))
        if (usage.plan !== undefined) {
          this.#plan = usage.plan
          this.#deps.plan?.(usage.plan)
        }
        if (unknown.length > 0) this.#changed()
      })
      .catch(() => undefined)
      .finally(() => {
        this.#measuring = undefined
      })
    return this.#measuring
  }

  /** How many sessions have stopped to ask or have answered unseen, for the badge on the Dock. */
  wanting(): number {
    return this.#listed().filter((one) => one.question !== true && (one.state === 'asks' || one.state === 'unread')).length
  }

  /** In the middle of a turn, or waiting for an answer in one. */
  busy(id: string): boolean {
    const state = this.#live.get(id)?.state
    return state === 'working' || state === 'asks'
  }

  /** What quitting would stop. A conversation on a host keeps running there, and does not hold a restart back. */
  working(): string[] {
    return [...this.#live.values()]
      .filter((live) => (live.state === 'working' || live.state === 'asks') && !isRemote(live.root))
      .map((live) => this.#deps.notes.all()[live.id]?.title ?? live.title)
  }

  /** Everything is going. Every process goes with it, and the conversations stay where the tool keeps them. */
  dispose(): void {
    clearInterval(this.#goalWatch)
    for (const live of this.#live.values()) {
      clearTimeout(live.quiet)
      clearTimeout(live.back)
      clearTimeout(live.stopping)
      for (const running of live.commands.values()) running.stop()
      // A run on a host is left going there, and picked up on the next start.
      if (live.driver?.leave === undefined) void live.driver?.end()
      else live.driver.leave()
    }
    this.#live.clear()
    this.#watching = undefined
    this.#deps.codex?.dispose()
  }

  // --- what the tool says -----------------------------------------------------

  #hear(live: Live, heard: Heard): void {
    if (this.#live.get(live.id) !== live) return
    const now = this.#now()
    // The stream does not say when; an answer is dated by when it first arrived here.
    const items = heard.items.map((item): SessionItem => {
      if (item.kind !== 'theirs' || item.at !== undefined) return item
      const was = live.items.get(item.id)
      return { ...item, at: was?.kind === 'theirs' && was.at !== undefined ? was.at : now }
    })
    for (const id of heard.gone) live.items.delete(id)
    for (const item of items) live.items.set(item.id, item)
    // What a turn says as it goes does not date the conversation: two of them
    // working would trade places in the list every second. A message sent, a
    // turn begun or over, and a card put up are what move a row.
    if (items.length > 0 || heard.gone.length > 0) {
      this.#deps.items({ id: live.id, items, ...(heard.gone.length > 0 ? { gone: heard.gone } : {}) })
    }
    for (const signal of heard.signals) this.#signal(live, signal)
  }

  /**
   * `/clear` does not empty a conversation: the tool leaves it on disk and
   * carries on in a new one. So the window is moved to that one, with nothing
   * in it, and the conversation cleared away stays in the list as it stands.
   */
  #cleared(live: Live, id: string): void {
    const was = live.id
    // It is on disk, but nothing has read it from there yet, so it is written
    // down here: it was in the list a moment ago and it is not to go missing now.
    if (!this.#rows.has(was)) {
      this.#rows.set(was, {
        id: was,
        root: live.root,
        title: this.#deps.notes.all()[was]?.title ?? live.title,
        stands: live.stands,
        at: live.at,
        driven: true,
        ...(live.model === undefined ? {} : { model: live.model }),
        ...(live.used === undefined ? {} : { used: live.used }),
      })
    }
    this.#live.delete(was)
    live.id = id
    live.items.clear()
    live.kept = []
    live.held.clear()
    live.asks.clear()
    live.grants.clear()
    live.told = []
    live.tasks = []
    // The tool has written a file under this id, so a process started again resumes it.
    live.begun = true
    live.title = ''
    live.stands = ''
    live.said = ''
    live.last = undefined
    live.used = undefined
    live.spent = undefined
    live.running = undefined
    live.goal = undefined
    live.goalStatus = undefined
    live.named = undefined
    this.#live.set(id, live)
    // Started by this application: without that it is taken for another program's and left out of the list.
    this.#note(id, { here: true, mode: live.mode, ...(live.chosen === undefined ? {} : { model: live.chosen }) })
    if (this.#watching === was) this.#watching = id
    // The list first, so the window has the row before it is sent to it.
    this.#changed()
    this.#deps.show?.(id)
  }

  #signal(live: Live, signal: Signal): void {
    switch (signal.kind) {
      case 'started':
        // The tool's own word for what it is answering on, which knows about a
        // key helper in its settings where `auth status` does not.
        if (signal.key) {
          live.driver?.end()
          live.driver = undefined
          this.#ended(live, { kind: 'ended', how: 'offPlan' })
          return
        }
        // `/clear` leaves the conversation where it is and carries on in another, which the tool says by naming a different one here.
        if (signal.session !== '' && signal.session !== live.id) {
          if (providerOf(live.id) === 'codex') {
            const was = live.id
            const note = this.#deps.notes.all()[was]
            this.#live.delete(was)
            this.#rows.delete(was)
            this.#deps.notes.set(was, { hidden: true })
            live.id = signal.session
            live.queued = live.queued.map((one) => ({ ...one, message: { ...one.message, session: live.id } }))
            this.#live.set(live.id, live)
            this.#note(live.id, { ...note, here: true, queued: live.queued })
            if (this.#watching === was) this.#watching = live.id
            this.#changed()
            this.#deps.show?.(live.id)
          } else this.#cleared(live, signal.session)
        }
        if (this.#deps.notes.all()[live.id]?.title !== live.named) this.#name(live)
        if (live.mode === 'auto' && signal.mode !== undefined && signal.mode !== 'auto') this.#noAuto(live, signal.model)
        if (live.model !== signal.model || (signal.reasoning !== undefined && live.actualReasoning !== signal.reasoning)) {
          live.model = signal.model
          live.actualReasoning = signal.reasoning ?? live.actualReasoning
          this.#changed()
          if (providerOf(live.id) === 'claude' && signal.model !== undefined && !this.#windows.has(signal.model)) void this.measure()
        }
        return
      case 'doing':
        if (live.state !== 'working') return
        live.stands = `Working - ${signal.what}`
        this.#changed()
        return
      case 'said':
        live.said = saidLine(signal.text)
        return
      case 'writing':
        return
      case 'mode':
        // It can start in auto and give it up a moment later, once it has checked.
        if (live.mode === 'auto' && signal.mode !== 'auto') this.#noAuto(live, live.model)
        return
      case 'model':
        if (live.model !== signal.model) {
          live.model = signal.model
          this.#changed()
        }
        return
      case 'reasoning':
        if (live.actualReasoning !== signal.effort) {
          live.actualReasoning = signal.effort
          this.#changed()
        }
        return
      case 'spend':
        if (signal.window !== undefined && live.model !== undefined) this.#windows.set(live.model, signal.window)
        if (signal.used !== undefined) live.used = signal.used
        if (signal.cost !== undefined) live.running = signal.cost
        // Said while it works; the row is drawn again when the turn ends, which is soon enough.
        if (live.state === 'idle') this.#changed()
        return
      case 'plan':
        this.#plan = signal.plan
        this.#deps.plan?.(signal.plan)
        return
      case 'task': {
        const { task } = signal
        live.tasks = live.tasks.some((one) => one.id === task.id)
          ? live.tasks.map((one) => (one.id === task.id ? task : one))
          : [...live.tasks, task]
        // The process was kept for them, and with none left running an idle one may go again.
        const idle = live.state !== 'working' && live.state !== 'asks'
        if (!running(task) && !live.tasks.some(running) && idle) this.#rest(live)
        this.#changed()
        return
      }
      case 'begun':
        if (live.state === 'working' || live.state === 'asks') return
        clearTimeout(live.quiet)
        live.state = 'working'
        live.stands = 'Working'
        live.last = undefined
        live.at = this.#now()
        this.#changed()
        return
      case 'held':
        if (live.goal === undefined || signal.hook !== live.goal.condition) return
        live.goal = { condition: live.goal.condition, checks: live.goal.checks + 1, reason: signal.reason }
        this.#changed()
        return
      case 'goal': {
        const previous = live.goal
        const terminal = signal.status === 'complete' || signal.status === 'blocked' || signal.status === 'budgetLimited' || signal.status === 'usageLimited'
        if (terminal && previous === undefined && signal.goal === undefined && live.messages > 0) return
        live.goal = signal.goal
        this.#note(live.id, { goal: signal.goal })
        if (terminal) {
          if (previous !== undefined) {
            const item: SessionItem = { kind: 'note', id: `goal:${String(this.#now())}`, note: 'goal', text: signal.status === 'complete' ? `Goal met: ${previous.condition}` : `Goal stopped: ${previous.condition}` }
            live.items.set(item.id, item)
            this.#deps.items({ id: live.id, items: [item] })
          }
          const status = signal.status === 'complete' ? 'review' : 'blocked'
          if (live.state === 'working' || live.state === 'asks') {
            live.goalStatus = live.queued.length === 0 ? status : undefined
          } else if (live.queued.length === 0 && this.#deps.notes.all()[live.id]?.status === undefined) {
            this.#note(live.id, { status })
          }
        } else live.goalStatus = undefined
        this.#changed()
        return
      }
      case 'asks':
        this.#asked(live, signal.ask, signal.wanted, signal.line)
        return
      case 'resolved':
        live.asks.delete(signal.ask)
        live.held.delete(signal.ask)
        if (live.asks.size === 0 && live.state === 'asks') {
          live.state = 'working'
          live.stands = 'Working'
          this.#changed()
        }
        return
      case 'ended':
        this.#ended(live, signal)
    }
  }

  /** Claude Code has no auto mode for some models, and runs as in Manual without saying so. */
  #noAuto(live: Live, model: string | undefined): void {
    live.mode = 'manual'
    live.runs = 'manual'
    this.#note(live.id, { mode: 'manual' })
    const said: SessionItem = { kind: 'note', id: `mode:${String(this.#now())}`, note: 'mode', text: noAutoMode(model) }
    live.kept.push({ after: [...live.items.keys()].at(-1), item: said })
    live.items.set(said.id, said)
    this.#deps.items({ id: live.id, items: [said] })
    this.#changed()
  }

  #asked(live: Live, ask: string, wanted: Wanted, line?: string): void {
    const keys = grantKeys(wanted)
    const granted = keys.length > 0 && keys.every((key) => live.grants.has(key))
    if (granted || (wanted.kind === 'command' && startsConversations(wanted.command))) {
      live.driver?.answer(ask, 'once')
      return
    }

    // A session that only reads and wants to write is proposing to start.
    const folder = pathOf(live.root)
    const put: Wanted =
      live.mode === 'plan' && wanted.kind === 'write'
        ? { kind: 'start', plan: `Change ${wanted.paths.map((path) => shown(folder, path)).join(', ')}` }
        : wanted
    live.asks.set(ask, put)
    const card: SessionItem = { kind: 'card', id: cardId(ask), card: cardFor(put, folder) }
    // The tool says "running" before it asks whether it may. Nothing is running
    // while the card is up, and left where it was the line would end up above
    // the answer that let it run.
    const drawn = line === undefined ? undefined : live.items.get(line)
    const gone = drawn !== undefined && drawn.kind === 'did' && drawn.live === true ? [drawn.id] : []
    if (drawn !== undefined && gone.length > 0) {
      live.items.delete(drawn.id)
      live.held.set(ask, drawn)
    }
    live.items.set(card.id, card)
    live.state = 'asks'
    live.stands = waitingFor(put)
    live.at = this.#now()
    this.#deps.items({ id: live.id, items: [card], ...(gone.length > 0 ? { gone } : {}) })
    this.#changed()

    this.#tell(live, 'Needs an answer', live.stands, true)
  }

  #tell(live: Live, what: string, body: string, asks: boolean): void {
    if (this.#watching === live.id) return
    this.#deps.notify({
      session: live.id,
      title: `${what} - ${basename(live.root)}`,
      subtitle: this.#deps.notes.all()[live.id]?.title ?? live.title,
      body,
      asks,
    })
  }

  #ended(live: Live, signal: Extract<Signal, { kind: 'ended' }>): void {
    clearTimeout(live.stopping)
    this.#uncut(live.id)
    const now = this.#now()
    const items: SessionItem[] = []
    // A card nobody answered is not waiting on anybody any more.
    const gone = [...live.asks.keys()].map(cardId)
    for (const id of gone) live.items.delete(id)
    live.asks.clear()
    live.held.clear()

    const under = (item: SessionItem, keep: boolean): void => {
      if (keep) live.kept.push({ after: [...live.items.keys()].at(-1), item })
      live.items.set(item.id, item)
      items.push(item)
    }

    switch (signal.how) {
      case 'done': {
        live.state = 'idle'
        live.stands = live.said
        if (this.#watching !== live.id) this.#note(live.id, { unread: true })
        this.#tell(live, 'Finished', live.said === '' ? 'Answered.' : live.said, false)
        break
      }
      case 'stopped':
        under({ kind: 'note', id: `stopped:${String(now)}`, note: 'stopped', text: STOPPED }, false)
        live.state = 'idle'
        live.stands = 'Stopped'
        break
      case 'limit': {
        under(
          { kind: 'note', id: `limit:${String(now)}`, note: 'limit', text: limitText(signal.resetsAt, now) },
          true,
        )
        live.state = 'limit'
        live.stands = limitStands(signal.resetsAt, now)
        this.#tell(live, 'Plan limit reached', limitText(signal.resetsAt, now), false)
        if (signal.resetsAt !== undefined && signal.resetsAt > now) {
          // The note goes when the time passes. Nothing is sent on anybody's behalf.
          live.back = setTimeout(() => this.#back(live), Math.min(signal.resetsAt - now, 2 ** 31 - 1))
        }
        break
      }
      case 'failed': {
        const failed = providerOf(live.id) === 'codex' ? 'Codex stopped before it finished.' : FAILED
        under(
          {
            kind: 'note',
            id: `failed:${String(now)}`,
            note: 'failed',
            text: failed,
            ...(signal.text === undefined || signal.text.trim() === '' ? {} : { detail: signal.text.trim() }),
          },
          true,
        )
        live.state = 'failed'
        live.stands = 'Did not finish'
        this.#tell(live, 'Stopped with an error', firstLine(signal.text ?? '') || failed, false)
        break
      }
      case 'signedOut':
      case 'offPlan': {
        const mine = live.last === undefined ? undefined : live.items.get(live.last)
        if (mine?.kind === 'mine') under({ ...mine, unsent: true }, true)
        live.state = 'idle'
        live.stands = 'Not sent'
        // Said with the answer that refused it: where only the tool's first
        // line knew about the key, asking `auth status` again would not. A
        // host's own claude is not this computer's account, so nothing here
        // is told to every window over it: the row above already says Not sent.
        if (!isRemote(live.root)) {
          void this.account().then((account) =>
            this.#deps.account(signal.how === 'offPlan' ? { ...account, key: true } : account),
          )
        }
        break
      }
    }

    if (live.goalStatus !== undefined && live.queued.length === 0 && this.#deps.notes.all()[live.id]?.status === undefined) {
      this.#note(live.id, { status: live.goalStatus })
    }
    live.goalStatus = undefined
    live.at = now
    if (items.length > 0 || gone.length > 0) {
      this.#deps.items({ id: live.id, items, ...(gone.length > 0 ? { gone } : {}) })
    }
    // Its own queued messages wait for the look at the queue like any other's, so a card higher up goes first; an ending nobody asked for leaves them for the window to put back in the field.
    live.parked = signal.how !== 'done' && signal.how !== 'stopped'
    this.#changed()
    this.#glance()
    void this.#goal(live)
    if (live.clearing) {
      live.clearing = false
      void this.send({ session: live.id, root: live.root, mode: live.mode, text: '/goal clear', ...(live.chosen === undefined ? {} : { model: live.chosen }) }, true)
    }

    this.#rest(live)
  }

  /** Where the goal stands once a turn is over, which only the tool's file says, and a line where it ended by itself. */
  async #goal(live: Live): Promise<void> {
    const messages = live.messages
    if (providerOf(live.id) === 'codex') {
      const had = live.goal
      const goal = await this.#deps.codex?.goal(live.id).catch(() => undefined)
      if (goal === undefined || this.#live.get(live.id) !== live || live.goal !== had || live.messages !== messages) return
      const shown = goal === null || goal.status === 'complete' ? undefined : { condition: goal.objective, checks: 0 }
      const terminal = goal !== null && (goal.status === 'complete' || goal.status === 'blocked' || goal.status === 'budgetLimited' || goal.status === 'usageLimited')
      if (terminal && (live.state === 'working' || live.state === 'asks' || live.queued.length > 0)) return
      if (had?.condition === shown?.condition && (!terminal || had === undefined || this.#deps.notes.all()[live.id]?.status !== undefined)) return
      this.#signal(live, { kind: 'goal', goal: shown, ...(goal === null ? {} : { status: goal.status }) })
      return
    }
    // One set anywhere else counts, so the file is read whether or not this knew of a goal: from a terminal, from another window, or from the tool's own queue.
    const had = live.goal
    const read = await (this.#deps.disk?.goal ?? readGoal)(live.root, live.id).catch(() => undefined)
    // A goal sent while the file was being read is newer than anything it says.
    if (read === undefined || this.#live.get(live.id) !== live || live.goal !== had || live.messages !== messages) return
    live.goal = read.goal
    if (had !== undefined && read.goal === undefined && read.ended !== undefined) {
      const item: SessionItem = { ...read.ended, id: `goal:${String(this.#now())}` }
      live.items.set(item.id, item)
      this.#deps.items({ id: live.id, items: [item] })
      // A goal is what finished means: it held, so this is for the person to look
      // at; it was given up on, so it is for the person to unblock. A mark made by
      // hand is left as it is - it says what they decided, which this does not know.
      if (this.#deps.notes.all()[live.id]?.status === undefined && live.state !== 'working' && live.state !== 'asks' && live.queued.length === 0) {
        this.#note(live.id, { status: read.met === true ? 'review' : 'blocked' })
      }
    }
    this.#changed()
  }

  /** An idle process is let go of after a while, unless Remote Control or something in the background is keeping it. */
  #rest(live: Live): void {
    clearTimeout(live.quiet)
    if (live.question) {
      if (!live.stays) live.goes = this.#now() + QUESTION_KEPT
      this.#keepNote(live)
      this.#changed()
    }
    live.quiet = setTimeout(
      () => {
        if (live.state === 'working' || live.state === 'asks' || live.remote !== undefined || live.tasks.some(running)) return
        live.driver?.end()
        live.driver = undefined
        if (live.question && !live.stays) live.quiet = setTimeout(() => void this.remove([live.id]), QUESTION_KEPT - QUIET)
      },
      QUIET,
    )
  }

  #back(live: Live): void {
    if (live.state !== 'limit') return
    const gone = [...live.items.values()]
      .filter((item) => item.kind === 'note' && item.note === 'limit')
      .map((item) => item.id)
    for (const id of gone) live.items.delete(id)
    live.kept = live.kept.filter((kept) => !gone.includes(kept.item.id))
    live.state = 'idle'
    live.stands = live.said
    this.#deps.items({ id: live.id, items: [], gone })
    this.#changed()
  }
}

const has = async (root: string, id: string): Promise<boolean> => (await claudeFile(root, id)) !== undefined
