import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, it, vi } from 'vitest'

vi.mock('../src/core/platform', () => ({ dataDirectory: () => process.env['GECKIT_CHANNEL_TEST_HOME'], corePlatform: () => ({}) }))

import { Channels } from '../src/main/channels/channels'
import { flushPluginLogs } from '../src/main/sessions/plugin-logs'
import type { ChannelsDeps } from '../src/main/channels/channels'
import type { ChannelContext, ChannelEvent } from '../src/main/channels/channel-api'
import { channelManifest, loadChannel } from '../src/main/channels/libraries'
import type { CoreEvent } from '../src/core/events'
import type { ChatSession, Settings } from '../src/shared/api'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { ManagerHistoryBoundary, ManagerView } from '../src/shared/manager'
import type { ChannelView } from '../src/shared/channels'
import { TelegramAttachments } from '../src/main/telegram-attachments'
import type { ChannelFileSender } from '../src/main/channels/channel-files'
import { SLACK_MODULE } from '../src/main/channels/slack'
import { after, createSlack } from '../src/main/channels/slack'
import type { SlackTransport } from '../src/main/channels/slack'

const folders: string[] = []
afterEach(async () => {
  await Promise.all(((globalThis as { channelTest?: Seen }).channelTest?.contexts ?? []).map((context) => flushPluginLogs(context.log.path)))
  delete process.env['GECKIT_CHANNEL_TEST_HOME']
  delete (globalThis as { channelTest?: Seen }).channelTest
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })))
})

const manifest = { apiVersion: 1, kind: 'channel', entry: 'index.mjs', channel: { id: 'channel:echo', name: 'Echo', icon: 'chat' }, config: [{ key: 'token', label: 'Token', type: 'secret', required: true }, { key: 'allow', label: 'Allowed people', type: 'list', default: [] }] }
const library = `export function create(context) {
  const seen = globalThis.channelTest ??= { contexts: [], stopped: 0 }
  seen.contexts.push(context)
  return { start: async () => { context.status('connected', 'Listening') }, stop: async () => { seen.stopped += 1 } }
}`

const echo = (channels: Channels): ChannelView | undefined => channels.view().channels.find((one) => one.id === 'channel:echo')

interface Seen { readonly contexts: ChannelContext[]; stopped: number }
const seen = (): Seen => (globalThis as unknown as { channelTest: Seen }).channelTest

interface FakeThread { readonly id: string; readonly channel: string; labels: { [key: string]: string }; from?: string; title?: string }

async function setup(attachments?: TelegramAttachments): Promise<{ channels: Channels; deps: ChannelsDeps; settings: () => Settings; emit: (event: CoreEvent) => void; managerSent: string[]; answered: string[]; sessionsSent: unknown[]; threads: Map<string, FakeThread>; respond: (text: string, thread: string) => void; closed: Map<string, string | undefined>; labelled: Map<string, unknown> }> {
  const home = await mkdtemp(join(tmpdir(), 'geckit-channels-'))
  folders.push(home)
  process.env['GECKIT_CHANNEL_TEST_HOME'] = home
  const path = join(home, 'channel-libraries', 'channel-echo')
  await mkdir(path, { recursive: true })
  await writeFile(join(path, 'geckit-plugin.json'), JSON.stringify(manifest))
  await writeFile(join(path, 'index.mjs'), library)
  let settings: Settings = { ...DEFAULT_SETTINGS, projects: ['/work/app', '/work/private'], chatProviders: ['claude'] }
  const listeners = new Set<(event: CoreEvent) => void>()
  const managerSent: string[] = []
  const answered: string[] = []
  const sessionsSent: unknown[] = []
  const conversations: ChatSession[] = []
  const threads = new Map<string, FakeThread>()
  const responses = new Set<(text: string, origin: { thread?: string; session: string; workers: readonly string[] }) => void>()
  const closed = new Map<string, string | undefined>()
  const labelled = new Map<string, unknown>()
  const managerView = { state: 'idle', session: { id: 'manager-1', root: '/home', title: 'Manager', state: 'idle' }, decisions: [{ id: 'decision-1', title: 'Start?', choices: [{ label: 'Yes', value: 'yes' }], thread: 'channel:echo:chat-7' }], get threads() { return [...threads.values()].map((one) => ({ id: one.id, title: one.title ?? 'Echo', labels: one.labels, state: 'idle', at: 0, owns: [] })) } } as unknown as ManagerView
  const deps: ChannelsDeps = {
    directory: home,
    ...(attachments === undefined ? {} : { attachments }),
    vault: { available: () => true, encrypt: (text) => Buffer.from(text).reverse(), decrypt: (bytes) => Buffer.from(bytes).reverse().toString() },
    settings: () => settings,
    save: (change) => { settings = { ...settings, ...change } },
    sessions: {
      send: async (message) => {
        sessionsSent.push(message)
        if (message.session !== undefined) return message.session
        const id = `conversation-${String(conversations.length + 1)}`
        conversations.push({ id, root: message.root, title: 'New', state: 'working', mode: message.mode } as ChatSession)
        return id
      },
      answer: async (id, card, answer) => { answered.push(`${id}:${card}:${String(answer)}`); return true },
      stop: () => undefined,
      items: async () => [],
    },
    conversations: () => [...conversations, { id: 'not-mine', root: '/work/app', title: 'Other', state: 'idle', mode: 'auto' } as ChatSession],
    labelConversation: (id, labels) => { labelled.set(id, labels) },
    manager: {
      enabled: () => true,
      send: async (text, _source, _id, _workers, _authorized, _attachments, _requests, thread) => { managerSent.push(`${thread}|${text}`); return 'manager-1' },
      thread: (open) => {
        const id = `${open.channel}:${open.key}`
        const known = threads.get(id) ?? { id, channel: open.channel, labels: {} }
        threads.set(id, { ...known, labels: { ...known.labels, ...open.labels }, ...(open.from === undefined ? {} : { from: open.from }), ...(open.title === undefined ? {} : { title: open.title }) })
        return id
      },
      label: (thread, labels) => { const known = threads.get(thread); if (known !== undefined) known.labels = { ...known.labels, ...labels } },
      threadOf: (session) => session === 'manager-2' ? 'channel:echo:chat-7' : undefined,
      threadRecord: (thread) => threads.get(thread),
      close: (channel, reason) => { closed.set(channel, reason) },
      onResponse: (listener) => { responses.add(listener); return () => responses.delete(listener) },
      inspect: async (id) => ({ id, items: [] }),
      answer: async (id, choice) => { answered.push(`manager:${id}:${choice}`) },
      answerCard: async () => false,
    },
    managerView: () => managerView,
    employees: () => [],
    projectName: (root) => root.split('/').at(-1) ?? root,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
    changed: () => undefined,
  }
  const channels = new Channels(deps)
  await channels.start()
  return { channels, deps, settings: () => settings, emit: (event) => { for (const listener of listeners) listener(event) }, managerSent, answered, sessionsSent, threads, respond: (text, thread) => { for (const listener of responses) listener(text, { thread, session: 'manager-2', workers: [] }) }, closed, labelled }
}

it('reads a channel manifest and refuses a provider manifest', async () => {
  const home = await mkdtemp(join(tmpdir(), 'geckit-channel-manifest-'))
  folders.push(home)
  await writeFile(join(home, 'geckit-plugin.json'), JSON.stringify(manifest))
  expect((await channelManifest(home)).fields.map((one) => one.key)).toEqual(['token', 'allow'])
  await writeFile(join(home, 'geckit-plugin.json'), JSON.stringify({ apiVersion: 1, entry: 'index.mjs', provider: { id: 'plugin:x' } }))
  await expect(channelManifest(home)).rejects.toThrow('not a GeckIt channel library')
})

it('registers an installed library off and asks for its required secret before starting it', async () => {
  const { channels } = await setup()
  expect(channels.view().channels).toMatchObject([{ id: 'channel:slack', state: 'off', builtIn: true }, { id: 'channel:discord', state: 'off', builtIn: true }, { id: 'channel:echo', state: 'off' }])
  await channels.configure('channel:echo', { enabled: true })
  expect(echo(channels)).toMatchObject({ state: 'setup', says: 'Fill in Token.' })
  expect((globalThis as { channelTest?: unknown }).channelTest).toBeUndefined()
  await channels.configure('channel:echo', { secrets: { token: 'xoxb-1' } })
  expect(echo(channels)).toMatchObject({ state: 'connected', says: 'Listening', secrets: ['token'] })
  expect(seen().contexts[0]?.secret('token')).toBe('xoxb-1')
  await channels.dispose()
})

it('starts conversations only in allowed folders and reaches only its own', async () => {
  const { channels, sessionsSent } = await setup()
  await channels.configure('channel:echo', { enabled: true, projects: ['/work/app'], secrets: { token: 't' } })
  const context = seen().contexts[0]
  if (context === undefined) throw new Error('not started')
  await expect(context.conversations.start({ root: '/work/private', text: 'hi' })).rejects.toThrow('may not start conversations in that folder')
  await expect(context.conversations.start({ root: '/work/app', text: 'hi', provider: 'codex' })).rejects.toThrow('not enabled')
  const id = await context.conversations.start({ root: '/work/app', text: 'hi' })
  expect(context.conversations.list().map((one) => one.id)).toEqual([id])
  await context.conversations.send(id, { text: 'more' })
  expect(sessionsSent.at(-1)).toMatchObject({ session: id, root: '/work/app', text: 'more' })
  await expect(context.conversations.send('not-mine', { text: 'x' })).rejects.toThrow('did not start that conversation')
  await expect(context.conversations.items('not-mine')).rejects.toThrow('did not start that conversation')
  expect(context.conversations.get('not-mine')).toBeUndefined()
  await channels.dispose()
})

it('gives each place its own Manager thread only when the channel is allowed to', async () => {
  const { channels, managerSent, answered, threads, closed } = await setup()
  await channels.configure('channel:echo', { enabled: true, secrets: { token: 't' } })
  expect(closed.get('channel:echo')).toBe('Echo may no longer talk to Manager. Allow it in Settings, Channels to reply in this thread.')
  const first = seen().contexts[0]
  expect(first?.conversations.manager({ key: 'chat-7' })).toBeUndefined()
  await expect(first?.conversations.send('manager-1', { text: 'x' })).rejects.toThrow('did not start that conversation')
  await channels.configure('channel:echo', { manager: true })
  expect(closed.get('channel:echo')).toBeUndefined()
  expect(seen().stopped).toBe(1)
  const context = seen().contexts[1]
  if (context === undefined) throw new Error('not restarted')
  expect(() => first?.conversations.manager()).toThrow('This channel was stopped')
  const thread = context.conversations.manager({ key: 'chat-7', title: 'Release', labels: { chat: '7', starter: 'Alex' } })
  expect(thread).toBe('channel:echo:chat-7')
  expect(context.conversations.manager({ key: 'chat-8' })).toBe('channel:echo:chat-8')
  expect(context.conversations.manager()).toBe('channel:echo:default')
  expect(threads.get('channel:echo:chat-7')?.labels).toEqual({ chat: '7', starter: 'Alex' })
  await context.conversations.send('channel:echo:chat-7', { text: 'Plan the release', from: 'Alex' })
  expect(managerSent).toEqual(['channel:echo:chat-7|[Via Echo, from Alex]\nPlan the release'])
  expect(threads.get('channel:echo:chat-7')?.from).toBe('Alex')
  await expect(context.conversations.send('manager-1', { text: 'x' })).rejects.toThrow('did not start that conversation')
  expect(await context.conversations.answer('channel:echo:chat-7', 'decision-1', 'yes')).toBe(true)
  expect(answered).toEqual(['manager:decision-1:yes'])
  await expect(context.conversations.stop('channel:echo:chat-7')).rejects.toThrow('Pause Manager')
  await channels.configure('channel:echo', { enabled: false })
  expect(closed.get('channel:echo')).toBe('Echo is off. Turn it on in Settings, Channels to reply in this thread.')
  await channels.dispose()
})

it('tells a watched thread its answers, items and decisions, and nothing of other threads', async () => {
  const { channels, emit, respond } = await setup()
  await channels.configure('channel:echo', { enabled: true, manager: true, secrets: { token: 't' } })
  const context = seen().contexts[0]
  if (context === undefined) throw new Error('not started')
  const thread = context.conversations.manager({ key: 'chat-7' }) ?? ''
  const other = context.conversations.manager({ key: 'chat-8' }) ?? ''
  const heard: ChannelEvent[] = []
  const elsewhere: ChannelEvent[] = []
  context.conversations.watch(thread, (event) => heard.push(event))
  context.conversations.watch(other, (event) => elsewhere.push(event))
  respond('Release planned.', thread)
  emit({ name: 'manager:items', args: [{ id: 'manager-2', items: [{ kind: 'theirs', id: 'a', text: 'Release planned.' }] }] })
  emit({ name: 'manager:view', args: [{ state: 'idle', config: { provider: 'claude' }, decisions: [{ id: 'decision-1', title: 'Start?', choices: [], thread }], threads: [{ id: thread, title: 'Echo', labels: {}, state: 'asks', at: 0, owns: [] }, { id: other, title: 'Echo', labels: {}, state: 'idle', at: 0, owns: [] }] } as unknown as ManagerView] })
  expect(heard.map((one) => one.kind)).toEqual(['answer', 'items', 'decisions', 'status', 'state'])
  expect(heard[3]).toEqual({ kind: 'status', activity: { manager: 'Waiting for your answer above.', ending: 'Waiting for your answer above.', active: false, workers: [] } })
  expect(heard[0]).toEqual({ kind: 'answer', text: 'Release planned.' })
  expect(elsewhere.map((one) => one.kind)).toEqual(['status', 'state'])
  await channels.dispose()
})

it('keeps labels on the conversations a channel starts', async () => {
  const { channels, labelled } = await setup()
  await channels.configure('channel:echo', { enabled: true, projects: ['/work/app'], secrets: { token: 't' } })
  const context = seen().contexts[0]
  if (context === undefined) throw new Error('not started')
  const id = await context.conversations.start({ root: '/work/app', text: 'hi', labels: { starter: 'Maria', thread: '1730.42' } })
  expect(labelled.get(id)).toEqual({ starter: 'Maria', thread: '1730.42' })
  context.conversations.label(id, { thread: '' })
  expect(labelled.get(id)).toEqual({ thread: '' })
  expect(() => context.conversations.label('not-mine', { a: 'b' })).toThrow('did not start that conversation')
  await channels.dispose()
})

it('passes items, notices and state of watched conversations, and stops when turned off', async () => {
  const { channels, emit } = await setup()
  await channels.configure('channel:echo', { enabled: true, projects: ['/work/app'], secrets: { token: 't' } })
  const context = seen().contexts[0]
  if (context === undefined) throw new Error('not started')
  const id = await context.conversations.start({ root: '/work/app', text: 'hi' })
  const heard: ChannelEvent[] = []
  context.conversations.watch(id, (event) => heard.push(event))
  emit({ name: 'chat:items', args: [{ id, items: [{ kind: 'theirs', id: 'a', text: 'Done' }] }] })
  emit({ name: 'chat:items', args: [{ id: 'not-mine', items: [{ kind: 'theirs', id: 'b', text: 'Secret' }] }] })
  emit({ name: 'chat:sessions', args: [[{ id, root: '/work/app', title: 'Fix it', state: 'idle', mode: 'auto' } as ChatSession]] })
  emit({ name: 'chat:notice', args: [{ session: id, title: 'Wants to run a command', subtitle: '', body: '', asks: true }] })
  expect(heard.map((one) => one.kind)).toEqual(['items', 'state', 'notice'])
  await channels.configure('channel:echo', { enabled: false })
  expect(seen().stopped).toBe(1)
  emit({ name: 'chat:items', args: [{ id, items: [] }] })
  expect(heard).toHaveLength(3)
  await expect(context.conversations.send(id, { text: 'x' })).rejects.toThrow('This channel was stopped')
  expect(echo(channels)?.state).toBe('off')
  await channels.dispose()
})

it('rejects settings the library does not declare and folders GeckIt does not know', async () => {
  const { channels, settings } = await setup()
  await expect(channels.configure('channel:echo', { config: { other: 'x' } })).rejects.toThrow('no setting called other')
  await expect(channels.configure('channel:echo', { config: { token: 'x' } })).rejects.toThrow('no setting called token')
  await expect(channels.configure('channel:echo', { projects: ['/elsewhere'] })).rejects.toThrow('Add those folders')
  await channels.configure('channel:echo', { config: { allow: [' U1 ', ''] } })
  expect(settings().channels.find((one) => one.info.id === 'channel:echo')?.config).toEqual({ allow: ['U1'] })
  await channels.dispose()
})

it('loads the Slack example as GeckIt would install it', async () => {
  const home = await mkdtemp(join(tmpdir(), 'geckit-channel-example-'))
  folders.push(home)
  process.env['GECKIT_CHANNEL_TEST_HOME'] = home
  const loaded = await loadChannel(join(import.meta.dirname, '..', '..', 'examples', 'slack-channel'))
  expect(loaded.info.id).toBe('channel:slack')
  expect(loaded.info.fields.filter((one) => one.required === true).map((one) => one.key)).toEqual(['botToken', 'appToken', 'allow'])
  expect(typeof loaded.module.create).toBe('function')
})

it('comes with Discord built in: not removable, checked in Set up only with its saved token', async () => {
  const { channels } = await setup()
  await expect(channels.remove('channel:discord')).rejects.toThrow('turned off, not removed')
  expect(await channels.inspect('channel:discord', {})).toEqual({ token: 'missing' })
  await expect(channels.inspect('channel:slack', {})).rejects.toThrow('Slack has nothing to check')
  await channels.configure('channel:discord', { enabled: true })
  expect(channels.view().channels.find((one) => one.id === 'channel:discord')).toMatchObject({ state: 'setup', says: 'Fill in Bot token, People who may write.' })
  await channels.dispose()
})

it('comes with Slack built in, which can be turned off but not removed', async () => {
  const { channels } = await setup()
  await expect(channels.remove('channel:slack')).rejects.toThrow('turned off, not removed')
  expect(channels.view().channels.find((one) => one.id === 'channel:slack')).toMatchObject({ builtIn: true, state: 'off' })
  await channels.dispose()
})

class FakeSocket {
  static last: FakeSocket | undefined
  readonly sent: unknown[] = []
  readonly listeners: { message?: (message: { readonly data: unknown }) => void; close?: () => void } = {}
  constructor(readonly url: string) { FakeSocket.last = this }
  addEventListener(name: 'message' | 'close', listener: never): void { this.listeners[name] = listener }
  send(text: string): void { this.sent.push(JSON.parse(text)) }
  close(): void { /* nothing to close */ }
  emit(envelope: object): void { this.listeners.message?.({ data: JSON.stringify(envelope) }) }
}

function slackHarness(manager = true, history: { ts: string; user?: string; text: string; files?: { name: string; permalink: string }[] }[] = [], allow: readonly string[] = ['U1', 'U2'], people: { readonly [user: string]: object } = {}) {
  const posted: { channel: string; thread_ts?: string; text: string }[] = []
  const updated: { channel: string; ts?: string; text: string }[] = []
  const deleted: { channel: string; ts: string }[] = []
  const reactions: [string, { channel: string; timestamp: string; name: string }][] = []
  const sent: [string, unknown][] = []
  const answered: [string, string, unknown][] = []
  const opened: unknown[] = []
  const watchers = new Map<string, (event: ChannelEvent) => void>()
  const store = new Map<string, unknown>()
  const context = {
    id: 'channel:slack',
    log: { path: '', write: () => undefined },
    config: () => ({ allow, checkSecrets: true }),
    secret: (key: string) => ({ botToken: 'xoxb-test', appToken: 'xapp-test' } as { readonly [key: string]: string })[key],
    store: { get: (key: string) => store.get(key), set: (key: string, value: unknown) => { if (value === undefined) store.delete(key); else store.set(key, value) } },
    status: () => undefined,
    projects: () => [],
    providers: () => ['claude'],
    employees: () => [],
    conversations: {
      manager: (place?: { key: string }) => { opened.push(place); return manager ? `channel:slack:${place?.key ?? 'default'}` : undefined },
      label: () => undefined,
      start: async () => 'never',
      send: async (id: string, message: unknown) => { sent.push([id, message]) },
      get: () => undefined,
      list: () => [],
      items: async () => [],
      watch: (id: string, listener: (event: ChannelEvent) => void) => { watchers.set(id, listener); return () => watchers.delete(id) },
      answer: async (id: string, card: string, answer: unknown) => { answered.push([id, card, answer]); return true },
      stop: async () => undefined,
    },
  } as unknown as ChannelContext
  const fetch = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
    const method = url.split('/').at(-1)
    const form = init.headers['content-type'] === 'application/x-www-form-urlencoded'
    if (!form && (method === 'conversations.replies' || method === 'users.info' || method === 'chat.getPermalink')) return { json: async () => ({ ok: false, error: 'invalid_arguments' }) }
    const body = (form ? Object.fromEntries(new URLSearchParams(init.body)) : JSON.parse(init.body)) as { channel: string; thread_ts?: string; text: string; user?: string; oldest?: string; ts?: string }
    if (method === 'chat.postMessage') posted.push(body)
    if (method === 'chat.update') updated.push(body)
    if (method === 'chat.delete') deleted.push({ channel: body.channel, ts: body.ts ?? '' })
    if (method === 'reactions.add' || method === 'reactions.remove') reactions.push([method, body as unknown as { channel: string; timestamp: string; name: string }])
    const reply = method === 'auth.test' ? { ok: true, user_id: 'B1', team_id: 'T1' } : method === 'conversations.replies' ? { ok: true, messages: history.filter((one) => body.oldest === undefined || !after(body.oldest, one.ts)) } : method === 'apps.connections.open' ? { ok: true, url: 'wss://example' } : method === 'users.info' ? { ok: true, user: { team_id: 'T1', ...people[body.user ?? ''], profile: { display_name: body.user === 'U1' ? 'Maria Ivanova' : 'Ben' } } } : method === 'chat.getPermalink' ? { ok: true, permalink: 'https://slack.example/p1' } : method === 'chat.postMessage' ? { ok: true, ts: `9.${String(posted.length)}` } : { ok: true }
    return { json: async () => reply }
  }) as unknown as typeof globalThis.fetch
  const channel = createSlack(context, { fetch, WebSocket: FakeSocket as unknown as SlackTransport['WebSocket'] })
  const event = (body: object): void => FakeSocket.last?.emit({ type: 'events_api', envelope_id: 'e1', payload: { event: body } })
  const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
  return { channel, context, makeChannel: () => createSlack(context, { fetch, WebSocket: FakeSocket as unknown as SlackTransport['WebSocket'] }), event, settle, posted, updated, deleted, reactions, sent, answered, opened, watchers, store }
}

it('Slack: with nobody listed, answers every full member of its workspace and no guest, outsider or bot', async () => {
  const run = slackHarness(true, [], [], { U3: { is_restricted: true }, U4: { is_ultra_restricted: true }, U5: { team_id: 'T2' }, U6: { is_bot: true }, U7: { deleted: true } })
  await run.channel.start()
  run.event({ type: 'app_mention', user: 'U2', channel: 'C1', ts: '3.0', text: '<@B1> hey' })
  await vi.waitFor(() => expect(run.sent.map(([id]) => id)).toEqual(['channel:slack:C1:3.0']))
  for (const [index, user] of ['U3', 'U4', 'U5', 'U6', 'U7'].entries()) run.event({ type: 'app_mention', user, channel: 'C1', ts: `${String(4 + index)}.0`, text: '<@B1> hey' })
  await vi.waitFor(() => expect(run.posted.filter((one) => one.text.includes('GeckIt lets me work for'))).toHaveLength(5))
  expect(run.sent).toHaveLength(1)
})

it('Slack: with people listed, answers only them', async () => {
  const run = slackHarness(true, [], ['U1'])
  await run.channel.start()
  run.event({ type: 'app_mention', user: 'U2', channel: 'C1', ts: '3.0', text: '<@B1> hey' })
  await vi.waitFor(() => expect(run.posted.at(-1)?.text).toContain('GeckIt lets me work for'))
  expect(run.sent).toEqual([])
})

it('Slack: one message says what Manager does while it prepares an answer, edited in place and deleted when the answer comes', async () => {
  const run = slackHarness()
  await run.channel.start()
  run.event({ type: 'app_mention', user: 'U1', channel: 'C1', ts: '3.0', text: '<@B1> what are you indexing?' })
  await run.settle()
  const watch = run.watchers.get('channel:slack:C1:3.0')
  const activity = (answering?: string) => ({ manager: '', ending: 'Done.', active: answering !== undefined, workers: [], ...(answering === undefined ? {} : { answering }) })
  watch?.({ kind: 'status', activity: activity('Preparing the answer: thinking it through') })
  await vi.waitFor(() => expect(run.posted.at(-1)).toEqual({ channel: 'C1', thread_ts: '3.0', text: 'Preparing the answer: thinking it through' }))
  const id = `9.${String(run.posted.length)}`
  watch?.({ kind: 'status', activity: activity('Preparing the answer: reading <brain>/slack') })
  await vi.waitFor(() => expect(run.updated.at(-1)).toMatchObject({ ts: id, text: 'Preparing the answer: reading &lt;brain&gt;/slack' }), { timeout: 5_000 })
  watch?.({ kind: 'answer', text: 'Slack, 10 channels.' })
  await vi.waitFor(() => expect(run.deleted).toContainEqual({ channel: 'C1', ts: id }))
  expect(run.posted.at(-1)?.text).toBe('Slack, 10 channels.')
  await run.channel.stop()
}, 15_000)

it('Slack: marks a message Manager took with :eyes: until it answers or finishes', async () => {
  const run = slackHarness()
  await run.channel.start()
  run.event({ type: 'app_mention', user: 'U1', channel: 'C1', ts: '3.0', text: '<@B1> fix the login redirect' })
  await run.settle()
  expect(run.reactions).toEqual([['reactions.add', { channel: 'C1', timestamp: '3.0', name: 'eyes' }]])
  const watch = run.watchers.get('channel:slack:C1:3.0')
  watch?.({ kind: 'answer', text: 'Done.' })
  await run.settle()
  expect(run.reactions.at(-1)).toEqual(['reactions.remove', { channel: 'C1', timestamp: '3.0', name: 'eyes' }])
  run.event({ type: 'message', channel_type: 'channel', user: 'U1', channel: 'C1', ts: '4.0', thread_ts: '3.0', text: '<@B1> and the tests?' })
  run.event({ type: 'app_mention', user: 'U1', channel: 'C1', ts: '4.0', thread_ts: '3.0', text: '<@B1> and the tests?' })
  await vi.waitFor(() => expect(run.reactions.at(-1)).toEqual(['reactions.add', { channel: 'C1', timestamp: '4.0', name: 'eyes' }]))
  watch?.({ kind: 'status', activity: { manager: '', ending: 'Done.', active: false, workers: [] } })
  await run.settle()
  expect(run.reactions).toHaveLength(3)
  watch?.({ kind: 'status', activity: { manager: '', ending: 'Done.', active: true, workers: [] } })
  watch?.({ kind: 'status', activity: { manager: '', ending: 'Done.', active: false, workers: [] } })
  await run.settle()
  expect(run.reactions.at(-1)).toEqual(['reactions.remove', { channel: 'C1', timestamp: '4.0', name: 'eyes' }])
  await run.channel.stop()
})

it('Slack: one Manager thread per Slack thread, labelled with who started it, answered in that thread', async () => {
  const run = slackHarness()
  await run.channel.start()
  run.event({ type: 'app_mention', user: 'U9', channel: 'C1', ts: '1.0', text: '<@B1> fix it' })
  run.event({ type: 'app_mention', user: 'U1', channel: 'C1', ts: '2.0', text: '<@B1> token xoxb-1234567890-abcdef' })
  await run.settle()
  expect(run.sent).toEqual([])
  expect(run.posted.map((one) => one.text)).toEqual([expect.stringContaining('I can only take requests'), expect.stringContaining('token or key')])
  run.event({ type: 'app_mention', user: 'U1', channel: 'C1', ts: '3.0', text: '<@B1> fix the login redirect' })
  await run.settle()
  expect(run.opened.at(-1)).toEqual({ key: 'C1:3.0', from: 'Maria Ivanova', title: 'fix the login redirect', link: 'https://slack.example/p1', labels: { channel: 'C1', thread: '3.0', starter: 'Maria Ivanova', starterId: 'U1' } })
  expect(run.sent).toEqual([['channel:slack:C1:3.0', { text: 'fix the login redirect', from: 'Maria Ivanova' }]])
  run.event({ type: 'message', channel_type: 'channel', user: 'U2', channel: 'C1', ts: '3.5', thread_ts: '3.0', text: 'and keep the tests green' })
  run.event({ type: 'message', channel_type: 'channel', user: 'U2', channel: 'C1', ts: '4.0', text: 'unrelated chatter' })
  await run.settle()
  expect(run.sent).toHaveLength(1)
  run.event({ type: 'message', channel_type: 'im', user: 'U1', channel: 'D1', ts: '5.0', text: 'what is running?' })
  await run.settle()
  expect(run.sent.at(-1)).toEqual(['channel:slack:D1:5.0', { text: 'what is running?', from: 'Maria Ivanova' }])
  run.watchers.get('channel:slack:C1:3.0')?.({ kind: 'answer', text: 'Started a worker for it.' })
  run.watchers.get('channel:slack:C1:3.0')?.({ kind: 'decisions', decisions: [{ id: 'd1', title: 'Start this worker?', choices: [{ label: 'Allow', value: 'allow' }, { label: 'Refuse', value: 'refuse' }] }] })
  await run.settle()
  expect(run.posted.slice(-2)).toEqual([{ channel: 'C1', thread_ts: '3.0', text: 'Started a worker for it.' }, { channel: 'C1', thread_ts: '3.0', text: '*Start this worker?*\nReply with one of: `allow`, `refuse`' }])
  run.event({ type: 'message', channel_type: 'channel', user: 'U1', channel: 'C1', ts: '6.0', thread_ts: '3.0', text: 'Allow' })
  await run.settle()
  expect(run.answered).toEqual([['channel:slack:C1:3.0', 'd1', 'allow']])
  await run.channel.stop()
})

it('Slack: says Manager is unavailable when it may not talk to Manager, and follows known threads after a restart', async () => {
  const closed = slackHarness(false)
  await closed.channel.start()
  closed.event({ type: 'app_mention', user: 'U1', channel: 'C1', ts: '7.0', text: '<@B1> hi' })
  await closed.settle()
  expect(closed.posted.at(-1)?.text).toContain("I can't answer in Slack yet")
  const run = slackHarness()
  run.store.set('threads', [{ key: 'C1:3.0', channel: 'C1', ts: '3.0' }])
  await run.channel.start()
  run.watchers.get('channel:slack:C1:3.0')?.({ kind: 'answer', text: 'Written from GeckIt, answered here.' })
  await run.settle()
  expect(run.posted).toEqual([{ channel: 'C1', thread_ts: '3.0', text: 'Written from GeckIt, answered here.' }])
})

it('Slack: a mention partway down a thread opens one Manager thread, replies without a mention wait, and the next mention brings them', async () => {
  const history = [
    { ts: '1762400000.000100', user: 'U3', text: 'Login redirect loops after the deploy' },
    { ts: '1762400060.000200', user: 'U9', text: 'same for me <@U1>', files: [{ name: 'trace.txt', permalink: 'https://files.example/trace' }] },
    { ts: '1762400090.000000', user: 'U9', text: 'here is mine xoxb-1234567890-abcdef' },
    { ts: '1762400120.000300', user: 'U1', text: '<@B1> can you look?' },
  ]
  const run = slackHarness(true, history)
  await run.channel.start()
  run.event({ type: 'app_mention', user: 'U1', channel: 'C1', ts: '1762400120.000300', thread_ts: '1762400000.000100', text: '<@B1> can you look?' })
  run.event({ type: 'message', channel_type: 'channel', user: 'U1', channel: 'C1', ts: '1762400120.000300', thread_ts: '1762400000.000100', text: '<@B1> can you look?' })
  await run.settle()
  await run.settle()
  expect(run.opened.at(-1)).toMatchObject({ key: 'C1:1762400000.000100', title: 'can you look?', labels: { thread: '1762400000.000100', starter: 'Maria Ivanova' } })
  expect(run.sent).toEqual([['channel:slack:C1:1762400000.000100', { from: 'Maria Ivanova', text: 'Earlier in this Slack thread:\nBen (2025-11-06 03:33 UTC): Login redirect loops after the deploy\nBen (2025-11-06 03:34 UTC): same for me @Maria Ivanova [file: trace.txt https://files.example/trace]\nBen (2025-11-06 03:34 UTC): (left out: looks like it contains a token or key)\n\nMessage to you:\ncan you look?' }]])
  history.push({ ts: '1762400150.000000', user: 'B1', text: 'Looking into it.' }, { ts: '1762400180.000000', user: 'U9', text: 'it started after 14:00' }, { ts: '1762400190.000000', user: 'U1', text: 'logs show a 302 loop' }, { ts: '1762400200.000000', user: 'U2', text: '<@B1> any news?' })
  run.event({ type: 'message', channel_type: 'channel', user: 'U9', channel: 'C1', ts: '1762400180.000000', thread_ts: '1762400000.000100', text: 'it started after 14:00' })
  run.event({ type: 'message', channel_type: 'channel', user: 'U1', channel: 'C1', ts: '1762400190.000000', thread_ts: '1762400000.000100', text: 'logs show a 302 loop' })
  await run.settle()
  expect(run.posted).toEqual([])
  expect(run.sent).toHaveLength(1)
  run.event({ type: 'message', channel_type: 'channel', user: 'U2', channel: 'C1', ts: '1762400200.000000', thread_ts: '1762400000.000100', text: '<@B1> any news?' })
  run.event({ type: 'app_mention', user: 'U2', channel: 'C1', ts: '1762400200.000000', thread_ts: '1762400000.000100', text: '<@B1> any news?' })
  await run.settle()
  await run.settle()
  expect(run.sent).toHaveLength(2)
  expect(run.sent.at(-1)).toEqual(['channel:slack:C1:1762400000.000100', { from: 'Ben', text: 'Earlier in this Slack thread:\nBen (2025-11-06 03:36 UTC): it started after 14:00\nMaria Ivanova (2025-11-06 03:36 UTC): logs show a 302 loop\n\nMessage to you:\nany news?' }])
  await run.channel.stop()
})

it('Slack: orders timestamps by seconds and microseconds', () => {
  expect(after('1762400000.000200', '1762400000.000100')).toBe(true)
  expect(after('1762400000.1', '1762400000.000100')).toBe(true)
  expect(after('1762399999.999999', '1762400000.000000')).toBe(false)
  expect(after('3.0', '3.0')).toBe(false)
})

it('Slack: the status shows while workers run, leaves while Manager answers and comes back below the answer', async () => {
  const run = slackHarness()
  await run.channel.start()
  run.event({ type: 'app_mention', user: 'U1', channel: 'C1', ts: '3.0', text: '<@B1> fix the login redirect' })
  await run.settle()
  const watch = run.watchers.get('channel:slack:C1:3.0')
  const posts = run.posted.length
  watch?.({ kind: 'status', activity: { manager: 'While I wait, here is what is going on:', ending: 'Done.', active: true, workers: [] } })
  await run.settle()
  expect(run.posted).toHaveLength(posts)
  watch?.({ kind: 'status', activity: { manager: 'While I wait, here is what is going on:', ending: 'Done.', active: false, workers: [{ id: 'w1', line: '• Fix <login>: working', active: true }] } })
  await vi.waitFor(() => expect(run.posted.at(-1)?.text).toMatch(/^While I wait, here is what is going on:\n• Fix &lt;login&gt;: working$/))
  const status = `9.${String(run.posted.length)}`
  watch?.({ kind: 'status', activity: { manager: 'While I wait, here is what is going on:', ending: 'Done.', active: true, workers: [{ id: 'w1', line: '• Fix <login>: working', active: true }] } })
  await vi.waitFor(() => expect(run.deleted.at(-1)).toEqual({ channel: 'C1', ts: status }))
  watch?.({ kind: 'answer', text: 'Still on it.' })
  watch?.({ kind: 'status', activity: { manager: 'While I wait, here is what is going on:', ending: 'Done.', active: false, workers: [{ id: 'w1', line: '• Fix <login>: working', active: true }] } })
  await vi.waitFor(() => expect(run.posted.slice(-2).map((one) => one.text.split('\n')[0])).toEqual(['Still on it.', 'While I wait, here is what is going on:']))
  const again = `9.${String(run.posted.length)}`
  watch?.({ kind: 'status', activity: { manager: 'While I wait, here is what is going on:', ending: 'Done.', active: false, workers: [{ id: 'w1', line: '• Fix <login>: finished', active: false }] } })
  await vi.waitFor(() => expect(run.updated.at(-1)).toMatchObject({ ts: again, text: expect.stringMatching(/^Done\.\n• Fix &lt;login&gt;: finished$/) }), { timeout: 5_000 })
  await run.channel.stop()
}, 15_000)


it('Slack reset cuts earlier history, deletes the old place and preserves new seen/decisions through restart', async () => {
  const run = slackHarness(true, [{ ts: '1762400001.000000', user: 'U2', text: 'private earlier history' }])
  let boundary: ManagerHistoryBoundary | undefined
  run.context.conversations.historyBoundary = () => boundary
  await run.channel.start()
  run.event({ type: 'app_mention', channel: 'C1', user: 'U1', ts: '1762400002.000000', thread_ts: '1762400000.000000', text: '<@B1> first' })
  await run.settle()
  const key = 'C1:1762400000.000000'
  const id = `channel:slack:${key}`
  boundary = { id, revision: 'reset-1', action: 'delete', at: 1762400003000 }
  run.watchers.get(id)?.({ kind: 'history', change: { ...boundary, sessions: ['old-native'] } })
  expect(run.store.get('threads')).toEqual([])
  await run.channel.stop()
  const restarted = run.makeChannel()
  await restarted.start()
  expect(run.watchers.has(id)).toBe(false)
  run.event({ type: 'app_mention', channel: 'C1', user: 'U1', ts: '1762400004.000000', thread_ts: '1762400000.000000', text: '<@B1> fresh request' })
  await run.settle()
  expect(run.sent.at(-1)).toEqual([id, { from: 'Maria Ivanova', text: 'fresh request' }])
  boundary = { ...boundary, action: 'clear' }
  run.store.set(`decisions:${key}`, [{ id: 'new-decision', values: ['yes'] }])
  await restarted.stop()
  const again = run.makeChannel()
  await again.start()
  expect(run.watchers.has(id)).toBe(true)
  expect(run.store.get(`seen:${key}`)).toBe('1762400004.000000')
  expect(run.store.get(`decisions:${key}`)).toEqual([{ id: 'new-decision', values: ['yes'] }])
  await again.stop()
})

it('binds built-in retained inputs and file outputs to the live Manager thread and invalidates every stale sender on channel disable', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'channel-shared-attachments-'))
  folders.push(directory)
  const attachments = new TelegramAttachments(directory)
  const contexts: ChannelContext[] = []
  const create = vi.spyOn(SLACK_MODULE, 'create').mockImplementation((context) => { contexts.push(context); return { start: async () => undefined, stop: async () => undefined } })
  const { channels, deps } = await setup(attachments)
  try {
    const submitted = vi.spyOn(deps.manager, 'send')
    await channels.configure('channel:slack', { enabled: true, manager: true, config: { allow: ['U1'] }, secrets: { botToken: 'test-bot', appToken: 'test-app' } })
    const context = contexts[0]
    if (context?.files === undefined) throw new Error('Missing built-in files capability')
    const thread = context.conversations.manager({ key: 'C1:100.000001' })
    if (thread === undefined) throw new Error('Missing thread')
    const input = context.files.keep(thread, Buffer.from('real bytes'), 'input.txt', 'text/plain')
    expect(attachments.read(input, thread).bytes.toString()).toBe('real bytes')
    expect(() => context.files?.keep('other-thread', Buffer.from('secret'), 'other.txt', 'text/plain')).toThrow('did not start')
    await context.conversations.send(thread, { text: 'Use input', attachments: [input], authorized: () => true })
    const call = submitted.mock.calls.at(-1)
    expect(call?.[5]).toEqual([input])
    expect(call?.[7]).toBe(thread)
    expect(call?.[4]()).toBe(true)
    const sender = vi.fn<ChannelFileSender>(async (_bytes, _name, _media, _caption, _as, _origin, beforeSend) => { await beforeSend?.(); return { channel: 'channel:slack', destination: 'C1:100.000001', fileId: 'FOUT' } })
    context.files.bind(thread, sender)
    const bound = channels.fileSender(thread)
    expect(await bound(Buffer.from('artifact'), 'out.txt', 'text/plain', '', 'document', { session: 'manager', workers: [] })).toMatchObject({ fileId: 'FOUT' })
    await channels.configure('channel:slack', { enabled: false })
    expect(call?.[4]()).toBe(false)
    expect(() => channels.fileSender(thread)).toThrow('unavailable')
    await expect(bound(Buffer.from('artifact'), 'out.txt', 'text/plain', '', 'document', { session: 'manager', workers: [] })).rejects.toThrow('stopped')
    expect(sender).toHaveBeenCalledTimes(1)
  } finally { await channels.dispose(); create.mockRestore() }
})
