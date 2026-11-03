import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionNote } from '../src/main/sessions'

const location = vi.hoisted(() => ({ folder: '' }))
vi.mock('../src/core/platform', () => ({ dataDirectory: () => location.folder }))
vi.mock('electron', () => ({ app: { getPath: () => location.folder } }))
beforeEach(() => { location.folder = mkdtempSync(join(tmpdir(), 'geckit-employee-store-')); vi.resetModules() })
afterEach(() => rmSync(location.folder, { recursive: true, force: true }))

describe('employee assignment uses the actual atomic notes store', () => {
  it('persists assignment and clearing synchronously across fresh imports', async () => {
    const store = await import('../src/main/store')
    const notes = store.notesStore()
    notes.set('task', { title: 'Task', employeeId: 'role', employeeRoot: '/project' })
    const path = join(location.folder, 'sessions.json')
    expect((JSON.parse(readFileSync(path, 'utf8')) as ReturnType<typeof notes.all>)['task']).toMatchObject({ employeeId: 'role', employeeRoot: '/project' })
    vi.resetModules()
    const restarted = (await import('../src/main/store')).notesStore()
    expect(restarted.all()['task']?.employeeId).toBe('role')
    const { employeeId: _employee, employeeRoot: _root, ...kept } = restarted.all()['task'] ?? {}
    restarted.set('task', kept)
    expect((JSON.parse(readFileSync(path, 'utf8')) as ReturnType<typeof notes.all>)['task']?.employeeId).toBeUndefined()
  })

  it('does not publish failed assignment or clear when the atomic file cannot be replaced', async () => {
    const path = join(location.folder, 'sessions.json')
    const original: SessionNote = { title: 'Task', employeeId: 'original', employeeRoot: '/project', created: 1 }
    writeFileSync(path, JSON.stringify({ task: original }))
    const notes = (await import('../src/main/store')).notesStore()
    const before = notes.all()
    mkdirSync(`${path}.new`)
    expect(() => notes.set('task', { ...original, employeeId: 'replacement' })).toThrow()
    expect(() => notes.set('task', { title: 'Task', created: 1 })).toThrow()
    expect(notes.all()).toEqual(before)
    expect((JSON.parse(readFileSync(path, 'utf8')) as ReturnType<typeof notes.all>)['task']).toEqual(original)
  })
})
