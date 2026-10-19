import type { Json, JsonObject } from '../shared/elicitation'
import { jsonObject } from '../shared/elicitation'
import type { TelegramAccount, TelegramBot } from '../shared/telegram'

export class TelegramFailure extends Error {
  constructor(readonly code: number) {
    super(code === 401 || code === 404 ? 'Bot token was rejected. Create a new token in BotFather and reconnect.' : code === 409 ? 'Another receiver or webhook is using this bot. Stop it, then retry.' : code === 429 ? 'Telegram is limiting requests. Wait, then retry.' : 'Telegram could not be reached. Check your connection and retry.')
  }
}

export interface TelegramMessage {
  readonly id: number
  readonly date: number
  readonly chatId: number
  readonly private: boolean
  readonly from?: TelegramAccount
  readonly text?: string
  readonly replyTo?: number
}

export interface TelegramUpdate {
  readonly id: number
  readonly message?: TelegramMessage
  readonly callback?: { readonly id: string; readonly data: string; readonly from: TelegramAccount; readonly message: TelegramMessage }
}

const integer = (value: Json | undefined): value is number => typeof value === 'number' && Number.isSafeInteger(value)

export function telegramAccount(value: Json | undefined, chatId?: number): TelegramAccount | undefined {
  const user = jsonObject(value)
  if (user === undefined || !integer(user['id']) || user['is_bot'] === true || typeof user['first_name'] !== 'string') return undefined
  return { id: user['id'], chatId: chatId ?? user['id'], name: [user['first_name'], typeof user['last_name'] === 'string' ? user['last_name'] : ''].filter(Boolean).join(' '), ...(typeof user['username'] === 'string' ? { username: user['username'] } : {}) }
}

function messageOf(value: Json | undefined): TelegramMessage | undefined {
  const message = jsonObject(value)
  const chat = jsonObject(message?.['chat'])
  if (message === undefined || chat === undefined || !integer(chat['id']) || !integer(message['message_id']) || !integer(message['date'])) return undefined
  const from = telegramAccount(message['from'], chat['id'])
  const reply = jsonObject(message['reply_to_message'])?.['message_id']
  return { id: message['message_id'], date: message['date'], chatId: chat['id'], private: chat['type'] === 'private', ...(from === undefined ? {} : { from }), ...(typeof message['text'] === 'string' ? { text: message['text'] } : {}), ...(integer(reply) ? { replyTo: reply } : {}) }
}

export function telegramUpdate(value: Json): TelegramUpdate | undefined {
  const update = jsonObject(value)
  if (update === undefined || !integer(update['update_id']) || update['update_id'] < 0) return undefined
  const message = messageOf(update['message'])
  const query = jsonObject(update['callback_query'])
  const source = messageOf(query?.['message'])
  const from = telegramAccount(query?.['from'], source?.chatId)
  const callback = query !== undefined && source !== undefined && from !== undefined && typeof query['id'] === 'string' && typeof query['data'] === 'string' ? { id: query['id'], data: query['data'], from, message: source } : undefined
  return { id: update['update_id'], ...(message === undefined ? {} : { message }), ...(callback === undefined ? {} : { callback }) }
}

export class TelegramBotClient {
  constructor(private readonly token: string, private readonly fetcher: typeof fetch = fetch) {}

  async call(method: string, body: JsonObject, signal?: AbortSignal): Promise<Json> {
    try {
      const timeout = AbortSignal.timeout(method === 'getUpdates' ? 35_000 : 15_000)
      const response = await this.fetcher(`https://api.telegram.org/bot${this.token}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]) })
      const result = jsonObject(await response.json() as Json)
      if (!response.ok || result?.['ok'] !== true || result['result'] === undefined) throw new TelegramFailure(typeof result?.['error_code'] === 'number' ? result['error_code'] : response.status)
      return result['result']
    } catch (error) {
      if (error instanceof TelegramFailure) throw error
      throw new TelegramFailure(0)
    }
  }

  async identity(signal?: AbortSignal): Promise<TelegramBot> {
    const result = jsonObject(await this.call('getMe', {}, signal))
    if (result === undefined || !integer(result['id']) || result['is_bot'] !== true || typeof result['username'] !== 'string' || !/^[A-Za-z0-9_]+$/.test(result['username'])) throw new TelegramFailure(401)
    const hook = jsonObject(await this.call('getWebhookInfo', {}, signal))
    if (typeof hook?.['url'] === 'string' && hook['url'] !== '') throw new TelegramFailure(409)
    return { id: result['id'], username: result['username'] }
  }

  async updates(offset: number, signal: AbortSignal): Promise<readonly TelegramUpdate[]> {
    const result = await this.call('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] }, signal)
    if (!Array.isArray(result)) throw new TelegramFailure(0)
    return result.flatMap((value) => { const update = telegramUpdate(value); return update === undefined ? [] : [update] }).sort((left, right) => left.id - right.id)
  }
}
