/// <reference lib="webworker" />

/**
 * The service worker of the link page. A shared site is drawn in a frame on
 * this origin, and every request that frame makes for this origin is handed to
 * the page that opened it, which carries it to the computer over its link and
 * hands the answer back. The page's own files and the pairing service are not
 * touched.
 */

const sw = self as unknown as ServiceWorkerGlobalScope

interface Asked {
  readonly url: string
  readonly method: string
  readonly headers: readonly (readonly [string, string])[]
  readonly body: string
}

interface Answered {
  readonly status: number
  readonly headers: readonly (readonly [string, string])[]
  readonly body: string
  readonly moved?: string
}

// The link page each frame belongs to; a frame navigating starts a new client, given to the page that most recently showed a site.
const frames = new Map<string, string>()
let latest: string | undefined
const ANSWER_WITHIN = 60_000
const NO_BODY = new Set([101, 204, 205, 304])

sw.addEventListener('install', () => void sw.skipWaiting())
sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()))

sw.addEventListener('message', (event) => {
  const source = event.source
  if (source instanceof Client && (event.data as { readonly t?: string } | null)?.t === 'site') latest = source.id
})

sw.addEventListener('fetch', (event) => {
  const request = event.request
  if (new URL(request.url).origin !== sw.location.origin) return
  const framed = request.mode === 'navigate' && request.destination === 'iframe'
  const page = framed ? latest : frames.get(event.clientId)
  if (page === undefined) return
  if (framed && event.resultingClientId !== '') frames.set(event.resultingClientId, page)
  event.respondWith(carried(page, request))
})

async function carried(page: string, request: Request): Promise<Response> {
  const client = await sw.clients.get(page)
  if (client === undefined) return said(502, 'The GeckIt link tab was closed. Open the link again.')
  const at = new URL(request.url)
  const body = request.method === 'GET' || request.method === 'HEAD' ? '' : base64(new Uint8Array(await request.arrayBuffer()))
  const asked: Asked = { url: `${at.pathname}${at.search}`, method: request.method, headers: [...request.headers], body }
  const channel = new MessageChannel()
  const answer = new Promise<Answered | undefined>((done) => {
    const timer = setTimeout(() => done(undefined), ANSWER_WITHIN)
    channel.port1.onmessage = (heard: MessageEvent<Answered>) => {
      clearTimeout(timer)
      done(heard.data)
    }
  })
  client.postMessage({ t: 'fetch', asked }, [channel.port2])
  const got = await answer
  if (got === undefined) return said(504, 'Your computer took longer than a minute to answer.')
  if (got.moved !== undefined && request.mode === 'navigate') return Response.redirect(new URL(got.moved, sw.location.origin).href, 302)
  const status = got.status >= 200 && got.status <= 599 ? got.status : 502
  return new Response(NO_BODY.has(status) || request.method === 'HEAD' ? null : unbase64(got.body), { status, headers: got.headers.map(([name, value]) => [name, value]) })
}

function said(status: number, text: string): Response {
  return new Response(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:15px -apple-system,sans-serif;padding:24px">${text}</body>`, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

function base64(bytes: Uint8Array): string {
  let text = ''
  for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000))
  return btoa(text)
}

const unbase64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), (one) => one.charCodeAt(0))
