import type { BackgroundTask, ChatSession } from '../shared/api'

export { COMPACT_AT_INVALID, validCompactAt } from '../shared/manager'

export function taskLabel(task: Pick<BackgroundTask, 'what' | 'command'>): string {
  const said = (task.what.trim() || task.command?.trim() || '').split('\n')[0]?.trim() ?? ''
  return said.length > 120 ? `${said.slice(0, 117)}...` : said
}

export type Observed = Pick<ChatSession, 'id' | 'title' | 'root' | 'state' | 'status' | 'stands' | 'delivery' | 'tasks' | 'goalMet'>

/** The line one worker update carries: state and a short label per background command, never its command or output. */
export function updateLine(worker: Observed, now: number): string {
  return JSON.stringify({ observedAt: now, id: worker.id, title: worker.title, root: worker.root, state: worker.state, status: worker.status, summary: worker.stands, delivery: worker.delivery, tasks: (worker.tasks ?? []).map((task) => ({ id: task.id, status: task.status, label: taskLabel(task) })) })
}

/** What the worker looked like the last time Manager was told, as kept in its signature. */
export interface Before {
  readonly state: unknown
  readonly goalMet: unknown
  readonly tasks: ReadonlyMap<string, string>
}

/** A change Manager must act on. A background command ending while the worker keeps working is not one. */
export function isMilestone(worker: Observed, before: Before | undefined, pendingForManager: number): boolean {
  const tasks = (worker.tasks ?? []).map((task): [string, string] => [task.id, task.status])
  const taskSettled = tasks.some(([id, status]) => status !== 'running' && status !== 'unknown' && before?.tasks.get(id) !== status && (status === 'asks' || before !== undefined && worker.state !== 'working'))
  return worker.state === 'asks' && pendingForManager === 0
    || worker.state === 'failed'
    || worker.status === 'blocked'
    || (worker.goalMet ?? null) !== (before?.goalMet ?? null)
    || worker.state === 'unread' && before?.state !== 'unread'
    || worker.state === 'idle' && before?.state === 'working'
    || taskSettled
}

export interface Groupable {
  readonly source: string
  readonly workers?: readonly string[]
  readonly request?: unknown
  readonly text: string
}

const isUpdate = (message: Groupable): boolean => message.source === 'event' && (message.workers?.length ?? 0) > 0

/** The worker updates delivered with `queue[0]` as one turn: the run of updates after it with the same request, up to the first message that is not one. */
export function groupUpdates<T extends Groupable>(queue: readonly T[]): readonly T[] {
  const first = queue[0]
  if (first === undefined) return []
  if (!isUpdate(first)) return [first]
  const request = JSON.stringify(first.request ?? null)
  const group: T[] = []
  for (const message of queue) {
    if (!isUpdate(message) || JSON.stringify(message.request ?? null) !== request) break
    group.push(message)
  }
  return group
}

/** One update text for a group: each worker once, at its first place, with its latest line. */
export function mergeUpdates(texts: readonly string[]): string {
  const lines = new Map<string, string>()
  for (const line of texts.flatMap((text) => text.split('\n')).filter((one) => one.trim() !== '')) {
    let id: string | undefined
    try { const parsed: unknown = JSON.parse(line); id = typeof parsed === 'object' && parsed !== null && 'id' in parsed && typeof parsed.id === 'string' ? parsed.id : undefined } catch { id = undefined }
    lines.set(id ?? `line:${lines.size}`, line)
  }
  return [...lines.values()].join('\n')
}

/** Whether a thread whose last turn read `used` tokens should be compacted now. Once per completed turn. */
export function shouldCompact(used: number | undefined, compactAt: number, turns: number, lastCompactedTurn: number | undefined): boolean {
  return compactAt > 0 && used !== undefined && used >= compactAt && turns > (lastCompactedTurn ?? -1)
}
