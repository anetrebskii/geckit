import { timingSafeEqual } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { extname, join, normalize, sep } from 'node:path'

/**
 * The Chat window, for the phone.
 *
 * Listens on this computer only; Tailscale's `serve` is what carries it to the
 * phone, over HTTPS and inside the tailnet. The key in the link GeckIt shows is
 * the only way in, and is kept in a cookie once the link has been opened.
 */

export type PhoneCall = (...args: never[]) => unknown

export interface PhoneOptions {
  readonly port: number
  readonly key: string
  /** The built renderer folder, or the dev server a source run loads its windows from. */
  readonly pages: { readonly folder: string } | { readonly dev: string }
  readonly boot: Readonly<Record<string, unknown>>
  readonly calls: Readonly<Record<string, PhoneCall>>
}

export interface Phone {
  readonly tell: (channel: string, value: unknown) => void
  readonly close: () => void
}

const COOKIE = 'geckit'
const BODY_LIMIT = 64 * 1024 * 1024
const YEAR = 365 * 24 * 60 * 60

const TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
}

const same = (given: string | undefined, key: string): boolean => {
  if (given === undefined) return false
  const a = Buffer.from(given)
  const b = Buffer.from(key)
  return a.length === b.length && timingSafeEqual(a, b)
}

const cookieOf = (req: IncomingMessage): string | undefined =>
  req.headers.cookie
    ?.split(';')
    .map((one) => one.trim().split('='))
    .find(([name]) => name === COOKIE)?.[1]

function body(req: IncomingMessage): Promise<string> {
  return new Promise((done, failed) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > BODY_LIMIT) {
        failed(new Error('Too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => done(Buffer.concat(chunks).toString('utf8')))
    req.on('error', failed)
  })
}

export function startPhone(options: PhoneOptions): Promise<Phone> {
  const listeners = new Set<ServerResponse>()

  const call = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const asked = JSON.parse(await body(req)) as { readonly name: string; readonly args: readonly unknown[] }
    const run = Object.hasOwn(options.calls, asked.name) ? options.calls[asked.name] : undefined
    if (run === undefined) {
      res.writeHead(404).end()
      return
    }
    // JSON has no undefined, and every handler here takes it for "nothing".
    const args = asked.args.map((one) => (one === null ? undefined : one))
    const result: unknown = await (run as (...args: unknown[]) => unknown)(...args)
    res.writeHead(200, { 'content-type': 'application/json' }).end(result === undefined ? '' : JSON.stringify(result))
  }

  const events = (req: IncomingMessage, res: ServerResponse): void => {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' })
    res.write(': open\n\n')
    listeners.add(res)
    req.on('close', () => listeners.delete(res))
  }

  const page = async (path: string, res: ServerResponse): Promise<void> => {
    if ('dev' in options.pages) {
      const forward = request(`${options.pages.dev}${path}`, (from) => {
        res.writeHead(from.statusCode ?? 502, from.headers)
        from.pipe(res)
      })
      forward.on('error', () => res.writeHead(502).end())
      forward.end()
      return
    }
    const root = options.pages.folder
    const file = normalize(join(root, path.split('?')[0] ?? ''))
    if (!file.startsWith(root + sep)) {
      res.writeHead(404).end()
      return
    }
    try {
      const content = await readFile(file)
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(content)
    } catch {
      res.writeHead(404).end()
    }
  }

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://phone')
    const given = url.searchParams.get('key') ?? undefined
    const inside = same(cookieOf(req), options.key) || same(given, options.key)
    if (!inside) {
      res.writeHead(401, { 'content-type': 'text/plain; charset=utf-8' }).end('Open the link GeckIt shows in Settings.')
      return
    }
    if (given !== undefined) {
      res.setHeader('set-cookie', `${COOKIE}=${options.key}; Path=/; Max-Age=${String(YEAR)}; HttpOnly; SameSite=Strict`)
    }
    const failed = (): void => {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    }
    if (req.method === 'POST' && url.pathname === '/phone/call') {
      call(req, res).catch(failed)
      return
    }
    if (url.pathname === '/phone/events') {
      events(req, res)
      return
    }
    if (url.pathname === '/phone/boot.js') {
      res
        .writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
        .end(`window.geckitBoot = ${JSON.stringify(options.boot)}\n`)
      return
    }
    const path = url.pathname === '/' ? '/phone.html' : `${url.pathname}${url.search}`
    page(path, res).catch(failed)
  })

  // Proxies and phones drop a stream that says nothing for a while.
  const alive = setInterval(() => {
    for (const res of listeners) res.write(': alive\n\n')
  }, 25_000)

  return new Promise((done, failed) => {
    server.once('error', failed)
    server.listen(options.port, '127.0.0.1', () => {
      server.off('error', failed)
      done({
        tell: (channel, value) => {
          const line = `event: ${channel}\ndata: ${JSON.stringify(value ?? null)}\n\n`
          for (const res of listeners) res.write(line)
        },
        close: () => {
          clearInterval(alive)
          for (const res of listeners) res.end()
          listeners.clear()
          server.close()
        },
      })
    })
  })
}
