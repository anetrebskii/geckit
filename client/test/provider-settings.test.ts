import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { SessionProvider, Settings } from '../src/shared/api'
import { DEFAULT_MANAGER_CONFIG } from '../src/shared/manager'
import { providerCatalog, providerSettings } from '../src/main/provider-settings'

function fixture() {
  const mcode = { id: 'plugin:mcode', family: 'plugin:mcode', name: 'MCode', shortName: 'MCode', icon: 'terminal', browser: 'none', loginCommand: 'mcode login', planName: 'MiniMax' } as const
  let settings: Settings = { ...DEFAULT_SETTINGS, providerPlugins: [mcode], chatProviders: ['claude', 'codex', 'plugin:mcode'], chatProvider: 'plugin:mcode', correctProvider: 'plugin:mcode' }
  const save = vi.fn((change: Partial<Settings>) => settings = { ...settings, ...change })
  let active: readonly string[] = []
  const command = (...args: string[]): string => providerSettings(args, { read: () => settings, save, manager: () => DEFAULT_MANAGER_CONFIG, inUse: () => active })
  const disable = (provider: SessionProvider, expected = settings.chatProviders): string => command('disable', '--provider', provider, '--expected', JSON.stringify(expected))
  return { command, disable, save, read: () => settings, active: (ids: readonly string[]) => { active = ids }, change: (change: Partial<Settings>) => { settings = { ...settings, ...change } } }
}

describe('provider configuration with synthetic MCode', () => {
  it('leaves exactly enabled MCode, without changing defaults, library records or unrelated preferences', () => {
    const f = fixture()
    const before = f.read()
    f.disable('claude')
    f.disable('codex')
    expect(f.read()).toEqual({ ...before, chatProviders: ['plugin:mcode'] })
    expect(f.save).toHaveBeenCalledTimes(2)
    expect(() => f.disable('plugin:mcode')).toThrow('at least one')
  })
  it('lists disabled providers without enabling or installing anything', () => {
    const f = fixture()
    f.disable('claude')
    expect(providerCatalog(f.read()).find((one) => one.family === 'claude')?.enabled).toBe(false)
    f.command('list')
    expect(f.save).toHaveBeenCalledTimes(1)
  })
  it('rejects stale enabled lists and unknown providers atomically', () => {
    const f = fixture()
    expect(() => f.disable('claude', ['codex'])).toThrow('changed')
    expect(() => f.command('enable', '--provider', 'plugin:unknown', '--expected', '[]')).toThrow('installed provider')
    expect(f.save).not.toHaveBeenCalled()
  })
  it('refuses active/held/queued work and dependent preferences', () => {
    const f = fixture()
    f.active(['claude-live'])
    expect(() => f.disable('claude')).toThrow('active, held or queued')
    f.active([])
    f.change({ chatProvider: 'claude' })
    expect(() => f.disable('claude')).toThrow('default chat provider')
    f.change({ chatProvider: 'plugin:mcode', correctProvider: 'claude' })
    expect(() => f.disable('claude')).toThrow('text correction provider')
    f.change({ correctProvider: 'plugin:mcode', projectAssistants: [{ root: '/project', provider: 'claude' }] })
    expect(() => f.disable('claude')).toThrow('project /project')
    expect(f.save).not.toHaveBeenCalled()
  })
  it('requires explicit enable with current expected values and supports idempotent readback', () => {
    const f = fixture()
    f.disable('claude')
    const expected = JSON.stringify(f.read().chatProviders)
    f.command('enable', '--provider', 'claude', '--expected', expected)
    expect(f.read().chatProviders).toEqual(['codex', 'plugin:mcode', 'claude'])
    expect(JSON.parse(f.command('enable', '--provider', 'claude', '--expected', JSON.stringify(f.read().chatProviders)))).toMatchObject({ changed: false })
    expect(f.save).toHaveBeenCalledTimes(2)
  })
})
