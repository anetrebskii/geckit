import type { CardAnswer, ChatSession, SessionImage, SessionItem, SessionMode, SessionNotice, SessionProvider } from '../../shared/api'
import type { ChannelField, ChannelId, ChannelInfo, ChannelValue, ChannelValues } from '../../shared/channels'
import type { ManagerDecision } from '../../shared/manager'
import type { PluginLogger } from '../sessions/plugin-api'

export type { CardAnswer, ChannelField, ChannelId, ChannelInfo, ChannelValue, ChannelValues, ManagerDecision, PluginLogger, SessionImage, SessionItem, SessionNotice }

export type Json = string | number | boolean | null | readonly Json[] | { readonly [key: string]: Json }

export interface ChannelConversation extends Pick<ChatSession, 'id' | 'root' | 'title' | 'state'> {
  readonly provider: SessionProvider
  readonly manager: boolean
}

export interface ChannelStart {
  readonly root: string
  readonly text: string
  readonly provider?: SessionProvider
  readonly model?: string
  readonly mode?: SessionMode
  readonly employeeId?: string
  readonly images?: readonly SessionImage[]
}

export interface ChannelSend {
  readonly text: string
  readonly images?: readonly SessionImage[]
  /** Who said it, as the channel names them. Manager reads it with the message. */
  readonly from?: string
}

export type ChannelEvent =
  | { readonly kind: 'items'; readonly items: readonly SessionItem[]; readonly gone: readonly string[] }
  | { readonly kind: 'state'; readonly conversation: ChannelConversation }
  | { readonly kind: 'notice'; readonly notice: SessionNotice }
  | { readonly kind: 'decisions'; readonly decisions: readonly ManagerDecision[] }

export interface ChannelConversations {
  /** Manager's conversation, when this channel may talk to Manager and Manager is on. */
  manager(): string | undefined
  start(request: ChannelStart): Promise<string>
  send(id: string, message: ChannelSend): Promise<void>
  get(id: string): ChannelConversation | undefined
  /** Conversations this channel started, Manager not included. */
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
