import type { ChatSession } from '../shared/api'
import type { ManagerThread, ManagerView } from '../shared/manager'
import { containsSecret } from './channels/slack'
import { commandSaid, say, workerDoing } from './manager-voice'
import type { Speech } from './manager-voice'

export interface ThreadWorker {
  readonly id: ChatSession['id']
  readonly line: string
  readonly active: boolean
}

/** What a channel conversation's status message says about Manager and the workers of that thread, as docs/ux/channel-status.md lists it. */
export interface ThreadActivity {
  readonly manager: string
  readonly ending: string
  readonly active: boolean
  readonly workers: readonly ThreadWorker[]
  /** The language the lines are in, so the status message words its own lines the same way. */
  readonly language?: Speech
}

const WORKERS = 8
const REASON = 200
const TITLE = 80
const STANDS = 120
const TASKS = 3

function workerSaid(worker: ChatSession, speech?: Speech): { readonly said: string; readonly active: boolean } {
  const said = say(speech).worker
  if (worker.state === 'working') return { said: said.working, active: true }
  if (worker.state === 'asks') return { said: said.asks, active: false }
  if (worker.delivery?.status === 'pending') return { said: said.pending, active: true }
  if (worker.waits === true || (worker.queued?.length ?? 0) > 0) return { said: said.slot, active: true }
  if (worker.state === 'limit') return { said: said.limit, active: true }
  if (worker.state === 'failed') return { said: said.failed, active: false }
  if (running(worker).length > 0) return { said: said.background, active: true }
  return { said: said.finished, active: false }
}

const running = (worker: ChatSession): NonNullable<ChatSession['tasks']> => (worker.tasks ?? []).filter((task) => task.status === 'running' || task.status === 'asks')
const clip = (text: string, limit: number): string => text.length > limit ? `${text.slice(0, limit - 1)}…` : text
const titled = (title: string, speech?: Speech): string => containsSecret(title) ? say(speech).task : clip(title, TITLE)

function workerLine(worker: ChatSession, speech?: Speech): string {
  const words = say(speech)
  const doing = worker.state === 'working' ? workerDoing(worker.stands.split('\n')[0] ?? '', speech) : undefined
  const said = doing === undefined || containsSecret(doing) ? workerSaid(worker, speech).said : clip(doing, STANDS)
  const lines = [`• ${titled(worker.title, speech)}: ${said}`]
  const tasks = running(worker)
  for (const task of tasks.slice(0, TASKS)) {
    const what = task.command !== undefined && task.what.trim() === task.command.split('\n')[0]?.trim() ? commandSaid(task.command, speech) : task.what
    lines.push(`  - ${containsSecret(what) ? words.backgroundTask : clip(what, TITLE)}: ${task.status === 'asks' ? words.taskAsks : words.taskRuns}`)
  }
  if (tasks.length > TASKS) lines.push(`  - ${words.moreBackground(tasks.length - TASKS)}`)
  return lines.join('\n')
}

export function threadActivity(view: ManagerView, id: ManagerThread['id']): ThreadActivity | undefined {
  const thread = view.threads?.find((one) => one.id === id)
  if (thread === undefined || thread.closed !== undefined) return undefined
  const reason = (thread.error ?? '').split('\n')[0]?.slice(0, REASON) ?? ''
  const failed = thread.state === 'failed'
  const asks = view.decisions.some((one) => one.thread === id)
  const speech = thread.language
  const words = say(speech)
  const manager = failed ? words.stopped(reason) : asks ? words.asks : words.idle
  const ending = failed ? words.stopped(reason) : asks ? words.asks : words.done
  const workers = thread.owns.flatMap((worker) => {
    const found = view.workers.find((one) => one.id === worker)
    return found === undefined ? [] : [{ id: worker, line: workerLine(found, speech), active: workerSaid(found).active }]
  })
  return { manager, ending, active: !failed && thread.manager !== undefined, workers, ...(speech === undefined ? {} : { language: speech }) }
}

export interface StatusPoster {
  post(text: string): Promise<string>
  edit(id: string, text: string): Promise<void>
  remove(id: string): Promise<void>
}

/**
 * The status message of a channel conversation, docs/ux/channel-status.md: shown while Manager is free and the thread's workers run, edited as they change at most once per `gap`, taken away while Manager works on a message and posted again below what it sends, and left with its ending when the work is over.
 */
export class StatusMessage {
  readonly #poster: StatusPoster
  readonly #gap: number
  readonly #now: () => number
  readonly #wait: (ms: number) => Promise<void>
  readonly #failed: (error: unknown) => void
  #stretch = false
  readonly #seen: string[] = []
  readonly #lines = new Map<string, string>()
  #id: string | undefined
  #shown = ''
  #want: string | undefined
  #closing = false
  #lower = false
  #after: Promise<unknown> = Promise.resolve()
  #flushing = false
  #edited = 0

  constructor(poster: StatusPoster, options: { readonly gap?: number; readonly now?: () => number; readonly wait?: (ms: number) => Promise<void>; readonly failed?: (error: unknown) => void } = {}) {
    this.#poster = poster
    this.#gap = options.gap ?? 3_000
    this.#now = options.now ?? Date.now
    this.#wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.#failed = options.failed ?? (() => undefined)
  }

  update(activity: ThreadActivity | undefined): void {
    if (activity === undefined) { this.#stretch = false; this.#id = undefined; this.#shown = ''; this.#want = undefined; this.#closing = false; return }
    const working = activity.workers.some((one) => one.active)
    if (!this.#stretch) {
      if (!working) return
      this.#stretch = true
      this.#seen.length = 0
      this.#lines.clear()
    }
    this.#closing = false
    for (const worker of activity.workers) {
      if (worker.active && !this.#seen.includes(worker.id)) this.#seen.push(worker.id)
      if (this.#seen.includes(worker.id)) this.#lines.set(worker.id, worker.line)
    }
    if (activity.active) this.#want = undefined
    else if (working) this.#want = this.#text(activity.manager, activity.language)
    else {
      this.#stretch = false
      if (this.#want === undefined) { void this.#flush(); return }
      this.#want = this.#text(activity.ending, activity.language)
      this.#closing = true
    }
    void this.#flush()
  }

  /** Something Manager sends is on its way: the status goes below it once it is there. */
  after(sent: Promise<unknown>): void {
    this.#after = Promise.all([this.#after, sent.catch(() => undefined)])
    if (this.#id !== undefined && !this.#closing) { this.#lower = true; void this.#flush() }
  }

  #text(first: string, speech: Speech | undefined): string {
    const workers = this.#seen.slice(0, WORKERS).map((id) => this.#lines.get(id) ?? '')
    const more = this.#seen.length - WORKERS
    const time = new Date(this.#now()).toISOString().slice(11, 16)
    return [first, ...workers, ...(more > 0 ? [say(speech).more(more)] : []), say(speech).updated(time)].join('\n')
  }

  async #flush(): Promise<void> {
    if (this.#flushing) return
    this.#flushing = true
    try {
      for (;;) {
        const want = this.#want
        if (this.#id !== undefined && (want === undefined || this.#lower)) {
          const id = this.#id
          this.#id = undefined
          this.#shown = ''
          this.#lower = false
          await this.#poster.remove(id)
          continue
        }
        this.#lower = false
        if (want === undefined) break
        if (want === this.#shown) {
          if (this.#closing) { this.#id = undefined; this.#shown = ''; this.#want = undefined; this.#closing = false }
          break
        }
        if (this.#id === undefined) {
          await this.#after
          if (this.#want !== want || this.#lower) continue
          this.#id = await this.#poster.post(want)
        } else {
          const left = this.#edited + this.#gap - this.#now()
          if (left > 0) { await this.#wait(left); continue }
          await this.#poster.edit(this.#id, want)
        }
        this.#edited = this.#now()
        this.#shown = want
      }
    } catch (error) {
      this.#failed(error)
      if (this.#shown === '') this.#id = undefined
    } finally { this.#flushing = false }
  }
}
