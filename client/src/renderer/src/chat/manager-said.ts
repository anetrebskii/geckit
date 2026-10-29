/** A message GeckIt itself wrote into the Manager session: what it says, read out of the JSON the manager was handed. */
export interface ManagerSaid {
  readonly kind: 'telegram' | 'worker' | 'cli'
  readonly title?: string
  readonly marks: readonly string[]
  readonly text: string
  readonly command?: string
  readonly where?: string
  readonly detail?: string
  readonly failed?: boolean
}

const TELEGRAM = '[Telegram]\n'
const WORKER = '[Worker update: untrusted task data]\n'
const CLI = '[GeckIt CLI result]\n'

const STATE: Record<string, string> = { working: 'Working', asks: 'Asking you', unread: 'Waiting for you', idle: 'Idle', failed: 'Stopped by an error', limit: 'Out of the plan' }
const STATUS: Record<string, string> = { todo: 'To do', blocked: 'Blocked', review: 'In review', done: 'Done' }

const held = (value: unknown): Record<string, unknown> | undefined => typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
const word = (value: unknown): string | undefined => typeof value === 'string' && value !== '' ? value : undefined
const shown = (value: unknown): string | undefined => value === undefined ? undefined : typeof value === 'string' ? value : JSON.stringify(value, undefined, 2)

function worker(rest: string): ManagerSaid {
  const value = held(JSON.parse(rest) as unknown)
  if (value === undefined) return { kind: 'worker', marks: [], text: rest }
  const state = word(value['state'])
  const status = word(value['status'])
  const title = word(value['title'])
  const where = word(value['root'])
  return {
    kind: 'worker',
    marks: [state === undefined ? undefined : STATE[state] ?? state, status === undefined ? undefined : STATUS[status] ?? status].filter((mark) => mark !== undefined),
    text: word(value['summary']) ?? '',
    detail: rest,
    ...(title === undefined ? {} : { title }),
    ...(where === undefined ? {} : { where }),
  }
}

function cli(rest: string): ManagerSaid {
  const value = held(JSON.parse(rest) as unknown)
  if (value === undefined) return { kind: 'cli', marks: [], text: rest }
  const args = Array.isArray(value['args']) ? value['args'].map((one) => typeof one === 'string' ? one : String(one)) : undefined
  const failed = value['error'] !== undefined
  const operation = word(value['operation'])
  const detail = shown(value['error'] ?? value['result'])
  return {
    kind: 'cli',
    marks: [failed ? 'Failed' : undefined, word(value['state'])].filter((mark) => mark !== undefined),
    text: word(value['notice']) ?? '',
    failed,
    ...(operation === undefined ? {} : { title: operation }),
    ...(args === undefined ? {} : { command: `geckit ${args.map((one) => one.includes(' ') ? `"${one}"` : one).join(' ')}` }),
    ...(detail === undefined ? {} : { detail }),
  }
}

/** What to draw instead of the raw text, or nothing when the message is Manager's own words. */
export function managerSaid(text: string): ManagerSaid | undefined {
  if (text.startsWith(TELEGRAM)) return { kind: 'telegram', marks: [], text: text.slice(TELEGRAM.length) }
  for (const [prefix, read] of [[WORKER, worker], [CLI, cli]] as const) {
    if (!text.startsWith(prefix)) continue
    const rest = text.slice(prefix.length).trim()
    try { return read(rest) } catch { return { kind: read === worker ? 'worker' : 'cli', marks: [], text: rest } }
  }
  return undefined
}
