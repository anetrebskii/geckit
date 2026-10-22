import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import type { Json, JsonObject } from '../src/shared/elicitation'
import { jsonObject } from '../src/shared/elicitation'
import { readShareLink } from '../src/shared/share'
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

const server = createServer((_request, answer) => { answer.writeHead(200, { 'content-type': 'text/plain' }); answer.end('page') })
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
const site = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`
afterAll(() => { server.close() })
const links = (text: string): string[] => [...text.matchAll(/<a href="(https:\/\/geckit-signal\.web\.app\/#[A-Za-z0-9_-]{43}\.[a-z0-9]+)">([^<]*)<\/a>/g)].map((one) => `${one[2] ?? ''} ${one[1] ?? ''}`)

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
  it('puts the link in place of the words, and leaves what cannot be shared as Manager wrote it', async () => {
    const { telegram, api, shares, project } = await setUp()
    await telegram.notify(`Done. It runs at ${site}/app and the report is ${join(project, 'report.html')}. Secrets: ${join(project, '.env')}, ${join(project, 'gone.md')}`)
    const body = String(sent(api).at(-1)?.body['text'])
    expect(links(body).map((one) => one.split(' ')[0])).toEqual([`${site}/app`, join(project, 'report.html')])
    expect(body).toContain(`Secrets: ${join(project, '.env')}, ${join(project, 'gone.md')}`)
    expect(rows(sent(api).at(-1))).toEqual([])
    expect(sent(api).at(-1)?.body['link_preview_options']).toEqual({ is_disabled: true })
    expect(shares.list().map((one) => one.title)).toEqual([new URL(site).host, 'report.html'])
    expect(links(body).map((one) => readShareLink(new URL(one.slice(one.lastIndexOf(' ') + 1)).hash)?.expiresAt)).toEqual(shares.list().map((one) => one.expiresAt))
    expect(telegram.view().links?.map((one) => one.title)).toEqual([new URL(site).host, 'report.html'])
  })

  it('shares each target once, so the same words in a later message carry the same link', async () => {
    const { telegram, api, shares, project } = await setUp()
    await telegram.notify(`Report: ${join(project, 'report.html')}`)
    const first = links(String(sent(api).at(-1)?.body['text']))
    await telegram.notify(`Still here: ${join(project, 'report.html')}`)
    expect(links(String(sent(api).at(-1)?.body['text']))).toEqual(first)
    expect(shares.list()).toHaveLength(1)
  })

  it('links a path written as code, and leaves a fenced block alone', async () => {
    const { telegram, api, shares, project } = await setUp()
    await telegram.notify(`Open \`${join(project, 'report.html')}\`\n\n\`\`\`\ncat ${join(project, 'report.html')}\n\`\`\``)
    const body = String(sent(api).at(-1)?.body['text'])
    expect(links(body).map((one) => one.split(' ')[0])).toEqual([join(project, 'report.html')])
    expect(body).toContain(`<pre>cat ${join(project, 'report.html')}</pre>`)
    expect(shares.list()).toHaveLength(1)
  })

  it('stops a link from Settings, and the Stop button left in Telegram says so', async () => {
    const { telegram, api, shares, project } = await setUp()
    await telegram.notify(`Report: ${join(project, 'report.html')}`)
    api.deliver([message(20, '/links')])
    await vi.waitFor(() => expect(String(sent(api).at(-1)?.body['text'])).toContain('<b>Shared links</b> (1)'))
    const stop = String(rows(sent(api).at(-1))[0]?.[0]?.['callback_data'])
    await telegram.action({ kind: 'stop-link', id: shares.list()[0]?.id ?? '' })
    expect(shares.list()).toEqual([])
    api.deliver([press(21, stop)])
    await vi.waitFor(() => expect(sent(api).at(-1)?.body['text']).toBe('This action has already been answered or is no longer available. Use /status or ask Manager here for the current question.'))
  })

  it('lists live links with /links, stops one from there, and ends every link on disconnect', async () => {
    const { telegram, api, shares, project } = await setUp()
    api.deliver([message(20, '/links')])
    await vi.waitFor(() => expect(sent(api).at(-1)?.body['text']).toBe('Nothing is shared. A link appears in a Manager message that names a localhost address or a file.'))
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
