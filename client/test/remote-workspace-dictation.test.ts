import { afterEach, expect, it, vi } from 'vitest'

import type { WorkspaceMount } from '../src/renderer/src/remote/Workspace'
import type {} from '../src/renderer/src/dictate'

vi.mock('../src/renderer/src/remote/workspace-api', () => ({ workspaceApi: () => ({}) }))
vi.mock('../src/renderer/src/chat/main', () => ({}))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

it.each([true, false])('lends the parent microphone to a phone workspace only (phone: %s)', async (phone) => {
  const document = { documentElement: { classList: { toggle: vi.fn(), add: vi.fn(), contains: vi.fn(() => false) } } }
  const parent = {
    document,
    geckitDictate: { start: vi.fn(), stop: vi.fn(), cancel: vi.fn(), live: true },
    geckitVoice: { start: vi.fn(), stop: vi.fn(), drop: vi.fn() },
    geckitLevel: vi.fn(),
  }
  const frame: Pick<Window, 'mountRemoteWorkspace' | 'geckitDictate' | 'geckitVoice' | 'geckitLevel'> & { parent: typeof parent } = { parent }
  vi.stubGlobal('document', document)
  vi.stubGlobal('window', frame)
  await import('../src/renderer/src/remote/workspace-entry')
  const mount: WorkspaceMount = {
    connection: { call: vi.fn(), on: vi.fn() },
    server: { id: 'phone', name: 'Test Mac', publicKey: 'fixture' },
    phone,
    onSignIn: vi.fn(),
  }
  await frame.mountRemoteWorkspace?.(mount)
  expect(frame.geckitDictate).toBe(phone ? parent.geckitDictate : undefined)
  expect(frame.geckitVoice).toBe(phone ? parent.geckitVoice : undefined)
  expect(frame.geckitLevel).toBe(phone ? parent.geckitLevel : undefined)
})
