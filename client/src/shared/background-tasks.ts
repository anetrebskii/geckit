import type { BackgroundTask } from './api'

export const taskTerminal = (task: BackgroundTask): boolean => task.status === 'completed' || task.status === 'failed' || task.status === 'stopped'

export function mergeTasks(sources: readonly (readonly BackgroundTask[] | undefined)[], now: number): readonly BackgroundTask[] {
  const tasks = new Map<string, BackgroundTask>()
  for (const source of sources) for (const task of source ?? []) {
    const previous = tasks.get(task.id)
    const at = task.observedAt ?? task.ended ?? task.started
    const before = previous === undefined ? -Infinity : previous.observedAt ?? previous.ended ?? previous.started
    if (previous === undefined || at > before || (at === before && (taskTerminal(task) || !taskTerminal(previous)))) tasks.set(task.id, task)
  }
  return [...tasks.values()].map((task) => !taskTerminal(task) && task.kind !== 'local_bash' && task.kind !== 'monitor' && task.observedAt !== undefined && now - task.observedAt > 120_000 ? { ...task, status: 'unknown' } : task)
}
