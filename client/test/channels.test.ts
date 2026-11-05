import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, it, vi } from 'vitest'

vi.mock('../src/core/platform', () => ({ dataDirectory: () => process.env['GECKIT_CHANNEL_TEST_HOME'], corePlatform: () => ({}) }))

import { Channels } from '../src/main/channels/channels'
import type { ChannelsDeps } from '../src/main/channels/channels'
import type { ChannelContext, ChannelEvent } from '../src/main/channels/channel-api'
import { channelManifest, loadChannel } from '../src/main/channels/libraries'
import type { CoreEvent } from '../src/core/events'
import type { ChatSession, Settings } from '../src/shared/api'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { ManagerView } from '../src/shared/manager'

const folders: string[] = []
afterEach(async () => {
  delete process.env['GECKIT_CHANNEL_TEST_HOME']
  delete (globalThis as { channelTest?: unknown }).channelTest
  await Promise.all(folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true })))
})

const manifest = { apiVersion: 1, kind: 'channel', entry: 'index.mjs', channel: { id: 'channel:echo', name: 'Echo', icon: 'chat' }, config: [{ key: 'token', label: 'Token', type: 'secret', required: true }, { key: 'allow', label: 'Allowed people', type: 'list', default: [] }] }
const library = `export function create(context) {
  const seen = globalThis.channelTest ??= { contexts: [], stopped: 0 }
  seen.contexts.push(context)
  return { start: async () => { context.status('connected', 'Listening') }, stop: async () => { seen.stopped += 1 } }
}`

interface Seen { readonly contexts: ChannelContext[]; stopped: number }
const seen = (): Seen => (globalThis as unknown as { channelTest: Seen }).channelTest

async function setup(): Promise<{ channels: Channels; deps: ChannelsDeps; settings: () => Settings; emit: (event: CoreEvent) => void; managerSent: string[]; answered: string[]; sessionsSent: unknown[] }> {
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
  const managerView = { state: 'idle', session: { id: 'manager-1', root: '/home', title: 'Manager', state: 'idle' }, decisions: [{ id: 'decision-1', title: 'Start?', choices: [{ label: 'Yes', value: 'yes' }] }] } as unknown as ManagerView
  const deps: ChannelsDeps = {
    directory: home,
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
    manager: {
      enabled: () => true,
      send: async (text) => { managerSent.push(text); return 'manager-1' },
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
  return { channels, deps, settings: () => settings, emit: (event) => { for (const listener of listeners) listener(event) }, managerSent, answered, sessionsSent }
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
  expect(channels.view().channels).toMatchObject([{ id: 'channel:echo', state: 'off' }])
  await channels.configure('channel:echo', { enabled: true })
  expect(channels.view().channels[0]).toMatchObject({ state: 'setup', says: 'Fill in Token.' })
  expect((globalThis as { channelTest?: unknown }).channelTest).toBeUndefined()
  await channels.configure('channel:echo', { secrets: { token: 'xoxb-1' } })
  expect(channels.view().channels[0]).toMatchObject({ state: 'connected', says: 'Listening', secrets: ['token'] })
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

it('treats Manager as one more conversation only when the channel is allowed to', async () => {
  const { channels, managerSent, answered } = await setup()
  await channels.configure('channel:echo', { enabled: true, secrets: { token: 't' } })
  const first = seen().contexts[0]
  expect(first?.conversations.manager()).toBeUndefined()
  await expect(first?.conversations.send('manager-1', { text: 'x' })).rejects.toThrow('did not start that conversation')
  await channels.configure('channel:echo', { manager: true })
  expect(seen().stopped).toBe(1)
  const context = seen().contexts[1]
  if (context === undefined) throw new Error('not restarted')
  expect(() => first?.conversations.manager()).toThrow('This channel was stopped')
  const manager = context.conversations.manager()
  expect(manager).toBe('manager-1')
  await context.conversations.send('manager-1', { text: 'Plan the release', from: 'Alex' })
  expect(managerSent).toEqual(['[Via Echo, from Alex]\nPlan the release'])
  expect(await context.conversations.answer('manager-1', 'decision-1', 'yes')).toBe(true)
  expect(answered).toEqual(['manager:decision-1:yes'])
  await expect(context.conversations.stop('manager-1')).rejects.toThrow('Pause Manager')
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
  expect(channels.view().channels[0]?.state).toBe('off')
  await channels.dispose()
})

it('rejects settings the library does not declare and folders GeckIt does not know', async () => {
  const { channels, settings } = await setup()
  await expect(channels.configure('channel:echo', { config: { other: 'x' } })).rejects.toThrow('no setting called other')
  await expect(channels.configure('channel:echo', { config: { token: 'x' } })).rejects.toThrow('no setting called token')
  await expect(channels.configure('channel:echo', { projects: ['/elsewhere'] })).rejects.toThrow('Add those folders')
  await channels.configure('channel:echo', { config: { allow: [' U1 ', ''] } })
  expect(settings().channels[0]?.config).toEqual({ allow: ['U1'] })
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
