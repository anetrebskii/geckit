import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type * as Os from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ folder: '' }))
vi.mock('node:os', async () => ({ ...await vi.importActual<typeof Os>('node:os'), homedir: () => state.folder }))
vi.mock('../src/core/platform', () => ({ dataDirectory: () => join(state.folder, 'service') }))

import { browserConversation, registerBrowserConversation } from '../src/cli/browser-lifecycle'
import { notesStore } from '../src/main/store'

it('publishes central note Done transitions synchronously for both set and replace', () => {
  state.folder = mkdtempSync(join(tmpdir(), 'geckit-browser-done-'))
  try {
    registerBrowserConversation('a', '/shop', false)
    const notes = notesStore()
    notes.set('a', { status: 'done' })
    expect(browserConversation('a')?.done).toBe(true)
    notes.replace({ a: {} })
    expect(browserConversation('a')?.done).toBe(false)
    notes.replace({ a: { status: 'done' } })
    expect(browserConversation('a')?.done).toBe(true)
  } finally { rmSync(state.folder, { recursive: true, force: true }) }
})
