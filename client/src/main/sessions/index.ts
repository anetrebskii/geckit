import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'

import type {
  BackgroundTask,
  CardAnswer,
  ChatSession,
  ClaudeAccount,
  ClaudeModel,
  McpServer,
  PlanUsage,
  SessionItem,
  SessionItems,
  SessionMessage,
  SessionMode,
  SessionNotice,
  SessionState,
  ShellCommand,
} from '../../shared/api'
import { sessionMode } from '../../shared/api'
import { claudeAccount } from './account'
import { holdClaude } from './claude'
import { claudeFile, deleteClaude, listClaude, readClaudeSession } from './disk'
import type { Conversation } from './disk'
import { cardId } from './heard'
import type { Driver, Heard, Signal } from './heard'
import { readMcp, serversOf } from './mcp'
import type { McpChange } from './mcp'
import { claudeModels } from './models'
import type { Wanted } from './rule'
import { runShell, toldClaude, wantsKeyboard } from './shell'
import type { Running } from './shell'
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
  readonly mode?: SessionMode
  readonly model?: string
  /** Started in this application rather than in a terminal. */
  readonly here?: boolean
  readonly unread?: boolean
  readonly hidden?: boolean
  /** When it was last in front in the window, for the search to offer what was used last. */
  readonly seen?: number
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
  readonly title: string
  readonly stands: string
  readonly at: number
  readonly driven: boolean
  readonly model?: string
  /** Tokens in the context after the last answer. */
  readonly used?: number
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
  // What follows is the outside world, replaceable so the rules can be tested without it.
  readonly claude?: typeof holdClaude
  readonly disk?: {
    list(root: string): Promise<readonly Omit<Row, 'root'>[]>
    read(root: string, id: string): Promise<Conversation | undefined>
    has(root: string, id: string): Promise<boolean>
    delete?(root: string, id: string): Promise<boolean>
  }
  readonly claudeAccount?: () => Promise<ClaudeAccount>
  readonly claudeModels?: () => Promise<ClaudeModel[] | undefined>
  readonly usage?: (models: readonly string[]) => Promise<Usage>
  readonly mcp?: (root: string, change?: McpChange) => Promise<McpServer[] | undefined>
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
  /** What the tool has running in the background, which goes with its process. */
  tasks: readonly BackgroundTask[]
  back: NodeJS.Timeout | undefined
  stopping: NodeJS.Timeout | undefined
}

/** How long an idle session keeps its process. */
const QUIET = 10 * 60_000

/** How long Stop waits to be heard before the process is ended instead. */
const STOP_HEARD = 5_000

/** How long the plan's windows, once asked, are taken to stand. */
const MEASURED_FOR = 60_000


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
      for (const [id, row] of this.#rows) if (row.root === root) this.#rows.delete(id)
      for (const row of found) this.#rows.set(row.id, { ...row, root })
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
      if (where === undefined || (roots !== undefined && !roots.includes(where))) continue
      if (note?.hidden === true) continue
      if (live === undefined && row?.driven === true && note?.here !== true) continue
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
      sessions.push({
        id,
        root: where,
        title: note?.title ?? live?.title ?? row?.title ?? '',
        stands: (quiet ? live?.stands || row?.stands : live.stands) ?? '',
        state: quiet && note?.unread === true ? 'unread' : (live?.state ?? 'idle'),
        at: Math.max(live?.at ?? 0, row?.at ?? 0),
        here: note?.here === true,
        mode: live?.mode ?? sessionMode(note?.mode),
        ...(model === undefined ? {} : { model }),
        ...(chosen === undefined ? {} : { chosen }),
        ...(note?.seen === undefined ? {} : { seen: note.seen }),
        ...(live?.remote === undefined ? {} : { remote: live.remote }),
        ...(live === undefined || live.tasks.length === 0 ? {} : { tasks: live.tasks }),
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

  #fresh(id: string, root: string, title: string, mode: SessionMode): Live {
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
      back: undefined,
      stopping: undefined,
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
      live = this.#fresh(randomUUID(), message.root, firstLine(message.text, 80), message.mode)
    } else if (live.driver === undefined) {
      await this.#reread(live)
    }
    if (live.state === 'working' || live.state === 'asks') return live.id

    live.mode = message.mode
    // A conversation begun with a command is named after what is first said in it.
    if (!live.begun && ![...live.items.values()].some((item) => item.kind === 'mine')) {
      live.title = firstLine(message.text, 80) || live.title
    }
    if (live.chosen !== message.model) {
      live.chosen = message.model
      // What the tool last said answers is not what will. It says again when the turn begins.
      live.model = undefined
    }
    clearTimeout(live.back)

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
   * terminal's `!` is. One that wants a keyboard is opened in a terminal instead.
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
    const terminal = this.#deps.terminal !== undefined && wantsKeyboard(command)
    const item: SessionItem = {
      kind: 'shell',
      id: `shell:${randomUUID()}`,
      command,
      output: '',
      at: this.#now(),
      ...(terminal ? { terminal: true } : { running: true }),
    }
    held.kept.push({ after: [...held.items.keys()].at(-1), item })
    held.items.set(item.id, item)
    held.at = this.#now()
    this.#deps.items({ id: held.id, items: [item] })
    this.#changed()
    if (terminal) {
      this.#deps.terminal?.(held.root, command)
      return held.id
    }

    const show = (next: SessionItem): void => {
      if (this.#live.get(held.id) !== held) return
      held.items.set(next.id, next)
      held.kept = held.kept.map((kept) => (kept.item.id === next.id ? { ...kept, item: next } : kept))
      this.#deps.items({ id: held.id, items: [next] })
    }
    // What it prints is drawn a few times a second, not once a line.
    let printed = ''
    let drawing: NodeJS.Timeout | undefined
    const running = (this.#deps.shell ?? runShell)(held.root, command, (output) => {
      printed = output
      drawing ??= setTimeout(() => {
        drawing = undefined
        if (held.commands.has(item.id)) show({ ...item, output: printed })
      }, 100)
    })
    held.commands.set(item.id, running)
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
    })
    return held.id
  }

  stopShell(id: string, item: string): void {
    this.#live.get(id)?.commands.get(item)?.stop()
  }

  /** A command the tool is waiting on, sent on in the background: the turn goes on, and so does the command. */
  toBackground(id: string, item: string): void {
    void this.#live.get(id)?.driver?.control?.({ subtype: 'background_tasks', tool_use_id: item }).catch(() => undefined)
  }

  stopTask(id: string, task: string): void {
    void this.#live.get(id)?.driver?.control?.({ subtype: 'stop_task', task_id: task }).catch(() => undefined)
  }

  /** Have a process holding the conversation, started the way its mode needs. */
  async #hold(live: Live): Promise<void> {
    clearTimeout(live.quiet)

    // The tool takes its model when a conversation is taken up, and is told how it may act when it starts, so
    // another model or a change of mind is a new start. Let go of before it is ended, so Remote Control carries over.
    if (live.driver !== undefined && (live.ran !== live.chosen || live.runs !== live.mode)) {
      const old = live.driver
      live.driver = undefined
      live.tasks = []
      void old.end()
    }
    if (live.driver !== undefined) return

    const resume = live.begun || (await (this.#deps.disk?.has ?? has)(live.root, live.id))
    // A new run counts from nothing, so the one before it is counted in with the earlier ones.
    if (live.running !== undefined) live.spent = (live.spent ?? 0) + live.running
    live.running = undefined
    live.runs = live.mode
    live.ran = live.chosen
    const driver = (this.#deps.claude ?? holdClaude)(
      { root: live.root, id: live.id, resume, mode: live.mode, ...(live.chosen === undefined ? {} : { model: live.chosen }) },
      (heard) => this.#hear(live, heard),
      () => {
        if (live.driver !== driver) return
        live.driver = undefined
        // What ran in the background went with the process.
        if (live.remote === undefined && live.tasks.length === 0) return
        live.remote = undefined
        live.tasks = []
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

  rename(id: string, title: string): void {
    const name = title.trim()
    if (name === '') return
    this.#note(id, { title: name })
    const live = this.#live.get(id)
    if (live !== undefined) live.title = name
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
    return this.#listed().filter((one) => one.state === 'asks' || one.state === 'unread').length
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
    if (items.length > 0 || heard.gone.length > 0) {
      live.at = now
      this.#deps.items({ id: live.id, items, ...(heard.gone.length > 0 ? { gone: heard.gone } : {}) })
    }
    for (const signal of heard.signals) this.#signal(live, signal)
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
      case 'tasks':
        live.tasks = signal.tasks
        // The process was kept for them, and with none left an idle one may go again.
        if (signal.tasks.length === 0 && live.state !== 'working' && live.state !== 'asks') this.#rest(live)
        this.#changed()
        return
      case 'begun':
        if (live.state === 'working' || live.state === 'asks') return
        clearTimeout(live.quiet)
        live.state = 'working'
        live.stands = 'Working'
        live.last = undefined
        live.at = this.#now()
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
    this.#changed()

    this.#rest(live)
  }

  /** An idle process is let go of after a while, unless Remote Control or something in the background is keeping it. */
  #rest(live: Live): void {
    clearTimeout(live.quiet)
    live.quiet = setTimeout(() => {
      if (live.state === 'working' || live.state === 'asks' || live.remote !== undefined || live.tasks.length > 0) return
      live.driver?.end()
      live.driver = undefined
    }, QUIET)
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
