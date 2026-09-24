import { App } from '@capacitor/app'
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'
import { Keyboard } from '@capacitor/keyboard'

import '../../client/src/renderer/src/styles.css'
import './pair.css'
import { dial } from '../../client/src/renderer/src/link'
import type { Link } from '../../client/src/renderer/src/link'
import { installGeckit, showDropped } from '../../client/src/renderer/src/phone'
import type { Boot } from '../../client/src/renderer/src/phone'
import type { Macs } from '../../client/src/renderer/src/macs'
import type { Tap } from '../../client/src/renderer/src/tap'
import { readPairing } from '../../client/src/shared/pairing'
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
  readonly favorite?: boolean
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

const nameOf = (mac: KeptMac, at: number): string => mac.given ?? mac.name ?? `Mac ${String(at + 1)}`

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
  list: () => keptMacs().map((mac, at) => ({ name: nameOf(mac, at), current: isCurrent(mac), favorite: mac.favorite === true })),
  switchTo: (index) => useMac(keptMacs()[index]?.link),
  add: () => void scan(),
  forget: (index) => {
    const list = keptMacs()
    const gone = list[index]
    if (gone === undefined) return
    const left = list.filter((one) => one !== gone)
    localStorage.setItem(MACS, JSON.stringify(left))
    if (isCurrent(gone)) useMac(left[0]?.link)
  },
  rename: (index, name) =>
    change(index, ({ given: _, ...mac }) => (name.trim() === '' ? mac : { ...mac, given: name.trim() })),
  favorite: (index, on) => change(index, ({ favorite: _, ...mac }) => (on ? { ...mac, favorite: true } : mac)),
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

// The arrows and Done over the keys are for forms of many fields; the composer is one.
void Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => undefined)
Keyboard.addListener('keyboardWillShow', () => document.documentElement.classList.add('keyboard')).catch(() => undefined)
Keyboard.addListener('keyboardWillHide', () => document.documentElement.classList.remove('keyboard')).catch(() => undefined)

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
      steps(['Open GeckIt on your Mac', 'Settings, then turn on Phone', 'Scan the code']),
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
    link.onClose(() => failed(new Error('The Mac did not answer')))
    link.send({ t: 'call', id: -1, name: 'boot', args: [] })
  })
}

let started = false

async function connect(): Promise<void> {
  const pairing = kept()
  if (pairing === undefined) return notPaired()
  const macs = keptMacs()
  const here = macs.findIndex(isCurrent)
  const others = macs
    .map((mac, at) => ({ mac, at }))
    .filter(({ at }) => at !== here)
    .sort((one, other) => Number(other.mac.favorite === true) - Number(one.mac.favorite === true))
  const mine = macs[here]
  const name = mine === undefined ? undefined : nameOf(mine, here)
  screen([picture('pair-spin', ''), line(name === undefined ? 'Connecting to the Mac' : `Connecting to ${name}`, 'pair-wait')])
  let link: Link
  let boot: Boot
  try {
    link = await dial(pairing)
    boot = await bootOf(link)
  } catch {
    screen(
      [
        picture(
          'pair-away',
          '<svg width="56" height="56" viewBox="0 0 56 56" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><rect x="8" y="12" width="40" height="26" rx="3"/><path d="M20 46h16M28 38v8M8 8l40 40"/></svg>',
        ),
        line(`${name ?? 'The Mac'} did not answer.`, 'pair-title', 'h2'),
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
  document.querySelector('.pair')?.remove()
  started = true
  current = link
  const swap = installGeckit(link, boot)
  link.onClose(() => void mend(pairing, swap))
  await import('../../client/src/renderer/src/chat/main')
}

let current: Link | undefined

/** The page stays as it was under the pill until the Mac answers again, and then carries on over the new link. */
async function mend(pairing: Pairing, swap: (next: Link) => void): Promise<void> {
  showDropped()
  for (let tried = 0; ; tried++) {
    await new Promise((done) => setTimeout(done, AGAIN[Math.min(tried, AGAIN.length - 1)]))
    try {
      const link = await dial(pairing)
      current = link
      swap(link)
      link.onClose(() => void mend(pairing, swap))
      return
    } catch {
      // Not yet.
    }
  }
}

// Back from the background, a link iOS froze may look open and carry nothing; one that does not answer in a few seconds is closed, which starts the mending.
const SILENT = 3000
void App.addListener('resume', () => {
  const link = current
  if (link === undefined || !started) return
  const quiet = setTimeout(() => link.close(), SILENT)
  void window.geckit.settings
    .get()
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
