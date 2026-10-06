/** What `geckit start` sends and prints, apart from the socket, so it can be tested. */

import type { RequestTask, SessionProvider } from '../shared/api'

export type Task = Pick<RequestTask, 'project' | 'text' | 'goal' | 'provider'> & Partial<Pick<RequestTask, 'title'>>

export function requestingSession(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const thread = env['CODEX_THREAD_ID']?.trim()
  if (thread) return thread.startsWith('codex:') ? thread : `codex:${thread}`
  return env['CLAUDE_CODE_SESSION_ID']?.trim() || undefined
}

export const requestedProvider = (value: string): SessionProvider | undefined =>
  value === 'codex' || value === 'claude' || /^plugin:[^:]+$/.test(value) ? value as SessionProvider : undefined

export interface Answer {
  readonly ok: boolean
  readonly error?: string
  readonly tasks?: readonly { readonly answer: 'started' | 'queued' | 'refused'; readonly id?: string; readonly note?: string }[]
  readonly reply?: string
}

/** The tasks a `start` asks for, from its flags or from the file it names, or what is wrong with them. */
export function tasksFrom(args: readonly string[], read: (file: string) => string): readonly Task[] | string {
  const flags = new Map<string, string>()
  const words: string[] = []
  for (let at = 0; at < args.length; at++) {
    const one = args[at] ?? ''
    if (['--project', '--goal', '--title', '--conversations', '--tasks', '--provider'].includes(one)) {
      flags.set(one, args[at + 1] ?? '')
      at++
    } else if (one !== '--json') words.push(one)
  }
  const file = flags.get('--conversations') ?? flags.get('--tasks')
  let tasks: unknown
  if (file !== undefined) {
    const named = file === '-' ? 'stdin' : file
    try {
      tasks = JSON.parse(read(file))
    } catch {
      return `${named} is not a JSON array of conversations.`
    }
    if (!Array.isArray(tasks)) return `${named} is not a JSON array of conversations.`
  } else {
    const project = flags.get('--project')
    if (project === undefined || project === '') return 'geckit start --project <name> [--title <title>] [--goal <condition>] <text>'
    tasks = [{ project, text: words.join(' '), title: flags.get('--title'), goal: flags.get('--goal'), provider: flags.get('--provider') }]
  }
  const list = tasks as readonly Task[]
  if (list.length === 0) return 'Conversation 1 has no text.'
  if (list.length > 20) return 'At most 20 conversations at once.'
  const said = (value: string | undefined): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined)
  const out: Task[] = []
  for (const [index, task] of list.entries()) {
    const text = said(task.text)
    if (text === undefined) return `Conversation ${String(index + 1)} has no text.`
    const title = said(task.title)
    const goal = said(task.goal)
    const choice = said(task.provider)
    const provider = choice === undefined ? undefined : requestedProvider(choice)
    if (choice !== undefined && provider === undefined) return `Conversation ${String(index + 1)}: unsupported provider ${choice}.`
    out.push({ project: said(task.project) ?? '', text, ...(title === undefined ? {} : { title }), ...(goal === undefined ? {} : { goal }), ...(provider === undefined ? {} : { provider }) })
  }
  return out
}

/** The answer as the command prints it: a line per task in the order sent, then the reply. */
export function answerLines(answer: Answer, json: boolean): string {
  const tasks = answer.tasks ?? []
  if (json) {
    return JSON.stringify(
      { tasks: tasks.map((one, index) => ({ task: index + 1, ...one })), ...(answer.reply === undefined ? {} : { reply: answer.reply }) },
      undefined,
      2,
    )
  }
  return [
    ...tasks.map((one, index) =>
      one.answer === 'started'
        ? `${String(index + 1)} Started ${one.id ?? ''}${one.note === undefined ? '' : `: ${one.note}`}`
        : one.answer === 'queued'
          ? `${String(index + 1)} Queued ${one.id ?? ''}${one.note === undefined ? '' : `: ${one.note}`}`
          : `${String(index + 1)} Refused`,
    ),
    ...(answer.reply === undefined ? [] : [`Reply: ${answer.reply}`]),
  ].join('\n')
}
