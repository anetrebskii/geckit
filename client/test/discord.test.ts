import { expect, it, vi } from 'vitest'

import type { ChannelContext, ChannelEvent } from '../src/main/channels/channel-api'
import { DISCORD_INTENTS, chunks, createDiscord, discordApi, inspectDiscord, snowflakeAt } from '../src/main/channels/discord'
import type { DiscordTransport } from '../src/main/channels/discord'
import { DISCORD_INVITE_PERMISSIONS, discordId } from '../src/shared/discord'

const ALLOWED = '301234567890123456'
const OTHER = '302222222222222222'
const STRANGER = '309999999999999999'
const BOT = '100000000000000001'
const GUILD = '400000000000000001'
const TEXT = '410000000000000001'
const ELSEWHERE = '410000000000000009'

class FakeSocket {
  static all: FakeSocket[] = []
  readonly sent: { op: number; d: unknown }[] = []
  readonly listeners: { message?: (message: { readonly data: unknown }) => void; close?: (event: { readonly code?: number }) => void } = {}
  closed: number | undefined
  constructor(readonly url: string) { FakeSocket.all.push(this) }
  addEventListener(name: 'message' | 'close', listener: never): void { this.listeners[name] = listener }
  send(text: string): void { this.sent.push(JSON.parse(text) as { op: number; d: unknown }) }
  close(code?: number): void { this.closed = code }
  frame(frame: object): void { this.listeners.message?.({ data: JSON.stringify(frame) }) }
  drop(code: number): void { this.listeners.close?.({ code }) }
}

interface Call { readonly method: string; readonly path: string; readonly body: { [key: string]: unknown } }

function harness(options: { readonly config?: object; readonly manager?: boolean; readonly history?: readonly object[]; readonly threadFails?: boolean } = {}) {
  FakeSocket.all = []
  const calls: Call[] = []
  const sent: [string, { text: string; from?: string }][] = []
  const answered: [string, string, unknown][] = []
  const opened: { key: string; labels?: { [key: string]: string } }[] = []
  const statuses: [string, string | undefined][] = []
  const watchers = new Map<string, (event: ChannelEvent) => void>()
  const store = new Map<string, unknown>()
  const channels: { [id: string]: { id: string; type: number; parent_id?: string; guild_id?: string } } = {
    [TEXT]: { id: TEXT, type: 0, guild_id: GUILD },
    [ELSEWHERE]: { id: ELSEWHERE, type: 0, guild_id: GUILD },
  }
  let posted = 0
  const context = {
    id: 'channel:discord',
    log: { path: '', write: () => undefined },
    config: () => ({ allow: [ALLOWED, OTHER], checkSecrets: true, directMessages: true, places: [], ...options.config }),
    secret: (key: string) => key === 'botToken' ? 'test-token' : undefined,
    store: { get: (key: string) => store.get(key), set: (key: string, value: unknown) => { if (value === undefined) store.delete(key); else store.set(key, value) } },
    status: (state: string, says?: string) => { statuses.push([state, says]) },
    projects: () => [],
    providers: () => ['claude'],
    employees: () => [],
    conversations: {
      manager: (place: { key: string; labels?: { [key: string]: string } }) => { opened.push(place); return options.manager === false ? undefined : `channel:discord:${place.key}` },
      label: () => undefined,
      start: async () => 'never',
      send: async (id: string, message: { text: string; from?: string }) => { sent.push([id, message]) },
      get: () => undefined,
      list: () => [],
      items: async () => [],
      watch: (id: string, listener: (event: ChannelEvent) => void) => { watchers.set(id, listener); return () => watchers.delete(id) },
      answer: async (id: string, card: string, answer: unknown) => { answered.push([id, card, answer]); return true },
      stop: async () => undefined,
    },
  } as unknown as ChannelContext
  const fetch = (async (url: string, init: { method: string; body?: string }) => {
    const path = url.replace('https://discord.com/api/v10', '')
    const body = init.body === undefined ? {} : JSON.parse(init.body) as { [key: string]: unknown }
    calls.push({ method: init.method, path, body })
    const reply = (status: number, json: unknown): Response => ({ status, ok: status < 300, json: async () => json }) as Response
    if (path === '/users/@me') return reply(200, { id: BOT, username: 'geckit-bot', global_name: 'GeckIt Bot' })
    if (path === '/gateway/bot') return reply(200, { url: 'wss://gateway.example' })
    if (path.startsWith('/channels/') && init.method === 'GET' && !path.includes('/messages')) {
      const found = channels[path.split('/')[2] ?? '']
      return found === undefined ? reply(404, { message: 'Unknown Channel', code: 10003 }) : reply(200, found)
    }
    if (path.endsWith('/threads') && init.method === 'POST') {
      if (options.threadFails === true) return reply(403, { message: 'Missing Permissions', code: 50013 })
      const id = path.split('/')[4] ?? ''
      channels[id] = { id, type: 11, parent_id: path.split('/')[2] ?? '', guild_id: GUILD }
      return reply(201, channels[id])
    }
    if (path.includes('/messages?before=')) return reply(200, options.history ?? [])
    if (path.endsWith('/messages') && init.method === 'POST') { posted++; return reply(200, { id: `90000000000000000${String(posted)}` }) }
    if (init.method === 'PATCH') return reply(200, {})
    if (path.startsWith('/interactions/')) return reply(204, undefined)
    if (path.startsWith('/webhooks/')) return reply(200, {})
    return reply(404, { message: 'not in fake' })
  }) as unknown as typeof globalThis.fetch
  const transport: DiscordTransport = { fetch, WebSocket: FakeSocket as unknown as DiscordTransport['WebSocket'], wait: async () => undefined }
  const make = () => createDiscord(context, transport)
  const channel = make()
  const settle = async (): Promise<void> => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0)) }
  let seq = 1
  const socket = (): FakeSocket => { const last = FakeSocket.all.at(-1); if (last === undefined) throw new Error('no socket'); return last }
  const dispatch = (t: string, d: object): void => socket().frame({ op: 0, t, s: seq++, d })
  const ready = (): void => { socket().frame({ op: 10, d: { heartbeat_interval: 60_000 } }); dispatch('READY', { session_id: 's1', resume_gateway_url: 'wss://resume.example', user: { id: BOT, username: 'geckit-bot', global_name: 'GeckIt Bot' } }) }
  const message = (id: string, author: string, content: string, extra: object = {}): void => dispatch('MESSAGE_CREATE', { id, channel_id: TEXT, guild_id: GUILD, type: 0, author: { id: author, username: author === ALLOWED ? 'maria' : 'someone', global_name: author === ALLOWED ? 'Maria Ivanova' : 'Ben' }, content, mentions: content.includes(`<@${BOT}>`) ? [{ id: BOT, username: 'geckit-bot' }] : [], ...extra })
  const posts = (): Call[] => calls.filter((one) => one.method === 'POST' && one.path.endsWith('/messages'))
  return { channel, make, settle, socket, dispatch, ready, message, posts, calls, sent, answered, opened, statuses, watchers, store, channels }
}

it('identifies with the message intents, resumes after a drop and stops on a refused intent with the fix', async () => {
  const run = harness()
  await run.channel.start()
  expect(run.socket().url).toBe('wss://gateway.example/?v=10&encoding=json')
  run.ready()
  expect(run.socket().sent[0]).toMatchObject({ op: 2, d: { token: 'test-token', intents: DISCORD_INTENTS } })
  expect(DISCORD_INTENTS).toBe(1 + 512 + 4096 + 32768)
  expect(run.statuses.at(-1)).toEqual(['connected', 'As GeckIt Bot'])
  vi.useFakeTimers()
  run.socket().drop(1006)
  expect(run.statuses.at(-1)).toEqual(['starting', 'Reconnecting to Discord'])
  await vi.advanceTimersByTimeAsync(1_000)
  vi.useRealTimers()
  expect(run.socket().url).toBe('wss://resume.example/?v=10&encoding=json')
  run.socket().frame({ op: 10, d: { heartbeat_interval: 60_000 } })
  expect(run.socket().sent[0]).toMatchObject({ op: 6, d: { token: 'test-token', session_id: 's1' } })
  run.socket().drop(4014)
  expect(run.statuses.at(-1)?.[0]).toBe('failed')
  expect(run.statuses.at(-1)?.[1]).toContain('Message Content Intent')
  const count = FakeSocket.all.length
  await new Promise((resolve) => setTimeout(resolve, 20))
  expect(FakeSocket.all).toHaveLength(count)
  await run.channel.stop()
})

it('opens a Discord thread per mention, keeps each thread and direct message its own Manager thread, and answers where it was asked', async () => {
  const run = harness()
  await run.channel.start()
  run.ready()
  run.message('500000000000000001', ALLOWED, `<@${BOT}> fix the login redirect`)
  await run.settle()
  expect(run.calls.find((one) => one.path.endsWith('/threads'))).toMatchObject({ path: `/channels/${TEXT}/messages/500000000000000001/threads`, body: { name: 'fix the login redirect', auto_archive_duration: 1440 } })
  expect(run.opened.at(-1)).toMatchObject({ key: '500000000000000001', title: 'fix the login redirect', labels: { guild: GUILD, channel: TEXT, thread: '500000000000000001', starter: 'Maria Ivanova', starterId: ALLOWED } })
  expect(run.sent).toEqual([['channel:discord:500000000000000001', { text: 'fix the login redirect', from: 'Maria Ivanova' }]])

  run.message('500000000000000002', ALLOWED, `<@${BOT}> a second, separate task`)
  run.dispatch('MESSAGE_CREATE', { id: '500000000000000003', channel_id: '500000000000000001', guild_id: GUILD, type: 0, author: { id: OTHER, global_name: 'Ben' }, content: 'and keep the tests green', mentions: [] })
  run.dispatch('MESSAGE_CREATE', { id: '500000000000000004', channel_id: 'dm-channel-1', type: 0, author: { id: ALLOWED, global_name: 'Maria Ivanova' }, content: 'what is running?', mentions: [] })
  run.message('500000000000000005', ALLOWED, 'chatter without a mention')
  await run.settle()
  expect(run.sent.map(([id]) => id)).toEqual(['channel:discord:500000000000000001', 'channel:discord:500000000000000002', 'channel:discord:500000000000000001', 'channel:discord:dm:dm-channel-1'])
  expect(run.sent[2]?.[1]).toEqual({ text: 'and keep the tests green', from: 'Ben' })

  run.watchers.get('channel:discord:500000000000000001')?.({ kind: 'answer', text: 'Started a worker for it.' })
  run.watchers.get('channel:discord:dm:dm-channel-1')?.({ kind: 'answer', text: 'Nothing is running.' })
  await run.settle()
  expect(run.posts().slice(-2).map((one) => [one.path, one.body['content'], one.body['allowed_mentions']])).toEqual([
    ['/channels/500000000000000001/messages', 'Started a worker for it.', { parse: [] }],
    ['/channels/dm-channel-1/messages', 'Nothing is running.', { parse: [] }],
  ])
  await run.channel.stop()
})

it('answers only the people allowed, refuses tokens, honours chosen channels and direct messages off', async () => {
  const run = harness({ config: { places: [TEXT], directMessages: false } })
  await run.channel.start()
  run.ready()
  run.message('510000000000000001', STRANGER, `<@${BOT}> run rm -rf`)
  run.message('510000000000000002', ALLOWED, `<@${BOT}> token ${['MTAxMjM0NTY3ODkwMTIzNDU2', 'GaBcDe', 'abcdefghijklmnopqrstuvwxyz0123'].join('.')}`)
  run.dispatch('MESSAGE_CREATE', { id: '510000000000000003', channel_id: ELSEWHERE, guild_id: GUILD, type: 0, author: { id: ALLOWED }, content: `<@${BOT}> hi`, mentions: [{ id: BOT }] })
  run.dispatch('MESSAGE_CREATE', { id: '510000000000000004', channel_id: 'dm-2', type: 0, author: { id: ALLOWED }, content: 'привет', mentions: [] })
  run.dispatch('MESSAGE_CREATE', { id: '510000000000000005', channel_id: 'dm-3', type: 0, author: { id: STRANGER }, content: 'let me in', mentions: [] })
  run.dispatch('MESSAGE_CREATE', { id: '510000000000000006', channel_id: TEXT, guild_id: GUILD, type: 0, author: { id: '777', bot: true }, content: `<@${BOT}> loop`, mentions: [{ id: BOT }] })
  await run.settle()
  expect(run.sent).toEqual([])
  expect(run.posts().map((one) => [one.path.split('/')[2], one.body['content']])).toEqual([
    [TEXT, 'Sorry, I can only take requests from people GeckIt lets me work for.'],
    [TEXT, "That message looks like it holds a token or key, so I didn't take it. Remove it and write again."],
    [ELSEWHERE, "I don't answer in this channel. Choose it for me in GeckIt, Settings, Channels, Discord."],
    ['dm-2', 'Личные сообщения мне выключены. Упомяни меня в канале сервера.'],
    ['dm-3', 'Sorry, I can only take requests from people GeckIt lets me work for.'],
  ])
  await run.channel.stop()
})

it('passes a repeated or replayed event to Manager once, and a known thread only after what it already saw', async () => {
  const run = harness()
  await run.channel.start()
  run.ready()
  run.message('520000000000000001', ALLOWED, `<@${BOT}> deploy preview`)
  run.message('520000000000000001', ALLOWED, `<@${BOT}> deploy preview`)
  await run.settle()
  run.dispatch('MESSAGE_CREATE', { id: '520000000000000003', channel_id: '520000000000000001', guild_id: GUILD, type: 0, author: { id: ALLOWED }, content: 'status?', mentions: [] })
  await run.settle()
  await run.channel.stop()
  const again = run.make()
  await again.start()
  run.ready()
  run.dispatch('MESSAGE_CREATE', { id: '520000000000000002', channel_id: '520000000000000001', guild_id: GUILD, type: 0, author: { id: ALLOWED }, content: 'older, replayed after resume', mentions: [] })
  run.dispatch('MESSAGE_CREATE', { id: '520000000000000003', channel_id: '520000000000000001', guild_id: GUILD, type: 0, author: { id: ALLOWED }, content: 'status?', mentions: [] })
  await run.settle()
  expect(run.sent.map(([, message]) => message.text)).toEqual(['deploy preview', 'status?'])
  expect(run.calls.filter((one) => one.path.endsWith('/threads'))).toHaveLength(1)
  await again.stop()
})

it('asks a question with buttons bound to the person, the thread, the message and the choice', async () => {
  const run = harness()
  await run.channel.start()
  run.ready()
  run.message('530000000000000001', ALLOWED, `<@${BOT}> start the migration`)
  run.message('530000000000000002', ALLOWED, `<@${BOT}> another thread`)
  await run.settle()
  const watch = run.watchers.get('channel:discord:530000000000000001')
  watch?.({ kind: 'decisions', decisions: [{ id: 'native:abc', title: 'Run npm test?', choices: [{ label: 'Allow', value: 'allow' }, { label: 'Refuse', value: 'refuse' }] }] })
  await run.settle()
  const prompt = run.posts().at(-1)
  expect(prompt?.path).toBe('/channels/530000000000000001/messages')
  expect(prompt?.body['content']).toBe('**Run npm test?**\nPress a button or reply with one of: `allow`, `refuse`')
  const rows = prompt?.body['components'] as { components: { custom_id: string; label: string; style: number }[] }[]
  expect(rows[0]?.components.map((one) => [one.label, one.style])).toEqual([['Allow', 1], ['Refuse', 2]])
  const [allow, refuse] = rows[0]?.components.map((one) => one.custom_id) ?? []
  const messageId = `90000000000000000${String(run.posts().length)}`
  const press = (id: string, user: string, custom: string | undefined, channel = '530000000000000001', message = messageId): void => run.dispatch('INTERACTION_CREATE', { id, application_id: '111', type: 3, token: `t-${id}`, channel_id: channel, guild_id: GUILD, data: { custom_id: custom, component_type: 2 }, member: { user: { id: user, global_name: user === ALLOWED ? 'Maria Ivanova' : 'Ben' } }, message: { id: message } })
  const callbacks = (): Call[] => run.calls.filter((one) => one.path.startsWith('/interactions/'))
  press('i1', STRANGER, allow)
  press('i2', ALLOWED, allow, '530000000000000002')
  press('i3', ALLOWED, allow, '530000000000000001', '999999999999999999')
  await run.settle()
  expect(callbacks().map((one) => [one.body['type'], (one.body['data'] as { content: string; flags: number }).content, (one.body['data'] as { flags: number }).flags])).toEqual([
    [4, 'Sorry, I can only take requests from people GeckIt lets me work for.', 64],
    [4, 'This question is already closed.', 64],
    [4, 'This question is already closed.', 64],
  ])
  expect(run.answered).toEqual([])
  press('i4', OTHER, refuse)
  press('i4', OTHER, refuse)
  await run.settle()
  expect(run.answered).toEqual([['channel:discord:530000000000000001', 'native:abc', 'refuse']])
  expect(callbacks().at(-1)?.body).toEqual({ type: 6 })
  expect(run.calls.find((one) => one.path === '/webhooks/111/t-i4/messages/@original')?.body).toMatchObject({ content: '**Run npm test?**\n-# Ben chose Refuse.', components: [] })
  press('i5', ALLOWED, allow)
  await run.settle()
  expect(run.answered).toHaveLength(1)
  expect(callbacks().at(-1)?.body).toMatchObject({ type: 4, data: { content: 'This question is already closed.' } })
  run.dispatch('INTERACTION_CREATE', { id: 'i6', application_id: '111', type: 3, token: 't-i6', channel_id: '530000000000000001', guild_id: GUILD, locale: 'ru', data: { custom_id: allow, component_type: 2 }, member: { user: { id: STRANGER } }, message: { id: messageId } })
  await run.settle()
  expect(callbacks().at(-1)?.body).toMatchObject({ type: 4, data: { content: 'Извини, я принимаю запросы только от тех, для кого мне разрешено работать в GeckIt.' } })
  await run.channel.stop()
})

it('splits long answers, names attached files once, and says what refused a thread', async () => {
  const run = harness()
  await run.channel.start()
  run.ready()
  run.message('540000000000000001', ALLOWED, `<@${BOT}> look at this log`, { attachments: [{ filename: 'trace.txt', size: 4_096, content_type: 'text/plain' }] })
  await run.settle()
  expect(run.sent[0]?.[1].text).toBe('look at this log [file: trace.txt, text/plain, 4 KB]')
  expect(run.posts().at(-1)?.body['content']).toContain('Files are not passed to GeckIt from Discord')
  run.watchers.get('channel:discord:540000000000000001')?.({ kind: 'answer', text: `${'a'.repeat(1_500)}\n${'b'.repeat(1_500)}\n${'c'.repeat(2_500)}` })
  await run.settle()
  const parts = run.posts().slice(-4).map((one) => String(one.body['content']))
  expect(parts.every((one) => one.length <= 2_000)).toBe(true)
  expect(parts.join('').replace(/\s/g, '')).toContain(`${'a'.repeat(1_500)}${'b'.repeat(1_500)}${'c'.repeat(2_500)}`)
  const blocked = harness({ threadFails: true })
  await blocked.channel.start()
  blocked.ready()
  blocked.message('540000000000000002', ALLOWED, `<@${BOT}> help`)
  await blocked.settle()
  expect(blocked.sent).toEqual([])
  expect(blocked.posts().at(-1)?.body['content']).toBe("I couldn't start a thread for this: Discord POST /channels/410000000000000001/messages/540000000000000002/threads: Missing Permissions (the bot lacks a permission here). Give me Create Public Threads and Send Messages in Threads in this channel.")
  await run.channel.stop()
  await blocked.channel.stop()
})

it('reads earlier messages of an existing thread for Manager and says Manager is unavailable when it is', async () => {
  const run = harness({ history: [
    { id: '550000000000000003', type: 0, author: { id: STRANGER, global_name: 'Ben' }, content: 'it started after 14:00', mentions: [] },
    { id: '550000000000000002', type: 0, author: { id: BOT }, content: 'my own answer', mentions: [] },
  ] })
  run.channels['550000000000000001'] = { id: '550000000000000001', type: 11, parent_id: TEXT, guild_id: GUILD }
  await run.channel.start()
  run.ready()
  run.dispatch('MESSAGE_CREATE', { id: '550000000000000004', channel_id: '550000000000000001', guild_id: GUILD, type: 0, author: { id: ALLOWED, global_name: 'Maria Ivanova' }, content: `<@${BOT}> can you look?`, mentions: [{ id: BOT }] })
  await run.settle()
  expect(run.sent).toEqual([['channel:discord:550000000000000001', { from: 'Maria Ivanova', text: `Earlier in this Discord thread:\nBen (${new Date(snowflakeAt('550000000000000003')).toISOString().slice(0, 16).replace('T', ' ')} UTC): it started after 14:00\n\nMessage to you:\ncan you look?` }]])
  const closed = harness({ manager: false })
  await closed.channel.start()
  closed.ready()
  closed.message('550000000000000009', ALLOWED, `<@${BOT}> hi`)
  await closed.settle()
  expect(closed.posts().at(-1)?.body['content']).toBe("I can't answer in Discord yet. Allow me in GeckIt, Settings, Channels, Discord.")
  await run.channel.stop()
  await closed.channel.stop()
})

it('waits out a rate limit as Discord asks and reports a refused token plainly', async () => {
  const waited: number[] = []
  let tries = 0
  const fetch = (async () => { tries++; return tries === 1 ? { status: 429, ok: false, json: async () => ({ retry_after: 1.5, global: false }) } : { status: 200, ok: true, json: async () => ({ id: 'ok' }) } }) as unknown as typeof globalThis.fetch
  expect(await discordApi({ fetch, WebSocket: FakeSocket as never, wait: async (ms) => { waited.push(ms) } }, 't', 'GET', '/x')).toEqual({ id: 'ok' })
  expect(waited).toEqual([1_500])
  const refused = (async () => ({ status: 401, ok: false, json: async () => ({ message: '401: Unauthorized', code: 0 }) })) as unknown as typeof globalThis.fetch
  await expect(discordApi({ fetch: refused, WebSocket: FakeSocket as never }, 't', 'GET', '/x')).rejects.toThrow('Discord did not accept the bot token.')
})

it('checks a bot for Set up: identity, intent, servers, channels, people and the invite link', async () => {
  const routes: { [path: string]: unknown } = {
    '/users/@me': { id: BOT, username: 'geckit-bot', global_name: 'GeckIt Bot', avatar: 'abc' },
    '/oauth2/applications/@me': { id: '111', flags: 1 << 19 },
    '/users/@me/guilds?limit=200': [{ id: GUILD, name: 'TwinsAI', icon: null }],
    [`/guilds/${GUILD}/channels`]: [{ id: TEXT, type: 0, name: 'geckit' }, { id: '2', type: 2, name: 'voice' }, { id: '3', type: 15, name: 'help' }, { id: '4', type: 4, name: 'category' }],
    [`/users/${ALLOWED}`]: { id: ALLOWED, username: 'maria', global_name: 'Maria Ivanova' },
  }
  const fetch = (async (url: string) => {
    const found = routes[url.replace('https://discord.com/api/v10', '')]
    return found === undefined ? { status: 404, ok: false, json: async () => ({ message: 'Unknown User' }) } : { status: 200, ok: true, json: async () => found }
  }) as unknown as typeof globalThis.fetch
  const transport = { fetch, WebSocket: FakeSocket as never, wait: async () => undefined }
  const setup = { secret: () => 'token', config: () => ({ allow: [ALLOWED] }) }
  expect(await inspectDiscord(setup, { people: [STRANGER, 'not-an-id'] }, transport)).toEqual({
    token: 'ok',
    bot: { id: BOT, name: 'GeckIt Bot', avatar: `https://cdn.discordapp.com/avatars/${BOT}/abc.png?size=64` },
    application: '111',
    invite: `https://discord.com/oauth2/authorize?client_id=111&scope=bot&permissions=${DISCORD_INVITE_PERMISSIONS}`,
    messageContent: true,
    servers: [{ id: GUILD, name: 'TwinsAI', channels: [{ id: TEXT, name: 'geckit', kind: 'text' }, { id: '3', name: 'help', kind: 'forum' }] }],
    people: [{ id: STRANGER, found: false }, { id: ALLOWED, found: true, name: 'Maria Ivanova', handle: 'maria' }],
  })
  expect(DISCORD_INVITE_PERMISSIONS).toBe('309237713920')
  const refused = (async () => ({ status: 401, ok: false, json: async () => ({}) })) as unknown as typeof globalThis.fetch
  expect(await inspectDiscord(setup, {}, { fetch: refused, WebSocket: FakeSocket as never })).toEqual({ token: 'refused' })
  expect(await inspectDiscord({ secret: () => undefined, config: () => ({}) }, {})).toEqual({ token: 'missing' })
})

it('cuts text at line breaks and reads pasted IDs and mentions', () => {
  expect(chunks('short')).toEqual(['short'])
  expect(chunks(`${'x'.repeat(10)}\n${'y'.repeat(10)}`, 15)).toEqual(['x'.repeat(10), 'y'.repeat(10)])
  expect(discordId(` <@!${ALLOWED}> `)).toBe(ALLOWED)
  expect(discordId('maria')).toBeUndefined()
})

it('reconnects when a heartbeat goes unanswered and identifies afresh after a session Discord ended', async () => {
  const run = harness()
  await run.channel.start()
  vi.useFakeTimers()
  run.ready()
  const first = run.socket()
  await vi.advanceTimersByTimeAsync(60_000)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(first.closed).toBe(4000)
  expect(run.statuses.at(-1)).toEqual(['starting', 'Reconnecting to Discord'])
  await vi.advanceTimersByTimeAsync(1_000)
  expect(run.socket()).not.toBe(first)
  expect(run.socket().url).toBe('wss://resume.example/?v=10&encoding=json')
  run.socket().drop(4009)
  await vi.advanceTimersByTimeAsync(2_000)
  vi.useRealTimers()
  expect(run.socket().url).toBe('wss://gateway.example/?v=10&encoding=json')
  run.socket().frame({ op: 10, d: { heartbeat_interval: 60_000 } })
  expect(run.socket().sent[0]).toMatchObject({ op: 2 })
  await run.channel.stop()
})

it('binds buttons to the part that carries them and refuses a press outside the chosen channels', async () => {
  const run = harness()
  await run.channel.start()
  run.ready()
  run.message('560000000000000001', ALLOWED, `<@${BOT}> deploy`)
  await run.settle()
  const before = run.posts().length
  const title = `${'t'.repeat(1_400)}\n${'u'.repeat(99)}`
  run.watchers.get('channel:discord:560000000000000001')?.({ kind: 'decisions', decisions: [{ id: 'native:long', title, choices: Array.from({ length: 12 }, (_, index) => ({ label: `Choice ${String(index)}`, value: `choice-${'v'.repeat(40)}-${String(index)}` })) }] })
  await run.settle()
  const withButtons = run.posts().findIndex((one) => one.body['components'] !== undefined)
  expect(withButtons).toBe(run.posts().length - 1)
  expect(run.posts().length - before).toBe(2)
  expect((run.store.get('prompts:560000000000000001') as { message: string }[])[0]?.message).toBe(`90000000000000000${String(run.posts().length)}`)
  const custom = ((run.posts().at(-1)?.body['components'] as { components: { custom_id: string }[] }[])[0]?.components[0]?.custom_id) ?? ''
  const fenced = harness({ config: { places: [ELSEWHERE] } })
  await fenced.channel.start()
  fenced.ready()
  fenced.dispatch('INTERACTION_CREATE', { id: 'i9', application_id: '111', type: 3, token: 't-i9', channel_id: TEXT, guild_id: GUILD, data: { custom_id: custom, component_type: 2 }, member: { user: { id: ALLOWED } }, message: { id: '1' } })
  await fenced.settle()
  expect(fenced.calls.find((one) => one.path === '/interactions/i9/t-i9/callback')?.body).toMatchObject({ type: 4, data: { content: "I don't answer in this channel. Choose it for me in GeckIt, Settings, Channels, Discord.", flags: 64 } })
  expect(fenced.answered).toEqual([])
  await run.channel.stop()
  await fenced.channel.stop()
})

it('checks a pasted token without the saved one and keeps interaction tokens out of errors', async () => {
  const used: string[] = []
  const fetch = (async (url: string, init: { headers: { authorization: string } }) => {
    used.push(init.headers.authorization)
    return url.endsWith('/users/@me') ? { status: 401, ok: false, json: async () => ({}) } : { status: 400, ok: false, json: async () => ({ message: 'Invalid Webhook Token' }) }
  }) as unknown as typeof globalThis.fetch
  const transport = { fetch, WebSocket: FakeSocket as never, wait: async () => undefined }
  expect(await inspectDiscord({ secret: () => 'saved-token', config: () => ({}) }, { token: ' pasted-token ' }, transport)).toEqual({ token: 'refused' })
  expect(used).toEqual(['Bot pasted-token'])
  await expect(discordApi(transport, 't', 'PATCH', '/webhooks/111/secret-interaction-token/messages/@original')).rejects.toThrow('Discord PATCH /webhooks/111/***/messages/@original: Invalid Webhook Token')
})
