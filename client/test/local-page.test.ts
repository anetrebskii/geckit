import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterAll, describe, expect, it } from 'vitest'

import { localFetch } from '../src/main/local-page'
import { isLocal, toMac, toPhone } from '../src/shared/local'

const seen: { origin: string | undefined; cookie: string | undefined; host: string | undefined }[] = []
const server = createServer((request, answer) => {
  seen.push({ origin: request.headers.origin, cookie: request.headers.cookie, host: request.headers.host })
  if (request.url === '/login') {
    answer.writeHead(302, { location: '/home', 'set-cookie': 'sid=abc; Path=/; HttpOnly' })
    answer.end()
  } else if (request.url === '/away') {
    answer.writeHead(302, { location: 'https://example.com/' })
    answer.end()
  } else {
    answer.writeHead(200, { 'content-type': 'text/html' })
    answer.end(`page ${request.url ?? ''}`)
  }
})
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
const port = (server.address() as AddressInfo).port
const base = `geckit-local://127.0.0.1:${String(port)}`
const ask = (path: string, headers: [string, string][] = []): ReturnType<typeof localFetch> =>
  localFetch({ url: `${base}${path}`, method: 'GET', headers, body: '' })
const text = (body: string): string => Buffer.from(body, 'base64').toString()

afterAll(() => server.close())

describe('a page off the Mac localhost, for the phone', () => {
  it('tells an address on the computer itself from the web', () => {
    expect(isLocal('http://localhost:5173/a')).toBe(true)
    expect(isLocal('http://127.0.0.1:3000')).toBe(true)
    expect(isLocal('http://[::1]:3000')).toBe(true)
    expect(isLocal('https://localhost:3000')).toBe(false)
    expect(isLocal('http://example.com')).toBe(false)
    expect(toMac(toPhone('http://localhost:5173/a?b=1'))).toBe('http://localhost:5173/a?b=1')
  })

  it('is asked on the Mac as http, with the origin the server knows', async () => {
    const got = await ask('/app', [['Origin', base]])
    expect(got.status).toBe(200)
    expect(text(got.body)).toBe('page /app')
    expect(seen.at(-1)).toMatchObject({ origin: `http://127.0.0.1:${String(port)}`, host: `127.0.0.1:${String(port)}` })
  })

  it('follows a redirect on the Mac, keeps its cookie, and says where it ended', async () => {
    const got = await ask('/login')
    expect(text(got.body)).toBe('page /home')
    expect(got.moved).toBe(`${base}/home`)
    await ask('/next')
    expect(seen.at(-1)?.cookie).toBe('sid=abc')
  })

  it('hands a redirect off the Mac to the page', async () => {
    const got = await ask('/away')
    expect(got.status).toBe(302)
    expect(got.headers).toContainEqual(['location', 'https://example.com/'])
  })

  it('says so when nothing answers there', async () => {
    const got = await localFetch({ url: 'geckit-local://127.0.0.1:1/', method: 'GET', headers: [], body: '' })
    expect(got.status).toBe(502)
    expect(text(got.body)).toContain('Nothing answers at 127.0.0.1:1 on the Mac')
  })
})
