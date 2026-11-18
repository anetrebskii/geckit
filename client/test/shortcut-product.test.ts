import { expect, it, vi } from 'vitest'
import type { Settings, Shortcut } from '../src/shared/api'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import { productShortcuts } from '../src/core/product-shortcuts'
import { managerReadOnly } from '../src/main/manager-operations'
import { postponeShortcut, saveShortcut, removeShortcut } from '../src/main/shortcuts'

const state = vi.hoisted(() => ({ shortcuts: [] as readonly Shortcut[] }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))
vi.mock('../src/main/store', () => ({
  getSettings: () => ({ ...DEFAULT_SETTINGS, projects: ['/project'], ...state }),
  setSettings: (change: Partial<Settings>) => { if (change.shortcuts !== undefined) state.shortcuts = change.shortcuts },
}))

it('shares saved destination schema with product CLI, returns discovery and run evidence, rejects invalid nested values', async () => {
  const destinations = [{ id: 'channel:discord' as const, name: 'Discord', supported: true, destinations: [{ id: '123', name: '#general', model: 'thread' as const }] }]
  const api: Parameters<typeof productShortcuts>[0] = { 'shortcuts:save': saveShortcut, 'shortcuts:remove': removeShortcut, 'shortcuts:postpone': postponeShortcut, 'shortcuts:run': async () => 'source', 'shortcuts:destinations': async () => destinations, 'shortcuts:runs': () => [] }
  const draft = { name: 'Result', root: '/project', prompt: 'Inspect', provider: 'claude', mode: 'auto', on: false, destination: { channel: 'channel:discord', destination: '123', label: '#general' } }
  const created = await productShortcuts(api, ['save', '--draft', JSON.stringify(draft), '--expected', 'null'])
  const saved = JSON.parse(created) as Shortcut
  expect(managerReadOnly(['shortcuts', 'destinations'])).toBe(true)
  expect(managerReadOnly(['shortcuts', 'runs', '--id', saved.id])).toBe(true)
  expect(saved.destination).toEqual(draft.destination)
  expect(JSON.parse(await productShortcuts(api, ['list']))).toMatchObject([{ destination: draft.destination }])
  expect(JSON.parse(await productShortcuts(api, ['destinations']))).toEqual(destinations)
  expect(JSON.parse(await productShortcuts(api, ['runs', '--id', saved.id]))).toEqual([])
  await expect(productShortcuts(api, ['save', '--draft', JSON.stringify({ ...draft, destination: { ...draft.destination, injected: true } }), '--expected', 'null'])).rejects.toThrow('valid result channel')
  expect(state.shortcuts[0]?.destination).toEqual(draft.destination)
  const { since: _since, ...expected } = saved
  await expect(productShortcuts(api, ['save', '--draft', JSON.stringify({ ...expected, name: 'Conflicting' }), '--expected', 'null'])).rejects.toThrow('Shortcut changed')
  await productShortcuts(api, ['save', '--draft', JSON.stringify({ ...expected, name: 'Edited' }), '--expected', JSON.stringify(expected)])
  expect(state.shortcuts[0]?.name).toBe('Edited')
  await productShortcuts(api, ['remove', '--id', saved.id])
  expect(state.shortcuts).toEqual([])
})

it('saves a Scheduled prompt, lists its kind without a drawn start, and postpones it', async () => {
  const api: Parameters<typeof productShortcuts>[0] = { 'shortcuts:save': saveShortcut, 'shortcuts:remove': removeShortcut, 'shortcuts:postpone': postponeShortcut, 'shortcuts:run': async () => 'source', 'shortcuts:destinations': async () => [], 'shortcuts:runs': () => [] }
  const at = Date.now() + 86_400_000
  const draft = { name: 'Once', root: '/project', prompt: 'Plan', provider: 'claude', mode: 'auto', on: true, at, vary: true }
  const saved = JSON.parse(await productShortcuts(api, ['save', '--draft', JSON.stringify(draft), '--expected', 'null'])) as Shortcut
  expect(saved).toMatchObject({ at, vary: true })
  const listed = await productShortcuts(api, ['list'])
  expect(JSON.parse(listed)).toEqual(expect.arrayContaining([expect.objectContaining({ id: saved.id, kind: 'scheduled', at })]))
  expect(listed).not.toContain('since')
  const later = new Date(at + 86_400_000).toISOString()
  expect(JSON.parse(await productShortcuts(api, ['postpone', '--id', saved.id, '--at', later]))).toMatchObject({ at: Date.parse(later), postponedFrom: at })
  await expect(productShortcuts(api, ['save', '--draft', JSON.stringify({ ...draft, vary: 'yes' }), '--expected', 'null'])).rejects.toThrow('vary is true or false')
})
