import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Json, JsonObject } from '../src/shared/elicitation'
import { jsonObject } from '../src/shared/elicitation'
import { Shares } from '../src/main/shares'
import { ManagerTelegram } from '../src/main/telegram'
import type { TelegramVault } from '../src/main/telegram'

const token = '123456:very_secret_example_token_for_tests'
const now = 1_800_000_000_000
const user = { id: 81, is_bot: false, first_name: 'Alex', username: 'alex' }
const xor = (bytes: Buffer): Buffer => Buffer.from(bytes.map((byte) => byte ^ 123))
const vault: TelegramVault = { available: () => true, encrypt: (text) => xor(Buffer.from(text)), decrypt: (bytes) => xor(bytes).toString() }
const cleanup: (() => void)[] = []
afterEach(() => { for (const one of cleanup.splice(0)) one() })

interface Call {
  readonly method: string
  readonly body: JsonObject
}

function botApi(): { readonly fetch: typeof fetch; readonly calls: Call[]; readonly deliver: (updates: Json[]) => void } {
  const calls: Call[] = []
  const waiting: ((response: Response) => void)[] = []
  const pending: Response[] = []
  let messageId = 100
  const response = (result: Json): Response => Response.json({ ok: true, result })
  const fetcher: typeof fetch = async (input, init) => {
    const method = String(input).split('/').at(-1) ?? ''
    const body = typeof init?.body === 'string' ? jsonObject(JSON.parse(init.body) as Json) ?? {} : {}
    calls.push({ method, body })
    if (method === 'getMe') return response({ id: 1, username: 'geckit_test_bot', is_bot: true })
    if (method === 'getWebhookInfo') return response({ url: '' })
    if (method === 'sendMessage') return response({ message_id: ++messageId })
    if (method === 'getUpdates') {
      const next = pending.shift()
      if (next !== undefined) return next
      return new Promise<Response>((resolve, reject) => {
        const answer = (value: Response): void => resolve(value)
        waiting.push(answer)
        init?.signal?.addEventListener('abort', () => { const at = waiting.indexOf(answer); if (at !== -1) waiting.splice(at, 1); reject(new Error('Aborted')) }, { once: true })
      })
    }
    return response(true)
  }
  return { fetch: fetcher, calls, deliver: (updates) => { const value = response(updates); const waiter = waiting.shift(); if (waiter === undefined) pending.push(value); else waiter(value) } }
}

const message = (id: number, text: string, sender = 81): Json => ({ update_id: id, message: { message_id: id, date: now / 1000, chat: { id: sender, type: 'private' }, from: { ...user, id: sender }, text } })
const press = (id: number, data: string, sender = 81): Json => ({ update_id: id, callback_query: { id: `q${String(id)}`, data, from: { ...user, id: sender }, message: { message_id: 500 + id, date: now / 1000, chat: { id: sender, type: 'private' } } } })
const sent = (api: ReturnType<typeof botApi>): Call[] => api.calls.filter((call) => call.method === 'sendMessage')
const rows = (call: Call | undefined): JsonObject[][] => {
  const keyboard = jsonObject(call?.body['reply_markup'])?.['inline_keyboard']
  return Array.isArray(keyboard) ? keyboard.map((row) => (Array.isArray(row) ? row.flatMap((item) => { const object = jsonObject(item); return object === undefined ? [] : [object] }) : [])) : []
}

async function setUp(enabled = true): Promise<{ readonly telegram: ManagerTelegram; readonly api: ReturnType<typeof botApi>; readonly shares: Shares; readonly project: string }> {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'geckit-links-')))
  const project = join(home, 'app')
  const { mkdirSync } = await import('node:fs')
  mkdirSync(project)
  writeFileSync(join(project, 'report.html'), '<p>Report</p>')
  writeFileSync(join(project, '.env'), 'TOKEN=1')
  const api = botApi()
  const holder: { telegram?: ManagerTelegram } = {}
  const shares = new Shares({ home, now: () => now, changed: () => undefined, ended: (id) => holder.telegram?.linkEnded(id) })
  const telegram = new ManagerTelegram({ directory: home, vault, fetch: api.fetch, now: () => now, changed: () => undefined, shares, manager: { submit: async () => undefined, pause: async () => undefined, resume: async () => undefined, status: () => 'idle', enabled: () => enabled } })
  holder.telegram = telegram
  cleanup.push(() => { telegram.stop(); shares.stopAll(); rmSync(home, { recursive: true, force: true }) })
  await telegram.action({ kind: 'connect', token })
  api.deliver([message(1, `/start ${new URL(telegram.view().pairing?.url ?? '').searchParams.get('start') ?? ''}`)])
  await vi.waitFor(() => expect(telegram.view().candidate?.id).toBe(81))
  await telegram.action({ kind: 'confirm', userId: 81, chatId: 81 })
  return { telegram, api, shares, project }
}

describe('opening what a Manager message names, from Telegram', () => {
  it('offers a button for each target that may be shared, and shares nothing until one is pressed', async () => {
    const { telegram, api, shares, project } = await setUp()
    await telegram.notify(`Done. It runs at http://localhost:5173/app and the report is ${join(project, 'report.html')}. Secrets: ${join(project, '.env')}, ${join(project, 'gone.md')}`)
    const offered = rows(sent(api).at(-1))
    expect(offered.map((row) => row.map((button) => button['text']))).toEqual([['Open localhost:5173'], ['Open report.html']])
    expect(offered.flat().every((button) => typeof button['callback_data'] === 'string' && button['url'] === undefined)).toBe(true)
    expect(shares.list()).toEqual([])
  })

  it('shares the pressed file with a link button and Stop, for the paired account only', async () => {
    const { telegram, api, shares, project } = await setUp()
    await telegram.notify(`Report: ${join(project, 'report.html')}`)
    const offer = String(rows(sent(api).at(-1))[0]?.[0]?.['callback_data'])
    const before = sent(api).length
    api.deliver([press(10, offer, 99)])
    api.deliver([press(11, offer)])
    await vi.waitFor(() => expect(shares.list()).toHaveLength(1))
    await vi.waitFor(() => expect(sent(api).length).toBeGreaterThan(before))
    const reply = sent(api).at(-1)
    const replyId = 100 + sent(api).length
    expect(sent(api).slice(before)).toHaveLength(1)
    expect(reply?.body['text']).toBe('<b>report.html is shared for 12 hours.</b>\nOpen it from any phone or computer while GeckIt stays open here. Anyone with this link can see it until it ends.')
    expect(reply?.body['link_preview_options']).toEqual({ is_disabled: true })
    const [[open], [stop]] = rows(reply) as [[JsonObject], [JsonObject]]
    expect(open['text']).toBe('Open report.html')
    expect(String(open['url'])).toMatch(/^https:\/\/geckit-signal\.web\.app\/#[A-Za-z0-9_-]{43}$/)
    expect(String(reply?.body['text'])).not.toContain(String(open['url']).split('#')[1])
    expect(telegram.view().links?.map((one) => one.title)).toEqual(['report.html'])

    api.deliver([press(12, String(stop['callback_data']))])
    await vi.waitFor(() => expect(shares.list()).toEqual([]))
    await vi.waitFor(() => expect(sent(api).at(-1)?.body['text']).toBe('Stopped sharing report.html. The link no longer opens.'))
    expect(api.calls.some((call) => call.method === 'editMessageReplyMarkup' && call.body['message_id'] === replyId)).toBe(true)
  })

  it('hands back the same link on a second press, and refuses when Manager is off', async () => {
    const { telegram, api, shares, project } = await setUp()
    await telegram.notify(`Report: ${join(project, 'report.html')}`)
    const offer = String(rows(sent(api).at(-1))[0]?.[0]?.['callback_data'])
    api.deliver([press(10, offer)])
    await vi.waitFor(() => expect(shares.list()).toHaveLength(1))
    api.deliver([press(11, offer)])
    await vi.waitFor(() => expect(sent(api).at(-1)?.body['text']).toBe('<b>report.html is already shared.</b> The link ends in 12 h.'))
    expect(shares.list()).toHaveLength(1)

    const off = await setUp(false)
    await off.telegram.notify(`Report: ${join(off.project, 'report.html')}`)
    off.api.deliver([press(10, String(rows(sent(off.api).at(-1))[0]?.[0]?.['callback_data']))])
    await vi.waitFor(() => expect(sent(off.api).at(-1)?.body['text']).toBe('Manager is disabled. Enable it in GeckIt Settings → Manager before sharing.'))
    expect(off.shares.list()).toEqual([])
  })

  it('lists live links with /links, stops one from there, and ends every link on disconnect', async () => {
    const { telegram, api, shares, project } = await setUp()
    api.deliver([message(20, '/links')])
    await vi.waitFor(() => expect(sent(api).at(-1)?.body['text']).toBe('Nothing is shared. A button appears under a Manager message that names a localhost address or a file.'))
    await shares.open(join(project, 'report.html'))
    await shares.open(project)
    api.deliver([message(21, '/links')])
    await vi.waitFor(() => expect(String(sent(api).at(-1)?.body['text'])).toContain('<b>Shared links</b> (2)'))
    const stops = rows(sent(api).at(-1))
    expect(stops.map((row) => row[0]?.['text'])).toEqual(['Stop report.html', 'Stop app/'])
    api.deliver([press(22, String(stops[0]?.[0]?.['callback_data']))])
    await vi.waitFor(() => expect(shares.list().map((one) => one.title)).toEqual(['app/']))
    await telegram.action({ kind: 'stop-link', id: shares.list()[0]?.id ?? '' })
    expect(shares.list()).toEqual([])
    await shares.open(project)
    await telegram.action({ kind: 'disconnect' })
    expect(shares.list()).toEqual([])
  })
})
