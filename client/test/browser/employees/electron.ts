import { DEFAULT_MANAGER_CONFIG } from '../../../src/shared/manager'
import { contextBridge, webUtils, ipcRenderer as native, fixture as original } from '../conversation-export/electron'
import type { ChatSession, SessionMessage, Shortcut, ShortcutDraft } from '../../../src/shared/api'
import type { Employee, EmployeeDraft, EmployeeMemory, EmployeesView } from '../../../src/shared/employees'
export { contextBridge, webUtils }

const firstFolder = '/Fixtures/GeckIt export'
const secondFolder = '/Fixtures/Marketing'
const tatiana: Employee = { id: 'e-tatiana', name: 'Татьяна', role: 'Продвижение', description: 'Create Instagram reels. Read previous decisions before choosing a format.', avatar: 'employee-01', archived: false, revision: 1 }
const cto: Employee = { ...tatiana, id: 'e-cto', name: 'Alex CTO', role: 'Architecture', description: 'Review technical decisions and implementation.', avatar: 'employee-02' }
const archived: Employee = { ...tatiana, id: 'e-archived', name: 'Past employee with a deliberately very long name', role: 'Previous work', archived: true, avatar: 'employee-03' }
const makeSession = (id: string, root: string, title: string, employeeId?: string): ChatSession => ({ id, root, title, ...(employeeId === undefined ? {} : { employeeId }), state: 'idle', stands: 'Synthetic fixture history', at: 1_793_238_000_000, mode: 'manual', here: true, status: 'todo' })

export const fixture = {
  employees: [tatiana, cto, archived],
  sessions: [makeSession('reel', firstFolder, 'New Instagram reel', tatiana.id), makeSession('architecture', firstFolder, 'Review architecture', cto.id), makeSession('unassigned', secondFolder, 'Unassigned task'), makeSession('previous', secondFolder, 'Previous reel format', tatiana.id), makeSession('past', firstFolder, 'Archived role task', archived.id)],
  sends: [] as SessionMessage[],
  assignments: [] as { readonly id: ChatSession['id']; readonly employeeId: Employee['id'] | null }[],
  failSave: false,
  failAssignment: false,
  failGuide: false,
  memory: 'complete' as EmployeeMemory['availability'],
}
if (new URLSearchParams(location.search).has('large')) fixture.sessions = Array.from({ length: 800 }, (_, index) => makeSession(`large-${index}`, index % 2 === 0 ? firstFolder : secondFolder, `Employee task ${index + 1}`, index % 3 === 0 ? tatiana.id : index % 3 === 1 ? cto.id : undefined))
const STORAGE = new URLSearchParams(location.search).has('large') ? 'employees-renderer-large-fixture' : 'employees-renderer-fixture'
const restored = localStorage.getItem(STORAGE)
if (restored !== null) {
  const stored = JSON.parse(restored) as Pick<typeof fixture, 'employees' | 'sessions'>
  fixture.employees = stored.employees
  fixture.sessions = stored.sessions
}
const persist = (): void => localStorage.setItem(STORAGE, JSON.stringify({ employees: fixture.employees, sessions: fixture.sessions }))
const view = (): EmployeesView => ({ employees: fixture.employees, ...(fixture.failGuide ? { error: 'Employee saved. Assistant instructions could not be updated.' } : {}) })
type EventValue = Parameters<NonNullable<Parameters<typeof native.on>[1]>>[1] | EmployeesView
type Listener = (event: Event, value: EventValue) => void
const listeners = new Map<string, Set<Listener>>()
const emit = (channel: string, value: EventValue): void => { for (const listener of listeners.get(channel) ?? []) listener(new Event(channel), value) }
const changed = (): EmployeesView => { persist(); const next = view(); emit('employees:changed', next); return next }
export function snapshot(): void { emit('chat:sessions', structuredClone(fixture.sessions)) }
export function externalEdit(): void {
  fixture.employees = fixture.employees.map((one) => one.id === tatiana.id ? { ...one, revision: one.revision + 1, role: `${one.role} updated` } : one)
  changed()
}
let managerInstructions = ''
export const ipcRenderer = {
  invoke: async (channel: string, first?: Parameters<typeof native.invoke>[1] | EmployeeDraft | number | null, second?: Parameters<typeof native.invoke>[2] | number | null): Promise<Awaited<ReturnType<typeof native.invoke>> | EmployeesView | EmployeeMemory> => {
    if (channel === 'employees:list') return view()
    if (channel === 'employees:save') {
      if (fixture.failSave) throw new Error('Synthetic save failure')
      if (typeof first !== 'object' || first === null || !('avatar' in first)) throw new Error('Expected employee draft')
      const draft = first
      const before = fixture.employees.find((one) => one.id === draft.id)
      if (draft.id !== undefined && before === undefined) throw new Error('Employee is no longer available')
      if (before !== undefined && before.revision !== draft.revision) throw new Error('Stale employee')
      const employee: Employee = { ...draft, name: draft.name.trim(), id: draft.id ?? crypto.randomUUID(), revision: (before?.revision ?? 0) + 1, archived: before?.archived ?? false }
      fixture.employees = [...fixture.employees.filter((one) => one.id !== employee.id), employee]
      return changed()
    }
    if (channel === 'employees:archive' || channel === 'employees:restore') {
      if (fixture.failSave) throw new Error('Synthetic save failure')
      fixture.employees = fixture.employees.map((one) => one.id === first ? { ...one, archived: channel === 'employees:archive', revision: one.revision + 1 } : one)
      return changed()
    }
    if (channel === 'employees:retryInstructions') { fixture.failGuide = false; return changed() }
    if (channel === 'employees:memory') {
      const employee = fixture.employees.find((one) => one.id === first)
      if (employee === undefined) throw new Error('Employee missing')
      if (fixture.memory === 'unavailable') return { employee, conversations: [], availability: fixture.memory }
      const sessions = [...fixture.sessions, makeSession('hidden-reel', secondFolder, 'Hidden past reel', tatiana.id)].filter((one) => one.employeeId === employee.id)
      const all = second === undefined ? sessions.slice(0, 1) : sessions.slice(1)
      return { employee, conversations: all.map((session) => ({ session, hidden: session.id === 'hidden-reel', items: [{ kind: 'mine' as const, id: `${session.id}-request`, text: 'Choose a reusable format.' }, { kind: 'theirs' as const, id: `${session.id}-decision`, text: 'Previous decision: begin with the actual screen, then one short explanation. This is fixture history.' }] })), availability: fixture.memory, ...(second === undefined && sessions.length > 1 ? { next: 'second-page' } : {}) }
    }
    if (channel === 'chat:list') return fixture.sessions
    if (channel === 'chat:assignEmployee') {
      if (fixture.failAssignment) throw new Error('Synthetic assignment failure')
      if (typeof first !== 'string' || (typeof second !== 'string' && second !== null)) throw new Error('Expected assignment')
      fixture.assignments.push({ id: first, employeeId: second })
      fixture.sessions = fixture.sessions.map((one) => {
        if (one.id !== first) return one
        const { employeeId: _old, ...session } = one
        return second === null ? session : { ...session, employeeId: second }
      })
      persist(); emit('chat:sessions', fixture.sessions)
      return undefined
    }
    if (channel === 'chat:send' || channel === 'chat:schedule') {
      if (typeof first !== 'object' || first === null || !('text' in first) || !('mode' in first)) throw new Error('Expected session message')
      const message = first
      fixture.sends.push(message)
      const prefix = message.provider === undefined || message.provider === 'claude' ? '' : `${message.provider}:`
      const session = { ...makeSession(`${prefix}${crypto.randomUUID()}`, message.root, message.text, message.employeeId), ...(message.provider === undefined ? {} : { provider: message.provider }) }
      fixture.sessions = [...fixture.sessions, session]
      persist(); emit('chat:sessions', fixture.sessions)
      return session.id
    }
    if (channel === 'shortcuts:save' && typeof first === 'object' && first !== null && 'prompt' in first) {
      const draft = first as ShortcutDraft
      const all = (await native.invoke('settings:get') as { readonly shortcuts: readonly Shortcut[] }).shortcuts
      const before = all.find((one) => one.id === draft.id)
      const saved: Shortcut = { ...draft, id: draft.id ?? crypto.randomUUID(), since: before?.since ?? Date.now(), ...(before?.lastRun === undefined ? {} : { lastRun: before.lastRun }), ...(before?.lastSession === undefined ? {} : { lastSession: before.lastSession }) }
      await native.invoke('settings:set', { shortcuts: before === undefined ? [...all, saved] : all.map((one) => one.id === saved.id ? saved : one) })
      return saved
    }
    if (channel === 'shortcuts:run' && typeof first === 'string') {
      const all = (await native.invoke('settings:get') as { readonly shortcuts: readonly Shortcut[] }).shortcuts
      const one = all.find((each) => each.id === first)
      if (one === undefined) return undefined
      const session = makeSession(crypto.randomUUID(), one.root, one.name, one.employeeId)
      fixture.sessions = [...fixture.sessions, session]
      persist(); emit('chat:sessions', fixture.sessions)
      return session.id
    }
    if (channel === 'manager:view') return { ...(await native.invoke(channel) as object), config: { ...DEFAULT_MANAGER_CONFIG, instructions: managerInstructions } }
    if (channel === 'manager:configure' && typeof first === 'object' && first !== null && 'instructions' in first && typeof first.instructions === 'string') {
      managerInstructions = first.instructions
      const next = await ipcRenderer.invoke('manager:view')
      emit('manager:view', next)
      return next
    }
    if (channel === 'chat:items') return [{ kind: 'mine', id: 'fixture-request', text: 'Synthetic conversation. No provider request was made.' }, { kind: 'theirs', id: 'fixture-answer', text: 'Use Employee in the header to assign or inspect this task.' }]
    if (typeof first === 'number' || first === null || (typeof first === 'object' && 'avatar' in first) || typeof second === 'number' || second === null) throw new Error(`Unconfigured fixture IPC ${channel}`)
    return native.invoke(channel, first, second)
  },
  send: native.send,
  on: (channel: string, listener: Listener): void => {
    const held = listeners.get(channel) ?? new Set<Listener>()
    held.add(listener); listeners.set(channel, held)
    native.on(channel, listener)
  },
  off: (channel: string, listener: Listener): void => { listeners.get(channel)?.delete(listener); native.off(channel, listener) },
}
original.destinations = []
const shortcuts: Shortcut[] = [
  { id: 's-reel', name: 'Weekly reel', root: secondFolder, prompt: 'Make this week\'s reel.', mode: 'auto', employeeId: tatiana.id, cron: '0 10 * * 1', on: true, since: 1_793_238_000_000, lastRun: 1_793_238_000_000, lastSession: 'reel' },
  { id: 's-ideas', name: 'Reel ideas', root: secondFolder, prompt: 'Five ideas.', mode: 'auto', employeeId: tatiana.id, on: true, since: 1_793_238_000_000 },
  { id: 's-review', name: 'Review open PRs', root: firstFolder, prompt: 'Review open PRs.', mode: 'manual', employeeId: cto.id, cron: '0 9 * * *', on: false, since: 1_793_238_000_000 },
  { id: 's-old', name: 'Old report', root: firstFolder, prompt: 'Report.', mode: 'auto', employeeId: archived.id, cron: '0 8 * * 5', on: true, since: 1_793_238_000_000 },
  { id: 's-loose', name: 'Clean downloads', root: firstFolder, prompt: 'Clean.', mode: 'auto', on: true, since: 1_793_238_000_000 },
]
await native.invoke('settings:set', { projects: [firstFolder, secondFolder], chatProjects: [], chatView: 'board', shortcuts })
