import type { Json } from './channel-api'

const object = (value: Json | undefined): { readonly [key: string]: Json } => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as { readonly [key: string]: Json } : {}

export function restoreTelegramManager(value: Json): Json {
  const record = object(value)
  const { telegramReplies, ...rest } = record
  const inbox = Array.isArray(record['inbox']) ? record['inbox'].map((value) => {
    const { telegramRequests, ...message } = object(value)
    return { ...message, ...(message['requests'] === undefined && telegramRequests !== undefined ? { requests: telegramRequests } : {}), ...(message['source'] === 'telegram' ? { source: 'channel', ...(message['state'] === 'queued' ? { text: `[Via Telegram]\n${String(message['text'] ?? '')}` } : {}) } : {}) }
  }) : []
  const replies = record['channelReplies'] ?? telegramReplies
  const channelReplies = Array.isArray(replies) ? replies.map((value) => {
    const reply = object(value)
    const { telegramDelivery, ...origin } = object(reply['origin'])
    return { ...reply, origin: { ...origin, ...(origin['delivery'] === undefined && telegramDelivery !== undefined ? { delivery: telegramDelivery } : {}) } }
  }) : []
  return { ...rest, inbox, channelReplies }
}
