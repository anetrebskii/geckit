import { restoreTelegramManager } from './telegram-record'
import { telegramSettings } from './telegram-settings'
import { managerStatus } from '../channel-text'
import { say } from '../manager-voice'
import { ManagerTelegram } from '../telegram'
import type { TelegramFiles, TelegramManager } from '../telegram'
import { phoneTelegramView } from '../telegram-access'
import type { ChannelId, ChannelInfo } from '../../shared/channels'
import type { ManagerDecision } from '../../shared/manager'
import type { TelegramAction, TelegramView } from '../../shared/telegram'
import { telegramThreadKey } from '../../shared/telegram'
import type { Channel, ChannelContext, ChannelModule, Json } from './channel-api'

export const TELEGRAM_ID: ChannelId = 'channel:telegram'

export const TELEGRAM_INFO: ChannelInfo = {
  id: TELEGRAM_ID,
  name: 'Telegram',
  icon: 'telegram',
  description: 'Talk to Manager from your own Telegram chat or a team topic.',
  fields: [],
  capabilities: ['conversations', 'manager', 'replies', 'delivery', 'control', 'files', 'shares'],
}

export interface TelegramChannelDeps {
  readonly fetch?: typeof fetch
}

/** What Settings asks the Telegram channel: its view, or an action on the connection. */
export type TelegramRequest = { readonly kind: 'view' } | { readonly kind: 'action'; readonly action: TelegramAction }

const json = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json

/** Telegram drives the existing bot through the channel contract: one owner chat, or one team topic whose answers are kept until delivered. */
export function telegramChannel(deps: TelegramChannelDeps = {}): ChannelModule {
  return {
    restoreManager: restoreTelegramManager,
    settings: telegramSettings,
    present: (value, from) => from === 'phone' ? json(phoneTelegramView(JSON.parse(JSON.stringify(value)) as TelegramView)) : value,
    migrate: (migration) => {
      if (migration.created) migration.configure({ enabled: true, manager: true })
      migration.renameManagerChannel('telegram', TELEGRAM_ID, (key) => key.startsWith('team:'))
      migration.renameNoteKey('managerTelegramSource', 'managerRequestSource')
      migration.adoptSealed('manager-telegram.sealed')
    },
    create: (context) => createTelegram(context, deps),
  }
}

function createTelegram(context: ChannelContext, deps: TelegramChannelDeps): Channel {
  const conversations = context.conversations
  const notified = new Map<string, string>()
  const pendingListeners = new Set<() => void>()
  let bridge: ManagerTelegram | undefined
  let delivering = ''
  let watched: { readonly thread: string; readonly stop: () => void } | undefined
  let routed: { readonly thread: string; readonly stop: () => void } | undefined
  let bound: { readonly thread: string; readonly stop: () => void } | undefined

  const view = (): TelegramView | undefined => bridge?.view()
  const thread = (): string => {
    const now = view()
    const account = now?.account
    if (account === undefined) throw new Error('Telegram is not connected.')
    const pairing = now?.state === 'connected' && now.bot !== undefined ? `${String(now.bot.id)}:${String(account.id)}:${String(account.chatId)}` : undefined
    const id = conversations.manager({
      key: telegramThreadKey(account),
      title: account.team === undefined ? account.name : `${account.team.title} / ${String(account.team.topicId)}`,
      from: account.name,
      labels: { chat: String(account.chatId), user: String(account.id), ...(account.username === undefined ? {} : { username: `@${account.username}` }) },
      ...(account.team === undefined ? { owner: context.control !== undefined, ...(pairing === undefined ? {} : { pairing }) } : { shared: true }),
    })
    if (id === undefined) throw new Error('Manager is off. Turn it on in GeckIt.')
    follow(id)
    return id
  }
  const tryThread = (): string | undefined => { try { return thread() } catch { return undefined } }
  const team = (): boolean => view()?.account?.team !== undefined
  const decisions = (): readonly ManagerDecision[] => { const id = tryThread(); return id === undefined ? [] : conversations.decisions?.(id) ?? [] }

  const notifyDecisions = (): void => {
    const telegram = bridge
    if (telegram === undefined || telegram.view().account === undefined) return
    const open = decisions()
    for (const id of notified.keys()) if (!open.some((item) => item.id === id)) {
      notified.delete(id)
      try { telegram.resolve(id) } catch { /* Telegram reports its secure-storage failure in its own view. */ }
    }
    for (const decision of open) {
      const signature = JSON.stringify(decision)
      if (notified.get(decision.id) === signature) continue
      notified.set(decision.id, signature)
      void telegram.notify(decision.title, decision).catch(() => undefined)
    }
  }

  function follow(id: string): void {
    if (watched?.thread === id) return
    watched?.stop()
    const stop = conversations.watch(id, (event) => {
      const telegram = bridge
      if (telegram === undefined) return
      switch (event.kind) {
        case 'decisions': notifyDecisions(); break
        case 'status': telegram.progress(event.activity); break
        case 'answer': if (!team()) void telegram.notify(event.text, undefined, event.reply).catch(() => undefined); break
        case 'review': if (!team()) void telegram.notify(`${event.title}\n${event.body}\n\n${say(conversations.language?.(id)).reviewWorker}`).catch(() => undefined); break
        case 'history': telegram.historyChanged(event.change); break
        default:
      }
      for (const listener of pendingListeners) listener()
    })
    watched = { thread: id, stop }
    bound?.stop()
    const unbind = context.files?.bind(id, async (bytes, name, media, caption, as, origin, beforeSend) => {
      const telegram = bridge
      if (telegram === undefined) throw new Error('Telegram is not ready yet.')
      const sent = await telegram.fileSender()(bytes, name, media, caption, as, origin, beforeSend)
      return { channel: TELEGRAM_ID, destination: String(telegram.view().account?.chatId ?? ''), messageId: String(sent), fileId: String(sent) }
    }, 50)
    bound = unbind === undefined ? undefined : { thread: id, stop: unbind }
  }

  const route = (id: string): void => {
    if (routed?.thread === id || conversations.deliver === undefined) return
    routed?.stop()
    routed = { thread: id, stop: conversations.deliver(id, (text, origin, beforeSend) => {
      if (bridge === undefined) return Promise.reject(new Error('Telegram is not ready yet.'))
      return bridge.deliver(text, origin, beforeSend)
    }) }
  }

  const files: TelegramFiles | undefined = context.files === undefined ? undefined : {
    keep: (bytes, name, media) => context.files!.keep(thread(), bytes, name, media),
    has: (id) => { const own = tryThread(); return own !== undefined && context.files!.has(own, id) },
    hold: (ids) => context.files!.hold(ids),
  }

  const adapter: TelegramManager = {
    thread,
    accepted: (id) => conversations.delivery?.(id) !== undefined,
    historyBoundary: (chatId) => { const account = view()?.account; return conversations.historyBoundary?.(account === undefined ? String(chatId) : telegramThreadKey(account)) },
    originCurrent: (origin) => conversations.current?.(origin) !== false && (!team() || origin.thread === tryThread()),
    pending: () => { const id = tryThread(); return id === undefined ? [] : conversations.pending?.(id) ?? [] },
    typingAllowed: () => { const id = tryThread(); return id !== undefined && conversations.working?.(id) === true },
    onPending: (changed) => { pendingListeners.add(changed); return () => pendingListeners.delete(changed) },
    submit: (text, id, files, authorized, source) => conversations.send(thread(), { text, ...(id === undefined ? {} : { id }), ...(files === undefined ? {} : { attachments: files }), ...(authorized === undefined ? {} : { authorized }), ...(source === undefined ? {} : { request: source }) }),
    reply: async (text, id, reference, authorized, files, source) => {
      await conversations.send(thread(), { text, ...(id === undefined ? {} : { id }), replyTo: { ...reference, message: String(reference.messageId) }, ...(files === undefined ? {} : { attachments: files }), ...(authorized === undefined ? {} : { authorized }), ...(source === undefined ? {} : { request: source }) })
    },
    pause: async () => { if (context.control === undefined) throw new Error('Pause Manager in GeckIt.'); await context.control.pause() },
    resume: async () => { if (context.control === undefined) throw new Error('Resume Manager in GeckIt.'); await context.control.resume() },
    status: (speech) => {
      if (!team() && context.control !== undefined) return managerStatus(context.control.view(), speech)
      const id = tryThread()
      const own = id === undefined ? undefined : conversations.summary?.(id)
      const manager = own?.manager ?? 'off'
      return `Manager: ${manager === 'off' || manager === 'paused' ? manager : own?.state ?? 'idle'}. ${String(own?.workers ?? 0)} team workers. ${String(own?.uncertain ?? 0)} uncertain replies.${own?.error === undefined ? '' : ` ${own.error}`}`
    },
    language: () => { const id = tryThread(); return id === undefined ? undefined : conversations.language?.(id) },
    enabled: () => conversations.managerOn?.() ?? false,
    decisions,
    hasDecision: (id) => decisions().some((item) => item.id === id),
    answer: async (id, choice, authorized) => {
      if (conversations.decide === undefined) throw new Error('Decisions are unavailable here.')
      return conversations.decide(thread(), id, choice, authorized === undefined ? {} : { authorized })
    },
  }

  const changed = (now: TelegramView): void => {
    context.view?.(json(now))
    const connected = now.state === 'connected' && now.account !== undefined
    context.status(connected ? 'connected' : 'starting', connected ? undefined : 'Telegram is not connected.')
    const channel = connected ? `${String(now.bot?.id)}:${telegramThreadKey(now.account!)}` : ''
    if (channel !== '' && channel !== delivering) {
      delivering = channel
      notified.clear()
      const id = tryThread()
      notifyDecisions()
      if (id !== undefined && now.account?.team !== undefined) queueMicrotask(() => {
        if (bridge?.view().state !== 'connected') return
        route(id)
        conversations.ready?.(id)
      })
    }
    if (!connected) { delivering = ''; routed?.stop(); routed = undefined }
    conversations.close?.(connected ? undefined : 'Telegram is not connected. Connect it in Settings, Channels to reply in this thread.')
  }

  return {
    start: async () => {
      const telegram = new ManagerTelegram({
        storage: context.sealed,
        manager: adapter,
        changed,
        ...(files === undefined ? {} : { files }),
        ...(context.shares === undefined ? {} : { shares: context.shares }),
        ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
      })
      bridge = telegram
      context.shares?.watch((change) => { if (change.kind === 'ended') telegram.linkEnded(change.id); else context.view?.(json(telegram.view())) })
      conversations.watchManager?.((on) => { if (!on) void telegram.action({ kind: 'disconnect' }).catch(() => undefined) })
      context.view?.(json(telegram.view()))
      if (conversations.managerOn?.() === true) void telegram.start()
      else await telegram.action({ kind: 'disconnect' })
    },
    stop: async () => {
      watched?.stop()
      routed?.stop()
      bound?.stop()
      bridge?.stop()
      bridge = undefined
    },
    request: async (asked, from) => {
      const telegram = bridge
      if (telegram === undefined) throw new Error('Telegram is not ready yet.')
      const request = asked as TelegramRequest
      if (request.kind === 'view') return json(from === 'phone' ? phoneTelegramView(telegram.view()) : telegram.view())
      if (request.kind !== 'action') throw new Error('Telegram does not know that request.')
      if (from !== 'desktop') throw new Error('Manage the Telegram connection on the computer.')
      const action = request.action
      if (action.kind !== 'disconnect' && action.kind !== 'cancel-pairing' && action.kind !== 'stop-link' && conversations.managerOn?.() !== true) throw new Error('Enable Manager in GeckIt before connecting Telegram.')
      return json(await telegram.action(action))
    },
  }
}
