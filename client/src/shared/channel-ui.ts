import type { ChannelField, ChannelJson, ChannelValues } from './channels'

export interface ChannelScreenAction {
  readonly label: string
  readonly action?: ChannelJson
  readonly href?: string
  readonly primary?: boolean
  readonly confirm?: string
}

export interface ChannelScreenSection {
  readonly title?: string
  readonly text?: readonly string[]
  readonly fields?: readonly ChannelField[]
  readonly actions?: readonly ChannelScreenAction[]
}

export interface ChannelScreen extends ChannelScreenSection {
  readonly state?: ChannelJson
  readonly sections?: readonly ChannelScreenSection[]
}

export interface ChannelScreenRequest {
  readonly state?: ChannelJson
  readonly action?: ChannelJson
  readonly values?: ChannelValues
}

export type ChannelDecisionReason = 'paused' | 'native' | 'choice' | 'changed'

export class ChannelDecisionError extends Error {
  constructor(readonly reason: ChannelDecisionReason, message: string) { super(message) }
}

export const channelDecisionReason = (error: object): ChannelDecisionReason | undefined => {
  if (!('reason' in error)) return undefined
  const reason = error.reason
  return reason === 'paused' || reason === 'native' || reason === 'choice' || reason === 'changed' ? reason : undefined
}
