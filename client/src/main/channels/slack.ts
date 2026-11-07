import type { ChannelInfo } from '../../shared/channels'
import type { Channel, ChannelContext, ChannelEvent, ChannelModule } from './channel-api'
import { StatusMessage } from '../manager-status'

const SECRET = /\b(?:xox[abposr]-[\w-]{10,}|xapp-[\w-]{10,}|sk-[\w-]{16,}|gh[pousr]_\w{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}|[MNO][\w-]{23,27}\.[\w-]{6}\.[\w-]{27,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/

export const SLACK_INFO: ChannelInfo = {
  id: 'channel:slack',
  name: 'Slack',
  icon: 'chat',
  description: 'Each Slack thread with the bot is a Manager thread of its own.',
  fields: [
    { key: 'botToken', label: 'Bot token', type: 'secret', required: true, help: 'xoxb-, from OAuth and Permissions. Scopes: app_mentions:read, chat:write, im:history, mpim:history, channels:history, groups:history, users:read.' },
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

interface SlackMessage {
  readonly user?: string
  readonly bot_id?: string
  readonly subtype?: string
  readonly username?: string
  readonly bot_profile?: { readonly name?: string }
  readonly text?: string
  readonly ts?: string
  readonly files?: readonly { readonly name?: string; readonly permalink?: string }[]
}

const CONTEXT_LIMIT = 30_000
const PAGES = 10

/** Whether Slack timestamp a comes after b; both are seconds and microseconds, too precise for one float. */
export const after = (a: string, b: string): boolean => {
  const [aSeconds = '0', aRest = ''] = a.split('.')
  const [bSeconds = '0', bRest = ''] = b.split('.')
  return Number(aSeconds) !== Number(bSeconds) ? Number(aSeconds) > Number(bSeconds) : Number(aRest.padEnd(6, '0')) > Number(bRest.padEnd(6, '0'))
}

const stamp = (ts: string): string => new Date(Number(ts.split('.')[0]) * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

interface SlackReply {
  readonly ok: boolean
  readonly error?: string
  readonly url?: string
  readonly permalink?: string
  readonly user_id?: string
  readonly ts?: string
  readonly messages?: readonly SlackMessage[]
  readonly has_more?: boolean
  readonly response_metadata?: { readonly next_cursor?: string }
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
  let me: string | undefined
  let chain: Promise<void> = Promise.resolve()

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

  /** The text with the bot's own mention taken out and everyone else's shown by name. */
  const named = async (text: string): Promise<string> => {
    if (me === undefined) return cleanMention(text)
    let out = text
    for (const id of new Set([...text.matchAll(/<@([A-Z0-9]+)>/g)].map((match) => match[1] ?? ''))) out = out.replaceAll(`<@${id}>`, id === me ? '' : `@${await person(id)}`)
    return out.replace(/[ \t]{2,}/g, ' ').trim()
  }

  /** What was written in the Slack thread after `seen` and before `before`, for Manager to read first; the bot's own answers are left out. */
  const earlier = async (channel: string, root: string, seen: string | undefined, before: string): Promise<string> => {
    const found: SlackMessage[] = []
    let cursor: string | undefined
    try {
      for (let page = 0; page < PAGES; page++) {
        const reply = await slack('conversations.replies', { channel, ts: root, limit: 200, ...(seen === undefined ? {} : { oldest: seen }), ...(cursor === undefined ? {} : { cursor }) })
        found.push(...reply.messages ?? [])
        cursor = reply.response_metadata?.next_cursor
        if (reply.has_more !== true || cursor === undefined || cursor === '') break
      }
    } catch (error) {
      context.log.write('warn', 'slack.history.failed', { reason: said(error) })
      return `(Could not read the earlier messages of this Slack thread: ${said(error)})`
    }
    const shown = found.filter((one) => one.ts !== undefined && after(before, one.ts) && (seen === undefined || after(one.ts, seen)) && one.user !== me && (one.subtype === undefined || one.subtype === 'file_share' || one.subtype === 'bot_message') && !(one.bot_id !== undefined && one.user === undefined && one.subtype !== 'bot_message'))
    const lines: string[] = []
    for (const one of shown) {
      const author = one.user === undefined ? one.bot_profile?.name ?? one.username ?? 'A bot' : await person(one.user)
      const text = await named(one.text ?? '')
      const files = (one.files ?? []).map((file) => ` [file: ${file.name ?? 'unnamed'}${file.permalink === undefined ? '' : ` ${file.permalink}`}]`).join('')
      lines.push(`${author} (${stamp(one.ts ?? '0')}): ${containsSecret(text) ? '(left out: looks like it contains a token or key)' : text}${files}`)
    }
    let size = 0
    let kept = lines.length
    while (kept > 0 && size + (lines[kept - 1]?.length ?? 0) + 1 <= CONTEXT_LIMIT) { size += (lines[kept - 1]?.length ?? 0) + 1; kept-- }
    const left = kept
    if (lines.length === 0) return ''
    return `Earlier in this Slack thread:\n${left === 0 ? '' : `(${String(left)} earlier message${left === 1 ? '' : 's'} left out)\n`}${lines.slice(left).join('\n')}`
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

  const boundary = (key: string): string | undefined => context.conversations.historyBoundary?.(key)?.revision
  const cutoff = (key: string): string | undefined => { const at = context.conversations.historyBoundary?.(key)?.at; return at === undefined ? undefined : (at / 1000).toFixed(6) }

  const follow = (thread: string, channel: string, ts: string, key: string): void => {
    if (watching.has(thread)) return
    const revision = boundary(key)
    const current = (): boolean => !stopped && revision === boundary(key)
    const shown = new Set(pending(key).map((one) => one.id))
    const plain = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    const status = new StatusMessage({
      post: async (text) => {
        if (!current()) throw new Error('Manager conversation changed.')
        const reply = await post(channel, ts, plain(text))
        if (reply.ts === undefined) throw new Error('Slack chat.postMessage: no ts')
        return reply.ts
      },
      edit: async (id, text) => { if (!current()) return; await slack('chat.update', { channel, ts: id, text: plain(text) }) },
    }, { failed: (error) => context.log.write('warn', 'slack.status.failed', { reason: said(error) }) })
    watching.set(thread, context.conversations.watch(thread, (event: ChannelEvent) => {
      if (event.kind === 'history') {
        context.store.set(`reset:${key}`, event.change.revision)
        const seen = context.store.get(`seen:${key}`)
        const cutoffAt = (event.change.at / 1000).toFixed(6)
        context.store.set(`seen:${key}`, typeof seen === 'string' && after(seen, cutoffAt) ? seen : cutoffAt)
        context.store.set(`decisions:${key}`, [])
        shown.clear()
        if (event.change.action === 'delete') {
          context.store.set('threads', places().filter((one) => one.key !== key))
          context.store.set(`thread:${key}`, undefined)
          watching.get(thread)?.(); watching.delete(thread)
        } else { watching.get(thread)?.(); watching.delete(thread); follow(thread, channel, ts, key) }
        return
      }
      if (!current()) return
      if (event.kind === 'status') status.update(event.activity)
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
    if (event.bot_id !== undefined || event.subtype !== undefined && event.subtype !== 'file_share' || event.channel === undefined || event.ts === undefined || event.user === undefined || event.user === me) return
    const direct = event.type === 'message' && event.channel_type === 'im'
    const mention = event.type === 'app_mention'
    const ts = event.thread_ts ?? event.ts
    const key = keyOf(event.channel, ts)
    const revision = boundary(key)
    const current = (): boolean => revision === boundary(key) && !stopped
    const cutoffAt = cutoff(key)
    if (cutoffAt !== undefined && !after(event.ts, cutoffAt)) return
    const known = context.store.get(`thread:${key}`) === true
    if (!mention && !direct && !(event.type === 'message' && event.thread_ts !== undefined && known)) return
    const seen = context.store.get(`seen:${key}`)
    const seenAt = typeof seen === 'string' ? seen : undefined
    const last = cutoffAt !== undefined && (seenAt === undefined || after(cutoffAt, seenAt)) ? cutoffAt : seenAt
    if (last !== undefined && !after(event.ts, last)) return
    const allow = context.config()['allow']
    if (!Array.isArray(allow) || !allow.includes(event.user)) {
      if (mention || direct) await post(event.channel, ts, 'You are not on the list of people who may use this bot.')
      return
    }
    const text = await named(event.text ?? '')
    if (text === '' && event.thread_ts === undefined) return
    if (context.config()['checkSecrets'] !== false && containsSecret(text)) { await post(event.channel, ts, 'That message looks like it contains a token or key, so it was not sent. Remove it and write again.'); return }
    const from = await person(event.user)
    const link = known ? undefined : await slack('chat.getPermalink', { channel: event.channel, message_ts: ts }).then((reply) => reply.permalink, () => undefined)
    if (!current()) return
    const thread = context.conversations.manager({ key, from, ...(known ? {} : { title: text.split('\n')[0]?.slice(0, 80) || 'Slack thread' }), ...(link === undefined ? {} : { link }), labels: { channel: event.channel, thread: ts, ...(known ? {} : { starter: from, starterId: event.user }) } })
    if (thread === undefined) { await post(event.channel, ts, 'Manager is not available to Slack. Allow it in GeckIt, Settings, Channels.'); return }
    if (!known) {
      context.store.set(`thread:${key}`, true)
      context.store.set('threads', [...places(), { key, channel: event.channel, ts }].slice(-500))
    }
    follow(thread, event.channel, ts, key)
    const choice = text.toLowerCase()
    const decision = pending(key).find((one) => one.values.includes(choice))
    if (decision !== undefined && await context.conversations.answer(thread, decision.id, choice)) { context.store.set(`seen:${key}`, event.ts); return }
    const before = event.thread_ts === undefined ? '' : await earlier(event.channel, ts, last, event.ts)
    if (!current()) return
    const request = text === '' ? 'They mentioned you without a message. Read the thread above and help with it.' : text
    await context.conversations.send(thread, { text: before === '' ? request : `${before}\n\nMessage to you:\n${request}`, from })
    context.store.set(`seen:${key}`, event.ts)
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
      if (envelope.type === 'events_api' && envelope.payload?.event !== undefined) {
        const event = envelope.payload.event
        chain = chain.then(() => heard(event)).catch((error: unknown) => context.log.write('error', 'slack.event.failed', { reason: said(error) }))
      }
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
      me = (await slack('auth.test')).user_id
      for (const place of places()) {
        const reset = context.conversations.historyBoundary?.(place.key)
        if (reset?.action === 'delete') { context.store.set(`thread:${place.key}`, undefined); continue }
        if (reset !== undefined && context.store.get(`reset:${place.key}`) !== reset.revision) {
          const seen = context.store.get(`seen:${place.key}`)
          const cutoffAt = (reset.at / 1000).toFixed(6)
          context.store.set(`seen:${place.key}`, typeof seen === 'string' && after(seen, cutoffAt) ? seen : cutoffAt)
          context.store.set(`decisions:${place.key}`, [])
          context.store.set(`reset:${place.key}`, reset.revision)
        }
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
