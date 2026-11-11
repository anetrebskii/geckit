import type { SharedLink } from './share'

export interface TelegramAccount {
  readonly id: number
  readonly chatId: number
  readonly name: string
  readonly username?: string
  readonly team?: TelegramTeam
}

export interface TelegramTeam {
  readonly member?: { readonly route: string; readonly projects: readonly string[]; readonly approve: boolean }
  readonly topicId: number
  readonly title: string
  readonly generation: string
  readonly approvers: readonly number[]
  readonly allMembers: boolean
}

export const telegramThreadKey = (account: TelegramAccount): string => account.team === undefined ? String(account.chatId) : account.team.member !== undefined ? `team:dm:${account.team.generation}:${account.team.member.route}` : `team:${String(account.chatId)}:${String(account.team.topicId)}:${account.team.generation}`


export interface TelegramBot {
  readonly id: number
  readonly username: string
}

export interface TelegramView {
  readonly state: 'disconnected' | 'pairing' | 'confirming' | 'connected' | 'offline' | 'revoked' | 'conflict' | 'storage-error'
  readonly bot?: TelegramBot
  readonly pairing?: { readonly url: string; readonly expiresAt: number; readonly command?: string }
  readonly candidate?: TelegramAccount
  readonly account?: TelegramAccount
  readonly detail?: string
  readonly members?: TelegramMembersView
  readonly pendingLate: number
  /** The links shared from Telegram that are live now. */
  readonly links?: readonly SharedLink[]
}

export interface TelegramMembersView {
  readonly enabled: boolean
  readonly projects: readonly string[]
  readonly invites: readonly { readonly id: string; readonly url: string; readonly expiresAt: number; readonly candidate?: TelegramAccount }[]
  readonly people: readonly { readonly id: string; readonly account: TelegramAccount; readonly approve: boolean; readonly active: boolean; readonly projects?: readonly string[]; readonly pending?: number; readonly uncertain?: number; readonly detail?: string }[]
}

export type TelegramAction =
  | { readonly kind: 'members-configure'; readonly enabled: boolean; readonly projects: readonly string[] }
  | { readonly kind: 'members-invite' }
  | { readonly kind: 'members-cancel'; readonly id: string }
  | { readonly kind: 'members-confirm'; readonly id: string; readonly userId: number; readonly approve: boolean; readonly projects?: readonly string[] }
  | { readonly kind: 'members-revoke'; readonly id: string }
  | { readonly kind: 'connect'; readonly token: string; readonly mode?: 'private' | 'team'; readonly approvers?: readonly number[]; readonly allMembers?: boolean }
  | { readonly kind: 'confirm'; readonly userId: TelegramAccount['id']; readonly chatId: TelegramAccount['chatId'] }
  | { readonly kind: 'cancel-pairing' }
  | { readonly kind: 'retry' }
  | { readonly kind: 'disconnect' }
  | { readonly kind: 'stop-link'; readonly id: SharedLink['id'] }

export interface TelegramDecision {
  readonly id: string
  readonly choices: readonly { readonly label: string; readonly value: string }[]
}

export interface TelegramApi {
  view(): Promise<TelegramView>
  action(action: TelegramAction): Promise<TelegramView>
  on(said: (view: TelegramView) => void): () => void
}
