import type { TelegramAttachments } from '../telegram-attachments'
import type { ChannelFileSender } from './channel-files'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeJson } from '../../core/configuration'
import type { CoreEvent } from '../../core/events'
import type { CardAnswer, ChatSession, ManagerLabels, SessionItem, SessionItems, SessionMessage, Settings } from '../../shared/api'
import { providerOf } from '../../shared/api'
import type { ChannelChange, ChannelFailure, ChannelId, ChannelSetting, ChannelState, ChannelValues, ChannelView, ChannelsView } from '../../shared/channels'
import { missingFields } from '../../shared/channels'
import { MANAGER_MAIN_THREAD, managerLabels } from '../../shared/manager'
import type { ManagerHistoryBoundary, ManagerHistoryChange, ManagerReplyOrigin, ManagerThreadOpen, ManagerView } from '../../shared/manager'
import { pluginLogger } from '../sessions/plugin-logs'
import type { Channel, ChannelContext, ChannelConversation, ChannelEvent, ChannelThread, Json } from './channel-api'
import { threadActivity } from '../manager-status'
import type { LoadedChannel } from './libraries'
import { installChannel, installedChannels, removeChannelLibrary, updateChannel } from './libraries'
import { SLACK_INFO, SLACK_MODULE } from './slack'
import { DISCORD_INFO, DISCORD_MODULE } from './discord'

/** Channels that come with GeckIt: turned on and set up like a library, never removed or updated from GitHub. */
const BUILT_IN: readonly LoadedChannel[] = [{ info: SLACK_INFO, path: 'built-in', module: SLACK_MODULE }, { info: DISCORD_INFO, path: 'built-in', module: DISCORD_MODULE }]
const builtIn = (id: ChannelId): boolean => BUILT_IN.some((one) => one.info.id === id)

export interface ChannelVault {
  available(): boolean
  encrypt(text: string): Buffer
  decrypt(bytes: Buffer): string
}

export interface ChannelSessions {
  send(message: SessionMessage): Promise<string>
  answer(id: string, card: string, answer: CardAnswer | string): Promise<boolean>
  stop(id: string): void
  items(id: string): Promise<SessionItem[]>
}

export interface ChannelManager {
  historyBoundaryFor?(channel: string, key: string): ManagerHistoryBoundary | undefined
  onHistoryChange?(listener: (change: ManagerHistoryChange) => void): () => void
  originCurrent?(origin: ManagerReplyOrigin): boolean
  enabled(): boolean
  send(text: string, source: 'channel', id: string | undefined, workers: readonly string[], authorized: () => boolean, attachments: readonly string[], telegramRequests: readonly string[], thread: string): Promise<string>
  thread(open: ManagerThreadOpen): string
  label(thread: string, labels: ManagerLabels): void
  threadOf(session: string): string | undefined
  threadRecord(thread: string): (Pick<ManagerThreadOpen, 'channel'> & Partial<Pick<ManagerThreadOpen, 'key'>>) | undefined
  close(channel: string, reason: string | undefined): void
  onResponse(listener: (text: string, origin: ManagerReplyOrigin) => void): () => void
  inspect(id: string): Promise<SessionItems>
  answer(id: string, choice: string): Promise<unknown>
  answerCard(session: string, card: string, answer: string): Promise<boolean>
}

export interface ChannelsDeps {
  readonly directory: string
  readonly attachments?: TelegramAttachments
  readonly vault: ChannelVault
  readonly settings: () => Settings
  readonly save: (change: Pick<Settings, 'channels'>) => void
  readonly sessions: ChannelSessions
  readonly conversations: () => readonly ChatSession[]
  /** Keeps labels on a conversation a channel started. */
  readonly labelConversation: (id: string, labels: ManagerLabels) => void
  readonly manager: ChannelManager
  readonly managerView: () => ManagerView | undefined
  readonly employees: () => readonly { readonly id: string; readonly name: string; readonly role: string; readonly archived: boolean }[]
  readonly projectName: (root: string) => string
  readonly subscribe: (listener: (event: CoreEvent) => void) => () => void
  readonly changed: (view: ChannelsView) => void
}

interface State {
  readonly conversations: readonly string[]
  readonly store: { readonly [key: string]: Json }
}

interface Running {
  loaded: LoadedChannel
  instance: Channel | undefined
  state: ChannelState
  says: string | undefined
  signature: string | undefined
  alive: { value: boolean }
  readonly unwatch: Set<() => void>
}

const slug = (id: ChannelId): string => id.replaceAll(':', '-')
const message = (error: unknown): string => error instanceof Error ? error.message : String(error)

export class Channels {
  readonly #deps: ChannelsDeps
  readonly #fileSenders = new Map<string, ChannelFileSender>()
  readonly #running = new Map<ChannelId, Running>()
  #failures: readonly ChannelFailure[] = []
  #stopped = false
  #unsubscribe: (() => void) | undefined
  readonly #listeners = new Map<string, Set<(event: ChannelEvent) => void>>()
  readonly #shown = new Map<string, string>()
  readonly #decisions = new Map<string, string>()
  readonly #statuses = new Map<string, string>()
  #unhistory: (() => void) | undefined
  #unanswer: (() => void) | undefined
  #counted = ''
  /** Reads Manager's view again each minute, so the minutes Manager has worked on a message go up. */
  #tick: ReturnType<typeof setInterval> | undefined

  constructor(deps: ChannelsDeps) {
    this.#deps = deps
  }

  fileSender(thread: string): ChannelFileSender {
    const sender = this.#fileSenders.get(thread)
    if (sender === undefined) throw new Error('File delivery is unavailable for this channel thread. Send a new message to the bot in the intended conversation first.')
    return sender
  }

  #folder(): string { return join(this.#deps.directory, 'channels') }
  #statePath(id: ChannelId): string { return join(this.#folder(), `${slug(id)}.json`) }
  #secretsPath(id: ChannelId): string { return join(this.#folder(), `${slug(id)}.secrets`) }

  #state(id: ChannelId): State {
    try {
      const parsed = JSON.parse(readFileSync(this.#statePath(id), 'utf8')) as Partial<State>
      return { conversations: Array.isArray(parsed.conversations) ? parsed.conversations.filter((one) => typeof one === 'string') : [], store: parsed.store !== null && typeof parsed.store === 'object' ? parsed.store : {} }
    } catch { return { conversations: [], store: {} } }
  }

  #saveState(id: ChannelId, change: Partial<State>): void {
    mkdirSync(this.#folder(), { recursive: true, mode: 0o700 })
    writeJson(this.#statePath(id), { ...this.#state(id), ...change })
  }

  #secrets(id: ChannelId): { readonly [key: string]: string } {
    if (!existsSync(this.#secretsPath(id)) || !this.#deps.vault.available()) return {}
    try { return JSON.parse(this.#deps.vault.decrypt(readFileSync(this.#secretsPath(id)))) as { readonly [key: string]: string } }
    catch { return {} }
  }

  #saveSecrets(id: ChannelId, change: { readonly [key: string]: string | null }): void {
    const next: { [key: string]: string } = { ...this.#secrets(id) }
    for (const [key, value] of Object.entries(change)) {
      if (value === null || value === '') delete next[key]
      else next[key] = value
    }
    if (Object.keys(next).length === 0) { rmSync(this.#secretsPath(id), { force: true }); return }
    if (!this.#deps.vault.available()) throw new Error('Secure storage is unavailable, so GeckIt cannot keep this secret.')
    mkdirSync(this.#folder(), { recursive: true, mode: 0o700 })
    writeFileSync(this.#secretsPath(id), this.#deps.vault.encrypt(JSON.stringify(next)), { mode: 0o600 })
  }

  #setting(id: ChannelId): ChannelSetting | undefined { return this.#deps.settings().channels.find((one) => one.info.id === id) }

  #saveSetting(id: ChannelId, change: (setting: ChannelSetting) => ChannelSetting): ChannelSetting {
    const current = this.#setting(id)
    if (current === undefined) throw new Error('This channel library is not installed.')
    const next = change(current)
    this.#deps.save({ channels: this.#deps.settings().channels.map((one) => one.info.id === id ? next : one) })
    return next
  }

  view(): ChannelsView {
    const channels = this.#deps.settings().channels.flatMap((setting): ChannelView[] => {
      const running = this.#running.get(setting.info.id)
      if (running === undefined) return []
      const secrets = Object.keys(this.#secrets(setting.info.id))
      return [{ id: setting.info.id, name: setting.info.name, icon: setting.info.icon, ...(builtIn(setting.info.id) ? { builtIn: true as const } : {}), threads: (this.#deps.managerView()?.threads ?? []).filter((one) => one.id.startsWith(`${setting.info.id}:`)).length, ...(setting.info.source === undefined ? {} : { source: setting.info.source }), state: running.state, ...(running.says === undefined ? {} : { says: running.says }), secrets, conversations: this.#state(setting.info.id).conversations.length }]
    })
    return { channels, failures: this.#failures }
  }

  #emit(): void { if (!this.#stopped) this.#deps.changed(this.view()) }

  async start(): Promise<void> {
    const { loaded: libraries, failures } = await installedChannels()
    const clashing = libraries.filter((one) => builtIn(one.info.id))
    this.#failures = [...failures, ...clashing.map((one) => ({ id: one.info.id, name: one.info.name, ...(one.info.source === undefined ? {} : { source: one.info.source }), error: `${one.info.name} is now built into GeckIt. Remove this library; the built-in one keeps its settings.` }))]
    const loaded = [...BUILT_IN, ...libraries.filter((one) => !builtIn(one.info.id))]
    const settings = this.#deps.settings().channels
    for (const one of loaded) {
      const known = settings.find((setting) => setting.info.id === one.info.id)
      if (known === undefined) this.#deps.save({ channels: [...this.#deps.settings().channels, { info: one.info, enabled: false, projects: [], manager: false, config: {} }] })
      else if (JSON.stringify(known.info) !== JSON.stringify(one.info)) this.#saveSetting(one.info.id, (setting) => ({ ...setting, info: one.info }))
      this.#running.set(one.info.id, { loaded: one, instance: undefined, state: 'off', says: undefined, signature: undefined, alive: { value: false }, unwatch: new Set() })
    }
    this.#unsubscribe = this.#deps.subscribe((event) => this.#heard(event))
    this.#unhistory = this.#deps.manager.onHistoryChange?.((change) => this.#tell(change.id, { kind: 'history', change }))
    this.#unanswer = this.#deps.manager.onResponse((text, origin) => { if (origin.thread !== undefined && this.#deps.manager.originCurrent?.(origin) !== false) this.#tell(origin.thread, { kind: 'answer', text }) })
    this.#tick = setInterval(() => { const view = this.#deps.managerView(); if (view !== undefined) this.#statusAll(view) }, 60_000)
    this.#tick.unref?.()
    await this.reconcile()
  }

  #status(view: ManagerView, thread: string): void {
    const activity = threadActivity(view, thread)
    const status = JSON.stringify(activity ?? null)
    if (activity !== undefined && status !== this.#statuses.get(thread)) {
      this.#statuses.set(thread, status)
      this.#tell(thread, { kind: 'status', activity })
    }
  }

  #statusAll(view: ManagerView): void {
    for (const thread of view.threads ?? []) if (thread.id !== MANAGER_MAIN_THREAD && this.#listeners.has(thread.id)) this.#status(view, thread.id)
  }

  /** Starts, restarts or stops each channel to match its settings. */
  async reconcile(): Promise<void> {
    if (this.#stopped) return
    await Promise.all([...this.#running.entries()].map(async ([id, running]) => {
      const setting = this.#setting(id)
      const secrets = Object.keys(this.#secrets(id))
      const signature = setting === undefined ? 'gone' : JSON.stringify([setting.enabled, setting.projects, setting.manager, setting.config, secrets, running.loaded.path, running.loaded.info])
      this.#deps.manager.close(id, setting === undefined ? `${running.loaded.info.name} was removed. Its threads can only be read.` : !setting.enabled ? `${setting.info.name} is off. Turn it on in Settings, Channels to reply in this thread.` : !setting.manager ? `${setting.info.name} may no longer talk to Manager. Allow it in Settings, Channels to reply in this thread.` : undefined)
      if (signature === running.signature) return
      running.signature = signature
      await this.#halt(running)
      if (setting === undefined || !setting.enabled) { running.state = 'off'; running.says = undefined; this.#emit(); return }
      const missing = missingFields(setting, secrets)
      if (missing.length > 0) { running.state = 'setup'; running.says = `Fill in ${missing.map((one) => one.label).join(', ')}.`; this.#emit(); return }
      await this.#launch(id, running)
    }))
  }

  async #launch(id: ChannelId, running: Running): Promise<void> {
    const alive = { value: true }
    running.alive = alive
    running.state = 'starting'
    running.says = undefined
    this.#emit()
    try {
      const instance = await running.loaded.module.create(this.#context(id, running, alive))
      if (typeof instance !== 'object' || instance === null || typeof instance.start !== 'function' || typeof instance.stop !== 'function') throw new Error('Channel library must return start() and stop().')
      if (!alive.value) { await instance.stop().catch(() => undefined); return }
      running.instance = instance
      await instance.start()
      if (alive.value && running.state === 'starting') running.state = 'connected'
    } catch (error) {
      if (!alive.value) return
      running.state = 'failed'
      running.says = message(error)
    }
    this.#emit()
  }

  async #halt(running: Running): Promise<void> {
    running.alive.value = false
    for (const unwatch of running.unwatch) unwatch()
    running.unwatch.clear()
    const instance = running.instance
    running.instance = undefined
    await instance?.stop().catch(() => undefined)
  }

  #mayTalk(id: ChannelId): boolean { return this.#setting(id)?.manager === true && this.#deps.manager.enabled() }

  #thread(id: ChannelId, place: ChannelThread | undefined): string | undefined {
    if (!this.#mayTalk(id)) return undefined
    const setting = this.#setting(id)
    if (setting === undefined) return undefined
    const { labels, cut } = managerLabels(place?.labels)
    if (cut) pluginLogger({ id }).write('warn', 'labels.cut', { kept: Object.keys(labels).length })
    return this.#deps.manager.thread({ channel: id, place: setting.info.name, key: place?.key ?? 'default', ...(place?.title === undefined ? {} : { title: place.title }), ...(place?.from === undefined ? {} : { from: place.from }), ...(place?.link === undefined ? {} : { link: place.link }), labels })
  }

  #threadConversation(thread: string, manager: ManagerView | undefined = this.#deps.managerView()): ChannelConversation {
    const view = manager?.threads?.find((one) => one.id === thread)
    return { id: thread, root: '', title: view?.title ?? 'Manager', state: view?.state ?? 'idle', provider: view?.session === undefined ? manager?.config.provider ?? 'claude' : providerOf(view.session), manager: true }
  }

  #conversation(id: string): ChannelConversation | undefined {
    const found = this.#deps.conversations().find((one) => one.id === id)
    if (found === undefined) return undefined
    return { id: found.id, root: found.root, title: found.title, state: found.state, provider: providerOf(found.id), manager: false }
  }

  #context(id: ChannelId, running: Running, alive: { readonly value: boolean }): ChannelContext {
    const live = (): void => { if (!alive.value || this.#stopped) throw new Error('This channel was stopped.') }
    const setting = (): ChannelSetting => {
      const found = this.#setting(id)
      if (found === undefined) throw new Error('This channel library is not installed.')
      return found
    }
    const owned = (conversation: string): boolean => this.#state(id).conversations.includes(conversation)
    const isManager = (conversation: string): boolean => this.#deps.manager.threadRecord(conversation)?.channel === id
    const reach = (conversation: string): void => {
      live()
      if (!owned(conversation) && !isManager(conversation)) throw new Error('This channel did not start that conversation.')
    }
    const log = pluginLogger({ id })
    return {
      id,
      log,
      config: (): ChannelValues => {
        live()
        const current = setting()
        return Object.fromEntries(current.info.fields.filter((field) => field.type !== 'secret').flatMap((field) => {
          const value = current.config[field.key] ?? field.default
          return value === undefined ? [] : [[field.key, value]]
        }))
      },
      secret: (key) => { live(); return this.#secrets(id)[key] },
      store: {
        get: (key) => { live(); return this.#state(id).store[key] },
        set: (key, value) => {
          live()
          const store: { [key: string]: Json } = { ...this.#state(id).store }
          if (value === undefined) delete store[key]
          else store[key] = value
          this.#saveState(id, { store })
        },
      },
      status: (state, says) => {
        if (!alive.value) return
        running.state = state
        running.says = says
        this.#emit()
      },
      projects: () => { live(); return setting().projects.map((root) => ({ root, name: this.#deps.projectName(root) })) },
      providers: () => { live(); return this.#deps.settings().chatProviders },
      employees: () => { live(); return this.#deps.employees().filter((one) => !one.archived).map(({ id: employee, name, role }) => ({ id: employee, name, role })) },
      ...(builtIn(id) && this.#deps.attachments !== undefined ? { files: {
        keep: (conversation: string, bytes: Buffer, name: string, media: string): string => {
          reach(conversation)
          if (!isManager(conversation) || !this.#mayTalk(id)) throw new Error('Attachments require this channel’s authorized Manager thread.')
          const cache = this.#deps.attachments
          if (cache === undefined) throw new Error('Attachment storage is unavailable.')
          return cache.put(bytes, name, media, conversation).id
        },
        bind: (conversation: string, sender: ChannelFileSender): (() => void) => {
          reach(conversation)
          const bound: ChannelFileSender = async (...args) => {
            reach(conversation)
            if (!isManager(conversation) || !this.#mayTalk(id)) throw new Error('This channel may no longer talk to Manager.')
            const before = args[6]
            return sender(args[0], args[1], args[2], args[3], args[4], args[5], async () => {
              reach(conversation)
              if (!isManager(conversation) || !this.#mayTalk(id)) throw new Error('This channel may no longer talk to Manager.')
              await before?.()
            })
          }
          this.#fileSenders.set(conversation, bound)
          const unbind = (): void => { if (this.#fileSenders.get(conversation) === bound) this.#fileSenders.delete(conversation) }
          running.unwatch.add(unbind)
          return unbind
        },
      } } : {}),
      conversations: {
        historyBoundary: (key) => this.#deps.manager.historyBoundaryFor?.(id, key),
        manager: (place) => { live(); return this.#thread(id, place) },
        label: (conversation, labels) => {
          reach(conversation)
          const { labels: kept, cut } = managerLabels(labels)
          if (cut) log.write('warn', 'labels.cut', { kept: Object.keys(kept).length })
          const cleared = Object.fromEntries(Object.entries(labels).filter(([, value]) => value === '').map(([key]) => [key, '']))
          if (isManager(conversation)) this.#deps.manager.label(conversation, { ...kept, ...cleared })
          else this.#deps.labelConversation(conversation, { ...kept, ...cleared })
        },
        start: async (request) => {
          live()
          if (!setting().projects.includes(request.root)) throw new Error('This channel may not start conversations in that folder. Allow it in Settings, Channels.')
          const settings = this.#deps.settings()
          const provider = request.provider ?? settings.chatProvider
          if (!settings.chatProviders.includes(provider)) throw new Error(`The ${provider} assistant is not enabled in GeckIt.`)
          if (request.employeeId !== undefined && !this.#deps.employees().some((one) => one.id === request.employeeId && !one.archived)) throw new Error('That employee does not exist.')
          const started = await this.#deps.sessions.send({ root: request.root, text: request.text, mode: request.mode ?? settings.chatMode, provider, ...(request.model === undefined ? {} : { model: request.model }), ...(request.employeeId === undefined ? {} : { employeeId: request.employeeId }), ...(request.images === undefined ? {} : { images: request.images }) })
          this.#saveState(id, { conversations: [...new Set([...this.#state(id).conversations, started])] })
          if (request.labels !== undefined) {
            const { labels, cut } = managerLabels(request.labels)
            if (cut) log.write('warn', 'labels.cut', { kept: Object.keys(labels).length })
            this.#deps.labelConversation(started, labels)
          }
          log.write('info', 'conversation.started', { provider })
          this.#emit()
          return started
        },
        send: async (conversation, said) => {
          reach(conversation)
          if (isManager(conversation)) {
            if (!this.#mayTalk(id)) throw new Error(`${setting().info.name} may not talk to Manager. Allow it in Settings, Channels.`)
            const from = said.from === undefined || said.from.trim() === '' ? '' : `, from ${said.from.trim().slice(0, 200)}`
            if (from !== '') this.#deps.manager.thread({ channel: id, place: setting().info.name, key: this.#deps.manager.threadRecord(conversation)?.key ?? conversation.slice(id.length + 1), from: said.from?.trim() ?? '' })
            await this.#deps.manager.send(`[Via ${setting().info.name}${from}]\n${said.text}`, 'channel', undefined, [], () => { try { reach(conversation); return this.#mayTalk(id) && said.authorized?.() !== false } catch { return false } }, said.attachments ?? [], [], conversation)
            return
          }
          const found = this.#deps.conversations().find((one) => one.id === conversation)
          if (found === undefined) throw new Error('That conversation is gone.')
          await this.#deps.sessions.send({ session: conversation, root: found.root, mode: found.mode, text: said.text, ...(said.images === undefined ? {} : { images: said.images }) })
        },
        get: (conversation) => { live(); return isManager(conversation) ? this.#threadConversation(conversation) : owned(conversation) ? this.#conversation(conversation) : undefined },
        list: () => { live(); return this.#state(id).conversations.flatMap((one) => this.#conversation(one) ?? []) },
        items: async (conversation) => {
          reach(conversation)
          if (!isManager(conversation)) return this.#deps.sessions.items(conversation)
          if (this.#deps.managerView()?.threads?.find((one) => one.id === conversation)?.session === undefined) return []
          return (await this.#deps.manager.inspect(conversation)).items
        },
        watch: (conversation, listener) => {
          reach(conversation)
          const listeners = this.#listeners.get(conversation) ?? new Set()
          this.#listeners.set(conversation, listeners)
          const wrapped = (event: ChannelEvent): void => { if (alive.value) listener(event) }
          listeners.add(wrapped)
          const unwatch = (): void => { listeners.delete(wrapped); running.unwatch.delete(unwatch) }
          running.unwatch.add(unwatch)
          return unwatch
        },
        answer: async (conversation, card, answer) => {
          reach(conversation)
          if (!isManager(conversation)) return this.#deps.sessions.answer(conversation, card, answer)
          const decision = this.#deps.managerView()?.decisions.find((one) => one.id === card)
          if (decision !== undefined) { await this.#deps.manager.answer(card, answer); return true }
          return this.#deps.manager.answerCard(conversation, card, answer)
        },
        stop: async (conversation) => {
          reach(conversation)
          if (isManager(conversation)) throw new Error('Pause Manager in GeckIt instead.')
          this.#deps.sessions.stop(conversation)
        },
      },
    }
  }

  #tell(conversation: string, event: ChannelEvent): void {
    for (const listener of this.#listeners.get(conversation) ?? []) {
      try { listener(event) } catch { /* A channel's own failure stays in that channel. */ }
    }
  }

  #heard(event: CoreEvent): void {
    switch (event.name) {
      case 'chat:items':
      case 'manager:items': {
        const [items] = event.args
        const thread = event.name === 'manager:items' ? this.#deps.manager.threadOf(items.id) : undefined
        this.#tell(thread === undefined || thread === MANAGER_MAIN_THREAD ? items.id : thread, { kind: 'items', items: items.items, gone: items.gone ?? [] })
        return
      }
      case 'chat:notice': {
        const [notice] = event.args
        if (notice.session !== '') this.#tell(notice.session, { kind: 'notice', notice })
        return
      }
      case 'chat:sessions': {
        const [sessions] = event.args
        for (const session of sessions) {
          if (!this.#listeners.has(session.id)) continue
          const shown = JSON.stringify([session.state, session.title])
          if (this.#shown.get(session.id) === shown) continue
          this.#shown.set(session.id, shown)
          this.#tell(session.id, { kind: 'state', conversation: { id: session.id, root: session.root, title: session.title, state: session.state, provider: providerOf(session.id), manager: false } })
        }
        return
      }
      case 'manager:view': {
        const [view] = event.args
        const counted = JSON.stringify((view.threads ?? []).map((one) => one.id))
        if (counted !== this.#counted) { this.#counted = counted; this.#emit() }
        for (const thread of view.threads ?? []) {
          if (thread.id === MANAGER_MAIN_THREAD || !this.#listeners.has(thread.id)) continue
          const mine = view.decisions.filter((one) => one.thread === thread.id)
          const decisions = JSON.stringify(mine)
          if (decisions !== (this.#decisions.get(thread.id) ?? '[]')) {
            this.#decisions.set(thread.id, decisions)
            this.#tell(thread.id, { kind: 'decisions', decisions: mine })
          }
          this.#status(view, thread.id)
          const conversation = this.#threadConversation(thread.id, view)
          const shown = JSON.stringify([conversation.state, conversation.title])
          if (this.#shown.get(thread.id) !== shown) {
            this.#shown.set(thread.id, shown)
            this.#tell(thread.id, { kind: 'state', conversation })
          }
        }
        return
      }
      default:
    }
  }

  async install(url: string): Promise<ChannelsView> {
    const loaded = await installChannel(url, (id) => this.#setting(id) !== undefined || this.#running.has(id))
    this.#failures = this.#failures.filter((one) => one.id !== loaded.info.id)
    this.#deps.save({ channels: [...this.#deps.settings().channels.filter((one) => one.info.id !== loaded.info.id), { info: loaded.info, enabled: false, projects: [], manager: false, config: {} }] })
    this.#running.set(loaded.info.id, { loaded, instance: undefined, state: 'off', says: undefined, signature: undefined, alive: { value: false }, unwatch: new Set() })
    await this.reconcile()
    this.#emit()
    return this.view()
  }

  async configure(id: ChannelId, change: ChannelChange): Promise<ChannelsView> {
    const current = this.#setting(id)
    if (current === undefined) throw new Error('This channel library is not installed.')
    const fields = new Map(current.info.fields.map((field) => [field.key, field]))
    const config: { [key: string]: ChannelValues[string] } = { ...current.config }
    for (const [key, value] of Object.entries(change.config ?? {})) {
      const field = fields.get(key)
      if (field === undefined || field.type === 'secret') throw new Error(`${current.info.name} has no setting called ${key}.`)
      const ok = field.type === 'boolean' ? typeof value === 'boolean' : field.type === 'list' ? Array.isArray(value) && value.every((one) => typeof one === 'string') : typeof value === 'string'
      if (!ok) throw new Error(`${field.label} has the wrong kind of value.`)
      config[key] = Array.isArray(value) ? value.map((one: string) => one.trim()).filter((one: string) => one !== '') : typeof value === 'string' ? value.trim() : value
    }
    for (const key of Object.keys(change.secrets ?? {})) if (fields.get(key)?.type !== 'secret') throw new Error(`${current.info.name} has no secret called ${key}.`)
    const projects = change.projects === undefined ? current.projects : [...new Set(change.projects)]
    const unknown = projects.filter((root) => !this.#deps.settings().projects.includes(root))
    if (unknown.length > 0) throw new Error('Add those folders to GeckIt before allowing a channel to use them.')
    if (change.secrets !== undefined) this.#saveSecrets(id, change.secrets)
    this.#saveSetting(id, (setting) => ({ ...setting, config, projects, ...(change.enabled === undefined ? {} : { enabled: change.enabled }), ...(change.manager === undefined ? {} : { manager: change.manager }) }))
    await this.reconcile()
    return this.view()
  }

  /** Asks a channel what it can see with its saved settings, for Settings to show while it is set up. */
  async inspect(id: ChannelId, request: Json): Promise<Json> {
    const running = this.#running.get(id)
    const setting = this.#setting(id)
    if (running === undefined || setting === undefined) throw new Error('This channel library is not installed.')
    const inspect = running.loaded.module.inspect
    if (inspect === undefined) throw new Error(`${setting.info.name} has nothing to check.`)
    const log = pluginLogger({ id })
    try {
      return await inspect({
        id,
        log,
        config: () => Object.fromEntries(setting.info.fields.filter((field) => field.type !== 'secret').flatMap((field) => { const value = setting.config[field.key] ?? field.default; return value === undefined ? [] : [[field.key, value]] })),
        secret: (key) => this.#secrets(id)[key],
      }, request)
    } catch (error) {
      log.write('warn', 'inspect.failed', { reason: message(error) })
      throw error
    }
  }

  async remove(id: ChannelId): Promise<ChannelsView> {
    if (builtIn(id) && this.#running.get(id)?.loaded.path === 'built-in') {
      const clash = this.#failures.find((one) => one.id === id)
      if (clash === undefined) throw new Error('Built-in channels can be turned off, not removed.')
      await removeChannelLibrary(id)
      this.#failures = this.#failures.filter((one) => one !== clash)
      this.#emit()
      return this.view()
    }
    const running = this.#running.get(id)
    if (running !== undefined) await this.#halt(running)
    this.#deps.manager.close(id, `${running?.loaded.info.name ?? 'This channel'} was removed. Its threads can only be read.`)
    await removeChannelLibrary(id)
    this.#running.delete(id)
    this.#failures = this.#failures.filter((one) => one.id !== id)
    rmSync(this.#statePath(id), { force: true })
    rmSync(this.#secretsPath(id), { force: true })
    this.#deps.save({ channels: this.#deps.settings().channels.filter((one) => one.info.id !== id) })
    this.#emit()
    return this.view()
  }

  async checkUpdates(): Promise<{ readonly updated: readonly ChannelId[]; readonly failed: readonly ChannelId[] }> {
    const updated: ChannelId[] = []
    const failed: ChannelId[] = []
    for (const [id, running] of this.#running) {
      if (running.loaded.path === 'built-in') continue
      try {
        const next = await updateChannel(id, async (loaded) => {
          await this.#halt(running)
          running.loaded = loaded
          running.signature = undefined
          this.#saveSetting(id, (setting) => ({ ...setting, info: loaded.info }))
        })
        if (next !== undefined) updated.push(id)
      } catch { failed.push(id) }
    }
    if (updated.length > 0) await this.reconcile()
    return { updated, failed }
  }

  async dispose(): Promise<void> {
    this.#stopped = true
    clearInterval(this.#tick)
    this.#unsubscribe?.()
    this.#unanswer?.()
    this.#unhistory?.()
    await Promise.all([...this.#running.values()].map((running) => this.#halt(running)))
  }
}
