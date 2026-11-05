import type { ChannelInfo } from '../../shared/channels'
import type { Channel, ChannelContext, ChannelEvent, ChannelModule } from './channel-api'

const SECRET = /\b(?:xox[abposr]-[\w-]{10,}|xapp-[\w-]{10,}|sk-[\w-]{16,}|gh[pousr]_\w{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/

export const SLACK_INFO: ChannelInfo = {
  id: 'channel:slack',
  name: 'Slack',
  icon: 'chat',
  description: 'Each Slack thread with the bot is a Manager thread of its own.',
  fields: [
    { key: 'botToken', label: 'Bot token', type: 'secret', required: true, help: 'xoxb-, from OAuth and Permissions. Scopes: app_mentions:read, chat:write, im:history, channels:history, groups:history, users:read.' },
    { key: 'appToken', label: 'App token', type: 'secret', required: true, help: 'xapp-, with connections:write, for Socket Mode.' },
    { key: 'allow', label: 'People who may write', type: 'list', required: true, help: 'Slack user IDs, such as U012ABC. Nobody else is answered.' },
    { key: 'checkSecrets', label: 'Refuse messages that contain a token or key', type: 'boolean', default: true },
  ],
}

export const containsSecret = (text: string): boolean => SECRET.test(text)
export const cleanMention = (text: string): string => text.replace(/<@[A-Z0-9]+>/g, '').trim()

interface SlackEvent {
  readonly type?: string
  readonly subtype?: string
  readonly bot_id?: string
  readonly channel?: string
  readonly channel_type?: string
  readonly user?: string
  readonly text?: string
  readonly ts?: string
  readonly thread_ts?: string
}

interface SlackReply {
  readonly ok: boolean
  readonly error?: string
  readonly url?: string
  readonly permalink?: string
  readonly user?: { readonly real_name?: string; readonly name?: string; readonly profile?: { readonly display_name?: string; readonly real_name?: string } }
}

interface SlackSocket {
  addEventListener(type: 'message', listener: (message: { readonly data: unknown }) => void): void
  addEventListener(type: 'close', listener: () => void): void
  send(data: string): void
  close(): void
}

export interface SlackTransport {
  readonly fetch: typeof fetch
  readonly WebSocket: new (url: string) => SlackSocket
}

/** Slack built into GeckIt: each Slack thread where people talk to the bot is its own Manager thread. */
export function createSlack(context: ChannelContext, transport: SlackTransport = { fetch, WebSocket: WebSocket as unknown as SlackTransport['WebSocket'] }): Channel {
  let socket: SlackSocket | undefined
  let stopped = false
  let retry: ReturnType<typeof setTimeout> | undefined
  const watching = new Map<string, () => void>()
  const names = new Map<string, string>()

  const slack = async (method: string, body: object = {}, token = context.secret('botToken')): Promise<SlackReply> => {
    const response = await transport.fetch(`https://slack.com/api/${method}`, { method: 'POST', headers: { authorization: `Bearer ${token ?? ''}`, 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) })
    const json = await response.json() as SlackReply
    if (!json.ok) throw new Error(`Slack ${method}: ${json.error ?? 'failed'}`)
    return json
  }
  const post = (channel: string, thread: string, text: string): Promise<SlackReply> => slack('chat.postMessage', { channel, thread_ts: thread, text: text.slice(0, 39_000) })
  const said = (error: unknown): string => error instanceof Error ? error.message : String(error)
  const posted = (channel: string, thread: string, text: string): void => { void post(channel, thread, text).catch((error: unknown) => context.log.write('warn', 'slack.post.failed', { reason: said(error) })) }

  const person = async (user: string): Promise<string> => {
    const known = names.get(user)
    if (known !== undefined) return known
    const found = await slack('users.info', { user }).catch(() => undefined)
    const name = found?.user?.profile?.display_name || found?.user?.real_name || found?.user?.profile?.real_name || found?.user?.name || user
    names.set(user, name)
    return name
  }

  const keyOf = (channel: string, thread: string): string => `${channel}:${thread}`
  const pending = (key: string): readonly { readonly id: string; readonly values: readonly string[] }[] => {
    const value = context.store.get(`decisions:${key}`)
    return Array.isArray(value) ? value.flatMap((one) => one !== null && typeof one === 'object' && !Array.isArray(one) && typeof one['id'] === 'string' && Array.isArray(one['values']) ? [{ id: one['id'], values: one['values'].filter((item): item is string => typeof item === 'string') }] : []) : []
  }

  const places = (): readonly { readonly key: string; readonly channel: string; readonly ts: string }[] => {
    const value = context.store.get('threads')
    return Array.isArray(value) ? value.flatMap((one) => one !== null && typeof one === 'object' && !Array.isArray(one) && typeof one['key'] === 'string' && typeof one['channel'] === 'string' && typeof one['ts'] === 'string' ? [{ key: one['key'], channel: one['channel'], ts: one['ts'] }] : []) : []
  }

  const follow = (thread: string, channel: string, ts: string, key: string): void => {
    if (watching.has(thread)) return
    const shown = new Set(pending(key).map((one) => one.id))
    watching.set(thread, context.conversations.watch(thread, (event: ChannelEvent) => {
      if (event.kind === 'answer') posted(channel, ts, event.text)
      if (event.kind === 'decisions') {
        context.store.set(`decisions:${key}`, event.decisions.map((one) => ({ id: one.id, values: one.choices.map((choice) => choice.value) })))
        for (const decision of event.decisions) {
          if (shown.has(decision.id)) continue
          shown.add(decision.id)
          posted(channel, ts, decision.choices.length === 0 ? `*${decision.title}*` : `*${decision.title}*\nReply with one of: ${decision.choices.map((one) => `\`${one.value}\``).join(', ')}`)
        }
      }
    }))
  }

  const heard = async (event: SlackEvent): Promise<void> => {
    if (event.bot_id !== undefined || event.subtype !== undefined || event.channel === undefined || event.ts === undefined || event.user === undefined) return
    const direct = event.type === 'message' && event.channel_type === 'im'
    const ts = event.thread_ts ?? event.ts
    const key = keyOf(event.channel, ts)
    const known = context.store.get(`thread:${key}`) === true
    if (event.type !== 'app_mention' && !direct && !(event.type === 'message' && event.thread_ts !== undefined && known)) return
    const allow = context.config()['allow']
    if (!Array.isArray(allow) || !allow.includes(event.user)) { await post(event.channel, ts, 'You are not on the list of people who may use this bot.'); return }
    const text = cleanMention(event.text ?? '')
    if (text === '') return
    if (context.config()['checkSecrets'] !== false && containsSecret(text)) { await post(event.channel, ts, 'That message looks like it contains a token or key, so it was not sent. Remove it and write again.'); return }
    const from = await person(event.user)
    const link = known ? undefined : await slack('chat.getPermalink', { channel: event.channel, message_ts: ts }).then((reply) => reply.permalink, () => undefined)
    const thread = context.conversations.manager({ key, from, ...(known ? {} : { title: text.split('\n')[0]?.slice(0, 80) ?? 'Slack thread' }), ...(link === undefined ? {} : { link }), labels: { channel: event.channel, thread: ts, ...(known ? {} : { starter: from, starterId: event.user }) } })
    if (thread === undefined) { await post(event.channel, ts, 'Manager is not available to Slack. Allow it in GeckIt, Settings, Channels.'); return }
    if (!known) {
      context.store.set(`thread:${key}`, true)
      context.store.set('threads', [...places(), { key, channel: event.channel, ts }].slice(-500))
    }
    follow(thread, event.channel, ts, key)
    const choice = text.toLowerCase()
    const decision = pending(key).find((one) => one.values.includes(choice))
    if (decision !== undefined && await context.conversations.answer(thread, decision.id, choice)) return
    await context.conversations.send(thread, { text, from })
  }

  const connect = async (): Promise<void> => {
    const { url } = await slack('apps.connections.open', {}, context.secret('appToken'))
    if (stopped || url === undefined) return
    const opened = new transport.WebSocket(url)
    socket = opened
    opened.addEventListener('message', (message) => {
      let envelope: { readonly type?: string; readonly envelope_id?: string; readonly payload?: { readonly event?: SlackEvent } }
      try { envelope = JSON.parse(String(message.data)) as typeof envelope } catch { return }
      if (envelope.type === 'hello') context.status('connected', 'Listening')
      if (envelope.type === 'disconnect') opened.close()
      if (envelope.envelope_id !== undefined) opened.send(JSON.stringify({ envelope_id: envelope.envelope_id }))
      if (envelope.type === 'events_api' && envelope.payload?.event !== undefined) void heard(envelope.payload.event).catch((error: unknown) => context.log.write('error', 'slack.event.failed', { reason: said(error) }))
    })
    opened.addEventListener('close', () => {
      if (stopped) return
      context.status('starting', 'Reconnecting to Slack')
      retry = setTimeout(() => { void connect().catch((error: unknown) => context.status('failed', said(error))) }, 5_000)
    })
  }

  return {
    start: async () => {
      context.status('starting', 'Connecting to Slack')
      await slack('auth.test')
      for (const place of places()) {
        const thread = context.conversations.manager({ key: place.key })
        if (thread !== undefined) follow(thread, place.channel, place.ts, place.key)
      }
      await connect()
    },
    stop: async () => {
      stopped = true
      clearTimeout(retry)
      for (const unwatch of watching.values()) unwatch()
      watching.clear()
      socket?.close()
    },
  }
}

export const SLACK_MODULE: ChannelModule = { create: (context) => createSlack(context) }
