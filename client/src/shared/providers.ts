import type { ClaudeTransport, SessionProvider, Settings } from './api'

export type LlmProviderId = 'codex' | 'claude-stream' | 'claude-tmux' | `plugin:${string}`

export interface LlmProviderInfo {
  readonly id: LlmProviderId
  readonly family: SessionProvider
  readonly transport?: ClaudeTransport | undefined
  readonly name: string
  readonly shortName: string
  readonly icon: string
  readonly iconPath?: string
  readonly browser: 'codex' | 'claude' | 'none'
  readonly loginCommand: string
  readonly planName: string
  readonly resumeCommand?: string
  readonly source?: string
  readonly localOnly?: boolean
  readonly replaces?: 'codex'
  readonly runtime?: 'codex'
  readonly instructions?: 'claude' | 'codex' | 'own'
}

export interface PluginUpdateResult {
  readonly ready: readonly string[]
  readonly failed: readonly string[]
}

const CLAUDE_STREAM: LlmProviderInfo = { id: 'claude-stream', family: 'claude', transport: 'stream', name: 'Claude Code', shortName: 'Claude', icon: 'claude', browser: 'claude', loginCommand: 'claude auth login', planName: 'Claude' }
const CLAUDE_TMUX: LlmProviderInfo = { id: 'claude-tmux', family: 'claude', transport: 'tmux', name: 'Claude Code (tmux)', shortName: 'Claude', icon: 'claude', browser: 'claude', loginCommand: 'claude auth login', planName: 'Claude', localOnly: true }
const CODEX: LlmProviderInfo = { id: 'codex', family: 'codex', transport: undefined, name: 'Codex', shortName: 'Codex', icon: 'codex', browser: 'codex', loginCommand: 'codex login', planName: 'ChatGPT', localOnly: true, runtime: 'codex' }

export const LLM_PROVIDERS: readonly LlmProviderInfo[] = [CLAUDE_STREAM, CODEX]

export const instructionsFor = (provider: LlmProviderInfo): 'claude' | 'codex' | 'own' =>
  provider.instructions ?? (provider.family === 'claude' ? 'claude' : provider.runtime === 'codex' ? 'codex' : 'own')

export const selectableProviders = (settings: Pick<Settings, 'chatProviders' | 'providerPlugins'>): readonly LlmProviderInfo[] =>
  [...LLM_PROVIDERS.map((one) => llmProviderInfo(one.family, 'stream', settings.providerPlugins)), ...settings.providerPlugins.filter((one) => one.family !== 'claude' && one.replaces === undefined)].filter((one) => settings.chatProviders.includes(one.family))

let installed: readonly LlmProviderInfo[] = []
let iconPaths = new Map<string, string>()

export const registerProviderInfo = (providers: readonly LlmProviderInfo[]): void => {
  if (installed === providers) return
  installed = providers
  iconPaths = new Map(providers.flatMap((one) => one.iconPath === undefined ? [] : [[one.icon, one.iconPath] as const]))
}

export const providerIconPath = (name: string): string | undefined => iconPaths.get(name)

export const modelVersion = (id: string): string | undefined => {
  const match = /^(?:claude-[a-z]+-|gpt-)(\d+)(?:[-.](\d+))?(?:-|\[|$)/.exec(id)
  return match === null ? undefined : [match[1], match[2]].filter((part) => part !== undefined).join('.')
}

export const llmProviderId = (family: SessionProvider, transport: ClaudeTransport = 'stream'): LlmProviderId =>
  family === 'codex' ? 'codex' : family === 'claude' ? transport === 'tmux' ? 'claude-tmux' : 'claude-stream' : family

export const llmProviderInfo = (family: SessionProvider, transport: ClaudeTransport = 'stream', plugins: readonly LlmProviderInfo[] = installed): LlmProviderInfo =>
  family === 'codex' ? plugins.find((one) => one.replaces === 'codex') ?? CODEX : family === 'claude' ? transport === 'tmux' ? plugins.find((one) => one.id === 'claude-tmux') ?? CLAUDE_TMUX : CLAUDE_STREAM : plugins.find((one) => one.family === family) ?? {
    id: family, family, transport: undefined, name: family.slice('plugin:'.length), shortName: family.slice('plugin:'.length), icon: 'terminal', browser: 'none', loginCommand: '', planName: '',
  }

export const isCodexProvider = (family: SessionProvider): boolean => family === 'codex' || llmProviderInfo(family).runtime === 'codex'
