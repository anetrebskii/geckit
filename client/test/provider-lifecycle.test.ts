import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import type { CoreRuntime } from '../src/core/runtime'
import { configureCorePlatform } from '../src/core/platform'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import { DEFAULT_MANAGER_CONFIG } from '../src/shared/manager'
import { assertProviderAvailable } from '../src/main/provider-changes'

const lifecycle = vi.hoisted(() => ({ resume: undefined as (() => void) | undefined, uninstall: vi.fn(() => new Promise<void>((done) => { lifecycle.resume = done })) }))
vi.mock('../src/main/sessions/plugins', () => ({ uninstallPlugin: lifecycle.uninstall, providerPluginFailures: () => [] }))
import { uninstallProvider } from '../src/core/application'
import { getSettings, setSettings } from '../src/main/store'

it('locks a deferred safe uninstall against concurrent enables and runtimes while preserving unrelated settings', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'gk-provider-race-'))
  const provider = { id: 'plugin:fixture', family: 'plugin:fixture', name: 'Fixture', shortName: 'Fixture', icon: 'terminal', browser: 'none', loginCommand: '', planName: '' } as const
  writeFileSync(join(folder, 'settings.json'), JSON.stringify({ ...DEFAULT_SETTINGS, providerPlugins: [provider], chatProviders: ['codex'], chatProvider: 'codex', correctProvider: 'codex', providerAutoUpdate: false, theme: 'light' }))
  configureCorePlatform({ directory: () => folder, source: () => false })
  const sessions: Pick<CoreRuntime['sessions'], 'providerInUse' | 'setInstructions' | 'refresh'> = { providerInUse: () => [], setInstructions: async () => undefined, refresh: async () => undefined }
  const runtime = { sessions, managerView: () => ({ config: DEFAULT_MANAGER_CONFIG, state: 'off', workers: [], activity: [], providers: [], decisions: [], queued: 0 }) } satisfies Pick<CoreRuntime, 'managerView'> & { readonly sessions: typeof sessions }
  try {
    const pending = uninstallProvider(runtime, provider.id, true)
    await vi.waitFor(() => expect(lifecycle.resume).toBeDefined())
    expect(() => setSettings({ chatProviders: ['codex', 'plugin:fixture'] })).toThrow('library is changing')
    expect(() => assertProviderAvailable('plugin:fixture')).toThrow('library is changing')
    setSettings({ theme: 'dark', phrases: ['concurrent unrelated edit'] })
    lifecycle.resume?.()
    await pending
    expect(getSettings()).toMatchObject({ theme: 'dark', phrases: ['concurrent unrelated edit'], chatProviders: ['codex'], chatProvider: 'codex', correctProvider: 'codex', providerPlugins: [] })
    expect(() => assertProviderAvailable('plugin:fixture')).not.toThrow()
  } finally { lifecycle.resume?.(); rmSync(folder, { recursive: true, force: true }) }
})
