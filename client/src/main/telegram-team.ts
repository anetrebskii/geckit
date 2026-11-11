import type { TelegramAccount } from '../shared/telegram'
import { telegramThreadKey } from '../shared/telegram'
import type { TelegramMessage } from './telegram-bot'
import type { Json } from '../shared/elicitation'
import { jsonObject } from '../shared/elicitation'

export const TEAM_QUEUE_LIMIT = 100
export const TEAM_AUDIT_LIMIT = 512
export const teamThread = (thread: string): boolean => thread.startsWith('telegram:team:')
export const teamScope = (account: TelegramAccount): string | undefined => account.team === undefined ? undefined : `telegram:${telegramThreadKey(account)}`
export const topicBody = (account: TelegramAccount | undefined): { message_thread_id?: number } => account?.team === undefined || account.team.member !== undefined ? {} : { message_thread_id: account.team.topicId }
export function targetMessage(account: TelegramAccount, message: TelegramMessage): boolean {
  if (message.chatId !== account.chatId || message.anonymous === true) return false
  return account.team === undefined ? message.private : account.team.member !== undefined ? message.private && message.from?.id === account.id && message.topicId === undefined : message.chatType === 'supergroup' && message.topicId === account.team.topicId
}
export function memberAllowed(value: Json): boolean {
  const member = jsonObject(value)
  return member !== undefined && (['creator', 'administrator', 'member'].includes(String(member['status'])) || member['status'] === 'restricted' && member['is_member'] === true)
}
