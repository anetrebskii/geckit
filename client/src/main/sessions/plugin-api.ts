export type { LlmProvider, ProviderBrowser, ProviderFork, ProviderGoal, ProviderLimits, ProviderRow } from './provider'
export type { Driver, Heard, Signal } from './heard'
export type { ClaudeOptions as ProviderSessionOptions } from './claude'
export type { Conversation as ProviderConversation } from './disk'
export type { ClaudeModel as ProviderModel, ClaudeAccount as ProviderAccount, ClaudeProgram as ProviderProgram, ModelPricing, ProviderQuota, ProviderUsage, SessionSpend } from '../../shared/api'
export type { LlmProviderInfo, LlmProviderId } from '../../shared/providers'

export type PluginLogLevel = 'debug' | 'info' | 'warn' | 'error'
export type PluginLogValue = string | number | boolean | null
export interface PluginLogFields {
  readonly [key: string]: PluginLogValue
}
export interface PluginLogger {
  readonly path: string
  write(level: PluginLogLevel, event: string, fields?: PluginLogFields): void
}
export interface PluginContext {
  readonly log: PluginLogger
}
