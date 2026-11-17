export type ChannelId = `channel:${string}`

export interface ChannelField {
  readonly key: string
  readonly label: string
  readonly type: 'text' | 'secret' | 'list' | 'boolean'
  readonly required?: boolean
  readonly help?: string
  readonly default?: ChannelValue
}

export type ChannelValue = string | boolean | readonly string[]

export interface ChannelValues {
  readonly [key: string]: ChannelValue
}

/** What a channel may do; a version 1 library asks for conversations and manager only. */
export type ChannelCapability = 'conversations' | 'manager' | 'replies' | 'delivery' | 'control' | 'files' | 'shares'
export const CHANNEL_CAPABILITIES: readonly ChannelCapability[] = ['conversations', 'manager', 'replies', 'delivery', 'control', 'files', 'shares']
/** Legacy grant names retained for compatibility. */
export const CHANNEL_GRANTS: readonly ChannelCapability[] = ['control', 'files', 'shares']
export const V1_CAPABILITIES: readonly ChannelCapability[] = ['conversations', 'manager']
export const channelCapability = (value: unknown): value is ChannelCapability => typeof value === 'string' && (CHANNEL_CAPABILITIES as readonly string[]).includes(value)

export interface ChannelInfo {
  readonly id: ChannelId
  readonly name: string
  readonly icon: string
  readonly description?: string
  readonly fields: readonly ChannelField[]
  readonly source?: string
  /** What the channel asks for; absent for a version 1 library. */
  readonly capabilities?: readonly ChannelCapability[]
}

export interface ChannelSetting {
  readonly info: ChannelInfo
  readonly enabled: boolean
  /** Legacy field; all GeckIt project folders are available. */
  readonly projects: readonly string[]
  /** Legacy field; Manager access is always enabled when declared. */
  readonly manager: boolean
  readonly config: ChannelValues
  /** Legacy field; declared capabilities are always enabled. */
  readonly grants?: readonly ChannelCapability[]
}

export const askedCapabilities = (info: Pick<ChannelInfo, 'capabilities'>): readonly ChannelCapability[] => info.capabilities ?? V1_CAPABILITIES

/** What a channel gets: every capability it declared. */
export const grantedCapabilities = (setting: Pick<ChannelSetting, 'info' | 'grants'>): readonly ChannelCapability[] => askedCapabilities(setting.info)

export type ChannelState = 'off' | 'setup' | 'starting' | 'connected' | 'failed'

export interface ChannelView {
  readonly id: ChannelId
  readonly name: string
  readonly icon: string
  readonly source?: string
  readonly state: ChannelState
  readonly says?: string
  /** Secret fields that have a saved value. */
  readonly secrets: readonly string[]
  readonly conversations: number
  /** Manager threads it has opened. */
  readonly threads?: number
  /** Comes with GeckIt: turned off, never removed. */
  readonly builtIn?: true
  readonly settings?: boolean
  /** Declared legacy grant names; every declared capability is enabled. */
  readonly asks?: readonly ChannelCapability[]
  readonly grants?: readonly ChannelCapability[]
}

export interface ChannelFailure {
  readonly id?: ChannelId
  readonly name: string
  readonly source?: string
  readonly error: string
}

export interface ChannelsView {
  readonly channels: readonly ChannelView[]
  readonly failures: readonly ChannelFailure[]
}

export interface ChannelChange {
  readonly enabled?: boolean
  readonly projects?: readonly string[]
  readonly manager?: boolean
  readonly config?: ChannelValues
  /** Legacy input, ignored; all declared capabilities are enabled. */
  readonly grants?: readonly ChannelCapability[]
  /** A secret's new value, or null to forget it. */
  readonly secrets?: { readonly [key: string]: string | null }
}

export type ChannelJson = string | number | boolean | null | readonly ChannelJson[] | { readonly [key: string]: ChannelJson }
/** What Settings asks a channel while it is set up, and what it answers; each channel names its own shape (Discord: shared/discord.ts). */
export type ChannelInspectRequest = ChannelJson
export type ChannelInspectResult = ChannelJson

export const channelId = (id: string): id is ChannelId => /^channel:[a-z][a-z0-9-]*$/.test(id)

export function missingFields(setting: Pick<ChannelSetting, 'info' | 'config'>, secrets: readonly string[]): readonly ChannelField[] {
  return setting.info.fields.filter((field) => {
    if (field.required !== true) return false
    if (field.type === 'secret') return !secrets.includes(field.key)
    const value = setting.config[field.key] ?? field.default
    return value === undefined || value === '' || Array.isArray(value) && value.length === 0
  })
}
