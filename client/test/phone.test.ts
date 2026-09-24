import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { startPhone } from '../src/main/phone'
import type { Phone } from '../src/main/phone'

const PORT = 47899
const KEY = 'the-key'
const AT = `http://127.0.0.1:${String(PORT)}`
const IN = { cookie: `geckit=${KEY}` }

let phone: Phone
let heard: unknown[] = []

beforeAll(async () => {
  const folder = mkdtempSync(join(tmpdir(), 'phone-'))
  mkdirSync(join(folder, 'renderer'))
  writeFileSync(join(folder, 'renderer', 'phone.html'), '<p>board</p>')
  writeFileSync(join(folder, 'secret.txt'), 'not for the phone')
  phone = await startPhone({
    port: PORT,
    key: KEY,
    pages: { folder: join(folder, 'renderer') },
    boot: { home: '/Users/someone', platform: 'darwin' },
    calls: {
      'chat.list': (root: string | undefined) => {
        heard = [root]
        return [{ id: 'one' }]
      },
      'chat.stop': () => undefined,
    },
  })
})

afterAll(() => phone.close())

const call = (name: string, args: unknown[]): Promise<Response> =>
  fetch(`${AT}/phone/call`, { method: 'POST', headers: IN, body: JSON.stringify({ name, args }) })

describe('the phone server', () => {
  it('lets nothing in without the key', async () => {
    expect((await fetch(`${AT}/`)).status).toBe(401)
    expect((await fetch(`${AT}/phone/call`, { method: 'POST', body: '{}' })).status).toBe(401)
    expect((await fetch(`${AT}/`, { headers: { cookie: 'geckit=wrong' } })).status).toBe(401)
  })

  it('keeps the key from the link in a cookie and serves the page', async () => {
    const answer = await fetch(`${AT}/?key=${KEY}`)
    expect(answer.status).toBe(200)
    expect(answer.headers.get('set-cookie')).toContain(`geckit=${KEY}`)
    expect(answer.headers.get('set-cookie')).toContain('HttpOnly')
    expect(await answer.text()).toBe('<p>board</p>')
  })

  it('serves nothing outside the renderer folder', async () => {
    expect((await fetch(`${AT}/%2e%2e/secret.txt`, { headers: IN })).status).toBe(404)
  })

  it('hands a call over, with null read as nothing', async () => {
    const answer = await call('chat.list', [null])
    expect(await answer.json()).toEqual([{ id: 'one' }])
    expect(heard).toEqual([undefined])
    expect(await (await call('chat.stop', ['one'])).text()).toBe('')
  })

  it('refuses a call that is not on the list', async () => {
    expect((await call('toString', [])).status).toBe(404)
    expect((await call('chat.delete', [['one']])).status).toBe(404)
  })

  it('says what it was told on the event stream', async () => {
    const stream = await fetch(`${AT}/phone/events`, { headers: IN })
    const reader = stream.body!.getReader()
    await reader.read()
    phone.tell('chat:sessions', [{ id: 'one' }])
    const said = new TextDecoder().decode((await reader.read()).value)
    expect(said).toBe('event: chat:sessions\ndata: [{"id":"one"}]\n\n')
    await reader.cancel()
  })

  it('gives the page what the preload gives a window', async () => {
    expect(await (await fetch(`${AT}/phone/boot.js`, { headers: IN })).text()).toBe(
      'window.geckitBoot = {"home":"/Users/someone","platform":"darwin"}\n',
    )
  })
})
