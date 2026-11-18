import type { ChannelScreen, ChannelScreenRequest } from '../../shared/channel-ui'
import type { ChannelAttachments } from '../channel-attachments'
import type { ChannelFileSender } from './channel-files'
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { writeJson } from '../../core/configuration'
import type { CoreEvent } from '../../core/events'
import type { CardAnswer, ChatSession, ManagerLabels, SessionItem, SessionItems, SessionMessage, Settings } from '../../shared/api'
import { providerOf } from '../../shared/api'
import type { ChannelCapability, ChannelChange, ChannelFailure, ChannelId, ChannelSetting, ChannelState, ChannelValues, ChannelView, ChannelsView } from '../../shared/channels'
import { askedCapabilities, CHANNEL_GRANTS, grantedCapabilities, missingFields } from '../../shared/channels'
import { MANAGER_MAIN_THREAD, managerLabels } from '../../shared/manager'
import type { ManagerDecision, ManagerDecisionOutcome, ManagerHistoryBoundary, ManagerHistoryChange, ManagerQuotedReply, ManagerReplyOrigin, ManagerRequestSource, ManagerThreadOpen, ManagerView } from '../../shared/manager'
import type { Shares } from '../shares'
import { pluginLogger } from '../sessions/plugin-logs'
import type { Channel, ChannelContext, ChannelConversation, ChannelDelivery, ChannelEvent, ChannelShares, ChannelThread, Json } from './channel-api'
import { threadActivity } from '../manager-status'
import type { LoadedChannel } from './libraries'
import { installChannel, installedChannels, removeChannelLibrary, updateChannel } from './libraries'
import { SLACK_INFO, SLACK_MODULE } from './slack'
import { DISCORD_INFO, DISCORD_MODULE } from './discord'
import { cleanJson, cleanText } from '../../core/clean'
import { isVaultEnvelope } from '../../core/vault'
import { TELEGRAM_INFO, telegramChannel } from './telegram'
import { runningSecrets } from '../../core/secrets'
import type { ShortcutDestination, ShortcutDestinationChannel, ShortcutDestinationReceipt } from '../../shared/shortcut-destinations'
import { ChannelShortcutError, type ChannelShortcutPublication } from './channel-api'

/** Channels that come with GeckIt: turned on and set up like a library, never removed or updated from GitHub. */
export const BUILT_IN_CHANNELS: readonly LoadedChannel[] = [{ info: TELEGRAM_INFO, path: 'built-in', module: telegramChannel() }, { info: SLACK_INFO, path: 'built-in', module: SLACK_MODULE }, { info: DISCORD_INFO, path: 'built-in', module: DISCORD_MODULE }]

export function restoreChannelManager(record: Json, libraries: readonly LoadedChannel[]): Json {
  return [...BUILT_IN_CHANNELS, ...libraries.filter((one) => !BUILT_IN_CHANNELS.some((builtIn) => builtIn.info.id === one.info.id))].reduce((value, one) => one.module.restoreManager?.(value) ?? value, record)
}

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
  send(text: string, source: 'channel', id: string | undefined, workers: readonly string[], authorized: () => boolean, attachments: readonly string[], requests: readonly string[], thread: string, request?: ManagerRequestSource): Promise<string>
  reply?(text: string, id: string | undefined, reply: ManagerQuotedReply, authorized: () => boolean, attachments: readonly string[], thread: string, request?: ManagerRequestSource): Promise<string>
  thread(open: ManagerThreadOpen): string
  label(thread: string, labels: ManagerLabels): void
  threadOf(session: string): string | undefined
  threadRecord(thread: string): (Pick<ManagerThreadOpen, 'channel'> & Partial<Pick<ManagerThreadOpen, 'key' | 'shared'>>) | undefined
  close(channel: string, reason: string | undefined): void
  onResponse(listener: (text: string, origin: ManagerReplyOrigin) => void): () => void
  inspect(id: string): Promise<SessionItems>
  answer(id: string, choice: string, authorized?: () => boolean): Promise<{ readonly answer: ManagerDecisionOutcome }>
  answerCard(session: string, card: string, answer: string): Promise<boolean>
  channelReady?(thread: string): void
  deliverChannelReplies?(thread: string, deliver: (text: string, origin: ManagerReplyOrigin, beforeSend: () => void) => Promise<void>): Promise<void>
  channelReplies?(thread: string): readonly { readonly state: string }[]
  delivery?(id: string): ChannelDelivery | undefined
  pendingRequests?(thread?: string): readonly string[]
  working?(thread: string): boolean
  pause?(): Promise<unknown>
  resume?(): Promise<unknown>
  renameChannel?(from: string, to: string, shared: (key: string) => boolean): boolean
}

export interface ChannelsDeps {
  readonly registry?: Awaited<ReturnType<typeof installedChannels>>
  readonly directory: string
  readonly attachments?: ChannelAttachments
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
  /** Channels that come with GeckIt; Slack and Discord when absent. */
  readonly builtIns?: readonly LoadedChannel[]
  readonly shares?: Pick<Shares, 'list' | 'open' | 'stop' | 'stopAll'>
  /** Whether a worker's notice asks the person to review it, for owner threads. */
  readonly review?: (session: string) => boolean
  readonly renameNoteKey?: (from: string, to: string) => void
  /** What a channel shows on its own Settings screen changed. */
  readonly viewed?: (view: { readonly id: ChannelId; readonly value: Json; readonly phone: Json }) => void
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
const SAYS: Record<ChannelCapability, string> = { conversations: 'conversations', manager: 'Manager', replies: 'replies', delivery: 'delivery', control: 'Manager control', files: 'files', shares: 'shared links' }

export class Channels {
  readonly #deps: ChannelsDeps
  readonly #fileSenders = new Map<string, ChannelFileSender>()
  readonly #fileLimits = new Map<string, number>()
  readonly #running = new Map<ChannelId, Running>()
  #failures: readonly ChannelFailure[] = []
  #stopped = false
  #unsubscribe: (() => void) | undefined
  readonly #listeners = new Map<string, Set<(event: ChannelEvent) => void>>()
  #cleaning: Promise<void> = Promise.resolve()
  #queued = 0
  readonly #shown = new Map<string, string>()
  readonly #decisions = new Map<string, string>()
  readonly #statuses = new Map<string, string>()
  #unhistory: (() => void) | undefined
  #unanswer: (() => void) | undefined
  #counted = ''
  /** Reads Manager's view again each minute, so the minutes Manager has worked on a message go up. */
  #tick: ReturnType<typeof setInterval> | undefined
  readonly #builtIns: readonly LoadedChannel[]
  readonly #owners = new Map<string, { readonly channel: ChannelId; readonly pairing?: string }>()
  readonly #closedBy = new Map<ChannelId, string>()
  readonly #legacy = new Map<string, ChannelId>()
  readonly #routes = new Map<string, (text: string, origin: ManagerReplyOrigin, beforeSend: () => void) => Promise<void>>()
  readonly #deliveries = new Map<string, Map<string, ChannelDelivery>>()
  readonly #managerListeners = new Map<ChannelId, Set<(on: boolean) => void>>()
  readonly #shareListeners = new Map<ChannelId, Set<(change: { readonly kind: 'changed' } | { readonly kind: 'ended'; readonly id: string }) => void>>()
  readonly #views = new Map<ChannelId, Json>()
  #managerOn: boolean | undefined

  constructor(deps: ChannelsDeps) {
    this.#deps = deps
    this.#builtIns = deps.builtIns ?? BUILT_IN_CHANNELS
  }

  #builtIn(id: ChannelId): boolean { return this.#builtIns.some((one) => one.info.id === id) }

  /** What each channel shows on its own Settings screen. */
  views(from: 'desktop' | 'phone' = 'desktop'): { readonly [id: string]: Json } { return Object.fromEntries([...this.#views].map(([id, value]) => [id, this.#running.get(id)?.loaded.module.present?.(value, from) ?? value])) }

  async screen(id: ChannelId, request: ChannelScreenRequest): Promise<ChannelScreen> {
    const running = this.#running.get(id)
    if (running?.loaded.module.settings === undefined) throw new Error('This channel has no settings screen.')
    return running.loaded.module.settings({
      id,
      log: pluginLogger({ id }),
      config: () => this.#setting(id)?.config ?? {},
      secret: (key) => this.#secrets(id)[key],
      setting: () => { const setting = this.#setting(id); if (setting === undefined) throw new Error('This channel was removed.'); return setting },
      viewed: () => this.#setting(id)?.enabled === true ? this.#views.get(id) : undefined,
      request: (value) => this.request(id, value, 'desktop'),
      inspect: (value) => this.inspect(id, value),
      configure: (change) => this.configure(id, change),
    }, request)
  }

  /** A running channel answers its own Settings screen. */
  async request(id: ChannelId, request: Json, from: 'desktop' | 'phone'): Promise<Json> {
    const running = this.#running.get(id)
    const name = this.#setting(id)?.info.name ?? 'This channel'
    if (running?.instance?.request === undefined) throw new Error(`${name} is not running, or has nothing to answer.`)
    return running.instance.request(request, from)
  }

  async shortcutDestinations(): Promise<readonly ShortcutDestinationChannel[]> {
    return Promise.all(this.#deps.settings().channels.filter((setting) => setting.enabled).map(async (setting) => {
      const running = this.#running.get(setting.info.id)
      const instance = running?.instance
      const supported = instance?.destinations !== undefined && instance.publishShortcut !== undefined
      const base = { id: setting.info.id, name: setting.info.name, supported, destinations: [] }
      if (running?.state !== 'connected' || !this.#deps.manager.enabled()) return { ...base, error: 'Channel or Manager is unavailable.' }
      if (instance?.destinations === undefined || instance.publishShortcut === undefined) return base
      try {
        const destinations = await instance.destinations()
        if (this.#running.get(setting.info.id) !== running || !running.alive.value || running.state !== 'connected') return { ...base, error: 'Channel connection changed.' }
        return { ...base, destinations }
      } catch (error) { return { ...base, error: message(error) } }
    }))
  }

  async publishShortcut(destination: ShortcutDestination, input: Omit<ChannelShortcutPublication, 'destination'>): Promise<ShortcutDestinationReceipt> {
    const running = this.#running.get(destination.channel)
    const instance = running?.instance
    const validate = (): void => {
      if (running === undefined || this.#running.get(destination.channel) !== running || !running.alive.value || running.state !== 'connected' || this.#setting(destination.channel)?.enabled !== true || !this.#deps.manager.enabled()) throw new ChannelShortcutError(false, 'Channel or Manager is unavailable.')
    }
    validate()
    if (instance?.destinations === undefined || instance.publishShortcut === undefined) throw new ChannelShortcutError(false, 'This channel does not support shortcut result destinations.')
    const choices = await instance.destinations().catch((error: Error) => { throw new ChannelShortcutError(false, message(error)) })
    validate()
    if (!choices.some((choice) => choice.id === destination.destination && choice.model === 'thread')) throw new ChannelShortcutError(false, 'Destination unavailable.')
    const text = await cleanText(input.text)
    const title = input.title === undefined ? undefined : await cleanText(input.title)
    validate()
    let bound: ChannelThread | undefined
    let accepting = true
    let receipt: ShortcutDestinationReceipt
    try {
      receipt = await instance.publishShortcut({ ...input, destination: destination.destination, text, ...(title === undefined ? {} : { title }), beforeSend: validate, bind: (place) => {
        validate()
        if (!accepting || place.key.trim() === '' || bound !== undefined) throw new ChannelShortcutError(true, 'Destination route binding is invalid.')
        const thread = input.bind(place)
        bound = place
        return thread
      } })
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'uncertain' in error && typeof error.uncertain === 'boolean') throw new ChannelShortcutError(error.uncertain, message(error))
      throw new ChannelShortcutError(true, message(error))
    } finally { accepting = false }
    if (receipt.destination !== destination.destination || bound === undefined || receipt.thread !== bound.key) throw new ChannelShortcutError(true, 'Native destination receipt does not match the run route.')
    try { validate() } catch { throw new ChannelShortcutError(true, 'Channel connection changed during publication.') }
    return receipt
  }

  /** The pairing of a connected owner chat, so a decision made under an earlier pairing is not used. */
  pairing(): string | undefined {
    for (const owner of this.#owners.values()) if (owner.pairing !== undefined && this.#running.get(owner.channel)?.state === 'connected') return owner.pairing
    return undefined
  }

  /** A shared thread takes messages only while its channel has a delivery route for it. */
  allowed(thread: string): boolean { return this.#deps.manager.threadRecord(thread)?.shared !== true || this.#routes.has(thread) }
  owner(thread: string): boolean { return this.#owners.has(thread) }
  /** The largest document a thread's channel takes, in MB. */
  fileLimit(thread: string): number | undefined { return this.#fileLimits.get(thread) }

  sharesChanged(): void { for (const listeners of this.#shareListeners.values()) for (const listener of listeners) { try { listener({ kind: 'changed' }) } catch { /* Stays in that channel. */ } } }
  shareEnded(id: string): void { for (const listeners of this.#shareListeners.values()) for (const listener of listeners) { try { listener({ kind: 'ended', id }) } catch { /* Stays in that channel. */ } } }

  /** Stops and starts one channel, after its saved data changed outside it. */
  async restart(id: ChannelId): Promise<void> {
    const running = this.#running.get(id)
    if (running === undefined) return
    running.signature = undefined
    await this.reconcile()
  }

  fileSender(thread: string): ChannelFileSender {
    const sender = this.#fileSenders.get(thread)
    if (sender === undefined) throw new Error('File delivery is unavailable for this channel thread. Send a new message to the bot in the intended conversation first.')
    return sender
  }

  #folder(): string { return join(this.#deps.directory, 'channels') }
  #statePath(id: ChannelId): string { return join(this.#folder(), `${slug(id)}.json`) }
  #secretsPath(id: ChannelId): string { return join(this.#folder(), `${slug(id)}.secrets`) }
  #sealedPath(id: ChannelId): string { return join(this.#folder(), `${slug(id)}.sealed`) }

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

  #readSealed(id: ChannelId): string | undefined {
    const path = this.#sealedPath(id)
    if (!existsSync(path)) return undefined
    if (!this.#deps.vault.available()) throw new Error('Secure storage is unavailable.')
    return this.#deps.vault.decrypt(readFileSync(path))
  }

  #writeSealed(id: ChannelId, text: string | undefined): void {
    const path = this.#sealedPath(id)
    if (text === undefined) { rmSync(path, { force: true }); rmSync(`${path}.new`, { force: true }); return }
    if (!this.#deps.vault.available()) throw new Error('Secure storage is unavailable.')
    mkdirSync(this.#folder(), { recursive: true, mode: 0o700 })
    writeFileSync(`${path}.new`, this.#deps.vault.encrypt(text), { mode: 0o600 })
    renameSync(`${path}.new`, path)
  }

  /** Moves a sealed file an earlier version kept in the data folder into the channel's own; one still sealed by the desktop waits for its migration. */
  #adopt(id: ChannelId, name: string): void {
    const legacy = join(this.#deps.directory, name)
    if (name.includes('/') || name.includes('\\') || !existsSync(legacy)) { this.#legacy.delete(name); return }
    const bytes = readFileSync(legacy)
    if (!isVaultEnvelope(bytes)) { this.#legacy.set(name, id); return }
    this.#legacy.delete(name)
    if (!existsSync(this.#sealedPath(id))) {
      mkdirSync(this.#folder(), { recursive: true, mode: 0o700 })
      writeFileSync(`${this.#sealedPath(id)}.new`, bytes, { mode: 0o600 })
      if (this.#deps.vault.decrypt(readFileSync(`${this.#sealedPath(id)}.new`)) !== this.#deps.vault.decrypt(bytes)) throw new Error('The adopted file did not verify.')
      renameSync(`${this.#sealedPath(id)}.new`, this.#sealedPath(id))
    }
    rmSync(legacy, { force: true })
  }

  /** Sealed files an earlier version left that the desktop must move to the service's secure storage first. */
  legacySealed(): readonly string[] { return [...this.#legacy.keys()] }

  /** After the desktop moved them, takes the files over and restarts the channels that own them. */
  async adoptLegacy(): Promise<void> {
    const owners = new Set<ChannelId>()
    for (const [name, id] of [...this.#legacy]) {
      try { this.#adopt(id, name) } catch (error) { pluginLogger({ id }).write('error', 'migration.failed', { reason: message(error) }) }
      if (!this.#legacy.has(name)) owners.add(id)
    }
    for (const id of owners) await this.restart(id)
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
      const asks = askedCapabilities(setting.info).filter((one) => CHANNEL_GRANTS.includes(one))
      const granted = grantedCapabilities(setting).filter((one) => CHANNEL_GRANTS.includes(one))
      return [{ settings: running.loaded.module.settings !== undefined, id: setting.info.id, name: setting.info.name, icon: setting.info.icon, ...(this.#builtIn(setting.info.id) ? { builtIn: true as const } : {}), ...(asks.length === 0 ? {} : { asks, grants: granted }), threads: (this.#deps.managerView()?.threads ?? []).filter((one) => this.#deps.manager.threadRecord(one.id)?.channel === setting.info.id).length, ...(setting.info.source === undefined ? {} : { source: setting.info.source }), state: running.state, ...(running.says === undefined ? {} : { says: running.says }), secrets, conversations: this.#state(setting.info.id).conversations.length }]
    })
    return { channels, failures: this.#failures }
  }

  #emit(): void { if (!this.#stopped) this.#deps.changed(this.view()) }

  async start(): Promise<void> {
    const { loaded: libraries, failures } = (this.#deps.registry ?? await installedChannels())
    const clashing = libraries.filter((one) => this.#builtIn(one.info.id))
    this.#failures = [...failures, ...clashing.map((one) => ({ id: one.info.id, name: one.info.name, ...(one.info.source === undefined ? {} : { source: one.info.source }), error: `${one.info.name} is now built into GeckIt. Remove this library; the built-in one keeps its settings.` }))]
    const loaded = [...this.#builtIns, ...libraries.filter((one) => !this.#builtIn(one.info.id))]
    const settings = this.#deps.settings().channels
    for (const one of loaded) {
      const known = settings.find((setting) => setting.info.id === one.info.id)
      if (known === undefined) this.#deps.save({ channels: [...this.#deps.settings().channels, { info: one.info, enabled: false, projects: [], manager: true, config: {} }] })
      else if (JSON.stringify(known.info) !== JSON.stringify(one.info)) this.#saveSetting(one.info.id, (setting) => ({ ...setting, info: one.info }))
      this.#migrate(one, known === undefined)
      this.#running.set(one.info.id, { loaded: one, instance: undefined, state: 'off', says: undefined, signature: undefined, alive: { value: false }, unwatch: new Set() })
    }
    this.#managerOn = this.#deps.manager.enabled()
    this.#unsubscribe = this.#deps.subscribe((event) => this.#heard(event))
    this.#unhistory = this.#deps.manager.onHistoryChange?.((change) => this.#tell(change.id, { kind: 'history', change }))
    this.#unanswer = this.#deps.manager.onResponse((text, origin) => {
      if (origin.thread === undefined || this.#deps.manager.originCurrent?.(origin) === false || this.#deps.manager.threadRecord(origin.thread)?.shared === true) return
      if (!this.#v2(origin.thread)) { this.#tell(origin.thread, { kind: 'answer', text }); return }
      const language = this.#deps.managerView()?.threads?.find((one) => one.id === origin.thread)?.language
      this.#tell(origin.thread, { kind: 'answer', text, reply: origin, ...(language === undefined ? {} : { language }) })
    })
    this.#tick = setInterval(() => {
      const view = this.#deps.managerView()
      if (view !== undefined) this.#statusAll(view)
      try { this.#deps.attachments?.cleanup() } catch { /* The next keep or read reports storage failures. */ }
    }, 60_000)
    this.#tick.unref?.()
    await this.reconcile()
  }

  #migrate(one: LoadedChannel, created: boolean): void {
    try {
      one.module.migrate?.({
        created,
        configure: (change) => this.#saveSetting(one.info.id, (setting) => ({ ...setting, ...change })),
        renameManagerChannel: (from, to, shared) => { if (to !== one.info.id) throw new Error('A channel may migrate threads only to its own ID.'); this.#deps.manager.renameChannel?.(from, to, shared) },
        renameNoteKey: (from, to) => this.#deps.renameNoteKey?.(from, to),
        adoptSealed: (name) => this.#adopt(one.info.id, name),
      })
    } catch (error) { pluginLogger({ id: one.info.id }).write('error', 'migration.failed', { reason: message(error) }) }
  }

  /** A channel of version 2 asks for its abilities; it also hears when a thread's activity ends. */
  #v2(thread: string): boolean {
    const channel = this.#deps.manager.threadRecord(thread)?.channel
    return channel !== undefined && this.#deps.settings().channels.find((one) => one.info.id === channel)?.info.capabilities !== undefined
  }

  #status(view: ManagerView, thread: string): void {
    const activity = threadActivity(view, thread)
    const status = JSON.stringify(activity ?? null)
    if ((activity !== undefined || this.#v2(thread) && this.#statuses.has(thread)) && status !== this.#statuses.get(thread)) {
      this.#statuses.set(thread, status)
      this.#tell(thread, activity === undefined ? { kind: 'status' } : { kind: 'status', activity })
    }
  }

  /** The decisions shown in a thread; an owner thread also gets GeckIt-wide ones and those of its channel's other private threads. */
  #decisionsFor(thread: string, view: ManagerView | undefined = this.#deps.managerView()): readonly ManagerDecision[] {
    const owner = this.#owners.get(thread)
    return (view?.decisions ?? []).filter((one) => one.thread === thread || owner !== undefined && (one.thread === undefined || this.#deps.manager.threadRecord(one.thread)?.channel === owner.channel && this.#deps.manager.threadRecord(one.thread)?.shared !== true))
  }

  #deliver(thread: string): void {
    const route = this.#routes.get(thread)
    if (route === undefined || this.#deps.manager.deliverChannelReplies === undefined) return
    void this.#deps.manager.deliverChannelReplies(thread, route).catch((error: Error) => pluginLogger({ id: this.#deps.manager.threadRecord(thread)?.channel ?? 'channel:unknown' }).write('warn', 'delivery.failed', { reason: error.message }))
  }

  #deliveryChanged(thread: string): void {
    const manager = this.#deps.manager
    if (manager.delivery === undefined || manager.pendingRequests === undefined) return
    const known = this.#deliveries.get(thread) ?? new Map<string, ChannelDelivery>()
    this.#deliveries.set(thread, known)
    for (const id of new Set([...known.keys(), ...manager.pendingRequests(thread)])) {
      const state = manager.delivery(id) ?? 'answered'
      if (known.get(id) === state) continue
      if (state === 'answered') known.delete(id)
      else known.set(id, state)
      this.#tell(thread, { kind: 'delivery', message: id, state })
    }
  }

  #closeReason(id: ChannelId, setting: ChannelSetting | undefined, name: string): string | undefined {
    return setting === undefined ? `${name} was removed. Its threads can only be read.` : !setting.enabled ? `${setting.info.name} is off. Turn it on in Settings, Channels to reply in this thread.` : this.#closedBy.get(id)
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
      const signature = setting === undefined ? 'gone' : JSON.stringify([setting.enabled, setting.projects, setting.config, secrets, running.loaded.path, running.loaded.info, grantedCapabilities(setting)])
      this.#deps.manager.close(id, this.#closeReason(id, setting, running.loaded.info.name))
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
    const id = running.loaded.info.id
    for (const [thread, owner] of this.#owners) if (owner.channel === id) this.#owners.delete(thread)
    for (const thread of this.#routes.keys()) if (this.#deps.manager.threadRecord(thread)?.channel === id) this.#routes.delete(thread)
    this.#managerListeners.delete(id)
    this.#shareListeners.delete(id)
    for (const unwatch of running.unwatch) unwatch()
    running.unwatch.clear()
    const instance = running.instance
    running.instance = undefined
    await instance?.stop().catch(() => undefined)
  }

  #mayTalk(): boolean { return this.#deps.manager.enabled() }

  #thread(id: ChannelId, place: ChannelThread | undefined, control: boolean): string | undefined {
    if (!this.#mayTalk()) return undefined
    const setting = this.#setting(id)
    if (setting === undefined) return undefined
    const { labels, cut } = managerLabels(place?.labels)
    if (cut) pluginLogger({ id }).write('warn', 'labels.cut', { kept: Object.keys(labels).length })
    if (place?.owner === true && !control) throw new Error(`${setting.info.name} may not use an owner chat: its library did not ask for Manager control.`)
    const thread = this.#deps.manager.thread({ channel: id, place: setting.info.name, key: place?.key ?? 'default', ...(place?.title === undefined ? {} : { title: place.title }), ...(place?.from === undefined ? {} : { from: place.from }), ...(place?.link === undefined ? {} : { link: place.link }), ...(place?.shared === true ? { shared: true } : {}), labels })
    for (const [known, owner] of this.#owners) if (owner.channel === id && known !== thread) this.#owners.delete(known)
    if (place?.owner === true) this.#owners.set(thread, { channel: id, ...(place.pairing === undefined ? {} : { pairing: place.pairing }) })
    else this.#owners.delete(thread)
    return thread
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
      need(isManager(conversation) ? 'manager' : 'conversations')
    }
    const log = pluginLogger({ id })
    const initial = this.#setting(id)
    const capabilities = new Set(initial === undefined ? [] : grantedCapabilities(initial))
    const has = (ability: ChannelCapability): boolean => capabilities.has(ability)
    const need = (ability: ChannelCapability): void => {
      live()
      if (!has(ability)) throw new Error(`${setting().info.name} may not use ${SAYS[ability]}: its library did not ask for it.`)
    }
    const thread = (conversation: string): void => {
      need('manager')
      reach(conversation)
      if (!isManager(conversation)) throw new Error('That is not one of this channel’s Manager threads.')
    }
    const via = (from: string | undefined): string => `[Via ${setting().info.name}${from === undefined || from.trim() === '' ? '' : `, from ${from.trim().slice(0, 200)}`}]\n`
    const may = (conversation: string, authorized?: () => boolean) => (): boolean => { try { reach(conversation); return this.#mayTalk() && authorized?.() !== false } catch { return false } }
    const shares = this.#deps.shares
    return {
      id,
      capabilities,
      log,
      view: (value) => { if (!alive.value) return; this.#views.set(id, value); this.#deps.viewed?.({ id, value: running.loaded.module.present?.(value, 'desktop') ?? value, phone: running.loaded.module.present?.(value, 'phone') ?? value }) },
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
      sealed: {
        available: () => this.#deps.vault.available(),
        read: () => { live(); return this.#readSealed(id) },
        write: (text) => { live(); this.#writeSealed(id, text) },
      },
      status: (state, says) => {
        if (!alive.value) return
        running.state = state
        running.says = says
        this.#emit()
      },
      projects: () => { live(); return this.#deps.settings().projects.map((root) => ({ root, name: this.#deps.projectName(root) })) },
      providers: () => { live(); return this.#deps.settings().chatProviders },
      employees: () => { live(); return this.#deps.employees().filter((one) => !one.archived).map(({ id: employee, name, role }) => ({ id: employee, name, role })) },
      ...(has('files') && this.#deps.attachments !== undefined ? { files: {
        keep: (conversation: string, bytes: Buffer, name: string, media: string): string => {
          reach(conversation)
          if (!isManager(conversation) || !this.#mayTalk()) throw new Error('Attachments require this channel’s authorized Manager thread.')
          const cache = this.#deps.attachments
          if (cache === undefined) throw new Error('Attachment storage is unavailable.')
          return cache.put(bytes, name, media, conversation).id
        },
        has: (conversation: string, file: string): boolean => {
          reach(conversation)
          try { this.#deps.attachments?.read(file, conversation); return true } catch { return false }
        },
        hold: (files: readonly string[]): void => { live(); this.#deps.attachments?.pin(id, files) },
        bind: (conversation: string, sender: ChannelFileSender, limit?: number): (() => void) => {
          reach(conversation)
          const bound: ChannelFileSender = async (...args) => {
            reach(conversation)
            if (!isManager(conversation) || !this.#mayTalk()) throw new Error('This channel may no longer talk to Manager.')
            const before = args[6]
            return sender(args[0], args[1], args[2], args[3], args[4], args[5], async () => {
              reach(conversation)
              if (!isManager(conversation) || !this.#mayTalk()) throw new Error('This channel may no longer talk to Manager.')
              await before?.()
            })
          }
          this.#fileSenders.set(conversation, bound)
          if (limit === undefined) this.#fileLimits.delete(conversation)
          else this.#fileLimits.set(conversation, limit)
          const unbind = (): void => { if (this.#fileSenders.get(conversation) === bound) { this.#fileSenders.delete(conversation); this.#fileLimits.delete(conversation) } }
          running.unwatch.add(unbind)
          return unbind
        },
      } } : {}),
      ...(has('control') ? { control: {
        pause: async () => { need('control'); await this.#deps.manager.pause?.() },
        resume: async () => { need('control'); await this.#deps.manager.resume?.() },
        view: () => {
          need('control')
          const view = this.#deps.managerView()
          if (view === undefined) throw new Error('Manager is not ready yet.')
          return view
        },
      } } : {}),
      ...(has('shares') && shares !== undefined ? { shares: {
        list: () => { need('shares'); return shares.list() },
        open: (target: string) => { need('shares'); return shares.open(target) },
        stop: (share: string) => { need('shares'); return shares.stop(share) },
        stopAll: () => { need('shares'); shares.stopAll() },
        watch: (listener) => {
          need('shares')
          const listeners = this.#shareListeners.get(id) ?? new Set()
          this.#shareListeners.set(id, listeners)
          const wrapped: typeof listener = (change) => { if (alive.value) listener(change) }
          listeners.add(wrapped)
          const unwatch = (): void => { listeners.delete(wrapped); running.unwatch.delete(unwatch) }
          running.unwatch.add(unwatch)
          return unwatch
        },
      } satisfies ChannelShares } : {}),
      conversations: {
        historyBoundary: (key) => { need('manager'); return this.#deps.manager.historyBoundaryFor?.(id, key) },
        manager: (place) => { need('manager'); return this.#thread(id, place, has('control')) },
        decide: async (conversation, decision, choice, options) => {
          thread(conversation)
          const authorized = may(conversation, options?.authorized)
          const found = this.#decisionsFor(conversation).find((one) => one.id === decision)
          if (found === undefined) return 'This request is no longer pending. Use /status to see current requests.'
          if (found.kind === 'native' || found.choices.some((one) => one.value === choice)) {
            if (options?.by !== undefined) log.write('info', 'decision.answered', { decision, by: options.by.id })
            return (await this.#deps.manager.answer(decision, choice, authorized)).answer
          }
          await this.#deps.manager.send(`${via(options?.by?.name)}Reply to Manager decision ${decision} (${found.title}): ${choice}`, 'channel', undefined, [], authorized, [], [], conversation)
          return undefined
        },
        decisions: (conversation) => { thread(conversation); return this.#decisionsFor(conversation) },
        language: (conversation) => { thread(conversation); return this.#deps.managerView()?.threads?.find((one) => one.id === conversation)?.language },
        managerOn: () => { live(); return this.#deps.manager.enabled() },
        watchManager: (listener) => {
          live()
          const listeners = this.#managerListeners.get(id) ?? new Set()
          this.#managerListeners.set(id, listeners)
          const wrapped = (on: boolean): void => { if (alive.value) listener(on) }
          listeners.add(wrapped)
          const unwatch = (): void => { listeners.delete(wrapped); running.unwatch.delete(unwatch) }
          running.unwatch.add(unwatch)
          return unwatch
        },
        current: (reply) => { need('manager'); return reply.thread !== undefined && isManager(reply.thread) && this.#deps.manager.originCurrent?.(reply) !== false },
        ready: (conversation) => { thread(conversation); this.#deps.manager.channelReady?.(conversation); this.#deliver(conversation) },
        close: (reason) => {
          need('manager')
          if (reason === undefined) this.#closedBy.delete(id)
          else this.#closedBy.set(id, reason)
          this.#deps.manager.close(id, this.#closeReason(id, this.#setting(id), setting().info.name))
        },
        deliver: (conversation, sender) => {
          thread(conversation)
          if (this.#deps.manager.threadRecord(conversation)?.shared !== true) throw new Error('Only shared threads keep answers for delivery.')
          const route: typeof sender = async (text, origin, beforeSend) => { reach(conversation); await sender(await cleanText(text), origin, () => { reach(conversation); beforeSend() }) }
          this.#routes.set(conversation, route)
          const unroute = (): void => { if (this.#routes.get(conversation) === route) this.#routes.delete(conversation); running.unwatch.delete(unroute) }
          running.unwatch.add(unroute)
          this.#deliver(conversation)
          return unroute
        },
        summary: (conversation) => {
          thread(conversation)
          const view = this.#deps.managerView()
          const own = view?.threads?.find((one) => one.id === conversation)
          if (view === undefined || own === undefined) return undefined
          return { manager: view.state, state: own.state, workers: own.owns.length, uncertain: (this.#deps.manager.channelReplies?.(conversation) ?? []).filter((one) => one.state === 'uncertain').length, ...(own.error === undefined ? {} : { error: own.error }) }
        },
        delivery: (message) => { need('delivery'); return this.#deps.manager.delivery?.(message) },
        pending: (conversation) => { need('delivery'); thread(conversation); return this.#deps.manager.pendingRequests?.(conversation) ?? [] },
        working: (conversation) => { need('delivery'); thread(conversation); return this.#deps.manager.working?.(conversation) ?? false },
        label: (conversation, labels) => {
          reach(conversation)
          const { labels: kept, cut } = managerLabels(labels)
          if (cut) log.write('warn', 'labels.cut', { kept: Object.keys(kept).length })
          const cleared = Object.fromEntries(Object.entries(labels).filter(([, value]) => value === '').map(([key]) => [key, '']))
          if (isManager(conversation)) this.#deps.manager.label(conversation, { ...kept, ...cleared })
          else this.#deps.labelConversation(conversation, { ...kept, ...cleared })
        },
        start: async (request) => {
          need('conversations')
          if (!this.#deps.settings().projects.includes(request.root)) throw new Error('Add that folder to GeckIt before starting a conversation there.')
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
            if (!this.#mayTalk()) throw new Error(`Manager is off. Turn it on in Team, Manager.`)
            if (said.from !== undefined && said.from.trim() !== '') this.#deps.manager.thread({ channel: id, place: setting().info.name, key: this.#deps.manager.threadRecord(conversation)?.key ?? conversation.slice(id.length + 1), from: said.from.trim() })
            const text = `${via(said.from)}${said.text}`
            const authorized = may(conversation, said.authorized)
            const attachments = said.attachments ?? []
            if (attachments.length > 0 || (said.images?.length ?? 0) > 0) need('files')
            if (said.id !== undefined || said.request !== undefined) need('manager')
            if (said.replyTo !== undefined) {
              need('replies')
              const target = said.replyTo.thread ?? conversation
              if (!isManager(target) || this.#deps.manager.reply === undefined) throw new Error('That reply belongs to another channel.')
              return this.#deps.manager.reply(text, said.id, said.replyTo, authorized, attachments, target, said.request)
            }
            return this.#deps.manager.send(text, 'channel', said.id, [], authorized, attachments, [], conversation, said.request)
          }
          const found = this.#deps.conversations().find((one) => one.id === conversation)
          if (found === undefined) throw new Error('That conversation is gone.')
          await this.#deps.sessions.send({ session: conversation, root: found.root, mode: found.mode, text: said.text, ...(said.images === undefined ? {} : { images: said.images }) })
          return conversation
        },
        get: (conversation) => { need(isManager(conversation) ? 'manager' : 'conversations'); return isManager(conversation) ? this.#threadConversation(conversation) : owned(conversation) ? this.#conversation(conversation) : undefined },
        list: () => { need('conversations'); return this.#state(id).conversations.flatMap((one) => this.#conversation(one) ?? []) },
        items: async (conversation) => {
          reach(conversation)
          if (!isManager(conversation)) return cleanJson(await this.#deps.sessions.items(conversation))
          if (this.#deps.managerView()?.threads?.find((one) => one.id === conversation)?.session === undefined) return []
          return cleanJson((await this.#deps.manager.inspect(conversation)).items)
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
    if (!this.#listeners.has(conversation)) return
    if (this.#queued === 0 && runningSecrets() === undefined) { this.#told(conversation, event); return }
    this.#queued++
    this.#cleaning = this.#cleaning.then(async () => { try { this.#told(conversation, await cleanJson(event)) } finally { this.#queued-- } })
  }

  #told(conversation: string, event: ChannelEvent): void {
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
        if (notice.asks && notice.session !== '' && this.#deps.review?.(notice.session) === true) for (const thread of this.#owners.keys()) this.#tell(thread, { kind: 'review', title: notice.title, body: notice.body })
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
        const on = view.config.enabled
        if (on !== this.#managerOn) {
          this.#managerOn = on
          for (const listeners of this.#managerListeners.values()) for (const listener of listeners) { try { listener(on) } catch { /* Stays in that channel. */ } }
        }
        for (const thread of this.#routes.keys()) this.#deliver(thread)
        for (const thread of view.threads ?? []) {
          if (thread.id === MANAGER_MAIN_THREAD || !this.#listeners.has(thread.id)) continue
          if (this.#v2(thread.id)) this.#deliveryChanged(thread.id)
          const mine = this.#decisionsFor(thread.id, view)
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
    const loaded = await installChannel(url, (id) => this.#setting(id) !== undefined || this.#running.has(id) || this.#builtIn(id))
    this.#failures = this.#failures.filter((one) => one.id !== loaded.info.id)
    this.#deps.save({ channels: [...this.#deps.settings().channels.filter((one) => one.info.id !== loaded.info.id), { info: loaded.info, enabled: false, projects: [], manager: true, config: {} }] })
    this.#migrate(loaded, true)
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
    this.#saveSetting(id, (setting) => ({ ...setting, config, projects, ...(change.enabled === undefined ? {} : { enabled: change.enabled }), manager: true, grants: askedCapabilities(setting.info).filter((one) => CHANNEL_GRANTS.includes(one)) }))
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
    if (this.#builtIn(id) && this.#running.get(id)?.loaded.path === 'built-in') {
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
    rmSync(this.#sealedPath(id), { force: true })
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
          this.#migrate(loaded, false)
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
