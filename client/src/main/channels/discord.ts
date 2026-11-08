import { createHash } from 'node:crypto'

import type { ChannelInfo } from '../../shared/channels'
import type { DiscordInspect, DiscordPerson, DiscordServer, DiscordSetupView } from '../../shared/discord'
import { DISCORD_INVITE_PERMISSIONS } from '../../shared/discord'
import type { Channel, ChannelContext, ChannelEvent, ChannelModule, ChannelSetupContext, Json } from './channel-api'
import { StatusMessage } from '../manager-status'
import { containsSecret } from './slack'

export const DISCORD_INFO: ChannelInfo = {
  id: 'channel:discord',
  name: 'Discord',
  icon: 'discord',
  description: 'Each Discord thread or direct message with the bot is a Manager thread of its own.',
  fields: [
    { key: 'botToken', label: 'Bot token', type: 'secret', required: true, help: 'From the Discord Developer Portal, Bot, Reset Token. Turn on Message Content Intent there too.' },
    { key: 'allow', label: 'People who may write', type: 'list', required: true, help: 'Discord user IDs. Nobody else is answered.' },
    { key: 'places', label: 'Channels it answers in', type: 'list', help: 'Channel IDs. Empty means every channel the bot can see.' },
    { key: 'directMessages', label: 'Answer direct messages', type: 'boolean', default: true },
    { key: 'checkSecrets', label: 'Refuse messages that contain a token or key', type: 'boolean', default: true },
  ],
}

const API = 'https://discord.com/api/v10'
/** GUILDS, GUILD_MESSAGES, DIRECT_MESSAGES and the privileged MESSAGE_CONTENT. */
export const DISCORD_INTENTS = (1 << 0) | (1 << 9) | (1 << 12) | (1 << 15)
const MESSAGE_CONTENT_FLAGS = (1 << 18) | (1 << 19)
const LIMIT = 2_000
const CONTEXT_LIMIT = 30_000
const BUTTONS = 25
const EPOCH = 1_420_070_400_000n
const THREAD_TYPES = new Set([10, 11, 12])
const FATAL: { readonly [code: number]: string } = {
  4004: 'Discord did not accept the bot token. Reset it in the Developer Portal and replace it in Set up.',
  4010: 'Discord refused the connection (invalid shard).',
  4011: 'This bot is in too many servers for one connection.',
  4012: 'Discord refused this API version.',
  4013: 'Discord refused the requested intents.',
  4014: 'Message Content Intent is off for this bot. Turn it on in the Discord Developer Portal, Bot, then turn Discord on again.',
}

export const snowflakeAt = (id: string): number => Number((BigInt(id) >> 22n) + EPOCH)
export const newer = (a: string, b: string): boolean => BigInt(a) > BigInt(b)
const snowflakeOf = (at: number): string => String((BigInt(Math.max(0, Math.floor(at))) - EPOCH) << 22n)

/** Cuts text into Discord messages of at most 2000 characters, at a line break where one is near. */
export function chunks(text: string, limit = LIMIT): readonly string[] {
  const out: string[] = []
  let rest = text.trim()
  while (rest.length > limit) {
    const cut = rest.lastIndexOf('\n', limit)
    const at = cut > limit / 2 ? cut : (() => { const space = rest.lastIndexOf(' ', limit); return space > limit / 2 ? space : limit })()
    out.push(rest.slice(0, at).trimEnd())
    rest = rest.slice(at).trimStart()
  }
  if (rest !== '') out.push(rest)
  return out
}

const buttonId = (decision: string, index: number): string => `gk:${createHash('sha256').update(decision).digest('hex').slice(0, 20)}:${String(index)}`

interface DiscordUser {
  readonly id: string
  readonly username?: string
  readonly global_name?: string | null
  readonly bot?: boolean
  readonly avatar?: string | null
}

interface DiscordAttachment {
  readonly filename?: string
  readonly size?: number
  readonly content_type?: string
}

export interface DiscordMessage {
  readonly id: string
  readonly channel_id: string
  readonly guild_id?: string
  readonly type?: number
  readonly author?: DiscordUser
  readonly member?: { readonly nick?: string | null }
  readonly content?: string
  readonly mentions?: readonly DiscordUser[]
  readonly attachments?: readonly DiscordAttachment[]
  readonly webhook_id?: string
}

export interface DiscordInteraction {
  readonly id: string
  readonly application_id: string
  readonly type: number
  readonly token: string
  readonly channel_id?: string
  readonly guild_id?: string
  readonly data?: { readonly custom_id?: string; readonly component_type?: number }
  readonly member?: { readonly user?: DiscordUser; readonly nick?: string | null }
  readonly user?: DiscordUser
  readonly message?: { readonly id: string }
}

interface DiscordChannelInfo {
  readonly id: string
  readonly type: number
  readonly name?: string
  readonly guild_id?: string
  readonly parent_id?: string | null
}

export interface DiscordSocket {
  addEventListener(type: 'message', listener: (message: { readonly data: unknown }) => void): void
  addEventListener(type: 'close', listener: (event: { readonly code?: number; readonly reason?: string }) => void): void
  send(data: string): void
  close(code?: number): void
}

export interface DiscordTransport {
  readonly fetch: typeof fetch
  readonly WebSocket: new (url: string) => DiscordSocket
  readonly wait?: (ms: number) => Promise<void>
}

const realTransport = (): DiscordTransport => ({ fetch, WebSocket: WebSocket as unknown as DiscordTransport['WebSocket'] })
const said = (error: unknown): string => error instanceof Error ? error.message : String(error)
const nameOf = (user: DiscordUser | undefined, nick?: string | null): string => nick || user?.global_name || user?.username || user?.id || 'Someone'

export class DiscordError extends Error {
  constructor(readonly status: number, readonly code: number | undefined, text: string) { super(text) }
}

/** One Discord REST call with the bot token: waits out a 429 as Discord asks, retries a 5xx twice, and says plainly what refused. */
export async function discordApi<T>(transport: DiscordTransport, token: string, method: string, path: string, body?: object): Promise<T> {
  const wait = transport.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  for (let attempt = 0; ; attempt++) {
    let response: Response
    try {
      response = await transport.fetch(`${API}${path}`, { method, headers: { authorization: `Bot ${token}`, 'content-type': 'application/json', 'user-agent': 'DiscordBot (https://github.com/anetrebskii/geckit, 1)' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    } catch (error) {
      if (attempt < 2) { await wait(1_000 * (attempt + 1)); continue }
      throw new Error(`Could not reach Discord: ${said(error)}`, { cause: error })
    }
    if (response.status === 204) return undefined as T
    const json = await response.json().catch(() => ({})) as { readonly message?: string; readonly code?: number; readonly retry_after?: number }
    if (response.status === 429 && attempt < 3) { await wait(Math.min(60, json.retry_after ?? 1) * 1_000); continue }
    if (response.status >= 500 && attempt < 2) { await wait(1_000 * (attempt + 1)); continue }
    if (response.ok) return json as T
    if (response.status === 401) throw new DiscordError(401, json.code, 'Discord did not accept the bot token.')
    throw new DiscordError(response.status, json.code, `Discord ${method} ${(path.split('?')[0] ?? path).replace(/(interactions\/\d+|webhooks\/\d+)\/[^/]+/, '$1/***')}: ${json.message ?? String(response.status)}${response.status === 403 ? ' (the bot lacks a permission here)' : ''}`)
  }
}

export const inviteLink = (application: string): string => `https://discord.com/oauth2/authorize?client_id=${application}&scope=bot&permissions=${DISCORD_INVITE_PERMISSIONS}`

/** What Settings shows while Discord is set up: the bot, whether it may read messages, the servers and text channels it is in, and who the allowed IDs are. */
export async function inspectDiscord(setup: Pick<ChannelSetupContext, 'secret' | 'config'>, request: DiscordInspect, transport: DiscordTransport = realTransport()): Promise<DiscordSetupView> {
  const token = request?.token?.trim() || setup.secret('botToken')
  if (token === undefined || token === '') return { token: 'missing' }
  const call = <T>(path: string): Promise<T> => discordApi<T>(transport, token, 'GET', path)
  let bot: DiscordUser
  try { bot = await call<DiscordUser>('/users/@me') } catch (error) {
    if (error instanceof DiscordError && error.status === 401) return { token: 'refused' }
    throw error
  }
  const application = await call<{ readonly id: string; readonly flags?: number }>('/oauth2/applications/@me')
  const guilds = await call<readonly { readonly id: string; readonly name: string; readonly icon?: string | null }[]>('/users/@me/guilds?limit=200')
  const servers: DiscordServer[] = []
  for (const guild of guilds.slice(0, 25)) {
    const channels = await call<readonly DiscordChannelInfo[]>(`/guilds/${guild.id}/channels`).catch(() => undefined)
    servers.push({ id: guild.id, name: guild.name, ...(guild.icon ? { icon: `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` } : {}), ...(channels === undefined ? { unreadable: true as const } : {}), channels: (channels ?? []).filter((one) => one.type === 0 || one.type === 5 || one.type === 15).map((one) => ({ id: one.id, name: one.name ?? one.id, kind: one.type === 15 ? 'forum' as const : one.type === 5 ? 'announcement' as const : 'text' as const })) })
  }
  const asked = [...new Set([...(request?.people ?? []), ...((): readonly string[] => { const allow = setup.config()['allow']; return Array.isArray(allow) ? allow : [] })()])].filter((one) => /^\d{15,22}$/.test(one)).slice(0, 50)
  const people: DiscordPerson[] = []
  for (const id of asked) {
    const user = await call<DiscordUser>(`/users/${id}`).catch(() => undefined)
    people.push(user === undefined ? { id, found: false } : { id, found: true, name: nameOf(user), ...(user.username === undefined ? {} : { handle: user.username }), ...(user.bot === true ? { bot: true } : {}), ...(user.avatar ? { avatar: `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64` } : {}) })
  }
  return {
    token: 'ok',
    bot: { id: bot.id, name: nameOf(bot), ...(bot.avatar ? { avatar: `https://cdn.discordapp.com/avatars/${bot.id}/${bot.avatar}.png?size=64` } : {}) },
    application: application.id,
    invite: inviteLink(application.id),
    messageContent: ((application.flags ?? 0) & MESSAGE_CONTENT_FLAGS) !== 0,
    servers,
    people,
  }
}

type Pending = { readonly id: string; readonly title: string; readonly values: readonly string[]; readonly labels: readonly string[] }
type Prompt = { readonly decision: string; readonly message: string; readonly title: string }
type Place = { readonly key: string; readonly channel: string }

/** Discord built into GeckIt: each Discord thread and each direct message with the bot is its own Manager thread. */
export function createDiscord(context: ChannelContext, transport: DiscordTransport = realTransport()): Channel {
  let socket: DiscordSocket | undefined
  let stopped = false
  let retry: ReturnType<typeof setTimeout> | undefined
  let beat: ReturnType<typeof setTimeout> | undefined
  let acked = true
  let seq: number | null = null
  let session: { id: string; url: string } | undefined
  let gatewayUrl = ''
  let failures = 0
  let me: string | undefined
  let who = ''
  let chain: Promise<void> = Promise.resolve()
  const watching = new Map<string, () => void>()
  const channels = new Map<string, DiscordChannelInfo>()
  const handled: string[] = []
  const token = (): string => context.secret('botToken') ?? ''
  const api = <T>(method: string, path: string, body?: object): Promise<T> => discordApi<T>(transport, token(), method, path, body)
  const warn = (event: string) => (error: unknown): void => context.log.write('warn', event, { reason: said(error) })

  const once = (id: string): boolean => {
    if (handled.includes(id)) return false
    handled.push(id)
    if (handled.length > 500) handled.splice(0, handled.length - 500)
    return true
  }

  const queues = new Map<string, Promise<unknown>>()
  /** Posts in order per channel, and answers the id of the last part, the one that carries any buttons. */
  const post = (channel: string, text: string, extra: object = {}): Promise<string | undefined> => {
    const run = async (): Promise<string | undefined> => {
      let id: string | undefined
      const parts = chunks(text)
      for (const [index, part] of parts.entries()) {
        const last = index === parts.length - 1
        id = (await api<{ readonly id: string }>('POST', `/channels/${channel}/messages`, { content: part, allowed_mentions: { parse: [] }, ...(last ? extra : {}) })).id
      }
      return id
    }
    const next = (queues.get(channel) ?? Promise.resolve()).catch(() => undefined).then(run)
    queues.set(channel, next)
    void next.finally(() => { if (queues.get(channel) === next) queues.delete(channel) }).catch(() => undefined)
    return next
  }
  const posted = (channel: string, text: string): void => { void post(channel, text).catch(warn('discord.post.failed')) }

  const channelInfo = async (id: string): Promise<DiscordChannelInfo | undefined> => {
    const known = channels.get(id)
    if (known !== undefined) return known
    const found = await api<DiscordChannelInfo>('GET', `/channels/${id}`).catch(() => undefined)
    if (found !== undefined) channels.set(id, found)
    return found
  }

  const list = <T>(key: string, read: (one: { readonly [key: string]: Json }) => T | undefined): readonly T[] => {
    const value = context.store.get(key)
    return Array.isArray(value) ? value.flatMap((one) => one !== null && typeof one === 'object' && !Array.isArray(one) ? read(one as { readonly [key: string]: Json }) ?? [] : []) : []
  }
  const strings = (value: Json | undefined): readonly string[] => Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : []
  const pending = (key: string): readonly Pending[] => list(`decisions:${key}`, (one) => typeof one['id'] === 'string' ? { id: one['id'], title: typeof one['title'] === 'string' ? one['title'] : '', values: strings(one['values']), labels: strings(one['labels']) } : undefined)
  const prompts = (key: string): readonly Prompt[] => list(`prompts:${key}`, (one) => typeof one['decision'] === 'string' && typeof one['message'] === 'string' ? { decision: one['decision'], message: one['message'], title: typeof one['title'] === 'string' ? one['title'] : 'Question' } : undefined)
  const places = (): readonly Place[] => list('threads', (one) => typeof one['key'] === 'string' && typeof one['channel'] === 'string' ? { key: one['key'], channel: one['channel'] } : undefined)
  const boundary = (key: string): string | undefined => context.conversations.historyBoundary?.(key)?.revision
  const cutoff = (key: string): string | undefined => { const at = context.conversations.historyBoundary?.(key)?.at; return at === undefined ? undefined : snowflakeOf(at) }

  const allowed = (user: string): boolean => { const allow = context.config()['allow']; return Array.isArray(allow) && allow.includes(user) }

  /** The text with the bot's own mention taken out and everyone else's shown by name. */
  const named = (message: DiscordMessage): string => {
    let out = message.content ?? ''
    for (const user of message.mentions ?? []) out = out.replace(new RegExp(`<@!?${user.id}>`, 'g'), user.id === me ? '' : `@${nameOf(user)}`)
    return out.replace(/[ \t]{2,}/g, ' ').trim()
  }

  const files = (message: DiscordMessage): string => (message.attachments ?? []).map((one) => ` [file: ${one.filename ?? 'unnamed'}${one.content_type === undefined ? '' : `, ${one.content_type}`}${one.size === undefined ? '' : `, ${String(Math.ceil(one.size / 1024))} KB`}]`).join('')

  /** What was written in a Discord thread after `seen` and before `before`, for Manager to read first; the bot's own messages are left out. */
  const earlier = async (channel: string, seen: string | undefined, before: string): Promise<string> => {
    let found: readonly DiscordMessage[]
    try { found = await api<readonly DiscordMessage[]>('GET', `/channels/${channel}/messages?before=${before}&limit=100`) } catch (error) {
      warn('discord.history.failed')(error)
      return `(Could not read the earlier messages of this Discord thread: ${said(error)})`
    }
    const lines = [...found].filter((one) => (seen === undefined || newer(one.id, seen)) && one.author?.id !== me && (one.type === 0 || one.type === 19)).sort((a, b) => newer(a.id, b.id) ? 1 : -1).map((one) => {
      const text = named(one)
      return `${nameOf(one.author, one.member?.nick)} (${new Date(snowflakeAt(one.id)).toISOString().slice(0, 16).replace('T', ' ')} UTC): ${containsSecret(text) ? '(left out: looks like it contains a token or key)' : text}${files(one)}`
    })
    let size = 0
    let kept = lines.length
    while (kept > 0 && size + (lines[kept - 1]?.length ?? 0) + 1 <= CONTEXT_LIMIT) { size += (lines[kept - 1]?.length ?? 0) + 1; kept-- }
    if (lines.length === 0) return ''
    return `Earlier in this Discord thread:\n${kept === 0 ? '' : `(${String(kept)} earlier message${kept === 1 ? '' : 's'} left out)\n`}${lines.slice(kept).join('\n')}`
  }

  const closePrompt = (channel: string, prompt: Prompt, note: string): void => {
    void api('PATCH', `/channels/${channel}/messages/${prompt.message}`, { components: [], content: note, allowed_mentions: { parse: [] } }).catch(warn('discord.prompt.close.failed'))
  }

  const follow = (thread: string, channel: string, key: string): void => {
    if (watching.has(thread)) return
    const revision = boundary(key)
    const current = (): boolean => !stopped && revision === boundary(key)
    const shown = new Set([...pending(key).map((one) => one.id), ...prompts(key).map((one) => one.decision)])
    const status = new StatusMessage({
      post: async (text) => {
        if (!current()) throw new Error('Manager conversation changed.')
        const id = await post(channel, text)
        if (id === undefined) throw new Error('Discord did not return the message.')
        return id
      },
      edit: async (id, text) => { if (!current()) return; await api('PATCH', `/channels/${channel}/messages/${id}`, { content: text.slice(0, LIMIT), allowed_mentions: { parse: [] } }) },
    }, { failed: warn('discord.status.failed') })
    watching.set(thread, context.conversations.watch(thread, (event: ChannelEvent) => {
      if (event.kind === 'history') {
        for (const prompt of prompts(key)) closePrompt(channel, prompt, '-# This question was cleared in GeckIt.')
        context.store.set(`reset:${key}`, event.change.revision)
        const seen = context.store.get(`seen:${key}`)
        const at = snowflakeOf(event.change.at)
        context.store.set(`seen:${key}`, typeof seen === 'string' && newer(seen, at) ? seen : at)
        context.store.set(`decisions:${key}`, [])
        context.store.set(`prompts:${key}`, [])
        shown.clear()
        watching.get(thread)?.(); watching.delete(thread)
        if (event.change.action === 'delete') {
          context.store.set('threads', places().filter((one) => one.key !== key))
          context.store.set(`thread:${key}`, undefined)
        } else follow(thread, channel, key)
        return
      }
      if (!current()) return
      if (event.kind === 'status') status.update(event.activity)
      if (event.kind === 'answer') posted(channel, event.text)
      if (event.kind === 'decisions') {
        context.store.set(`decisions:${key}`, event.decisions.map((one) => ({ id: one.id, title: one.title.slice(0, 1_500), values: one.choices.map((choice) => choice.value), labels: one.choices.map((choice) => choice.label) })))
        const open = new Set(event.decisions.map((one) => one.id))
        const left = prompts(key).filter((one) => !open.has(one.decision))
        for (const prompt of left) closePrompt(channel, prompt, `**${prompt.title}**\n-# Answered.`)
        if (left.length > 0) context.store.set(`prompts:${key}`, prompts(key).filter((one) => open.has(one.decision)))
        for (const decision of event.decisions) {
          if (shown.has(decision.id)) continue
          shown.add(decision.id)
          const choices = decision.choices.slice(0, BUTTONS)
          const buttons = decision.choices.length > 0 && decision.choices.length <= BUTTONS
          const title = `**${decision.title.length > 1_500 ? `${decision.title.slice(0, 1_499)}…` : decision.title}**`
          const text = decision.choices.length === 0 ? title : `${title}\n${buttons ? 'Press a button or reply' : 'Reply'} with one of: ${decision.choices.map((one) => `\`${one.value}\``).join(', ')}`
          const rows = buttons ? Array.from({ length: Math.ceil(choices.length / 5) }, (_, row) => ({ type: 1, components: choices.slice(row * 5, row * 5 + 5).map((choice, index) => ({ type: 2, style: row * 5 + index === 0 ? 1 : 2, label: (choice.label || choice.value).slice(0, 80), custom_id: buttonId(decision.id, row * 5 + index) })) })) : []
          void post(channel, text, rows.length === 0 ? {} : { components: rows }).then((message) => {
            if (message !== undefined && rows.length > 0) context.store.set(`prompts:${key}`, [...prompts(key), { decision: decision.id, message, title: decision.title.slice(0, 1_500) }].slice(-50))
          }).catch(warn('discord.decision.failed'))
        }
      }
    }))
  }

  const heard = async (message: DiscordMessage): Promise<void> => {
    if (message.author === undefined || message.author.bot === true || message.webhook_id !== undefined || message.author.id === me) return
    if (message.type !== undefined && message.type !== 0 && message.type !== 19) return
    const user = message.author.id
    const direct = message.guild_id === undefined
    const mention = (message.mentions ?? []).some((one) => one.id === me)
    const info = direct ? undefined : await channelInfo(message.channel_id)
    const inThread = info !== undefined && THREAD_TYPES.has(info.type)
    const key = direct ? `dm:${message.channel_id}` : inThread ? message.channel_id : message.id
    const known = context.store.get(`thread:${key}`) === true
    if (!direct && !mention && !known) return
    const cutoffAt = cutoff(key)
    if (cutoffAt !== undefined && !newer(message.id, cutoffAt)) return
    const seen = context.store.get(`seen:${key}`)
    const seenAt = typeof seen === 'string' ? seen : undefined
    if (seenAt !== undefined && !newer(message.id, seenAt)) return
    const reply = message.channel_id
    if (!allowed(user)) {
      if (mention || direct) await post(reply, 'You are not on the list of people who may use this bot.', { message_reference: { message_id: message.id, fail_if_not_exists: false } })
      return
    }
    if (direct && context.config()['directMessages'] === false) { await post(reply, 'Direct messages are off for this bot. Mention it in a server channel instead.'); return }
    const placesAllowed = strings(context.config()['places'] as Json | undefined)
    if (!direct && placesAllowed.length > 0 && !placesAllowed.includes(message.channel_id) && !(inThread && info?.parent_id != null && placesAllowed.includes(info.parent_id))) {
      if (mention) await post(reply, 'This bot does not answer in this channel. Choose it in GeckIt, Settings, Channels, Discord.', { message_reference: { message_id: message.id, fail_if_not_exists: false } })
      return
    }
    const text = named(message)
    const attached = files(message)
    if (text === '' && attached === '' && !mention) return
    if (context.config()['checkSecrets'] !== false && containsSecret(text)) { await post(reply, 'That message looks like it contains a token or key, so it was not sent. Delete it and write again.', { message_reference: { message_id: message.id, fail_if_not_exists: false } }); return }
    const from = nameOf(message.author, message.member?.nick)
    const revision = boundary(key)
    const current = (): boolean => revision === boundary(key) && !stopped
    let channel = reply
    if (!direct && !inThread) {
      const title = (text.split('\n')[0] ?? '').slice(0, 90) || `Request from ${from}`
      try {
        const opened = await api<DiscordChannelInfo>('POST', `/channels/${message.channel_id}/messages/${message.id}/threads`, { name: title, auto_archive_duration: 1440 })
        channels.set(opened.id, opened)
        channel = opened.id
      } catch (error) {
        await post(reply, `I could not start a thread for this: ${said(error)}. Give the bot Create Public Threads and Send Messages in Threads in this channel.`, { message_reference: { message_id: message.id, fail_if_not_exists: false } }).catch(warn('discord.post.failed'))
        return
      }
    }
    if (!current()) return
    const parent = direct ? undefined : inThread ? info?.parent_id ?? undefined : message.channel_id
    const thread = context.conversations.manager({ key, from, ...(known ? {} : { title: text.split('\n')[0]?.slice(0, 80) || 'Discord thread' }), link: `https://discord.com/channels/${message.guild_id ?? '@me'}/${channel}`, labels: { ...(message.guild_id === undefined ? { place: 'direct message' } : { guild: message.guild_id }), ...(parent === undefined ? {} : { channel: parent }), thread: channel, ...(known ? {} : { starter: from, starterId: user }) } })
    if (thread === undefined) { await post(channel, 'Manager is not available to Discord. Allow it in GeckIt, Settings, Channels, Discord.'); return }
    if (!known) {
      context.store.set(`thread:${key}`, true)
      context.store.set('threads', [...places().filter((one) => one.key !== key), { key, channel }].slice(-500))
    }
    follow(thread, channel, key)
    const choice = text.toLowerCase()
    const decision = pending(key).find((one) => one.values.includes(choice))
    if (decision !== undefined && await context.conversations.answer(thread, decision.id, choice)) { context.store.set(`seen:${key}`, message.id); return }
    const before = inThread ? await earlier(channel, seenAt ?? cutoffAt, message.id) : ''
    if (!current()) return
    const request = `${text === '' ? attached === '' ? 'They mentioned you without a message. Read the thread above and help with it.' : 'They sent only files.' : text}${attached}`
    await context.conversations.send(thread, { text: before === '' ? request : `${before}\n\nMessage to you:\n${request}`, from })
    context.store.set(`seen:${key}`, message.id)
    if (attached !== '' && context.store.get(`files:${key}`) !== true) {
      context.store.set(`files:${key}`, true)
      posted(channel, '-# Files are not passed to GeckIt from Discord. Manager sees their names only; put the content in the message or a project folder.')
    }
  }

  const respond = (interaction: DiscordInteraction, body: object): Promise<unknown> => api('POST', `/interactions/${interaction.id}/${interaction.token}/callback`, body)
  const ephemeral = (interaction: DiscordInteraction, content: string): Promise<unknown> => respond(interaction, { type: 4, data: { content, flags: 64, allowed_mentions: { parse: [] } } })

  /** A button on a question: answered only by someone allowed, only in the thread it was asked in, only on the message that asked it, only while it is open. */
  const pressed = async (interaction: DiscordInteraction): Promise<void> => {
    const custom = interaction.data?.custom_id ?? ''
    if (interaction.type !== 3 || !custom.startsWith('gk:') || !once(`i:${interaction.id}`)) return
    const user = interaction.member?.user ?? interaction.user
    if (user === undefined || !allowed(user.id)) { await ephemeral(interaction, 'You are not on the list of people who may use this bot.'); return }
    const channel = interaction.channel_id ?? ''
    const direct = interaction.guild_id === undefined
    const key = direct ? `dm:${channel}` : channel
    if (direct && context.config()['directMessages'] === false) { await ephemeral(interaction, 'Direct messages are off for this bot. Mention it in a server channel instead.'); return }
    const placesAllowed = strings(context.config()['places'] as Json | undefined)
    if (!direct && placesAllowed.length > 0 && !placesAllowed.includes(channel)) {
      const info = await channelInfo(channel)
      if (info?.parent_id == null || !placesAllowed.includes(info.parent_id)) { await ephemeral(interaction, 'This bot does not answer in this channel. Choose it in GeckIt, Settings, Channels, Discord.'); return }
    }
    const [, hash = '', index = ''] = custom.split(':')
    const decision = pending(key).find((one) => buttonId(one.id, Number(index)) === `gk:${hash}:${index}`)
    const prompt = prompts(key).find((one) => one.decision === decision?.id)
    const value = decision?.values[Number(index)]
    const thread = context.store.get(`thread:${key}`) === true ? context.conversations.manager({ key }) : undefined
    if (decision === undefined || value === undefined || prompt === undefined || prompt.message !== interaction.message?.id || thread === undefined) {
      await ephemeral(interaction, 'This question is no longer open.')
      return
    }
    await respond(interaction, { type: 6 })
    const ok = await context.conversations.answer(thread, decision.id, value).catch((error: unknown) => { warn('discord.answer.failed')(error); return false })
    const label = decision.labels[Number(index)] ?? value
    if (ok) {
      context.store.set(`prompts:${key}`, prompts(key).filter((one) => one.decision !== decision.id))
      await api('PATCH', `/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`, { content: `**${decision.title}**\n-# ${nameOf(user, interaction.member?.nick)} chose ${label}.`, components: [], allowed_mentions: { parse: [] } }).catch(warn('discord.prompt.close.failed'))
    } else {
      await api('POST', `/webhooks/${interaction.application_id}/${interaction.token}`, { content: 'GeckIt could not record that answer. It may already be answered in GeckIt.', flags: 64, allowed_mentions: { parse: [] } }).catch(warn('discord.answer.failed'))
    }
  }

  const send = (payload: object): void => { try { socket?.send(JSON.stringify(payload)) } catch (error) { warn('discord.gateway.send.failed')(error) } }

  const heartbeat = (interval: number): void => {
    clearTimeout(beat)
    acked = true
    const tick = (): void => {
      if (!acked) {
        const stale = socket
        socket = undefined
        try { stale?.close(4000) } catch (error) { warn('discord.gateway.close.failed')(error) }
        reconnect(true)
        return
      }
      acked = false
      send({ op: 1, d: seq })
      beat = setTimeout(tick, interval)
    }
    beat = setTimeout(tick, Math.floor(interval * Math.random()))
  }

  const reconnect = (resume: boolean): void => {
    if (stopped) return
    if (!resume) { session = undefined; seq = null }
    failures++
    const delay = Math.min(30_000, 1_000 * 2 ** Math.min(failures - 1, 5))
    context.status('starting', 'Reconnecting to Discord')
    clearTimeout(retry)
    retry = setTimeout(() => { connect() }, delay)
  }

  const dispatch = (type: string, data: Json): void => {
    if (type === 'READY') {
      const ready = data as unknown as { readonly session_id: string; readonly resume_gateway_url: string; readonly user: DiscordUser }
      session = { id: ready.session_id, url: ready.resume_gateway_url }
      me = ready.user.id
      who = nameOf(ready.user)
      failures = 0
      context.status('connected', `As ${who}`)
    }
    if (type === 'RESUMED') { failures = 0; context.status('connected', who === '' ? undefined : `As ${who}`) }
    if (type === 'THREAD_CREATE' || type === 'THREAD_UPDATE' || type === 'CHANNEL_UPDATE') { const one = data as unknown as DiscordChannelInfo; if (typeof one.id === 'string') channels.set(one.id, one) }
    if (type === 'MESSAGE_CREATE') {
      const message = data as unknown as DiscordMessage
      if (!once(`m:${message.id}`)) return
      chain = chain.then(() => heard(message)).catch((error: unknown) => context.log.write('error', 'discord.event.failed', { reason: said(error) }))
    }
    if (type === 'INTERACTION_CREATE') void pressed(data as unknown as DiscordInteraction).catch((error: unknown) => context.log.write('error', 'discord.interaction.failed', { reason: said(error) }))
  }

  function connect(): void {
    if (stopped) return
    const resuming = session !== undefined
    const opened = new transport.WebSocket(`${resuming ? session?.url ?? gatewayUrl : gatewayUrl}/?v=10&encoding=json`)
    socket = opened
    opened.addEventListener('message', (message) => {
      if (socket !== opened) return
      let frame: { readonly op?: number; readonly d?: Json; readonly s?: number | null; readonly t?: string | null }
      try { frame = JSON.parse(String(message.data)) as typeof frame } catch { return }
      if (typeof frame.s === 'number') seq = frame.s
      if (frame.op === 10) {
        const interval = (frame.d as { readonly heartbeat_interval?: number } | null)?.heartbeat_interval ?? 41_250
        heartbeat(interval)
        if (session !== undefined) send({ op: 6, d: { token: token(), session_id: session.id, seq } })
        else send({ op: 2, d: { token: token(), intents: DISCORD_INTENTS, properties: { os: process.platform, browser: 'GeckIt', device: 'GeckIt' } } })
      }
      if (frame.op === 11) acked = true
      if (frame.op === 1) send({ op: 1, d: seq })
      if (frame.op === 7) opened.close(4000)
      if (frame.op === 9) {
        if (frame.d !== true) { session = undefined; seq = null }
        opened.close(4000)
      }
      if (frame.op === 0 && typeof frame.t === 'string') dispatch(frame.t, frame.d ?? null)
    })
    opened.addEventListener('close', (event) => {
      if (socket !== opened) return
      clearTimeout(beat)
      if (stopped) return
      const fatal = event.code === undefined ? undefined : FATAL[event.code]
      if (fatal !== undefined) { context.status('failed', fatal); return }
      if (event.code === 4007 || event.code === 4009) { reconnect(false); return }
      reconnect(session !== undefined)
    })
  }

  return {
    start: async () => {
      context.status('starting', 'Connecting to Discord')
      const bot = await api<DiscordUser>('GET', '/users/@me')
      me = bot.id
      gatewayUrl = (await api<{ readonly url: string }>('GET', '/gateway/bot')).url
      for (const place of places()) {
        const reset = context.conversations.historyBoundary?.(place.key)
        if (reset?.action === 'delete') { context.store.set(`thread:${place.key}`, undefined); continue }
        if (reset !== undefined && context.store.get(`reset:${place.key}`) !== reset.revision) {
          const seen = context.store.get(`seen:${place.key}`)
          const at = snowflakeOf(reset.at)
          context.store.set(`seen:${place.key}`, typeof seen === 'string' && newer(seen, at) ? seen : at)
          context.store.set(`decisions:${place.key}`, [])
          context.store.set(`prompts:${place.key}`, [])
          context.store.set(`reset:${place.key}`, reset.revision)
        }
        const thread = context.conversations.manager({ key: place.key })
        if (thread !== undefined) follow(thread, place.channel, place.key)
      }
      connect()
    },
    stop: async () => {
      stopped = true
      clearTimeout(retry)
      clearTimeout(beat)
      for (const unwatch of watching.values()) unwatch()
      watching.clear()
      socket?.close(1000)
    },
  }
}

export const DISCORD_MODULE: ChannelModule = {
  create: (context) => createDiscord(context),
  inspect: (setup, request) => inspectDiscord(setup, request as DiscordInspect) as unknown as Promise<Json>,
}
