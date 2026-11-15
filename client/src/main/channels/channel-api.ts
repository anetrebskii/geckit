import type { ChannelScreen, ChannelScreenRequest } from '../../shared/channel-ui'
import type { ChannelChange, ChannelSetting, ChannelsView } from '../../shared/channels'
import type { ChannelFileSender } from './channel-files'
import type { ChannelAttachment } from '../channel-attachments'
import type { CardAnswer, ChatSession, ManagerLabels, SessionImage, SessionItem, SessionMode, SessionNotice, SessionProvider } from '../../shared/api'
import type { ChannelCapability, ChannelField, ChannelId, ChannelInfo, ChannelValue, ChannelValues } from '../../shared/channels'
import type { ManagerHistoryBoundary, ManagerHistoryChange, ManagerDecision, ManagerDecisionOutcome, ManagerQuotedReply, ManagerReplyOrigin, ManagerRequestSource, ManagerSpeech, ManagerView } from '../../shared/manager'
import type { SharedLink } from '../../shared/share'
import type { Shares } from '../shares'
import type { PluginLogger } from '../sessions/plugin-api'
import type { ThreadActivity } from '../manager-status'

export type { ChannelScreen, ChannelScreenRequest } from '../../shared/channel-ui'
export { ChannelDecisionError, channelDecisionReason } from '../../shared/channel-ui'

export type { CardAnswer, ChannelCapability, ChannelField, ChannelId, ChannelInfo, ChannelValue, ChannelValues, ManagerDecision, ManagerDecisionOutcome, ManagerLabels, ManagerQuotedReply, ManagerReplyOrigin, ManagerRequestSource, ManagerSpeech, PluginLogger, SessionImage, SessionItem, SessionNotice, SharedLink }

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
  /** Many people write here: answers are kept until the channel delivers them (`deliver`), and the queue is limited. Version 2. */
  readonly shared?: boolean
  /** The owner's own chat (needs control): it also gets GeckIt-wide decisions and worker review notices. Version 2. */
  readonly owner?: boolean
  /** Who is paired in this owner chat, so a decision made under an earlier pairing is not used. Version 2. */
  readonly pairing?: string
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
  readonly attachments?: readonly ChannelAttachment['id'][]
  readonly authorized?: () => boolean
  readonly text: string
  readonly images?: readonly SessionImage[]
  /** Who said it, as the channel names them. Manager reads it with the message. */
  readonly from?: string
  /** The channel's own id for this message, so sending it again after a restart queues it once. Version 2. */
  readonly id?: string
  /** Who asked, in the channel's terms; kept with the work it starts. Never permissions. Version 2. */
  readonly request?: ManagerRequestSource
  /** replies: the `reply` of an earlier `answer` the person replied to, with the words quoted. */
  readonly replyTo?: ManagerQuotedReply
}

/** Where a message stands: in Manager's queue, taken, answered, or refused with the reason. */
export type ChannelDelivery = 'queued' | 'accepted' | 'answered'

/** Who answered a decision, recorded with it. */
export interface ChannelActor {
  readonly id: string
  readonly name?: string
}

export type ChannelEvent =
  | { readonly kind: 'history'; readonly change: ManagerHistoryChange }
  | { readonly kind: 'items'; readonly items: readonly SessionItem[]; readonly gone: readonly string[] }
  | { readonly kind: 'state'; readonly conversation: ChannelConversation }
  | { readonly kind: 'notice'; readonly notice: SessionNotice }
  | { readonly kind: 'decisions'; readonly decisions: readonly ManagerDecision[] }
  /** Manager's answer in a thread, ready to post, whoever wrote the message it answers. Version 2 adds `reply`, to pass back as `replyTo`, and the thread's language. */
  | { readonly kind: 'answer'; readonly text: string; readonly reply?: ManagerReplyOrigin; readonly language?: ManagerSpeech }
  /** delivery: a message this channel sent changed state. */
  | { readonly kind: 'delivery'; readonly message: string; readonly state: ChannelDelivery }
  /** An owner chat only: a worker Manager follows asks for the person. */
  | { readonly kind: 'review'; readonly title: string; readonly body: string }
  /** What Manager and the workers of a thread are doing now, sent when it changes; `StatusMessage` turns it into one edited status message. */
  | { readonly kind: 'status'; readonly activity?: ThreadActivity }

export interface ChannelConversations {
  historyBoundary?(key: string): ManagerHistoryBoundary | undefined
  /** The Manager thread for this place, when this channel may talk to Manager and Manager is on. Without a place, the channel's one default thread. */
  manager(thread?: ChannelThread): string | undefined
  /** Adds labels to a conversation this channel started or to one of its Manager threads; an empty value removes one. */
  label(id: string, labels: ManagerLabels): void
  start(request: ChannelStart): Promise<string>
  /** Returns the session that took the message: Manager's for a thread, the conversation's own otherwise. */
  send(id: string, message: ChannelSend): Promise<string>
  get(id: string): ChannelConversation | undefined
  /** Conversations this channel started, its Manager threads not included. */
  list(): readonly ChannelConversation[]
  items(id: string): Promise<readonly SessionItem[]>
  watch(id: string, listener: (event: ChannelEvent) => void): () => void
  /** A card in the conversation, or one of Manager's decisions. */
  answer(id: string, card: string, answer: CardAnswer | string): Promise<boolean>
  stop(id: string): Promise<void>
  /** Version 2: a decision in a Manager thread, with who answered; free words go to Manager as a reply to it. */
  decide?(thread: string, decision: string, choice: string, options?: { readonly by?: ChannelActor; readonly authorized?: () => boolean }): Promise<ManagerDecisionOutcome | undefined>
  /** Version 2: the decisions open in this thread; an owner thread also has GeckIt-wide ones. */
  decisions?(thread: string): readonly ManagerDecision[]
  /** Version 2: the language of the last message a person wrote in this thread. */
  language?(thread: string): ManagerSpeech | undefined
  /** Version 2: whether Manager is on. */
  managerOn?(): boolean
  /** Version 2: told when Manager is turned on or off. */
  watchManager?(listener: (on: boolean) => void): () => void
  /** Version 2: whether an answer's reply reference still leads to work Manager follows. */
  current?(reply: ManagerReplyOrigin): boolean
  /** Version 2: the channel's connection is verified; resume durable work in this shared thread. */
  ready?(thread: string): void
  /** Version 2: close every Manager thread of this channel with the reason, or open them again with undefined. */
  close?(reason: string | undefined): void
  /** Version 2, shared threads: the route that posts kept answers; called once per answer, `beforeSend` right before posting. */
  deliver?(thread: string, sender: (text: string, reply: ManagerReplyOrigin, beforeSend: () => void) => Promise<void>): () => void
  /** Version 2: a short status line for the thread, as a /status command shows it. */
  summary?(thread: string): ChannelThreadSummary | undefined
  /** delivery: where a message this channel sent stands; undefined once it is gone from Manager's queue. */
  delivery?(message: string): ChannelDelivery | undefined
  /** delivery: the messages of this thread Manager has not answered yet. */
  pending?(thread: string): readonly string[]
  /** delivery: whether Manager is at work on this thread now, for a typing indicator. */
  working?(thread: string): boolean
}

export interface ChannelThreadSummary {
  readonly manager: ManagerView['state']
  readonly state: 'idle' | 'working' | 'asks' | 'failed'
  readonly workers: number
  readonly uncertain: number
  readonly error?: string
}

/** control: Manager itself, for the owner's chat. */
export interface ChannelControl {
  pause(): Promise<void>
  resume(): Promise<void>
  view(): ManagerView
}

/** shares: local pages shared from this computer. */
export interface ChannelShares extends Pick<Shares, 'list' | 'open' | 'stop' | 'stopAll'> {
  /** Told when the list changes, and when one page stops by itself. */
  watch(listener: (change: { readonly kind: 'changed' } | { readonly kind: 'ended'; readonly id: string }) => void): () => void
}

export interface ChannelContext {
  readonly id: ChannelId
  /** What this run may do: what the manifest asked for, granted. Version 2. */
  readonly capabilities?: ReadonlySet<ChannelCapability>
  readonly log: PluginLogger
  config(): ChannelValues
  secret(key: string): string | undefined
  readonly store: {
    get(key: string): Json | undefined
    set(key: string, value: Json | undefined): void
  }
  /** The channel's own text kept sealed by GeckIt's secure storage, such as a token it was given while connecting. */
  readonly sealed: ChannelSealed
  /** What the channel says about its own connection, shown in Settings. */
  status(state: 'starting' | 'connected' | 'failed', says?: string): void
  projects(): readonly { readonly root: string; readonly name: string }[]
  providers(): readonly SessionProvider[]
  employees(): readonly { readonly id: string; readonly name: string; readonly role: string }[]
  readonly files?: {
    keep(thread: string, bytes: Buffer, name: string, media: string): ChannelAttachment['id']
    /** Whether a kept file is still there for this thread. */
    has(thread: string, id: ChannelAttachment['id']): boolean
    /** Keeps these files from expiring until the next call; an empty list lets them go. */
    hold(ids: readonly ChannelAttachment['id'][]): void
    /** `limit`: the largest document the channel takes, in MB; 10 when absent. */
    bind(thread: string, sender: ChannelFileSender, limit?: number): () => void
  }
  readonly conversations: ChannelConversations
  readonly control?: ChannelControl
  readonly shares?: ChannelShares
  /** Version 2: what the channel's own Settings screen shows, sent to it as it changes. */
  view?(value: Json): void
}

export interface Channel {
  start(): Promise<void>
  stop(): Promise<void>
  /** Version 2: a running channel answers its own Settings screen, such as pairing; `from` says whether the computer or the phone asks. */
  request?(request: Json, from: 'desktop' | 'phone'): Promise<Json>
}

/** What a channel may read while it is being set up, whether or not it runs. */
export interface ChannelSetupContext {
  readonly id: ChannelId
  readonly log: PluginLogger
  config(): ChannelValues
  secret(key: string): string | undefined
}

export interface ChannelSettingsContext extends ChannelSetupContext {
  setting(): ChannelSetting
  viewed(): Json | undefined
  request(value: Json): Promise<Json>
  inspect(value: Json): Promise<Json>
  configure(change: ChannelChange): Promise<ChannelsView>
}

/** What a channel may change before a start after an update. */
export interface ChannelMigration {
  /** Whether this start added the channel's setting. */
  readonly created: boolean
  /** Changes the channel's own setting, such as turning it on the first time. */
  configure(change: { readonly enabled?: boolean; readonly manager?: boolean }): void
  renameManagerChannel(from: string, to: string, shared: (key: string) => boolean): void
  renameNoteKey(from: string, to: string): void
  /** Moves a file an earlier version sealed in the data folder into this channel's `sealed`, when the channel has none yet. */
  adoptSealed(name: string): void
}

export interface ChannelSealed {
  available(): boolean
  /** Undefined when nothing is kept; throws when what is kept cannot be read. */
  read(): string | undefined
  /** Undefined removes it. */
  write(text: string | undefined): void
}

export interface ChannelModule {
  readonly restoreManager?: (record: Json) => Json
  readonly create: (context: ChannelContext) => Channel | Promise<Channel>
  readonly settings?: (context: ChannelSettingsContext, request: ChannelScreenRequest) => Promise<ChannelScreen>
  readonly present?: (value: Json, from: 'desktop' | 'phone') => Json
  /** Carries earlier data; must be harmless when repeated. */
  readonly migrate?: (migration: ChannelMigration) => void
  /** Answers Settings while the channel is set up: checks its secrets, lists what it can reach. Optional. */
  readonly inspect?: (setup: ChannelSetupContext, request: Json) => Promise<Json>
}
