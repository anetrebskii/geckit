import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'

import type { ManagerDecision, ManagerReplyOrigin, ManagerTelegramReply } from '../shared/manager'
import type { Json, JsonObject } from '../shared/elicitation'
import { jsonObject } from '../shared/elicitation'
import type { TelegramAction, TelegramAccount, TelegramBot, TelegramDecision, TelegramView } from '../shared/telegram'
import { endsIn, shareLink, shareMentions } from '../shared/share'
import type { ShareMention } from '../shared/share'
import type { Shares } from './shares'
import { telegramText } from './telegram-text'
import { telegramMessages } from './telegram-render'
import type { TelegramPiece } from './telegram-render'
import { TelegramAttachmentFailure, TelegramAttachments, telegramFilename } from './telegram-attachments'
import type { TelegramAttachment, TelegramFileSender } from './telegram-attachments'
import { TelegramBotClient, TelegramFailure, telegramUpdate } from './telegram-bot'
import type { TelegramMessage, TelegramUpdate } from './telegram-bot'

export interface TelegramVault {
  available(): boolean
  encrypt(text: string): Buffer
  decrypt(bytes: Buffer): string
}

export interface TelegramManager {
  submit(text: string, id?: string, attachments?: readonly TelegramAttachment['id'][], authorized?: () => boolean): Promise<void | ManagerReplyOrigin['session']>
  reply?(text: string, id: string | undefined, reference: ManagerTelegramReply, authorized?: () => boolean, attachments?: readonly TelegramAttachment['id'][]): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  status(): string
  enabled(): boolean
  answer?(id: TelegramDecision['id'], choice: string, authorized?: () => boolean): Promise<void>
  decisions?(): readonly ManagerDecision[]
  hasDecision?(id: TelegramDecision['id']): boolean
}

export interface TelegramOptions {
  readonly directory: string
  readonly attachments?: TelegramAttachments
  readonly vault: TelegramVault
  readonly manager: TelegramManager
  readonly changed: (view: TelegramView) => void
  readonly fetch?: typeof fetch
  readonly now?: () => number
  readonly shares?: Pick<Shares, 'open' | 'stop' | 'stopAll' | 'list'>
}

type Button = { readonly text: string; readonly callback_data: string } | { readonly text: string; readonly url: string }
type TelegramFileReference = Pick<TelegramMessage, 'file' | 'mediaGroup' | 'id'>

type Callback = { readonly token: string } & (
  | { readonly kind: 'late'; readonly text: string; readonly run: boolean; readonly group: string; readonly question?: string; readonly reference?: ManagerTelegramReply; readonly attachment?: TelegramFileReference }
  | { readonly kind: 'decision'; readonly id: TelegramDecision['id']; readonly value: string }
  | { readonly kind: 'unshare'; readonly id: string }
)

interface KeptTelegram {
  readonly token: string
  readonly bot: TelegramBot
  readonly account?: TelegramAccount
  readonly offset: number
  readonly replies: readonly ManagerTelegramReply[]
  readonly callbacks: readonly Callback[]
  readonly questions: readonly { readonly messageId: number; readonly id: TelegramDecision['id'] }[]
  readonly incoming?: number
  readonly outgoing?: boolean
  readonly uncertain?: boolean
  readonly pendingUpload?: string
  readonly uncertainUploads?: readonly string[]
}

interface Connection {
  kept: KeptTelegram
  readonly client: TelegramBotClient
  readonly controller: AbortController
  state: TelegramView['state']
  detail?: string
  sending: Promise<void>
}

interface Pairing extends Connection {
  readonly payload: string
  readonly expiresAt: number
  candidate?: TelegramAccount
}

const COMMANDS = `/status - what Manager and its workers are doing
/pause - stop starting new work
/resume - start work again
/settings - where the setup is changed
/links - what is shared and how to stop it`

const nonce = (): string => randomBytes(18).toString('base64url')
// Stop buttons kept across restarts; the oldest fall away first, and a tap on one says it is no longer available.
const SHARE_BUTTONS = 60
const safeInteger = (value: Json | undefined): value is number => typeof value === 'number' && Number.isSafeInteger(value)
const accountOf = (value: Json | undefined): TelegramAccount | undefined => {
  const item = jsonObject(value)
  return item !== undefined && safeInteger(item['id']) && safeInteger(item['chatId']) && typeof item['name'] === 'string' ? { id: item['id'], chatId: item['chatId'], name: item['name'], ...(typeof item['username'] === 'string' ? { username: item['username'] } : {}) } : undefined
}

function replyOf(value: Json | undefined): ManagerTelegramReply | undefined {
  const item = jsonObject(value)
  return item !== undefined && safeInteger(item['chatId']) && safeInteger(item['messageId']) && typeof item['session'] === 'string' && typeof item['text'] === 'string' && Array.isArray(item['workers']) && item['workers'].every((worker) => typeof worker === 'string') ? { chatId: item['chatId'], messageId: item['messageId'], session: item['session'], text: item['text'], workers: item['workers'] } : undefined
}

function keptOf(text: string): KeptTelegram | undefined {
  const value = jsonObject(JSON.parse(text) as Json)
  const bot = jsonObject(value?.['bot'])
  if (value === undefined || typeof value['token'] !== 'string' || bot === undefined || !safeInteger(bot['id']) || typeof bot['username'] !== 'string' || !safeInteger(value['offset']) || value['offset'] < 0) return undefined
  const account = accountOf(value['account'])
  if (value['account'] !== undefined && account === undefined) return undefined
  const callbacks: Callback[] = []
  if (Array.isArray(value['callbacks'])) for (const entry of value['callbacks']) {
    const item = jsonObject(entry)
    if (item === undefined || typeof item['token'] !== 'string') continue
    const reference = replyOf(item['reference'])
    const source = jsonObject(item['attachment'])
    const file = jsonObject(source?.['file'])
    const restored = file === undefined ? undefined : telegramUpdate({ update_id: 0, message: { message_id: source?.['id'] ?? 0, date: 0, chat: { id: 0, type: 'private' }, document: { file_id: file['fileId'] ?? null, file_name: file['name'] ?? null, mime_type: file['media'] ?? null, file_size: file['size'] ?? null } } })?.message?.file
    const attachment: TelegramFileReference | undefined = restored === undefined || !safeInteger(source?.['id']) ? undefined : { id: source['id'], file: restored, ...(typeof source['mediaGroup'] === 'string' ? { mediaGroup: source['mediaGroup'] } : {}) }
    if (item['reference'] !== undefined && reference === undefined) continue
    if (item['kind'] === 'late' && typeof item['text'] === 'string' && typeof item['run'] === 'boolean' && typeof item['group'] === 'string') callbacks.push({ token: item['token'], kind: 'late', text: item['text'], run: item['run'], group: item['group'], ...(typeof item['question'] === 'string' ? { question: item['question'] } : {}), ...(reference === undefined ? {} : { reference }), ...(attachment === undefined ? {} : { attachment }) })
    if (item['kind'] === 'decision' && typeof item['id'] === 'string' && typeof item['value'] === 'string') callbacks.push({ token: item['token'], kind: 'decision', id: item['id'], value: item['value'] })
    if (item['kind'] === 'unshare' && typeof item['id'] === 'string') callbacks.push({ token: item['token'], kind: 'unshare', id: item['id'] })
  }
  const questions: KeptTelegram['questions'][number][] = []
  if (Array.isArray(value['questions'])) for (const entry of value['questions']) {
    const item = jsonObject(entry)
    if (item !== undefined && safeInteger(item['messageId']) && typeof item['id'] === 'string') questions.push({ messageId: item['messageId'], id: item['id'] })
  }
  return { token: value['token'], bot: { id: bot['id'], username: bot['username'] }, offset: value['offset'], replies: Array.isArray(value['replies']) ? value['replies'].flatMap((entry) => { const reply = replyOf(entry); return reply === undefined ? [] : [reply] }).slice(-2048) : [], callbacks, questions, ...(account === undefined ? {} : { account }), ...(safeInteger(value['incoming']) ? { incoming: value['incoming'] } : {}), ...(value['outgoing'] === true ? { outgoing: true } : {}), ...(value['uncertain'] === true ? { uncertain: true } : {}), ...(typeof value['pendingUpload'] === 'string' && /^[a-f0-9]{64}$/.test(value['pendingUpload']) ? { pendingUpload: value['pendingUpload'] } : {}), uncertainUploads: Array.isArray(value['uncertainUploads']) ? value['uncertainUploads'].filter((entry): entry is string => typeof entry === 'string' && /^[a-f0-9]{64}$/.test(entry)) : [] }
}

export class ManagerTelegram {
  private active: Connection | undefined
  private pairing: Pairing | undefined
  private attempt: AbortController | undefined
  private failure: TelegramView['state'] = 'disconnected'
  private detail: string | undefined
  private outgoing: Promise<void> = Promise.resolve()
  private readonly path: string
  private readonly now: () => number
  readonly attachments: TelegramAttachments
  private cleanupTimer: ReturnType<typeof setInterval> | undefined

  constructor(private readonly options: TelegramOptions) {
    this.path = join(options.directory, 'manager-telegram.sealed')
    this.now = options.now ?? Date.now
    this.attachments = options.attachments ?? new TelegramAttachments(options.directory, this.now)
    this.attachments.cleanup()
    this.cleanupTimer = setInterval(() => { try { this.attachments.cleanup() } catch { /* Access reports storage failures. */ } }, 60_000)
    this.cleanupTimer.unref()
  }

  view(): TelegramView {
    const pairing = this.pairing
    const active = this.active
    const bot = (pairing ?? active)?.kept.bot
    const detail = pairing?.detail ?? this.detail ?? active?.detail
    return {
      state: pairing === undefined ? active?.state ?? this.failure : pairing.candidate !== undefined && pairing.state === 'pairing' ? 'confirming' : pairing.state,
      ...(bot === undefined ? {} : { bot }),
      ...(active?.kept.account === undefined ? {} : { account: active.kept.account }),
      ...(pairing === undefined ? {} : { pairing: { url: `https://t.me/${pairing.kept.bot.username}?start=${pairing.payload}`, expiresAt: pairing.expiresAt } }),
      ...(pairing?.candidate === undefined ? {} : { candidate: pairing.candidate }),
      ...(detail === undefined ? {} : { detail }),
      pendingLate: new Set(active?.kept.callbacks.flatMap((item) => item.kind === 'late' ? [item.group] : [])).size,
      links: this.options.shares?.list() ?? [],
    }
  }

  async start(): Promise<void> {
    let bytes: Buffer
    try { bytes = readFileSync(this.path) } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
      this.failed('storage-error', 'Telegram settings could not be read. Check app data permissions, then reconnect.'); return
    }
    if (!this.options.vault.available()) { this.failed('storage-error', 'Secure storage is unavailable. Unlock your system credential store, then retry.'); return }
    let kept: KeptTelegram | undefined
    try { kept = keptOf(this.options.vault.decrypt(bytes)) } catch { kept = undefined }
    if (kept === undefined) { this.failed('storage-error', 'Telegram settings could not be decrypted. Reconnect with your bot token.'); return }
    if (kept.account === undefined) return
    const connection = this.connection(kept)
    this.active = connection
    if (kept.incoming !== undefined || kept.outgoing === true || kept.uncertain === true) {
      const { pendingUpload, ...rest } = kept
      connection.kept = { ...rest, uncertain: true, uncertainUploads: [...new Set([...(kept.uncertainUploads ?? []), ...(pendingUpload === undefined ? [] : [pendingUpload])])] }
      connection.detail = 'A previous delivery was interrupted. Uncertain deliveries are never retried automatically; other work continues.'
      try { this.save(connection) } catch { return }
    }
    await this.verifyAndPoll(connection)
  }

  stop(): void {
    if (this.cleanupTimer !== undefined) clearInterval(this.cleanupTimer)
    this.cleanupTimer = undefined
    this.attempt?.abort()
    this.pairing?.controller.abort()
    this.active?.controller.abort()
  }

  async action(action: TelegramAction): Promise<TelegramView> {
    if (this.cleanupTimer === undefined && action.kind !== 'disconnect') {
      this.cleanupTimer = setInterval(() => { try { this.attachments.cleanup() } catch { /* Access reports storage failures. */ } }, 60_000)
      this.cleanupTimer.unref()
    }
    try {
      switch (action.kind) {
        case 'connect': await this.connect(action.token); break
        case 'confirm': await this.confirm(action.userId, action.chatId); break
        case 'cancel-pairing':
          this.attempt?.abort(); this.pairing?.controller.abort(); this.pairing = undefined; this.detail = undefined; this.failure = 'disconnected'; break
        case 'retry':
          if (this.pairing !== undefined) await this.connect(this.pairing.kept.token)
          else if (this.active !== undefined) {
            this.active.controller.abort()
            const connection = this.connection(this.active.kept)
            this.active = connection
            this.detail = undefined
            await this.verifyAndPoll(connection)
          } else await this.start()
          break
        case 'stop-link':
          this.options.shares?.stop(action.id)
          break
        case 'disconnect':
          this.options.shares?.stopAll()
          this.stop()
          this.active = undefined; this.pairing = undefined; this.detail = undefined; this.failure = 'disconnected'
          this.attachments.clear()
          rmSync(this.path, { force: true }); rmSync(`${this.path}.new`, { force: true })
          break
      }
    } catch (error) {
      if (error instanceof TelegramFailure) this.failed(this.stateFor(error), error.message)
      else this.failed('storage-error', 'Telegram settings could not be saved. Check app data permissions, then retry.')
    }
    this.changed()
    return this.view()
  }

  notify(text: string, decision?: TelegramDecision, origin?: ManagerReplyOrigin): Promise<void> {
    text = telegramText(text)
    if (text.trim() === '') return Promise.resolve()
    const connection = this.active
    if (connection === undefined || connection.kept.account === undefined) return Promise.resolve()
    const job = this.outgoing.then(async () => {
      if (!this.current(connection)) return
      const choices: { readonly text: string; readonly callback_data: string }[] = []
      let question = decision
      if (decision !== undefined && (connection.kept.callbacks.length + decision.choices.length > 256 || connection.kept.questions.length >= 128 || decision.choices.length > 50)) {
        text += '\n\nTelegram has reached its pending decision limit. Answer or discard earlier questions here, then ask Manager to show this question again.'
        question = undefined
      }
      if (question !== undefined) {
        this.removeDecision(connection, question.id)
        const questionId = question.id
        const callbacks: Callback[] = question.choices.map((choice) => {
          const token = nonce()
          choices.push({ text: choice.label.slice(0, 64), callback_data: token })
          return { token, kind: 'decision', id: questionId, value: choice.value }
        })
        connection.kept = { ...connection.kept, callbacks: [...connection.kept.callbacks, ...callbacks] }
      }
      const limited = text.length > 32_768 ? `${text.slice(0, 32_768)}\n\nResponse shortened. Ask Manager here for a shorter summary or the missing part.` : text
      await this.send(connection, await this.linked(limited), choices, question?.id, undefined, origin)
    })
    this.outgoing = job.catch(() => undefined)
    return job
  }

  /** A link ended, by Stop, its time or the app: a Stop button left for it in Telegram stops being one. */
  linkEnded(id: string): void {
    const connection = this.active
    if (connection === undefined || connection.kept.account === undefined) return
    connection.kept = { ...connection.kept, callbacks: connection.kept.callbacks.filter((item) => item.kind !== 'unshare' || item.id !== id) }
    try { this.save(connection) } catch { /* Reported in the view by save itself. */ }
    this.changed()
  }

  /** The words a message uses for a localhost address, a file or a folder become the link to it; what cannot be shared is left as Manager wrote it, in silence. */
  private async linked(text: string): Promise<string> {
    const shares = this.options.shares
    if (shares === undefined) return text
    const made: { readonly mention: ShareMention; readonly key: string; readonly expiresAt: number }[] = []
    for (const mention of shareMentions(text)) {
      const opened = await shares.open(mention.target).catch(() => undefined)
      if (opened === undefined || 'why' in opened) continue
      made.push({ mention, key: opened.key, expiresAt: opened.expiresAt })
    }
    let out = text
    for (const { mention, key, expiresAt } of made.reverse()) {
      const words = text.slice(mention.at, mention.at + mention.length).replace(/^`|`$/g, '')
      out = `${out.slice(0, mention.at)}[${words}](${shareLink(key, expiresAt)})${out.slice(mention.at + mention.length)}`
    }
    return out
  }

  private keepShareButton(connection: Connection, callback: Callback): void {
    const shared = connection.kept.callbacks.filter((item) => item.kind === callback.kind)
    const dropped = new Set(shared.slice(0, Math.max(0, shared.length - SHARE_BUTTONS + 1)).map((item) => item.token))
    connection.kept = { ...connection.kept, callbacks: [...connection.kept.callbacks.filter((item) => !dropped.has(item.token)), callback] }
  }

  private async unshare(connection: Connection, callback: Extract<Callback, { readonly kind: 'unshare' }>, replyTo: number): Promise<void> {
    connection.kept = { ...connection.kept, callbacks: connection.kept.callbacks.filter((item) => item.token !== callback.token) }
    this.save(connection)
    const stopped = this.options.shares?.stop(callback.id)
    await this.send(connection, stopped === undefined ? 'This link has already ended.' : `Stopped sharing ${stopped.title}. The link no longer opens.`, [], undefined, replyTo)
  }

  private async links(connection: Connection): Promise<void> {
    const live = this.options.shares?.list() ?? []
    if (live.length === 0) { await this.send(connection, 'Nothing is shared. A link appears in a Manager message that names a localhost address or a file.'); return }
    const rows: Button[][] = live.map((link) => {
      const token = nonce()
      this.keepShareButton(connection, { token, kind: 'unshare', id: link.id })
      return [{ text: `Stop ${link.title}`.slice(0, 64), callback_data: token }]
    })
    this.save(connection)
    await this.send(connection, [`**Shared links** (${String(live.length)})`, ...live.map((link) => `- ${link.title} - ends in ${endsIn(link.expiresAt, this.now())}`)].join('\n'), [], undefined, undefined, undefined, rows)
  }

  fileSender(): TelegramFileSender {
    const connection = this.active
    if (connection === undefined) throw new Error('Telegram is not paired. Reconnect in GeckIt Settings.')
    return (bytes, name, media, caption, as, origin, beforeSend) => this.sendFile(bytes, name, media, caption, as, origin, connection, beforeSend)
  }

  sendFile(bytes: Buffer, name: string, media: string, caption: string, as: 'photo' | 'document', origin: ManagerReplyOrigin, expected?: Connection, beforeSend?: () => Promise<void>): Promise<number> {
    const connection = this.active
    if (connection === undefined || expected !== undefined && expected !== connection || connection.kept.account === undefined || !this.current(connection) || connection.state !== 'connected') return Promise.reject(new Error('Telegram is not connected to a paired account. Reconnect in GeckIt Settings.'))
    const chatId = connection.kept.account.chatId
    const fingerprint = createHash('sha256').update(JSON.stringify({ workers: origin.workers.toSorted(), name: telegramFilename(name), as })).update(bytes).digest('hex')
    const job = connection.sending.then(async () => {
      await beforeSend?.()
      if (!this.current(connection) || !this.options.manager.enabled()) throw new Error('Telegram connection changed before upload. Nothing was sent.')
      if (connection.kept.uncertainUploads?.includes(fingerprint) === true) throw new Error('This Telegram file delivery is uncertain. This upload will not be repeated automatically; other work continues.')
      if (bytes.length === 0 || bytes.length > (as === 'photo' ? 10 : 50) * 1024 * 1024 || [...caption].length > 1024) throw new Error('File or caption exceeds Telegram limits: photo 10 MiB, document 50 MiB, caption 1024 characters.')
      connection.kept = { ...connection.kept, outgoing: true, pendingUpload: fingerprint }
      this.save(connection)
      try {
        const messageId = await connection.client.upload(chatId, bytes, telegramFilename(name), media, caption, as, connection.controller.signal)
        if (!this.current(connection)) throw new Error('Telegram file delivery is uncertain after the connection changed. Check the original paired chat.')
        const { outgoing: _outgoing, pendingUpload: _pendingUpload, ...kept } = connection.kept
        connection.kept = { ...kept, replies: [...kept.replies, { ...origin, chatId, messageId, text: caption || name }].slice(-2048) }
        this.save(connection)
        return messageId
      } catch (error) {
        const uncertain = !(error instanceof TelegramFailure)
        const { outgoing: _outgoing, pendingUpload: _pendingUpload, ...kept } = connection.kept
        connection.kept = { ...kept, ...(uncertain ? { uncertain: true, uncertainUploads: [...new Set([...(kept.uncertainUploads ?? []), fingerprint])] } : {}) }
        connection.detail = uncertain ? 'Telegram file delivery is uncertain. This upload will not be repeated automatically; other work continues.' : `Telegram rejected the file (${String(error.code)}). Check the file and caption limits, then deliberately request a new send.`
        if (this.current(connection)) { this.save(connection); this.changed() }
        throw new Error(connection.detail)
      }
    })
    connection.sending = job.then(() => undefined, () => undefined)
    return job
  }

  resolve(id: TelegramDecision['id']): void {
    if (this.active === undefined) return
    this.retire(this.active, id)
    this.removeDecision(this.active, id)
    this.save(this.active)
    this.changed()
  }

  private connection(kept: KeptTelegram): Connection {
    return { kept, client: new TelegramBotClient(kept.token, this.options.fetch), controller: new AbortController(), state: 'connected', sending: Promise.resolve() }
  }

  private current(connection: Connection): boolean {
    return !connection.controller.signal.aborted && (connection === this.active || connection === this.pairing)
  }

  private changed(): void { this.options.changed(this.view()) }
  private failed(state: TelegramView['state'], detail: string): void {
    this.failure = state; this.detail = detail
    if (this.active === undefined && this.pairing !== undefined) this.pairing.state = state
    this.changed()
  }

  private stateFor(error: TelegramFailure): TelegramView['state'] { return error.code === 401 || error.code === 404 ? 'revoked' : error.code === 409 ? 'conflict' : 'offline' }

  private save(connection: Connection): void {
    if (connection !== this.active) return
    try {
      if (!this.options.vault.available()) throw new Error('Storage unavailable')
      mkdirSync(this.options.directory, { recursive: true, mode: 0o700 })
      writeFileSync(`${this.path}.new`, this.options.vault.encrypt(JSON.stringify(connection.kept)), { mode: 0o600 })
      renameSync(`${this.path}.new`, this.path)
    } catch {
      connection.state = 'storage-error'; connection.detail = 'Secure Telegram settings could not be saved. Unlock your credential store and check app data permissions, then retry.'
      connection.controller.abort()
      this.changed()
      throw new Error('Secure Telegram settings could not be saved')
    }
  }

  private async connect(raw: string): Promise<void> {
    const token = raw.trim()
    if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) { this.failed('revoked', 'Enter the bot token from BotFather.'); return }
    if (!this.options.vault.available()) { this.failed('storage-error', 'Secure storage is unavailable. Unlock your system credential store before connecting Telegram.'); return }
    this.attempt?.abort(); this.pairing?.controller.abort(); this.pairing = undefined
    const controller = new AbortController()
    this.attempt = controller
    const client = new TelegramBotClient(token, this.options.fetch)
    let bot: TelegramBot
    try { bot = await client.identity(controller.signal) } catch (error) { if (controller.signal.aborted) return; throw error }
    if (controller.signal.aborted || this.attempt !== controller) return
    if (this.active?.kept.bot.id === bot.id) { this.detail = 'This bot is already connected. Disconnect first if you want to pair it with a different Telegram account.'; return }
    this.detail = undefined
    const pairing: Pairing = { kept: { token, bot, offset: 0, replies: [], callbacks: [], questions: [] }, client, controller, state: 'pairing', payload: nonce(), expiresAt: this.now() + 10 * 60_000, sending: Promise.resolve() }
    this.pairing = pairing
    this.changed()
    void this.poll(pairing)
  }

  private async confirm(userId: number, chatId: number): Promise<void> {
    const pairing = this.pairing
    if (pairing?.candidate === undefined || pairing.candidate.id !== userId || pairing.candidate.chatId !== chatId || pairing.expiresAt <= this.now()) {
      this.detail = 'Pairing expired or the account changed. Create a new pairing link and confirm the account shown.'; return
    }
    const previous = this.active
    pairing.kept = { ...pairing.kept, account: pairing.candidate }
    this.active = pairing
    try { this.save(pairing) } catch { this.active = previous; throw new Error('Pairing could not be saved') }
    previous?.controller.abort()
    this.pairing = undefined
    this.attempt = undefined
    pairing.state = 'connected'
    this.detail = undefined
    void this.describe(pairing)
    this.changed()
    await this.notify(`**Connected to your GeckIt Manager.**

Send a task as a message. Reply to a question to answer it.

${COMMANDS}

GeckIt must stay open on your computer.`)
  }

  private async verifyAndPoll(connection: Connection): Promise<void> {
    try {
      const bot = await connection.client.identity(connection.controller.signal)
      if (!this.current(connection)) return
      if (bot.id !== connection.kept.bot.id) throw new TelegramFailure(401)
      connection.state = 'connected'
      void this.describe(connection)
      this.changed()
      void this.poll(connection)
    } catch (error) {
      if (!this.current(connection)) return
      const failure = error instanceof TelegramFailure ? error : new TelegramFailure(0)
      connection.state = this.stateFor(failure); connection.detail = failure.message; this.changed()
    }
  }

  private async poll(connection: Connection): Promise<void> {
    while (this.current(connection)) {
      try {
        const updates = await connection.client.updates(connection.kept.offset, connection.controller.signal)
        if (!this.current(connection)) return
        if (connection.state === 'offline' && connection.kept.uncertain !== true) delete connection.detail
        connection.state = connection === this.pairing ? 'pairing' : 'connected'
        for (const update of updates) {
          if (!this.current(connection)) return
          if (update.id < connection.kept.offset) continue
          connection.kept = { ...connection.kept, offset: update.id + 1, incoming: update.id }
          this.save(connection)
          await this.receive(connection, update)
          if (!this.current(connection)) return
          const { incoming: _incoming, ...kept } = connection.kept
          connection.kept = kept
          this.save(connection)
        }
        this.changed()
        if (updates.length === 0) await this.delay(connection, 250)
      } catch (error) {
        if (!this.current(connection)) return
        const failure = error instanceof TelegramFailure ? error : new TelegramFailure(0)
        connection.state = this.stateFor(failure); connection.detail = failure.message; this.changed()
        if (failure.code === 401 || failure.code === 404 || failure.code === 409) return
        await this.delay(connection, 5_000)
      }
    }
  }

  private delay(connection: Connection, ms: number): Promise<void> {
    return new Promise((done) => {
      const finish = (): void => { clearTimeout(timer); connection.controller.signal.removeEventListener('abort', finish); done() }
      const timer = setTimeout(finish, ms)
      timer.unref()
      connection.controller.signal.addEventListener('abort', finish, { once: true })
      if (connection.controller.signal.aborted) finish()
    })
  }

  private async receive(connection: Connection, update: TelegramUpdate): Promise<void> {
    const message = update.message
    if (connection === this.pairing) {
      const pairing = this.pairing
      if (pairing !== undefined && pairing.candidate === undefined && pairing.expiresAt > this.now() && message?.private === true && message.from !== undefined && message.text === `/start ${pairing.payload}`) {
        pairing.candidate = message.from
        this.changed()
      }
      return
    }
    const account = connection.kept.account
    if (account === undefined) return
    if (update.callback !== undefined) {
      const query = update.callback
      if (!query.message.private || query.from.id !== account.id || query.message.chatId !== account.chatId) return
      const callback = connection.kept.callbacks.find((item) => item.token === query.data)
      if (callback === undefined) {
        void connection.client.call('editMessageReplyMarkup', { chat_id: query.message.chatId, message_id: query.message.id, reply_markup: { inline_keyboard: [] } }, connection.controller.signal).catch(() => undefined)
        await this.send(connection, 'This action has already been answered or is no longer available. Use /status or ask Manager here for the current question.', [], undefined, query.message.id); return
      }
      if (callback.kind === 'unshare') {
        try { await connection.client.call('answerCallbackQuery', { callback_query_id: query.id }, connection.controller.signal) } catch { /* Callback acknowledgement does not prevent dispatch. */ }
        await this.unshare(connection, callback, query.message.id); return
      }
      if (callback.kind === 'decision' && this.options.manager.hasDecision?.(callback.id) === false) { this.retire(connection, callback.id); this.removeDecision(connection, callback.id); this.save(connection); await this.send(connection, 'This question has already been answered or is no longer available.', [], undefined, query.message.id); return }
      if (!this.options.manager.enabled()) { await this.send(connection, 'Manager is disabled. Enable it in GeckIt Settings → Manager before answering.'); return }
      const previous = connection.kept
      connection.kept = { ...connection.kept, callbacks: connection.kept.callbacks.filter((item) => callback.kind === 'decision' ? item.kind !== 'decision' || item.id !== callback.id : item.kind !== 'late' || item.group !== callback.group) }
      this.save(connection)
      try { await connection.client.call('answerCallbackQuery', { callback_query_id: query.id }, connection.controller.signal) } catch { /* Callback acknowledgement does not prevent dispatch. */ }
      if (callback.kind === 'late') {
        if (callback.run) await this.dispatch(connection, callback.text, callback.question, `telegram:late:${callback.group}`, undefined, callback.reference, callback.attachment)
        else await this.send(connection, 'Discarded the delayed instruction.')
      } else if (this.options.manager.answer !== undefined) {
        try {
          await this.options.manager.answer(callback.id, callback.value, () => this.current(connection) && this.options.manager.enabled())
          if (this.options.manager.hasDecision?.(callback.id) === true) this.restoreDecision(connection, previous, callback.id)
          else { this.retire(connection, callback.id); await this.send(connection, 'Answer sent.', [], undefined, query.message.id) }
        } catch {
          if (this.options.manager.hasDecision?.(callback.id) !== false) this.restoreDecision(connection, previous, callback.id)
          this.save(connection)
          await this.send(connection, 'Answer was not sent. The request may have changed or a native safety check blocked it. Check /status or GeckIt, then try the current request again. Use /resume here if Manager is paused.')
        }
      }
      else await this.send(connection, 'This question cannot be answered here. Ask Manager to show the current question again.')
      return
    }
    if (message?.private !== true || message.from?.id !== account.id || message.chatId !== account.chatId) return
    if (message.unsupportedFile === true) { await this.send(connection, 'This photo or document has invalid metadata or no downloadable variant within 20 MiB. Resend it as a smaller file.'); return }
    if (message.text === undefined && message.file === undefined) { await this.send(connection, 'Send a text message, photo or document. This attachment type is unsupported; resend it as a file.'); return }
    const text = message.file === undefined ? message.text?.trim() ?? '' : message.text ?? ''
    if (text === '' && message.file === undefined) return
    if (text.length > 16_384) { await this.send(connection, 'This instruction is too long for Telegram Manager. Send a shorter instruction here.'); return }
    if (message.file === undefined && /^\/(status|help|settings|start|links)(?:@[A-Za-z0-9_]+)?$/.test(text)) { await this.dispatch(connection, text); return }
    const question = message.replyTo === undefined ? undefined : connection.kept.questions.find((item) => item.messageId === message.replyTo)?.id
    if (message.file === undefined && question === undefined && /^\/(pause|resume)(?:@[A-Za-z0-9_]+)?$/.test(text)) {
      if (message.date * 1000 < this.now() - 10 * 60_000) await this.late(connection, text)
      else await this.dispatch(connection, text, undefined, `telegram:${String(update.id)}`, message.id)
      return
    }
    const invalid = message.reference?.external === true || message.reference?.chatId !== undefined && message.reference.chatId !== account.chatId || message.reference?.botId !== undefined && message.reference.botId !== connection.kept.bot.id
    const candidates = connection.kept.replies.filter((item) => item.messageId === message.replyTo && item.chatId === account.chatId)
    const reference = candidates.length === 1 ? candidates[0] : undefined
    if (invalid || (message.replyTo !== undefined || message.reference !== undefined) && question === undefined && (reference === undefined || this.options.manager.reply === undefined)) { await this.send(connection, 'This reply cannot be matched to a saved Manager message. Reply to a known message or send a new instruction here.'); return }
    if (message.file !== undefined && question !== undefined) { await this.send(connection, 'A file cannot answer an approval or question. Use its buttons or a text reply, then send the file as a new message.'); return }
    const attachment: TelegramFileReference | undefined = message.file === undefined ? undefined : { file: message.file, id: message.id, ...(message.mediaGroup === undefined ? {} : { mediaGroup: message.mediaGroup }) }
    if (message.date * 1000 < this.now() - 10 * 60_000) { await this.late(connection, text, question, reference, attachment); return }
    await this.dispatch(connection, text, question, `telegram:${String(update.id)}`, message.id, reference, attachment)
  }

  private async dispatch(connection: Connection, text: string, question?: string, id?: string, replyTo?: number, reference?: ManagerTelegramReply, attachment?: TelegramFileReference): Promise<void> {
    const command = attachment === undefined ? text.replace(/@[A-Za-z0-9_]+$/, '') : ''
    if (command === '/status') {
      await this.send(connection, this.options.manager.status())
      if (this.options.manager.enabled()) for (const decision of this.options.manager.decisions?.() ?? []) await this.notify(decision.title, decision)
      return
    }
    if (command === '/help' || command === '/start') {
      await this.send(connection, `**Manager in Telegram**

Send a task as a message. Reply to a question to answer it, or use the buttons on approvals that can be answered here.

${COMMANDS}

Typed forms and sign-in links need GeckIt itself.`); return
    }
    if (command === '/settings') { await this.send(connection, `**Where the setup lives**

GeckIt → Settings → Manager changes the assistant, model, delegation and this Telegram connection.

Credentials stay on the computer. Talk to Manager here; approvals a worker can take here arrive with buttons.`); return }
    if (command === '/links') { await this.links(connection); return }
    if (!this.options.manager.enabled()) { await this.send(connection, 'Manager is disabled. Enable it in GeckIt Settings → Manager before sending instructions.'); return }
    const previous = connection.kept
    let origin: ManagerReplyOrigin | undefined = reference
    const attachments: TelegramAttachment['id'][] = []
    try {
      if (attachment?.file !== undefined) {
        const bytes = await connection.client.download(attachment.file, connection.controller.signal)
        if (!this.current(connection) || !this.options.manager.enabled()) return
        const kept = this.attachments.put(bytes, attachment.file.name, attachment.file.media)
        attachments.push(kept.id)
        text = `${text === '' ? '[Attachment without caption]' : `[User caption]\n${text}`}\n[Telegram source] ${JSON.stringify({ chatId: connection.kept.account?.chatId, messageId: attachment.id, mediaGroup: attachment.mediaGroup })}`
      }
      if (question !== undefined) {
        if (this.options.manager.hasDecision?.(question) === false) { this.removeDecision(connection, question); this.save(connection); await this.send(connection, 'This question has already been answered or is no longer available.'); return }
        if (this.options.manager.answer === undefined) { await this.send(connection, 'This question cannot be answered here. Ask Manager to show the current question again.'); return }
        this.removeDecision(connection, question)
        this.save(connection)
        await this.options.manager.answer(question, text, () => this.current(connection) && this.options.manager.enabled())
        if (this.options.manager.hasDecision?.(question) === true) { this.restoreDecision(connection, previous, question); this.save(connection) }
      } else if (command === '/pause') await this.options.manager.pause()
      else if (command === '/resume') {
        await connection.sending
        await this.options.manager.resume()
        if (this.current(connection)) {
          const { outgoing: _outgoing, uncertain: _uncertain, pendingUpload: _pendingUpload, uncertainUploads: _uncertainUploads, ...kept } = connection.kept
          connection.kept = kept
          delete connection.detail
          this.save(connection)
        }
      }
      else if (reference !== undefined) {
        if (this.options.manager.reply === undefined) throw new Error('Reply routing unavailable')
        if (attachments.length === 0) await this.options.manager.reply(text, id, reference, () => this.current(connection) && this.options.manager.enabled())
        else await this.options.manager.reply(text, id, reference, () => this.current(connection) && this.options.manager.enabled(), attachments)
      } else {
        const session = attachments.length === 0 ? await this.options.manager.submit(text, id) : await this.options.manager.submit(text, id, attachments, () => this.current(connection) && this.options.manager.enabled())
        if (session !== undefined) origin = { session, workers: [] }
      }
      await this.send(connection, question === undefined ? command === '/pause' ? 'Manager paused. Existing workers continue.' : command === '/resume' ? 'Manager resumed.' : 'Sent to Manager.' : 'Answer sent to Manager.', [], undefined, replyTo, question === undefined ? origin : undefined)
    } catch (error) {
      if (question !== undefined) { this.restoreDecision(connection, previous, question); this.save(connection) }
      if (attachment !== undefined) { await this.send(connection, error instanceof TelegramAttachmentFailure ? error.message : 'Telegram file could not be handed to Manager. Check Manager status and the connection, then resend the file.', [], undefined, replyTo); return }
      await this.send(connection, 'Manager could not accept this instruction. Use /status here or check GeckIt Settings → Manager before sending again.', [], undefined, replyTo)
    }
  }

  private async late(connection: Connection, text: string, question?: string, reference?: ManagerTelegramReply, attachment?: TelegramFileReference): Promise<void> {
    if (connection.kept.callbacks.length > 254) { await this.send(connection, 'Too many decisions are waiting in Telegram. Use their Run now or Discard buttons, then send this instruction again. It has not been run.'); return }
    const group = nonce()
    const callbacks: Callback[] = [true, false].map((run) => ({ token: nonce(), kind: 'late', group, text, run, ...(question === undefined ? {} : { question }), ...(reference === undefined ? {} : { reference }), ...(attachment === undefined ? {} : { attachment }) }))
    connection.kept = { ...connection.kept, callbacks: [...connection.kept.callbacks, ...callbacks] }
    const choices = callbacks.map((callback) => ({ text: callback.kind === 'late' && callback.run ? 'Run now' : 'Discard', callback_data: callback.token }))
    await this.send(connection, `**This instruction arrived more than 10 minutes late.** Run it now?\n\n${text.split('\n').map((one) => `> ${one}`).join('\n')}`, choices)
  }

  private removeDecision(connection: Connection, id: string): void {
    connection.kept = { ...connection.kept, callbacks: connection.kept.callbacks.filter((item) => item.kind !== 'decision' || item.id !== id), questions: connection.kept.questions.filter((item) => item.id !== id) }
  }

  private restoreDecision(connection: Connection, previous: KeptTelegram, id: string): void {
    this.removeDecision(connection, id)
    connection.kept = { ...connection.kept, callbacks: [...connection.kept.callbacks, ...previous.callbacks.filter((item) => item.kind === 'decision' && item.id === id)], questions: [...connection.kept.questions, ...previous.questions.filter((item) => item.id === id)] }
  }

  /** The command menu and the profile line Telegram shows before the first message. */
  private async describe(connection: Connection): Promise<void> {
    const commands = [
      { command: 'status', description: 'What Manager and its workers are doing' },
      { command: 'pause', description: 'Stop starting new work' },
      { command: 'resume', description: 'Start work again' },
      { command: 'settings', description: 'Where the setup is changed' },
      { command: 'links', description: 'What is shared and how to stop it' },
      { command: 'help', description: 'What can be done here' },
    ]
    try {
      await connection.client.call('setMyCommands', { commands, scope: { type: 'all_private_chats' } }, connection.controller.signal)
      await connection.client.call('setMyShortDescription', { short_description: 'Runs GeckIt on your own computer. Send a task, answer its questions here.' }, connection.controller.signal)
    } catch { /* A bot whose menu could not be set still carries every message. */ }
  }

  /** Telegram refuses a message whose formatting it cannot parse; the same words then go as plain text. */
  private async sendBody(connection: Connection, body: JsonObject, piece: TelegramPiece): Promise<Json> {
    try { return await connection.client.call('sendMessage', body, connection.controller.signal) } catch (error) {
      if (!(error instanceof TelegramFailure) || error.code !== 400) throw error
      const { parse_mode: _mode, ...rest } = body
      return connection.client.call('sendMessage', { ...rest, text: piece.text.slice(0, 4096) }, connection.controller.signal)
    }
  }

  /** A question that is settled keeps its words in the chat and loses its buttons, so a stale tap is not offered. */
  private retire(connection: Connection, id: TelegramDecision['id']): void {
    const account = connection.kept.account
    if (account === undefined) return
    for (const question of connection.kept.questions.filter((item) => item.id === id)) {
      void connection.client.call('editMessageReplyMarkup', { chat_id: account.chatId, message_id: question.messageId, reply_markup: { inline_keyboard: [] } }, connection.controller.signal).catch(() => undefined)
    }
  }

  private send(connection: Connection, text: string, choices: readonly { readonly text: string; readonly callback_data: string }[] = [], question?: string, replyTo?: number, origin?: ManagerReplyOrigin, rows: readonly (readonly Button[])[] = []): Promise<void> {
    const job = connection.sending.then(async () => {
      const pieces = telegramMessages(text)
      for (const [index, piece] of pieces.entries()) {
        const last = index === pieces.length - 1
        await this.sendOne(connection, piece, last ? choices : [], last ? question : undefined, index === 0 ? replyTo : undefined, origin, last ? rows : [])
        if (connection.kept.outgoing === true) break
      }
    })
    connection.sending = job.catch(() => undefined)
    return job
  }

  private async sendOne(connection: Connection, piece: TelegramPiece, choices: readonly { readonly text: string; readonly callback_data: string }[], question?: string, replyTo?: number, origin?: ManagerReplyOrigin, rows: readonly (readonly Button[])[] = []): Promise<void> {
    const account = connection.kept.account
    if (account === undefined || !this.current(connection)) return
    connection.kept = { ...connection.kept, outgoing: true }
    this.save(connection)
    const body: JsonObject = { chat_id: account.chatId, text: piece.html, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
    if (replyTo !== undefined) body['reply_parameters'] = { message_id: replyTo, allow_sending_without_reply: true }
    const keyboard = [...Array.from({ length: Math.ceil(choices.length / 4) }, (_value, at) => choices.slice(at * 4, at * 4 + 4).map((choice) => ({ ...choice }))), ...rows.map((row) => row.map((button) => ({ ...button })))]
    if (keyboard.length !== 0) body['reply_markup'] = { inline_keyboard: keyboard }
    try {
      const result = jsonObject(await this.sendBody(connection, body, piece))
      if (!this.current(connection)) return
      const { outgoing: _outgoing, ...kept } = connection.kept
      connection.kept = { ...kept, ...(origin !== undefined && safeInteger(result?.['message_id']) ? { replies: [...kept.replies, { ...origin, chatId: account.chatId, messageId: result['message_id'], text: piece.text }].slice(-2048) } : {}), ...(question !== undefined && safeInteger(result?.['message_id']) ? { questions: [...kept.questions, { messageId: result['message_id'], id: question }] } : {}) }
      this.save(connection)
    } catch (error) {
      if (!this.current(connection)) return
      const failure = error instanceof TelegramFailure ? error : new TelegramFailure(0)
      connection.detail = failure.code === 0 ? 'A Telegram message may not have arrived. Use /status in Telegram and check worker sessions; uncertain sends are not retried automatically.' : failure.message
      if (failure.code === 0) { connection.kept = { ...connection.kept, uncertain: true }; this.save(connection) }
      if (failure.code === 401 || failure.code === 404 || failure.code === 409) connection.state = this.stateFor(failure)
      this.changed()
    }
  }
}
