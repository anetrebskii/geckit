import { App } from '@capacitor/app'
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { Keyboard } from '@capacitor/keyboard'
import { PushNotifications } from '@capacitor/push-notifications'
import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

import '../../client/src/renderer/src/styles.css'
import './pair.css'
import { dial } from '../../client/src/renderer/src/link'
import type { Dialing, Link } from '../../client/src/renderer/src/link'
import { installGeckit, sayDropped, showDropped } from '../../client/src/renderer/src/phone'
import { phoneCalls } from '../../client/src/renderer/src/phone-calls'
import type { Boot, Installed } from '../../client/src/renderer/src/phone'
import type { Macs } from '../../client/src/renderer/src/macs'
import type { Tap } from '../../client/src/renderer/src/tap'
import type { Dictate, Level, Voice } from '../../client/src/renderer/src/dictate'
import type { PickedVideo, Picking } from '../../client/src/renderer/src/picked'
import { readPairing, roomOf } from '../../client/src/shared/pairing'
import type { Pairing } from '../../client/src/shared/pairing'
import icon from './icon.png'

const KEPT = 'pairing'
// A drop from switching networks mends in seconds; a Mac that is asleep should not be asked every second.
const AGAIN = [0, 2000, 5000, 10_000, 30_000]

const kept = (): Pairing | undefined => readPairing(localStorage.getItem(KEPT) ?? '')

// Every Mac this phone has scanned, so it can go back to one without the code; KEPT is the one it talks to now.
const MACS = 'macs'
interface KeptMac {
  readonly link: string
  readonly name?: string
  /** The person's own name for it, which the Mac's does not overwrite. */
  readonly given?: string
}
const linkOf = (pairing: Pairing): string => `geckit://pair?k=${pairing.key}&s=${encodeURIComponent(pairing.signal)}`

function keptMacs(): KeptMac[] {
  try {
    const list = JSON.parse(localStorage.getItem(MACS) ?? '[]') as KeptMac[]
    if (list.length > 0) return list
  } catch {
    // Written by hand or by an older app: started over from the one in use.
  }
  const one = localStorage.getItem(KEPT)
  return one === null ? [] : [{ link: one }]
}

const nameOf = (mac: KeptMac, at: number): string => mac.given ?? mac.name ?? `Host ${String(at + 1)}`

function change(index: number, how: (mac: KeptMac) => KeptMac): void {
  localStorage.setItem(MACS, JSON.stringify(keptMacs().map((mac, at) => (at === index ? how(mac) : mac))))
}
const isCurrent = (mac: KeptMac): boolean => readPairing(mac.link)?.key === kept()?.key

function useMac(link: string | undefined): void {
  if (link === undefined) localStorage.removeItem(KEPT)
  else localStorage.setItem(KEPT, link)
  location.reload()
}

;(window as { geckitMacs?: Macs }).geckitMacs = {
  list: () => keptMacs().map((mac, at) => ({ name: nameOf(mac, at), current: isCurrent(mac) })),
  switchTo: (index) => useMac(keptMacs()[index]?.link),
  add: () => void scan(),
  forget: (index) => {
    const list = keptMacs()
    const gone = list[index]
    if (gone === undefined) return
    const left = list.filter((one) => one !== gone)
    localStorage.setItem(MACS, JSON.stringify(left))
    void keepKeys()
    if (isCurrent(gone)) useMac(left[0]?.link)
  },
  rename: (index, name) =>
    change(index, ({ given: _, ...mac }) => (name.trim() === '' ? mac : { ...mac, given: name.trim() })),
}

// The Taptic Engine for the Chat window, which only knows what kind of moment it is; a browser without one feels nothing.
;(window as { geckitTap?: (kind: Tap) => void }).geckitTap = (kind) => {
  const felt =
    kind === 'light'
      ? Haptics.impact({ style: ImpactStyle.Light })
      : kind === 'firm'
        ? Haptics.impact({ style: ImpactStyle.Medium })
        : Haptics.notification({ type: kind === 'done' ? NotificationType.Success : NotificationType.Warning })
  felt.catch(() => undefined)
}

interface Dictation {
  start(options: { language: string }): Promise<void>
  stop(): Promise<void>
  record(): Promise<void>
  recorded(options: { keep: boolean }): Promise<{ audio?: string }>
  addListener(event: 'heard', said: (heard: { text: string }) => void): Promise<PluginListenerHandle>
  addListener(event: 'ended', said: () => void): Promise<PluginListenerHandle>
  addListener(event: 'level', said: (heard: { level: number }) => void): Promise<PluginListenerHandle>
}
const dictation = registerPlugin<Dictation>('Dictation')
let hearing: PluginListenerHandle[] = []

// iOS's own speech recognition for the composer, which hears what is said while the button is held on.
;(window as { geckitDictate?: Dictate }).geckitDictate = {
  start: async (language, heard, ended) => {
    for (const one of hearing.splice(0)) void one.remove()
    hearing = await Promise.all([
      dictation.addListener('heard', (said) => heard(said.text)),
      dictation.addListener('ended', () => {
        for (const one of hearing.splice(0)) void one.remove()
        ended()
      }),
    ])
    await dictation.start({ language }).catch((error: unknown) => {
      for (const one of hearing.splice(0)) void one.remove()
      throw error
    })
  },
  stop: () => dictation.stop().catch(() => undefined),
  cancel: () => void dictation.stop().catch(() => undefined),
  live: true,
}

// How loud the microphone is while either of the two listens.
;(window as { geckitLevel?: Level }).geckitLevel = (said) => {
  const handle = dictation.addListener('level', (heard) => said(heard.level))
  return () => void handle.then((one) => one.remove())
}

// The microphone alone, for the host to hear what was said with its own model.
;(window as { geckitVoice?: Voice }).geckitVoice = {
  start: () => dictation.record(),
  stop: async () => (await dictation.recorded({ keep: true })).audio ?? '',
  drop: () => void dictation.recorded({ keep: false }).catch(() => undefined),
}

interface Recording {
  pick(): Promise<Partial<PickedVideo> & { url?: string }>
  latest(options: { since: number }): Promise<Partial<PickedVideo> & { url?: string; made?: number; thumb?: string }>
  words(options: { path: string; language: string }): Promise<{ text: string }>
  frames(options: { path: string; count: number }): Promise<{ frames: { at: number; data: string }[] }>
  drop(options: { path: string }): Promise<void>
}
const recording = registerPlugin<Recording>('Recording')
const urls = new Map<string, string>()

// A video from Photos, read on the phone: iOS hears its words and takes its frames, and the page reads the file to send it on.
;(window as { geckitPicking?: Picking }).geckitPicking = {
  pick: async () => {
    const got = await recording.pick()
    if (got.path === undefined || got.url === undefined) return undefined
    urls.set(got.path, got.url)
    return { path: got.path, ext: got.ext ?? 'mov', seconds: got.seconds ?? 0, bytes: got.bytes ?? 0 }
  },
  latest: async (since) => {
    const got = await recording.latest({ since })
    if (got.path === undefined || got.url === undefined) return undefined
    urls.set(got.path, got.url)
    return { path: got.path, ext: got.ext ?? 'mov', seconds: got.seconds ?? 0, bytes: got.bytes ?? 0, made: got.made ?? since, thumb: got.thumb ?? '' }
  },
  words: async (video, language) => (await recording.words({ path: video.path, language })).text,
  frames: async (video, count) => (await recording.frames({ path: video.path, count })).frames,
  piece: async (video, from, to) =>
    (
      await fetch(Capacitor.convertFileSrc(urls.get(video.path) ?? `file://${video.path}`), {
        headers: { Range: `bytes=${String(from)}-${String(to - 1)}` },
      })
    ).blob(),
  drop: (video) => {
    urls.delete(video.path)
    void recording.drop({ path: video.path }).catch(() => undefined)
  },
}

interface PushKeys {
  keep(options: { keys: string[] }): Promise<void>
}
const pushKeys = registerPlugin<PushKeys>('PushKeys')

// A push is sealed on the Mac with the key in its QR code; the extension that opens it before iOS shows it reads the keys from where the app leaves them.
const keepKeys = (): Promise<void> =>
  pushKeys.keep({ keys: keptMacs().flatMap((mac) => readPairing(mac.link)?.key ?? []) }).catch(() => undefined)

async function startPush(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return
  await keepKeys()
  let asked = (await PushNotifications.checkPermissions()).receive
  if (asked === 'prompt' || asked === 'prompt-with-rationale') asked = (await PushNotifications.requestPermissions()).receive
  if (asked === 'granted') await PushNotifications.register()
}

// Each Mac is told where Apple reaches this phone as it is joined; iOS says it again on every register.
void PushNotifications.addListener('registration', ({ value }) => phoneCalls()?.pushToken(value)).catch(() => undefined)

// A conversation to open once the Chat window is up, or after switching to the Mac it is on.
const SHOW = 'show'
let toShow: string | undefined

function showHeld(): void {
  const id = toShow ?? localStorage.getItem(SHOW) ?? undefined
  toShow = undefined
  localStorage.removeItem(SHOW)
  if (id !== undefined) installed?.show(id)
}

// Pressed: the conversation it is about, on the Mac it came from.
void PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
  const { room, session } = notification.data as { room?: unknown; session?: unknown }
  if (typeof session !== 'string') return
  void (async () => {
    const macs = keptMacs()
    const rooms = await Promise.all(macs.map((mac) => roomOf(readPairing(mac.link)?.key ?? '')))
    const from = macs[rooms.indexOf(typeof room === 'string' ? room : '')]
    if (from !== undefined && !isCurrent(from)) {
      localStorage.setItem(SHOW, session)
      useMac(from.link)
      return
    }
    toShow = session
    if (installed !== undefined) showHeld()
  })()
}).catch(() => undefined)

interface LocalPage {
  open(options: { url: string; note?: string }): Promise<void>
  respond(options: { id: string; status: number; headers: Record<string, string>; body: string; moved?: string }): Promise<void>
  addListener(
    event: 'request',
    said: (asked: { id: string; url: string; method: string; headers: Record<string, string>; body: string }) => void,
  ): Promise<PluginListenerHandle>
}
const localPage = registerPlugin<LocalPage>('LocalPage')

// A page off the Mac's localhost, in the app's own view: each request it makes is made on the Mac, over the link.
// A note, when the page's port moved on the way, is said over its title.
;(window as { geckitLocal?: (url: string, note?: string) => void }).geckitLocal = (url, note) =>
  void localPage.open({ url, ...(note === undefined ? {} : { note }) }).catch(() => undefined)
void localPage
  .addListener('request', (asked) => {
    const answered = phoneCalls()?.localFetch({ ...asked, headers: Object.entries(asked.headers) })
    void (answered ?? Promise.reject(new Error('Not joined to the host yet')))
      .then(({ headers, ...answer }) => localPage.respond({ id: asked.id, headers: Object.fromEntries(headers), ...answer }))
      .catch((error: unknown) =>
        localPage.respond({
          id: asked.id,
          status: 502,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
          body: btoa(String.fromCharCode(...new TextEncoder().encode(`The host did not answer: ${error instanceof Error ? error.message : String(error)}`))),
        }),
      )
  })
  .catch(() => undefined)

// The arrows and Done over the keys are for forms of many fields; the composer is one.
void Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => undefined)
Keyboard.addListener('keyboardWillShow', (info) => {
  document.documentElement.classList.add('keyboard')
  document.documentElement.style.setProperty('--keyboard', `${String(info.keyboardHeight)}px`)
}).catch(() => undefined)
Keyboard.addListener('keyboardWillHide', () => {
  document.documentElement.classList.remove('keyboard')
  document.documentElement.style.setProperty('--keyboard', '0px')
}).catch(() => undefined)

/** What the screen says in its middle, and its buttons along the bottom where the thumb is. */
function screen(middle: readonly HTMLElement[], actions: readonly HTMLElement[] = []): void {
  document.querySelector('.pair')?.remove()
  const shown = document.createElement('main')
  shown.className = 'pair'
  const mid = document.createElement('div')
  mid.className = 'pair-mid'
  mid.append(...middle)
  const bottom = document.createElement('div')
  bottom.className = 'pair-actions'
  bottom.append(...actions)
  shown.append(mid, bottom)
  document.body.append(shown)
}

function line(text: string, className = '', tag = 'p'): HTMLElement {
  const said = document.createElement(tag)
  said.className = className
  said.textContent = text
  return said
}

function picture(className: string, html: string): HTMLElement {
  const one = document.createElement('div')
  one.className = className
  one.innerHTML = html
  return one
}

function steps(lines: readonly string[]): HTMLElement {
  const list = document.createElement('ol')
  list.className = 'pair-steps'
  lines.forEach((text, at) => {
    const one = document.createElement('li')
    const number = document.createElement('i')
    number.textContent = String(at + 1)
    one.append(number, text)
    list.append(one)
  })
  return list
}

function button(text: string, className: string, pressed: () => void): HTMLElement {
  const one = document.createElement('button')
  one.type = 'button'
  one.className = className
  one.textContent = text
  one.addEventListener('click', pressed)
  return one
}

function notPaired(wrong = false): void {
  screen(
    [
      picture('pair-icon', `<img src="${icon}" alt="">`),
      line('GeckIt', 'pair-name', 'h1'),
      line('Your conversations with Claude Code, on your iPhone.'),
      steps(['Open GeckIt on your host', 'Settings, then turn on Phone', 'Scan the code']),
      ...(wrong ? [line('That is not a GeckIt code.', 'pair-error')] : []),
    ],
    [button('Scan', 'pair-fill', () => void scan())],
  )
}

async function scan(): Promise<void> {
  let text: string
  try {
    text = (await CapacitorBarcodeScanner.scanBarcode({ hint: CapacitorBarcodeScannerTypeHint.QR_CODE })).ScanResult
  } catch {
    // Cancelled, or no camera allowed: back where the person was.
    if (kept() === undefined) notPaired()
    else void connect()
    return
  }
  const pairing = readPairing(text)
  if (pairing === undefined) return notPaired(true)
  paired(pairing)
}

function paired(pairing: Pairing): void {
  const list = keptMacs()
  // A Mac scanned again keeps its place and its name; its code may have changed.
  const at = list.findIndex((one) => readPairing(one.link)?.key === pairing.key)
  const mac = { ...list[at], link: linkOf(pairing) }
  localStorage.setItem(MACS, JSON.stringify(at === -1 ? [...list, mac] : list.map((one, index) => (index === at ? mac : one))))
  localStorage.setItem(KEPT, linkOf(pairing))
  if (started) location.reload()
  else void connect()
}

function bootOf(link: Link): Promise<Boot> {
  return new Promise((done, failed) => {
    link.onMessage((message) => {
      if (message.t !== 'reply' || message.id !== -1) return
      if (message.error === undefined) done(message.value as Boot)
      else failed(new Error(message.error))
    })
    link.onClose(() => failed(new Error('The host did not answer')))
    link.send({ t: 'call', id: -1, name: 'boot', args: [] })
  })
}

let started = false
// A connect started again, from Scan or Try again, leaves the one before it to finish unseen.
let attempt = 0
// Past this a step is slow enough to say how long it has taken, and what else can be done.
const SLOW = 8000

type Stage = Dialing | 'boot'
const STAGES: readonly Stage[] = ['service', 'mac', 'joining', 'boot']

const stageSaid = (mac: string): Record<Stage, string> => ({
  service: 'Reaching the pairing service',
  mac: `Waiting for ${mac} to answer`,
  joining: 'Opening the connection',
  boot: 'Loading your conversations',
})

/** The steps of a connect, the one under way turning, so a slow Mac reads as waited on rather than stuck. */
function connecting(mac: string, others: readonly HTMLElement[]): (at: Stage) => void {
  const said = stageSaid(mac)
  const list = document.createElement('ol')
  list.className = 'pair-progress'
  const rows = STAGES.map((stage) => {
    const one = document.createElement('li')
    const mark = document.createElement('i')
    const text = document.createElement('span')
    text.textContent = said[stage]
    const time = document.createElement('small')
    one.append(mark, text, time)
    list.append(one)
    return one
  })
  const hint = line('GeckIt has to be open there, with Phone turned on in Settings.', 'pair-hint')
  hint.hidden = true
  const actions = [...others, button('Scan again', 'pair-plain', () => void scan())]
  for (const one of actions) one.hidden = true
  screen([line(`Connecting to ${mac}`, 'pair-title', 'h2'), list, hint], actions)

  let since = Date.now()
  let now = 0
  const tick = window.setInterval(() => {
    const taken = Date.now() - since
    const time = rows[now]?.querySelector('small')
    if (time !== null && time !== undefined) time.textContent = taken < SLOW ? '' : `${String(Math.round(taken / 1000))} s`
    if (taken >= SLOW) {
      hint.hidden = STAGES[now] !== 'mac'
      for (const one of actions) one.hidden = false
    }
    if (!list.isConnected) window.clearInterval(tick)
  }, 1000)
  return (at) => {
    now = STAGES.indexOf(at)
    since = Date.now()
    rows.forEach((one, index) => {
      one.className = index < now ? 'done' : index === now ? 'now' : ''
      const time = one.querySelector('small')
      if (time !== null) time.textContent = ''
    })
    hint.hidden = true
  }
}

// What a Mac said of itself the last time, by its key, so the app can open on what it kept of it before the Mac answers again.
const BOOTS = 'boots'
const macOf = (pairing: Pairing): string => pairing.key.slice(0, 16)

function keptBoot(pairing: Pairing): Boot | undefined {
  try {
    return (JSON.parse(localStorage.getItem(BOOTS) ?? '{}') as Record<string, Boot>)[macOf(pairing)]
  } catch {
    return undefined
  }
}

function keepBoot(pairing: Pairing, boot: Boot): void {
  let all: Record<string, Boot> = {}
  try {
    all = JSON.parse(localStorage.getItem(BOOTS) ?? '{}') as Record<string, Boot>
  } catch {
    // Written by an older app: started over.
  }
  localStorage.setItem(BOOTS, JSON.stringify({ ...all, [macOf(pairing)]: boot }))
}

async function connect(): Promise<void> {
  const pairing = kept()
  if (pairing === undefined) return notPaired()
  const mine = ++attempt
  const macs = keptMacs()
  const here = macs.findIndex(isCurrent)
  // A Mac this phone has talked to before: its conversations are up at once, and the link is made under them.
  const before = started ? undefined : keptBoot(pairing)
  if (before !== undefined) {
    const name = macs[here] === undefined ? (before.name ?? 'the host') : nameOf(macs[here], here)
    started = true
    installed = installGeckit(undefined, before, macOf(pairing))
    showHeld()
    void startPush()
    const opened = import('../../client/src/renderer/src/chat/main')
    void mend(pairing, installed.swap, name, true)
    await opened
    return
  }
  const others = macs.map((mac, at) => ({ mac, at })).filter(({ at }) => at !== here)
  const ours = macs[here]
  const label = ours === undefined ? undefined : nameOf(ours, here)
  const step = connecting(
    label ?? 'the host',
    others.map(({ mac, at }) => button(`Connect to ${nameOf(mac, at)}`, 'pair-plain', () => useMac(mac.link))),
  )
  let link: Link
  let boot: Boot
  try {
    link = await dial(pairing, undefined, (at) => {
      if (mine === attempt) step(at)
    })
    if (mine !== attempt) return link.close()
    step('boot')
    boot = await bootOf(link)
    if (mine !== attempt) return link.close()
  } catch {
    if (mine !== attempt) return
    screen(
      [
        picture(
          'pair-away',
          '<svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><rect x="8" y="12" width="40" height="26" rx="3"/><path d="M20 46h16M28 38v8M8 8l40 40"/></svg>',
        ),
        line(`${label ?? 'The host'} did not answer.`, 'pair-title', 'h2'),
        line('GeckIt has to be open there, with Phone turned on in Settings.'),
      ],
      [
        button('Try again', 'pair-fill', () => void connect()),
        ...others.map(({ mac, at }) => button(`Connect to ${nameOf(mac, at)}`, 'pair-plain', () => useMac(mac.link))),
        button('Scan again', 'pair-plain', () => void scan()),
      ],
    )
    return
  }
  if (boot.name !== undefined && here !== -1) {
    localStorage.setItem(MACS, JSON.stringify(macs.map((mac, at) => (at === here ? { ...mac, name: boot.name } : mac))))
  }
  keepBoot(pairing, boot)
  document.querySelector('.pair')?.remove()
  started = true
  current = link
  installed = installGeckit(link, boot, macOf(pairing))
  showHeld()
  void startPush()
  const { swap } = installed
  const name = boot.name ?? macs[here]?.name ?? 'the host'
  link.onClose(() => void mend(pairing, swap, name))
  await import('../../client/src/renderer/src/chat/main')
}

let current: Link | undefined
let installed: Installed | undefined

/**
 * The page stays as it was under the pill until the Mac answers again, and then carries on over the new link.
 *
 * The pill says the step each try is at and how long it has taken once that is long, and between tries when the
 * next one is, as the first connect's screen does.
 */
async function mend(pairing: Pairing, swap: (next: Link) => void, mac: string, first = false): Promise<void> {
  showDropped()
  const said = stageSaid('the host')
  const head = `${first ? 'Connecting' : 'Reconnecting'} to ${mac}`
  let step = 'Trying again'
  let since = Date.now()
  let next: number | undefined
  let tries = 0
  const tell = (): void => {
    if (next !== undefined) {
      const left = Math.max(1, Math.round((next - Date.now()) / 1000))
      const hint = tries >= 3 ? ' GeckIt has to be open there, with Phone on.' : ''
      sayDropped(`${mac} did not answer`, `Trying again in ${String(left)} s.${hint}`)
      return
    }
    const taken = Date.now() - since
    sayDropped(head, taken < SLOW ? step : `${step}, ${String(Math.round(taken / 1000))} s`)
  }
  const tick = window.setInterval(tell, 1000)
  for (let tried = 0; ; tried++) {
    const wait = AGAIN[Math.min(tried, AGAIN.length - 1)] ?? 0
    next = wait === 0 ? undefined : Date.now() + wait
    tell()
    await new Promise((done) => setTimeout(done, wait))
    next = undefined
    try {
      const link = await dial(pairing, undefined, (at) => {
        step = said[at]
        since = Date.now()
        tell()
      })
      window.clearInterval(tick)
      current = link
      swap(link)
      link.onClose(() => void mend(pairing, swap, mac))
      if (first) void refreshBoot(pairing, link)
      return
    } catch {
      tries++
    }
  }
}

/** The Mac's name and home as it says them now, for the next launch; asked over the link just made, as the first connect does. */
async function refreshBoot(pairing: Pairing, link: Link): Promise<void> {
  const boot = await bootOf(link).catch(() => undefined)
  if (boot === undefined) return
  keepBoot(pairing, boot)
  const macs = keptMacs()
  const here = macs.findIndex(isCurrent)
  if (boot.name !== undefined && here !== -1) {
    localStorage.setItem(MACS, JSON.stringify(macs.map((mac, at) => (at === here ? { ...mac, name: boot.name } : mac))))
  }
}

// Back from the background, a link iOS froze may look open and carry nothing; one that does not answer in a few seconds is closed, which starts the mending.
const SILENT = 3000
void App.addListener('pause', () => phoneCalls()?.away(true))

void App.addListener('resume', () => {
  const link = current
  if (link === undefined || !started) return
  phoneCalls()?.away(false)
  const quiet = setTimeout(() => link.close(), SILENT)
  void installed
    ?.ping()
    .then(() => clearTimeout(quiet))
    .catch(() => undefined)
})

void App.addListener('appUrlOpen', ({ url }) => {
  const pairing = readPairing(url)
  if (pairing !== undefined) paired(pairing)
})

void App.getLaunchUrl().then((launched) => {
  const pairing = launched === undefined ? undefined : readPairing(launched.url)
  if (pairing !== undefined) paired(pairing)
  else void connect()
})
