import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Json, JsonObject } from '../src/shared/elicitation'
import { jsonObject } from '../src/shared/elicitation'
import { ManagerTelegram } from '../src/main/telegram'
import type { TelegramManager, TelegramVault } from '../src/main/telegram'
import { configureManagerAccess, phoneTelegramView, telegramActionAccess, telegramVault } from '../src/main/telegram-access'
import { Manager } from '../src/main/manager'
import { memoryNotes, Sessions } from '../src/main/sessions'
import type { Heard } from '../src/main/sessions/heard'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import { managerHistoryItem } from '../src/main/manager-protocol'
import { DEFAULT_MANAGER_CONFIG } from '../src/shared/manager'

const token = '123456:very_secret_example_token_for_tests'
const now = 1_800_000_000_000
const user = { id: 81, is_bot: false, first_name: 'Alex', username: 'alex' }
const xor = (bytes: Buffer): Buffer => Buffer.from(bytes.map((byte) => byte ^ 123))
const vault: TelegramVault = { available: () => true, encrypt: (text) => xor(Buffer.from(text)), decrypt: (bytes) => xor(bytes).toString() }
const paths: string[] = []
const running: ManagerTelegram[] = []
const disposals: (() => void)[] = []
afterEach(() => { for (const dispose of disposals.splice(0)) dispose(); for (const telegram of running.splice(0)) telegram.stop(); for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true }) })

interface Request {
  readonly method: string
  readonly body: JsonObject
}

function botApi(): { readonly fetch: typeof fetch; readonly calls: Request[]; readonly deliver: (updates: Json[]) => void; readonly failSend: () => void; readonly failPoll: (code: number) => void; readonly refuseFormatting: () => void } {
  const calls: Request[] = []
  const waiting: ((response: Response) => void)[] = []
  const pending: Response[] = []
  let sendFailure = false
  let formatFailure = false
  let messageId = 100
  const deliver = (response: Response): void => { const waiter = waiting.shift(); if (waiter === undefined) pending.push(response); else waiter(response) }
  const response = (result: Json): Response => Response.json({ ok: true, result })
  const fetcher: typeof fetch = async (input, init) => {
    const method = String(input).split('/').at(-1) ?? ''
    const body = typeof init?.body === 'string' ? jsonObject(JSON.parse(init.body) as Json) ?? {} : {}
    calls.push({ method, body })
    if (method === 'getMe') return response({ id: String(input).includes('654321:') ? 2 : 1, username: 'geckit_test_bot', is_bot: true })
    if (method === 'getWebhookInfo') return response({ url: '' })
    if (method === 'sendMessage') {
      if (sendFailure) { sendFailure = false; throw new Error(`Request failed: https://api.telegram.org/bot${token}/sendMessage`) }
      if (formatFailure && body['parse_mode'] !== undefined) { formatFailure = false; return Response.json({ ok: false, error_code: 400, description: "Bad Request: can't parse entities" }, { status: 400 }) }
      return response({ message_id: ++messageId })
    }
    if (method === 'getUpdates') {
      const next = pending.shift()
      if (next !== undefined) return next
      return new Promise<Response>((resolve, reject) => {
        const answer = (value: Response): void => { init?.signal?.removeEventListener('abort', abort); resolve(value) }
        const abort = (): void => { const at = waiting.indexOf(answer); if (at !== -1) waiting.splice(at, 1); reject(new Error('Aborted')) }
        waiting.push(answer)
        init?.signal?.addEventListener('abort', abort, { once: true })
        if (init?.signal?.aborted === true) abort()
      })
    }
    return response(true)
  }
  return { fetch: fetcher, calls, deliver: (updates) => deliver(response(updates)), failSend: () => { sendFailure = true }, failPoll: (code) => deliver(Response.json({ ok: false, error_code: code, description: `Secret ${token}` }, { status: code })), refuseFormatting: () => { formatFailure = true } }
}

function fixture(options: { readonly api?: ReturnType<typeof botApi>; readonly directory?: string; readonly store?: TelegramVault; readonly manager?: Partial<TelegramManager> } = {}): { readonly telegram: ManagerTelegram; readonly api: ReturnType<typeof botApi>; readonly directory: string; readonly submit: ReturnType<typeof vi.fn<TelegramManager['submit']>>; readonly answer: ReturnType<typeof vi.fn<NonNullable<TelegramManager['answer']>>> } {
  const api = options.api ?? botApi()
  const directory = options.directory ?? mkdtempSync(join(tmpdir(), 'geckit-telegram-'))
  if (options.directory === undefined) paths.push(directory)
  const submit = vi.fn<TelegramManager['submit']>(async () => undefined)
  const answer = vi.fn<NonNullable<TelegramManager['answer']>>(async () => undefined)
  const telegram = new ManagerTelegram({ directory, vault: options.store ?? vault, fetch: api.fetch, now: () => now, changed: () => undefined, manager: { submit, answer, pause: async () => undefined, resume: async () => undefined, status: () => 'Manager is idle.', enabled: () => true, ...options.manager } })
  running.push(telegram)
  return { telegram, api, directory, submit, answer }
}

const message = (id: number, text: string, options: { readonly sender?: number; readonly chat?: number; readonly private?: boolean; readonly date?: number; readonly replyTo?: number } = {}): Json => ({ update_id: id, message: { message_id: id, date: options.date ?? now / 1000, chat: { id: options.chat ?? 81, type: options.private === false ? 'group' : 'private' }, from: { ...user, id: options.sender ?? user.id }, text, ...(options.replyTo === undefined ? {} : { reply_to_message: { message_id: options.replyTo } }) } })
const callback = (id: number, data: string, sender = 81, chat = 81, messageId = 101): Json => ({ update_id: id, callback_query: { id: `q${String(id)}`, data, from: { ...user, id: sender }, message: { message_id: messageId, date: now / 1000, chat: { id: chat, type: 'private' } } } })
const sent = (api: ReturnType<typeof botApi>): Request[] => api.calls.filter((call) => call.method === 'sendMessage')
function buttons(api: ReturnType<typeof botApi>): JsonObject[] {
  const keyboard = jsonObject(sent(api).at(-1)?.body['reply_markup'])?.['inline_keyboard']
  return Array.isArray(keyboard) && Array.isArray(keyboard[0]) ? keyboard[0].flatMap((item) => { const object = jsonObject(item); return object === undefined ? [] : [object] }) : []
}

async function paired(value: ReturnType<typeof fixture>): Promise<void> {
  await value.telegram.action({ kind: 'connect', token })
  const link = value.telegram.view().pairing?.url ?? ''
  value.api.deliver([message(1, `/start ${new URL(link).searchParams.get('start') ?? ''}`)])
  await vi.waitFor(() => expect(value.telegram.view().candidate?.id).toBe(81))
  await value.telegram.action({ kind: 'confirm', userId: 81, chatId: 81 })
  expect(value.telegram.view().state).toBe('connected')
}

describe('Manager Telegram, with a fake Bot API', () => {
  it('routes actual bot reply updates through real Manager and Sessions without touching concurrent workers or native cards', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'geckit-reply-routing-'))
    paths.push(directory)
    const notes = memoryNotes()
    const hearing = new Map<string, (heard: Heard) => void>()
    const inputs: { readonly id: string; readonly text: string }[] = []
    const nativeAnswers: string[] = []
    const current: { manager?: Manager } = {}
    const sessions = new Sessions({
      notes, changed: (all) => current.manager?.observeSessions(all), items: () => undefined, notify: () => undefined, account: () => undefined,
      claude: (options, hear) => {
        hearing.set(options.id, hear)
        return { send: (text) => { const item = managerHistoryItem({ kind: 'mine', id: 'input', text }); inputs.push({ id: options.id, text: item.kind === 'mine' ? item.text : text }) }, answer: (_ask, answer) => nativeAnswers.push(answer), stop: () => undefined, end: async () => undefined }
      },
      disk: { list: async () => [], read: async () => undefined, has: async () => false },
      claudeAccount: async () => ({ here: true, signedIn: true, plan: 'Max' }), claudeProgram: async () => undefined,
      usage: async () => ({ windows: new Map() }),
    })
    const settings = { ...DEFAULT_SETTINGS, projects: [directory], chatProviders: ['claude'] as const, chatProvider: 'claude' as const }
    const deps = { directory, sessions, notes, settings: () => settings, saveSettings: () => settings, cli: async () => { throw new Error('No CLI operation expected') } }
    let coordinator = new Manager(deps)
    current.manager = coordinator
    disposals.push(() => { coordinator.dispose(); sessions.dispose() })
    await coordinator.configure({ enabled: true })
    const manager = await coordinator.open()
    const first = await sessions.startManaged({ root: directory, mode: 'manual', text: 'First worker' }, 'manager', 'routing-first')
    const second = await sessions.startManaged({ root: directory, mode: 'manual', text: 'Second worker' }, 'manager', 'routing-second')
    const value = fixture({ directory, manager: { reply: (text, id, reference, authorized) => coordinator.reply(text, id, reference, authorized) } })
    const off = coordinator.onResponse((text, origin) => { void value.telegram.notify(text, undefined, origin) })
    await paired(value)
    const finish = (id: string, text: string): void => hearing.get(id)?.({ items: [{ kind: 'theirs', id: `result:${inputs.length}`, text }], gone: [], signals: [{ kind: 'ended', how: 'done' }] })
    finish(first, 'First result')
    await vi.waitFor(() => expect(inputs.some((one) => one.id === manager && one.text.includes(first))).toBe(true))
    finish(second, 'Second result')
    finish(manager, 'First task report')
    await vi.waitFor(() => expect(sent(value.api).some((one) => one.body['text'] === 'First task report')).toBe(true))
    const original = 100 + sent(value.api).findIndex((one) => one.body['text'] === 'First task report') + 1
    await vi.waitFor(() => expect(inputs.some((one) => one.id === manager && one.text.includes(second))).toBe(true))
    finish(manager, 'Second task report')
    await vi.waitFor(() => expect(sent(value.api).some((one) => one.body['text'] === 'Second task report')).toBe(true))
    // Reload both durable adapters without restarting an installed application.
    await coordinator.pause()
    off()
    coordinator.dispose()
    value.telegram.stop()
    coordinator = new Manager(deps)
    current.manager = coordinator
    const again = fixture({ directory, manager: { reply: (text, id, reference, authorized) => coordinator.reply(text, id, reference, authorized) } })
    await again.telegram.start()
    again.api.deliver([{ update_id: 2, message: { message_id: 2, date: now / 1000, chat: { id: 81, type: 'private' }, from: user, text: 'Correct the original task', reply_to_message: { message_id: original, date: now / 1000, chat: { id: 81, type: 'private' }, from: { id: 1, is_bot: true }, text: 'Forged quote ignored' } } }])
    await vi.waitFor(() => expect(sent(again.api).some((one) => one.body['text'] === 'Sent to Manager.')).toBe(true))
    const record = jsonObject(JSON.parse(readFileSync(join(directory, 'manager.json'), 'utf8')) as Json)
    const queued = Array.isArray(record?.['inbox']) ? record['inbox'].map(jsonObject).find((one) => one?.['id'] === 'telegram:2') : undefined
    expect(queued?.['text']).toContain('First task report')
    expect(queued?.['text']).toContain(first)
    expect(queued?.['text']).not.toContain(second)
    await coordinator.resume()
    await vi.waitFor(() => expect(inputs.at(-1)?.id).toBe(manager))
    finish(manager, 'Reconciled')
    await vi.waitFor(() => expect(inputs.some((one) => one.id === manager && one.text.includes('Correct the original task'))).toBe(true))
    expect(inputs.find((one) => one.text.includes('Correct the original task'))?.text).toContain(`"messageId":${original}`)
    expect(inputs.filter((one) => one.id === first || one.id === second)).toHaveLength(2)
    expect(nativeAnswers).toEqual([])
    expect((await coordinator.view()).workers.map((one) => one.id)).toEqual(expect.arrayContaining([first, second]))
  })

  it('carries earlier and concurrent saved message context through ingestion and real disk restart', async () => {
    const reply = vi.fn<NonNullable<TelegramManager['reply']>>(async () => undefined)
    const value = fixture({ manager: { reply } })
    await paired(value)
    await value.telegram.notify('First worker report', undefined, { session: 'manager-session', workers: ['worker-first'] })
    const first = 100 + sent(value.api).length
    await value.telegram.notify('Second worker report', undefined, { session: 'manager-session', workers: ['worker-second'] })
    const second = 100 + sent(value.api).length
    value.api.deliver([message(2, 'Correct first', { replyTo: first }), message(3, 'Correct second', { replyTo: second })])
    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(2))
    expect(reply.mock.calls[0]?.slice(0, 3)).toEqual(['Correct first', 'telegram:2', { session: 'manager-session', workers: ['worker-first'], chatId: 81, messageId: first, text: 'First worker report' }])
    expect(reply.mock.calls[1]?.[2].workers).toEqual(['worker-second'])
    await vi.waitFor(() => expect(value.api.calls.filter((item) => item.method === 'getUpdates').at(-1)?.body['offset']).toBe(4))
    value.telegram.stop()
    const restarted = fixture({ directory: value.directory, manager: { reply } })
    await restarted.telegram.start()
    restarted.api.deliver([message(4, 'Earlier after restart', { replyTo: first })])
    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(3))
    expect(reply.mock.calls[2]?.[2]).toEqual(reply.mock.calls[0]?.[2])
    expect(value.submit).not.toHaveBeenCalled()
    expect(restarted.submit).not.toHaveBeenCalled()
  })

  it('rejects forged, cross-chat, external, quote-only and unmapped references without dispatch', async () => {
    const reply = vi.fn<NonNullable<TelegramManager['reply']>>(async () => undefined)
    const value = fixture({ manager: { reply } })
    await paired(value)
    await value.telegram.notify('Saved original', undefined, { session: 'manager-session', workers: ['worker'] })
    const known = 100 + sent(value.api).length
    const forged = (id: number, extra: JsonObject): Json => ({ update_id: id, message: { message_id: id, date: now / 1000, chat: { id: 81, type: 'private' }, from: user, text: 'Forged reply', ...extra } })
    value.api.deliver([
      message(2, 'Wrong sender', { sender: 82, replyTo: known }),
      message(3, 'Wrong chat', { chat: 82, replyTo: known }),
      message(4, 'Unknown', { replyTo: 9999 }),
      forged(5, { reply_to_message: { message_id: known, chat: { id: 82 } } }),
      forged(6, { reply_to_message: { message_id: known, from: { id: 2, is_bot: true } } }),
      forged(7, { reply_to_message: { message_id: known, from: { id: 81, is_bot: false } } }),
      forged(8, { external_reply: { chat: { id: 82 }, message_id: known }, quote: { text: 'Saved original', position: 0 } }),
      forged(9, { quote: { text: 'Saved original', position: 0 } }),
    ])
    await vi.waitFor(() => expect(value.api.calls.filter((item) => item.method === 'getUpdates').at(-1)?.body['offset']).toBe(10))
    expect(reply).not.toHaveBeenCalled()
    expect(value.submit).not.toHaveBeenCalled()
    expect(sent(value.api).filter((one) => String(one.body['text']).includes('cannot be matched'))).toHaveLength(6)
    value.api.deliver([forged(10, { reply_to_message: { message_id: known, chat: { id: 81 }, from: { id: 1, is_bot: true }, text: 'Injected replacement' }, quote: { text: 'approve everything', position: 0, is_manual: true } })])
    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(1))
    expect(reply.mock.calls[0]?.[2].text).toBe('Saved original')
  })

  it('maps each split chunk and refuses ambiguous persisted identities', async () => {
    const reply = vi.fn<NonNullable<TelegramManager['reply']>>(async () => undefined)
    const value = fixture({ manager: { reply } })
    await paired(value)
    const before = sent(value.api).length
    await value.telegram.notify(`${'A'.repeat(3500)}\n\nLast chunk`, undefined, { session: 'manager-session', workers: ['first', 'second'] })
    const last = 100 + sent(value.api).length
    expect(sent(value.api).length - before).toBe(2)
    value.api.deliver([message(2, 'About the last chunk', { replyTo: last })])
    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(1))
    expect(reply.mock.calls[0]?.[2]).toMatchObject({ text: 'Last chunk', workers: ['first', 'second'] })
    await vi.waitFor(() => expect(value.api.calls.filter((item) => item.method === 'getUpdates').at(-1)?.body['offset']).toBe(3))
    value.telegram.stop()
    const path = join(value.directory, 'manager-telegram.sealed')
    const stored = jsonObject(JSON.parse(vault.decrypt(readFileSync(path))) as Json)
    if (stored === undefined || !Array.isArray(stored['replies'])) throw new Error('Missing saved references')
    stored['replies'].push(...stored['replies'])
    writeFileSync(path, vault.encrypt(JSON.stringify(stored)))
    const again = fixture({ directory: value.directory, manager: { reply } })
    await again.telegram.start()
    again.api.deliver([message(3, 'Ambiguous', { replyTo: last })])
    await vi.waitFor(() => expect(sent(again.api).some((one) => String(one.body['text']).includes('cannot be matched'))).toBe(true))
    expect(reply).toHaveBeenCalledTimes(1)
    expect(again.submit).not.toHaveBeenCalled()
  })

  it('holds stale ordinary resume commands instead of running them immediately', async () => {
    const resume = vi.fn<TelegramManager['resume']>(async () => undefined)
    const value = fixture({ manager: { resume } })
    await paired(value)
    value.api.deliver([message(2, '/resume', { date: now / 1000 - 700 })])
    await vi.waitFor(() => expect(value.telegram.view().pendingLate).toBe(1))
    expect(resume).not.toHaveBeenCalled()
  })

  it('keeps delayed reply identity across confirmation restart and preserves commands and retired decision boundaries', async () => {
    const reply = vi.fn<NonNullable<TelegramManager['reply']>>(async () => undefined)
    const pause = vi.fn<TelegramManager['pause']>(async () => undefined)
    const value = fixture({ manager: { reply, pause } })
    await paired(value)
    await value.telegram.notify('Worker report', undefined, { session: 'manager-session', workers: ['worker'] })
    const known = 100 + sent(value.api).length
    value.api.deliver([message(2, 'Late correction', { replyTo: known, date: now / 1000 - 700 })])
    await vi.waitFor(() => expect(value.telegram.view().pendingLate).toBe(1))
    const run = buttons(value.api)[0]?.['callback_data']
    if (typeof run !== 'string') throw new Error('Missing late confirmation')
    value.telegram.stop()
    const again = fixture({ directory: value.directory, manager: { reply, pause } })
    await again.telegram.start()
    again.api.deliver([callback(3, run), message(4, '/pause', { replyTo: known })])
    await vi.waitFor(() => expect(reply).toHaveBeenCalledTimes(1))
    expect(reply.mock.calls[0]?.[2].workers).toEqual(['worker'])
    await vi.waitFor(() => expect(pause).toHaveBeenCalledTimes(1))
    await again.telegram.notify('Native permission', { id: 'native:card', choices: [{ label: 'Allow', value: 'allow' }] })
    const decision = 100 + sent(again.api).length
    again.telegram.resolve('native:card')
    again.api.deliver([message(5, 'allow', { replyTo: decision }), message(6, 'Ordinary instruction')])
    await vi.waitFor(() => expect(again.submit).toHaveBeenCalledWith('Ordinary instruction', 'telegram:6'))
    expect(reply).toHaveBeenCalledTimes(1)
    expect(again.answer).not.toHaveBeenCalled()
  })

  it('removes outer empty space and excess prose gaps without changing code indentation', async () => {
    const value = fixture()
    await paired(value)
    await value.telegram.notify('\n \n\nFirst paragraph.\n\n\n\nSecond paragraph.\n\n```ts\n  const value = 1\n\n\n\n  print(value)\n```\n\n\n')
    expect(sent(value.api).at(-1)?.body['text']).toBe('First paragraph.\n\nSecond paragraph.\n\n<pre><code class="language-ts">  const value = 1\n\n\n\n  print(value)</code></pre>')
    expect(sent(value.api).at(-1)?.body['parse_mode']).toBe('HTML')
    const before = sent(value.api).length
    await value.telegram.notify(' \n\n  ')
    expect(sent(value.api)).toHaveLength(before)
  })

  it('does not create whitespace-only chunks at Telegram message boundaries', async () => {
    const value = fixture()
    await paired(value)
    const before = sent(value.api).length
    await value.telegram.notify(`${'A'.repeat(3499)}\n\n\n\n${'B'.repeat(20)}`)
    const texts = sent(value.api).slice(before).map((one) => one.body['text'])
    expect(texts).toHaveLength(2)
    expect(texts.every((text) => typeof text === 'string' && text.trim() !== '' && !text.startsWith('\n') && !text.endsWith('\n'))).toBe(true)
  })

  it('preserves Unicode across outgoing chunk boundaries', async () => {
    const value = fixture()
    await paired(value)
    const before = sent(value.api).length
    const text = '😀'.repeat(3501)
    await value.telegram.notify(text)
    const texts = sent(value.api).slice(before).map((one) => String(one.body['text']))
    expect(texts.every((chunk) => chunk.length <= 3500 && !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(chunk))).toBe(true)
    expect(texts.join('')).toBe(text)
  })

  it('carries the paired user’s Computer Use decision through real Sessions and Manager, retaining guard-refused buttons', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'geckit-telegram-native-'))
    paths.push(directory)
    const notes = memoryNotes()
    const answers: { readonly ask: string; readonly answer: string }[] = []
    const hearings = new Map<string, (heard: Heard) => void>()
    let allowed = true
    const current: { manager?: Manager } = {}
    const sessions = new Sessions({
      notes, changed: (all) => current.manager?.observeSessions(all), items: () => undefined, notify: () => undefined, account: () => undefined,
      claude: (options, hear) => { hearings.set(options.id, hear); return { send: () => undefined, answer: (ask, answer) => { answers.push({ ask, answer }) }, stop: () => undefined, end: async () => undefined } },
      disk: { list: async () => [], read: async () => undefined, has: async () => false },
      claudeAccount: async () => ({ here: true, signedIn: true, plan: 'Max' }), claudeProgram: async () => undefined,
      usage: async () => ({ windows: new Map() }), beforeSend: async () => { if (!allowed) throw new Error('VPN check refused') },
    })
    const settings = { ...DEFAULT_SETTINGS, projects: [directory], chatProviders: ['claude'] as const, chatProvider: 'claude' as const }
    const coordinator = new Manager({ directory, sessions, notes, settings: () => settings, saveSettings: () => settings, cli: async () => { throw new Error('No CLI operation expected') } })
    current.manager = coordinator
    disposals.push(() => { coordinator.dispose(); sessions.dispose() })
    await coordinator.configure({ enabled: true })
    let view = await coordinator.view()
    const value = fixture({ directory, manager: {
      enabled: () => coordinator.enabled(), decisions: () => view.decisions, hasDecision: (id) => view.decisions.some((one) => one.id === id),
      answer: async (id, answer, authorized) => { await coordinator.answer(id, answer, authorized) },
    } })
    coordinator.on((changed) => { view = changed })
    await paired(value)
    const id = await sessions.startManaged({ root: directory, mode: 'manual', text: 'Inspect Mail' }, 'manager', 'native-mail')
    hearings.get(id)?.({ items: [], gone: [], signals: [{ kind: 'asks', ask: 'mail', wanted: { kind: 'elicitation', serverName: 'cua_repl', message: 'Allow Computer Use to use "Mail"?', fields: [], rememberAllowed: true } }] })
    const decision = view.decisions[0]
    if (decision === undefined) throw new Error('Missing native decision')
    value.api.deliver([message(2, '/status')])
    await vi.waitFor(() => expect(buttons(value.api).some((one) => one['text'] === 'Allow for this session')).toBe(true))
    const remember = buttons(value.api).find((one) => one['text'] === 'Allow for this session')?.['callback_data']
    if (typeof remember !== 'string') throw new Error('Missing remember action')
    allowed = false
    value.api.deliver([callback(3, remember, 82), callback(4, remember)])
    await vi.waitFor(() => expect(String(sent(value.api).at(-1)?.body['text'])).toContain('Answer was not sent'))
    expect(answers).toEqual([])
    expect(view.decisions.some((one) => one.id === decision.id)).toBe(true)
    allowed = true
    value.api.deliver([callback(5, remember), callback(6, remember)])
    await vi.waitFor(() => expect(answers).toEqual([{ ask: 'mail', answer: JSON.stringify({ action: 'accept', content: {}, _meta: null, remember: true }) }]))
    await vi.waitFor(() => expect(String(sent(value.api).at(-1)?.body['text'])).toContain('already been answered'))
    expect(view.decisions.some((one) => one.id === decision.id)).toBe(false)
    expect((await sessions.items(id)).find((one) => one.id === 'card:mail')).toMatchObject({ card: { answered: 'Accepted for this conversation: Allow Computer Use to use "Mail"?' } })
  })

  it('requires the deep link and exact desktop confirmation before accepting instructions, and seals credentials', async () => {
    const value = fixture()
    await value.telegram.action({ kind: 'connect', token })
    value.api.deliver([message(1, 'Build something'), message(2, '/start wrong'), message(3, `/start ${new URL(value.telegram.view().pairing?.url ?? '').searchParams.get('start') ?? ''}`)])
    await vi.waitFor(() => expect(value.telegram.view().state).toBe('confirming'))
    await value.telegram.action({ kind: 'confirm', userId: 82, chatId: 81 })
    expect(value.telegram.view().account).toBeUndefined()
    expect(value.submit).not.toHaveBeenCalled()
    await value.telegram.action({ kind: 'confirm', userId: 81, chatId: 81 })
    expect(value.telegram.view().account?.id).toBe(81)
    expect(JSON.stringify(value.telegram.view())).not.toContain(token)
    expect(readFileSync(join(value.directory, 'manager-telegram.sealed')).includes(Buffer.from(token))).toBe(false)
    expect(statSync(join(value.directory, 'manager-telegram.sealed')).mode & 0o777).toBe(0o600)
  })

  it('ignores other accounts, groups and repeated updates; keeps the accepted offset across restart', async () => {
    const value = fixture()
    await paired(value)
    value.api.deliver([message(2, 'Other user', { sender: 82 }), message(3, 'Group', { private: false }), message(4, 'Wrong private chat', { chat: 82 }), message(5, 'Do the task'), message(5, 'Duplicate')])
    await vi.waitFor(() => expect(value.submit).toHaveBeenCalledTimes(1))
    expect(value.submit).toHaveBeenCalledWith('Do the task', 'telegram:5')
    await vi.waitFor(() => expect(value.api.calls.filter((item) => item.method === 'getUpdates').at(-1)?.body['offset']).toBe(6))
    value.telegram.stop()
    const again = fixture({ directory: value.directory })
    await again.telegram.start()
    again.api.deliver([message(5, 'Replay'), message(6, 'Next task')])
    await vi.waitFor(() => expect(again.submit).toHaveBeenCalledTimes(1))
    expect(again.submit).toHaveBeenCalledWith('Next task', 'telegram:6')
  })

  it('holds delayed instructions for an explicit, account-bound decision and persists that decision', async () => {
    const value = fixture()
    await paired(value)
    value.api.deliver([message(2, 'Delayed task', { date: now / 1000 - 601 })])
    await vi.waitFor(() => expect(value.telegram.view().pendingLate).toBe(1))
    expect(value.submit).not.toHaveBeenCalled()
    const run = buttons(value.api)[0]?.['callback_data']
    expect(typeof run).toBe('string')
    if (typeof run !== 'string') return
    value.telegram.stop()
    const again = fixture({ directory: value.directory })
    await again.telegram.start()
    again.api.deliver([callback(3, run, 82), callback(4, run, 81, 82), callback(5, run), callback(6, run)])
    await vi.waitFor(() => expect(again.submit).toHaveBeenCalledTimes(1))
    expect(again.submit).toHaveBeenCalledWith('Delayed task', expect.stringMatching(/^telegram:late:/))
    expect(again.telegram.view().pendingLate).toBe(0)
  })

  it('binds question buttons and replies to the pending decision, and invalidates resolved buttons', async () => {
    const value = fixture()
    await paired(value)
    await value.telegram.notify('Which project?', { id: 'question-1', choices: [{ label: 'GeckIt', value: 'geckit' }] })
    const run = buttons(value.api)[0]?.['callback_data']
    if (typeof run !== 'string') throw new Error('Missing button')
    value.api.deliver([callback(2, run, 82), callback(3, run)])
    await vi.waitFor(() => expect(value.answer).toHaveBeenCalledWith('question-1', 'geckit', expect.any(Function)))
    await value.telegram.notify('Explain the requirement', { id: 'question-2', choices: [] })
    value.api.deliver([message(4, 'Use the local project', { replyTo: 100 + sent(value.api).length })])
    await vi.waitFor(() => expect(value.answer).toHaveBeenCalledWith('question-2', 'Use the local project', expect.any(Function)))
    await value.telegram.notify('Old question', { id: 'question-3', choices: [{ label: 'Yes', value: 'yes' }] })
    const old = buttons(value.api)[0]?.['callback_data']
    value.telegram.resolve('question-3')
    if (typeof old === 'string') value.api.deliver([callback(5, old)])
    await vi.waitFor(() => expect(sent(value.api).at(-1)?.body['text']).toContain('no longer available'))
    expect(value.answer).toHaveBeenCalledTimes(2)
  })

  it('serves fresh status after an outage, and never enables a disabled manager remotely', async () => {
    const pause = vi.fn<TelegramManager['pause']>(async () => undefined)
    const value = fixture({ manager: { enabled: () => false, pause } })
    await paired(value)
    value.api.deliver([message(2, '/status', { date: now / 1000 - 800 }), message(3, '/pause'), message(4, 'Enable yourself')])
    await vi.waitFor(() => expect(sent(value.api).filter((item) => String(item.body['text']).includes('disabled'))).toHaveLength(2))
    expect(sent(value.api).some((item) => item.body['text'] === 'Manager is idle.')).toBe(true)
    expect(pause).not.toHaveBeenCalled()
    expect(value.submit).not.toHaveBeenCalled()
  })

  it('keeps setup in GeckIt and explains supported Telegram approvals', async () => {
    const value = fixture()
    await paired(value)
    value.api.deliver([message(2, '/settings'), message(3, '/help')])
    await vi.waitFor(() => expect(sent(value.api).some((item) => String(item.body['text']).includes('approvals that can be answered here'))).toBe(true))
    const settings = sent(value.api).find((item) => String(item.body['text']).includes('changes the assistant'))?.body['text']
    expect(settings).toContain('GeckIt → Settings → Manager')
    expect(settings).toContain('Talk to Manager here')
    await value.telegram.notify('A'.repeat(32_769))
    expect(sent(value.api).at(-1)?.body['text']).toContain('Ask Manager here for a shorter summary or the missing part.')
    expect(value.submit).not.toHaveBeenCalled()
  })

  it('draws what Manager writes with Telegram’s own formatting, and sends the plain words if Telegram refuses it', async () => {
    const value = fixture()
    await paired(value)
    await value.telegram.notify('## Done\n\n**Shipped** the fix in `useChat.ts`.')
    expect(sent(value.api).at(-1)?.body).toMatchObject({ text: '<b>Done</b>\n\n<b>Shipped</b> the fix in <code>useChat.ts</code>.', parse_mode: 'HTML' })
    value.api.refuseFormatting()
    await value.telegram.notify('**Shipped** again.')
    expect(sent(value.api).at(-1)?.body['text']).toBe('**Shipped** again.')
    expect(sent(value.api).at(-1)?.body['parse_mode']).toBeUndefined()
  })

  it('fills Telegram’s command menu once the account is confirmed', async () => {
    const value = fixture()
    await paired(value)
    await vi.waitFor(() => expect(value.api.calls.some((item) => item.method === 'setMyCommands')).toBe(true))
    const commands = value.api.calls.find((item) => item.method === 'setMyCommands')?.body['commands']
    expect(Array.isArray(commands) ? commands.map((one) => jsonObject(one)?.['command']) : []).toEqual(['status', 'pause', 'resume', 'settings', 'help'])
  })

  it('acknowledges an instruction as a reply to it, and takes the buttons off a question it has answered', async () => {
    const answered = { yet: false }
    const value = fixture({ manager: { decisions: () => [], hasDecision: (id) => id === 'd1' && !answered.yet } })
    value.answer.mockImplementation(async () => { answered.yet = true })
    await paired(value)
    value.api.deliver([message(2, 'Do the task')])
    await vi.waitFor(() => expect(value.submit).toHaveBeenCalled())
    await vi.waitFor(() => expect(jsonObject(sent(value.api).at(-1)?.body['reply_parameters'])?.['message_id']).toBe(2))
    await value.telegram.notify('Allow this?', { id: 'd1', choices: [{ label: 'Allow', value: 'allow' }] })
    const asked = Number(sent(value.api).length) + 100
    const token = buttons(value.api).find((one) => one['text'] === 'Allow')?.['callback_data']
    if (typeof token !== 'string') throw new Error('Missing question button')
    value.api.deliver([callback(3, token, 81, 81, asked)])
    await vi.waitFor(() => expect(value.answer).toHaveBeenCalledWith('d1', 'allow', expect.any(Function)))
    await vi.waitFor(() => expect(value.api.calls.some((item) => item.method === 'editMessageReplyMarkup' && item.body['message_id'] === asked)).toBe(true))
    expect(jsonObject(sent(value.api).at(-1)?.body['reply_parameters'])?.['message_id']).toBe(asked)
  })

  it('fails closed when secure storage is unavailable', async () => {
    const value = fixture({ store: { ...vault, available: () => false } })
    await value.telegram.action({ kind: 'connect', token })
    expect(value.telegram.view()).toMatchObject({ state: 'storage-error' })
    expect(value.api.calls).toEqual([])
  })

  it('keeps an existing connection when replacement pairing is cancelled', async () => {
    const value = fixture()
    await paired(value)
    await value.telegram.action({ kind: 'connect', token: '654321:another_secret_example_token_for_tests' })
    expect(value.telegram.view().state).toBe('pairing')
    expect(value.telegram.view().account?.id).toBe(81)
    await value.telegram.action({ kind: 'cancel-pairing' })
    expect(value.telegram.view().state).toBe('connected')
    value.api.deliver([message(2, 'Original connection')])
    await vi.waitFor(() => expect(value.submit).toHaveBeenCalledWith('Original connection', 'telegram:2'))
  })

  it('reports revoked and competing receiver errors without revealing API descriptions or token URLs', async () => {
    const value = fixture()
    await paired(value)
    value.api.failPoll(409)
    await vi.waitFor(() => expect(value.telegram.view().state).toBe('conflict'))
    await value.telegram.action({ kind: 'retry' })
    value.api.failPoll(401)
    await vi.waitFor(() => expect(value.telegram.view().state).toBe('revoked'))
    expect(JSON.stringify(value.telegram.view())).not.toContain(token)
    expect(value.api.calls.some((item) => item.method === 'deleteWebhook')).toBe(false)
  })

  it('does not blindly retry uncertain outgoing sends, and reports the uncertainty after restart', async () => {
    const value = fixture()
    await paired(value)
    value.api.failSend()
    await value.telegram.notify('Task complete')
    expect(sent(value.api).filter((item) => item.body['text'] === 'Task complete')).toHaveLength(1)
    expect(value.telegram.view().detail).toContain('not retried')
    expect(JSON.stringify(value.telegram.view())).not.toContain(token)
    value.telegram.stop()
    const again = fixture({ directory: value.directory })
    await again.telegram.start()
    expect(again.telegram.view().detail).toContain('interrupted')
    expect(sent(again.api)).toEqual([])
  })

  it('does not replay an instruction whose dispatch was interrupted by a crash', async () => {
    let finish: (() => void) | undefined
    const value = fixture({ manager: { submit: () => new Promise<void>((done) => { finish = done }) } })
    await paired(value)
    value.api.deliver([message(2, 'Possibly dispatched')])
    await vi.waitFor(() => expect(finish).toBeDefined())
    value.telegram.stop()
    const again = fixture({ directory: value.directory })
    await again.telegram.start()
    expect(again.telegram.view().detail).toContain('interrupted')
    again.api.deliver([message(2, 'Possibly dispatched')])
    await vi.waitFor(() => expect(again.api.calls.filter((item) => item.method === 'getUpdates').at(-1)?.body['offset']).toBe(3))
    expect(again.submit).not.toHaveBeenCalled()
    finish?.()
  })

  it('explains unsupported attachments only to the confirmed private account', async () => {
    const value = fixture()
    await paired(value)
    const attachment = (id: number, sender: number): Json => ({ update_id: id, message: { message_id: id, date: now / 1000, chat: { id: 81, type: 'private' }, from: { ...user, id: sender }, document: { file_id: 'doc' } } })
    value.api.deliver([attachment(2, 82), attachment(3, 81)])
    await vi.waitFor(() => expect(sent(value.api).filter((item) => String(item.body['text']).includes('attachments are not supported'))).toHaveLength(1))
    expect(value.submit).not.toHaveBeenCalled()
  })

  it('keeps a decision usable after Manager rejects an answer while paused', async () => {
    const answer = vi.fn<NonNullable<TelegramManager['answer']>>().mockRejectedValueOnce(new Error('Resume Manager before answering.')).mockResolvedValue(undefined)
    const value = fixture({ manager: { answer } })
    await paired(value)
    await value.telegram.notify('Allow this operation?', { id: 'approval', choices: [{ label: 'Allow', value: 'allow' }] })
    const data = buttons(value.api)[0]?.['callback_data']
    if (typeof data !== 'string') throw new Error('Missing approval button')
    value.api.deliver([callback(2, data)])
    await vi.waitFor(() => expect(sent(value.api).at(-1)?.body['text']).toContain('Use /resume here'))
    expect(value.telegram.view().state).toBe('connected')
    value.api.deliver([callback(3, data)])
    await vi.waitFor(() => expect(answer).toHaveBeenCalledTimes(2))
  })

  it('bounds delayed instructions and directs overflow to GeckIt without running it', async () => {
    const value = fixture()
    await paired(value)
    value.api.deliver(Array.from({ length: 129 }, (_item, index) => message(index + 2, `Delayed ${String(index)}`, { date: now / 1000 - 700 })))
    await vi.waitFor(() => expect(sent(value.api).at(-1)?.body['text']).toContain('Too many decisions'), { timeout: 3_000 })
    expect(value.telegram.view().pendingLate).toBe(128)
    expect(value.submit).not.toHaveBeenCalled()
    const stored = jsonObject(JSON.parse(vault.decrypt(readFileSync(join(value.directory, 'manager-telegram.sealed')))) as Json)
    expect(Array.isArray(stored?.['callbacks']) && stored['callbacks'].length).toBe(256)
    await value.telegram.notify('Too many choices', { id: 'overflow', choices: Array.from({ length: 51 }, (_item, index) => ({ label: `Choice ${String(index)}`, value: String(index) })) })
    expect(sent(value.api).at(-1)?.body['text']).toContain('ask Manager to show this question again')
    expect(sent(value.api).at(-1)?.body['reply_markup']).toBeUndefined()
  })

  it('does not resurrect pairing when a verification response completes after disconnect', async () => {
    const api = botApi()
    let complete: (() => void) | undefined
    const verified = new Promise<void>((done) => { complete = done })
    const gated: typeof fetch = async (input, init) => { if (String(input).endsWith('/getMe')) await verified; return api.fetch(input, init) }
    const value = fixture({ api: { ...api, fetch: gated } })
    const connecting = value.telegram.action({ kind: 'connect', token })
    await value.telegram.action({ kind: 'disconnect' })
    complete?.()
    await connecting
    expect(value.telegram.view().state).toBe('disconnected')
    expect(value.telegram.view().pairing).toBeUndefined()
    expect(existsSync(join(value.directory, 'manager-telegram.sealed'))).toBe(false)
  })

  it('revokes persisted credentials when Manager is disabled and rejects Telegram actions from a phone', async () => {
    const value = fixture()
    await paired(value)
    const off = { config: DEFAULT_MANAGER_CONFIG, state: 'off' as const, workers: [], activity: [], providers: [], decisions: [], queued: 0 }
    await configureManagerAccess({ configure: async () => off }, value.telegram, { enabled: false })
    expect(value.telegram.view().state).toBe('disconnected')
    expect(existsSync(join(value.directory, 'manager-telegram.sealed'))).toBe(false)
    await expect(telegramActionAccess({ enabled: () => true }, value.telegram, { kind: 'connect', token }, false)).rejects.toThrow('on the computer')
    await expect(telegramActionAccess({ enabled: () => false }, value.telegram, { kind: 'connect', token }, true)).rejects.toThrow('Enable Manager')
    const publicView = phoneTelegramView({ state: 'confirming', pendingLate: 0, pairing: { url: 'https://t.me/bot?start=secret', expiresAt: now }, candidate: { id: 81, chatId: 81, name: 'Alex' } })
    expect(publicView.pairing).toBeUndefined()
    expect(publicView.candidate).toBeUndefined()
  })

  it('rejects Electron Linux basic_text fallback while permitting a protected backend', () => {
    const storage = { isEncryptionAvailable: () => true, getSelectedStorageBackend: () => 'basic_text' as const, encryptString: vault.encrypt, decryptString: vault.decrypt }
    expect(telegramVault(storage, 'linux').available()).toBe(false)
    expect(telegramVault({ ...storage, getSelectedStorageBackend: () => 'gnome_libsecret' }, 'linux').available()).toBe(true)
    expect(telegramVault(storage, 'darwin').available()).toBe(true)
    expect(telegramVault({ ...storage, isEncryptionAvailable: () => false }, 'win32').available()).toBe(false)
  })
})
