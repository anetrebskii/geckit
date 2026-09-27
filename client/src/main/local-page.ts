import { request } from 'node:http'
import type { IncomingHttpHeaders } from 'node:http'

import { isLocal, toMac, toPhone } from '../shared/local'
import type { LocalAnswer, LocalAsk } from '../shared/local'

// What one answer may carry to the phone; a dev server's biggest bundle is well under it.
const MOST = 32 * 1024 * 1024
const HOPS = 5
// Hop-by-hop, or no longer true once the body is handed over whole and uncompressed.
const DROPPED = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length', 'set-cookie'])
// The phone's web view keeps no cookies for its own scheme, so the Mac keeps them, by host and port, while it runs.
const jars = new Map<string, Map<string, string>>()

interface Got {
  readonly status: number
  readonly headers: IncomingHttpHeaders
  readonly body: Buffer
}

/** A request from a page the phone shows, made to the Mac's own localhost; redirects within it are followed here. */
export async function localFetch(asked: LocalAsk): Promise<LocalAnswer> {
  let url = toMac(asked.url)
  let method = asked.method
  let body = asked.body === '' ? undefined : Buffer.from(asked.body, 'base64')
  for (let hop = 0; ; hop++) {
    if (!isLocal(url)) return nothing('Only an address on the Mac itself opens here.')
    const at = new URL(url)
    const got = await once(at, method, asked.headers, body).catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))))
    if (got instanceof Error) {
      return nothing(
        /ECONNREFUSED/.test(got.message)
          ? `Nothing answers at ${at.host} on the Mac. The server may have stopped.`
          : `${at.host} on the Mac did not answer: ${got.message}`,
      )
    }
    const location = single(got.headers.location)
    if (got.status >= 300 && got.status < 400 && location !== undefined && hop < HOPS && isLocal(new URL(location, url).href)) {
      if (got.status === 303 || ((got.status === 301 || got.status === 302) && method === 'POST')) {
        method = 'GET'
        body = undefined
      }
      url = new URL(location, url).href
      continue
    }
    const headers = Object.entries(got.headers).flatMap(([name, value]): [string, string][] =>
      value === undefined || DROPPED.has(name) ? [] : [[name, name === 'location' && isLocal(String(value)) ? toPhone(String(value)) : single(value) ?? '']],
    )
    return { status: got.status, headers, body: got.body.toString('base64'), ...(url === toMac(asked.url) ? {} : { moved: toPhone(url) }) }
  }
}

const single = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value.join(', ') : value)

function once(at: URL, method: string, asked: LocalAsk['headers'], body: Buffer | undefined): Promise<Got> {
  const jar = jars.get(at.host) ?? new Map<string, string>()
  jars.set(at.host, jar)
  const headers: Record<string, string> = {}
  for (const [name, value] of asked) {
    const lower = name.toLowerCase()
    // The page's own origin is the scheme the phone gave it; the server knows it as the Mac's http one.
    if (lower === 'origin' || lower === 'referer') headers[lower] = toMac(value)
    else if (lower !== 'host' && lower !== 'accept-encoding' && lower !== 'content-length') headers[lower] = value
  }
  const kept = [...jar].map(([name, value]) => `${name}=${value}`)
  if (kept.length > 0) headers.cookie = [headers.cookie, ...kept].filter((one) => one !== undefined).join('; ')
  headers.host = at.host
  headers['accept-encoding'] = 'identity'
  const host = at.hostname === '[::1]' ? '::1' : at.hostname === '0.0.0.0' ? 'localhost' : at.hostname
  return new Promise((done, failed) => {
    const asking = request({ host, port: at.port === '' ? 80 : Number(at.port), path: at.pathname + at.search, method, headers }, (answer) => {
      const parts: Buffer[] = []
      let size = 0
      answer.on('data', (part: Buffer) => {
        size += part.length
        if (size > MOST) asking.destroy(new Error('the answer is too big to send to the phone'))
        else parts.push(part)
      })
      answer.on('end', () => {
        keep(jar, answer.headers['set-cookie'] ?? [])
        done({ status: answer.statusCode ?? 502, headers: answer.headers, body: Buffer.concat(parts) })
      })
      answer.on('error', failed)
    })
    asking.on('error', failed)
    asking.setTimeout(30_000, () => asking.destroy(new Error('it took longer than 30 seconds')))
    asking.end(body)
  })
}

function keep(jar: Map<string, string>, cookies: readonly string[]): void {
  for (const cookie of cookies) {
    const [pair = '', ...rest] = cookie.split(';')
    const eq = pair.indexOf('=')
    if (eq <= 0) continue
    const name = pair.slice(0, eq).trim()
    const attributes = rest.join(';')
    const expires = /expires=([^;]+)/i.exec(attributes)?.[1]
    const gone = /max-age=(0|-)/i.test(attributes) || (expires !== undefined && Date.parse(expires) < Date.now())
    if (gone) jar.delete(name)
    else jar.set(name, pair.slice(eq + 1).trim())
  }
}

const escaped = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')

function nothing(why: string): LocalAnswer {
  const page = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:17px -apple-system,sans-serif;padding:24px;color:#666">${escaped(why)}</body>`
  return { status: 502, headers: [['content-type', 'text/html; charset=utf-8']], body: Buffer.from(page).toString('base64') }
}
