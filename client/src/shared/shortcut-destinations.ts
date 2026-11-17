import type { ChannelId, ChannelInfo } from './channels'

export interface ShortcutDestination {
  readonly channel: ChannelId
  readonly destination: string
  readonly label?: string
}

export interface ShortcutDestinationChoice extends Pick<ChannelInfo, 'name'> {
  readonly id: string
  readonly model: 'thread'
}

export interface ShortcutDestinationChannel extends Pick<ChannelInfo, 'id' | 'name'> {
  readonly supported: boolean
  readonly destinations: readonly ShortcutDestinationChoice[]
  readonly error?: string
}

export interface ShortcutDestinationReceipt extends Pick<ShortcutDestination, 'destination'> {
  readonly thread: string
  readonly message?: string
  readonly link?: string
}
