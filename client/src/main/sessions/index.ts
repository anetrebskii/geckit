import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'

import type {
  CardAnswer,
  ChatSession,
  ClaudeAccount,
  ClaudeModel,
  PlanUsage,
  SessionItem,
  SessionItems,
  SessionMessage,
  SessionMode,
  SessionNotice,
  SessionState,
} from '../../shared/api'
import { sessionMode } from '../../shared/api'
import { claudeAccount } from './account'
import { holdClaude } from './claude'
import { claudeFile, deleteClaude, listClaude, readClaudeSession } from './disk'
import type { Conversation } from './disk'
import { cardId } from './heard'
import type { Driver, Heard, Signal } from './heard'
import { claudeModels } from './models'
import type { Wanted } from './rule'
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
      if (live !== undefined && row === undefined && !live.begun && live.state === 'idle' && live.last === undefined) {
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
    live.driver?.send(saying.text, saying.images)
    return live.id
  }

  /** Have a process holding the conversation, started the way its mode needs. */
  async #hold(live: Live): Promise<void> {
    clearTimeout(live.quiet)

    // The tool takes its model when a conversation is taken up, so another model is taking it up again.
    if (live.driver !== undefined && live.ran !== live.chosen) {
      live.driver.end()
      live.driver = undefined
    }
    // Claude Code is told how it may act when it starts, so a change of mind is a new start.
    if (live.driver !== undefined && live.runs !== live.mode) {
      live.driver.end()
      live.driver = undefined
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
        if (live.driver === driver) live.driver = undefined
      },
    )
    live.driver = driver
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

  stop(id: string): void {
    const live = this.#live.get(id)
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
   * Throw a conversation away, the file the tool keeps it in and all.
   *
   * There is no copy of it anywhere, which is why the window asks first.
   */
  async remove(id: string): Promise<boolean> {
    const root = this.#live.get(id)?.root ?? this.#rows.get(id)?.root
    if (root === undefined) return false
    // The tool writes to the file as it exits, so it goes first.
    await this.#letGo(id)
    const gone = await (this.#deps.disk?.delete ?? deleteClaude)(root, id).catch(() => false)
    this.#rows.delete(id)
    this.#note(id, { hidden: true })
    this.#changed()
    return gone
  }

  /** Stop holding a session, leaving whatever the tool has on disk alone. */
  async #letGo(id: string): Promise<void> {
    const live = this.#live.get(id)
    if (live === undefined) return
    clearTimeout(live.quiet)
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

    clearTimeout(live.quiet)
    live.quiet = setTimeout(() => {
      if (live.state === 'working' || live.state === 'asks') return
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
