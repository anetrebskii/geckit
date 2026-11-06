import type { CardAnswer, ChatSession, ManagerLabels, SessionImage, SessionItem, SessionMode, SessionNotice, SessionProvider } from '../../shared/api'
import type { ChannelField, ChannelId, ChannelInfo, ChannelValue, ChannelValues } from '../../shared/channels'
import type { ManagerHistoryBoundary, ManagerHistoryChange, ManagerDecision } from '../../shared/manager'
import type { PluginLogger } from '../sessions/plugin-api'
import type { ThreadActivity } from '../manager-status'

export type { CardAnswer, ChannelField, ChannelId, ChannelInfo, ChannelValue, ChannelValues, ManagerDecision, ManagerLabels, PluginLogger, SessionImage, SessionItem, SessionNotice }

export type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json }

export interface ChannelConversation extends Pick<ChatSession, 'id' | 'root' | 'title' | 'state'> {
  readonly provider: SessionProvider
  readonly manager: boolean
}

/** A place where people write, as the channel names it: a chat, a Slack thread. The same key is always the same Manager thread. */
export interface ChannelThread {
  readonly key: string
  /** What the thread is about, shown in the Manager window; the first message shortened when absent. */
  readonly title?: string
  /** Who wrote last, as people read it. */
  readonly from?: string
  /** A link back to the place, shown as "Open in <channel>". */
  readonly link?: string
  /** Up to 8 labels, such as who started it or a thread id, for tracing it later. Never permissions. */
  readonly labels?: ManagerLabels
}

export interface ChannelStart {
  readonly root: string
  readonly text: string
  readonly provider?: SessionProvider
  readonly model?: string
  readonly mode?: SessionMode
  readonly employeeId?: string
  readonly images?: readonly SessionImage[]
  /** Labels kept on the conversation, shown in its Session info and found by Search. */
  readonly labels?: ManagerLabels
}

export interface ChannelSend {
  readonly text: string
  readonly images?: readonly SessionImage[]
  /** Who said it, as the channel names them. Manager reads it with the message. */
  readonly from?: string
}

export type ChannelEvent =
  | { readonly kind: 'history'; readonly change: ManagerHistoryChange }
  | { readonly kind: 'items'; readonly items: readonly SessionItem[]; readonly gone: readonly string[] }
  | { readonly kind: 'state'; readonly conversation: ChannelConversation }
  | { readonly kind: 'notice'; readonly notice: SessionNotice }
  | { readonly kind: 'decisions'; readonly decisions: readonly ManagerDecision[] }
  /** Manager's answer in a thread, ready to post, whoever wrote the message it answers. */
  | { readonly kind: 'answer'; readonly text: string }
  /** What Manager and the workers of a thread are doing now, sent when it changes; `StatusMessage` turns it into one edited status message. */
  | { readonly kind: 'status'; readonly activity: ThreadActivity }

export interface ChannelConversations {
  historyBoundary?(key: string): ManagerHistoryBoundary | undefined
  /** The Manager thread for this place, when this channel may talk to Manager and Manager is on. Without a place, the channel's one default thread. */
  manager(thread?: ChannelThread): string | undefined
  /** Adds labels to a conversation this channel started or to one of its Manager threads; an empty value removes one. */
  label(id: string, labels: ManagerLabels): void
  start(request: ChannelStart): Promise<string>
  send(id: string, message: ChannelSend): Promise<void>
  get(id: string): ChannelConversation | undefined
  /** Conversations this channel started, its Manager threads not included. */
  list(): readonly ChannelConversation[]
  items(id: string): Promise<readonly SessionItem[]>
  watch(id: string, listener: (event: ChannelEvent) => void): () => void
  /** A card in the conversation, or one of Manager's decisions. */
  answer(id: string, card: string, answer: CardAnswer | string): Promise<boolean>
  stop(id: string): Promise<void>
}

export interface ChannelContext {
  readonly id: ChannelId
  readonly log: PluginLogger
  config(): ChannelValues
  secret(key: string): string | undefined
  readonly store: {
    get(key: string): Json | undefined
    set(key: string, value: Json | undefined): void
  }
  /** What the channel says about its own connection, shown in Settings. */
  status(state: 'starting' | 'connected' | 'failed', says?: string): void
  projects(): readonly { readonly root: string; readonly name: string }[]
  providers(): readonly SessionProvider[]
  employees(): readonly { readonly id: string; readonly name: string; readonly role: string }[]
  readonly conversations: ChannelConversations
}

export interface Channel {
  start(): Promise<void>
  stop(): Promise<void>
}

export interface ChannelModule {
  readonly create: (context: ChannelContext) => Channel | Promise<Channel>
}
