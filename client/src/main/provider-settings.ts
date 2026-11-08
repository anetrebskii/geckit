import { isDeepStrictEqual } from 'node:util'
import type { SessionProvider, Settings } from '../shared/api'
import type { ManagerConfig } from '../shared/manager'
import { independentProviderInfo, LLM_PROVIDERS } from '../shared/providers'

export interface ProviderSettingsDeps {
  readonly read: () => Settings
  readonly save: (change: Partial<Settings>) => Settings
  readonly inUse: (provider: SessionProvider) => readonly string[]
  readonly manager: () => ManagerConfig
}

export function providerCatalog(settings: Pick<Settings, 'providerPlugins' | 'chatProviders'>) {
  return [...LLM_PROVIDERS, ...settings.providerPlugins.map(independentProviderInfo)].map((provider) => ({ ...provider, enabled: settings.chatProviders.includes(provider.family) }))
}

export function providerSettings(args: readonly string[], deps: ProviderSettingsDeps): string {
  const [command, ...rest] = args
  if (command === 'list' && (rest.length === 0 || rest.length === 1 && rest[0] === '--json')) return JSON.stringify(providerCatalog(deps.read()))
  if (command !== 'enable' && command !== 'disable') throw new Error('Use providers list or providers enable|disable --provider <id> --expected <enabled-provider-array>.')
  const flags = new Map<string, string>()
  for (let at = 0; at < rest.length; at += 2) {
    const flag = rest[at]
    const value = rest[at + 1]
    if (flag === undefined || !['--provider', '--expected'].includes(flag) || value === undefined || flags.has(flag)) throw new Error('Use --provider and --expected once each.')
    flags.set(flag, value)
  }
  const settings = deps.read()
  const provider = providerCatalog(settings).find((one) => one.family === flags.get('--provider'))?.family
  if (provider === undefined) throw new Error('Choose an installed provider ID from providers list. Nothing was installed or enabled.')
  let expected: readonly string[]
  try {
    const parsed: readonly string[] = JSON.parse(flags.get('--expected') ?? '') as readonly string[]
    if (!Array.isArray(parsed) || !parsed.every((one) => typeof one === 'string')) throw new Error('Invalid expected providers')
    expected = parsed
  } catch { throw new Error('--expected must be the enabled-provider JSON array last read from settings show.') }
  if (!isDeepStrictEqual(settings.chatProviders, expected)) throw new Error('Enabled providers changed. Read settings show and merge before retrying.')
  const enabled = settings.chatProviders.includes(provider)
  if (enabled === (command === 'enable')) return JSON.stringify({ saved: true, changed: false, chatProviders: settings.chatProviders })
  const providers = command === 'enable' ? [...settings.chatProviders, provider] : settings.chatProviders.filter((one) => one !== provider)
  if (providers.length === 0) throw new Error('Keep at least one enabled provider.')
  if (command === 'disable') {
    assertProviderUnused(provider, settings, deps)
  }
  const saved = deps.save({ chatProviders: providers })
  return JSON.stringify({ saved: true, changed: true, chatProviders: saved.chatProviders })
}

export function assertProviderUnused(provider: SessionProvider, settings: Settings, deps: Pick<ProviderSettingsDeps, 'manager' | 'inUse'>): void {
    const manager = deps.manager()
    const dependencies = [
      ...(settings.chatProvider === provider ? ['default chat provider'] : []),
      ...(settings.correctProvider === provider ? ['text correction provider'] : []),
      ...(manager.enabled && manager.provider === provider ? ['Manager provider'] : []),
      ...settings.projectAssistants.filter((one) => one.provider === provider).map((one) => `project ${one.root}`),
      ...settings.shortcuts.filter((one) => one.on && one.target !== 'manager' && (one.provider ?? 'claude') === provider).map((one) => `shortcut ${one.name}`),
    ]
    if (dependencies.length > 0) throw new Error(`Provider is still selected by: ${dependencies.join(', ')}. Change these preferences explicitly before disabling it.`)
    const active = deps.inUse(provider)
    if (active.length > 0) throw new Error(`Provider still has active, held or queued work: ${active.join(', ')}. Finish or stop it before disabling the provider.`)
}
