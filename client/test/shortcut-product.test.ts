import { expect, it, vi } from 'vitest'
import type { Settings, Shortcut } from '../src/shared/api'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import { productShortcuts } from '../src/core/product-shortcuts'
import { managerReadOnly } from '../src/main/manager-operations'
import { saveShortcut, removeShortcut } from '../src/main/shortcuts'

const state = vi.hoisted(() => ({ shortcuts: [] as readonly Shortcut[] }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))
vi.mock('../src/main/store', () => ({
  getSettings: () => ({ ...DEFAULT_SETTINGS, projects: ['/project'], ...state }),
  setSettings: (change: Partial<Settings>) => { if (change.shortcuts !== undefined) state.shortcuts = change.shortcuts },
}))

it('shares saved destination schema with product CLI, returns discovery and run evidence, rejects invalid nested values', async () => {
  const destinations = [{ id: 'channel:discord' as const, name: 'Discord', supported: true, destinations: [{ id: '123', name: '#general', model: 'thread' as const }] }]
  const api: Parameters<typeof productShortcuts>[0] = { 'shortcuts:save': saveShortcut, 'shortcuts:remove': removeShortcut, 'shortcuts:run': async () => 'source', 'shortcuts:destinations': async () => destinations, 'shortcuts:runs': () => [] }
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
