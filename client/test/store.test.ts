import { mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, it, vi } from 'vitest'

import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { Settings } from '../src/shared/api'

const state = vi.hoisted(() => ({ folder: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.folder } }))

const { getSettings, onSettings, setSettings } = await import('../src/main/store')

it('updates open windows when settings.json is replaced outside GeckIt', async () => {
  state.folder = mkdtempSync(join(tmpdir(), 'geckit-settings-'))
  const path = join(state.folder, 'settings.json')
  const initial: Settings = { ...DEFAULT_SETTINGS, projects: ['/old'], projectColors: { '/old': 0 }, phoneKey: 'key' }
  writeFileSync(path, JSON.stringify(initial))
  expect(getSettings().projects).toEqual(['/old'])

  const changed: Settings[] = []
  const stop = onSettings((settings) => changed.push(settings))
  try {
    const edited: Settings = { ...initial, projects: ['/new', '/old'] }
    writeFileSync(`${path}.new`, JSON.stringify(edited))
    renameSync(`${path}.new`, path)

    await vi.waitFor(() => expect(changed).toHaveLength(1), { timeout: 2000 })
    expect(changed[0]?.projects).toEqual(['/new', '/old'])
    expect(getSettings().projects).toEqual(['/new', '/old'])

    setSettings({ theme: 'dark' })
    expect(changed).toHaveLength(2)
    await new Promise((done) => setTimeout(done, 350))
    expect(changed).toHaveLength(2)
  } finally {
    stop()
    rmSync(state.folder, { recursive: true, force: true })
  }
})
