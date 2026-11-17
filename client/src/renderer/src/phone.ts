import type { Geckit } from '../../preload'
import type { ChatSession, SessionImage, SessionItem, ScreenControlled, SessionNotice, Settings } from '../../shared/api'
import { isRemote } from '../../shared/hosts'
import { isLocal, toPhone } from '../../shared/local'
import { countEvent } from '../../shared/counting'
import type { EventName } from '../../shared/counting'
import { clientOwn } from '../../shared/client-own'
import { pairAgain } from './pair-again'
import { clientData } from '../../shared/client-data'
import { PAIR_AGAIN } from '../../shared/pairing'
import { phoneErrors } from './phone-errors'
import type { PhoneCalls } from './phone-calls'
import type { EmployeesView } from '../../shared/employees'
import type { ManagerView } from '../../shared/manager'
import { keep, readKept } from './kept'
import { showLocal } from './local-page'
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
// A call lost to a dropped link, which the pill already says: not a fault to report.
const LINK_DOWN = 'The link to the host is down'
let dropping: number | undefined
// What the pill says: what is going on, and the step it is at, kept for the pill made once QUIET has passed.
let saying = { head: 'Not connected to the host', step: 'Trying again' }

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

// How long a notice sits over the page before it goes by itself.
const NOTICE = 4000

/** A brief pill over the page for something that could not be done, with nowhere else on the phone to say it. */
export function showNotice(text: string): void {
  document.querySelector('.phone-notice')?.remove()
  const line = document.createElement('div')
  line.className = 'phone-notice'
  line.setAttribute('role', 'status')
  line.textContent = text
  document.body.append(line)
  window.setTimeout(() => line.remove(), NOTICE)
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
  /** A conversation opened from a notification, held until the Chat window is there to open it. */
  readonly show: (id: string) => void
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

  // How this phone looks, which projects it shows, and whether it counts and sends its errors are its own, whatever the Mac has.
  const owned = clientOwn('own')
  const own = owned.own

  const errors = phoneErrors(
    () => owned.mine().sendErrors === true,
    () => void phone.settings.set({ sendErrors: true }),
  )
  let version: Promise<string> | undefined
  const counting = (name: EventName): void => {
    if (owned.mine().analytics !== true || owned.mine().analyticsAsked !== true) return
    const client = owned.client()
    version ??= call<string>('mac.version')
    void version.then((said) => countEvent(client, name, `phone ${said}`)).catch(() => undefined)
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
        else {
          if (message.error === PAIR_AGAIN) pairAgain.need()
          waiting?.failed(new Error(message.error))
        }
      }
      if (message.t === 'tell') {
        count(`tell ${message.channel}`, message.value)
        told(message.channel, message.value)
      }
    })
    one.onClose(() => {
      if (one !== link) return
      down = true
      told('phone:connection', false)
      for (const waiting of pending.values()) waiting.failed(new Error(LINK_DOWN))
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
          told('phone:connection', false)
        }
      }
      const expired = window.setTimeout(() => {
        held.splice(held.indexOf(later), 1)
        failed(new Error(LINK_DOWN))
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
    void call<{ readonly deflate?: boolean; readonly pairAgain?: boolean } | null>('link.can', ['sessionsChanged', 'steps', 'deflate', 'pictures'])
      .then((said) => {
        if (said?.pairAgain === true) pairAgain.need()
        if (said?.deflate === true && link === one) one.compress(true)
      })
      .catch(() => undefined)
  if (first !== undefined) can(first)

  const rawListen = <T>(channel: string, said: (value: T) => void): (() => void) => {
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

  // Conversations are read as every client reads them, and kept on the phone so it opens on them while the link is made.
  const data = clientData({
    call: (name, ...args) => call(name.replace(':', '.'), ...args),
    hear: (channel, said) => rawListen(channel, said),
    keeps: { prefix: mac, read: readKept, keep },
    down: () => down,
  })
  const listen = <T>(channel: string, said: (value: T) => void): (() => void) => data.listen(channel, said as (value: never) => void) ?? rawListen(channel, said)
  // The list as last told, for where a conversation's project is.
  let rows: readonly ChatSession[] | undefined
  listen<ChatSession[]>('chat:sessions', (all) => { rows = all })
  listen<Settings>('settings:changed', (settings) => later('settings', () => settings))

  const nothing = (): void => undefined
  // The Mac leaves out what happens in the conversation being looked at, and so does the phone.
  let watched: string | undefined
  // The conversation last opened, which is the one whose lines the Mac sends.
  let opened: string | undefined
  const never = (): (() => void) => nothing
  let toShow: string | undefined

  const phone: Geckit = {
    platform: boot.platform,
    home: boot.home,
    copy: (text) => void navigator.clipboard.writeText(text),
    pathFor: () => '',
    configuration: {
      reveal: () => Promise.reject(new Error('Manage configuration on the computer.')),
      export: () => Promise.reject(new Error('Manage configuration on the computer.')),
      import: () => Promise.reject(new Error('Manage configuration on the computer.')),
    },
    employees: {
      list: () => call('employees.list'),
      save: (draft) => call('employees.save', draft),
      archive: (id, revision) => call('employees.archive', id, revision),
      restore: (id, revision) => call('employees.restore', id, revision),
      retryInstructions: () => call('employees.retryInstructions'),
      memory: (id, cursor) => call('employees.memory', id, cursor),
      on: (said) => listen('employees:changed', said),
    },
    manager: {
      voiceMemos: async () => ({ state: 'unsupported', detail: 'Connect Voice Memos on the computer.' }),
      view: () => call('manager.view'),
      inspect: (id) => call('manager.inspect', id),
      send: (request) => call('manager.send', request),
      receipt: (id) => call('manager.receipt', id),
      answer: (request) => call('manager.answer', request),
      answerCard: (session, card, answer) => call('manager.answerCard', session, card, answer),
      unfollow: (thread, worker) => call('manager.unfollow', thread, worker),
      onItems: (said) => listen('manager:items', said),
      configure: (change) => call('manager.configure', change),
      pause: () => call('manager.pause'),
      resume: () => call('manager.resume'),
      retry: () => call('manager.retry'),
      history: (request) => call('manager.history', request),
      restart: () => call('manager.restart'),
      on: (said) => listen('manager:view', said),
    },
    channels: {
      view: () => call('channels.view'),
      request: (id, request) => call('channels.request', id, request),
      onShown: (said) => listen('channels:shown', said),
      screen: () => Promise.reject(new Error('Manage channels on the computer.')),
      install: () => Promise.reject(new Error('Manage channels on the computer.')),
      configure: (id, change) => call('channels.configure', id, change),
      remove: () => Promise.reject(new Error('Manage channels on the computer.')),
      inspect: () => Promise.reject(new Error('Manage channels on the computer.')),
      checkUpdates: () => Promise.reject(new Error('Manage channels on the computer.')),
      on: never,
    },
    settings: {
      get: () => keptFirst<Settings>('settings', () => call('settings.get'), 'settings:changed').then(own),
      set: async (change) => {
        const { here, there } = owned.take(change)
        if (Object.keys(here).length > 0) {
          if (change.sendErrors !== undefined) errors.follow(change.sendErrors)
          if (change.analytics === true) counting('phoneOpened')
        }
        if (Object.keys(there).length > 0) return own(await call<Settings>('settings.set', there))
        const now = owned.last() ?? (await call<Settings>('settings.get'))
        told('settings:changed', now)
        return own(now)
      },
      on: (said) => listen('settings:changed', said),
      pickApp: () => Promise.resolve(undefined),
      accessibility: () => Promise.resolve(true),
      openAccessibility: nothing,
    },
    errors: {
      question: errors.question,
      onQuestion: errors.onQuestion,
      answer: errors.answer,
      hold: (name, message, stack) => {
        if (message !== LINK_DOWN) errors.hold(name, message, stack)
      },
    },
    update: {
      view: () => call('update.view'),
      check: () => call('update.view'),
      restart: nothing,
      on: (said) => listen('update:view', said),
    },
    correct: (request) => call('correct', request),
    shortcuts: {
      onRun: (said) => listen('shortcuts:runChanged', said),
      destinations: () => call('shortcuts.destinations'),
      runs: (id) => call('shortcuts.runs', id),
      save: (draft) => call('shortcuts.save', draft),
      remove: (id) => send('shortcuts.remove', id),
      run: (id) => call('shortcuts.run', id),
      onManage: never,
    },
    transcribe: (request) => call('transcribe', request),
    signIn: { onOpen: () => () => undefined },
    browser: {
      state: () => call('browser.state'),
      fetchModel: () => Promise.resolve(),
      deleteModel: () => Promise.resolve(),
      openFolder: () => Promise.resolve(),
      openTest: (name) => call('browser.openTest', name),
      deleteTest: (name) => call('browser.deleteTest', name),
      updateTest: (name, next, note) => call('browser.updateTest', name, next, note),
      account: (name, note) => call('browser.account', name, note),
      viewStart: (name, url, token) => call('browser.viewStart', name, url, token),
      viewFrame: (name) => call('browser.viewFrame', name),
      viewInput: (name, input) => call('browser.viewInput', name, input),
      viewEnd: (name) => call('browser.viewEnd', name),
    },
    speech: {
      model: () => call('speech.model'),
      fetch: () => send('speech.fetch'),
      onModel: (said) => listen('speech:model', said),
    },
    chat: {
      open: nothing,
      installProvider: () => Promise.reject(new Error('Install providers on the computer.')),
      reinstallProvider: () => Promise.reject(new Error('Reinstall providers on the computer.')),
      uninstallProvider: () => Promise.reject(new Error('Remove providers on the computer.')),
      applyProviderUpdate: () => Promise.reject(new Error('Apply provider updates on the computer.')),
      checkProviderUpdates: () => Promise.reject(new Error('Check provider updates on the computer.')),
      getProviderPluginFailures: async () => [],
      account: (provider) => call('chat.account', provider),
      models: (root, provider) => call('chat.models', root, provider),
      plan: () => call('chat.plan'),
      onPlan: (said) => listen('chat:plan', said),
      plans: () => call('chat.plans'),
      onPlans: (said) => listen('chat:plans', said),
      addProject: () => Promise.resolve(undefined),
      forgetProject: (root) => call('chat.forgetProject', root),
      rememberProject: (root) => call('chat.rememberProject', root),
      hidden: (older) => call('chat.hidden', older),
      bring: (id) => call('chat.bring', id),
      list: data.list,
      listStatus: () => orAsBefore(call('chat.listStatus'), () => Promise.resolve([])),
      onListStatus: (said) => listen('chat:listStatus', said),
      items: data.items,
      before: data.before,
      onEarlier: (said) => listen('chat:earlier', said),
      picture: data.picture,
      find: (id, words) => data.find(id, words).catch(() => undefined),
      firstAsked: (id) => call<string>('chat.firstAsked', id),
      steps: data.steps,
      waiting: (id) => call<SessionItem | undefined>('chat.waiting', id),
      links: (id) => call('chat.links', id),
      exportConversation: (id) => call('chat.exportConversation', id),
      continueConversation: (request) => call('chat.continueConversation', request),
    copyConversation: (request) => call('chat.copyConversation', request),
    schedule: (message) => call('chat.schedule', message),
    preparedDraft: (id) => call('chat.preparedDraft', id),
    savePreparedDraft: (id, change) => call('chat.savePreparedDraft', id, change),
      cutOff: () => Promise.resolve([]),
      proceed: nothing,
      search: (asked, root) => call('chat.search', asked, root),
      send: (message) => {
        counting('chatSent')
        return call('chat.send', message)
      },
      retry: (id) => call('chat.retry', id),
      shell: (command) => call('chat.shell', command),
      stopShell: (id, item) => send('chat.stopShell', id, item),
      typeShell: (id, item, text) => send('chat.typeShell', id, item, text),
      toBackground: (id, item) => send('chat.toBackground', id, item),
      stopTask: (id, task) => send('chat.stopTask', id, task),
      clearTask: (id, task) => send('chat.clearTask', id, task),
      taskOutput: (id, task) => call('chat.taskOutput', id, task),
      answer: (id, card, answer) => send('chat.answer', id, card, answer),
      answerRequest: (request, choice) => call('chat.answerRequest', request, choice),
      startAll: (request, where) => call('chat.startAll', request, where),
      answerTeamRequest: (request, choice) => call('chat.answerTeamRequest', request, choice),
      stop: (id) => send('chat.stop', id),
      unqueue: (id, queued) => call('chat.unqueue', id, queued),
      injectQueued: (id, queued) => call('chat.injectQueued', id, queued),
      queuedPicture: (id, queued, index, width) =>
        call<SessionImage | null>('chat.queuedPicture', id, queued, index, width).then((one) => one ?? undefined),
      requeue: (id, queued, text) => send('chat.requeue', id, queued, text),
      reorderQueued: (id, queued, target, after) => send('chat.reorderQueued', id, queued, target, after),
      delegate: (id, queued, history) => call('chat.delegate', id, queued, history),
      mode: (id, mode) => send('chat.mode', id, mode),
      transport: (id, transport) => send('chat.transport', id, transport),
      assignEmployee: (id, employeeId) => call('chat.assignEmployee', id, employeeId),
      rename: (id, title) => send('chat.rename', id, title),
      setChecklist: (id, checklist, typing) => send('chat.setChecklist', id, checklist, typing),
      mark: (id, status) => send('chat.mark', id, status),
      hide: (id) => send('chat.hide', id),
      keep: (id, stays) => send('chat.keep', id, stays),
      remove: (ids) => call('chat.remove', ids),
      watching: (id) => {
        watched = id
        // Behind another app it watches nothing, and what it had open is still what the Mac sends it.
        if (id === undefined) return
        send('chat.read', id)
        if (id === opened) return
        opened = id
        data.watching(id)
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
      commands: (root) => call('chat.commands', root),
      // The phone has nothing of this Mac's own files to carry anywhere.
      upload: () => Promise.resolve({ problem: 'A file on the phone is not copied to a host.' }),
      // An address on the Mac's localhost means the phone itself here, so it is shown through the Mac instead.
      // On a host, that address is the host's, not the Mac's, so it is carried there first.
      openLink: (href) => {
        const local = showLocal()
        if (local === undefined || !isLocal(href)) {
          window.open(href, '_blank', 'noopener')
          return
        }
        const root = rows?.find((one) => one.id === watched)?.root
        if (root !== undefined && isRemote(root)) {
          void calls.forwardLink(root, href).then(({ href: carried, moved, problem }) => {
            if (problem !== undefined) {
              showNotice(problem)
              return
            }
            local(toPhone(carried), moved)
          })
          return
        }
        local(toPhone(href))
      },
      onSessions: (said) => listen('chat:sessions', said),
      onItems: (said) => listen('chat:items', said),
      onAccount: (said) => listen('chat:accountChanged', said),
      onShow: (said) => {
        if (toShow !== undefined) said(toShow)
        toShow = undefined
        return listen('chat:show', said)
      },
      onRecorded: (said) => listen('chat:recorded', said),
      onNotice: (said) =>
        listen<SessionNotice>('chat:notice', (notice) => {
          if (notice.session !== watched) said(notice)
        }),
      onSpotlight: never,
      onScreenshot: never,
      onTask: never,
      listening: nothing,
    },
    lineup: {
      state: () => call('lineup.state'),
      onChanged: (said) => listen('lineup:changed', said),
    },
    // Hosts are reached through the Mac; adding, editing and removing one, and a terminal, are for the Mac itself.
    secrets: {
      list: () => call('secrets.list'),
      history: (name) => call('secrets.history', name),
      revoke: (name) => call('secrets.revoke', name),
      status: () => call('secrets.status'),
      prepare: () => Promise.reject(new Error('Manage secrets on the computer.')),
      save: () => Promise.reject(new Error('Manage secrets on the computer.')),
      update: () => Promise.reject(new Error('Manage secrets on the computer.')),
    },
    hosts: {
      list: () => call('hosts.list'),
      onChanged: (said) => listen('hosts:changed', said),
      known: () => Promise.resolve([]),
      check: () => Promise.resolve({ ok: false, problem: 'Hosts are added on the computer running GeckIt.' }),
      update: () => Promise.resolve({ ok: false, problem: 'Hosts are changed on the computer running GeckIt.' }),
      onChecks: never,
      remove: () => Promise.resolve(),
      forget: nothing,
      connect: (id) => send('hosts.connect', id),
      reconnect: (id) => send('hosts.reconnect', id),
      disconnect: (id) => send('hosts.disconnect', id),
      folders: (id, path) => call('hosts.folders', id, path),
      addFolder: (id, path) => call('hosts.addFolder', id, path),
      addFolderSaying: (id, path) => call('hosts.addFolderSaying', id, path),
      prompts: () => call('hosts.prompts'),
      onPrompt: (said) => listen('hosts:prompt', said),
      onAnswered: (said) => listen('hosts:answered', said),
      answer: (answer) => send('hosts.answer', answer),
      install: () => Promise.resolve({ ok: false, text: 'Claude Code is installed on a host from the computer running GeckIt.' }),
      // Trusting a changed key is fixed on the computer; the phone's own card says to look there instead of offering to.
      trustNewKey: () => Promise.resolve({ ok: false, problem: 'A changed key is trusted on the computer running GeckIt.' }),
      running: (id) => call('hosts.running', id),
      working: (id) => call('hosts.working', id),
      conversations: (id) => call('hosts.conversations', id),
      terminal: nothing,
      // A terminal on the phone is the Mac's own to open, not one of its own.
      resumeLine: () => Promise.resolve(undefined),
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
    gecko: { state: () => Promise.resolve({ pose: 'asleep', count: 0 }), onState: never, onHop: never, onCursor: never, onRing: never, onCamera: never, onListen: never, press: nothing, drop: nothing, menu: nothing, move: nothing, moved: nothing, resize: nothing, onRingShow: never, ringShown: nothing, onRingHide: never, aim: nothing, act: nothing, close: nothing },
    phone: { state: () => Promise.resolve({ count: 0 }), onState: never, newCode: nothing },
    peer: {
      pairing: () => Promise.resolve(undefined),
      call: () => Promise.resolve(undefined),
      onTell: never,
      state: nothing,
      screen: () => Promise.resolve({}),
      shares: () => Promise.resolve([]),
      onShares: never,
      share: () => Promise.resolve(undefined),
      onScale: never,
      scaled: nothing,
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
        (done) => done ?? { error: 'Update GeckIt on the host to work it from here' },
        (error: unknown) => ({
          error:
            error instanceof Error && error.message.includes('No such call')
              ? 'Update GeckIt on the host to work it from here'
              : error instanceof Error
                ? error.message
                : String(error),
        }),
      ),
  }
  Object.defineProperty(window, 'geckitScreen', { value: screen })
  const calls: PhoneCalls = {
    connected: () => !down,
    onConnection: (said) => listen<boolean>('phone:connection', said),
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
    localFetch: (asked) => call('local.fetch', asked),
    forwardLink: (root, href) => call('hosts.forwardLink', root, href),
    pushToken: (token) => send('push.token', token),
    away: (on) => send('push.away', on),
  }
  Object.defineProperty(window, 'geckitPhone', { value: calls })

  const swap = (next: Link): void => {
    link = next
    down = false
    bind(next)
    told('phone:connection', true)
    hideDropped()
    can(next)
    if (opened !== undefined) send('chat.watching', opened)
    for (const later of held.splice(0)) later()
    // Told again as if the Mac had told it: the list and the end of the conversation on screen, employees, Manager, plan, count working and settings.
    data.reconnected()
    void call<EmployeesView>('employees.list').then((view) => told('employees:changed', view)).catch(() => undefined)
    void call<ManagerView>('manager.view').then((view) => told('manager:view', view)).catch(() => undefined)
    void call('chat.plan').then((plan) => told('chat:plan', plan))
    void call('lineup.state').then((lineup) => told('lineup:changed', lineup))
    void call<Settings>('settings.get').then((settings) => {
      settled.add('settings')
      told('settings:changed', settings)
    })
  }
  counting('phoneOpened')
  const show = (id: string): void => {
    if ((heard.get('chat:show')?.size ?? 0) > 0) told('chat:show', id)
    else toShow = id
  }
  return { swap, ping: () => call('settings.get'), show }
}
