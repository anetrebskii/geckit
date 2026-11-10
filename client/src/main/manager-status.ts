import type { ChatSession } from '../shared/api'
import type { ManagerThread, ManagerView } from '../shared/manager'
import { containsSecret } from './channels/slack'

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
}

const WORKERS = 8
const REASON = 200
const TITLE = 80
const STANDS = 120
const TASKS = 3

function workerSaid(worker: ChatSession): { readonly said: string; readonly active: boolean } {
  if (worker.state === 'working') return { said: 'working', active: true }
  if (worker.state === 'asks') return { said: 'waiting for an answer in GeckIt', active: false }
  if (worker.delivery?.status === 'pending') return { said: 'message sent, not started yet', active: true }
  if (worker.waits === true || (worker.queued?.length ?? 0) > 0) return { said: 'waiting for a free slot', active: true }
  if (worker.state === 'limit') return { said: "paused by the plan's usage limit", active: true }
  if (worker.state === 'failed') return { said: 'stopped with an error', active: false }
  if (running(worker).length > 0) return { said: 'running in the background', active: true }
  return { said: 'finished', active: false }
}

const running = (worker: ChatSession): NonNullable<ChatSession['tasks']> => (worker.tasks ?? []).filter((task) => task.status === 'running' || task.status === 'asks')
const clip = (text: string, limit: number): string => text.length > limit ? `${text.slice(0, limit - 1)}…` : text
const titled = (title: string): string => containsSecret(title) ? 'a task' : clip(title, TITLE)

function workerLine(worker: ChatSession): string {
  const lines = [`• ${titled(worker.title)}: ${workerSaid(worker).said}`]
  const stands = worker.stands.split('\n')[0]?.trim() ?? ''
  if (stands !== '' && !containsSecret(stands)) lines.push(`  ${clip(stands, STANDS)}`)
  const tasks = running(worker)
  for (const task of tasks.slice(0, TASKS)) lines.push(`  - ${containsSecret(task.what) ? 'a background task' : clip(task.what, TITLE)}: ${task.status === 'asks' ? 'waiting for an answer' : 'running'}`)
  if (tasks.length > TASKS) lines.push(`  - and ${String(tasks.length - TASKS)} more in the background`)
  return lines.join('\n')
}

export function threadActivity(view: ManagerView, id: ManagerThread['id']): ThreadActivity | undefined {
  const thread = view.threads?.find((one) => one.id === id)
  if (thread === undefined || thread.closed !== undefined) return undefined
  const reason = (thread.error ?? '').split('\n')[0]?.slice(0, REASON) ?? ''
  const failed = thread.state === 'failed'
  const asks = view.decisions.some((one) => one.thread === id)
  const manager = failed ? `Manager stopped: ${reason}` : asks ? 'Manager is waiting for your answer above.' : 'Work in progress'
  const ending = failed ? `Manager stopped: ${reason}` : asks ? 'Waiting for your answer above.' : 'Done.'
  const workers = thread.owns.flatMap((worker) => {
    const found = view.workers.find((one) => one.id === worker)
    return found === undefined ? [] : [{ id: worker, line: workerLine(found), active: workerSaid(found).active }]
  })
  return { manager, ending, active: !failed && thread.manager !== undefined, workers }
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
    else if (working) this.#want = this.#text(activity.manager)
    else {
      this.#stretch = false
      if (this.#want === undefined) { void this.#flush(); return }
      this.#want = this.#text(activity.ending)
      this.#closing = true
    }
    void this.#flush()
  }

  /** Something Manager sends is on its way: the status goes below it once it is there. */
  after(sent: Promise<unknown>): void {
    this.#after = Promise.all([this.#after, sent.catch(() => undefined)])
    if (this.#id !== undefined && !this.#closing) { this.#lower = true; void this.#flush() }
  }

  #text(first: string): string {
    const workers = this.#seen.slice(0, WORKERS).map((id) => this.#lines.get(id) ?? '')
    const more = this.#seen.length - WORKERS
    const time = new Date(this.#now()).toISOString().slice(11, 16)
    return [first, ...workers, ...(more > 0 ? [`and ${String(more)} more`] : []), `Updated ${time} UTC`].join('\n')
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
