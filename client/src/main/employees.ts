import { randomUUID } from 'node:crypto'
import { configuration, setConfiguration } from '../core/configuration'

import type { Employee, EmployeeConversation, EmployeeDraft, EmployeeMemory, EmployeesView } from '../shared/employees'
import type { ChatSession, ReasoningEffort, SessionItem, SessionMode, Settings, Shortcut, ShortcutDraft, TeamAnswer } from '../shared/api'
import { assistantFor, assistantsIn } from '../shared/api'
import { requestedProvider } from '../cli/start'
import { isCodexProvider } from '../shared/providers'
import { cronOf, describeCron, describeStartWindow, isCron, nextTimed, startWindowError, WEEKDAYS } from '../shared/schedule'

/** What the write commands of `geckit employees` reach beyond the catalog. */
export interface TeamDeps {
  readonly settings: () => Pick<Settings, 'shortcuts' | 'chatProviders' | 'chatProvider' | 'chatMode' | 'providerPlugins'>
  /** The folder a project is called by, as `geckit start` names it; throws naming the ones there are. */
  readonly project: (name: string) => string
  readonly projectName: (root: string) => string
  readonly saveShortcut: (draft: ShortcutDraft) => Shortcut
  readonly removeShortcut: (id: Shortcut['id']) => void
  readonly runShortcut: (id: Shortcut['id']) => Promise<string | undefined>
  readonly assign: (session: ChatSession['id'], employee: Employee['id'] | null) => void
  readonly title: (session: ChatSession['id']) => string | undefined
  /** Shows the changes in the conversation that asked and waits for the person; nothing where it stopped waiting. */
  readonly ask: (session: ChatSession['id'], lines: readonly string[], gone: AbortSignal) => Promise<TeamAnswer | undefined>
  readonly manager: () => { readonly instructions: string; readonly avatar: string }
  readonly setManager: (change: { readonly instructions?: string; readonly avatar?: string }) => Promise<void>
}

interface Change {
  readonly lines: readonly string[]
  readonly apply: () => Promise<string>
}

const WRITES = new Set(['create', 'edit', 'archive', 'restore', 'assign', 'shortcut', 'manager'])
const USAGE = 'Use employees list, current, show <id>, memory <id> [--cursor <next>], tasks <id>, shortcuts [<id>|none], create, edit <id>, archive <id>, restore <id>, assign <session-id> <id|none>, manager [edit] or shortcut add|edit|pause|resume|remove|give|run. Run geckit help for the options.'
const EVERY = 'Use --every "hour", "hour 15", "day 9:00", "weekdays 9:00" or "week monday 9:00".'
const MODES: readonly SessionMode[] = ['manual', 'auto', 'plan']
const EFFORTS: readonly ReasoningEffort[] = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']

/** A portrait said as its number, 1 to 12, as the editor shows them. */
function portrait(text: string | undefined): string | undefined {
  if (text === undefined) return undefined
  const number = Number(text.trim())
  if (!/^\d{1,2}$/.test(text.trim()) || number < 1 || number > 12) throw new Error('Use --avatar with a portrait number from 1 to 12.')
  return `employee-${String(number).padStart(2, '0')}`
}

function clock(text: string | undefined): { readonly hour: number; readonly minute: number } {
  const found = /^(\d{1,2}):(\d{2})$/.exec(text ?? '')
  const hour = Number(found?.[1])
  const minute = Number(found?.[2])
  if (found === null || hour > 23 || minute > 59) throw new Error(EVERY)
  return { hour, minute }
}

/** The simple timetables the editor offers, said as words, as the cron line they are kept as. */
export function everyCron(text: string): string {
  const [kind, first, second, ...more] = text.trim().toLowerCase().split(/\s+/)
  if (more.length > 0) throw new Error(EVERY)
  if (kind === 'hour' && second === undefined) {
    const minute = first === undefined ? 0 : Number(first)
    if (!/^\d{1,2}$/.test(first ?? '0') || minute > 59) throw new Error(EVERY)
    return cronOf({ kind: 'hour', minute })
  }
  if ((kind === 'day' || kind === 'weekdays') && second === undefined) return cronOf({ kind, ...clock(first) })
  if (kind === 'week') {
    const weekday = WEEKDAYS.findIndex((day) => first !== undefined && first.length >= 3 && day.toLowerCase().startsWith(first))
    if (weekday < 0) throw new Error(EVERY)
    return cronOf({ kind: 'week', weekday, ...clock(second) })
  }
  throw new Error(EVERY)
}

/** Flags given once each with a value, and the words between them. */
function options(args: readonly string[], allowed: readonly string[]): { readonly words: readonly string[]; readonly flags: ReadonlyMap<string, string> } {
  const words: string[] = []
  const flags = new Map<string, string>()
  for (let at = 0; at < args.length; at++) {
    const one = args[at] ?? ''
    if (!one.startsWith('--')) { words.push(one); continue }
    if (!allowed.includes(one)) throw new Error(`${one} is not an option here. ${USAGE}`)
    const value = args[at + 1]
    if (value === undefined) throw new Error(`${one} needs a value.`)
    if (flags.has(one)) throw new Error(`${one} is given twice.`)
    flags.set(one, value)
    at++
  }
  return { words, flags }
}

const SHORTCUT_FLAGS = ['--target', '--name', '--project', '--prompt', '--goal', '--every', '--cron', '--start-window-minutes', '--provider', '--model', '--reasoning', '--mode']
const quoted = (text: string): string => `"${text}"`
const brief = (text: string): string => (text.length > 200 ? `${text.slice(0, 199)}...` : text).replace(/\s+/g, ' ')
const scheduled = (one: Shortcut): boolean => one.on && (one.cron !== undefined || one.recurrence !== undefined)

interface EmployeeDeps {
  readonly directory: string
  readonly sync: (employees: readonly Employee[]) => Promise<void>
  readonly changed?: (view: EmployeesView) => void
  readonly sources: (id: Employee['id']) => Promise<readonly Omit<EmployeeConversation, 'items'>[]>
  readonly assignment: (session: ChatSession['id']) => Employee['id'] | undefined
  readonly items: (source: EmployeeConversation['session']) => Promise<readonly SessionItem[] | undefined>
  /** An archived employee restored, so its timetables count from now. */
  readonly restored?: (id: Employee['id']) => void
  readonly team?: TeamDeps
}

interface MemoryCursor {
  readonly employee: Employee['id']
  readonly source: ChatSession['id']
  readonly item: number
  readonly offset: number
}

const avatarValid = (avatar: string): boolean => /^employee-(?:0[1-9]|1[0-2])$/.test(avatar)
const MESSAGE_PAGE = 20_000
const SOURCE_PAGE = 10
const ITEM_PAGE = 40

export class Employees {
  readonly #deps: EmployeeDeps
  #employees: readonly Employee[]
  #error: string | undefined
  #writing = Promise.resolve()

  constructor(deps: EmployeeDeps) {
    this.#deps = deps
    this.#employees = configuration(deps.directory).employees ?? []
  }

  list(): EmployeesView {
    return { employees: this.#employees, ...(this.#error === undefined ? {} : { error: this.#error }) }
  }

  get(id: Employee['id']): Employee {
    const employee = this.#employees.find((one) => one.id === id)
    if (employee === undefined) throw new Error('This employee is no longer available.')
    return employee
  }

  active(id: Employee['id']): Employee {
    const employee = this.get(id)
    if (employee.archived) throw new Error('This employee is archived. Restore it or choose another employee.')
    return employee
  }

  #write(employees: readonly Employee[]): void {
    setConfiguration(this.#deps.directory, { employees })
    this.#employees = employees
  }

  #serial(run: () => Promise<EmployeesView>): Promise<EmployeesView> {
    const result = this.#writing.then(run)
    this.#writing = result.then(() => undefined, () => undefined)
    return result
  }

  async #sync(): Promise<EmployeesView> {
    try { await this.#deps.sync(this.#employees); this.#error = undefined }
    catch (error) { this.#error = error instanceof Error ? error.message : 'Employee saved. Assistant instructions could not be updated.' }
    const view = this.list()
    this.#deps.changed?.(view)
    return view
  }

  save(draft: EmployeeDraft): Promise<EmployeesView> {
    return this.#serial(async () => {
      if (typeof draft.name !== 'string' || draft.name.trim() === '') throw new Error('Enter a name')
      if (typeof draft.role !== 'string' || typeof draft.description !== 'string' || typeof draft.avatar !== 'string' || !avatarValid(draft.avatar)) throw new Error('Choose an available employee portrait.')
      const before = draft.id === undefined ? undefined : this.get(draft.id)
      if (before !== undefined && draft.revision !== before.revision) throw new Error('This employee changed in another window. Reopen it before saving.')
      const employee: Employee = { id: before?.id ?? randomUUID(), name: draft.name.trim(), role: draft.role, description: draft.description, avatar: draft.avatar, archived: before?.archived ?? false, revision: (before?.revision ?? 0) + 1 }
      this.#write(before === undefined ? [...this.#employees, employee] : this.#employees.map((one) => one.id === employee.id ? employee : one))
      return this.#sync()
    })
  }

  rename(id: Employee['id'], name: Employee['name'], expected: Employee['name'], authorized: () => boolean = () => true): Promise<EmployeesView> {
    return this.#serial(async () => {
      if (!authorized()) throw new Error('The originating Manager session is no longer authorized.')
      if (name.trim() === '') throw new Error('Enter a name')
      const before = this.get(id)
      if (before.name !== expected) throw new Error('Employee name changed. Read employees show and merge before retrying.')
      this.#write(this.#employees.map((one) => one.id === id ? { ...one, name: name.trim(), revision: one.revision + 1 } : one))
      return this.#sync()
    })
  }

  archive(id: Employee['id'], revision: Employee['revision'], archived = true): Promise<EmployeesView> {
    return this.#serial(async () => {
      const before = this.get(id)
      if (before.revision !== revision) throw new Error('This employee changed in another window. Reopen it before saving.')
      if (before.archived !== archived) this.#write(this.#employees.map((one) => one.id === id ? { ...one, archived, revision: one.revision + 1 } : one))
      if (before.archived && !archived) this.#deps.restored?.(id)
      return this.#sync()
    })
  }

  retryInstructions(): Promise<EmployeesView> { return this.#serial(() => this.#sync()) }

  async command(args: readonly string[], session?: ChatSession['id'], compactMemory = false, gone?: AbortSignal): Promise<string> {
    const [command, id, ...rest] = args
    if (command === 'list' && (id === undefined || id === '--json') && rest.length === 0) return JSON.stringify(this.list())
    if (command === 'current' && (id === undefined || id === '--json') && rest.length === 0) {
      if (session === undefined || session.trim() === '') throw new Error('Run this lookup from a Claude Code or Codex conversation.')
      const employeeId = this.#deps.assignment(session)
      return JSON.stringify({ session, employee: employeeId === undefined ? null : this.get(employeeId) })
    }
    if (command === 'show' && id !== undefined && (rest.length === 0 || rest.length === 1 && rest[0] === '--json')) return JSON.stringify(this.get(id))
    if (command === 'memory' && id !== undefined) {
      const options = rest.filter((value) => value !== '--json')
      if (options.length !== 0 && !(options.length === 2 && options[0] === '--cursor' && options[1] !== undefined)) throw new Error('Use employees memory <employee-id> [--cursor <next>].')
      if (compactMemory) return this.#managerMemory(id, options[1])
      return JSON.stringify(await this.memory(id, options[1]))
    }
    const team = this.#deps.team
    if (command === undefined || (!WRITES.has(command) && command !== 'tasks' && command !== 'shortcuts')) throw new Error(USAGE)
    if (team === undefined || compactMemory) throw new Error('Use employees list, employees current, employees show <employee-id> or employees memory <employee-id> [--cursor <next>]. These commands only read.')
    const json = args.includes('--json')
    const read = args.slice(1).filter((value) => value !== '--json')
    if (command === 'tasks') {
      if (read.length !== 1 || read[0] === undefined) throw new Error('Use employees tasks <employee-id> [--json].')
      return this.#tasks(this.#employee(read[0]), json)
    }
    if (command === 'manager' && (read.length === 0 || read[0] === 'show')) {
      if (read.length > 1) throw new Error('Use employees manager [show] [--json].')
      const now = team.manager()
      if (json) return JSON.stringify({ name: 'Manager', ...now })
      return `Manager${now.avatar === '' ? '' : `  ·  portrait ${String(Number(now.avatar.slice(-2)))}`}\n${now.instructions.trim() === '' ? 'No instructions.' : now.instructions}`
    }
    if (command === 'shortcuts') {
      if (read.length > 1) throw new Error('Use employees shortcuts [<employee-id>|none] [--json].')
      return this.#shortcuts(team, read[0] === undefined ? undefined : read[0] === 'none' ? null : this.#employee(read[0]).id, json)
    }
    const change = command === 'shortcut' ? this.#shortcutChange(team, args.slice(1)) : command === 'manager' ? this.#managerChange(team, args.slice(1)) : this.#change(team, command, args.slice(1))
    if (session !== undefined && session.trim() !== '') {
      const answer = await team.ask(session, change.lines, gone ?? new AbortController().signal)
      if (answer === undefined) throw new Error('The requesting conversation stopped waiting.')
      if (answer.how !== 'allowed') throw new Error(answer.note === undefined ? 'Declined by the person.' : `Declined by the person. Their note: ${answer.note}`)
    }
    return change.apply()
  }

  /** An employee by id, or by a name only one has. */
  #employee(said: string): Employee {
    const found = this.#employees.find((one) => one.id === said) ?? this.#employees.filter((one) => one.name.toLowerCase() === said.trim().toLowerCase()).reduce<Employee | 'many' | undefined>((one, other) => (one === undefined ? other : 'many'), undefined)
    if (found === 'many') throw new Error(`More than one employee is called ${said}. Use the id from employees list.`)
    if (found === undefined) throw new Error(`No employee ${said}. Use an id from employees list.`)
    return found
  }

  #owner(id: Employee['id'] | undefined): string {
    if (id === undefined) return 'No employee'
    return this.#employees.find((one) => one.id === id)?.name ?? 'No employee'
  }

  async #tasks(employee: Employee, json: boolean): Promise<string> {
    const sources = await this.#deps.sources(employee.id)
    const tasks = sources.map(({ session, hidden, unavailable }) => ({ id: session.id, title: session.title, status: session.status ?? 'in progress', root: session.root, at: new Date(session.at).toISOString(), ...(hidden ? { hidden } : {}), ...(unavailable === undefined ? {} : { unavailable }) }))
    if (json) return JSON.stringify(tasks)
    if (tasks.length === 0) return `${employee.name} has no tasks.`
    return tasks.map((one) => `${one.status.padEnd(12)}${one.title}  ${one.id}`).join('\n')
  }

  #shortcutWhen(one: Shortcut): string {
    const when = one.cron !== undefined ? [describeCron(one.cron), describeStartWindow(one)].filter(Boolean).join(' · ') : one.recurrence !== undefined ? 'Custom recurrence' : 'By hand'
    if (one.cron === undefined && one.recurrence === undefined) return when
    if (one.employeeId !== undefined && this.#employees.find((employee) => employee.id === one.employeeId)?.archived === true) return `${when} · Paused while archived`
    return one.on ? when : `${when} · Paused`
  }

  #shortcuts(team: TeamDeps, owner: Employee['id'] | null | undefined, json: boolean): string {
    const now = Date.now()
    const list = team.settings().shortcuts.filter((one) => owner === undefined || (owner === null ? one.target !== 'manager' && one.employeeId === undefined : one.employeeId === owner))
    if (json) return JSON.stringify(list.map((one) => { const next = nextTimed(one, now); return { ...one, project: team.projectName(one.root), ...(next === undefined || this.#shortcutWhen(one).endsWith('archived') ? {} : { next: new Date(next).toISOString() }) } }))
    if (list.length === 0) return 'No shortcuts.'
    return list.map((one) => `${one.name}  ·  ${this.#shortcutWhen(one)}  ·  ${team.projectName(one.root)}  ·  ${one.target === 'manager' ? 'Manager' : this.#owner(one.employeeId)}  ·  ${one.id}`).join('\n')
  }

  #change(team: TeamDeps, command: string, args: readonly string[]): Change {
    if (command === 'create' || command === 'edit') {
      const { words, flags } = options(args, ['--name', '--role', '--description', '--avatar'])
      const avatar = portrait(flags.get('--avatar'))
      const name = flags.get('--name')?.trim()
      const role = flags.get('--role')
      const description = flags.get('--description')
      if (name === '') throw new Error('Enter a name')
      if (command === 'create') {
        if (words.length !== 0 || name === undefined) throw new Error('Use employees create --name <name> [--role <role>] [--description <text>|--description-file <file>] [--avatar <1-12>].')
        return {
          lines: [`Add employee ${quoted(name)}${role === undefined || role.trim() === '' ? '' : ` (${role.trim()})`}`, ...(description === undefined || description.trim() === '' ? [] : [`Description: ${brief(description)}`])],
          apply: async () => {
            const view = await this.save({ name, role: role?.trim() ?? '', description: description ?? '', avatar: avatar ?? `employee-${String((this.#employees.length % 12) + 1).padStart(2, '0')}` })
            const made = view.employees.at(-1)
            return `Created employee ${name}${made === undefined ? '' : ` (${made.id})`}.`
          },
        }
      }
      const [said] = words
      if (words.length !== 1 || said === undefined || (name === undefined && role === undefined && description === undefined && avatar === undefined)) throw new Error('Use employees edit <employee-id> [--name <name>] [--role <role>] [--description <text>|--description-file <file>] [--avatar <1-12>].')
      const before = this.#employee(said)
      const what = [name === undefined ? undefined : `name to ${quoted(name)}`, role === undefined ? undefined : `role to ${quoted(role.trim())}`, description === undefined ? undefined : 'description', avatar === undefined ? undefined : `portrait to ${String(Number(avatar.slice(-2)))}`].filter((one) => one !== undefined)
      return {
        lines: [`Change employee ${before.name}: ${what.join(', ')}`, ...(description === undefined ? [] : [`Description: ${brief(description)}`])],
        apply: async () => {
          const now = this.get(before.id)
          await this.save({ ...now, ...(name === undefined ? {} : { name }), ...(role === undefined ? {} : { role: role.trim() }), ...(description === undefined ? {} : { description }), ...(avatar === undefined ? {} : { avatar }) })
          return `Saved employee ${name ?? now.name}.`
        },
      }
    }
    if (command === 'archive' || command === 'restore') {
      const [said, ...more] = args
      if (said === undefined || more.length > 0) throw new Error(`Use employees ${command} <employee-id>.`)
      const employee = this.#employee(said)
      const pausing = team.settings().shortcuts.filter((one) => one.employeeId === employee.id && scheduled(one)).length
      const counted = `${String(pausing)} scheduled shortcut${pausing === 1 ? '' : 's'}`
      if (command === 'archive') {
        return {
          lines: [`Archive ${employee.name}${pausing === 0 ? '' : ` and pause ${counted}`}`],
          apply: async () => {
            await this.archive(employee.id, this.get(employee.id).revision)
            return `Archived ${employee.name}.${pausing === 0 ? '' : ` ${counted} paused.`}`
          },
        }
      }
      return {
        lines: [`Restore ${employee.name}${pausing === 0 ? '' : ` and resume ${counted}`}`],
        apply: async () => {
          await this.archive(employee.id, this.get(employee.id).revision, false)
          return `Restored ${employee.name}.`
        },
      }
    }
    const [session, said, ...more] = args
    if (session === undefined || said === undefined || more.length > 0) throw new Error('Use employees assign <session-id> <employee-id|none>.')
    const employee = said === 'none' ? undefined : this.#employee(said)
    if (employee?.archived === true) throw new Error('This employee is archived. Restore it or choose another employee.')
    const title = team.title(session) ?? session
    return {
      lines: [employee === undefined ? `Remove the employee from ${quoted(title)}` : `Assign ${quoted(title)} to ${employee.name}`],
      apply: async () => {
        team.assign(session, employee?.id ?? null)
        return employee === undefined ? `Removed the employee from ${title}.` : `Assigned ${title} to ${employee.name}.`
      },
    }
  }

  #managerChange(team: TeamDeps, args: readonly string[]): Change {
    const [action, ...rest] = args
    const { words, flags } = options(rest, ['--instructions', '--avatar'])
    const instructions = flags.get('--instructions')
    const avatar = portrait(flags.get('--avatar'))
    if (action !== 'edit' || words.length !== 0 || (instructions === undefined && avatar === undefined)) throw new Error('Use employees manager edit [--instructions <text>|--instructions-file <file>] [--avatar <1-12>]. --instructions "" clears them.')
    const what = [instructions === undefined ? undefined : instructions.trim() === '' ? 'clear instructions' : 'instructions', avatar === undefined ? undefined : `portrait to ${String(Number(avatar.slice(-2)))}`].filter((one) => one !== undefined)
    return {
      lines: [`Change Manager: ${what.join(', ')}`, ...(instructions === undefined || instructions.trim() === '' ? [] : [`Instructions: ${brief(instructions)}`])],
      apply: async () => {
        await team.setManager({ ...(instructions === undefined ? {} : { instructions: instructions.trim() }), ...(avatar === undefined ? {} : { avatar }) })
        return 'Saved Manager.'
      },
    }
  }

  #shortcut(team: TeamDeps, said: string | undefined): Shortcut {
    const all = team.settings().shortcuts
    const found = all.find((one) => one.id === said) ?? all.filter((one) => said !== undefined && one.name.toLowerCase() === said.trim().toLowerCase()).reduce<Shortcut | 'many' | undefined>((one, other) => (one === undefined ? other : 'many'), undefined)
    if (found === 'many') throw new Error(`More than one shortcut is called ${String(said)}. Use the id from employees shortcuts.`)
    if (found === undefined) throw new Error(`No shortcut ${String(said)}. Use an id from employees shortcuts.`)
    return found
  }

  #shortcutChange(team: TeamDeps, args: readonly string[]): Change {
    const [action, said, ...rest] = args
    if (action === 'add' || action === 'edit') {
      const { words, flags } = options(rest, SHORTCUT_FLAGS)
      if (words.length !== 0 || said === undefined) throw new Error(action === 'add' ? 'Use employees shortcut add <employee-id|none> --name <name> --project <name> (--prompt <text>|--prompt-file <file>) [--target manager|task] [--goal <text>] [--every <when>|--cron <expr>] [--start-window-minutes <N|none>] [--provider <id>] [--model <id>] [--reasoning <effort>] [--mode manual|auto|plan].' : 'Use employees shortcut edit <shortcut-id> with any of --target, --name, --project, --prompt, --prompt-file, --goal, --every, --cron, --start-window-minutes, --provider, --model, --reasoning, --mode.')
      const was = action === 'edit' ? this.#shortcut(team, said) : undefined
      const target = flags.get('--target')
      if (target !== undefined && target !== 'manager' && target !== 'task') throw new Error('Use --target manager or task.')
      const manager = target === 'manager' || target === undefined && was?.target === 'manager'
      if (manager && action === 'add' && said !== 'none') throw new Error('Use none with --target manager; Manager is not an employee.')
      if (manager && ['--provider', '--model', '--reasoning', '--mode', '--goal'].some((flag) => flags.has(flag))) throw new Error('Manager uses its configured assistant, model and approvals.')
      const owner = action === 'add' && said !== 'none' ? this.#employee(said) : undefined
      if (owner?.archived === true) throw new Error('Choose an active employee or None.')
      const name = flags.get('--name')?.trim()
      const prompt = flags.get('--prompt')
      const project = flags.get('--project')
      if (name === '') throw new Error('Enter a name for the shortcut.')
      if (prompt !== undefined && prompt.trim() === '') throw new Error('Enter what the shortcut says.')
      if (flags.has('--every') && flags.has('--cron')) throw new Error('Choose one timetable: --every or --cron.')
      const every = flags.get('--every')
      const cronSaid = flags.get('--cron')?.trim()
      if (cronSaid !== undefined && !isCron(cronSaid)) throw new Error(`${cronSaid} is not a cron line: minute, hour, day of the month, month, day of the week.`)
      const timed = every === undefined ? cronSaid : every.trim().toLowerCase() === 'none' ? '' : everyCron(every)
      const windowSaid = flags.get('--start-window-minutes')?.trim().toLowerCase()
      if (windowSaid !== undefined && windowSaid !== 'none' && !/^\d+$/.test(windowSaid)) throw new Error('Enter a whole number from 1 to 1,440, or none.')
      const windowMinutes = windowSaid === undefined || windowSaid === 'none' ? undefined : Number(windowSaid)
      const selectedWindow = windowSaid === undefined ? timed === '' ? undefined : was?.startWindowMinutes : windowMinutes
      const window: Pick<Shortcut, 'startWindowMinutes'> = selectedWindow === undefined ? {} : { startWindowMinutes: selectedWindow }
      const cron = timed === undefined ? was?.cron : timed || undefined
      const recurrence = timed === undefined ? was?.recurrence : undefined
      const windowError = startWindowError({ ...window, ...(cron === undefined ? {} : { cron }), ...(recurrence === undefined ? {} : { recurrence }) })
      if (windowError !== undefined) throw new Error(windowError)
      const providerSaid = flags.get('--provider')
      const provider = providerSaid === undefined ? undefined : requestedProvider(providerSaid)
      if (providerSaid !== undefined && (provider === undefined || !assistantsIn(team.settings()).includes(provider))) throw new Error(`Assistant ${providerSaid} is not enabled. There are: ${assistantsIn(team.settings()).join(', ')}`)
      const mode = flags.get('--mode') as SessionMode | undefined
      if (mode !== undefined && !MODES.includes(mode)) throw new Error('Use --mode manual, auto or plan.')
      const model = flags.get('--model')?.trim()
      const goal = flags.get('--goal')?.trim()
      const reasoningSaid = flags.get('--reasoning')?.trim().toLowerCase()
      if (reasoningSaid !== undefined && reasoningSaid !== 'default' && !EFFORTS.includes(reasoningSaid as ReasoningEffort)) throw new Error(`Use --reasoning default, ${EFFORTS.join(', ')}.`)
      const reasoning = reasoningSaid === undefined ? undefined : reasoningSaid === 'default' ? '' : reasoningSaid as ReasoningEffort
      const root = project === undefined ? was?.root : team.project(project)
      if (reasoning !== undefined && !isCodexProvider(provider ?? was?.provider ?? assistantFor(team.settings(), root))) throw new Error('--reasoning is for Codex shortcuts only. Claude Code takes its effort from the model.')
      if (action === 'add' && (name === undefined || root === undefined || prompt === undefined)) throw new Error('A shortcut needs --name, --project and --prompt or --prompt-file.')
      if (was !== undefined && flags.size === 0) throw new Error('Nothing to change. Give any of --target, --name, --project, --prompt, --goal, --every, --cron, --start-window-minutes, --provider, --model, --reasoning or --mode.')
      const where = root === undefined ? '' : team.projectName(root)
      const when = timed === undefined ? undefined : timed === '' ? 'By hand' : describeCron(timed)
      const title = name ?? was?.name ?? ''
      const lines = was === undefined
        ? [`Add shortcut ${quoted(title)} ${owner === undefined ? 'with no employee' : `to ${owner.name}`}`, `${when ?? 'By hand'} in ${where}`, `Prompt: ${brief(prompt ?? '')}`, ...(goal === undefined || goal === '' ? [] : [`Goal: ${brief(goal)}`]), ...[provider === undefined ? undefined : `Assistant: ${provider}`, model === undefined ? undefined : `Model: ${model === '' ? 'Default' : model}`, reasoning === undefined ? undefined : `Reasoning: ${reasoning === '' ? 'Default' : reasoning}`, mode === undefined ? undefined : `Mode: ${mode}`].filter((one) => one !== undefined)]
        : [`Change shortcut ${quoted(was.name)}${name === undefined || name === was.name ? '' : `: name to ${quoted(name)}`}`, ...(when === undefined && project === undefined ? [] : [`${when ?? this.#shortcutWhen(was)} in ${where}`]), ...(prompt === undefined ? [] : [`Prompt: ${brief(prompt)}`]), ...(goal === undefined ? [] : [goal === '' ? 'Goal: none' : `Goal: ${brief(goal)}`]), ...[provider === undefined ? undefined : `Assistant: ${provider}`, model === undefined ? undefined : `Model: ${model === '' ? 'Default' : model}`, reasoning === undefined ? undefined : `Reasoning: ${reasoning === '' ? 'Default' : reasoning}`, mode === undefined ? undefined : `Mode: ${mode}`].filter((one) => one !== undefined)]
      if (target !== undefined) lines.push(`Target: ${manager ? 'Manager' : 'New task'}`)
      if (windowSaid !== undefined || timed !== undefined && window.startWindowMinutes !== undefined) lines.push(window.startWindowMinutes === undefined ? 'Start window: none' : describeStartWindow(window))
      return {
        lines,
        apply: async () => {
          const settings = team.settings()
          const current = was === undefined ? undefined : this.#shortcut(team, was.id)
          const { id: _id, since: _since, lastRun: _lastRun, lastSession: _lastSession, ...kept } = current ?? { id: '', since: 0, name: title, root: root ?? '', prompt: prompt ?? '', mode: settings.chatMode, on: false, provider: assistantFor(settings, root) }
          const { cron: _cron, recurrence: _recurrence, startWindowMinutes: _window, ...untimed } = kept
          const timedBase = timed === undefined ? kept : timed === '' ? { ...untimed, on: false } : { ...untimed, cron: timed, on: true, ...(kept.startWindowMinutes === undefined ? {} : { startWindowMinutes: kept.startWindowMinutes }) }
          const { startWindowMinutes: _startWindow, ...exactBase } = timedBase
          const windowBase = windowSaid === undefined ? timedBase : windowMinutes === undefined ? exactBase : { ...exactBase, startWindowMinutes: windowMinutes }
          const { goal: _goal, ...ungoaled } = windowBase
          const base = goal === undefined ? windowBase : goal === '' ? ungoaled : { ...ungoaled, goal }
          const { target: _target, ...taskBase } = base
          const { employeeId: _employee, ...unassigned } = taskBase
          const selectedBase = manager ? { ...unassigned, target: 'manager' as const } : target === 'task' ? taskBase : base
          const saved = team.saveShortcut({
            ...selectedBase,
            ...(current === undefined ? {} : { id: current.id }),
            ...(name === undefined ? {} : { name }),
            ...(root === undefined ? {} : { root }),
            ...(prompt === undefined ? {} : { prompt }),
            ...(provider === undefined ? {} : { provider }),
            ...(model === undefined ? {} : { model }),
            ...(mode === undefined ? {} : { mode }),
            ...(reasoning === undefined ? {} : { reasoning }),
            ...(owner === undefined ? {} : { employeeId: owner.id }),
          })
          return current === undefined ? `Added shortcut ${quoted(saved.name)} (${saved.id}).` : `Saved shortcut ${quoted(saved.name)}.`
        },
      }
    }
    if (action === 'pause' || action === 'resume' || action === 'remove' || action === 'run') {
      if (rest.length > 0) throw new Error(`Use employees shortcut ${action} <shortcut-id>.`)
      const one = this.#shortcut(team, said)
      if ((action === 'pause' || action === 'resume') && one.cron === undefined && one.recurrence === undefined) throw new Error(`${quoted(one.name)} runs by hand only, so there is no timetable to ${action}.`)
      if (action === 'run' && one.employeeId !== undefined && this.#employees.find((employee) => employee.id === one.employeeId)?.archived === true) throw new Error('This employee is archived. Restore it to run its shortcuts.')
      const verb = { pause: 'Pause', resume: 'Resume', remove: 'Remove', run: 'Run' }[action]
      return {
        lines: [`${verb} shortcut ${quoted(one.name)}${action === 'run' ? ` now in ${team.projectName(one.root)}` : ''}`],
        apply: async () => {
          const current = this.#shortcut(team, one.id)
          if (action === 'remove') { team.removeShortcut(current.id); return `Removed shortcut ${quoted(current.name)}.` }
          if (action === 'run') {
            const started = await team.runShortcut(current.id)
            if (started === undefined) throw new Error('Could not run. Check the assistant and folder.')
            return started === current.lastSession ? `${quoted(current.name)} is still running in ${started}.` : `Started ${started}.`
          }
          const { since: _since, lastRun: _lastRun, lastSession: _lastSession, ...draft } = current
          team.saveShortcut({ ...draft, on: action === 'resume' })
          return `${action === 'pause' ? 'Paused' : 'Resumed'} shortcut ${quoted(current.name)}.`
        },
      }
    }
    if (action === 'give') {
      const [to, ...more] = rest
      if (to === undefined || more.length > 0) throw new Error('Use employees shortcut give <shortcut-id> <employee-id|none>.')
      const one = this.#shortcut(team, said)
      const owner = to === 'none' ? undefined : this.#employee(to)
      if (owner?.archived === true) throw new Error('Choose an active employee or None.')
      return {
        lines: [owner === undefined ? `Take shortcut ${quoted(one.name)} from ${this.#owner(one.employeeId)}, leaving it with no employee` : `Give shortcut ${quoted(one.name)} to ${owner.name}`],
        apply: async () => {
          const { since: _since, lastRun: _lastRun, lastSession: _lastSession, employeeId: _employeeId, target: _target, ...draft } = this.#shortcut(team, one.id)
          team.saveShortcut({ ...draft, ...(owner === undefined ? {} : { employeeId: owner.id }) })
          return owner === undefined ? `Shortcut ${quoted(one.name)} has no employee now.` : `Gave shortcut ${quoted(one.name)} to ${owner.name}.`
        },
      }
    }
    throw new Error('Use employees shortcut add|edit|pause|resume|remove|give|run.')
  }

  async #managerMemory(id: Employee['id'], cursor?: string): Promise<string> {
    let characters = 2000
    let sourceLimit = 5
    for (;;) {
      const page = await this.memory(id, cursor, characters, sourceLimit)
      const conversations = page.conversations.map((source) => ({
        ...source,
        session: { ...source.session, root: source.session.root.slice(0, 256), title: source.session.title.slice(0, 128) },
        ...(source.session.root.length > 256 || source.session.title.length > 128 ? { metadataTruncated: true } : {}),
        items: source.items.map((message) => ({ kind: message.kind, id: message.id, text: message.text, ...(message.at === undefined ? {} : { at: message.at }) })),
        ...(source.unavailable === undefined ? {} : { unavailable: source.unavailable.slice(0, 256) }),
      }))
      const result = JSON.stringify({ employeeId: page.employee.id, conversations, availability: page.availability, ...(page.next === undefined ? {} : { next: page.next }) })
      if (result.length < 20_000) return result
      if (sourceLimit > 1) sourceLimit = 1
      else if (characters > 1) characters = Math.max(1, Math.floor(characters / 2))
      else throw new Error('This source has unusually large identifiers. Read its complete employee memory through the worker CLI.')
    }
  }

  async memory(id: Employee['id'], cursor?: string, characters = MESSAGE_PAGE, sourceLimit = SOURCE_PAGE): Promise<EmployeeMemory> {
    const employee = this.get(id)
    const sources = await this.#deps.sources(id)
    let continuation: MemoryCursor | undefined
    if (cursor !== undefined) {
      try { continuation = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as MemoryCursor }
      catch { throw new Error('This conversation cursor is invalid. Read the employee history again.') }
      if (typeof continuation !== 'object' || continuation === null || continuation.employee !== id || typeof continuation.source !== 'string' || !Number.isInteger(continuation.item) || continuation.item < 0 || !Number.isInteger(continuation.offset) || continuation.offset < 0) throw new Error('This conversation cursor is invalid. Read the employee history again.')
    }
    const start = continuation === undefined ? 0 : sources.findIndex((one) => one.session.id === continuation.source)
    if (start < 0) throw new Error('The assigned conversations changed. Read the employee history again.')
    const conversations: EmployeeConversation[] = []
    let remaining = characters
    let remainingItems = ITEM_PAGE
    let next: string | undefined
    const encode = (source: ChatSession['id'], item: number, offset: number): string => Buffer.from(JSON.stringify({ employee: id, source, item, offset } satisfies MemoryCursor)).toString('base64url')
    for (let at = start; at < sources.length && conversations.length < sourceLimit; at++) {
      const source = sources[at]
      if (source === undefined) break
      const items = source.unavailable === undefined ? await this.#deps.items(source.session).catch(() => undefined) : undefined
      if (items === undefined) conversations.push({ ...source, items: [], unavailable: source.unavailable ?? 'The conversation is unavailable from its provider or host.' })
      else {
        const said = items.filter((item): item is Extract<SessionItem, { kind: 'mine' | 'theirs' }> => item.kind === 'mine' || item.kind === 'theirs')
        const selected: EmployeeConversation['items'][number][] = []
        let more = false
        let attachmentsOmitted = false
        const first = at === start ? continuation?.item ?? 0 : 0
        for (let item = first; item < said.length; item++) {
          const message = said[item]
          if (message === undefined) break
          const offset = at === start && item === first ? continuation?.offset ?? 0 : 0
          const text = message.text.slice(offset, offset + remaining)
          if (message.kind === 'mine') {
            const { images, ...messageText } = message
            selected.push({ ...messageText, text })
            if (images !== undefined && images.length > 0) attachmentsOmitted = true
          } else selected.push({ ...message, text })
          remaining -= text.length
          remainingItems--
          if (offset + text.length < message.text.length) { next = encode(source.session.id, item, offset + text.length); more = true; break }
          if ((remaining === 0 || remainingItems === 0) && item + 1 < said.length) { next = encode(source.session.id, item + 1, 0); more = true; break }
        }
        conversations.push({ ...source, items: selected, ...(more ? { more: true } : {}), ...(attachmentsOmitted ? { attachmentsOmitted: true } : {}) })
      }
      if (next !== undefined) break
      const following = sources[at + 1]
      if (following !== undefined && (remaining === 0 || remainingItems === 0 || conversations.length === sourceLimit)) { next = encode(following.session.id, 0, 0); break }
    }
    const missing = conversations.filter((one) => one.unavailable !== undefined).length
    return { employee, conversations, availability: missing === 0 ? 'complete' : missing === conversations.length ? 'unavailable' : 'partial', ...(next === undefined ? {} : { next }) }
  }
}
