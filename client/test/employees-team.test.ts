import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Settings, Shortcut, TeamAnswer } from '../src/shared/api'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { Employee } from '../src/shared/employees'

const held = vi.hoisted(() => ({ shortcuts: [] as Shortcut[], chatProviders: ['claude', 'codex'] as Settings['chatProviders'] }))

vi.mock('electron', () => ({ powerMonitor: { on: vi.fn() } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))
vi.mock('../src/main/store', () => ({
  getSettings: () => ({ ...DEFAULT_SETTINGS, ...held }),
  setSettings: (change: Partial<Settings>) => {
    if (change.shortcuts !== undefined) held.shortcuts = [...change.shortcuts]
  },
}))

const { removeShortcut, resumeOwned, runShortcut, saveShortcut, startShortcuts } = await import('../src/main/shortcuts')
const { Employees, everyCron } = await import('../src/main/employees')
const { withFiles } = await import('../src/cli/employees')

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const close of cleanup.splice(0)) close()
  vi.useRealTimers()
})

const at = (text: string): number => new Date(text).getTime()
const draft = { name: 'Realtor', role: 'Property', description: 'Finds lots.', avatar: 'employee-01' }

function team(answer?: () => Promise<TeamAnswer | undefined>) {
  const folder = mkdtempSync(join(tmpdir(), 'geckit-team-'))
  cleanup.push(() => rmSync(folder, { recursive: true, force: true }))
  const asked: (readonly string[])[] = []
  const assigned: [string, string | null][] = []
  const start = vi.fn(async () => 'session-1')
  const manager = { instructions: '', avatar: '' }
  const employees: InstanceType<typeof Employees> = new Employees({
    directory: folder,
    sync: async () => undefined,
    assignment: () => undefined,
    sources: async () => [{ session: { id: 'task-1', root: '/p/samara', title: 'Check lots', at: 1, status: 'todo' }, hidden: false }],
    items: async () => [],
    restored: (id) => resumeOwned(id),
    team: {
      settings: () => ({ ...DEFAULT_SETTINGS, ...held }),
      project: (name) => {
        if (name !== 'samara') throw new Error(`No folder called ${name}. There are: samara`)
        return '/p/samara'
      },
      projectName: (root) => root.split('/').at(-1) ?? root,
      saveShortcut,
      removeShortcut,
      runShortcut: (id) => runShortcut(id, 'hand'),
      assign: (session, employee) => { assigned.push([session, employee]) },
      title: (session) => (session === 'chat-1' ? 'Find a flat' : undefined),
      ask: async (_session, lines) => {
        asked.push(lines)
        return answer === undefined ? { how: 'allowed' } : answer()
      },
      manager: () => manager,
      setManager: async (change) => { Object.assign(manager, change) },
    },
  })
  startShortcuts({ start, rename: vi.fn(), busy: () => false, employee: (id) => employees.list().employees.find((one) => one.id === id) })
  return { employees, asked, assigned, start, manager }
}

const first = (list: readonly Employee[]): Employee => {
  const one = list[0]
  if (one === undefined) throw new Error('Missing employee')
  return one
}

beforeEach(() => {
  held.shortcuts = []
  held.chatProviders = ['claude', 'codex']
})

describe('the simple timetables and files the CLI takes', () => {
  it('reads every REPEATS form into the cron line the editor keeps', () => {
    expect(everyCron('hour')).toBe('0 * * * *')
    expect(everyCron('hour 15')).toBe('15 * * * *')
    expect(everyCron('day 9:00')).toBe('0 9 * * *')
    expect(everyCron('weekdays 10:30')).toBe('30 10 * * 1-5')
    expect(everyCron('week Monday 9:00')).toBe('0 9 * * 1')
    expect(everyCron('week sun 7:05')).toBe('5 7 * * 0')
    for (const wrong of ['daily', 'day 25:00', 'week someday 9:00', 'hour 60', 'weekdays 9']) expect(() => everyCron(wrong)).toThrow('--every')
  })

  it('reads --prompt-file and --description-file on the CLI side and sends their text', () => {
    const read = (file: string): string => {
      if (file === 'missing.md') throw new Error('ENOENT')
      return `text of ${file}`
    }
    expect(withFiles(['shortcut', 'add', 'none', '--prompt-file', 'p.md', '--name', 'X'], read)).toEqual(['shortcut', 'add', 'none', '--prompt', 'text of p.md', '--name', 'X'])
    expect(withFiles(['create', '--name', 'A', '--description-file', 'd.md'], read)).toEqual(['create', '--name', 'A', '--description', 'text of d.md'])
    expect(() => withFiles(['create', '--description-file', 'missing.md'], read)).toThrow('Could not read missing.md')
    expect(() => withFiles(['create', '--prompt-file'], read)).toThrow('needs a file')
  })
})

describe('team changes from a terminal', () => {
  it('creates, edits, archives and restores employees at once and prints one line each', async () => {
    const f = team()
    expect(await f.employees.command(['create', '--name', 'Realtor', '--role', 'Property'])).toMatch(/^Created employee Realtor \(.+\)\.$/)
    const realtor = first(f.employees.list().employees)
    expect(realtor).toMatchObject({ name: 'Realtor', role: 'Property', archived: false })
    expect(await f.employees.command(['edit', 'Realtor', '--description', 'Finds lots.'])).toBe('Saved employee Realtor.')
    expect(f.employees.get(realtor.id).description).toBe('Finds lots.')
    expect(await f.employees.command(['archive', realtor.id])).toBe('Archived Realtor.')
    expect(f.employees.get(realtor.id).archived).toBe(true)
    expect(await f.employees.command(['restore', realtor.id])).toBe('Restored Realtor.')
    expect(await f.employees.command(['assign', 'chat-1', realtor.id])).toBe('Assigned Find a flat to Realtor.')
    expect(await f.employees.command(['assign', 'chat-1', 'none'])).toBe('Removed the employee from Find a flat.')
    expect(f.assigned).toEqual([['chat-1', realtor.id], ['chat-1', null]])
    expect(f.asked).toEqual([])
  })

  it('adds, edits, pauses, resumes, gives, runs and removes shortcuts', async () => {
    const f = team()
    const realtor = first((await f.employees.save(draft)).employees)
    expect(await f.employees.command(['shortcut', 'add', realtor.id, '--name', 'Check lots', '--project', 'samara', '--prompt', 'Check new lots', '--every', 'weekdays 9:00', '--mode', 'plan'])).toMatch(/^Added shortcut "Check lots" \(.+\)\.$/)
    const added = held.shortcuts[0]
    expect(added).toMatchObject({ name: 'Check lots', root: '/p/samara', prompt: 'Check new lots', cron: '0 9 * * 1-5', on: true, mode: 'plan', employeeId: realtor.id })
    const id = added?.id ?? ''
    expect(await f.employees.command(['shortcut', 'edit', id, '--cron', '30 8 * * *', '--prompt', 'Check lots again'])).toBe('Saved shortcut "Check lots".')
    expect(held.shortcuts[0]).toMatchObject({ cron: '30 8 * * *', prompt: 'Check lots again', employeeId: realtor.id })
    expect(await f.employees.command(['shortcut', 'pause', id])).toBe('Paused shortcut "Check lots".')
    expect(held.shortcuts[0]?.on).toBe(false)
    expect(await f.employees.command(['shortcut', 'resume', 'Check lots'])).toBe('Resumed shortcut "Check lots".')
    expect(held.shortcuts[0]?.on).toBe(true)
    expect(await f.employees.command(['shortcut', 'give', id, 'none'])).toBe('Shortcut "Check lots" has no employee now.')
    expect(held.shortcuts[0]?.employeeId).toBeUndefined()
    expect(await f.employees.command(['shortcut', 'give', id, realtor.id])).toBe('Gave shortcut "Check lots" to Realtor.')
    expect(await f.employees.command(['shortcut', 'run', id])).toBe('Started session-1.')
    expect(f.start).toHaveBeenCalledWith(expect.objectContaining({ root: '/p/samara', text: 'Check lots again', employeeId: realtor.id }))
    expect(JSON.parse(await f.employees.command(['shortcuts', realtor.id, '--json']))).toMatchObject([{ id, project: 'samara', employeeId: realtor.id }])
    expect(await f.employees.command(['shortcuts', 'none'])).toBe('No shortcuts.')
    expect(await f.employees.command(['shortcuts'])).toContain('Check lots')
    expect(await f.employees.command(['shortcut', 'remove', id])).toBe('Removed shortcut "Check lots".')
    expect(held.shortcuts).toEqual([])
  })

  it('picks portraits, shortcut goals and reasoning, and sets Manager', async () => {
    const f = team()
    await f.employees.command(['create', '--name', 'Realtor', '--avatar', '7'])
    const realtor = first(f.employees.list().employees)
    expect(realtor.avatar).toBe('employee-07')
    expect(await f.employees.command(['edit', realtor.id, '--avatar', '12'])).toBe('Saved employee Realtor.')
    expect(f.employees.get(realtor.id).avatar).toBe('employee-12')
    await expect(f.employees.command(['edit', realtor.id, '--avatar', '13'])).rejects.toThrow('1 to 12')
    await f.employees.command(['shortcut', 'add', 'none', '--name', 'Lots', '--project', 'samara', '--prompt', 'Check', '--goal', 'A list is sent'])
    expect(held.shortcuts[0]).toMatchObject({ goal: 'A list is sent' })
    await f.employees.command(['shortcut', 'edit', 'Lots', '--goal', ''])
    expect(held.shortcuts[0]?.goal).toBeUndefined()
    await expect(f.employees.command(['shortcut', 'edit', 'Lots', '--reasoning', 'loud'])).rejects.toThrow('--reasoning')
    await expect(f.employees.command(['shortcut', 'edit', 'Lots', '--reasoning', 'high'])).rejects.toThrow('Codex shortcuts only')
    expect(await f.employees.command(['manager'])).toBe('Manager\nNo instructions.')
    expect(await f.employees.command(['manager', 'edit', '--instructions', 'Use Opus for code, Sonnet for the rest.', '--avatar', '3'])).toBe('Saved Manager.')
    expect(f.manager).toEqual({ instructions: 'Use Opus for code, Sonnet for the rest.', avatar: 'employee-03' })
    expect(JSON.parse(await f.employees.command(['manager', '--json']))).toEqual({ name: 'Manager', instructions: 'Use Opus for code, Sonnet for the rest.', avatar: 'employee-03' })
    await expect(f.employees.command(['manager', 'edit'])).rejects.toThrow('employees manager edit')
    expect(withFiles(['manager', 'edit', '--instructions-file', 'm.md'], (file) => `text of ${file}`)).toEqual(['manager', 'edit', '--instructions', 'text of m.md'])
  })

  it('reads an employee\'s tasks as lines or JSON', async () => {
    const f = team()
    const realtor = first((await f.employees.save(draft)).employees)
    expect(await f.employees.command(['tasks', realtor.id])).toContain('Check lots')
    expect(JSON.parse(await f.employees.command(['tasks', realtor.id, '--json']))).toMatchObject([{ id: 'task-1', status: 'todo', title: 'Check lots' }])
  })

  it('refuses what it cannot do with a message that says why', async () => {
    const f = team()
    const realtor = first((await f.employees.save(draft)).employees)
    await expect(f.employees.command(['shortcut', 'add', realtor.id, '--name', 'X', '--project', 'nowhere', '--prompt', 'Y'])).rejects.toThrow('No folder called nowhere')
    await expect(f.employees.command(['shortcut', 'add', realtor.id, '--name', 'X', '--project', 'samara'])).rejects.toThrow('--prompt')
    await expect(f.employees.command(['shortcut', 'add', realtor.id, '--name', 'X', '--project', 'samara', '--prompt', 'Y', '--cron', 'often'])).rejects.toThrow('not a cron line')
    await expect(f.employees.command(['shortcut', 'add', realtor.id, '--name', 'X', '--project', 'samara', '--prompt', 'Y', '--provider', 'plugin:none'])).rejects.toThrow('not enabled')
    await expect(f.employees.command(['shortcut', 'add', 'nobody', '--name', 'X', '--project', 'samara', '--prompt', 'Y'])).rejects.toThrow('No employee nobody')
    await expect(f.employees.command(['create'])).rejects.toThrow('employees create --name')
    await expect(f.employees.command(['fire', realtor.id])).rejects.toThrow('Use employees')
    await expect(f.employees.command(['archive', realtor.id], 'manager', true)).rejects.toThrow('only read')
    expect(held.shortcuts).toEqual([])
  })
})

describe('team changes from a conversation', () => {
  it('waits for Allow and then applies, saying each change in plain words', async () => {
    const f = team()
    const realtor = first((await f.employees.save(draft)).employees)
    expect(await f.employees.command(['shortcut', 'add', realtor.id, '--name', 'Check lots', '--project', 'samara', '--prompt', 'Check new lots', '--every', 'weekdays 10:00'], 'chat-1')).toMatch(/^Added shortcut/)
    expect(f.asked[0]?.[0]).toBe('Add shortcut "Check lots" to Realtor')
    expect(f.asked[0]?.[1]).toMatch(/^Every weekday at .+ in samara$/)
    expect(f.asked[0]?.[2]).toBe('Prompt: Check new lots')
    expect(held.shortcuts).toHaveLength(1)
  })

  it('changes nothing when declined or withdrawn, and reads without asking', async () => {
    let answer: TeamAnswer | undefined = { how: 'declined', note: 'Not now' }
    const f = team(async () => answer)
    const realtor = first((await f.employees.save(draft)).employees)
    await expect(f.employees.command(['archive', realtor.id], 'chat-1')).rejects.toThrow('Declined by the person. Their note: Not now')
    answer = { how: 'declined' }
    await expect(f.employees.command(['create', '--name', 'Other'], 'chat-1')).rejects.toThrow(/^Declined by the person\.$/)
    answer = undefined
    await expect(f.employees.command(['restore', realtor.id], 'chat-1')).rejects.toThrow('stopped waiting')
    expect(f.employees.list().employees).toHaveLength(1)
    expect(f.employees.get(realtor.id).archived).toBe(false)
    expect(f.asked).toEqual([['Archive Realtor'], ['Add employee "Other"'], ['Restore Realtor']])
    await f.employees.command(['shortcuts'], 'chat-1')
    await f.employees.command(['tasks', realtor.id], 'chat-1')
    expect(f.asked).toHaveLength(3)
  })
})

describe('shortcuts owned by employees', () => {
  it('rejects an unknown or archived owner on save, and keeps an unchanged one', async () => {
    const f = team()
    const realtor = first((await f.employees.save(draft)).employees)
    const base = { name: 'X', root: '/p/samara', prompt: 'Y', mode: 'auto' as const, on: false }
    expect(() => saveShortcut({ ...base, employeeId: 'missing' })).toThrow('Choose an active employee or None.')
    const saved = saveShortcut({ ...base, employeeId: realtor.id })
    await f.employees.archive(realtor.id, realtor.revision)
    expect(() => saveShortcut({ ...base, employeeId: realtor.id })).toThrow('Choose an active employee or None.')
    expect(saveShortcut({ ...base, id: saved.id, employeeId: realtor.id, name: 'Renamed' })).toMatchObject({ name: 'Renamed', employeeId: realtor.id })
    expect(held.shortcuts).toHaveLength(1)
  })

  it('pauses timetables while their employee is archived and does not catch up after Restore', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(at('2026-11-02T09:00:10'))
    const f = team()
    const realtor = first((await f.employees.save(draft)).employees)
    await f.employees.archive(realtor.id, realtor.revision)
    held.shortcuts = [{ id: 's', name: 'Check lots', root: '/p/samara', prompt: 'Check', mode: 'auto', cron: '0 9 * * *', on: true, since: at('2026-11-01T09:00'), employeeId: realtor.id }]
    await vi.advanceTimersByTimeAsync(60_000)
    expect(f.start).not.toHaveBeenCalled()
    expect(held.shortcuts[0]).toMatchObject({ on: true, employeeId: realtor.id })
    expect(await runShortcut('s', 'hand')).toBeUndefined()
    await expect(f.employees.command(['shortcut', 'run', 's'])).rejects.toThrow('archived')
    expect(await f.employees.command(['shortcuts'])).toContain('Paused while archived')
    await f.employees.archive(realtor.id, f.employees.get(realtor.id).revision, false)
    expect(held.shortcuts[0]?.since).toBe(Date.now())
    await vi.advanceTimersByTimeAsync(60_000)
    expect(f.start).not.toHaveBeenCalled()
  })

  it('starts each run assigned to its owner, and without one when the owner is gone', async () => {
    const f = team()
    const realtor = first((await f.employees.save(draft)).employees)
    held.shortcuts = [
      { id: 'a', name: 'Owned', root: '/p/samara', prompt: 'Work', mode: 'auto', on: false, since: 0, employeeId: realtor.id },
      { id: 'b', name: 'Orphan', root: '/p/samara', prompt: 'Work', mode: 'auto', on: false, since: 0, employeeId: 'gone' },
    ]
    expect(await runShortcut('a', 'hand')).toBe('session-1')
    expect(f.start).toHaveBeenLastCalledWith({ root: '/p/samara', mode: 'auto', text: 'Work', provider: 'claude', employeeId: realtor.id })
    expect(await runShortcut('b', 'hand')).toBe('session-1')
    expect(f.start).toHaveBeenLastCalledWith({ root: '/p/samara', mode: 'auto', text: 'Work', provider: 'claude' })
  })
})
