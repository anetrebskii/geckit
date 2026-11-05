import type { ManagerIntakeConfig, ManagerIntakeView, VoiceMemosConnection } from './manager-intake'
import type { TelegramAccount } from './telegram'
import type { ChatSession, SessionItem, SessionItems, SessionMessage, SessionProvider, Settings } from './api'

export const MANAGER_CHAT_GUIDANCE = 'Open Manager chat to send a request.'

export type ManagerSendRequest = Pick<Extract<SessionItem, { kind: 'mine' }>, 'id' | 'text'> & Pick<SessionMessage, 'session'>
export type ManagerRequestReceipt = Pick<ManagerSendRequest, 'id'> & Required<Pick<SessionMessage, 'session'>> & {
  readonly state: 'queued' | 'sending' | 'sent'
}
export type ManagerQueuedRequest = ManagerRequestReceipt & Pick<Extract<SessionItem, { kind: 'mine' }>, 'text' | 'at'> & {
  readonly source: 'desktop' | 'telegram'
}
export type ManagerAnswerRequest = Pick<ManagerRequestReceipt, 'session' | 'id'> & { readonly choice: string }
export type ManagerAnswerResult = ManagerView & { readonly answer: ManagerDecisionOutcome }

export type ManagerConfig = Required<Pick<SessionMessage, 'provider'>> & Pick<Settings, 'chatModel'> & {
  readonly enabled: boolean
  readonly instructions: string
  readonly delegation: 'automatic' | 'approve'
  readonly intake?: ManagerIntakeConfig
}

export type ManagerInstructionsResult = Pick<ManagerConfig, 'instructions'> & { readonly guideError?: string }

export type ManagerActivity = Pick<SessionItem, 'id'> & {
  readonly at: number
  readonly command: readonly string[]
  readonly state: 'running' | 'done' | 'failed' | 'uncertain'
  readonly result?: string
}

export interface ManagerProvider {
  readonly provider: SessionProvider
  readonly available: boolean
  readonly reason?: string
}

export interface ManagerView {
  readonly intake?: ManagerIntakeView
  readonly config: ManagerConfig
  readonly state: 'off' | 'idle' | 'working' | 'paused' | 'blocked'
  readonly session?: ChatSession
  readonly workers: readonly ChatSession[]
  readonly activity: readonly ManagerActivity[]
  readonly providers: readonly ManagerProvider[]
  readonly decisions: readonly ManagerDecision[]
  readonly queued: number
  readonly requests?: readonly ManagerQueuedRequest[]
  readonly error?: string
}

export interface ManagerApi {
  voiceMemos(action?: 'privacy'): Promise<VoiceMemosConnection>
  view(): Promise<ManagerView>
  inspect(id: ChatSession['id']): Promise<SessionItems>
  send(request: ManagerSendRequest): Promise<ManagerRequestReceipt>
  receipt(id: ManagerSendRequest['id']): Promise<ManagerRequestReceipt | undefined>
  answer(request: ManagerAnswerRequest): Promise<ManagerAnswerResult>
  answerCard(session: ChatSession['id'], card: SessionItem['id'], answer: string): Promise<boolean>
  onItems(said: (items: SessionItems) => void): () => void
  configure(change: Partial<ManagerConfig>): Promise<ManagerView>
  pause(): Promise<ManagerView>
  resume(): Promise<ManagerView>
  retry(): Promise<ManagerView>
  restart(): Promise<ManagerView>
  on(said: (view: ManagerView) => void): () => void
}

export const DEFAULT_MANAGER_CONFIG: ManagerConfig = { enabled: false, provider: 'claude', chatModel: '', instructions: '', delegation: 'automatic' }

export interface ManagerDecision {
  readonly session?: ChatSession['id']
  readonly card?: SessionItem['id']
  readonly kind?: 'native' | 'intake'
  readonly id: string
  readonly title: string
  readonly choices: readonly { readonly label: string; readonly value: string }[]
}

export type ManagerDecisionOutcome = 'This recording could not be checked. Nothing was accepted. Check the source in Settings, then try again.' | 'Task confirmation saved. Manager handoff is pending; it will not create duplicate work.' | 'Task accepted by Manager.' | 'Note saved.' | 'Recording skipped.' | 'Answer sent.' | 'This request is no longer pending. Use /status to see current requests.' | 'Review recorded. Delivery remains uncertain; nothing was resent. Other work can continue.'

export interface ManagerCliAsked {
  readonly action: 'manage'
  readonly args: readonly string[]
  readonly session: string
  readonly token: string
  readonly operation: string
}

export type ManagerCliAnswered = { readonly ok: true; readonly result: string } | { readonly ok: false; readonly error: string }

export interface ProjectAssistant {
  readonly root: ChatSession['root']
  readonly provider: SessionProvider
}

export const managerProjects = (settings: Pick<Settings, 'projects' | 'profiles'>): readonly string[] => [...new Set([...settings.projects, ...settings.profiles.flatMap((profile) => profile.projects)])]

export type ManagerReplyOrigin = {
  readonly session: ChatSession['id']
  readonly workers: readonly ChatSession['id'][]
}

export type ManagerTelegramReply = ManagerReplyOrigin & {
  readonly chatId: TelegramAccount['chatId']
  readonly messageId: number
  readonly text: Extract<SessionItem, { kind: 'theirs' }>['text']
}
