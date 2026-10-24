import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import type * as FileSystem from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { Settings } from '../src/shared/api'
import { managerProjects } from '../src/shared/manager'
import type { SessionNote } from '../src/main/sessions'

const location = vi.hoisted(() => ({ folder: '' }))
vi.mock('electron', () => ({ app: { getPath: () => location.folder } }))
vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof FileSystem>('node:fs')
  const { EventEmitter } = await import('node:events')
  class Watcher extends EventEmitter {
    close(): void {}
    ref(): this { return this }
    unref(): this { return this }
  }
  return { ...actual, watch: () => new Watcher() }
})

beforeEach(() => {
  location.folder = mkdtempSync(join(tmpdir(), 'geckit-manager-store-'))
  const initial: Settings = { ...DEFAULT_SETTINGS, phoneKey: 'manager-store-test', projects: ['/alpha'], profiles: [{ id: 'alpha', name: 'Alpha', projects: ['/alpha'] }, { id: 'beta', name: 'Beta', projects: ['/beta'] }], profile: 'alpha' }
  writeFileSync(join(location.folder, 'settings.json'), JSON.stringify(initial))
  vi.resetModules()
})

afterEach(() => { rmSync(location.folder, { recursive: true, force: true }) })

describe('Manager settings and roles on the actual disk store', () => {
  it('persists project providers and every profile project across a fresh store import', async () => {
    const store = await import('../src/main/store')
    const projectAssistants: Settings['projectAssistants'] = [{ root: '/alpha', provider: 'claude' }, { root: '/beta', provider: 'codex' }]
    store.setSettings({ projectAssistants })
    const persisted = JSON.parse(readFileSync(join(location.folder, 'settings.json'), 'utf8')) as Settings
    expect(persisted.projectAssistants).toEqual(projectAssistants)
    expect(persisted.projects).toEqual(['/alpha'])
    expect(persisted.profiles[1]?.projects).toEqual(['/beta'])
    expect(persisted.profile).toBe('alpha')
    vi.resetModules()
    const restarted = await import('../src/main/store')
    expect(restarted.getSettings().projectAssistants).toEqual(projectAssistants)
    expect(managerProjects(restarted.getSettings())).toEqual(['/alpha', '/beta'])
    restarted.setSettings({ profile: 'beta' })
    expect(managerProjects(restarted.getSettings())).toEqual(['/alpha', '/beta'])
  })

  it('leaves effective settings, subscribers and the prior file unchanged when the atomic project save fails', async () => {
    const store = await import('../src/main/store')
    store.setSettings({ projectAssistants: [{ root: '/alpha', provider: 'claude' }] })
    const path = join(location.folder, 'settings.json')
    const before = store.getSettings()
    const disk = readFileSync(path, 'utf8')
    const changed: Settings[] = []
    const unsubscribe = store.onSettings((value) => changed.push(value))
    mkdirSync(`${path}.new`)
    try {
      expect(() => store.setSettings({ projects: ['/alpha', '/gamma'], projectAssistants: [{ root: '/gamma', provider: 'codex' }] })).toThrow()
      expect(store.getSettings()).toEqual(before)
      expect(changed).toEqual([])
      expect(readFileSync(path, 'utf8')).toBe(disk)
      vi.resetModules()
      const restarted = await import('../src/main/store')
      expect(restarted.getSettings().projectAssistants).toEqual(before.projectAssistants)
      expect(restarted.getSettings().projects).toEqual(before.projects)
    } finally { unsubscribe() }
  })

  const roles: readonly Pick<SessionNote, 'managerPrompt' | 'managerOwner'>[] = [{ managerPrompt: 'Coordinate using GeckIt CLI only.' }, { managerOwner: 'manager' }, { managerPrompt: 'Coordinate using GeckIt CLI only.', managerOwner: 'manager' }]

  it.each(roles)('persists a manager role synchronously and restores it in a new notes store: %j', async (role) => {
    const store = await import('../src/main/store')
    const notes = store.notesStore()
    notes.set('managed-session', { title: 'Manager session', ...role })
    const path = join(location.folder, 'sessions.json')
    const persisted = JSON.parse(readFileSync(path, 'utf8')) as ReturnType<typeof notes.all>
    expect(persisted['managed-session']).toMatchObject(role)
    expect(persisted['managed-session']?.title).toBe('Manager session')
    vi.resetModules()
    const restarted = await import('../src/main/store')
    expect(restarted.notesStore().all()['managed-session']).toEqual(notes.all()['managed-session'])
  })

  it.each(roles)('does not publish a new manager role when its synchronous disk save fails: %j', async (role) => {
    const existing: SessionNote = { title: 'Ordinary session', created: 1 }
    const path = join(location.folder, 'sessions.json')
    writeFileSync(path, JSON.stringify({ 'ordinary-session': existing }))
    const store = await import('../src/main/store')
    const notes = store.notesStore()
    const before = notes.all()
    const disk = readFileSync(path, 'utf8')
    mkdirSync(`${path}.new`)
    expect(() => notes.set('ordinary-session', { ...existing, ...role })).toThrow()
    expect(notes.all()).toEqual(before)
    expect(notes.all()['ordinary-session']?.managerPrompt).toBeUndefined()
    expect(notes.all()['ordinary-session']?.managerOwner).toBeUndefined()
    expect(readFileSync(path, 'utf8')).toBe(disk)
    vi.resetModules()
    const restarted = await import('../src/main/store')
    expect(restarted.notesStore().all()['ordinary-session']).toEqual(existing)
  })
})
