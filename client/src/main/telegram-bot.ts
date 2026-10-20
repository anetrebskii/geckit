import type { Json, JsonObject } from '../shared/elicitation'
import { jsonObject } from '../shared/elicitation'
import { TelegramAttachmentFailure, TELEGRAM_DOWNLOAD_LIMIT } from './telegram-attachments'
import type { TelegramAttachment } from './telegram-attachments'
import type { TelegramAccount, TelegramBot } from '../shared/telegram'

export class TelegramFailure extends Error {
  constructor(readonly code: number) {
    super(code === 401 || code === 404 ? 'Bot token was rejected. Create a new token in BotFather and reconnect.' : code === 409 ? 'Another receiver or webhook is using this bot. Stop it, then retry.' : code === 429 ? 'Telegram is limiting requests. Wait, then retry.' : 'Telegram could not be reached. Check your connection and retry.')
  }
}

export type TelegramFile = Pick<TelegramAttachment, 'name' | 'media'> & Partial<Pick<TelegramAttachment, 'size'>> & {
  readonly fileId: string
  readonly photo: boolean
}

export interface TelegramMessage {
  readonly id: number
  readonly date: number
  readonly chatId: number
  readonly private: boolean
  readonly from?: TelegramAccount
  readonly text?: string
  readonly file?: TelegramFile
  readonly mediaGroup?: string
  readonly unsupportedFile?: boolean
  readonly reference?: { readonly chatId?: TelegramAccount['chatId']; readonly botId?: TelegramBot['id']; readonly external: boolean }
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

function fileOf(message: JsonObject): TelegramFile | undefined {
  const document = jsonObject(message['document'])
  if (document !== undefined && document['file_size'] !== undefined && (!integer(document['file_size']) || document['file_size'] < 1)) return undefined
  if (document !== undefined && typeof document['file_id'] === 'string' && document['file_id'] !== '') return {
    fileId: document['file_id'], name: typeof document['file_name'] === 'string' ? document['file_name'] : 'document', media: typeof document['mime_type'] === 'string' ? document['mime_type'] : 'application/octet-stream', photo: false,
    ...(integer(document['file_size']) && document['file_size'] >= 0 ? { size: document['file_size'] } : {}),
  }
  const photos = message['photo']
  if (!Array.isArray(photos)) return undefined
  const variants = photos.flatMap((entry) => {
    const item = jsonObject(entry)
    return item !== undefined && typeof item['file_id'] === 'string' && item['file_id'] !== '' && integer(item['width']) && item['width'] > 0 && integer(item['height']) && item['height'] > 0 ? [{ fileId: item['file_id'], pixels: item['width'] * item['height'], ...(integer(item['file_size']) && item['file_size'] >= 0 ? { size: item['file_size'] } : {}) }] : []
  }).filter((item) => item.size === undefined || item.size <= TELEGRAM_DOWNLOAD_LIMIT).sort((a, b) => b.pixels - a.pixels)
  const best = variants[0]
  return best === undefined ? undefined : { fileId: best.fileId, name: 'photo.jpg', media: 'image/jpeg', photo: true, ...(best.size === undefined ? {} : { size: best.size }) }
}

function messageOf(value: Json | undefined): TelegramMessage | undefined {
  const message = jsonObject(value)
  const chat = jsonObject(message?.['chat'])
  if (message === undefined || chat === undefined || !integer(chat['id']) || !integer(message['message_id']) || !integer(message['date'])) return undefined
  const from = telegramAccount(message['from'], chat['id'])
  const file = fileOf(message)
  const replied = jsonObject(message['reply_to_message'])
  const reply = replied?.['message_id']
  const replyChat = jsonObject(replied?.['chat'])?.['id']
  const replyBot = jsonObject(replied?.['from'])
  const referenced = replied !== undefined || message['external_reply'] !== undefined || message['quote'] !== undefined
  return { id: message['message_id'], date: message['date'], chatId: chat['id'], private: chat['type'] === 'private', ...(from === undefined ? {} : { from }), ...(typeof message['text'] === 'string' ? { text: message['text'] } : typeof message['caption'] === 'string' ? { text: message['caption'] } : {}), ...(file === undefined ? message['document'] !== undefined || message['photo'] !== undefined ? { unsupportedFile: true } : {} : { file }), ...(typeof message['media_group_id'] === 'string' ? { mediaGroup: message['media_group_id'] } : {}), ...(integer(reply) ? { replyTo: reply } : {}), ...(referenced ? { reference: { external: message['external_reply'] !== undefined || replied === undefined || replyBot !== undefined && replyBot['is_bot'] !== true, ...(integer(replyChat) ? { chatId: replyChat } : {}), ...(replyBot?.['is_bot'] === true && integer(replyBot['id']) ? { botId: replyBot['id'] } : {}) } } : {}) }
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

  async download(file: TelegramFile, signal: AbortSignal): Promise<Buffer> {
    if (file.size !== undefined && (file.size < 1 || file.size > TELEGRAM_DOWNLOAD_LIMIT)) throw new TelegramAttachmentFailure('Telegram downloads are limited to 20 MiB. Send a smaller file.')
    const result = jsonObject(await this.call('getFile', { file_id: file.fileId }, signal))
    const path = result?.['file_path']
    if (typeof path !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(path) || path.startsWith('/') || path.split('/').some((part) => part === '..' || part === '.' || part === '')) throw new TelegramAttachmentFailure('Telegram returned an invalid file location. Resend the file.')
    if (typeof result?.['file_size'] === 'number' && (result['file_size'] < 1 || result['file_size'] > TELEGRAM_DOWNLOAD_LIMIT)) throw new TelegramAttachmentFailure('Telegram downloads are limited to 20 MiB. Send a smaller file.')
    try {
      const response = await this.fetcher(`https://api.telegram.org/file/bot${this.token}/${path}`, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) })
      if (!response.ok || response.body === null) throw new TelegramAttachmentFailure('Download rejected')
      const length = Number(response.headers.get('content-length'))
      if (length > TELEGRAM_DOWNLOAD_LIMIT) { await response.body.cancel(); throw new TelegramAttachmentFailure('File exceeds 20 MiB') }
      const reader = response.body.getReader()
      const chunks: Buffer[] = []
      let size = 0
      for (;;) {
        const part = await reader.read()
        if (part.done) break
        size += part.value.byteLength
        if (size > TELEGRAM_DOWNLOAD_LIMIT) { await reader.cancel(); throw new TelegramAttachmentFailure('File exceeds 20 MiB') }
        chunks.push(Buffer.from(part.value))
      }
      if (file.size !== undefined && size !== file.size || typeof result?.['file_size'] === 'number' && size !== result['file_size'] || response.headers.has('content-length') && size !== length) throw new TelegramAttachmentFailure('Truncated file')
      if (size === 0) throw new TelegramAttachmentFailure('Empty file')
      return Buffer.concat(chunks, size)
    } catch { throw new TelegramAttachmentFailure('Telegram file download failed or exceeded 20 MiB. Check the connection and resend a smaller file.') }
  }

  async upload(chatId: number, bytes: Buffer, name: string, media: string, caption: string, as: 'photo' | 'document', signal: AbortSignal): Promise<number> {
    if (bytes.length === 0 || bytes.length > (as === 'photo' ? 10 : 50) * 1024 * 1024) throw new Error(`Telegram ${as} uploads must be between 1 byte and ${as === 'photo' ? 10 : 50} MiB.`)
    if ([...caption].length > 1024) throw new Error('Telegram captions are limited to 1024 characters. Shorten the caption.')
    const body = new FormData()
    body.set('chat_id', String(chatId))
    body.set(as, new Blob([new Uint8Array(bytes)], { type: media }), name)
    if (caption !== '') body.set('caption', caption)
    try {
      const response = await this.fetcher(`https://api.telegram.org/bot${this.token}/${as === 'photo' ? 'sendPhoto' : 'sendDocument'}`, { method: 'POST', body, redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]) })
      const result = jsonObject(await response.json() as Json)
      if (!response.ok || result?.['ok'] !== true) throw new TelegramFailure(integer(result?.['error_code']) ? result['error_code'] : response.status)
      const sent = jsonObject(result['result'])
      if (!integer(sent?.['message_id'])) throw new Error('Missing receipt')
      return sent['message_id']
    } catch (error) {
      if (error instanceof TelegramFailure) throw error
      throw new Error('Telegram file delivery is uncertain. Check the paired chat before requesting another send; this upload will not be retried automatically.')
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
