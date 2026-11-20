import { createHash } from 'node:crypto'
import { ApprovalQueue } from './approval-queue'
import type { ApprovalPrompt } from './approval-queue'
import { containsSecret } from '../../shared/channel-safety'
import { hasTabHandoffLink } from '../../shared/live-view'
import { channelDownload } from './channel-files'
import type { ChannelFileSender } from './channel-files'
import type { ChannelInfo } from '../../shared/channels'
import type { Channel, ChannelContext, ChannelEvent, ChannelModule } from './channel-api'
import { StatusMessage } from '../manager-status'
import { ChannelShortcutError } from './channel-api'
import { heard as speechOf, say } from '../manager-voice'

class SlackApiFailure extends Error {}


export const SLACK_INFO: ChannelInfo = {
  id: 'channel:slack',
  name: 'Slack',
  icon: 'slack',
  description: 'Each Slack thread with the bot is a Manager thread of its own.',
  capabilities: ['conversations', 'manager', 'delivery', 'files'],
  fields: [
    { key: 'botToken', label: 'Bot token', type: 'secret', required: true, help: 'xoxb-, from OAuth and Permissions. Scopes: app_mentions:read, chat:write, im:history, mpim:history, channels:history, groups:history, channels:read, groups:read, users:read, files:read, files:write, reactions:write.' },
    { key: 'appToken', label: 'App token', type: 'secret', required: true, help: 'xapp-, with connections:write, for Socket Mode. Enable Interactivity & Shortcuts in the Slack app for approval buttons.' },
  ],
}

export { containsSecret } from '../../shared/channel-safety'
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
  readonly blocks?: readonly { readonly block_id?: string }[]
}

interface SlackAction {
  readonly type?: string
  readonly user?: { readonly id?: string }
  readonly channel?: { readonly id?: string }
  readonly container?: { readonly message_ts?: string; readonly thread_ts?: string; readonly channel_id?: string }
  readonly message?: { readonly ts?: string; readonly thread_ts?: string }
  readonly actions?: readonly { readonly action_id?: string; readonly value?: string }[]
}

const approvalId = (id: string): string => `gk:${createHash('sha256').update(id).digest('hex').slice(0, 20)}`

const CONTEXT_LIMIT = 30_000
const PAGES = 10
const READ_METHODS = new Set(['conversations.replies', 'users.info', 'chat.getPermalink', 'files.info', 'files.getUploadURLExternal', 'conversations.list'])

/** Whether Slack timestamp a comes after b; both are seconds and microseconds, too precise for one float. */
export const after = (a: string, b: string): boolean => {
  const [aSeconds = '0', aRest = ''] = a.split('.')
  const [bSeconds = '0', bRest = ''] = b.split('.')
  return Number(aSeconds) !== Number(bSeconds) ? Number(aSeconds) > Number(bSeconds) : Number(aRest.padEnd(6, '0')) > Number(bRest.padEnd(6, '0'))
}

const stamp = (ts: string): string => new Date(Number(ts.split('.')[0]) * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'

/** How long what Slack said about a person is trusted, so someone who leaves or becomes a guest stops being answered. */
const MEMBER_TTL = 10 * 60_000

interface SlackDestination {
  readonly id: string
  readonly name?: string
  readonly is_member?: boolean
  readonly is_archived?: boolean
}

interface SlackReply {
  readonly channel?: string
  readonly channels?: readonly SlackDestination[]
  readonly file?: SlackFile
  readonly file_id?: string
  readonly upload_url?: string
  readonly files?: readonly SlackFile[]
  readonly ok: boolean
  readonly error?: string
  readonly url?: string
  readonly permalink?: string
  readonly user_id?: string
  readonly team_id?: string
  readonly ts?: string
  readonly messages?: readonly SlackMessage[]
  readonly has_more?: boolean
  readonly response_metadata?: { readonly next_cursor?: string }
  readonly user?: SlackUser
}

interface SlackUser {
  readonly real_name?: string
  readonly name?: string
  readonly profile?: { readonly display_name?: string; readonly real_name?: string }
  readonly team_id?: string
  readonly is_bot?: boolean
  readonly deleted?: boolean
  /** A multi-channel guest. */
  readonly is_restricted?: boolean
  /** A single-channel guest. */
  readonly is_ultra_restricted?: boolean
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
  const approvals = new Map<string, ApprovalQueue>()
  const names = new Map<string, string>()
  const members = new Map<string, { readonly user: SlackUser; readonly at: number }>()
  let me: string | undefined
  let team: string | undefined
  const incoming = new Map<string, Promise<void>>()

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
  const privateText = (channel: string, text: string): string => {
    if (channel.startsWith('D') || !hasTabHandoffLink(text)) return text
    return 'Send me a direct message to open the browser tab privately.'
  }
  const post = (channel: string, thread: string, text: string): Promise<SlackReply> => slack('chat.postMessage', { channel, thread_ts: thread, text: privateText(channel, text).slice(0, 39_000), ...(hasTabHandoffLink(text) ? { unfurl_links: false, unfurl_media: false } : {}) })
  const said = (error: unknown): string => error instanceof Error ? error.message : String(error)
  const posted = (channel: string, thread: string, text: string): Promise<unknown> => { const sent = post(channel, thread, text); sent.catch((error: unknown) => context.log.write('warn', 'slack.post.failed', { reason: said(error) })); return sent }
  // An :eyes: reaction on each message Manager took, until it answers or finishes, so the thread shows the bot is on it.
  const marked = new Map<string, { readonly channel: string; readonly ts: string }[]>()
  const react = (method: 'reactions.add' | 'reactions.remove', channel: string, ts: string): void => {
    slack(method, { channel, timestamp: ts, name: 'eyes' }).catch((error: unknown) => context.log.write('warn', 'slack.reaction.failed', { method, reason: said(error) }))
  }
  const mark = (thread: string, channel: string, ts: string): void => {
    marked.set(thread, [...(marked.get(thread) ?? []), { channel, ts }])
    react('reactions.add', channel, ts)
  }
  const unmark = (thread: string): void => {
    for (const one of marked.get(thread) ?? []) react('reactions.remove', one.channel, one.ts)
    marked.delete(thread)
  }

  /** Who Slack says a user is, asked again after MEMBER_TTL; nothing when the call fails. */
  const member = async (user: string): Promise<SlackUser | undefined> => {
    const known = members.get(user)
    if (known !== undefined && Date.now() - known.at < MEMBER_TTL) return known.user
    const found = (await slack('users.info', { user }).catch(() => undefined))?.user
    if (found !== undefined) members.set(user, { user: found, at: Date.now() })
    return found
  }

  const person = async (user: string): Promise<string> => {
    const known = names.get(user)
    if (known !== undefined) return known
    const found = await member(user)
    const name = found?.profile?.display_name || found?.real_name || found?.profile?.real_name || found?.name || user
    names.set(user, name)
    return name
  }

  const allowedNow = (user: string): boolean => {
    const found = members.get(user)?.user
    return team !== undefined && found?.team_id === team && found.is_bot !== true && found.deleted !== true
  }

  const allowed = async (user: string): Promise<boolean> => {
    await member(user)
    return allowedNow(user)
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

  const places = (): readonly { readonly key: string; readonly channel: string; readonly ts: string }[] => {
    const ordinary = context.store.get('threads')
    const shortcuts = context.store.get('shortcut-threads')
    const value = [...Array.isArray(ordinary) ? ordinary : [], ...Array.isArray(shortcuts) ? shortcuts : []]
    const places = value.flatMap((one) => one !== null && typeof one === 'object' && !Array.isArray(one) && typeof one['key'] === 'string' && typeof one['channel'] === 'string' && typeof one['ts'] === 'string' ? [{ key: one['key'], channel: one['channel'], ts: one['ts'] }] : [])
    return [...new Map(places.map((one) => [one.key, one] as const)).values()]
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
      if (containsSecret(bytes.toString('utf8'))) throw new Error('This attachment appears to contain a token or key. Remove the secret before resending.')
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
        if (!current() || typeof writer !== 'string' || !allowedNow(writer)) throw new Error('The originating Slack conversation is no longer authorized.')
        if (containsSecret(caption) || containsSecret(bytes.toString('utf8'))) throw new Error('The selected file or caption appears to contain a token or key.')
      }
      const writer = context.store.get(`writer:${key}`)
      if (typeof writer === 'string') await allowed(writer)
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
      try { completed = await slack('files.completeUploadExternal', { files: [{ id: prepared.file_id, title: name }], channel_id: channel, thread_ts: ts, ...(caption === '' ? {} : { initial_comment: privateText(channel, caption) }) }) } catch (error) {
        if (error instanceof SlackApiFailure) throw error
        throw new Error('Slack file delivery is uncertain. Check this conversation before requesting another send; the upload was not retried.', { cause: error })
      }
      if (!completed.files?.some((file) => file.id === prepared.file_id)) throw new Error('Slack file delivery is uncertain: no native file receipt. The upload was not retried.')
      return { channel: 'channel:slack', destination: `${channel}:${ts}`, fileId: prepared.file_id }
    }
    context.files?.bind(thread, upload)
    let busy = false
    const plain = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    const status = new StatusMessage({
      post: async (text) => {
        if (!current()) throw new Error('Manager conversation changed.')
        const reply = await post(channel, ts, plain(text))
        if (reply.ts === undefined) throw new Error('Slack chat.postMessage: no ts')
        return reply.ts
      },
      edit: async (id, text) => { if (!current()) return; await slack('chat.update', { channel, ts: id, text: plain(privateText(channel, text)) }) },
      remove: async (id) => { if (!current()) return; await slack('chat.delete', { channel, ts: id }) },
    }, { failed: (error) => context.log.write('warn', 'slack.status.failed', { reason: said(error) }) })
    const queue = new ApprovalQueue({
      context, thread, key, current,
      post: async (decision) => {
        const marker = approvalId(decision.id)
        if (context.store.get(`approval-posting:${key}`) === decision.id) {
          let cursor = ''
          for (let page = 0; page < PAGES; page++) {
            const reply = await slack('conversations.replies', { channel, ts, limit: 200, ...(cursor === '' ? {} : { cursor }) })
            const found = reply.messages?.find((one) => one.user === me && one.blocks?.some((block) => block.block_id === marker))
            if (found?.ts !== undefined) return found.ts
            cursor = reply.response_metadata?.next_cursor ?? ''
            if (reply.has_more !== true || cursor === '') break
            if (page === PAGES - 1) throw new Error('Slack approval delivery could not be reconciled.')
          }
        }
        const buttons = decision.choices.length > 0 && decision.choices.length <= 40
        const text = privateText(channel, decision.choices.length === 0 ? decision.title : `${decision.title}\n${buttons ? 'Press a button or reply' : 'Reply'} with one of: ${decision.choices.map((one) => `\`${one.value}\``).join(', ')}`)
        const sections = (text.slice(0, 39_000).match(/[\s\S]{1,3000}/g) ?? []).map((part, index) => ({ type: 'section', ...(index === 0 ? { block_id: marker } : {}), text: { type: 'plain_text', text: part } }))
        const actions = buttons ? Array.from({ length: Math.ceil(decision.choices.length / 25) }, (_, row) => ({ type: 'actions', elements: decision.choices.slice(row * 25, row * 25 + 25).map((choice, index) => ({ type: 'button', text: { type: 'plain_text', text: privateText(channel, choice.label || choice.value).slice(0, 75) }, action_id: `${marker}:${String(row * 25 + index)}`, value: decision.id })) })) : []
        context.store.set(`approval-posting:${key}`, decision.id)
        const reply = await slack('chat.postMessage', { channel, thread_ts: ts, text: text.slice(0, 39_000), mrkdwn: false, blocks: [...sections, ...actions] }).catch((error: Error) => { if (error instanceof SlackApiFailure) context.store.set(`approval-posting:${key}`, undefined); throw error })
        if (reply.ts === undefined) throw new Error('Slack approval has no message receipt.')
        context.store.set(`approval-posting:${key}`, undefined)
        return reply.ts
      },
      close: async (prompt, note) => { await slack('chat.update', { channel, ts: prompt.message, text: privateText(channel, `${prompt.title}\n${note}`).slice(0, 39_000), mrkdwn: false, blocks: [] }) },
      notify: async (text) => { await post(channel, ts, text) },
      failed: (error) => context.log.write('warn', 'slack.decision.failed', { reason: said(error) }),
    })
    approvals.set(key, queue)
    watching.set(thread, context.conversations.watch(thread, (event: ChannelEvent) => {
      if (event.kind === 'history') {
        context.store.set(`reset:${key}`, event.change.revision)
        const seen = context.store.get(`seen:${key}`)
        const cutoffAt = (event.change.at / 1000).toFixed(6)
        context.store.set(`seen:${key}`, typeof seen === 'string' && after(seen, cutoffAt) ? seen : cutoffAt)
        context.store.set(`decisions:${key}`, [])
        queue.clear()
        approvals.delete(key)
        if (event.change.action === 'delete') {
          context.store.set('threads', places().filter((one) => one.key !== key))
          context.store.set('shortcut-threads', places().filter((one) => one.key !== key))
          context.store.set(`thread:${key}`, undefined)
          watching.get(thread)?.(); watching.delete(thread)
        } else { watching.get(thread)?.(); watching.delete(thread); follow(thread, channel, ts, key) }
        return
      }
      if (!current()) return
      if (event.kind === 'status') {
        if (event.activity?.active === true) busy = true
        else if (busy) { busy = false; unmark(thread) }
        status.update(event.activity)
      }
      if (event.kind === 'answer') { unmark(thread); status.after(posted(channel, ts, event.text)) }
      if (event.kind === 'decisions') queue.update(event.decisions)
    }))
    queue.refresh()
  }

  const heard = async (event: SlackEvent, received: ApprovalPrompt | undefined): Promise<void> => {
    if (event.bot_id !== undefined || event.subtype !== undefined && event.subtype !== 'file_share' || event.channel === undefined || event.ts === undefined || event.user === undefined || event.user === me) return
    const direct = event.type === 'message' && event.channel_type === 'im'
    const mention = event.type === 'app_mention'
    const ts = event.thread_ts ?? event.ts
    const key = keyOf(event.channel, ts)
    const revision = boundary(key)
    const current = (): boolean => revision === boundary(key) && !stopped && allowedNow(event.user ?? '')
    const cutoffAt = cutoff(key)
    if (cutoffAt !== undefined && !after(event.ts, cutoffAt)) return
    const known = context.store.get(`thread:${key}`) === true
    if (!mention && !direct && !(event.type === 'message' && event.thread_ts !== undefined && known)) return
    const seen = context.store.get(`seen:${key}`)
    const seenAt = typeof seen === 'string' ? seen : undefined
    const last = cutoffAt !== undefined && (seenAt === undefined || after(cutoffAt, seenAt)) ? cutoffAt : seenAt
    if (last !== undefined && !after(event.ts, last)) return
    if (!await allowed(event.user)) {
      if (mention || direct) await post(event.channel, ts, say(speechOf(event.text ?? '')).notAllowed)
      return
    }
    const text = await named(event.text ?? '')
    if (text === '' && event.thread_ts === undefined && (event.files?.length ?? 0) === 0) return
    if (!mention && !direct && context.store.get(`shortcut:${key}`) !== true && !approvals.get(key)?.matches(text) && received?.choices.some((one) => one.value.toLowerCase() === text.toLowerCase()) !== true && (event.files?.length ?? 0) === 0 && fileLinks(event.text ?? '').length === 0) return
    if (containsSecret(text)) { await post(event.channel, ts, say(speechOf(text)).secret); return }
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
    const queue = approvals.get(key)
    const answering = received?.choices.some((one) => one.value.toLowerCase() === text.toLowerCase()) === true || queue?.matches(text) === true
    if (answering && ((event.files?.length ?? 0) > 0 || fileLinks(event.text ?? '').length > 0)) { await post(event.channel, ts, 'A file cannot answer an approval or question. Use its buttons or a text reply, then send the file as a new message.'); return }
    if (answering) context.store.set(`seen:${key}`, event.ts)
    if (await queue?.reply(text, received, { id: event.user, name: from }, current)) return
    const before = event.thread_ts === undefined ? '' : await earlier(event.channel, ts, last, event.ts)
    if (!current()) return
    let attachments: readonly string[]
    try { attachments = await receive(event, thread, event.channel, ts, current) } catch (error) { await post(event.channel, ts, `Could not receive this attachment: ${said(error)}. Correct the issue and resend.`); return }
    if (!current()) return
    const request = text === '' ? attachments.length > 0 ? 'They sent attachments.' : 'They mentioned you without a message. Read the thread above and help with it.' : text
    mark(thread, event.channel, event.ts)
    await context.conversations.send(thread, { text: before === '' ? request : `${before}\n\nMessage to you:\n${request}`, from, ...(attachments.length === 0 ? {} : { attachments, authorized: current }) })
    context.store.set(`seen:${key}`, event.ts)
  }

  const pressed = async (action: SlackAction): Promise<void> => {
    if (action.type !== 'block_actions') return
    const user = action.user?.id
    const channel = action.channel?.id ?? action.container?.channel_id
    const message = action.message?.ts ?? action.container?.message_ts
    const place = places().find((one) => one.channel === channel && approvals.get(one.key)?.prompt?.message === message)
    const ts = action.message?.thread_ts ?? action.container?.thread_ts ?? place?.ts
    const button = action.actions?.[0]
    if (user === undefined || channel === undefined || ts === undefined || message === undefined || button?.value === undefined) return
    if (!await allowed(user)) { await slack('chat.postEphemeral', { channel, thread_ts: ts, user, text: say(speechOf('')).notAllowed }); return }
    const key = keyOf(channel, ts)
    const queue = approvals.get(key)
    const prompt = queue?.prompt
    const index = Number(button.action_id?.split(':').at(-1))
    const value = prompt?.choices[index]?.value
    if (prompt === undefined || prompt.message !== message || button.value !== prompt.id || button.action_id !== `${approvalId(prompt.id)}:${String(index)}` || value === undefined) {
      await slack('chat.postEphemeral', { channel, thread_ts: ts, user, text: 'This request is no longer pending.' })
      return
    }
    const revision = boundary(key)
    await queue?.reply(value, prompt, { id: user, name: await person(user) }, () => !stopped && revision === boundary(key) && allowedNow(user))
  }

  const connect = async (): Promise<void> => {
    const { url } = await slack('apps.connections.open', {}, context.secret('appToken'))
    if (stopped || url === undefined) return
    const opened = new transport.WebSocket(url)
    socket = opened
    opened.addEventListener('message', (message) => {
      let envelope: { readonly type?: string; readonly envelope_id?: string; readonly payload?: SlackAction & { readonly event?: SlackEvent } }
      try { envelope = JSON.parse(String(message.data)) as typeof envelope } catch { return }
      if (envelope.type === 'hello') { context.status('connected', 'Listening'); for (const queue of approvals.values()) queue.refresh() }
      if (envelope.type === 'disconnect') opened.close()
      if (envelope.envelope_id !== undefined) opened.send(JSON.stringify({ envelope_id: envelope.envelope_id }))
      if (envelope.type === 'interactive' && envelope.payload !== undefined) void pressed(envelope.payload).catch((error: Error) => context.log.write('warn', 'slack.interaction.failed', { reason: said(error) }))
      if (envelope.type === 'events_api' && envelope.payload?.event !== undefined) {
        const event = envelope.payload.event
        const received = approvals.get(keyOf(event.channel ?? '', event.thread_ts ?? event.ts ?? ''))?.prompt
        const route = keyOf(event.channel ?? '', event.thread_ts ?? event.ts ?? '')
        const next = (incoming.get(route) ?? Promise.resolve()).then(() => heard(event, received)).catch((error: Error) => context.log.write('error', 'slack.event.failed', { reason: said(error) }))
        incoming.set(route, next)
        void next.then(() => { if (incoming.get(route) === next) incoming.delete(route) })
      }
    })
    opened.addEventListener('close', () => {
      if (stopped) return
      context.status('starting', 'Reconnecting to Slack')
      retry = setTimeout(() => { void connect().catch((error: unknown) => context.status('failed', said(error))) }, 5_000)
    })
  }

  return {
    destinations: async () => {
      const available: SlackDestination[] = []
      let cursor = ''
      do {
        const reply = await slack('conversations.list', { types: 'public_channel,private_channel', exclude_archived: true, limit: 200, cursor })
        available.push(...reply.channels ?? [])
        cursor = reply.response_metadata?.next_cursor ?? ''
      } while (cursor !== '')
      return available.filter((one) => one.is_member === true && one.is_archived !== true).map((one) => ({ id: one.id, name: `#${one.name ?? one.id} (${one.id})`, model: 'thread' as const }))
    },
    publishShortcut: async (input) => {
      if (stopped) throw new ChannelShortcutError(false, 'Slack is stopped.')
      const parts = privateText(input.destination, input.text).match(/[\s\S]{1,39000}/g) ?? []
      const write = async (text: string, ts?: string): Promise<SlackReply & Required<Pick<SlackReply, 'ts' | 'channel'>>> => {
        input.beforeSend?.()
        if (stopped) throw new ChannelShortcutError(false, 'Slack is stopped.')
        let receipt: SlackReply
        try { receipt = await slack('chat.postMessage', { channel: input.destination, ...(ts === undefined ? {} : { thread_ts: ts }), text, unfurl_links: false, unfurl_media: false, parse: 'none', mrkdwn: false, link_names: false }) } catch (error) {
          throw new ChannelShortcutError(!(error instanceof SlackApiFailure), said(error))
        }
        if (receipt.channel !== input.destination || typeof receipt.ts !== 'string' || !/^\d+\.\d+$/.test(receipt.ts)) throw new ChannelShortcutError(true, 'Slack result delivery is uncertain: no matching native receipt.')
        return { ...receipt, ts: receipt.ts, channel: receipt.channel }
      }
      const root = await write(privateText(input.destination, input.title?.trim() || 'Scheduled result'))
      const ts = root.ts
      const key = keyOf(input.destination, ts)
      const link = await slack('chat.getPermalink', { channel: input.destination, message_ts: ts }).then((reply) => reply.permalink, () => undefined)
      const thread = input.bind({ key, ...(input.title === undefined ? {} : { title: input.title }), ...(link === undefined ? {} : { link }), labels: { channel: input.destination, thread: ts } })
      context.store.set(`thread:${key}`, true)
      context.store.set(`shortcut:${key}`, true)
      context.store.set('shortcut-threads', [...places().filter((one) => one.key !== key), { key, channel: input.destination, ts }])
      follow(thread, input.destination, ts, key)
      let message: string | undefined
      for (const text of parts) { const receipt = await write(text, ts); message = receipt.ts; context.store.set(`seen:${key}`, receipt.ts) }
      if (message === undefined) throw new ChannelShortcutError(true, 'Slack result delivery is uncertain: result was empty.')
      return { destination: input.destination, thread: key, message, ...(link === undefined ? {} : { link }) }
    },
    start: async () => {
      context.status('starting', 'Connecting to Slack')
      const auth = await slack('auth.test')
      me = auth.user_id
      team = auth.team_id
      for (const place of places()) {
        const reset = context.conversations.historyBoundary?.(place.key)
        if (reset?.action === 'delete') {
          context.store.set(`thread:${place.key}`, undefined)
          const prompt = context.store.get(`approval:${place.key}`)
          if (prompt !== null && typeof prompt === 'object' && 'message' in prompt && typeof prompt.message === 'string') await slack('chat.update', { channel: place.channel, ts: prompt.message, text: 'This request is no longer pending.', blocks: [] }).catch((error: Error) => context.log.write('warn', 'slack.prompt.close.failed', { reason: said(error) }))
          context.store.set(`approval:${place.key}`, undefined)
          continue
        }
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
      approvals.clear()
      socket?.close()
    },
  }
}

export const SLACK_MODULE: ChannelModule = { create: (context) => createSlack(context) }
