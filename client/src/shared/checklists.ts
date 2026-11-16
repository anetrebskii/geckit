/** How GeckIt decides an item holds: the assistant's word, a command, another model, or the person. */
export type ChecklistCheck = 'none' | 'command' | 'review' | 'person'

export interface ChecklistItem {
  readonly id: string
  /** What is true when this step is done. */
  readonly title: string
  /** How to prove it, and what must not change. */
  readonly description?: string
  readonly check: ChecklistCheck
  /** Run for a command check; passes when it exits with 0. */
  readonly command?: string
  /** Checked again before the task moves to In review. */
  readonly final?: boolean | undefined
  /** In a task: passed, or met and waiting for the person's approval. Saved checklists have none. */
  readonly state?: ItemState | undefined
}

export type ItemState = 'passed' | 'approval'

/** A saved checklist, shared or belonging to one folder. */
export interface Checklist {
  readonly id: string
  readonly name: string
  /** The folder it belongs to; none is shared. */
  readonly root?: string
  /** Filled into New task for its folder. One per folder. */
  readonly isDefault?: boolean | undefined
  readonly items: readonly ChecklistItem[]
}

/** What a new task carries: typed items, or a copy of a saved checklist. */
export interface TaskChecklist {
  readonly from?: { readonly id: string; readonly name: string }
  readonly items: readonly ChecklistItem[]
  /** The items marked final were checked again after the last one passed. */
  readonly rechecked?: boolean | undefined
}

export const CHECKLIST_WARN_AT = 3_500
export const CHECKLIST_HINT_AT = 10

export const CHECK_LABELS: Readonly<Record<ChecklistCheck, string>> = { none: 'None', command: 'Command', review: 'Review', person: 'Person' }

export const newItem = (title = ''): ChecklistItem => ({ id: crypto.randomUUID(), title, check: 'none' })

const filled = (items: readonly ChecklistItem[]): readonly ChecklistItem[] => items.filter((one) => one.title.trim() !== '')

const PERSON_PROOF = 'check: ready for the person to approve; do not ask them, GeckIt does'

/** A goal set for a person's item, in today's words or the earlier ones that told the assistant to ask: no goal check can see it met. */
export const isPersonGoal = (condition: string): boolean => condition.trim().endsWith(PERSON_PROOF) || condition.trim().endsWith('check: stop and ask the person to approve before going on')

/** What the assistant is sent for a person's item: work it to ready, stop, and leave the approval to GeckIt. */
export const personTurn = (item: ChecklistItem): string => `Next on the checklist: ${[sentence(item.title), sentence(item.description ?? '')].filter((one) => one !== '').join(' - ')}. Work on it until it is ready for the person to review, then stop and say what is ready. Do not ask them to approve it: GeckIt asks them, and any change they want comes as their next message.`

const proof = (item: ChecklistItem): string => {
  if (item.check === 'command' && item.command?.trim()) return `check: \`${item.command.trim()}\` exits with 0`
  if (item.check === 'person') return PERSON_PROOF
  if (item.check === 'review') return 'check: show the evidence in the conversation'
  return ''
}

const sentence = (text: string): string => text.trim().replace(/\s+/g, ' ').replace(/[.;\s]+$/, '')

/** The one-line goal the assistant gets; a single plain item is exactly what a goal used to be. */
export function checklistGoal(checklist: TaskChecklist | undefined): string {
  const items = filled(checklist?.items ?? [])
  if (items.length === 0) return ''
  const [only] = items
  if (items.length === 1 && only !== undefined && (only.description ?? '').trim() === '' && only.check === 'none') return sentence(only.title)
  const name = checklist?.from === undefined ? '' : ` of ${checklist.from.name}`
  const steps = items.map((item, at) => {
    const parts = [sentence(item.title), sentence(item.description ?? ''), proof(item)].filter((one) => one !== '')
    return `(${String(at + 1)}) ${parts.join(' - ')}`
  })
  const again = items.flatMap((item, at) => (item.final === true && item.check !== 'person' ? [`(${String(at + 1)})`] : []))
  return [
    `All ${String(items.length)} items${name} hold, in this order, one at a time: ${steps.join('; ')}.`,
    `After each item holds, print "[n/${String(items.length)} passed] <item>" with its evidence.`,
    again.length === 0 ? '' : `Before finishing, check ${again.join(', ')} again.`,
  ].filter((one) => one !== '').join(' ')
}

/** Saved checklists offered for a folder: its own first, then the shared ones. */
export function checklistsFor(all: readonly Checklist[], root: string): { readonly folder: readonly Checklist[]; readonly shared: readonly Checklist[] } {
  return { folder: all.filter((one) => root !== '' && one.root === root), shared: all.filter((one) => one.root === undefined) }
}

export const defaultChecklist = (all: readonly Checklist[], root: string): Checklist | undefined =>
  root === '' ? undefined : all.find((one) => one.root === root && one.isDefault === true)

/** A task's own copy, with new ids, so editing it never edits the saved one. */
export const copyChecklist = (checklist: Checklist): TaskChecklist => ({
  from: { id: checklist.id, name: checklist.name },
  items: checklist.items.map(({ state: _state, ...one }) => ({ ...one, id: crypto.randomUUID() })),
})

const CHECK_KINDS: readonly ChecklistCheck[] = ['none', 'command', 'review', 'person']
const MAX_ITEMS = 50

/** Items typed on the command line: a JSON array of titles, or of objects with title, description, check, command and final. */
export function checklistItems(value: unknown): ChecklistItem[] {
  let list = value
  if (typeof value === 'string') {
    try { list = JSON.parse(value) as unknown } catch { throw new Error('Items must be a JSON array of titles or of {title, description, check, command, final}.') }
  }
  if (!Array.isArray(list) || list.length === 0) throw new Error('Items must be a nonempty JSON array of titles or of {title, description, check, command, final}.')
  if (list.length > MAX_ITEMS) throw new Error(`At most ${String(MAX_ITEMS)} items.`)
  return list.map((one: unknown, at): ChecklistItem => {
    const n = String(at + 1)
    if (typeof one === 'string') {
      if (one.trim() === '') throw new Error(`Item ${n} has no title.`)
      return { id: crypto.randomUUID(), title: one.trim(), check: 'none' }
    }
    if (one === null || typeof one !== 'object' || Array.isArray(one)) throw new Error(`Item ${n} must be a title or an object with a title.`)
    const item = one as Record<string, unknown>
    const unknownKey = Object.keys(item).find((key) => !['id', 'title', 'description', 'check', 'command', 'final'].includes(key))
    if (unknownKey !== undefined) throw new Error(`Item ${n}: unknown field ${unknownKey}. Use title, description, check, command and final.`)
    if (typeof item['title'] !== 'string' || item['title'].trim() === '') throw new Error(`Item ${n} has no title.`)
    if (item['description'] !== undefined && typeof item['description'] !== 'string') throw new Error(`Item ${n}: description must be text.`)
    if (item['command'] !== undefined && typeof item['command'] !== 'string') throw new Error(`Item ${n}: command must be text.`)
    if (item['final'] !== undefined && typeof item['final'] !== 'boolean') throw new Error(`Item ${n}: final must be true or false.`)
    const command = typeof item['command'] === 'string' && item['command'].trim() !== '' ? item['command'].trim() : undefined
    const check = item['check'] ?? (command === undefined ? 'none' : 'command')
    if (typeof check !== 'string' || !CHECK_KINDS.includes(check as ChecklistCheck)) throw new Error(`Item ${n}: check must be ${CHECK_KINDS.join(', ')}.`)
    if (check === 'command' && command === undefined) throw new Error(`Item ${n}: a command check needs a command.`)
    const description = typeof item['description'] === 'string' && item['description'].trim() !== '' ? item['description'].trim() : undefined
    return {
      id: crypto.randomUUID(),
      title: item['title'].trim(),
      ...(description === undefined ? {} : { description }),
      check: check as ChecklistCheck,
      ...(check === 'command' && command !== undefined ? { command } : {}),
      ...(item['final'] === true ? { final: true } : {}),
    }
  })
}

/** A saved checklist by id, or by name among the folder's own and then the shared ones. */
export function findChecklist(all: readonly Checklist[], root: string, named: string): Checklist | undefined {
  const said = named.trim()
  const byId = all.find((one) => one.id === said)
  if (byId !== undefined) return byId
  const offered = checklistsFor(all, root)
  const lower = said.toLowerCase()
  return offered.folder.find((one) => one.name.toLowerCase() === lower) ?? offered.shared.find((one) => one.name.toLowerCase() === lower)
}

export interface GoalAsked {
  readonly goal?: string | undefined
  readonly checklist?: string | undefined
  readonly items?: unknown
}

/** What a task started from the command line works to: its goal, a copy of a saved checklist, typed items, or the folder's default. */
export function taskPlan(all: readonly Checklist[], root: string, asked: GoalAsked): { readonly goal?: string; readonly checklist?: TaskChecklist } {
  const goal = typeof asked.goal === 'string' && asked.goal.trim() !== '' ? asked.goal.trim() : undefined
  const named = typeof asked.checklist === 'string' && asked.checklist.trim() !== '' ? asked.checklist.trim() : undefined
  const typed = asked.items !== undefined && asked.items !== null && asked.items !== ''
  if ([goal !== undefined, named !== undefined, typed].filter(Boolean).length > 1) throw new Error('Give one of goal, checklist or items, not several.')
  if (goal !== undefined) return { goal }
  if (typed) return { checklist: { items: checklistItems(asked.items) } }
  if (named !== undefined) {
    const found = findChecklist(all, root, named)
    if (found === undefined) {
      const offered = checklistsFor(all, root)
      const names = [...offered.folder, ...offered.shared].map((one) => one.name)
      throw new Error(`No checklist ${named} for this folder. ${names.length === 0 ? 'There are none; pass items or create one with checklists add.' : `There are: ${names.join(', ')}`}`)
    }
    return { checklist: copyChecklist(found) }
  }
  const fallback = defaultChecklist(all, root)
  return fallback === undefined ? {} : { checklist: copyChecklist(fallback) }
}

/** A shortcut's checklist: its own, or the goal an older shortcut kept as one item. */
export function shortcutChecklist(shortcut: { readonly checklist?: TaskChecklist | undefined; readonly goal?: string | undefined }): TaskChecklist | undefined {
  const kept = shortcut.checklist === undefined ? undefined : taskChecklist({ ...shortcut.checklist, items: shortcut.checklist.items.map(({ state: _state, ...one }) => one) })
  if (kept !== undefined && kept.items.length > 0) return kept
  const goal = shortcut.goal?.trim() ?? ''
  return goal === '' ? undefined : { items: [{ ...newItem(goal), id: 'goal' }] }
}

/** What one item says as a goal: the result, how to prove it, and its check. A single plain item reads as a plain goal. */
export const itemCondition = (item: ChecklistItem): string => [sentence(item.title), sentence(item.description ?? ''), proof(item)].filter((one) => one !== '').join(' - ')

/** The item worked on now: the first not yet passed. */
export const currentItem = (checklist: TaskChecklist): ChecklistItem | undefined => filled(checklist.items).find((one) => one.state !== 'passed')

/** Items to confirm once more after the last one; a person's approval is not the assistant's to confirm. */
const finals = (checklist: TaskChecklist): readonly ChecklistItem[] => filled(checklist.items).filter((one) => one.final === true && one.check !== 'person')

const recheckCondition = (checklist: TaskChecklist): string => `Still true after the later work: ${finals(checklist).map(itemCondition).join('; ')}`

/** The goal to set next, or none while an item waits for the person or once all hold. */
export function nextCondition(checklist: TaskChecklist): string | undefined {
  const current = currentItem(checklist)
  if (current !== undefined) return current.state === 'approval' ? undefined : itemCondition(current)
  if (checklist.rechecked === true || finals(checklist).length === 0 || filled(checklist.items).length < 2) return undefined
  return recheckCondition(checklist)
}

/** A goal that held: the item it was set for passes, or waits for the person when its check is theirs. Undefined when it was not this checklist's goal. */
export function checklistMet(checklist: TaskChecklist, condition: string): TaskChecklist | undefined {
  const current = currentItem(checklist)
  if (current !== undefined && current.state !== 'approval' && itemCondition(current) === condition.trim()) {
    const state: ItemState = current.check === 'person' ? 'approval' : 'passed'
    return { ...checklist, items: checklist.items.map((one) => (one.id === current.id ? { ...one, state } : one)) }
  }
  if (current === undefined && checklist.rechecked !== true && finals(checklist).length > 0 && recheckCondition(checklist) === condition.trim()) return { ...checklist, rechecked: true }
  return undefined
}

/** The item a task waits on the person to approve, if it does. */
export const awaitingApproval = (checklist: TaskChecklist | undefined): ChecklistItem | undefined => {
  const now = checklist === undefined ? undefined : currentItem(checklist)
  return now?.state === 'approval' ? now : undefined
}

export const checklistDone = (checklist: TaskChecklist): boolean => filled(checklist.items).length > 0 && currentItem(checklist) === undefined && nextCondition(checklist) === undefined

/** How far a task is: passed items of all. */
export const checklistProgress = (checklist: TaskChecklist): { readonly passed: number; readonly all: number } => {
  const items = filled(checklist.items)
  return { passed: items.filter((one) => one.state === 'passed').length, all: items.length }
}

/** Said with the first message of a task with several items, so the assistant knows what comes after the goal it has now. */
export function checklistContext(checklist: TaskChecklist): string {
  const items = filled(checklist.items)
  if (items.length < 2) return ''
  const person = items.some((item) => item.check === 'person') ? ' For an item the person approves, stop when it is ready and say so; do not ask them to approve it, GeckIt asks them and sends any changes as a message.' : ''
  return [`Checklist${checklist.from === undefined ? '' : ` (${checklist.from.name})`}, worked one item at a time: GeckIt sets each item as the goal in turn and ticks it when the goal is met.${person}`, ...items.map((item, at) => `${String(at + 1)}. ${itemCondition(item)}`)].join('\n')
}

/** A task's checklist as kept: filled items only, a typed one plain. */
export const taskChecklist = (checklist: TaskChecklist): TaskChecklist => ({ ...(checklist.from === undefined ? {} : { from: checklist.from }), items: filled(checklist.items).map((one) => ({ ...one, title: one.title.trim() })), ...(checklist.rechecked === true ? { rechecked: true } : {}) })
