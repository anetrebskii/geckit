import './style'

import { dial } from '../renderer/src/link'
import type { Dialing, Link } from '../renderer/src/link'
import type { LocalAnswer, LocalAsk } from '../shared/local'
import { SIGNAL } from '../shared/pairing'
import { ENDED, endsIn } from '../shared/share'
import type { ShareAbout, ShareRead } from '../shared/share'

/**
 * The page a shared link opens, in any browser. The key after the # is the
 * link: the page meets the computer in that key's room, as the phone app does
 * in its own, and asks it only about the one site, file or folder it shares.
 */

const KEY = /^#([A-Za-z0-9_-]{32,})$/
const ANSWER_WITHIN = 60_000
const STEPS: Record<Dialing, string> = { service: 'Asking the pairing service...', mac: 'Waiting for your computer...', joining: 'Connecting...' }

const stage = document.getElementById('viewer-stage') as HTMLElement
const bar = document.querySelector('.viewer-bar') as HTMLElement
const title = document.getElementById('viewer-title') as HTMLElement
const left = document.getElementById('viewer-left') as HTMLElement
const reload = document.getElementById('viewer-reload') as HTMLButtonElement
const tools = document.getElementById('viewer-tools') as HTMLElement

let link: Link | undefined
let about: ShareAbout | undefined
let ended = false
let frame: HTMLIFrameElement | undefined
let blobs: string[] = []
let next = 1
const waiting = new Map<number, { readonly done: (value: unknown) => void; readonly failed: (error: Error) => void }>()

function call<T>(name: string, args: readonly unknown[]): Promise<T> {
  const now = link
  if (now === undefined) return Promise.reject(new Error('Not connected'))
  const id = next++
  return new Promise<T>((done, failed) => {
    const timer = window.setTimeout(() => {
      waiting.delete(id)
      failed(new Error('Your computer took longer than a minute to answer.'))
    }, ANSWER_WITHIN)
    waiting.set(id, {
      done: (value) => {
        window.clearTimeout(timer)
        done(value as T)
      },
      failed: (error) => {
        window.clearTimeout(timer)
        failed(error)
      },
    })
    now.send({ t: 'call', id, name, args })
  })
}

const isEnded = (error: unknown): boolean => error instanceof Error && error.message.includes(ENDED)

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag)
  if (className !== undefined) made.className = className
  if (text !== undefined) made.textContent = text
  return made
}

function clear(): void {
  for (const url of blobs) URL.revokeObjectURL(url)
  blobs = []
  frame = undefined
  stage.replaceChildren()
  tools.replaceChildren()
}

/** One of the page's states: a sentence, a smaller line, and the one thing to do, if any. */
function state(said: string, detail?: string, action?: { readonly label: string; readonly run: () => void }): void {
  clear()
  const box = element('div', 'viewer-state')
  box.append(element('p', undefined, said))
  if (detail !== undefined) box.append(element('p', 'viewer-detail', detail))
  if (action !== undefined) {
    const button = element('button', 'primary', action.label)
    button.type = 'button'
    button.addEventListener('click', action.run)
    box.append(button)
    stage.append(box)
    button.focus()
    return
  }
  stage.append(box)
}

function showEnded(): void {
  ended = true
  bar.hidden = true
  link?.close()
  state('This link has ended. Press the button in Telegram again for a new one.')
}

async function connect(key: string): Promise<void> {
  ended = false
  bar.hidden = true
  state('Reaching your computer...', STEPS.service)
  const detail = (): HTMLElement | null => stage.querySelector('.viewer-detail')
  try {
    link = await dial({ key, signal: SIGNAL }, 45_000, (at) => {
      const line = detail()
      if (line !== null) line.textContent = STEPS[at]
    })
  } catch {
    state('Your computer did not answer. The link may have ended, or GeckIt is closed or offline there.', undefined, { label: 'Try again', run: () => void connect(key) })
    return
  }
  const joined = link
  joined.onMessage((message) => {
    if (message.t === 'tell' && message.channel === 'share.ended') return showEnded()
    if (message.t !== 'reply') return
    const held = waiting.get(message.id)
    if (held === undefined) return
    waiting.delete(message.id)
    if (message.error !== undefined) held.failed(new Error(message.error))
    else held.done(message.value)
  })
  joined.onClose(() => {
    if (link !== joined) return
    link = undefined
    for (const [, held] of waiting) held.failed(new Error('The connection to your computer was lost.'))
    waiting.clear()
    if (ended) return
    bar.hidden = true
    state('The connection to your computer was lost.', undefined, { label: 'Reconnect', run: () => void connect(key) })
  })
  try {
    await call('link.can', [['deflate']])
    joined.compress(true)
    about = await call<ShareAbout>('share.about', [])
  } catch (error) {
    if (isEnded(error)) showEnded()
    else state('Your computer did not answer. The link may have ended, or GeckIt is closed or offline there.', undefined, { label: 'Try again', run: () => void connect(key) })
    return
  }
  document.title = about.title
  title.textContent = about.title
  tick()
  bar.hidden = false
  if (about.kind === 'site') await site(about)
  else await open(history.state?.path ?? '', false)
}

function tick(): void {
  if (about !== undefined) left.textContent = `Ends in ${endsIn(about.expiresAt, Date.now())}`
}

/* ------------------------------------------------------------------ */
/* A site, drawn in a frame whose requests the service worker carries   */
/* ------------------------------------------------------------------ */

let worker: Promise<ServiceWorkerRegistration> | undefined

async function site(shared: ShareAbout): Promise<void> {
  if (!('serviceWorker' in navigator)) {
    state('This browser cannot show shared websites. Open the link in Safari, Chrome or Firefox.')
    return
  }
  try {
    worker ??= navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => navigator.serviceWorker.ready)
    const ready = await worker
    ready.active?.postMessage({ t: 'site' })
  } catch {
    state('This browser cannot show shared websites. Open the link in Safari, Chrome or Firefox.')
    return
  }
  clear()
  frame = element('iframe', 'viewer-frame')
  frame.title = shared.title
  frame.src = shared.start ?? '/'
  stage.append(frame)
}

navigator.serviceWorker?.addEventListener('message', (event: MessageEvent<{ readonly t: string; readonly asked: LocalAsk }>) => {
  if (event.data.t !== 'fetch') return
  const port = event.ports[0]
  if (port === undefined) return
  call<LocalAnswer>('share.fetch', [event.data.asked]).then(
    (answer) => port.postMessage(answer),
    (error: unknown) => {
      if (isEnded(error)) showEnded()
      port.postMessage(page(error instanceof Error ? error.message : String(error)))
    },
  )
})

function page(why: string): LocalAnswer {
  const text = why.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:15px -apple-system,sans-serif;padding:24px">${text}</body>`
  const bytes = new TextEncoder().encode(html)
  return { status: 502, headers: [['content-type', 'text/html; charset=utf-8']], body: btoa(String.fromCharCode(...bytes)) }
}

/* ------------------------------------------------------------------ */
/* A file, or a folder and what is inside it                           */
/* ------------------------------------------------------------------ */

async function open(path: string, push: boolean): Promise<void> {
  let read: ShareRead
  try {
    read = await call<ShareRead>('share.read', [path])
  } catch (error) {
    if (isEnded(error)) showEnded()
    else if (link !== undefined) state(error instanceof Error ? error.message : String(error))
    return
  }
  if (push) history.pushState({ path }, '', location.href)
  else history.replaceState({ path }, '', location.href)
  clear()
  if (read.kind === 'none') {
    stage.append(withUp(path, element('div', 'viewer-state', read.why)))
    return
  }
  if (read.kind === 'folder') {
    folder(read)
    return
  }
  file(read)
}

/** Up to the folder above, for anything below the shared folder. */
function withUp(path: string, content: HTMLElement): HTMLElement {
  if (path === '' || about?.kind !== 'folder') return content
  const wrap = element('div', 'viewer-page')
  const up = element('button', 'quiet viewer-up', 'Up')
  up.type = 'button'
  up.addEventListener('click', () => void open(path.split('/').slice(0, -1).join('/'), true))
  wrap.append(up, content)
  return wrap
}

function folder(read: Extract<ShareRead, { readonly kind: 'folder' }>): void {
  const list = element('ul', 'viewer-list')
  for (const one of read.inside) {
    const row = element('li')
    const button = element('button', 'viewer-row')
    button.type = 'button'
    button.append(element('span', 'viewer-name', one.folder ? `${one.name}/` : one.name))
    if (one.size !== undefined) button.append(element('span', 'viewer-size', size(one.size)))
    button.addEventListener('click', () => void open(read.path === '' ? one.name : `${read.path}/${one.name}`, true))
    row.append(button)
    list.append(row)
  }
  const content = read.inside.length === 0 ? element('div', 'viewer-state', 'This folder is empty.') : list
  stage.append(withUp(read.path, content))
}

const TEXT = /^text\/|^application\/json$/

function file(read: Extract<ShareRead, { readonly kind: 'file' }>): void {
  const bytes = Uint8Array.from(atob(read.data), (one) => one.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: read.media }))
  blobs.push(url)
  const download = element('a', 'quiet viewer-download', 'Download')
  download.href = url
  download.download = read.name
  const page = element('div', 'viewer-page viewer-file')
  // A file link says its name in the bar, so Download goes there too; inside a folder the file has a line of its own.
  if (about?.kind === 'folder') {
    const head = element('div', 'viewer-file-head')
    head.append(element('span', 'viewer-name', read.name), element('span', 'viewer-size', size(read.size)), download)
    page.append(head)
  } else tools.append(download)
  if (read.media.startsWith('image/')) {
    const picture = element('img', 'viewer-picture')
    picture.src = url
    picture.alt = read.name
    page.append(picture)
  } else if (read.media.startsWith('video/') || read.media.startsWith('audio/')) {
    const media = element(read.media.startsWith('video/') ? 'video' : 'audio', 'viewer-media')
    media.controls = true
    media.src = url
    page.append(media)
  } else if (read.media === 'text/html') {
    // Its own opaque origin: the page's scripts run, and reach nothing of this one.
    const shown = element('iframe', 'viewer-frame viewer-html')
    shown.title = read.name
    shown.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-modals')
    shown.srcdoc = new TextDecoder().decode(bytes)
    page.append(shown)
  } else if (read.media === 'application/pdf') {
    const shown = element('iframe', 'viewer-frame viewer-pdf')
    shown.title = read.name
    shown.src = url
    page.append(shown)
  } else if (TEXT.test(read.media)) {
    page.append(element('pre', 'viewer-text', new TextDecoder().decode(bytes)))
  }
  stage.append(withUp(read.path, page))
}

function size(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/* ------------------------------------------------------------------ */

const key = KEY.exec(location.hash)?.[1]
reload.addEventListener('click', () => {
  if (about?.kind === 'site' && frame !== undefined) frame.src = about.start ?? '/'
  else if (about !== undefined) void open(history.state?.path ?? '', false)
})
window.addEventListener('popstate', (event: PopStateEvent) => {
  const path = (event.state as { readonly path?: string } | null)?.path
  if (about !== undefined && about.kind !== 'site' && link !== undefined) void open(path ?? '', false)
})
// Another link pasted into this tab changes only what is after the #, which loads nothing by itself.
window.addEventListener('hashchange', () => location.reload())
window.setInterval(tick, 60_000)
if (key === undefined) state('This link is incomplete. Open it again from Telegram.')
else void connect(key)
