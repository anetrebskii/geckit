import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename } from 'node:path'

import type {
  BackgroundTask,
  Browser,
  CardAnswer,
  ChatSession,
  HiddenChat,
  HiddenFolder,
  HiddenReason,
  ClaudeAccount,
  ClaudeModel,
  CutOff,
  McpServer,
  PlanUsage,
  SessionGoal,
  SessionItem,
  SessionItems,
  SessionMessage,
  SessionMode,
  SessionNotice,
  SessionState,
  SessionStatus,
  ShellCommand,
  TaskOutput,
  WorkItem,
} from '../../shared/api'
import { sessionMode } from '../../shared/api'
import type { Link } from '../../shared/links'
import { linksIn, workItem } from '../../shared/links'
import { claudeAccount } from './account'
import { holdClaude } from './claude'
import { browsersOf, readBrowsers } from './chrome'
import { claudeFile, deleteClaude, everyClaude, listClaude, readClaudeSession, readGoal, readLinks } from './disk'
import type { GoalRead } from './claude-read'
import type { Conversation } from './disk'
import { cardId } from './heard'
import type { Driver, Heard, Signal } from './heard'
import { readMcp, serversOf } from './mcp'
import type { McpChange } from './mcp'
import { claudeModels } from './models'
import type { Wanted } from './rule'
import { runInTerminal, runShell, toldClaude, wantsKeyboard } from './shell'
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
  readonly title?: string
  /** The person named it themselves, so Claude Code is told the name and a terminal and the phone show it too. */
  readonly renamed?: boolean
  readonly mode?: SessionMode
  readonly model?: string
  /** Started in this application rather than in a terminal. */
  readonly here?: boolean
  readonly unread?: boolean
  readonly hidden?: boolean
  /** Brought onto the board by hand, though a program started it. */
  readonly shown?: boolean
  /** When it was last in front in the window, for the search to offer what was used last. */
  readonly seen?: number
  readonly status?: SessionStatus
  /** A turn is running, where and since when; still here on a start, it was cut off by GeckIt closing. */
  readonly cut?: { readonly root: string; readonly at: number }
}

export interface NotesStore {
  all(): Readonly<Record<string, SessionNote>>
  set(id: string, note: SessionNote): void
}

export function memoryNotes(): NotesStore {
  const kept: Record<string, SessionNote> = {}
  return {
    all: () => kept,
    set: (id, note) => {
      kept[id] = note
    },
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
  /** Tokens in the context after the last answer. */
  readonly used?: number
  readonly work?: WorkItem
}

export type { SessionNotice } from '../../shared/api'

export interface SessionsDeps {
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
  // What follows is the outside world, replaceable so the rules can be tested without it.
  readonly claude?: typeof holdClaude
  readonly disk?: {
    list(root: string): Promise<readonly (Omit<Row, 'root' | 'project'> & { readonly below?: string })[]>
    read(root: string, id: string): Promise<Conversation | undefined>
    has(root: string, id: string): Promise<boolean>
    delete?(root: string, id: string): Promise<boolean>
    goal?(root: string, id: string): Promise<GoalRead>
    every?: typeof everyClaude
  }
  readonly there?: (path: string) => Promise<boolean>
  readonly claudeAccount?: () => Promise<ClaudeAccount>
  readonly claudeModels?: () => Promise<ClaudeModel[] | undefined>
  readonly usage?: (models: readonly string[]) => Promise<Usage>
  readonly mcp?: (root: string, change?: McpChange) => Promise<McpServer[] | undefined>
  readonly browsers?: (root: string, pick?: string) => Promise<Browser[] | undefined>
  readonly shell?: typeof runShell
  /** Opens a terminal in the folder with the command typed in, for one that wants a keyboard. Without it, it is run here anyway. */
  readonly terminal?: (root: string, command: string) => void
  readonly now?: () => number
}

/** Something said about a session that the tool's own file will not say back. */
interface Kept {
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
  /** The model the process was started with, which cannot change without starting it again either. */
  ran: string | undefined
  /** The tool has a conversation under this id, so it is picked up rather than begun. */
  begun: boolean
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
  /** What the tool has had in the background, running or ended, until the person clears what ended. */
  tasks: readonly BackgroundTask[]
  /** The name Claude Code was last told, so it is told again after a start or a change. */
  named: string | undefined
  back: NodeJS.Timeout | undefined
  stopping: NodeJS.Timeout | undefined
  /** Set with /goal, as the tool's file last said or as it was just sent. */
  goal: SessionGoal | undefined
  /** The goal was cleared while the turn ran, and the tool is told once it has stopped. */
  clearing: boolean
  /** Messages sent while it worked, oldest first. */
  queued: { readonly id: string; readonly message: SessionMessage }[]
  /** A general question, which is never listed and is ended once it has been quiet for a while. */
  readonly question: boolean
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
const QUESTION_QUIET = 5 * 60_000

const running = (task: BackgroundTask): boolean => task.status === 'running'

/** Tasks as they stand once their process is gone, which took every one still running with it. */
const ended = (tasks: readonly BackgroundTask[]): readonly BackgroundTask[] =>
  tasks.map((task) => (running(task) ? { ...task, status: 'stopped', ended: Date.now() } : task))

/** How long Stop waits to be heard before the process is ended instead. */
const STOP_HEARD = 5_000

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

const squeezed = (text: string): string => text.replace(/\s+/g, ' ').trim()

export class Sessions {
  readonly #deps: SessionsDeps
  readonly #live = new Map<string, Live>()
  readonly #rows = new Map<string, Row>()
  #watching: string | undefined
  #plan: PlanUsage | undefined
  /** How much context each model may hold, as the tool measures it; nothing for one it would not say. */
  readonly #windows = new Map<string, number | undefined>()
  #measured = -Infinity
  #measuring: Promise<void> | undefined
  /** What the tool said it has, kept once said: a vendor ships a model far less often than a window is opened. */
  #models: Promise<ClaudeModel[] | undefined> | undefined

  constructor(deps: SessionsDeps) {
    this.#deps = deps
  }

  #now(): number {
    return this.#deps.now?.() ?? Date.now()
  }

  #note(id: string, change: SessionNote): void {
    if (this.#live.get(id)?.question === true) return
    this.#deps.notes.set(id, { ...this.#deps.notes.all()[id], ...change })
  }

  // --- what the window asks ---------------------------------------------------

  async account(): Promise<ClaudeAccount> {
    return (this.#deps.claudeAccount ?? claudeAccount)()
  }

  /**
   * The models the tool says it has, or nothing where it did not say.
   *
   * Asked when the menu under the composer is first opened, which is a press,
   * and not when a window is: asking Claude Code means starting it.
   */
  async models(): Promise<ClaudeModel[] | undefined> {
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
        this.#rows.set(row.id, below === undefined ? { ...row, root } : { ...row, root: below, project: root })
      }
    }
    // A model not seen before is measured, so its rows can say how much context it holds.
    if ([...this.#rows.values()].some((row) => row.model !== undefined && !this.#windows.has(row.model))) void this.measure()
    return this.#listed(roots)
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
      if (where === undefined || (roots !== undefined && !roots.includes(project ?? where))) continue
      if (note?.hidden === true) continue
      if (live === undefined && row?.driven === true && note?.here !== true && note?.shown !== true) continue
      // Held only because it was looked at, and the tool has nothing under that id any more.
      if (live !== undefined && row === undefined && !live.begun && live.state === 'idle' && live.last === undefined && live.items.size === 0) {
        continue
      }
      const quiet = live === undefined || live.state === 'idle'
      const model = live === undefined ? row?.model : live.model
      const used = live?.used ?? row?.used
      const window = model === undefined ? undefined : this.#windows.get(model)
      const cost = live?.spent === undefined && live?.running === undefined ? undefined : (live.spent ?? 0) + (live.running ?? 0)
      const chosen = live === undefined ? note?.model : live.chosen
      const runs = [...(live?.commands.keys() ?? [])].map((key) => live?.items.get(key)).find((item) => item?.kind === 'shell')
      // One begun here is not on disk yet the first time it is listed.
      const first = row === undefined ? [...(live?.items.values() ?? [])].find((item) => item.kind === 'mine') : undefined
      const work = row?.work ?? (first?.kind === 'mine' ? workItem(first.text) : undefined)
      sessions.push({
        id,
        root: where,
        ...(project === undefined ? {} : { project }),
        title: note?.title ?? live?.title ?? row?.title ?? '',
        stands:
          (quiet
            ? runs !== undefined
              ? `Running !${runs.command}`
              : note?.cut !== undefined
                ? 'Stopped when GeckIt closed'
                : live?.stands || row?.stands
            : live.stands) ?? '',
        state: quiet && note?.unread === true ? 'unread' : (live?.state ?? 'idle'),
        at: Math.max(live?.at ?? 0, row?.at ?? 0),
        here: note?.here === true,
        mode: live?.mode ?? sessionMode(note?.mode),
        ...(model === undefined ? {} : { model }),
        ...(chosen === undefined ? {} : { chosen }),
        ...(note?.seen === undefined ? {} : { seen: note.seen }),
        ...(live?.remote === undefined ? {} : { remote: live.remote }),
        ...(live === undefined || live.tasks.length === 0 ? {} : { tasks: live.tasks }),
        ...(live?.goal === undefined ? {} : { goal: live.goal }),
        ...(runs === undefined ? {} : { runs: runs.command }),
        ...(work === undefined ? {} : { work }),
        ...(note?.status === undefined ? {} : { status: note.status }),
        ...(live === undefined || live.queued.length === 0
          ? {}
          : { queued: live.queued.map(({ id: key, message }) => ({ id: key, text: message.text, images: message.images?.length ?? 0 })) }),
        ...(live?.question === true ? { question: true } : {}),
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
    this.#deps.changed(this.#listed())
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
      await this.#reread(live)
      // What it cost is only in the file, so the row learns it here.
      if (live.spent !== spent) this.#changed()
    }
    return [...live.items.values()]
  }

  /** The links written in a session, from what is held where it is running here and from its file where it is not. */
  async links(id: string): Promise<Link[]> {
    const live = this.#live.get(id)
    if (live?.driver !== undefined) return linksIn([...live.items.values()])
    const root = live?.root ?? this.#rows.get(id)?.root
    return root === undefined ? [] : readLinks(root, id)
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
      ran: undefined,
      begun: false,
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
      tasks: [],
      named: undefined,
      back: undefined,
      stopping: undefined,
      goal: undefined,
      clearing: false,
      queued: [],
      question,
    }
    this.#live.set(id, live)
    return live
  }

  async #reread(live: Live): Promise<void> {
    const conversation = await (this.#deps.disk?.read ?? readClaudeSession)(live.root, live.id).catch(() => undefined)
    if (conversation === undefined) return
    const read = conversation.items
    // Nothing holds it, so every run of the tool it had has written what it cost.
    live.spent = conversation.cost
    live.running = undefined
    live.goal = conversation.goal
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

  async send(message: SessionMessage): Promise<string> {
    let live = message.session === undefined ? undefined : (this.#live.get(message.session) ?? this.#adopt(message.session))
    if (live === undefined) {
      live =
        message.question === true
          ? this.#fresh(randomUUID(), homedir(), firstLine(message.text, 80), message.mode, true)
          : this.#fresh(randomUUID(), message.root, firstLine(message.text, 80), message.mode)
    } else if (live.driver === undefined) {
      await this.#reread(live)
    }
    if (live.state === 'working' || live.state === 'asks') {
      // A goal keeps the turn going until it holds, so it is cleared by stopping the turn and clearing it once it has.
      if (live.goal !== undefined && goalSent(message.text) === '') {
        live.goal = undefined
        live.clearing = true
        this.stop(live.id)
        this.#changed()
        return live.id
      }
      // A goal waiting its turn stands on the row already, as one sent straight away does.
      const waiting = goalSent(message.text)
      if (waiting !== undefined && waiting !== '') live.goal = { condition: waiting, checks: 0 }
      live.queued.push({ id: `queued:${randomUUID()}`, message: { ...message, session: live.id } })
      this.#changed()
      return live.id
    }

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
    const goal = goalSent(message.text)
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
    // is as old as its last look.
    if (live.driver === undefined && (await this.account()).key === true) {
      this.#deps.items({ id: live.id, items: [mine], gone })
      this.#ended(live, { kind: 'ended', how: 'offPlan' })
      return live.id
    }

    live.state = 'working'
    live.stands = 'Working'
    live.at = this.#now()

    try {
      await this.#hold(live)
    } catch (error) {
      this.#deps.items({ id: live.id, items: [mine], gone })
      this.#ended(live, { kind: 'ended', how: 'failed', text: error instanceof Error ? error.message : String(error) })
      return live.id
    }

    this.#note(live.id, {
      mode: live.mode,
      ...(live.chosen === undefined ? {} : { model: live.chosen }),
      here: this.#deps.notes.all()[live.id]?.here ?? !live.begun,
      title: this.#deps.notes.all()[live.id]?.title ?? live.title,
      // Written as the turn starts, since a crash leaves no chance to write anything as it ends.
      cut: { root: live.root, at: this.#now() },
    })
    // Said to again, it is being worked on, whatever it was marked.
    if (this.#deps.notes.all()[live.id]?.status !== undefined) this.mark(live.id, undefined)
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
      live = this.#fresh(randomUUID(), asked.root, firstLine(`!${command}`, 80), sessionMode(undefined))
    } else if (live.driver === undefined) {
      await this.#reread(live)
    }
    const held = live
    const terminal = wantsKeyboard(command) ? this.#deps.terminal : undefined
    // A command Claude asked for since the person last wrote, run as it was written, is answered as soon as it ends, so the turn goes on without being told to.
    const items = [...held.items.values()]
    const since = items.slice(items.findLastIndex((one) => one.kind === 'mine') + 1)
    const wanted = since.some((one) => one.kind === 'theirs' && squeezed(one.text).includes(squeezed(command)))
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
    const running =
      terminal === undefined
        ? (this.#deps.shell ?? runShell)(held.root, command, (output) => {
            printed = output
            drawing ??= setTimeout(() => {
              drawing = undefined
              if (held.commands.has(item.id)) show({ ...item, output: printed })
            }, 100)
          })
        : runInTerminal(held.root, command, terminal)
    held.commands.set(item.id, running)
    this.#changed()
    void running.done.then((ran) => {
      clearTimeout(drawing)
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
      })
    })
    return held.id
  }

  stopShell(id: string, item: string): void {
    this.#live.get(id)?.commands.get(item)?.stop()
  }

  typeShell(id: string, item: string, text: string): void {
    this.#live.get(id)?.commands.get(item)?.write?.(text)
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
    return taskOutput(live.root, one.output ?? (await taskFile(live.root, live.id, one.id)), one.kind)
  }

  /** Have a process holding the conversation, started the way its mode needs. */
  async #hold(live: Live): Promise<void> {
    clearTimeout(live.quiet)

    // The tool takes its model when a conversation is taken up, and is told how it may act when it starts, so
    // another model or a change of mind is a new start. Let go of before it is ended, so Remote Control carries over.
    if (live.driver !== undefined && (live.ran !== live.chosen || live.runs !== live.mode)) {
      const old = live.driver
      live.driver = undefined
      live.tasks = ended(live.tasks)
      void old.end()
    }
    if (live.driver !== undefined) return

    const resume = !live.question && (live.begun || (await (this.#deps.disk?.has ?? has)(live.root, live.id)))
    // A new run counts from nothing, so the one before it is counted in with the earlier ones.
    if (live.running !== undefined) live.spent = (live.spent ?? 0) + live.running
    live.running = undefined
    live.runs = live.mode
    live.ran = live.chosen
    const driver = (this.#deps.claude ?? holdClaude)(
      {
        root: live.root,
        id: live.id,
        resume,
        mode: live.mode,
        ...(live.chosen === undefined ? {} : { model: live.chosen }),
        ...(live.question ? { question: true } : {}),
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
    if ((await this.account()).key === true) return { error: 'That claude is signed in with an API key, and GeckIt only runs sessions on a plan.' }
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
    const folded: SessionItem = {
      kind: 'card',
      id: cardId(ask),
      card: { ...cardFor(wanted, live.root), answered: answeredLine(wanted, answer, live.root) },
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
    const live = this.#live.get(id)
    const taken = live?.queued.find((one) => one.id === queued)
    if (live === undefined || taken === undefined) return undefined
    live.queued = live.queued.filter((one) => one !== taken)
    this.#changed()
    return taken.message
  }

  /** A message waiting in the queue, said again in other words. Its place in the queue and its pictures stay. */
  requeue(id: string, queued: string, text: string): void {
    const live = this.#live.get(id)
    const at = live?.queued.findIndex((one) => one.id === queued) ?? -1
    const said = text.trim()
    if (live === undefined || at === -1 || said === '') return
    const was = live.queued[at]
    if (was === undefined) return
    live.queued = live.queued.map((one, index) => (index === at ? { id: one.id, message: { ...was.message, text: said } } : one))
    this.#changed()
  }

  /** A message taken out of the queue and started as a conversation of its own, in the same project and mode. */
  async delegate(id: string, queued: string): Promise<string | undefined> {
    const taken = this.unqueue(id, queued)
    if (taken === undefined) return undefined
    const { session: _from, again: _again, ...message } = taken
    return this.send({ ...message, mode: this.#live.get(id)?.mode ?? message.mode })
  }

  /** Marked in review, blocked or done; nothing takes the mark off. */
  mark(id: string, status: SessionStatus | undefined): void {
    const { status: _was, cut, ...note } = this.#deps.notes.all()[id] ?? {}
    // Marked, it is dealt with, and no longer waits to be continued; put back into progress, it still does.
    this.#deps.notes.set(id, status === undefined ? { ...note, ...(cut === undefined ? {} : { cut }) } : { ...note, status })
    this.#changed()
  }

  /** The conversations whose turn was running when GeckIt last closed, newest first. */
  cutOff(): CutOff[] {
    return Object.entries(this.#deps.notes.all())
      .flatMap(([id, note]) =>
        note.cut === undefined || note.hidden === true || this.#live.has(id)
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
    await this.send({
      session: id,
      root: cut.root,
      mode: sessionMode(note.mode),
      text: 'continue',
      ...(note.model === undefined ? {} : { model: note.model }),
    })
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
    const folders = new Map<string, HiddenChat[]>()
    for (const row of found) {
      const where = row.cwd ?? ''
      const project = projectOf(where, projects)
      const note = notes[row.id]
      // A program's conversation in the home folder is a general question asked here, which is never listed.
      if (row.driven && where === homedir() && note?.hidden !== true) continue
      const reason: HiddenReason | undefined =
        note?.hidden === true
          ? 'hidden'
          : row.driven && note?.here !== true && note?.shown !== true
            ? 'driven'
            : project === undefined && note?.here !== true
              ? 'terminal'
              : undefined
      if (reason === undefined || !(await (this.#deps.there ?? there)(where))) continue
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

  hide(id: string): void {
    this.#note(id, { hidden: true })
    void this.#letGo(id)
    this.#changed()
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
      if (await (this.#deps.disk?.delete ?? deleteClaude)(root, id).catch(() => false)) gone.push(id)
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
  watching(id: string | undefined): void {
    this.#watching = id
    if (id === undefined) return
    const unread = this.#deps.notes.all()[id]?.unread === true
    this.#note(id, { seen: this.#now(), ...(unread ? { unread: false } : {}) })
    if (unread) this.#changed()
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
    for (const row of this.#rows.values()) if (row.model !== undefined) models.add(row.model)
    for (const live of this.#live.values()) if (live.model !== undefined) models.add(live.model)
    const unknown = [...models].filter((model) => !this.#windows.has(model))
    if (unknown.length === 0 && this.#now() - this.#measured < MEASURED_FOR) return Promise.resolve()
    this.#measured = this.#now()
    this.#measuring = (this.#deps.usage ?? readUsage)(unknown)
      .then((usage) => {
        for (const model of unknown) this.#windows.set(model, usage.windows.get(model))
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

  /** What quitting would stop. */
  working(): string[] {
    return [...this.#live.values()]
      .filter((live) => live.state === 'working' || live.state === 'asks')
      .map((live) => this.#deps.notes.all()[live.id]?.title ?? live.title)
  }

  /** Everything is going. Every process goes with it, and the conversations stay where the tool keeps them. */
  dispose(): void {
    for (const live of this.#live.values()) {
      clearTimeout(live.quiet)
      clearTimeout(live.back)
      clearTimeout(live.stopping)
      for (const running of live.commands.values()) running.stop()
      live.driver?.end()
    }
    this.#live.clear()
    this.#watching = undefined
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
        if (signal.session !== '' && signal.session !== live.id) this.#cleared(live, signal.session)
        if (this.#deps.notes.all()[live.id]?.title !== live.named) this.#name(live)
        if (live.mode === 'auto' && signal.mode !== undefined && signal.mode !== 'auto') this.#noAuto(live, signal.model)
        if (live.model !== signal.model) {
          live.model = signal.model
          this.#changed()
          if (signal.model !== undefined && !this.#windows.has(signal.model)) void this.measure()
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
      case 'spend':
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
      case 'asks':
        this.#asked(live, signal.ask, signal.wanted, signal.line)
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
    if (granted) {
      live.driver?.answer(ask, 'once')
      return
    }

    // A session that only reads and wants to write is proposing to start.
    const put: Wanted =
      live.mode === 'plan' && wanted.kind === 'write'
        ? { kind: 'start', plan: `Change ${wanted.paths.map((path) => shown(live.root, path)).join(', ')}` }
        : wanted
    live.asks.set(ask, put)
    const card: SessionItem = { kind: 'card', id: cardId(ask), card: cardFor(put, live.root) }
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
      case 'failed':
        under(
          {
            kind: 'note',
            id: `failed:${String(now)}`,
            note: 'failed',
            text: FAILED,
            ...(signal.text === undefined || signal.text.trim() === '' ? {} : { detail: signal.text.trim() }),
          },
          true,
        )
        live.state = 'failed'
        live.stands = 'Did not finish'
        this.#tell(live, 'Stopped with an error', firstLine(signal.text ?? '') || FAILED, false)
        break
      case 'signedOut':
      case 'offPlan': {
        const mine = live.last === undefined ? undefined : live.items.get(live.last)
        if (mine?.kind === 'mine') under({ ...mine, unsent: true }, true)
        live.state = 'idle'
        live.stands = 'Not sent'
        // Said with the answer that refused it: where only the tool's first
        // line knew about the key, asking `auth status` again would not.
        void this.account().then((account) =>
          this.#deps.account(signal.how === 'offPlan' ? { ...account, key: true } : account),
        )
        break
      }
    }

    live.at = now
    if (items.length > 0 || gone.length > 0) {
      this.#deps.items({ id: live.id, items, ...(gone.length > 0 ? { gone } : {}) })
    }
    // The next message waiting goes once this one is over, in the mode chosen by then. Stopping a turn is moving on to the next thing, so the queue carries on; an ending nobody asked for leaves them for the window to put back in the field.
    const next = (signal.how === 'done' || signal.how === 'stopped') && !live.clearing ? live.queued.shift() : undefined
    if (next !== undefined) void this.send({ ...next.message, mode: live.mode })
    this.#changed()
    void this.#goal(live)
    if (live.clearing) {
      live.clearing = false
      void this.send({ session: live.id, root: live.root, mode: live.mode, text: '/goal clear', ...(live.chosen === undefined ? {} : { model: live.chosen }) })
    }

    this.#rest(live)
  }

  /** Where the goal stands once a turn is over, which only the tool's file says, and a line where it ended by itself. */
  async #goal(live: Live): Promise<void> {
    // One set anywhere else counts, so the file is read whether or not this knew of a goal: from a terminal, from another window, or from the tool's own queue.
    const had = live.goal
    const read = await (this.#deps.disk?.goal ?? readGoal)(live.root, live.id).catch(() => undefined)
    // A goal sent while the file was being read is newer than anything it says.
    if (read === undefined || this.#live.get(live.id) !== live || live.goal !== had) return
    live.goal = read.goal
    if (had !== undefined && read.goal === undefined && read.ended !== undefined) {
      const item: SessionItem = { ...read.ended, id: `goal:${String(this.#now())}` }
      live.items.set(item.id, item)
      this.#deps.items({ id: live.id, items: [item] })
      // A goal is what finished means: it held, so this is for the person to look
      // at; it was given up on, so it is for the person to unblock. A mark made by
      // hand is left as it is - it says what they decided, which this does not know.
      if (this.#deps.notes.all()[live.id]?.status === undefined) {
        this.#note(live.id, { status: read.met === true ? 'review' : 'blocked' })
      }
    }
    this.#changed()
  }

  /** An idle process is let go of after a while, unless Remote Control or something in the background is keeping it. */
  #rest(live: Live): void {
    clearTimeout(live.quiet)
    live.quiet = setTimeout(
      () => {
        if (live.state === 'working' || live.state === 'asks' || live.remote !== undefined || live.tasks.some(running)) return
        if (live.question) {
          void this.#letGo(live.id).then(() => this.#changed())
          return
        }
        live.driver?.end()
        live.driver = undefined
      },
      live.question ? QUESTION_QUIET : QUIET,
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
