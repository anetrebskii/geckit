import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, it, vi } from 'vitest'

import { TELEGRAM_ID, TELEGRAM_INFO, telegramChannel } from '../src/main/channels/telegram'
import type { ManagerDecision } from '../src/shared/manager'
import type { ChannelContext, ChannelEvent, ChannelMigration, Json } from '../src/main/channels/channel-api'


function context(managerOn: boolean): { readonly context: ChannelContext; readonly views: Json[]; readonly closed: (string | undefined)[]; readonly off: () => void } {
  const views: Json[] = []
  const closed: (string | undefined)[] = []
  const watchers: ((on: boolean) => void)[] = []
  const value = {
    id: TELEGRAM_ID,
    capabilities: new Set(TELEGRAM_INFO.capabilities),
    log: { path: '', write: () => undefined },
    config: () => ({}),
    secret: () => undefined,
    store: { get: () => undefined, set: () => undefined },
    sealed: { available: () => true, read: () => undefined, write: () => undefined },
    status: () => undefined,
    projects: () => [],
    providers: () => ['claude'],
    employees: () => [],
    view: (shown: Json) => { views.push(shown) },
    conversations: {
      manager: () => undefined, label: () => undefined, start: async () => 'never', send: async () => 'manager', get: () => undefined, list: () => [], items: async () => [],
      watch: () => () => undefined, answer: async () => false, stop: async () => undefined,
      managerOn: () => managerOn, watchManager: (listener: (on: boolean) => void) => { watchers.push(listener); return () => undefined }, close: (reason: string | undefined) => { closed.push(reason) },
    },
  } as unknown as ChannelContext
  return { context: value, views, closed, off: () => { for (const listener of watchers) listener(false) } }
}

it('asks for every ability and carries the old Manager threads and request notes over', () => {
  expect(TELEGRAM_INFO.capabilities).toEqual(['conversations', 'manager', 'replies', 'delivery', 'control', 'files', 'shares'])
  const configure = vi.fn()
  const renamed: unknown[] = []
  const notes: unknown[] = []
  const adopted: string[] = []
  const migration = (created: boolean): ChannelMigration => ({ created, configure, renameManagerChannel: (from, to, shared) => { renamed.push([from, to, shared('team:-100:42:gen'), shared('81')]) }, renameNoteKey: (from, to) => { notes.push([from, to]) }, adoptSealed: (name) => { adopted.push(name) } })
  const module = telegramChannel()
  module.migrate?.(migration(true))
  module.migrate?.(migration(false))
  expect(configure).toHaveBeenCalledTimes(1)
  expect(configure).toHaveBeenCalledWith({ enabled: true, manager: true })
  expect(renamed).toEqual([['telegram', TELEGRAM_ID, true, false], ['telegram', TELEGRAM_ID, true, false]])
  expect(notes).toEqual([['managerTelegramSource', 'managerRequestSource'], ['managerTelegramSource', 'managerRequestSource']])
  expect(adopted).toEqual(['manager-telegram.sealed', 'manager-telegram.sealed'])
})

it('reaches GeckIt only through its channel context: no files, secure storage or core of its own', () => {
  for (const file of ['channels/telegram.ts', 'telegram.ts', 'telegram-bot.ts', 'telegram-render.ts', 'telegram-team.ts', 'telegram-typing.ts']) {
    const source = readFileSync(join(import.meta.dirname, '../src/main', file), 'utf8')
    const imports = [...source.matchAll(/^import .* from '([^']+)'/gm)].map((match) => match[1])
    expect(imports.filter((one) => one === 'node:fs' || one === 'electron' || one?.includes('/core/') || one?.includes('/service/') || /^\.{1,2}\/(manager|sessions|runtime)$|channels\/channels$/.test(one ?? '')), file).toEqual([])
  }
})

it('shows its view to Settings and the phone, and takes connection changes only from the computer while Manager is on', async () => {
  const { context: shown, views, closed, off } = context(false)
  const channel = await telegramChannel().create(shown)
  await channel.start()
  try {
    expect(views.at(-1)).toMatchObject({ state: 'disconnected' })
    expect(closed.at(-1)).toContain('Telegram is not connected')
    await expect(channel.request?.({ kind: 'view' }, 'phone')).resolves.toMatchObject({ state: 'disconnected' })
    await expect(channel.request?.({ kind: 'action', action: { kind: 'retry' } }, 'phone')).rejects.toThrow('on the computer')
    await expect(channel.request?.({ kind: 'action', action: { kind: 'connect', token: '1:x' } }, 'desktop')).rejects.toThrow('Enable Manager')
    await expect(channel.request?.({ kind: 'action', action: { kind: 'disconnect' } }, 'desktop')).resolves.toMatchObject({ state: 'disconnected' })
    const before = views.length
    off()
    await vi.waitFor(() => expect(views.length).toBeGreaterThan(before))
    expect(views.at(-1)).toMatchObject({ state: 'disconnected' })
  } finally { await channel.stop() }
})

it('bundles every channel as an independent library without host implementations', async () => {
  const { build } = await import('esbuild')
  for (const name of ['telegram', 'slack', 'discord']) {
    const result = await build({ entryPoints: [join(import.meta.dirname, `../src/main/channels/${name}.ts`)], bundle: true, platform: 'node', format: 'esm', write: false, metafile: true })
    const inputs = Object.keys(result.metafile.inputs)
    expect(inputs.filter((path) => /src\/(core|service)\/|src\/main\/(manager(?:-approvals)?|sessions|shares|channel-attachments)\.ts$/.test(path)), name).toEqual([])
    expect(result.outputFiles[0]?.text, name).not.toMatch(/from ["'](?:node:fs|electron)["']/)
  }
})

it('migrates a legacy Manager record inside the module without losing queued work or replaying replies', () => {
  const restore = telegramChannel().restoreManager
  if (restore === undefined) throw new Error('No migration')
  const legacy = { inbox: [{ id: 'one', source: 'telegram', text: 'Next task', state: 'queued', telegramRequests: ['original'] }], telegramReplies: [{ id: 'answer', text: 'Result', state: 'sending', origin: { thread: 'telegram:81', telegramDelivery: 'delivery-one' } }], operations: [{ id: 'kept-operation' }] }
  const restored = restore(legacy)
  expect(restored).toMatchObject({ inbox: [{ id: 'one', source: 'channel', text: '[Via Telegram]\nNext task', requests: ['original'] }], channelReplies: [{ id: 'answer', state: 'sending', origin: { delivery: 'delivery-one' } }], operations: [{ id: 'kept-operation' }] })
  expect(JSON.stringify(restored)).not.toMatch(/telegramReplies|telegramRequests|telegramDelivery/)
  expect(restore(restored)).toEqual(restored)
})

it('recognizes a decision error from a separately bundled host class by reason', async () => {
  const { channelDecisionReason } = await import('../src/shared/channel-ui')
  class IndependentDecisionFailure extends Error { readonly reason = 'paused' }
  expect(channelDecisionReason(new IndependentDecisionFailure())).toBe('paused')
  expect(channelDecisionReason(new Error('paused'))).toBeUndefined()
})

it('routes a restored private chat, commands and host answers through the public context', async () => {
  const { context: base } = context(true)
  const manager = vi.fn(() => 'channel:telegram:81')
  const send = vi.fn(async () => 'manager-session')
  const pause = vi.fn(async () => undefined)
  const resume = vi.fn(async () => undefined)
  const posted: string[] = []
  let decisions: readonly ManagerDecision[] = []
  let listener: ((event: ChannelEvent) => void) | undefined
  let received = false
  const fetcher: typeof fetch = async (input, init) => {
    const method = String(input).split('/').at(-1)
    const result = (value: Json): Response => Response.json({ ok: true, result: value })
    if (method === 'getMe') return result({ id: 1, username: 'example_bot', is_bot: true })
    if (method === 'getUpdates') {
      if (!received) {
        received = true
        return result(['Do work', '/pause', '/resume'].map((text, at) => ({ update_id: at + 1, message: { message_id: at + 1, date: Math.floor(Date.now() / 1000), chat: { id: 81, type: 'private' }, from: { id: 81, first_name: 'Owner' }, text } })))
      }
      return new Promise<Response>((_resolve, reject) => { const abort = (): void => reject(new Error('Aborted')); init?.signal?.addEventListener('abort', abort, { once: true }); if (init?.signal?.aborted) abort() })
    }
    if (method === 'sendMessage' && typeof init?.body === 'string') posted.push(String((JSON.parse(init.body) as { readonly text: string }).text))
    return result(method === 'sendMessage' ? { message_id: posted.length } : true)
  }
  const channel = await telegramChannel({ fetch: fetcher }).create({ ...base,
    sealed: { available: () => true, read: () => JSON.stringify({ token: '123456:fixture', bot: { id: 1, username: 'example_bot' }, account: { id: 81, chatId: 81, name: 'Owner' }, offset: 0, replies: [], callbacks: [], questions: [] }), write: () => undefined },
    control: { pause, resume, view: () => { throw new Error('Not requested') } },
    conversations: { ...base.conversations, manager, send, decisions: () => decisions, watch: (_id, next) => { listener = next; return () => { listener = undefined } } },
  })
  await channel.start()
  try {
    await vi.waitFor(() => expect(resume).toHaveBeenCalledOnce())
    expect(pause).toHaveBeenCalledOnce()
    expect(manager).toHaveBeenCalledWith(expect.objectContaining({ key: '81', owner: true }))
    expect(send).toHaveBeenCalledWith('channel:telegram:81', expect.objectContaining({ text: 'Do work' }))
    listener?.({ kind: 'answer', text: 'Host answer' })
    await vi.waitFor(() => expect(posted.some((text) => text.includes('Host answer'))).toBe(true))
    decisions = [{ id: 'approve', title: 'Approve worker', choices: [{ label: 'Allow', value: 'allow' }] }]
    listener?.({ kind: 'decisions', decisions })
    await vi.waitFor(() => expect(posted.some((text) => text.includes('Approve worker'))).toBe(true))
    listener?.({ kind: 'review', title: 'Review worker', body: 'Please review the result' })
    await vi.waitFor(() => expect(posted.some((text) => text.includes('Please review the result'))).toBe(true))
  } finally { await channel.stop() }
  expect(listener).toBeUndefined()
})

it('registers durable shared delivery and resumes only after the team connection is verified', async () => {
  const { context: base } = context(true)
  const thread = 'channel:telegram:team:-100:42:abcdefghijklmnopqrstuvwx'
  const manager = vi.fn(() => thread)
  const ready = vi.fn()
  let route: Parameters<NonNullable<ChannelContext['conversations']['deliver']>>[1] | undefined
  const beforeSend = vi.fn()
  const posted: string[] = []
  const fetcher: typeof fetch = async (input, init) => {
    const method = String(input).split('/').at(-1)
    if (method === 'getMe') return Response.json({ ok: true, result: { id: 1, username: 'example_bot', is_bot: true } })
    if (method === 'getUpdates') return new Promise<Response>((_resolve, reject) => { const abort = (): void => reject(new Error('Aborted')); init?.signal?.addEventListener('abort', abort, { once: true }); if (init?.signal?.aborted) abort() })
    if (method === 'sendMessage' && typeof init?.body === 'string') posted.push(String((JSON.parse(init.body) as { readonly text: string }).text))
    return Response.json({ ok: true, result: method === 'sendMessage' ? { message_id: posted.length } : true })
  }
  const channel = await telegramChannel({ fetch: fetcher }).create({ ...base,
    sealed: { available: () => true, read: () => JSON.stringify({ token: '123456:fixture', bot: { id: 1, username: 'example_bot' }, account: { id: 81, chatId: -100, name: 'Owner', team: { topicId: 42, title: 'Team', generation: 'abcdefghijklmnopqrstuvwx', approvers: [81], allMembers: false } }, offset: 0, replies: [], callbacks: [], questions: [] }), write: () => undefined },
    conversations: { ...base.conversations, manager, ready, deliver: (id, sender) => { expect(id).toBe(thread); route = sender; return () => { route = undefined } } },
  })
  await channel.start()
  try {
    await vi.waitFor(() => expect(ready).toHaveBeenCalledWith(thread))
    expect(manager).toHaveBeenCalledWith(expect.objectContaining({ key: 'team:-100:42:abcdefghijklmnopqrstuvwx', shared: true }))
    if (route === undefined) throw new Error('No delivery registered')
    await route('Durable result', { thread, session: 'manager-session', workers: [] }, beforeSend)
    expect(beforeSend).toHaveBeenCalledOnce()
    expect(posted.some((text) => text.includes('Durable result'))).toBe(true)
  } finally { await channel.stop() }
  expect(route).toBeUndefined()
})
