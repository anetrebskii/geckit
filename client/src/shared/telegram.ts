import type { SharedLink } from './share'

export interface TelegramAccount {
  readonly id: number
  readonly chatId: number
  readonly name: string
  readonly username?: string
}

export interface TelegramBot {
  readonly id: number
  readonly username: string
}

export interface TelegramView {
  readonly state: 'disconnected' | 'pairing' | 'confirming' | 'connected' | 'offline' | 'revoked' | 'conflict' | 'storage-error'
  readonly bot?: TelegramBot
  readonly pairing?: { readonly url: string; readonly expiresAt: number }
  readonly candidate?: TelegramAccount
  readonly account?: TelegramAccount
  readonly detail?: string
  readonly pendingLate: number
  /** The links shared from Telegram that are live now. */
  readonly links?: readonly SharedLink[]
}

export type TelegramAction =
  | { readonly kind: 'connect'; readonly token: string }
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
