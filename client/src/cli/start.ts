/** What `geckit start` sends and prints, apart from the socket, so it can be tested. */

export interface Task {
  readonly project: string
  readonly title?: string
  readonly text: string
  readonly goal?: string
}

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
    if (['--project', '--goal', '--title', '--tasks'].includes(one)) {
      flags.set(one, args[at + 1] ?? '')
      at++
    } else if (one !== '--json') words.push(one)
  }
  const file = flags.get('--tasks')
  let tasks: unknown
  if (file !== undefined) {
    const named = file === '-' ? 'stdin' : file
    try {
      tasks = JSON.parse(read(file))
    } catch {
      return `${named} is not a JSON array of tasks.`
    }
    if (!Array.isArray(tasks)) return `${named} is not a JSON array of tasks.`
  } else {
    const project = flags.get('--project')
    if (project === undefined || project === '') return 'geckit start --project <name> [--title <title>] [--goal <condition>] <text>'
    tasks = [{ project, text: words.join(' '), title: flags.get('--title'), goal: flags.get('--goal') }]
  }
  const list = tasks as readonly Partial<Record<keyof Task, unknown>>[]
  if (list.length === 0) return 'Task 1 has no text.'
  if (list.length > 20) return 'At most 20 tasks at once.'
  const said = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined)
  const out: Task[] = []
  for (const [index, task] of list.entries()) {
    const text = said(task.text)
    if (text === undefined) return `Task ${String(index + 1)} has no text.`
    const title = said(task.title)
    const goal = said(task.goal)
    out.push({ project: said(task.project) ?? '', text, ...(title === undefined ? {} : { title }), ...(goal === undefined ? {} : { goal }) })
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
