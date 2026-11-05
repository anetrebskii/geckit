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

function workerSaid(worker: ChatSession): { readonly said: string; readonly active: boolean } {
  if (worker.state === 'working') return { said: 'working', active: true }
  if (worker.state === 'asks') return { said: 'waiting for an answer in GeckIt', active: false }
  if (worker.delivery?.status === 'pending') return { said: 'message sent, not started yet', active: true }
  if (worker.waits === true || (worker.queued?.length ?? 0) > 0) return { said: 'waiting for a free slot', active: true }
  if (worker.state === 'limit') return { said: "paused by the plan's usage limit", active: true }
  if (worker.state === 'failed') return { said: 'stopped with an error', active: false }
  return { said: 'finished', active: false }
}

const titled = (title: string): string => containsSecret(title) ? 'a task' : title.length > TITLE ? `${title.slice(0, TITLE - 1)}…` : title

export function threadActivity(view: ManagerView, id: ManagerThread['id']): ThreadActivity | undefined {
  const thread = view.threads?.find((one) => one.id === id)
  if (thread === undefined || thread.closed !== undefined) return undefined
  const reason = (thread.error ?? '').split('\n')[0]?.slice(0, REASON) ?? ''
  const failed = thread.state === 'failed'
  const asks = view.decisions.some((one) => one.thread === id)
  const manager = failed ? `Manager stopped: ${reason}` : thread.manager === 'working' ? 'Manager is working on it.' : thread.manager === 'received' ? 'Manager has your message and has not started yet.' : asks ? 'Manager is waiting for your answer above.' : 'Manager is done for now.'
  const ending = failed ? `Manager stopped: ${reason}` : asks ? 'Waiting for your answer above.' : 'Done.'
  const workers = [...new Set([...thread.owns, ...thread.follows])].flatMap((worker) => {
    const found = view.workers.find((one) => one.id === worker)
    if (found === undefined) return []
    const { said, active } = workerSaid(found)
    return [{ id: worker, line: `• ${titled(found.title)}: ${said}`, active }]
  })
  return { manager, ending, active: !failed && thread.manager !== undefined, workers }
}

export interface StatusPoster {
  post(text: string): Promise<string>
  edit(id: string, text: string): Promise<void>
}

interface Stretch {
  id: string | undefined
  want: string
  shown: string
  flushing: boolean
  readonly seen: string[]
  readonly lines: Map<string, string>
}

/** One status message per stretch of work in a channel conversation: posted when work starts, edited when its text changes, at most once per `gap`, and left with its ending when nothing is active. */
export class StatusMessage {
  readonly #poster: StatusPoster
  readonly #gap: number
  readonly #now: () => number
  readonly #wait: (ms: number) => Promise<void>
  readonly #failed: (error: unknown) => void
  #stretch: Stretch | undefined
  #edited = 0

  constructor(poster: StatusPoster, options: { readonly gap?: number; readonly now?: () => number; readonly wait?: (ms: number) => Promise<void>; readonly failed?: (error: unknown) => void } = {}) {
    this.#poster = poster
    this.#gap = options.gap ?? 3_000
    this.#now = options.now ?? Date.now
    this.#wait = options.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.#failed = options.failed ?? (() => undefined)
  }

  update(activity: ThreadActivity | undefined): void {
    if (activity === undefined) { this.#stretch = undefined; return }
    const live = activity.active || activity.workers.some((one) => one.active)
    if (this.#stretch === undefined) {
      if (!live) return
      this.#stretch = { id: undefined, want: '', shown: '', flushing: false, seen: [], lines: new Map() }
    }
    const stretch = this.#stretch
    for (const worker of activity.workers) {
      if (worker.active && !stretch.seen.includes(worker.id)) stretch.seen.push(worker.id)
      if (stretch.seen.includes(worker.id)) stretch.lines.set(worker.id, worker.line)
    }
    const workers = stretch.seen.slice(0, WORKERS).map((id) => stretch.lines.get(id) ?? '')
    const more = stretch.seen.length - WORKERS
    const time = new Date(this.#now()).toISOString().slice(11, 16)
    stretch.want = [live ? activity.manager : activity.ending, ...workers, ...(more > 0 ? [`and ${String(more)} more`] : []), ...(live ? [] : [`Updated ${time} UTC`])].join('\n')
    if (!live) this.#stretch = undefined
    void this.#flush(stretch)
  }

  async #flush(stretch: Stretch): Promise<void> {
    if (stretch.flushing) return
    stretch.flushing = true
    try {
      while (stretch.want !== stretch.shown) {
        const text = stretch.want
        if (stretch.id === undefined) {
          stretch.id = await this.#poster.post(text)
        } else {
          const left = this.#edited + this.#gap - this.#now()
          if (left > 0) { await this.#wait(left); continue }
          await this.#poster.edit(stretch.id, text)
        }
        this.#edited = this.#now()
        stretch.shown = text
      }
    } catch (error) {
      this.#failed(error)
      if (stretch.shown === '') stretch.id = undefined
    } finally { stretch.flushing = false }
  }
}
