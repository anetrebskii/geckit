import { channelDownload } from './channel-files'
import type { ChannelFileSender } from './channel-files'
import type { ChannelInfo } from '../../shared/channels'
import type { Channel, ChannelContext, ChannelEvent, ChannelModule } from './channel-api'
import { StatusMessage } from '../manager-status'
import { heard as speechOf, say } from '../manager-voice'

class SlackApiFailure extends Error {}

const SECRET = /\b(?:xox[abposr]-[\w-]{10,}|xapp-[\w-]{10,}|sk-[\w-]{16,}|gh[pousr]_\w{20,}|github_pat_\w{20,}|AKIA[0-9A-Z]{16}|[MNO][\w-]{23,27}\.[\w-]{6}\.[\w-]{27,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/

export const SLACK_INFO: ChannelInfo = {
  id: 'channel:slack',
  name: 'Slack',
  icon: 'chat',
  description: 'Each Slack thread with the bot is a Manager thread of its own.',
  fields: [
    { key: 'botToken', label: 'Bot token', type: 'secret', required: true, help: 'xoxb-, from OAuth and Permissions. Scopes: app_mentions:read, chat:write, im:history, mpim:history, channels:history, groups:history, users:read, files:read, files:write.' },
    { key: 'appToken', label: 'App token', type: 'secret', required: true, help: 'xapp-, with connections:write, for Socket Mode.' },
    { key: 'allow', label: 'People who may write', type: 'list', required: true, help: 'Slack user IDs, such as U012ABC. Nobody else is answered.' },
    { key: 'checkSecrets', label: 'Refuse messages that contain a token or key', type: 'boolean', default: true },
  ],
}

export const containsSecret = (text: string): boolean => SECRET.test(text)
export const cleanMention = (text: string): string => text.replace(/<@[A-Z0-9]+>/g, '').trim()

interface SlackFile {
  readonly id?: string
  readonly name?: string
  readonly mimetype?: string
  readonly size?: number
  readonly url_private_download?: string
  readonly url_private?: string
  readonly shares?: {
    readonly public?: { readonly [channel: string]: readonly { readonly ts?: string; readonly thread_ts?: string }[] }
    readonly private?: { readonly [channel: string]: readonly { readonly ts?: string; readonly thread_ts?: string }[] }
  }
}

interface SlackEvent {
  readonly files?: readonly SlackFile[]
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
const READ_METHODS = new Set(['conversations.replies', 'users.info', 'chat.getPermalink', 'files.info', 'files.getUploadURLExternal'])

/** Whether Slack timestamp a comes after b; both are seconds and microseconds, too precise for one float. */
export const after = (a: string, b: string): boolean => {
  const [aSeconds = '0', aRest = ''] = a.split('.')
  const [bSeconds = '0', bRest = ''] = b.split('.')
  return Number(aSeconds) !== Number(bSeconds) ? Number(aSeconds) > Number(bSeconds) : Number(aRest.padEnd(6, '0')) > Number(bRest.padEnd(6, '0'))
}

const stamp = (ts: string): string => new Date(Number(ts.split('.')[0]) * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

interface SlackReply {
  readonly file?: SlackFile
  readonly file_id?: string
  readonly upload_url?: string
  readonly files?: readonly SlackFile[]
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
    // Slack's read methods ignore a JSON body and answer invalid_arguments, so they get a form.
    const form = READ_METHODS.has(method)
    let response: Response
    try { response = await transport.fetch(`https://slack.com/api/${method}`, { method: 'POST', signal: AbortSignal.timeout(30_000), headers: { authorization: `Bearer ${token ?? ''}`, 'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json; charset=utf-8' }, body: form ? new URLSearchParams(Object.entries(body).map(([key, value]) => [key, String(value)])).toString() : JSON.stringify(body), redirect: 'error' }) } catch { throw new Error(`Slack ${method}: bot API connection failed.`) }
    let json: SlackReply
    try { json = await response.json() as SlackReply } catch { throw new Error(`Slack ${method}: invalid bot API response.`) }
    if (response.status >= 500 || ['internal_error', 'fatal_error'].includes(json.error ?? '')) throw new Error(`Slack ${method}: bot API outcome is uncertain.`)
    if (!json.ok) throw new SlackApiFailure(json.error === 'missing_scope' && method.startsWith('files.') ? `Slack ${method}: missing_scope. Add ${method === 'files.info' ? 'files:read' : 'files:write'} in the existing app’s OAuth & Permissions, then reinstall that app to the workspace.` : `Slack ${method}: ${/^[a-z_]+$/.test(json.error ?? '') ? json.error : 'failed'}`)
    return json
  }
  const post = (channel: string, thread: string, text: string): Promise<SlackReply> => slack('chat.postMessage', { channel, thread_ts: thread, text: text.slice(0, 39_000) })
  const said = (error: unknown): string => error instanceof Error ? error.message : String(error)
  const posted = (channel: string, thread: string, text: string): Promise<unknown> => { const sent = post(channel, thread, text); sent.catch((error: unknown) => context.log.write('warn', 'slack.post.failed', { reason: said(error) })); return sent }

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

  const fileLinks = (text: string): readonly string[] => [...text.matchAll(/https:\/\/(?:[a-z0-9-]+\.slack\.com\/files\/[A-Z0-9]+\/|files\.slack\.com\/files-pri\/[A-Z0-9]+-)(F[A-Z0-9]+)/gi)].map((one) => one[1] ?? '')

  const receive = async (event: SlackEvent, thread: string, channel: string, root: string, current: () => boolean): Promise<readonly string[]> => {
    const ids: string[] = []
    const linked = fileLinks(event.text ?? '')
    const files = [...new Set([...(event.files ?? []).map((file) => file.id ?? ''), ...linked])]
    if (files.length > 10) throw new Error('Send at most 10 attachments in one message.')
    for (const id of files) {
      if (!/^F[A-Z0-9]+$/.test(id)) throw new Error('Slack returned an invalid file ID.')
      const file = (await slack('files.info', { file: id })).file
      if (file?.id !== id) throw new Error('Slack could not read this file. Check the bot’s files:read scope and conversation access.')
      if (linked.includes(id) && ![...file.shares?.public?.[channel] ?? [], ...file.shares?.private?.[channel] ?? []].some((share) => (share.thread_ts ?? share.ts) === root)) throw new Error('This Slack file link is not shared in the current conversation. Upload it here instead.')
      const url = file.url_private_download ?? file.url_private
      if (url === undefined) throw new Error('Slack did not provide downloadable bytes. Resend the file in this conversation.')
      if (!current()) throw new Error('The Manager conversation changed.')
      const bytes = await channelDownload(transport.fetch, url, (location) => location.hostname === 'files.slack.com' && location.pathname.startsWith('/files-pri/'), file.size, context.secret('botToken'))
      if (!current()) throw new Error('The Manager conversation changed.')
      if (context.config()['checkSecrets'] !== false && containsSecret(bytes.toString('utf8'))) throw new Error('This attachment appears to contain a token or key. Remove the secret before resending.')
      if (context.files === undefined) throw new Error('Attachment storage is unavailable.')
      ids.push(context.files.keep(thread, bytes, file.name ?? 'attachment', file.mimetype ?? 'application/octet-stream'))
    }
    return ids
  }

  const follow = (thread: string, channel: string, ts: string, key: string): void => {
    if (watching.has(thread)) return
    const revision = boundary(key)
    const current = (): boolean => !stopped && revision === boundary(key)
    const upload: ChannelFileSender = async (bytes, name, media, caption, _format, _origin, beforeSend) => {
      const validate = (): void => {
        const writer = context.store.get(`writer:${key}`)
        const allow = context.config()['allow']
        if (!current() || typeof writer !== 'string' || !Array.isArray(allow) || !allow.includes(writer)) throw new Error('The originating Slack conversation is no longer authorized.')
        if (context.config()['checkSecrets'] !== false && (containsSecret(caption) || containsSecret(bytes.toString('utf8')))) throw new Error('The selected file or caption appears to contain a token or key.')
      }
      validate()
      await beforeSend?.()
      validate()
      const prepared = await slack('files.getUploadURLExternal', { filename: name, length: bytes.length })
      if (prepared.file_id === undefined || !/^F[A-Z0-9]+$/.test(prepared.file_id) || prepared.upload_url === undefined) throw new Error('Slack did not provide an upload location.')
      const location = new URL(prepared.upload_url)
      if (location.protocol !== 'https:' || location.hostname !== 'files.slack.com' || !location.pathname.startsWith('/upload/') || location.username !== '' || location.password !== '' || location.port !== '') throw new Error('Slack returned an untrusted upload location.')
      validate()
      await beforeSend?.()
      validate()
      let response: Response
      try { response = await transport.fetch(location, { method: 'POST', body: new Uint8Array(bytes), headers: { 'content-type': media }, redirect: 'error', signal: AbortSignal.timeout(30_000) }) } catch { throw new Error('Slack file delivery is uncertain. Check this conversation before requesting another send; the upload was not retried.') }
      if (response.status >= 500) throw new Error('Slack file delivery is uncertain. Check this conversation before requesting another send; the upload was not retried.')
      if (!response.ok) throw new Error(`Slack file delivery failed: upload refused (${String(response.status)}).`)
      validate()
      await beforeSend?.()
      validate()
      let completed: SlackReply
      try { completed = await slack('files.completeUploadExternal', { files: [{ id: prepared.file_id, title: name }], channel_id: channel, thread_ts: ts, ...(caption === '' ? {} : { initial_comment: caption }) }) } catch (error) {
        if (error instanceof SlackApiFailure) throw error
        throw new Error('Slack file delivery is uncertain. Check this conversation before requesting another send; the upload was not retried.', { cause: error })
      }
      if (!completed.files?.some((file) => file.id === prepared.file_id)) throw new Error('Slack file delivery is uncertain: no native file receipt. The upload was not retried.')
      return { channel: 'channel:slack', destination: `${channel}:${ts}`, fileId: prepared.file_id }
    }
    context.files?.bind(thread, upload)
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
      remove: async (id) => { if (!current()) return; await slack('chat.delete', { channel, ts: id }) },
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
      if (event.kind === 'answer') status.after(posted(channel, ts, event.text))
      if (event.kind === 'decisions') {
        context.store.set(`decisions:${key}`, event.decisions.map((one) => ({ id: one.id, values: one.choices.map((choice) => choice.value) })))
        for (const decision of event.decisions) {
          if (shown.has(decision.id)) continue
          shown.add(decision.id)
          status.after(posted(channel, ts, decision.choices.length === 0 ? `*${decision.title}*` : `*${decision.title}*\nReply with one of: ${decision.choices.map((one) => `\`${one.value}\``).join(', ')}`))
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
    const current = (): boolean => { const allow = context.config()['allow']; return revision === boundary(key) && !stopped && Array.isArray(allow) && allow.includes(event.user ?? '') }
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
      if (mention || direct) await post(event.channel, ts, say(speechOf(event.text ?? '')).notAllowed)
      return
    }
    const text = await named(event.text ?? '')
    if (text === '' && event.thread_ts === undefined && (event.files?.length ?? 0) === 0) return
    if (!mention && !direct && !pending(key).some((one) => one.values.includes(text.toLowerCase())) && (event.files?.length ?? 0) === 0 && fileLinks(event.text ?? '').length === 0) return
    if (context.config()['checkSecrets'] !== false && containsSecret(text)) { await post(event.channel, ts, say(speechOf(text)).secret); return }
    const from = await person(event.user)
    const link = known ? undefined : await slack('chat.getPermalink', { channel: event.channel, message_ts: ts }).then((reply) => reply.permalink, () => undefined)
    if (!current()) return
    const thread = context.conversations.manager({ key, from, ...(known ? {} : { title: text.split('\n')[0]?.slice(0, 80) || 'Slack thread' }), ...(link === undefined ? {} : { link }), labels: { channel: event.channel, thread: ts, ...(known ? {} : { starter: from, starterId: event.user }) } })
    if (thread === undefined) { await post(event.channel, ts, say(speechOf(text)).unavailable('Slack', 'Settings, Channels')); return }
    if (!known) {
      context.store.set(`thread:${key}`, true)
      context.store.set('threads', [...places(), { key, channel: event.channel, ts }].slice(-500))
    }
    context.store.set(`writer:${key}`, event.user)
    follow(thread, event.channel, ts, key)
    const choice = text.toLowerCase()
    const decision = pending(key).find((one) => one.values.includes(choice))
    if (decision !== undefined && ((event.files?.length ?? 0) > 0 || fileLinks(event.text ?? '').length > 0)) { await post(event.channel, ts, 'A file cannot answer an approval or question. Use its buttons or a text reply, then send the file as a new message.'); return }
    if (decision !== undefined && await context.conversations.answer(thread, decision.id, choice)) { context.store.set(`seen:${key}`, event.ts); return }
    const before = event.thread_ts === undefined ? '' : await earlier(event.channel, ts, last, event.ts)
    if (!current()) return
    let attachments: readonly string[]
    try { attachments = await receive(event, thread, event.channel, ts, current) } catch (error) { await post(event.channel, ts, `Could not receive this attachment: ${said(error)}. Correct the issue and resend.`); return }
    if (!current()) return
    const request = text === '' ? attachments.length > 0 ? 'They sent attachments.' : 'They mentioned you without a message. Read the thread above and help with it.' : text
    await context.conversations.send(thread, { text: before === '' ? request : `${before}\n\nMessage to you:\n${request}`, from, ...(attachments.length === 0 ? {} : { attachments, authorized: current }) })
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
