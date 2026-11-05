import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import type * as Os from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ folder: '', conversation: undefined as string | undefined }))
vi.mock('node:os', async () => ({ ...await vi.importActual<typeof Os>('node:os'), homedir: () => state.folder }))
vi.mock('../src/cli/start', () => ({ requestingSession: () => state.conversation }))
import { browser } from '../src/cli/browser'
import { registerBrowserConversation } from '../src/cli/browser-lifecycle'

beforeEach(() => {
  state.folder = mkdtempSync(join(tmpdir(), 'geckit-browser-route-'))
  const folder = join(state.folder, '.geckit', 'browser', 'hosts')
  mkdirSync(folder, { recursive: true })
  for (const profile of [
    { pid: 1, label: 'person@example.com', tabs: [10], focused: 1, t: Date.now() },
    { pid: 2, label: 'test:legacy', tabs: [900_000_001], focused: 0, t: Date.now() },
  ]) writeFileSync(join(folder, `${profile.pid}.json`), JSON.stringify(profile))
})
afterEach(() => { rmSync(state.folder, { recursive: true, force: true }); state.conversation = undefined })

it('routes ordinary Chrome commands without requiring test registration, even with test browsers connected', async () => {
  for (const id of ['unregistered', 'done']) {
    state.conversation = id
    if (id === 'done') registerBrowserConversation(id, '/shop', true)
    const reply = await browser(['read', '10', '--profile', 'person@example.com'])
    expect(reply.said).toBe('Chrome through GeckIt is off. Turn it on in GeckIt Settings > Integrations.')
  }
})

it('keeps explicit manually named profiles routable outside conversations', async () => {
  const reply = await browser(['pages', '--profile', 'test:legacy'])
  expect(reply.said).toBe('Chrome through GeckIt is off. Turn it on in GeckIt Settings > Integrations.')
})

it('refuses foreign test tabs before sending a request', async () => {
  state.conversation = 'unregistered'
  expect((await browser(['read', '900000001'])).said).toContain('another project or an unowned legacy browser')
})
