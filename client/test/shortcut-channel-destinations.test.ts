import { expect, it } from 'vitest'
import { createDiscord, type DiscordTransport } from '../src/main/channels/discord'
import { createSlack, type SlackTransport } from '../src/main/channels/slack'
import type { ChannelContext, ChannelEvent, ChannelThread, ChannelShortcutPublication, Json } from '../src/main/channels/channel-api'

class Socket {
  static latest: Socket | undefined
  listener: ((message: { readonly data: string }) => void) | undefined
  constructor(_url: string) { Socket.latest = this }
  addEventListener(type: 'message' | 'close', listener: never): void { if (type === 'message') this.listener = listener }
  send(_text: string): void {}
  close(): void {}
  event(frame: object): void { this.listener?.({ data: JSON.stringify(frame) }) }
}

interface Call { readonly path: string; readonly method: string; readonly body: Json }
interface Options { readonly refuse?: boolean; readonly ambiguous?: boolean; readonly mismatch?: boolean; readonly text?: string; readonly manyGuilds?: boolean }

function fixture(transport: 'discord' | 'slack', options: Options = {}) {
  const store = new Map<string, Json>()
  const routes = new Map<string, string>()
  const sent: { readonly id: string; readonly text: string }[] = []
  const watchers = new Map<string, (event: ChannelEvent) => void>()
  const bound: ChannelThread[] = []
  const calls: Call[] = []
  let count = 0
  const context: ChannelContext = {
    id: transport === 'discord' ? 'channel:discord' : 'channel:slack',
    log: { path: '', write: () => undefined },
    config: () => ({ allow: ['301234567890123456'] }),
    secret: () => 'fixture-token',
    sealed: { available: () => false, read: () => undefined, write: () => undefined },
    store: { get: (key) => store.get(key), set: (key, value) => { if (value === undefined) store.delete(key); else store.set(key, value) } },
    status: () => undefined,
    projects: () => [], providers: () => [], employees: () => [],
    conversations: {
      manager: (place) => place === undefined ? undefined : routes.get(place.key),
      label: () => undefined, start: async () => 'unused',
      send: async (id, message) => { sent.push({ id, text: message.text }); return id },
      get: () => undefined, list: () => [], items: async () => [],
      watch: (id, listener) => { watchers.set(id, listener); return () => { watchers.delete(id) } },
      answer: async () => false, stop: async () => undefined,
    },
  }
  const nativeFetch: typeof fetch = async (input, init) => {
    const url = String(input)
    const path = url.replace('https://discord.com/api/v10', '').replace('https://slack.com/api/', '')
    const body: Json = typeof init?.body === 'string' && init.body.startsWith('{') ? JSON.parse(init.body) as Json : {}
    calls.push({ path, method: init?.method ?? 'GET', body })
    const response = (json: Json, status = 200): Response => new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } })
    if (path === '/users/@me') return response({ id: '100000000000000001' })
    if (path === '/gateway/bot') return response({ url: 'wss://fixture' })
    if (path === '/users/@me/guilds?limit=200') return response(options.manyGuilds ? Array.from({ length: 200 }, (_, index) => ({ id: String(400000000000000001n + BigInt(index)), name: `Fixture ${String(index)}` })) : [{ id: '400000000000000001', name: 'Fixture' }])
    if (path === '/users/@me/guilds?limit=200&after=400000000000000200') return response([{ id: '400000000000000201', name: 'Last server' }])
    if (options.manyGuilds && path === '/guilds/400000000000000201/channels') return response([{ id: '410000000000000201', type: 0, name: 'last-general' }])
    if (options.manyGuilds && /^\/guilds\/\d+\/channels$/.test(path)) return response([])
    if (path === '/guilds/400000000000000001/channels') return response([{ id: '410000000000000001', type: 0, name: 'general' }, { id: '410000000000000002', type: 15, name: 'forum' }])
    if (path === '/channels/410000000000000001') return response({ id: '410000000000000001', type: 0, guild_id: '400000000000000001' })
    if (/^\/channels\/5\d+$/.test(path)) return response({ id: path.split('/')[2] ?? '', type: 11, parent_id: '410000000000000001', guild_id: '400000000000000001' })
    if (path === '/channels/410000000000000001/threads') {
      if (options.ambiguous) return response({}, 503)
      if (options.refuse) return response({}, 403)
      count++
      return response({ id: `50000000000000000${String(count)}`, type: 11, parent_id: options.mismatch ? 'wrong' : '410000000000000001' })
    }
    if (path.endsWith('/messages') && init?.method === 'POST') return response({ id: '600000000000000001', channel_id: options.mismatch ? 'wrong' : path.split('/')[2] ?? '' })
    if (path.includes('/messages?')) return response([])
    if (path.includes('/reactions/')) return new Response(null, { status: 204 })
    if (path === 'auth.test') return response({ ok: true, user_id: 'UBOT', team_id: 'TEAM' })
    if (path === 'apps.connections.open') return response({ ok: true, url: 'wss://fixture' })
    if (path === 'conversations.list') return response({ ok: true, channels: [{ id: 'CGENERAL', name: 'general', is_member: true }, { id: 'COTHER', name: 'other', is_member: false }] })
    if (path === 'users.info') return response({ ok: true, user: { name: 'Alex', team_id: String(init?.body).includes('USTRANGER') ? 'OTHER' : 'TEAM', is_bot: false } })
    if (path === 'conversations.replies') return response({ ok: true, messages: [] })
    if (path === 'chat.getPermalink') return response({ ok: true, permalink: 'https://fixture/thread' })
    if (path.startsWith('reactions.')) return response({ ok: true })
    if (path === 'chat.postMessage') {
      if (options.ambiguous) return response({ ok: false, error: 'internal_error' }, 503)
      if (options.refuse) return response({ ok: false, error: 'channel_not_found' })
      count++
      return response({ ok: true, channel: options.mismatch ? 'WRONG' : 'CGENERAL', ts: `1700000000.${String(count).padStart(6, '0')}` })
    }
    throw new Error(`Unexpected fixture request ${path}`)
  }
  const make = () => transport === 'discord' ? createDiscord(context, { fetch: nativeFetch, WebSocket: Socket, wait: async () => undefined } satisfies DiscordTransport) : createSlack(context, { fetch: nativeFetch, WebSocket: Socket } satisfies SlackTransport)
  const channel = make()
  const bind = (place: ChannelThread): string => { bound.push(place); const id = `manager-run-${String(bound.length)}`; routes.set(place.key, id); return id }
  const publish = (runId: string, beforeSend?: ChannelShortcutPublication['beforeSend']) => channel.publishShortcut!({ ...(beforeSend === undefined ? {} : { beforeSend }), runId, destination: transport === 'discord' ? '410000000000000001' : 'CGENERAL', title: 'Daily result', text: options.text ?? 'Completed original task.', bind })
  const settle = async () => { for (let i = 0; i < 8; i++) await new Promise<void>((resolve) => setTimeout(resolve, 0)) }
  return { channel, make, publish, bound, sent, watchers, calls, store, settle }
}

for (const transport of ['discord', 'slack'] as const) {
  it(`${transport}: publishes isolated native result routes, resumes authorized unmentioned replies and restores routes`, async () => {
    const run = fixture(transport)
    await run.channel.start()
    expect(await run.channel.destinations!()).toEqual([expect.objectContaining({ name: expect.stringContaining('general'), model: 'thread' })])
    const first = await run.publish('run-one')
    const second = await run.publish('run-two')
    expect(first.thread).not.toBe(second.thread)
    expect(run.bound.map((one) => one.key)).toEqual([first.thread, second.thread])
    expect([...run.watchers.keys()]).toEqual(['manager-run-1', 'manager-run-2'])
    const reply = () => {
      if (transport === 'discord') Socket.latest?.event({ op: 0, t: 'MESSAGE_CREATE', d: { id: '700000000000000001', channel_id: first.thread, guild_id: '400000000000000001', author: { id: '301234567890123456' }, content: 'Continue original task', mentions: [] } })
      else Socket.latest?.event({ type: 'events_api', payload: { event: { type: 'message', channel: 'CGENERAL', thread_ts: first.thread.split(':').at(-1), ts: '1700000001.000001', user: 'UALEX', text: 'Continue original task' } } })
    }
    reply()
    await run.settle()
    expect(run.sent).toEqual([{ id: 'manager-run-1', text: 'Continue original task' }])
    reply()
    await run.settle()
    expect(run.sent).toHaveLength(1)
    await run.channel.stop()
    const restored = run.make()
    await restored.start()
    expect([...run.watchers.keys()]).toEqual(['manager-run-1', 'manager-run-2'])
    if (transport === 'discord') Socket.latest?.event({ op: 0, t: 'MESSAGE_CREATE', d: { id: '700000000000000002', channel_id: first.thread, guild_id: '400000000000000001', author: { id: '301234567890123456' }, content: 'Continue after restart', mentions: [] } })
    else Socket.latest?.event({ type: 'events_api', payload: { event: { type: 'message', channel: 'CGENERAL', thread_ts: first.thread.split(':').at(-1), ts: '1700000002.000001', user: 'UALEX', text: 'Continue after restart' } } })
    await run.settle()
    expect(run.sent.at(-1)).toEqual({ id: 'manager-run-1', text: 'Continue after restart' })
    run.watchers.get('manager-run-1')?.({ kind: 'answer', text: 'Follow-up result for the original run.' })
    await run.settle()
    if (transport === 'discord') expect(run.calls.at(-1)).toMatchObject({ path: `/channels/${first.thread}/messages`, body: { content: 'Follow-up result for the original run.', allowed_mentions: { parse: [] } } })
    else expect(run.calls.at(-1)).toMatchObject({ path: 'chat.postMessage', body: { channel: 'CGENERAL', thread_ts: first.thread.split(':').at(-1), text: 'Follow-up result for the original run.' } })
    await restored.stop()
  })

  it(`${transport}: distinguishes definitive refusal, uncertain write and mismatched receipts without retry`, async () => {
    for (const options of [{ refuse: true }, { ambiguous: true }, { mismatch: true }]) {
      const run = fixture(transport, options)
      await run.channel.start()
      await expect(run.publish('run-one')).rejects.toMatchObject({ uncertain: !('refuse' in options) })
      const writes = run.calls.filter((one) => transport === 'discord' ? one.path.endsWith('/threads') : one.path === 'chat.postMessage')
      expect(writes).toHaveLength(1)
      expect(run.bound).toHaveLength(0)
      await run.channel.stop()
    }
  })
}

it('Discord rejects unauthorized unmentioned replies in scheduled threads', async () => {
  const run = fixture('discord')
  await run.channel.start()
  const receipt = await run.publish('run-one')
  Socket.latest?.event({ op: 0, t: 'MESSAGE_CREATE', d: { id: '700000000000000001', channel_id: receipt.thread, guild_id: '400000000000000001', author: { id: '309999999999999999' }, content: 'Continue original task', mentions: [] } })
  await run.settle()
  expect(run.sent).toEqual([])
  await run.channel.stop()
})

it('Slack rejects unauthorized workspace members in scheduled threads', async () => {
  const run = fixture('slack')
  await run.channel.start()
  const receipt = await run.publish('run-one')
  Socket.latest?.event({ type: 'events_api', payload: { event: { type: 'message', channel: 'CGENERAL', thread_ts: receipt.thread.split(':').at(-1), ts: '1700000001.000001', user: 'USTRANGER', text: 'Continue original task' } } })
  await run.settle()
  expect(run.sent).toEqual([])
  await run.channel.stop()
})

for (const transport of ['discord', 'slack'] as const) {
  it(`${transport}: rechecks the host connection before every native write and stops remaining chunks`, async () => {
    const run = fixture(transport, { text: 'x'.repeat(80_000) })
    await run.channel.start()
    let checks = 0
    await expect(run.publish('run-one', () => { checks++; if (checks === 3) throw new Error('Connection changed.') })).rejects.toThrow('Connection changed.')
    const writes = run.calls.filter((one) => transport === 'discord' ? one.method === 'POST' : one.path === 'chat.postMessage')
    expect(checks).toBe(3)
    expect(writes).toHaveLength(2)
    expect(run.bound).toHaveLength(1)
    await run.channel.stop()
  })
}

it('Discord discovers destinations after the first 200 guilds', async () => {
  const run = fixture('discord', { manyGuilds: true })
  await run.channel.start()
  expect(await run.channel.destinations!()).toEqual([{ id: '410000000000000201', name: 'Last server / #last-general (410000000000000201)', model: 'thread' }])
  expect(run.calls.some((one) => one.path === '/users/@me/guilds?limit=200&after=400000000000000200')).toBe(true)
  await run.channel.stop()
})
