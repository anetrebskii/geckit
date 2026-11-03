import { assistantsIn, providerOf } from '../shared/api'
import type { Sessions, Asking } from '../main/sessions'
import type { StartAsked, StartAnswered } from '../main/asked'
import { firstLine } from '../main/sessions/wording'
import { projectSaid } from '../main/orders'
import { getSettings } from '../main/store'

export async function requestTasks(held: Sessions, ask: StartAsked, gone: AbortSignal, hostNamed: (id: string) => string | undefined): Promise<StartAnswered> {
  // A program names itself; the name is only shown, since nothing starts before the person says so.
  const app = typeof ask.app === 'string' ? firstLine(ask.app.trim(), 40) : ''
  if (app === '' && (typeof ask.from !== 'string' || ask.from === '')) return { ok: false, error: 'Run this from a Claude Code or Codex session, or name the program with --app.' }
  const tasks = Array.isArray(ask.tasks) ? ask.tasks : []
  if (tasks.length === 0) return { ok: false, error: 'Task 1 has no text.' }
  if (tasks.length > 20) return { ok: false, error: 'At most 20 tasks at once.' }
  const projects = getSettings().projects
  const listed = await held.list(projects)
  const from = app === '' ? held.requestOrigin(ask.from ?? '') : undefined
  if (from !== undefined && !listed.some((one) => one.id === from)) {
    return { ok: false, error: "This conversation's folder is not one of your folders in GeckIt." }
  }
  const asking: Asking[] = []
  for (const [index, task] of tasks.entries()) {
    const root = projects.find((one) => projectSaid(one, hostNamed) === task.project)
    if (root === undefined) {
      const names = projects.map((one) => projectSaid(one, hostNamed)).join(', ')
      return { ok: false, error: `Task ${String(index + 1)}: no folder called ${String(task.project)}. There are: ${names}` }
    }
    const text = typeof task.text === 'string' ? task.text.trim() : ''
    if (text === '') return { ok: false, error: `Task ${String(index + 1)} has no text.` }
    const title = typeof task.title === 'string' && task.title.trim() !== '' ? task.title.trim() : text.split(/(?<=[.!?])\s/)[0] ?? text
    const goal = typeof task.goal === 'string' && task.goal.trim() !== '' ? task.goal.trim() : undefined
    const enabled = assistantsIn(getSettings())
    const provider = task.provider ?? (from === undefined ? enabled[0] ?? 'claude' : providerOf(from))
    if (!enabled.includes(provider)) return { ok: false, error: `Task ${String(index + 1)}: provider ${provider} is not enabled.` }
    asking.push({ provider, project: task.project, root, title: firstLine(title, 100), text, ...(goal === undefined ? {} : { goal }) })
  }
  const mode = getSettings().chatMode
  const answered = from === undefined ? await held.requestFromApp(app, asking, mode, gone) : await held.request(from, asking, mode, gone)
  return answered === undefined ? { ok: false, error: 'The requesting conversation stopped waiting.' } : { ok: true, ...answered }
}
