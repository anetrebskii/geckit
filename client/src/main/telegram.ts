import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'

import type { ManagerDecision } from '../shared/manager'
import type { Json, JsonObject } from '../shared/elicitation'
import { jsonObject } from '../shared/elicitation'
import type { TelegramAction, TelegramAccount, TelegramBot, TelegramDecision, TelegramView } from '../shared/telegram'
import { endsIn, shareLink, shareTargets, targetTitle } from '../shared/share'
import type { Shares } from './shares'
import { telegramText } from './telegram-text'
import { telegramMessages } from './telegram-render'
import type { TelegramPiece } from './telegram-render'
import { TelegramBotClient, TelegramFailure } from './telegram-bot'
import type { TelegramUpdate } from './telegram-bot'

export interface TelegramVault {
  available(): boolean
  encrypt(text: string): Buffer
  decrypt(bytes: Buffer): string
}

export interface TelegramManager {
  submit(text: string, id?: string): Promise<void>
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
  readonly vault: TelegramVault
  readonly manager: TelegramManager
  readonly changed: (view: TelegramView) => void
  readonly fetch?: typeof fetch
  readonly now?: () => number
  readonly shares?: Pick<Shares, 'offerable' | 'open' | 'stop' | 'stopAll' | 'list'>
}

type Button = { readonly text: string; readonly callback_data: string } | { readonly text: string; readonly url: string }

type Callback = { readonly token: string } & (
  | { readonly kind: 'late'; readonly text: string; readonly run: boolean; readonly group: string; readonly question?: string }
  | { readonly kind: 'decision'; readonly id: TelegramDecision['id']; readonly value: string }
  | { readonly kind: 'share'; readonly target: string }
  | { readonly kind: 'unshare'; readonly id: string }
)

interface KeptTelegram {
  readonly token: string
  readonly bot: TelegramBot
  readonly account?: TelegramAccount
  readonly offset: number
  readonly callbacks: readonly Callback[]
  readonly questions: readonly { readonly messageId: number; readonly id: TelegramDecision['id'] }[]
  readonly incoming?: number
  readonly outgoing?: boolean
  readonly uncertain?: boolean
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
// Offers and Stop buttons kept across restarts; the oldest fall away first, and a tap on one says it is no longer available.
const SHARE_BUTTONS = 60
const safeInteger = (value: Json | undefined): value is number => typeof value === 'number' && Number.isSafeInteger(value)
const accountOf = (value: Json | undefined): TelegramAccount | undefined => {
  const item = jsonObject(value)
  return item !== undefined && safeInteger(item['id']) && safeInteger(item['chatId']) && typeof item['name'] === 'string' ? { id: item['id'], chatId: item['chatId'], name: item['name'], ...(typeof item['username'] === 'string' ? { username: item['username'] } : {}) } : undefined
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
    if (item['kind'] === 'late' && typeof item['text'] === 'string' && typeof item['run'] === 'boolean' && typeof item['group'] === 'string') callbacks.push({ token: item['token'], kind: 'late', text: item['text'], run: item['run'], group: item['group'], ...(typeof item['question'] === 'string' ? { question: item['question'] } : {}) })
    if (item['kind'] === 'decision' && typeof item['id'] === 'string' && typeof item['value'] === 'string') callbacks.push({ token: item['token'], kind: 'decision', id: item['id'], value: item['value'] })
    if (item['kind'] === 'share' && typeof item['target'] === 'string') callbacks.push({ token: item['token'], kind: 'share', target: item['target'] })
    if (item['kind'] === 'unshare' && typeof item['id'] === 'string') callbacks.push({ token: item['token'], kind: 'unshare', id: item['id'] })
  }
  const questions: KeptTelegram['questions'][number][] = []
  if (Array.isArray(value['questions'])) for (const entry of value['questions']) {
    const item = jsonObject(entry)
    if (item !== undefined && safeInteger(item['messageId']) && typeof item['id'] === 'string') questions.push({ messageId: item['messageId'], id: item['id'] })
  }
  return { token: value['token'], bot: { id: bot['id'], username: bot['username'] }, offset: value['offset'], callbacks, questions, ...(account === undefined ? {} : { account }), ...(safeInteger(value['incoming']) ? { incoming: value['incoming'] } : {}), ...(value['outgoing'] === true ? { outgoing: true } : {}), ...(value['uncertain'] === true ? { uncertain: true } : {}) }
}

export class ManagerTelegram {
  private active: Connection | undefined
  private pairing: Pairing | undefined
  private attempt: AbortController | undefined
  private failure: TelegramView['state'] = 'disconnected'
  private detail: string | undefined
  private outgoing: Promise<void> = Promise.resolve()
  // The replies that carry each live link's buttons, which go when the link ends.
  private readonly linkMessages = new Map<string, number[]>()
  private readonly path: string
  private readonly now: () => number

  constructor(private readonly options: TelegramOptions) {
    this.path = join(options.directory, 'manager-telegram.sealed')
    this.now = options.now ?? Date.now
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
      connection.kept = { ...kept, uncertain: true }
      connection.detail = 'A previous delivery was interrupted. Use /status in Telegram and check worker sessions before sending again; uncertain deliveries are never retried automatically.'
      try { this.save(connection) } catch { return }
    }
    await this.verifyAndPoll(connection)
  }

  stop(): void {
    this.attempt?.abort()
    this.pairing?.controller.abort()
    this.active?.controller.abort()
  }

  async action(action: TelegramAction): Promise<TelegramView> {
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

  notify(text: string, decision?: TelegramDecision): Promise<void> {
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
      await this.send(connection, limited, choices, question?.id, undefined, await this.offers(connection, text))
    })
    this.outgoing = job.catch(() => undefined)
    return job
  }

  /** A link ended, by Stop, its time or the app: the buttons on the replies that carried it go. */
  linkEnded(id: string): void {
    const messages = this.linkMessages.get(id) ?? []
    this.linkMessages.delete(id)
    const connection = this.active
    const account = connection?.kept.account
    if (connection === undefined || account === undefined) return
    for (const messageId of messages) void connection.client.call('editMessageReplyMarkup', { chat_id: account.chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }, connection.controller.signal).catch(() => undefined)
    connection.kept = { ...connection.kept, callbacks: connection.kept.callbacks.filter((item) => item.kind !== 'unshare' || item.id !== id) }
    try { this.save(connection) } catch { /* Reported in the view by save itself. */ }
    this.changed()
  }

  /** One button for each localhost address, file or folder a message names that may be shared; nothing is shared until one is pressed. */
  private async offers(connection: Connection, text: string): Promise<Button[][]> {
    const shares = this.options.shares
    if (shares === undefined) return []
    const rows: Button[][] = []
    for (const target of shareTargets(text)) {
      if (!(await shares.offerable(target).catch(() => false))) continue
      const token = nonce()
      this.keepShareButton(connection, { token, kind: 'share', target })
      rows.push([{ text: `Open ${targetTitle(target)}`.slice(0, 64), callback_data: token }])
    }
    return rows
  }

  private keepShareButton(connection: Connection, callback: Callback): void {
    const shared = connection.kept.callbacks.filter((item) => item.kind === callback.kind)
    const dropped = new Set(shared.slice(0, Math.max(0, shared.length - SHARE_BUTTONS + 1)).map((item) => item.token))
    connection.kept = { ...connection.kept, callbacks: [...connection.kept.callbacks.filter((item) => !dropped.has(item.token)), callback] }
  }

  private async share(connection: Connection, callback: Extract<Callback, { readonly kind: 'share' | 'unshare' }>, replyTo: number): Promise<void> {
    const shares = this.options.shares
    if (shares === undefined) return
    if (callback.kind === 'unshare') {
      connection.kept = { ...connection.kept, callbacks: connection.kept.callbacks.filter((item) => item.token !== callback.token) }
      this.save(connection)
      const stopped = shares.stop(callback.id)
      await this.send(connection, stopped === undefined ? 'This link has already ended.' : `Stopped sharing ${stopped.title}. The link no longer opens.`, [], undefined, replyTo)
      return
    }
    if (!this.options.manager.enabled()) { await this.send(connection, 'Manager is disabled. Enable it in GeckIt Settings → Manager before sharing.'); return }
    const opened = await shares.open(callback.target)
    if ('why' in opened) { await this.send(connection, opened.why, [], undefined, replyTo); return }
    const stop = nonce()
    this.keepShareButton(connection, { token: stop, kind: 'unshare', id: opened.id })
    this.save(connection)
    const text = opened.again
      ? `**${opened.title} is already shared.** The link ends in ${endsIn(opened.expiresAt, this.now())}.`
      : `**${opened.title} is shared for 12 hours.**\nOpen it from any phone or computer while GeckIt stays open here. Anyone with this link can see it until it ends.`
    const sent = await this.send(connection, text, [], undefined, replyTo, [[{ text: `Open ${opened.title}`.slice(0, 64), url: shareLink(opened.key) }], [{ text: 'Stop sharing', callback_data: stop }]])
    if (sent !== undefined && shares.list().some((one) => one.id === opened.id)) this.linkMessages.set(opened.id, [...(this.linkMessages.get(opened.id) ?? []), sent])
  }

  private async links(connection: Connection): Promise<void> {
    const live = this.options.shares?.list() ?? []
    if (live.length === 0) { await this.send(connection, 'Nothing is shared. A button appears under a Manager message that names a localhost address or a file.'); return }
    const rows: Button[][] = live.map((link) => {
      const token = nonce()
      this.keepShareButton(connection, { token, kind: 'unshare', id: link.id })
      return [{ text: `Stop ${link.title}`.slice(0, 64), callback_data: token }]
    })
    this.save(connection)
    await this.send(connection, [`**Shared links** (${String(live.length)})`, ...live.map((link) => `- ${link.title} - ends in ${endsIn(link.expiresAt, this.now())}`)].join('\n'), [], undefined, undefined, rows)
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
    const pairing: Pairing = { kept: { token, bot, offset: 0, callbacks: [], questions: [] }, client, controller, state: 'pairing', payload: nonce(), expiresAt: this.now() + 10 * 60_000, sending: Promise.resolve() }
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
      if (callback.kind === 'share' || callback.kind === 'unshare') {
        try { await connection.client.call('answerCallbackQuery', { callback_query_id: query.id }, connection.controller.signal) } catch { /* Callback acknowledgement does not prevent dispatch. */ }
        await this.share(connection, callback, query.message.id); return
      }
      if (callback.kind === 'decision' && this.options.manager.hasDecision?.(callback.id) === false) { this.retire(connection, callback.id); this.removeDecision(connection, callback.id); this.save(connection); await this.send(connection, 'This question has already been answered or is no longer available.', [], undefined, query.message.id); return }
      if (!this.options.manager.enabled()) { await this.send(connection, 'Manager is disabled. Enable it in GeckIt Settings → Manager before answering.'); return }
      const previous = connection.kept
      connection.kept = { ...connection.kept, callbacks: connection.kept.callbacks.filter((item) => callback.kind === 'decision' ? item.kind !== 'decision' || item.id !== callback.id : item.kind !== 'late' || item.group !== callback.group) }
      this.save(connection)
      try { await connection.client.call('answerCallbackQuery', { callback_query_id: query.id }, connection.controller.signal) } catch { /* Callback acknowledgement does not prevent dispatch. */ }
      if (callback.kind === 'late') {
        if (callback.run) await this.dispatch(connection, callback.text, callback.question, `telegram:late:${callback.group}`)
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
    if (message.text === undefined) { await this.send(connection, 'Manager accepts text messages here. Send the instruction as text; attachments are not supported yet.'); return }
    const text = message.text.trim()
    if (text === '') return
    if (text.length > 16_384) { await this.send(connection, 'This instruction is too long for Telegram Manager. Send a shorter instruction here.'); return }
    if (/^\/(status|help|settings|start|links)(?:@[A-Za-z0-9_]+)?$/.test(text)) { await this.dispatch(connection, text); return }
    const question = message.replyTo === undefined ? undefined : connection.kept.questions.find((item) => item.messageId === message.replyTo)?.id
    if (message.replyTo !== undefined && question === undefined) { await this.send(connection, 'This reply is not attached to an open question. Reply to the current question or send a new instruction here.'); return }
    if (message.date * 1000 < this.now() - 10 * 60_000) { await this.late(connection, text, question); return }
    await this.dispatch(connection, text, question, `telegram:${String(update.id)}`, message.id)
  }

  private async dispatch(connection: Connection, text: string, question?: string, id?: string, replyTo?: number): Promise<void> {
    const command = text.replace(/@[A-Za-z0-9_]+$/, '')
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
    try {
      if (question !== undefined) {
        if (this.options.manager.hasDecision?.(question) === false) { this.removeDecision(connection, question); this.save(connection); await this.send(connection, 'This question has already been answered or is no longer available.'); return }
        if (this.options.manager.answer === undefined) { await this.send(connection, 'This question cannot be answered here. Ask Manager to show the current question again.'); return }
        this.removeDecision(connection, question)
        this.save(connection)
        await this.options.manager.answer(question, text, () => this.current(connection) && this.options.manager.enabled())
        if (this.options.manager.hasDecision?.(question) === true) { this.restoreDecision(connection, previous, question); this.save(connection) }
      } else if (command === '/pause') await this.options.manager.pause()
      else if (command === '/resume') await this.options.manager.resume()
      else await this.options.manager.submit(text, id)
      await this.send(connection, question === undefined ? command === '/pause' ? 'Manager paused. Existing workers continue.' : command === '/resume' ? 'Manager resumed.' : 'Sent to Manager.' : 'Answer sent to Manager.', [], undefined, replyTo)
    } catch {
      if (question !== undefined) { this.restoreDecision(connection, previous, question); this.save(connection) }
      await this.send(connection, 'Manager could not accept this instruction. Use /status here or check GeckIt Settings → Manager before sending again.', [], undefined, replyTo)
    }
  }

  private async late(connection: Connection, text: string, question?: string): Promise<void> {
    if (connection.kept.callbacks.length > 254) { await this.send(connection, 'Too many decisions are waiting in Telegram. Use their Run now or Discard buttons, then send this instruction again. It has not been run.'); return }
    const group = nonce()
    const callbacks: Callback[] = [true, false].map((run) => ({ token: nonce(), kind: 'late', group, text, run, ...(question === undefined ? {} : { question }) }))
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

  private send(connection: Connection, text: string, choices: readonly { readonly text: string; readonly callback_data: string }[] = [], question?: string, replyTo?: number, rows: readonly (readonly Button[])[] = []): Promise<number | undefined> {
    const job = connection.sending.then(async () => {
      const pieces = telegramMessages(text)
      let sent: number | undefined
      for (const [index, piece] of pieces.entries()) {
        const last = index === pieces.length - 1
        sent = await this.sendOne(connection, piece, last ? choices : [], last ? question : undefined, index === 0 ? replyTo : undefined, last ? rows : [])
        if (connection.kept.outgoing === true) break
      }
      return sent
    })
    connection.sending = job.then(() => undefined, () => undefined)
    return job
  }

  private async sendOne(connection: Connection, piece: TelegramPiece, choices: readonly { readonly text: string; readonly callback_data: string }[], question?: string, replyTo?: number, rows: readonly (readonly Button[])[] = []): Promise<number | undefined> {
    const account = connection.kept.account
    if (account === undefined || !this.current(connection)) return undefined
    connection.kept = { ...connection.kept, outgoing: true }
    this.save(connection)
    const body: JsonObject = { chat_id: account.chatId, text: piece.html, parse_mode: 'HTML', link_preview_options: { is_disabled: true } }
    if (replyTo !== undefined) body['reply_parameters'] = { message_id: replyTo, allow_sending_without_reply: true }
    const keyboard = [...Array.from({ length: Math.ceil(choices.length / 4) }, (_value, at) => choices.slice(at * 4, at * 4 + 4).map((choice) => ({ ...choice }))), ...rows.map((row) => row.map((button) => ({ ...button })))]
    if (keyboard.length !== 0) body['reply_markup'] = { inline_keyboard: keyboard }
    try {
      const result = jsonObject(await this.sendBody(connection, body, piece))
      if (!this.current(connection)) return undefined
      const { outgoing: _outgoing, ...kept } = connection.kept
      connection.kept = { ...kept, ...(question !== undefined && safeInteger(result?.['message_id']) ? { questions: [...kept.questions, { messageId: result['message_id'], id: question }] } : {}) }
      this.save(connection)
      return safeInteger(result?.['message_id']) ? result['message_id'] : undefined
    } catch (error) {
      if (!this.current(connection)) return undefined
      const failure = error instanceof TelegramFailure ? error : new TelegramFailure(0)
      connection.detail = failure.code === 0 ? 'A Telegram message may not have arrived. Use /status in Telegram and check worker sessions; uncertain sends are not retried automatically.' : failure.message
      if (failure.code === 0) { connection.kept = { ...connection.kept, uncertain: true }; this.save(connection) }
      if (failure.code === 401 || failure.code === 404 || failure.code === 409) connection.state = this.stateFor(failure)
      this.changed()
      return undefined
    }
  }
}
