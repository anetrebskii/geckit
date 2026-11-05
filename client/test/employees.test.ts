import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { Employees } from '../src/main/employees'
import { memoryNotes, Sessions } from '../src/main/sessions'
import type { SessionsDeps } from '../src/main/sessions'
import type { Employee, EmployeeConversation, EmployeeDraft, EmployeeMemory } from '../src/shared/employees'
import type { SessionItem } from '../src/shared/api'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import { ManagerOperations, managerReadOnly } from '../src/main/manager-operations'
import { managerCommand } from '../src/cli/manage'

const cleanup: (() => void)[] = []
afterEach(() => { for (const close of cleanup.splice(0)) close() })
const directory = (): string => {
  const folder = mkdtempSync(join(tmpdir(), 'geckit-employees-'))
  cleanup.push(() => rmSync(folder, { recursive: true, force: true }))
  return folder
}
const draft: EmployeeDraft = { name: ' Tatiana ', role: 'Promotion', description: 'Remember earlier Instagram decisions.', avatar: 'employee-01' }
const source = (id: string): Omit<EmployeeConversation, 'items'> => ({ session: { id, root: '/project', title: id, at: 10 }, hidden: false })

function catalog(over: Partial<ConstructorParameters<typeof Employees>[0]> = {}) {
  const folder = directory()
  const employee = new Employees({ directory: folder, sync: async () => undefined, assignment: () => undefined, sources: async () => [], items: async () => [], ...over })
  return { employee, folder }
}

const first = (employees: readonly Employee[]): Employee => {
  const employee = employees[0]
  if (employee === undefined) throw new Error('Missing employee test fixture')
  return employee
}

describe('durable employee catalog', () => {
  it('saves, reopens, edits, archives and restores stable identity and portrait', async () => {
    const f = catalog()
    const employee = first((await f.employee.save(draft)).employees)
    expect(employee).toMatchObject({ ...draft, name: 'Tatiana', archived: false, revision: 1 })
    const restarted = catalog({ directory: f.folder }).employee
    expect(restarted.list().employees).toEqual([employee])
    await restarted.save({ ...employee, role: 'Marketing' })
    await restarted.archive(employee.id, 2)
    expect(restarted.get(employee.id)).toMatchObject({ archived: true, avatar: draft.avatar, revision: 3 })
    expect(() => restarted.active(employee.id)).toThrow('archived')
    await restarted.archive(employee.id, 3, false)
    expect(restarted.active(employee.id)).toMatchObject({ archived: false, id: employee.id, revision: 4 })
  })

  it('rejects empty names, invalid portraits and stale edits without losing current values', async () => {
    const f = catalog()
    await expect(f.employee.save({ ...draft, name: ' ' })).rejects.toThrow('Enter a name')
    await expect(f.employee.save({ ...draft, avatar: 'https://arbitrary/avatar.svg' })).rejects.toThrow('portrait')
    const employee = first((await f.employee.save(draft)).employees)
    await f.employee.save({ ...employee, name: 'Updated' })
    await expect(f.employee.save({ ...employee, name: 'Stale' })).rejects.toThrow('another window')
    await expect(f.employee.archive(employee.id, 1)).rejects.toThrow('another window')
    expect(f.employee.get(employee.id).name).toBe('Updated')
  })

  it('keeps disk and memory intact when the atomic catalog write fails', async () => {
    const f = catalog()
    const employee = first((await f.employee.save(draft)).employees)
    const before = readFileSync(join(f.folder, 'settings.json'), 'utf8')
    mkdirSync(join(f.folder, 'settings.json.new'))
    await expect(f.employee.save({ ...employee, name: 'Lost' })).rejects.toThrow()
    expect(f.employee.get(employee.id)).toEqual(employee)
    expect(readFileSync(join(f.folder, 'settings.json'), 'utf8')).toBe(before)
  })

  it('reports saved catalog independently from failed instruction sync and retry creates no duplicate', async () => {
    let failing = true
    const f = catalog({ sync: async () => { if (failing) throw new Error('Assistant instructions could not be updated.') } })
    const saved = await f.employee.save(draft)
    expect(saved.error).toContain('instructions')
    expect(saved.employees).toHaveLength(1)
    failing = false
    const retried = await f.employee.retryInstructions()
    expect(retried.error).toBeUndefined()
    expect(retried.employees).toEqual(saved.employees)
  })
})

describe('source conversation memory', () => {
  it('pages every source and every character of a huge message without tools or silent truncation', async () => {
    const huge = 'Earlier decision. '.repeat(3100)
    const sources = Array.from({ length: 12 }, (_, index) => source(`chat-${String(index)}`))
    const f = catalog({ sources: async () => sources, items: async (one) => [{ kind: 'did', id: 'tool', what: 'Private tool result' }, { kind: 'mine', id: 'mine', text: one.id === 'chat-0' ? huge : one.id }] })
    const employee = first((await f.employee.save(draft)).employees)
    let page: EmployeeMemory = await f.employee.memory(employee.id)
    expect(page.conversations[0]?.more).toBe(true)
    expect(page.conversations.flatMap((one) => one.items).map((one) => one.text).join('')).toHaveLength(20_000)
    let reconstructed = ''
    const seen = new Set<string>()
    for (;;) {
      expect(page.conversations.length).toBeLessThanOrEqual(10)
      for (const conversation of page.conversations) {
        seen.add(conversation.session.id)
        expect(conversation.items.every((item) => item.kind === 'mine' || item.kind === 'theirs')).toBe(true)
        if (conversation.session.id === 'chat-0') reconstructed += conversation.items.map((item) => item.text).join('')
      }
      if (page.next === undefined) break
      page = await f.employee.memory(employee.id, page.next)
    }
    expect(reconstructed).toBe(huge)
    expect(seen.size).toBe(12)
    await expect(f.employee.memory(employee.id, 'not-a-cursor')).rejects.toThrow('cursor')
  })

  it('keeps the Manager memory page and its cursor below the existing context cap', async () => {
    const f = catalog({ sources: async () => [source('large')], items: async () => [{ kind: 'theirs', id: 'large', text: '\u0001'.repeat(30_000) }] })
    const employee = first((await f.employee.save({ ...draft, description: 'Very long description '.repeat(2000) })).employees)
    const output = await f.employee.command(['memory', employee.id], 'manager', true)
    expect(output.length).toBeLessThan(20_000)
    const page = JSON.parse(output) as Omit<EmployeeMemory, 'employee'> & { employeeId: Employee['id'] }
    expect(page.employeeId).toBe(employee.id)
    expect(page.next).toBeDefined()
    expect(page.conversations[0]?.more).toBe(true)
  })

  it('bounds escaped source metadata, attachments and many short messages without losing the cursor', async () => {
    const sources = Array.from({ length: 5 }, (_, index) => ({ ...source(`chat-${String(index)}`), session: { ...source(`chat-${String(index)}`).session, title: '\u0001'.repeat(40_000), root: '\u0002'.repeat(40_000) } }))
    const messages: readonly SessionItem[] = Array.from({ length: 100 }, (_, index) => ({ kind: 'mine', id: `message-${String(index)}`, text: index === 0 ? '\u0003'.repeat(3000) : '', images: [{ media: 'image/png', data: 'large'.repeat(20_000) }] }))
    const f = catalog({ sources: async () => sources, items: async () => messages })
    const employee = first((await f.employee.save(draft)).employees)
    const workerPage = await f.employee.memory(employee.id)
    expect(workerPage.conversations[0]?.attachmentsOmitted).toBe(true)
    expect(workerPage.conversations.flatMap((one) => one.items).every((item) => item.kind !== 'mine' || item.images === undefined)).toBe(true)
    let cursor: string | undefined
    let seen = 0
    let text = ''
    for (;;) {
      const output = await f.employee.command(['memory', employee.id, ...(cursor === undefined ? [] : ['--cursor', cursor])], 'manager', true)
      expect(output.length).toBeLessThan(20_000)
      const page = JSON.parse(output) as Omit<EmployeeMemory, 'employee'>
      for (const conversation of page.conversations) {
        expect(conversation).toMatchObject({ metadataTruncated: true, attachmentsOmitted: true })
        expect(conversation.items.every((item) => item.kind !== 'mine' || item.images === undefined)).toBe(true)
        seen += conversation.items.filter((item) => item.text === '').length
        text += conversation.items.map((item) => item.text).join('')
      }
      cursor = page.next
      if (cursor === undefined) break
    }
    expect(seen).toBe(5 * 99)
    expect(text).toBe('\u0003'.repeat(5 * 3000))
  })

  it('distinguishes empty, partial and unavailable from successfully read sources', async () => {
    let sources: readonly Omit<EmployeeConversation, 'items'>[] = []
    const f = catalog({ sources: async () => sources, items: async (one) => one.id === 'missing' ? undefined : [] })
    const employee = first((await f.employee.save(draft)).employees)
    expect(await f.employee.memory(employee.id)).toMatchObject({ conversations: [], availability: 'complete' })
    sources = [source('known'), source('missing')]
    expect((await f.employee.memory(employee.id)).availability).toBe('partial')
    sources = [source('missing')]
    expect(await f.employee.memory(employee.id)).toMatchObject({ availability: 'unavailable', conversations: [{ unavailable: expect.any(String) }] })
  })
})

function sessionsFixture(over: Partial<SessionsDeps> = {}) {
  const notes = memoryNotes()
  const sent: string[] = []
  const sessions = new Sessions({
    notes, changed: () => undefined, items: () => undefined, account: () => undefined, notify: () => undefined,
    validateEmployee: (id) => { c.employee.active(id) },
    disk: { list: async () => [], has: async () => false, read: async () => undefined },
    claudeAccount: async () => ({ here: true, signedIn: true }), claudeProgram: async () => undefined,
    claudeModels: async () => undefined, usage: async () => ({ windows: new Map<string, number | undefined>() }),
    claude: (options) => ({ send: (text) => { expect(notes.all()[options.id]?.employeeId).toBeDefined(); sent.push(text) }, answer: () => undefined, stop: () => undefined, end: async () => undefined }),
    ...over,
  })
  cleanup.push(() => sessions.dispose())
  const c = catalog({ assignment: (id) => sessions.employeeAssignment(id), sources: (id) => sessions.employeeSources(id, ['/project']), items: (one) => sessions.employeeItems(one) })
  return { ...c, sessions, notes, sent }
}

describe('assignment is metadata before dispatch', () => {
  it('persists before sending and reassignment/clear sends no turn or role/history injection', async () => {
    const f = sessionsFixture()
    const employee = first((await f.employee.save(draft)).employees)
    const other = first((await f.employee.save({ ...draft, name: 'Other' })).employees.filter((one) => one.id !== employee.id))
    const id = await f.sessions.send({ root: '/project', mode: 'auto', text: 'Create an Instagram reel', employeeId: employee.id })
    expect(f.notes.all()[id]).toMatchObject({ employeeId: employee.id, employeeRoot: '/project' })
    expect(f.sent).toEqual(['Create an Instagram reel'])
    f.sessions.assignEmployee(id, other.id)
    expect(f.sessions.employeeAssignment(id)).toBe(other.id)
    expect((await f.employee.memory(employee.id)).conversations).toEqual([])
    expect((await f.employee.memory(other.id)).conversations[0]?.session.id).toBe(id)
    f.sessions.assignEmployee(id, null)
    expect(f.sessions.employeeAssignment(id)).toBeUndefined()
    expect(f.sent).toHaveLength(1)
  })

  it('rejects archived and unknown employees before creating a provider turn', async () => {
    const f = sessionsFixture()
    const employee = first((await f.employee.save(draft)).employees)
    await f.employee.archive(employee.id, employee.revision)
    await expect(f.sessions.send({ root: '/project', mode: 'auto', text: 'Work', employeeId: employee.id })).rejects.toThrow('archived')
    await expect(f.sessions.send({ root: '/project', mode: 'auto', text: 'Work', employeeId: 'missing' })).rejects.toThrow('no longer')
    expect(f.sent).toEqual([])
  })

  it('reads hidden and archived sources across a restart without changing notes or marking them read', async () => {
    const items: readonly SessionItem[] = [{ kind: 'mine', id: 'first', text: 'Use the earlier color.' }, { kind: 'theirs', id: 'answer', text: 'The color is blue.' }]
    const f = sessionsFixture({ disk: { list: async () => [{ id: 'old', title: 'Earlier reel', at: 1, driven: true, stands: '' }], read: async () => ({ items: [...items], tasks: [] }), has: async () => true } })
    const employee = first((await f.employee.save(draft)).employees)
    f.notes.set('old', { employeeId: employee.id, employeeRoot: '/project', title: 'Earlier reel', hidden: true, status: 'archived', unread: true })
    const before = JSON.stringify(f.notes.all())
    const memory = await f.employee.memory(employee.id)
    expect(memory).toMatchObject({ availability: 'complete', conversations: [{ hidden: true, session: { id: 'old', status: 'archived' }, items }] })
    expect(JSON.stringify(f.notes.all())).toBe(before)
    expect(await f.sessions.list(['/project'])).toEqual([])
    expect(f.sent).toEqual([])
  })

  it('uses the latest pending assignment on guard retry and excludes retired provisional copies from memory', async () => {
    let blocked = true
    const f = sessionsFixture({ beforeSend: () => { if (blocked) throw new Error('Temporary VPN check failed') } })
    const employee = first((await f.employee.save(draft)).employees)
    const other = first((await f.employee.save({ ...draft, name: 'Other' })).employees.filter((one) => one.id !== employee.id))
    const pending = await f.sessions.send({ root: '/project', mode: 'auto', text: 'Work after check', employeeId: employee.id })
    expect(f.sessions.employeeAssignment(pending)).toBe(employee.id)
    expect(f.sent).toEqual([])
    f.sessions.assignEmployee(pending, other.id)
    blocked = false
    const sent = await f.sessions.retry(pending)
    expect(sent).toBeDefined()
    expect(f.sessions.employeeAssignment(sent ?? '')).toBe(other.id)
    expect((await f.employee.memory(employee.id)).conversations).toEqual([])
    expect((await f.employee.memory(other.id)).conversations.map((one) => one.session.id)).toEqual([sent])
  })

  it('keeps prepared task assignment through the new provider conversation', async () => {
    const f = sessionsFixture()
    const employee = first((await f.employee.save(draft)).employees)
    const prepared = f.sessions.prepare({ root: '/project', mode: 'auto', text: 'Prepared task', employeeId: employee.id })
    const id = await f.sessions.send({ session: prepared, root: '/project', mode: 'auto', text: 'Prepared task' })
    expect(id).not.toBe(prepared)
    expect(f.sessions.employeeAssignment(id)).toBe(employee.id)
    expect(f.sent).toEqual(['Prepared task'])
    expect((await f.employee.memory(employee.id)).conversations.map((one) => one.session.id)).toEqual([id])
  })
})

describe('employee CLI and Manager routing', () => {
  it('worker employee interface only reads and current assignment is resolved through the session', async () => {
    const f = sessionsFixture()
    const employee = first((await f.employee.save(draft)).employees)
    const id = await f.sessions.send({ root: '/project', mode: 'auto', text: 'Work', employeeId: employee.id })
    expect(JSON.parse(await f.employee.command(['current'], id))).toMatchObject({ employee })
    expect(JSON.parse(await f.employee.command(['show', employee.id]))).toEqual(employee)
    await expect(f.employee.command(['archive', employee.id])).rejects.toThrow('only read')
    await expect(f.employee.command(['current'])).rejects.toThrow('conversation')
    expect(managerCommand(['employees', 'list'], { GECKIT_MANAGER_SESSION: 'manager' })).toBe(true)
    expect(managerCommand(['employees', 'list'], {})).toBe(false)
    expect(managerReadOnly(['employees', 'memory', employee.id])).toBe(true)
    expect(managerReadOnly(['sessions', 'assign', '--id', id, '--employee', employee.id])).toBe(false)
  })

  it('advertises reads, creates an assigned managed worker and rejects unmanaged/archived targets', async () => {
    const f = sessionsFixture()
    const employee = first((await f.employee.save(draft)).employees)
    const settings = { ...DEFAULT_SETTINGS, projects: ['/project'], vpnIpCheck: false, chatProviders: ['claude'] as const }
    const operations = new ManagerOperations({ employees: f.employee, sessions: f.sessions, notes: f.notes, settings: () => settings, saveSettings: () => settings, owner: 'manager', managed: (id) => f.notes.all()[id]?.managerOwner === 'manager', managerSession: () => 'manager' })
    expect(await operations.run(['capabilities'], 'read')).toContain('sessions assign')
    expect(await operations.run(['employees', 'list'], 'list')).toContain(employee.id)
    const result = JSON.parse(await operations.run(['sessions', 'start', '--project', '/project', '--text', 'Make the reel', '--goal', 'The reel exists', '--employee', employee.id], 'start')) as { id: string; employeeId: string }
    expect(result.employeeId).toBe(employee.id)
    expect(f.notes.all()[result.id]).toMatchObject({ employeeId: employee.id, managerOwner: 'manager' })
    expect(f.sent[0]).toBe('Make the reel')
    await operations.run(['sessions', 'assign', '--id', result.id, '--employee', 'none'], 'clear')
    expect(f.sessions.employeeAssignment(result.id)).toBeUndefined()
    f.notes.set(result.id, { ...f.notes.all()[result.id], managerOwner: 'elsewhere' })
    await expect(operations.run(['sessions', 'assign', '--id', result.id, '--employee', employee.id], 'invalid')).rejects.toThrow('not managed')
    await f.employee.archive(employee.id, employee.revision)
    await expect(operations.run(['sessions', 'start', '--project', '/project', '--text', 'Another reel', '--goal', 'Reel exists', '--employee', employee.id], 'archived')).rejects.toThrow('archived')
  })
})
