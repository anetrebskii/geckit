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

export interface ChannelInfo {
  readonly id: ChannelId
  readonly name: string
  readonly icon: string
  readonly description?: string
  readonly fields: readonly ChannelField[]
  readonly source?: string
}

export interface ChannelSetting {
  readonly info: ChannelInfo
  readonly enabled: boolean
  /** Project folders the library may start conversations in. */
  readonly projects: readonly string[]
  /** Whether the library may talk to Manager. */
  readonly manager: boolean
  readonly config: ChannelValues
}

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
  /** A secret's new value, or null to forget it. */
  readonly secrets?: { readonly [key: string]: string | null }
}

export const channelId = (id: string): id is ChannelId => /^channel:[a-z][a-z0-9-]*$/.test(id)

export function missingFields(setting: Pick<ChannelSetting, 'info' | 'config'>, secrets: readonly string[]): readonly ChannelField[] {
  return setting.info.fields.filter((field) => {
    if (field.required !== true) return false
    if (field.type === 'secret') return !secrets.includes(field.key)
    const value = setting.config[field.key] ?? field.default
    return value === undefined || value === '' || Array.isArray(value) && value.length === 0
  })
}
