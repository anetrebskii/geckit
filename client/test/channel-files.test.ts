import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import type { ChannelContext, ChannelEvent, ChannelSend, Json } from '../src/main/channels/channel-api'
import type { ChannelFileSender } from '../src/main/channels/channel-files'
import { channelDownload } from '../src/main/channels/channel-files'
import { createSlack } from '../src/main/channels/slack'
import { createDiscord } from '../src/main/channels/discord'
import { TelegramAttachments, TELEGRAM_DOWNLOAD_LIMIT, TELEGRAM_RETENTION } from '../src/main/telegram-attachments'
import type { ChannelId } from '../src/shared/channels'
import type { ManagerHistoryBoundary } from '../src/shared/manager'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1kAAAAASUVORK5CYII=', 'base64')
const folders: string[] = []
const stops: (() => Promise<void>)[] = []
afterEach(async () => { for (const stop of stops.splice(0)) await stop(); for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })
const cache = (): TelegramAttachments => { const folder = mkdtempSync(join(tmpdir(), 'geckit-channel-files-')); folders.push(folder); return new TelegramAttachments(folder) }
const settle = async (): Promise<void> => { for (let index = 0; index < 12; index++) await new Promise((done) => setTimeout(done, 0)) }

class Socket {
  static latest: Socket | undefined
  private message: ((event: { readonly data: string }) => void) | undefined
  constructor() { Socket.latest = this }
  addEventListener(type: 'message', listener: (event: { readonly data: string }) => void): void
  addEventListener(type: 'close', listener: (event: { readonly code?: number }) => void): void
  addEventListener(type: 'message' | 'close', listener: ((event: { readonly data: string }) => void) | ((event: { readonly code?: number }) => void)): void { if (type === 'message') this.message = listener as (event: { readonly data: string }) => void }
  send(): void {}
  close(): void {}
  frame(value: object): void { this.message?.({ data: JSON.stringify(value) }) }
}
const socket = (): Socket => { if (Socket.latest === undefined) throw new Error('Socket not started'); return Socket.latest }

function context(id: ChannelId) {
  const attachments = cache()
  const store = new Map<string, Json>()
  const senders = new Map<string, ChannelFileSender>()
  const sent: { readonly thread: string; readonly message: ChannelSend }[] = []
  const watchers = new Map<string, (event: ChannelEvent) => void>()
  const answered: string[] = []
  let allow = ['U1', '301234567890123456']
  let boundary: ManagerHistoryBoundary | undefined
  const result: ChannelContext = {
    id, log: { path: '', write: () => undefined }, config: () => ({ allow, checkSecrets: true, directMessages: true, places: [] }), secret: () => 'bot-native-token',
    store: { get: (key) => store.get(key), set: (key, value) => { if (value === undefined) store.delete(key); else store.set(key, value) } },
    status: () => undefined, projects: () => [], providers: () => ['claude'], employees: () => [],
    files: { keep: (thread, bytes, name, media) => attachments.put(bytes, name, media, thread).id, bind: (thread, sender) => { senders.set(thread, sender); return () => senders.delete(thread) } },
    conversations: {
      historyBoundary: () => boundary,
      manager: (place) => `${id}:${place?.key ?? 'default'}`,
      label: () => undefined, start: async () => 'unused',
      send: async (thread, message) => { if (message.authorized?.() === false) throw new Error('Unauthorized'); sent.push({ thread, message }) },
      get: () => undefined, list: () => [], items: async () => [],
      watch: (thread, listener) => { watchers.set(thread, listener); return () => watchers.delete(thread) },
      answer: async (_thread, card) => { answered.push(card); return true }, stop: async () => undefined,
    },
  }
  return { result, attachments, store, senders, sent, watchers, answered, revoke: () => { allow = [] }, reset: () => { boundary = { id: 'reset', revision: 'new-revision', at: Date.now(), action: 'clear' } } }
}

interface NetworkCall { readonly url: string; readonly init?: RequestInit }
const jsonBody = (init?: RequestInit): { readonly channel_id?: string; readonly thread_ts?: string; readonly files?: readonly { readonly id: string }[] } => typeof init?.body === 'string' ? JSON.parse(init.body) as ReturnType<typeof jsonBody> : {}

function slack(options: { readonly shares?: string; readonly download?: () => void; readonly completion?: number; readonly missing?: boolean } = {}) {
  const run = context('channel:slack')
  const calls: NetworkCall[] = []
  const posts: string[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input)
    calls.push({ url, ...(init === undefined ? {} : { init }) })
    const method = url.split('/').at(-1)
    if (url.startsWith('https://files.slack.com/files-pri/')) { options.download?.(); return new Response(url.includes('FIMAGE') ? new Uint8Array(png) : 'readable input') }
    if (url === 'https://files.slack.com/upload/opaque') return new Response('ok')
    if (method === 'auth.test') return Response.json({ ok: true, user_id: 'UBOT' })
    if (method === 'apps.connections.open') return Response.json({ ok: true, url: 'wss://socket.example' })
    if (method === 'users.info') return Response.json({ ok: true, user: { real_name: 'Alex' } })
    if (method === 'chat.getPermalink') return Response.json({ ok: true, permalink: 'https://example.slack.com/archives/C1/p100000001' })
    if (method === 'chat.postMessage') { posts.push(typeof init?.body === 'string' ? init.body : ''); return Response.json({ ok: true, ts: '999.000001' }) }
    if (method === 'conversations.replies') return Response.json({ ok: true, messages: [] })
    if (method === 'files.info') {
      if (options.missing === true) return Response.json({ ok: false, error: 'missing_scope' })
      const id = new URLSearchParams(typeof init?.body === 'string' ? init.body : '').get('file') ?? ''
      return Response.json({ ok: true, file: { id, name: id === 'FIMAGE' ? 'screen.png' : 'input.txt', mimetype: 'application/octet-stream', url_private: `https://files.slack.com/files-pri/T1-${id}/input`, shares: { private: { C1: [{ ts: options.shares ?? '100.000001' }] } } } })
    }
    if (method === 'files.getUploadURLExternal') return Response.json({ ok: true, file_id: 'FOUTPUT', upload_url: 'https://files.slack.com/upload/opaque' })
    if (method === 'files.completeUploadExternal') return Response.json({ ok: options.completion === undefined, ...(options.completion === undefined ? { files: [{ id: 'FOUTPUT' }] } : { error: 'internal_error' }) }, { status: options.completion ?? 200 })
    return Response.json({ ok: true })
  }
  const channel = createSlack(run.result, { fetch: fetcher, WebSocket: Socket })
  stops.push(() => channel.stop())
  const event = (extra: object = {}): void => socket().frame({ type: 'events_api', envelope_id: 'event', payload: { event: { type: 'app_mention', channel: 'C1', user: 'U1', ts: '100.000001', text: '<@UBOT> Read this', ...extra } } })
  return { ...run, channel, calls, posts, event }
}

it('Slack incoming retains document bytes and sends actual image input; outgoing uploads exact selected bytes into the bound root thread with file receipt', async () => {
  const run = slack()
  await run.channel.start()
  run.event({ files: [{ id: 'FTEXT' }, { id: 'FIMAGE' }] })
  await settle()
  const received = run.sent[0]
  expect(received?.thread).toBe('channel:slack:C1:100.000001')
  const ids = received?.message.attachments ?? []
  const input = run.attachments.input(ids, received?.thread)
  expect(input.text).toContain('readable input')
  expect(input.text).toContain('untrusted task data')
  expect(input.images).toEqual([{ media: 'image/png', data: png.toString('base64') }])
  const sender = run.senders.get(received?.thread ?? '')
  if (sender === undefined) throw new Error('No Slack sender')
  const receipt = await sender(png, 'report.png', 'image/png', 'Requested artifact', 'photo', { session: 'manager', workers: ['worker'], ...(received === undefined ? {} : { thread: received.thread }) })
  expect(receipt).toEqual({ channel: 'channel:slack', destination: 'C1:100.000001', fileId: 'FOUTPUT' })
  const uploaded = run.calls.find((call) => call.url.includes('/upload/'))
  expect(uploaded?.init?.body).toEqual(new Uint8Array(png))
  expect(uploaded?.init?.redirect).toBe('error')
  expect(jsonBody(run.calls.find((call) => call.url.endsWith('/files.completeUploadExternal'))?.init)).toMatchObject({ channel_id: 'C1', thread_ts: '100.000001', files: [{ id: 'FOUTPUT' }] })
  expect(run.calls.find((call) => call.url.endsWith('/files.getUploadURLExternal'))?.init?.headers).toMatchObject({ 'content-type': 'application/x-www-form-urlencoded' })
  await sender(Buffer.from('exact document artifact'), 'report.txt', 'text/plain', '', 'document', { session: 'manager', workers: ['worker'] })
  expect(run.calls.filter((call) => call.url.includes('/upload/')).at(-1)?.init?.body).toEqual(new Uint8Array(Buffer.from('exact document artifact')))
  run.event({ type: 'message', thread_ts: '100.000001', ts: '101.000001', text: '', files: [{ id: 'FTEXT' }] })
  await settle()
  expect(run.sent).toHaveLength(2)
})

it('Slack resolves native links only with current conversation share proof, refuses outsiders before download and reports missing scope natively', async () => {
  const run = slack()
  await run.channel.start()
  run.event({ text: '<@UBOT> https://example.slack.com/files/U1/FTEXT/input.txt' })
  await settle()
  expect(run.sent[0]?.message.attachments).toHaveLength(1)
  const other = slack({ shares: '99.000001' })
  await other.channel.start()
  other.event({ text: '<@UBOT> https://example.slack.com/files/U1/FTEXT/input.txt' })
  await settle()
  expect(other.sent).toHaveLength(0)
  expect(other.calls.some((call) => call.url.includes('/files-pri/'))).toBe(false)
  expect(other.posts.join('')).toContain('not shared in the current conversation')
  const stranger = slack()
  await stranger.channel.start()
  stranger.event({ user: 'UOTHER', files: [{ id: 'FTEXT' }] })
  await settle()
  expect(stranger.calls.some((call) => call.url.endsWith('/files.info'))).toBe(false)
  const missing = slack({ missing: true })
  await missing.channel.start()
  missing.event({ files: [{ id: 'FTEXT' }] })
  await settle()
  expect(missing.posts.join('')).toContain('files:read')
  expect(missing.posts.join('')).toContain('OAuth & Permissions')
})

it('Slack invalidates in-flight input on allowlist revocation and never retries uncertain native completion', async () => {
  const run = slack({ download: () => run.revoke() })
  await run.channel.start()
  run.event({ files: [{ id: 'FTEXT' }] })
  await settle()
  expect(run.sent).toHaveLength(0)
  const uncertain = slack({ completion: 500 })
  await uncertain.channel.start()
  uncertain.event()
  await settle()
  const sender = uncertain.senders.values().next().value
  if (sender === undefined) throw new Error('No Slack sender')
  await expect(sender(png, 'photo.png', 'image/png', '', 'photo', { session: 'manager', workers: [] })).rejects.toThrow('uncertain')
  expect(uncertain.calls.filter((call) => call.url.endsWith('/files.completeUploadExternal'))).toHaveLength(1)
})

function discord(options: { readonly status?: number; readonly download?: () => void } = {}) {
  const run = context('channel:discord')
  const calls: NetworkCall[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input)
    calls.push({ url, ...(init === undefined ? {} : { init }) })
    if (url.startsWith('https://cdn.discordapp.com/attachments/')) { options.download?.(); return new Response(url.endsWith('image.png') ? new Uint8Array(png) : 'readable Discord input') }
    if (url.endsWith('/users/@me')) return Response.json({ id: '100000000000000001', username: 'GeckIt' })
    if (url.endsWith('/gateway/bot')) return Response.json({ url: 'wss://gateway.example' })
    if (init?.body instanceof FormData) return Response.json({ id: '900000000000000001', channel_id: '200000000000000001', attachments: [{ id: '800000000000000001' }] }, { status: options.status ?? 200 })
    return Response.json({ id: '900000000000000001' })
  }
  const channel = createDiscord(run.result, { fetch: fetcher, WebSocket: Socket, wait: async () => undefined })
  stops.push(() => channel.stop())
  const event = (extra: object = {}): void => socket().frame({ op: 0, t: 'MESSAGE_CREATE', d: { id: '500000000000000001', channel_id: '200000000000000001', author: { id: '301234567890123456', username: 'Alex' }, content: 'Read these', ...extra } })
  return { ...run, channel, calls, event }
}

it('Discord incoming files and photos preserve bytes; multipart outgoing returns matching native message/file receipt in the same DM without mentions', async () => {
  const run = discord()
  await run.channel.start()
  run.event({ attachments: [{ id: '71', filename: 'readme.txt', url: 'https://cdn.discordapp.com/attachments/200000000000000001/71/input.txt' }, { id: '72', filename: 'screen.png', content_type: 'text/plain', url: 'https://cdn.discordapp.com/attachments/200000000000000001/72/image.png' }] })
  await settle()
  const received = run.sent[0]
  const ids = received?.message.attachments ?? []
  const input = run.attachments.input(ids, received?.thread)
  expect(input.text).toContain('readable Discord input')
  expect(input.images).toEqual([{ media: 'image/png', data: png.toString('base64') }])
  const sender = run.senders.get(received?.thread ?? '')
  if (sender === undefined) throw new Error('No Discord sender')
  expect(await sender(png, 'result.png', 'image/png', 'Your artifact', 'photo', { session: 'manager', workers: [] })).toEqual({ channel: 'channel:discord', destination: '200000000000000001', messageId: '900000000000000001', fileId: '800000000000000001' })
  const form = run.calls.find((call) => call.init?.body instanceof FormData)?.init?.body
  if (!(form instanceof FormData)) throw new Error('No multipart upload')
  const file = form.get('files[0]')
  if (!(file instanceof Blob)) throw new Error('No file bytes')
  expect(Buffer.from(await file.arrayBuffer())).toEqual(png)
  expect(JSON.parse(String(form.get('payload_json')))).toMatchObject({ content: 'Your artifact', allowed_mentions: { parse: [] }, attachments: [{ id: 0, filename: 'result.png' }] })
  await sender(Buffer.from('exact document artifact'), 'report.txt', 'text/plain', '', 'document', { session: 'manager', workers: [] })
  const documentForm = run.calls.filter((call) => call.init?.body instanceof FormData).at(-1)?.init?.body
  if (!(documentForm instanceof FormData)) throw new Error('No document form')
  const documentFile = documentForm.get('files[0]')
  if (!(documentFile instanceof Blob)) throw new Error('No document bytes')
  expect(Buffer.from(await documentFile.arrayBuffer()).toString()).toBe('exact document artifact')
})

it('Discord rejects outsiders and untrusted URLs before download, invalidates revoked input and surfaces native permission or uncertain upload without retry', async () => {
  const denied = discord()
  await denied.channel.start()
  denied.event({ author: { id: '999999999999999999' }, attachments: [{ id: '71', url: 'https://cdn.discordapp.com/attachments/200000000000000001/71/input.txt' }] })
  await settle()
  expect(denied.calls.some((call) => call.url.includes('/attachments/'))).toBe(false)
  const revoked = discord({ download: () => revoked.revoke() })
  await revoked.channel.start()
  revoked.event({ attachments: [{ id: '71', url: 'https://cdn.discordapp.com/attachments/200000000000000001/71/input.txt' }] })
  await settle()
  expect(revoked.sent).toHaveLength(0)
  for (const status of [403, 500]) {
    const run = discord({ status })
    await run.channel.start()
    run.event()
    await settle()
    const sender = run.senders.values().next().value
    if (sender === undefined) throw new Error('No sender')
    await expect(sender(png, 'photo.png', 'image/png', '', 'photo', { session: 'manager', workers: [] })).rejects.toThrow(status === 403 ? 'Attach Files' : 'uncertain')
    expect(run.calls.filter((call) => call.init?.body instanceof FormData)).toHaveLength(1)
  }
})

it('shared cache enforces thread ownership, native images and pinned lifetime while Telegram disconnect preserves channel inputs', () => {
  const store = cache()
  const one = store.put(png, 'image.png', 'text/plain', 'channel:slack:thread-one')
  const telegram = store.put(Buffer.from('legacy Telegram'), 'legacy.txt', 'text/plain')
  expect(() => store.read(one.id, 'channel:discord:other')).toThrow('unavailable')
  expect(() => store.read(telegram.id, 'channel:slack:thread-one')).toThrow('unavailable')
  store.clear()
  expect(store.input([one.id], 'channel:slack:thread-one').images).toHaveLength(1)
  expect(() => store.read(telegram.id)).toThrow('unavailable')
  const folder = mkdtempSync(join(tmpdir(), 'geckit-channel-expiration-')); folders.push(folder)
  let now = Date.now()
  const timed = new TelegramAttachments(folder, () => now)
  const retained = timed.put(Buffer.from('queued'), 'input.txt', 'text/plain', 'channel:slack:one')
  timed.pin('manager', [retained.id])
  now += TELEGRAM_RETENTION + 1
  expect(timed.read(retained.id, 'channel:slack:one').bytes.toString()).toBe('queued')
  timed.pin('manager', [])
  expect(() => timed.read(retained.id, 'channel:slack:one')).toThrow('unavailable')
})

it('bounded download refuses untrusted hosts, credentials, redirects, wrong size, empty and oversized bodies without leaking a token-bearing URL', async () => {
  let calls = 0
  const fake: typeof fetch = async (_url, init) => { calls++; expect(init?.redirect).toBe('error'); return new Response('data') }
  const trusted = (url: URL): boolean => url.hostname === 'files.slack.com'
  await expect(channelDownload(fake, 'https://evil.example/private', trusted)).rejects.toThrow('untrusted')
  await expect(channelDownload(fake, 'https://user:secret@files.slack.com/path', trusted)).rejects.toThrow('untrusted')
  await expect(channelDownload(fake, 'https://files.slack.com/path', trusted, TELEGRAM_DOWNLOAD_LIMIT + 1)).rejects.toThrow('20 MiB')
  expect(calls).toBe(0)
  await expect(channelDownload(fake, 'https://files.slack.com/path', trusted, 5)).rejects.toThrow('incomplete')
  const broken: typeof fetch = async () => { throw new Error('https://files.slack.com/private?secret-token') }
  await expect(channelDownload(broken, 'https://files.slack.com/path', trusted)).rejects.not.toThrow('secret-token')
  for (const bytes of [new Uint8Array(0), new Uint8Array(TELEGRAM_DOWNLOAD_LIMIT + 1)]) await expect(channelDownload(async () => new Response(bytes), 'https://files.slack.com/path', trusted)).rejects.toThrow('20 MiB')
})

it('cleared threads cannot dispatch in-flight inputs or reuse a previously bound upload sender', async () => {
  const run = slack({ download: () => run.reset() })
  await run.channel.start()
  run.event({ files: [{ id: 'FTEXT' }] })
  await settle()
  expect(run.sent).toHaveLength(0)
  const sender = run.senders.values().next().value
  if (sender === undefined) throw new Error('Missing sender')
  await expect(sender(png, 'photo.png', 'image/png', '', 'photo', { session: 'manager', workers: [] })).rejects.toThrow('no longer authorized')
  expect(run.calls.some((call) => call.url.endsWith('/files.getUploadURLExternal'))).toBe(false)
  const discordRun = discord({ download: () => discordRun.reset() })
  await discordRun.channel.start()
  discordRun.event({ attachments: [{ id: '71', url: 'https://cdn.discordapp.com/attachments/200000000000000001/71/input.txt' }] })
  await settle()
  expect(discordRun.sent).toHaveLength(0)
})

it('a file accompanying a decision value cannot authorize a Manager approval in either native channel', async () => {
  const slackRun = slack()
  await slackRun.channel.start()
  slackRun.event()
  await settle()
  slackRun.store.set('decisions:C1:100.000001', [{ id: 'permission', values: ['allow'] }])
  slackRun.event({ type: 'message', thread_ts: '100.000001', ts: '101.000001', text: 'allow', files: [{ id: 'FTEXT' }] })
  await settle()
  expect(slackRun.answered).toEqual([])
  expect(slackRun.posts.join('')).toContain('A file cannot answer an approval')
  expect(slackRun.sent).toHaveLength(1)
  const discordRun = discord()
  await discordRun.channel.start()
  discordRun.event()
  await settle()
  discordRun.store.set('decisions:dm:200000000000000001', [{ id: 'permission', title: 'Allow?', values: ['allow'], labels: ['Allow'] }])
  discordRun.event({ id: '500000000000000002', content: 'allow', attachments: [{ id: '71', url: 'https://cdn.discordapp.com/attachments/200000000000000001/71/input.txt' }] })
  await settle()
  expect(discordRun.answered).toEqual([])
  expect(discordRun.sent).toHaveLength(1)
  expect(discordRun.calls.some((call) => typeof call.init?.body === 'string' && call.init.body.includes('A file cannot answer an approval'))).toBe(true)
})

it('revalidates channel authorization after the asynchronous worker gate immediately before any upload', async () => {
  for (const run of [slack(), discord()]) {
    await run.channel.start()
    run.event()
    await settle()
    const sender = run.senders.values().next().value
    if (sender === undefined) throw new Error('Missing sender')
    await expect(sender(png, 'photo.png', 'image/png', '', 'photo', { session: 'manager', workers: [] }, async () => { run.revoke() })).rejects.toThrow('no longer authorized')
    expect(run.calls.some((call) => call.url.endsWith('/files.getUploadURLExternal') || call.init?.body instanceof FormData)).toBe(false)
  }
})
