import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, it, vi } from 'vitest'

import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { Settings } from '../src/shared/api'

const state = vi.hoisted(() => ({ folder: '', data: '' }))
vi.mock('electron', () => ({ app: {
  isPackaged: false,
  getPath: (name: string) => name === 'appData' ? state.folder : state.data,
  setPath: (_name: string, path: string) => { state.data = path },
} }))

it('gives Local its own phone pairing key when copying installed settings', async () => {
  state.folder = mkdtempSync(join(tmpdir(), 'geckit-local-data-'))
  state.data = join(state.folder, 'geckit')
  mkdirSync(state.data)
  const installed: Settings = { ...DEFAULT_SETTINGS, phone: true, phoneKey: 'installed-pairing-key' }
  writeFileSync(join(state.data, 'settings.json'), JSON.stringify(installed))
  try {
    await import('../src/main/local-data')
    const { getSettings } = await import('../src/main/store')
    const local = getSettings()
    expect(local.phone).toBe(false)
    expect(local.phoneKey).not.toBe(installed.phoneKey)
    expect(local.phoneKey).not.toBe('')
    const saved: Settings = JSON.parse(readFileSync(join(state.data, 'settings.json'), 'utf8'))
    expect(saved.phoneKey).toBe(local.phoneKey)
  } finally {
    rmSync(state.folder, { recursive: true, force: true })
  }
})
