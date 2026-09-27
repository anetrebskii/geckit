import type { Geckit } from '../../preload'
import type { ChatSession, SessionImage, SessionItem, SessionItems, ScreenControlled, SessionNotice, Settings } from '../../shared/api'
import { pieceOf } from '../../shared/pairing'
import { collapse, runKey } from '../../shared/steps'
import type { Piece } from '../../shared/pairing'
import { OWN } from './phone-calls'
import type { PhoneCalls } from './phone-calls'
import { keep, readKept } from './kept'
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
  /** A Mac running a GeckIt from before it said its name has none. */
  readonly name?: string
}

// Most drops mend in a few seconds, back from the background above all, and a pill that comes and goes in that time only startles.
const QUIET = 5000
// What was done while the link was down goes over the next one, unless the Mac stays away this long.
const HOLD = 60_000
let dropping: number | undefined
// What the pill says: what is going on, and the step it is at, kept for the pill made once QUIET has passed.
let saying = { head: 'Not connected to the Mac', step: 'Trying again' }

/** The pill over the page while the link to the Mac is down, once the drop has lasted long enough to be worth saying. */
export function showDropped(): void {
  if (dropping !== undefined || document.querySelector('.phone-offline') !== null) return
  dropping = window.setTimeout(() => {
    const line = document.createElement('div')
    line.className = 'phone-offline'
    line.setAttribute('role', 'status')
    const spin = document.createElement('span')
    spin.className = 'phone-spin'
    const text = document.createElement('span')
    const head = document.createElement('b')
    const step = document.createElement('small')
    text.append(head, step)
    line.append(spin, text)
    document.body.append(line)
    sayDropped(saying.head, saying.step)
  }, QUIET)
}

/** What the pill says while the phone tries to reach the Mac again, so a long wait reads as waited on rather than stuck. */
export function sayDropped(head: string, step: string): void {
  saying = { head, step }
  const line = document.querySelector('.phone-offline')
  const said = line?.querySelector('b')
  const under = line?.querySelector('small')
  if (said !== null && said !== undefined) said.textContent = head
  if (under !== null && under !== undefined) under.textContent = step
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
/** What crossed the link since `start()`, per call and per channel, read with `geckitStats.read()` from Safari's Web Inspector. */
interface Tally {
  n: number
  bytes: number
  ms: number
  slowest: number
}
const stats = { on: false, since: 0, seen: new Map<string, Tally>() }
function count(key: string, value: unknown, ms = 0): void {
  if (!stats.on) return
  const one = stats.seen.get(key) ?? { n: 0, bytes: 0, ms: 0, slowest: 0 }
  one.n += 1
  one.bytes += JSON.stringify(value ?? null).length
  one.ms += ms
  one.slowest = Math.max(one.slowest, ms)
  stats.seen.set(key, one)
}
Object.defineProperty(window, 'geckitStats', {
  value: {
    start: () => {
      stats.on = true
      stats.since = Date.now()
      stats.seen.clear()
    },
    stop: () => {
      stats.on = false
    },
    read: () =>
      Object.fromEntries(
        [...stats.seen].map(([key, one]) => [
          key,
          { ...one, kbPerMinute: Math.round((one.bytes / 1024 / Math.max(1, Date.now() - stats.since)) * 60_000), msEach: Math.round(one.ms / one.n) },
        ]),
      ),
  },
})

// Where a conversation is kept; the number moves when what is kept changes shape, and what was kept before is left unread.
const itemsKey = (id: string): string => `items2:${id}`

// How much of a conversation is asked for when it opens, and how much more each time the person scrolls to its top.
const TAIL = 60
const EARLIER = 200
// Conversations kept on the phone, the ones opened last.
const KEPT_CHATS = 30
// What is kept is written this long after it last changed, not on every word of a reply.
const KEEP_AFTER = 1000

/** A Mac from before a call was there says so, and the phone does what it did then. */
function orAsBefore<T>(asked: Promise<T>, before: () => Promise<T>): Promise<T> {
  return asked.catch((error: unknown) => {
    if (error instanceof Error && error.message.includes('No such call')) return before()
    throw error
  })
}

/** What `installGeckit` gives the page that dials: a new link put under it, and a question that only a live link answers. */
export interface Installed {
  readonly swap: (next: Link) => void
  readonly ping: () => Promise<unknown>
}

/**
 * With no link yet, the page opens on what the phone kept of this Mac, and
 * every call waits for the link as it does while one is being mended.
 */
export function installGeckit(first: Link | undefined, boot: Boot, mac: string): Installed {
  const pending = new Map<
    number,
    { readonly name: string; readonly at: number; readonly done: (value: unknown) => void; readonly failed: (error: Error) => void }
  >()
  let asked = 0
  const heard = new Map<string, Set<(value: never) => void>>()
  let link = first
  let down = first === undefined
  const held: (() => void)[] = []

  // How this phone looks and which projects it shows are its own, whatever the Mac has; a profile the Mac no longer has is All projects again.
  const ownKey = 'own'
  const readOwn = (): Partial<Settings> => {
    try {
      return JSON.parse(localStorage.getItem(ownKey) ?? '{}') as Partial<Settings>
    } catch {
      return {}
    }
  }
  let mine = readOwn()
  let last: Settings | undefined
  const own = (settings: Settings): Settings => {
    last = settings
    const kept = { ...settings, ...mine }
    const gone = mine.profile !== undefined && mine.profile !== '' && !settings.profiles.some((one) => one.id === mine.profile)
    return gone ? { ...kept, profile: '', chatProjects: [], chatAll: true } : kept
  }

  const told = (channel: string, value: unknown): void => {
    const said = channel === 'settings:changed' ? own(value as Settings) : value
    for (const one of heard.get(channel) ?? []) one(said as never)
  }

  const bind = (one: Link): void => {
    one.onMessage((message) => {
      if (message.t === 'reply') {
        const waiting = pending.get(message.id)
        pending.delete(message.id)
        if (waiting !== undefined) count(`call ${waiting.name}`, message.value, performance.now() - waiting.at)
        if (message.error === undefined) waiting?.done(message.value)
        else waiting?.failed(new Error(message.error))
      }
      if (message.t === 'tell') {
        count(`tell ${message.channel}`, message.value)
        if (message.channel === 'chat:items' && (message.value as SessionItems).id === shown?.id) tellItems(message.value as SessionItems)
        else told(message.channel, message.value)
      }
    })
    one.onClose(() => {
      if (one !== link) return
      down = true
      for (const waiting of pending.values()) waiting.failed(new Error('The link to the Mac is down'))
      pending.clear()
    })
  }
  if (first !== undefined) bind(first)

  const call = <T>(name: string, ...args: unknown[]): Promise<T> =>
    new Promise((done, failed) => {
      const go = (): void => {
        const id = asked++
        pending.set(id, { name, at: performance.now(), done: done as (value: unknown) => void, failed })
        if (link === undefined) throw new Error('No link yet')
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

  /** What this phone can take, said first on every link; a Mac that can read deflated messages is sent them from then on. */
  const can = (one: Link): void =>
    void call<{ readonly deflate?: boolean } | null>('link.can', ['sessionsChanged', 'steps', 'deflate', 'pictures'])
      .then((said) => {
        if (said?.deflate === true && link === one) one.compress(true)
      })
      .catch(() => undefined)
  if (first !== undefined) can(first)

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

  const named = (what: string): string => `${mac}:${what}`
  // What has been heard from the Mac since the app started; until then, and while the link is down, what was kept is shown first.
  const settled = new Set<string>()
  const timers = new Map<string, number>()
  const later = (key: string, value: () => unknown): void => {
    window.clearTimeout(timers.get(key))
    timers.set(
      key,
      window.setTimeout(() => {
        timers.delete(key)
        void keep(named(key), value())
      }, KEEP_AFTER),
    )
  }

  /** Kept first when there is something kept and the Mac has not been heard since, then told again as the Mac has it. */
  async function keptFirst<T>(key: string, asked: () => Promise<T>, channel: string): Promise<T> {
    const fresh = asked().then((value) => {
      settled.add(key)
      later(key, () => value)
      return value
    })
    if (settled.has(key) && !down) return fresh
    const kept = await readKept<T>(named(key))
    if (kept === undefined) return fresh
    void fresh.then((value) => told(channel, value)).catch(() => undefined)
    return kept
  }

  // The conversation open on the phone, as the page has it: kept on the phone as it changes, and brought up to date from the Mac.
  let shown: { readonly id: string; items: Map<string, SessionItem>; left: number } | undefined

  const keepShown = (): void => {
    const now = shown
    if (now === undefined) return
    later(itemsKey(now.id), (): Piece => {
      const all = [...now.items.values()]
      const items = all.slice(-TAIL)
      return { items, left: now.left + all.length - items.length }
    })
  }

  // A conversation comes as its messages and replies, each run of steps between them one line; a Mac from before that sends all of it, and it is folded here.
  const tail = (id: string): Promise<Piece> =>
    orAsBefore(call<Piece>('chat.turns', id, TAIL), () =>
      call<SessionItem[]>('chat.items', id).then((all) => pieceOf(collapse(all), undefined, TAIL)),
    )

  const stepsOf = (id: string, ids: readonly string[]): Promise<SessionItem[]> =>
    orAsBefore(call<SessionItem[]>('chat.steps', id, ids), () =>
      call<SessionItem[]>('chat.items', id).then((all) => all.filter((item) => ids.includes(item.id))),
    )

  // The runs opened in the conversation on screen, which stay open as they grow and after the link is made again.
  let expanded = new Set<string>()

  /** Items with each run that is open put back as its steps, the ones the page has not got asked for. */
  const filled = async (id: string, items: readonly SessionItem[]): Promise<SessionItem[]> => {
    const wanted = items.filter((item) => item.kind === 'steps' && expanded.has(item.id))
    if (wanted.length === 0) return [...items]
    const have = shown?.id === id ? shown.items : new Map<string, SessionItem>()
    const missing = wanted.flatMap((run) => (run.kind === 'steps' ? run.ids.filter((one) => !have.has(one)) : []))
    const found = new Map((missing.length === 0 ? [] : await stepsOf(id, missing)).map((item) => [item.id, item]))
    return items.flatMap((item) =>
      item.kind === 'steps' && expanded.has(item.id)
        ? item.ids.flatMap((one) => {
            const step = have.get(one) ?? found.get(one)
            return step === undefined ? [] : [step]
          })
        : [item],
    )
  }

  // What is told of the conversation on screen goes in the order it came, each open run filled in on the way.
  let telling = Promise.resolve()
  const tellItems = (said: SessionItems): void => {
    telling = telling
      .then(async () => {
        // A run open on the page that is sent again in its place goes back in its place: its steps are taken out with it and put back in order.
        const moved = said.items.flatMap((item) => (item.kind === 'steps' && expanded.has(item.id) && said.gone?.includes(item.id) === true ? item.ids : []))
        const gone = said.gone === undefined ? undefined : [...said.gone, ...moved]
        told('chat:items', { ...said, items: await filled(said.id, said.items), ...(gone === undefined ? {} : { gone }) })
      })
      .catch(() => undefined)
  }

  /** The end of the open conversation as the Mac has it now, put in place of the end the page has, what it had before that left alone. */
  const bringUp = (id: string): void =>
    void tail(id)
      .then(async (said) => ({ ...said, items: await filled(id, said.items) }))
      .then((piece) => {
        const now = shown
        if (now?.id !== id) return
        const order = [...now.items.keys()]
        const from = piece.items[0] === undefined ? -1 : order.indexOf(piece.items[0].id)
        // What the page has out of place is taken out too, so it goes back where the Mac has it.
        const coming = new Set(piece.items.map((item) => item.id))
        const staying = (from === -1 ? [] : order.slice(0, from)).filter((one) => !coming.has(one))
        const gone = [...new Set([...(from === -1 ? order : order.slice(from)), ...coming])]
        now.items = new Map([...staying.map((one): [string, SessionItem] => [one, now.items.get(one) as SessionItem]), ...piece.items.map((item): [string, SessionItem] => [item.id, item])])
        now.left = Math.max(0, piece.left - staying.length)
        told('chat:items', { id, items: piece.items, gone } satisfies SessionItems)
        told('chat:earlier', { id, left: now.left })
        keepShown()
      })
      .catch(() => undefined)

  const remembered = async (id: string): Promise<void> => {
    const recent = (await readKept<string[]>(named('recent'))) ?? []
    const next = [id, ...recent.filter((one) => one !== id)]
    for (const gone of next.splice(KEPT_CHATS)) void keep(named(itemsKey(gone)), undefined)
    await keep(named('recent'), next)
  }

  listen<SessionItems>('chat:items', (said) => {
    const now = shown
    if (now?.id !== said.id) return
    for (const id of said.gone ?? []) now.items.delete(id)
    for (const item of said.items) now.items.set(item.id, item)
    keepShown()
  })
  // The list as last told, which the rows that changed are put into.
  let rows: readonly ChatSession[] | undefined
  listen<ChatSession[]>('chat:sessions', (all) => {
    rows = all
    later('list', () => all)
  })
  listen<{ readonly changed: readonly ChatSession[]; readonly gone: readonly string[] }>('chat:sessionsChanged', (said) => {
    if (rows === undefined) return
    const next = new Map(rows.map((row) => [row.id, row]))
    for (const id of said.gone) next.delete(id)
    for (const row of said.changed) next.set(row.id, row)
    told('chat:sessions', [...next.values()].sort((one, other) => other.at - one.at))
  })
  listen<Settings>('settings:changed', (settings) => later('settings', () => settings))

  const nothing = (): void => undefined
  // The Mac leaves out what happens in the conversation being looked at, and so does the phone.
  let watched: string | undefined
  // The conversation last opened, which is the one whose lines the Mac sends.
  let opened: string | undefined
  const never = (): (() => void) => nothing

  const phone: Geckit = {
    platform: boot.platform,
    home: boot.home,
    copy: (text) => void navigator.clipboard.writeText(text),
    pathFor: () => '',
    settings: {
      get: () => keptFirst<Settings>('settings', () => call('settings.get'), 'settings:changed').then(own),
      set: async (change) => {
        const here = Object.fromEntries(Object.entries(change).filter(([key]) => (OWN as readonly string[]).includes(key)))
        const there = Object.fromEntries(Object.entries(change).filter(([key]) => !(OWN as readonly string[]).includes(key)))
        if (Object.keys(here).length > 0) {
          mine = { ...mine, ...here }
          localStorage.setItem(ownKey, JSON.stringify(mine))
        }
        if (Object.keys(there).length > 0) return own(await call<Settings>('settings.set', there))
        const now = last ?? (await call<Settings>('settings.get'))
        told('settings:changed', now)
        return own(now)
      },
      on: (said) => listen('settings:changed', said),
      pickApp: () => Promise.resolve(undefined),
      accessibility: () => Promise.resolve(true),
      openAccessibility: nothing,
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
      rememberProject: (root) => call('chat.rememberProject', root),
      hidden: (older) => call('chat.hidden', older),
      bring: (id) => call('chat.bring', id),
      list: (root) =>
        root === undefined
          ? keptFirst(
              'list',
              () =>
                call<ChatSession[]>('chat.list', root).then((all) => {
                  rows = all
                  return all
                }),
              'chat:sessions',
            )
          : call('chat.list', root),
      items: async (id) => {
        if (shown?.id !== id) expanded = new Set()
        const kept = await readKept<Piece>(named(itemsKey(id)))
        void remembered(id)
        if (kept !== undefined) {
          shown = { id, items: new Map(kept.items.map((item) => [item.id, item])), left: kept.left }
          window.setTimeout(() => {
            told('chat:earlier', { id, left: kept.left })
            bringUp(id)
          }, 0)
          return kept.items
        }
        const piece = await tail(id)
        shown = { id, items: new Map(piece.items.map((item) => [item.id, item])), left: piece.left }
        keepShown()
        window.setTimeout(() => told('chat:earlier', { id, left: piece.left }), 0)
        return piece.items
      },
      before: async (id, before) => {
        const piece = await orAsBefore(call<Piece>('chat.turnsBefore', id, before, EARLIER), () =>
          call<SessionItem[]>('chat.items', id).then((all) => pieceOf(collapse(all), before, EARLIER)),
        )
        const now = shown
        if (now?.id === id) {
          now.items = new Map([...piece.items.map((item): [string, SessionItem] => [item.id, item]), ...now.items])
          now.left = piece.left
        }
        return piece
      },
      onEarlier: (said) => listen('chat:earlier', said),
      picture: (ref, width) => call<SessionImage | null>('chat.picture', ref, width).then((one) => one ?? undefined),
      steps: async (id, ids) => {
        const first = ids[0]
        if (first !== undefined && shown?.id === id) expanded.add(runKey(first))
        const found = await stepsOf(id, ids)
        const now = shown
        if (now?.id === id && first !== undefined) {
          const run = runKey(first)
          now.items = new Map([...now.items].flatMap(([key, item]): [string, SessionItem][] => (key === run ? found.map((one) => [one.id, one]) : [[key, item]])))
          keepShown()
        }
        return found
      },
      // A Mac from before it could say only the card is asked for all of it.
      waiting: (id) =>
        call<SessionItem | undefined>('chat.waiting', id).catch(() =>
          call<SessionItem[]>('chat.items', id).then((items) =>
            items.findLast((item) => item.kind === 'card' && item.card.answered === undefined),
          ),
        ),
      links: (id) => call('chat.links', id),
      cutOff: () => Promise.resolve([]),
      proceed: nothing,
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
      delegate: (id, queued, history) => call('chat.delegate', id, queued, history),
      mode: (id, mode) => send('chat.mode', id, mode),
      rename: (id, title) => send('chat.rename', id, title),
      mark: (id, status) => send('chat.mark', id, status),
      hide: (id) => send('chat.hide', id),
      remove: (ids) => call('chat.remove', ids),
      watching: (id) => {
        watched = id
        // Behind another app it watches nothing, and what it had open is still what the Mac sends it.
        if (id === undefined) return
        send('chat.read', id)
        if (id === opened) return
        opened = id
        send('chat.watching', id)
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
      file: (root, path) => call('chat.file', root, path),
      repo: (root) => call('chat.repo', root),
      files: (root) => call('chat.files', root),
      openLink: (href) => void window.open(href, '_blank', 'noopener'),
      onSessions: (said) => listen('chat:sessions', said),
      onItems: (said) => listen('chat:items', said),
      onAccount: (said) => listen('chat:accountChanged', said),
      onShow: never,
      onRecorded: (said) => listen('chat:recorded', said),
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
      record: nothing,
      form: nothing,
      dictate: nothing,
      fill: nothing,
      size: nothing,
      cancel: nothing,
      mode: () => Promise.resolve('paste'),
      screen: () => Promise.resolve({ error: 'Not on the phone' }),
      video: () => Promise.resolve(''),
      videoPart: nothing,
      ask: () => Promise.resolve({ ok: false, error: 'Not on the phone' }),
      task: () => Promise.resolve({ ok: false, error: 'Not on the phone' }),
      allow: nothing,
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
      const stream = link?.screen()
      if (stream === undefined) throw new Error('The link carries no screen')
      return stream
    },
    stop: () => send('screen.stop'),
    control: (order) =>
      call<ScreenControlled | null>('screen.control', order).then(
        // A Mac from before the trackpad answered null, and did not know these orders.
        (done) => done ?? { error: 'Update GeckIt on the Mac to work it from here' },
        (error: unknown) => ({
          error:
            error instanceof Error && error.message.includes('No such call')
              ? 'Update GeckIt on the Mac to work it from here'
              : error instanceof Error
                ? error.message
                : String(error),
        }),
      ),
  }
  Object.defineProperty(window, 'geckitScreen', { value: screen })
  const calls: PhoneCalls = {
    readOrders: (said) => call('orders.read', said),
    doOrders: () => call('orders.do'),
    folders: (path) => call('chat.folders', path),
    version: () => call('mac.version'),
    firstAsked: (id) => call('chat.firstAsked', id),
    startVideo: (ext) => call('recording.start', ext),
    videoPart: (part) => call('recording.part', part),
    keepVideo: () => send('recording.keep'),
    dropVideo: () => send('recording.drop'),
    recorded: (recording) => told('chat:recorded', recording),
  }
  Object.defineProperty(window, 'geckitPhone', { value: calls })

  const swap = (next: Link): void => {
    link = next
    down = false
    bind(next)
    hideDropped()
    can(next)
    if (opened !== undefined) send('chat.watching', opened)
    for (const later of held.splice(0)) later()
    // Told again as if the Mac had told it: the list, the plan, the settings, and the end of the conversation on screen.
    void call<ChatSession[]>('chat.list', undefined).then((all) => {
      settled.add('list')
      told('chat:sessions', all)
    })
    void call('chat.plan').then((plan) => told('chat:plan', plan))
    void call<Settings>('settings.get').then((settings) => {
      settled.add('settings')
      told('settings:changed', settings)
    })
    if (shown !== undefined) bringUp(shown.id)
  }
  return { swap, ping: () => call('settings.get') }
}
