import type { ManagerIntakeConfig, ManagerIntakeView, VoiceMemosConnection } from './manager-intake'
import type { TelegramAccount } from './telegram'
import type { ChatSession, ManagerLabels, SessionItem, SessionItems, SessionMessage, SessionProvider, Settings } from './api'

export const MANAGER_CHAT_GUIDANCE = 'Open Manager chat to send a request.'
export const MANAGER_CHAT_UPDATE = 'Manager chat needs a service update. Finish active work, then restart GeckIt.'

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

export const MANAGER_MAIN_THREAD = 'main'
export const MANAGER_LABELS = 8
export const MANAGER_LABEL_KEY = 40
export const MANAGER_LABEL_VALUE = 300

/** One of Manager's conversations with the outside world: GeckIt itself, a Telegram chat, a Slack thread. */
export interface ManagerThread {
  readonly id: string
  /** The channel's name, such as "Telegram" or "Slack"; none for GeckIt. */
  readonly place?: string
  readonly title: string
  readonly labels: ManagerLabels
  /** Who wrote last, as the channel names them. */
  readonly from?: string
  readonly link?: string
  readonly session?: ChatSession['id']
  readonly state: 'idle' | 'working' | 'asks' | 'failed'
  readonly error?: string
  /** The thread's channel is off or may no longer talk to Manager. */
  readonly closed?: string
  readonly at: number
  readonly owns: readonly ChatSession['id'][]
  readonly follows: readonly ChatSession['id'][]
}

export interface ManagerThreadOpen {
  readonly channel: string
  readonly place: string
  readonly key: string
  readonly title?: string
  readonly labels?: ManagerLabels
  readonly from?: string
  readonly link?: string
}

export function managerLabels(labels: unknown): { readonly labels: ManagerLabels; readonly cut: boolean } {
  if (labels === null || typeof labels !== 'object' || Array.isArray(labels)) return { labels: {}, cut: labels !== undefined }
  const entries = Object.entries(labels as { readonly [key: string]: unknown }).flatMap(([key, value]): [string, string][] => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? [[key.trim().slice(0, MANAGER_LABEL_KEY), String(value).trim().slice(0, MANAGER_LABEL_VALUE)]] : []).filter(([key, value]) => key !== '' && value !== '')
  const kept = entries.slice(0, MANAGER_LABELS)
  const cut = kept.length !== Object.keys(labels).length || Object.entries(labels as { readonly [key: string]: unknown }).some(([key, value]) => key.trim().length > MANAGER_LABEL_KEY || typeof value === 'string' && value.trim().length > MANAGER_LABEL_VALUE)
  return { labels: Object.fromEntries(kept), cut }
}

export function managerThreadSaid(thread: Pick<ManagerThread, 'place' | 'from' | 'title'>): string {
  if (thread.place === undefined) return 'GeckIt'
  return [thread.place, thread.from ?? thread.title].join(' · ')
}

export interface ManagerView {
  readonly appChat?: boolean
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
  readonly threads?: readonly ManagerThread[]
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
  /** The thread it was raised in; GeckIt's own when absent. */
  readonly thread?: ManagerThread['id']
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
  readonly thread?: ManagerThread['id']
  readonly session: ChatSession['id']
  readonly workers: readonly ChatSession['id'][]
}

export type ManagerTelegramReply = ManagerReplyOrigin & {
  readonly chatId: TelegramAccount['chatId']
  readonly messageId: number
  readonly text: Extract<SessionItem, { kind: 'theirs' }>['text']
}
