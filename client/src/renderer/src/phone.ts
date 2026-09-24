import type { Geckit } from '../../preload'
import type { SessionNotice } from '../../shared/api'

/**
 * `window.geckit` for the phone, where there is no preload: each call goes to
 * the Mac over HTTP, and what the Mac tells the windows comes back as one event
 * stream. What only makes sense at the Mac itself does nothing here.
 */

declare global {
  interface Window {
    readonly geckitBoot: { readonly home: string; readonly platform: Geckit['platform'] }
  }
}

async function call<T>(name: string, ...args: unknown[]): Promise<T> {
  const answer = await fetch('/phone/call', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, args }),
  })
  if (!answer.ok) throw new Error(`${name}: ${String(answer.status)}`)
  const text = await answer.text()
  return (text === '' ? undefined : JSON.parse(text)) as T
}

const send = (name: string, ...args: unknown[]): void => void call(name, ...args)

const heard = new Map<string, Set<(value: never) => void>>()
const stream = new EventSource('/phone/events')
let broken = false
stream.onerror = () => {
  broken = true
  if (document.querySelector('.phone-offline') !== null) return
  const line = document.createElement('div')
  line.className = 'phone-offline'
  line.setAttribute('role', 'status')
  line.textContent = 'Not connected to the Mac. Trying again.'
  document.body.append(line)
}
// What was said while the phone was away is not sent again, so a stream that came back starts the page over.
stream.onopen = () => {
  if (broken) location.reload()
}

const listen = <T>(channel: string, said: (value: T) => void): (() => void) => {
  let held = heard.get(channel)
  if (held === undefined) {
    held = new Set()
    heard.set(channel, held)
    stream.addEventListener(channel, (event) => {
      const value = JSON.parse((event as MessageEvent<string>).data) as never
      for (const one of heard.get(channel) ?? []) one(value)
    })
  }
  const one = said as (value: never) => void
  held.add(one)
  return () => {
    held.delete(one)
  }
}

const nothing = (): void => undefined
// The Mac leaves out what happens in the conversation being looked at, and so does the phone.
let watched: string | undefined
const never = (): (() => void) => nothing

const phone: Geckit = {
  platform: window.geckitBoot.platform,
  home: window.geckitBoot.home,
  copy: (text) => void navigator.clipboard.writeText(text),
  pathFor: () => '',
  settings: {
    get: () => call('settings.get'),
    set: (change) => call('settings.set', change),
    on: (said) => listen('settings:changed', said),
    pickApp: () => Promise.resolve(undefined),
  },
  update: {
    view: () => call('update.view'),
    check: () => call('update.view'),
    restart: nothing,
    on: (said) => listen('update:view', said),
  },
  correct: (request) => call('correct', request),
  shortcuts: {
    save: (draft) => call('shortcuts.save', draft),
    remove: (id) => send('shortcuts.remove', id),
    run: (id) => call('shortcuts.run', id),
    onManage: never,
  },
  transcribe: (request) => call('transcribe', request),
  chat: {
    open: nothing,
    account: () => call('chat.account'),
    models: () => call('chat.models'),
    plan: () => call('chat.plan'),
    onPlan: (said) => listen('chat:plan', said),
    addProject: () => Promise.resolve(undefined),
    forgetProject: (root) => call('chat.forgetProject', root),
    list: (root) => call('chat.list', root),
    items: (id) => call('chat.items', id),
    links: (id) => call('chat.links', id),
    search: (asked, root) => call('chat.search', asked, root),
    send: (message) => call('chat.send', message),
    shell: (command) => call('chat.shell', command),
    stopShell: (id, item) => send('chat.stopShell', id, item),
    typeShell: (id, item, text) => send('chat.typeShell', id, item, text),
    toBackground: (id, item) => send('chat.toBackground', id, item),
    stopTask: (id, task) => send('chat.stopTask', id, task),
    clearTask: (id, task) => send('chat.clearTask', id, task),
    taskOutput: (id, task) => call('chat.taskOutput', id, task),
    answer: (id, card, answer) => send('chat.answer', id, card, answer),
    stop: (id) => send('chat.stop', id),
    unqueue: (id, queued) => call('chat.unqueue', id, queued),
    requeue: (id, queued, text) => send('chat.requeue', id, queued, text),
    delegate: (id, queued) => call('chat.delegate', id, queued),
    mode: (id, mode) => send('chat.mode', id, mode),
    rename: (id, title) => send('chat.rename', id, title),
    mark: (id, status) => send('chat.mark', id, status),
    hide: (id) => send('chat.hide', id),
    remove: (ids) => call('chat.remove', ids),
    watching: (id) => {
      watched = id
    },
    read: (id) => send('chat.read', id),
    terminal: nothing,
    handOver: nothing,
    remote: (id, on) => call('chat.remote', id, on),
    mcp: (root, id, change) => call('chat.mcp', root, id, change),
    browsers: (root, id, pick) => call('chat.browsers', root, id, pick),
    git: (root) => call('chat.git', root),
    onGit: (said) => listen('chat:git', said),
    reveal: nothing,
    openFile: nothing,
    fileMenu: nothing,
    exists: (root, path) => call('chat.exists', root, path),
    files: (root) => call('chat.files', root),
    openLink: (href) => void window.open(href, '_blank', 'noopener'),
    onSessions: (said) => listen('chat:sessions', said),
    onItems: (said) => listen('chat:items', said),
    onAccount: (said) => listen('chat:accountChanged', said),
    onShow: never,
    onNotice: (said) =>
      listen<SessionNotice>('chat:notice', (notice) => {
        if (notice.session !== watched) said(notice)
      }),
    onSpotlight: never,
    listening: nothing,
  },
  voice: {
    done: () => Promise.resolve({ ok: false, error: 'Not on the phone' }),
    do: () => Promise.resolve({ ok: false, error: 'Not on the phone' }),
    orders: nothing,
    size: nothing,
    cancel: nothing,
    onStart: never,
    onStop: never,
  },
  panel: { onText: never },
  phone: { link: () => Promise.resolve({}) },
}

Object.defineProperty(window, 'geckit', { value: phone })
