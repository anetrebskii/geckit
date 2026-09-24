import type { Geckit } from '../../preload'
import type { SessionNotice } from '../../shared/api'
import type { Link } from './link'
import type { ScreenLink } from './screen-link'

/**
 * `window.geckit` for the phone, where there is no preload: each call goes to
 * the Mac over the link and its answer comes back on it, and so does what the
 * Mac tells its windows. What only makes sense at the Mac itself does nothing
 * here.
 */

export interface Boot {
  readonly home: string
  readonly platform: Geckit['platform']
}

// Most drops mend in a few seconds, back from the background above all, and a pill that comes and goes in that time only startles.
const QUIET = 5000
// What was done while the link was down goes over the next one, unless the Mac stays away this long.
const HOLD = 60_000
let dropping: number | undefined

/** The pill over the page while the link to the Mac is down, once the drop has lasted long enough to be worth saying. */
export function showDropped(): void {
  if (dropping !== undefined || document.querySelector('.phone-offline') !== null) return
  dropping = window.setTimeout(() => {
    const line = document.createElement('div')
    line.className = 'phone-offline'
    line.setAttribute('role', 'status')
    line.textContent = 'Not connected to the Mac. Trying again.'
    document.body.append(line)
  }, QUIET)
}

function hideDropped(): void {
  window.clearTimeout(dropping)
  dropping = undefined
  document.querySelector('.phone-offline')?.remove()
}

/**
 * Installs `window.geckit` over the link, and gives back what puts a new link
 * under it once the old one drops: the page stays as it was, and is brought up
 * to date with what the Mac told while nobody was listening.
 */
export function installGeckit(first: Link, boot: Boot): (next: Link) => void {
  const pending = new Map<number, { readonly done: (value: unknown) => void; readonly failed: (error: Error) => void }>()
  let asked = 0
  const heard = new Map<string, Set<(value: never) => void>>()
  let link = first
  let down = false
  const held: (() => void)[] = []

  const told = (channel: string, value: unknown): void => {
    for (const one of heard.get(channel) ?? []) one(value as never)
  }

  const bind = (one: Link): void => {
    one.onMessage((message) => {
      if (message.t === 'reply') {
        const waiting = pending.get(message.id)
        pending.delete(message.id)
        if (message.error === undefined) waiting?.done(message.value)
        else waiting?.failed(new Error(message.error))
      }
      if (message.t === 'tell') told(message.channel, message.value)
    })
    one.onClose(() => {
      if (one !== link) return
      down = true
      for (const waiting of pending.values()) waiting.failed(new Error('The link to the Mac is down'))
      pending.clear()
    })
  }
  bind(first)

  const call = <T>(name: string, ...args: unknown[]): Promise<T> =>
    new Promise((done, failed) => {
      const go = (): void => {
        const id = asked++
        pending.set(id, { done: done as (value: unknown) => void, failed })
        link.send({ t: 'call', id, name, args })
      }
      if (!down) {
        try {
          go()
          return
        } catch {
          // The channel closed before it said so.
          down = true
        }
      }
      const expired = window.setTimeout(() => {
        held.splice(held.indexOf(later), 1)
        failed(new Error('The link to the Mac is down'))
      }, HOLD)
      const later = (): void => {
        window.clearTimeout(expired)
        go()
      }
      held.push(later)
    })

  const send = (name: string, ...args: unknown[]): void => void call(name, ...args).catch(() => undefined)

  const listen = <T>(channel: string, said: (value: T) => void): (() => void) => {
    let held = heard.get(channel)
    if (held === undefined) {
      held = new Set()
      heard.set(channel, held)
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
    platform: boot.platform,
    home: boot.home,
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
      repo: (root) => call('chat.repo', root),
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
    phone: { state: () => Promise.resolve({ count: 0 }), onState: never, newCode: nothing },
    peer: {
      pairing: () => Promise.resolve(undefined),
      call: () => Promise.resolve(undefined),
      onTell: never,
      state: nothing,
      screen: () => Promise.resolve({}),
    },
  }

  Object.defineProperty(window, 'geckit', { value: phone })
  const screen: ScreenLink = {
    start: async () => {
      const refused = await call<string | null>('screen.start')
      if (refused !== null) throw new Error(refused)
      const stream = link.screen()
      if (stream === undefined) throw new Error('The link carries no screen')
      return stream
    },
    stop: () => send('screen.stop'),
  }
  Object.defineProperty(window, 'geckitScreen', { value: screen })

  return (next) => {
    link = next
    down = false
    bind(next)
    hideDropped()
    for (const later of held.splice(0)) later()
    // Told again as if the Mac had told it: the list, the plan, the settings, and the conversation on screen.
    void call('chat.list', undefined).then((all) => told('chat:sessions', all))
    void call('chat.plan').then((plan) => told('chat:plan', plan))
    void call('settings.get').then((settings) => told('settings:changed', settings))
    const shown = watched
    if (shown !== undefined) void call('chat.items', shown).then((items) => told('chat:items', { id: shown, items }))
  }
}
