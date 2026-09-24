import { App } from '@capacitor/app'
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner'
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics'

import '../../client/src/renderer/src/styles.css'
import './pair.css'
import { dial } from '../../client/src/renderer/src/link'
import type { Link } from '../../client/src/renderer/src/link'
import { installGeckit, showDropped } from '../../client/src/renderer/src/phone'
import type { Boot } from '../../client/src/renderer/src/phone'
import type { Tap } from '../../client/src/renderer/src/tap'
import { readPairing } from '../../client/src/shared/pairing'
import type { Pairing } from '../../client/src/shared/pairing'
import icon from './icon.png'

const KEPT = 'pairing'
// A drop from switching networks mends in seconds; a Mac that is asleep should not be asked every second.
const AGAIN = [0, 2000, 5000, 10_000, 30_000]

const kept = (): Pairing | undefined => readPairing(localStorage.getItem(KEPT) ?? '')

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
  localStorage.setItem(KEPT, `geckit://pair?k=${pairing.key}&s=${encodeURIComponent(pairing.signal)}`)
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
  screen([picture('pair-spin', ''), line('Connecting to the Mac', 'pair-wait')])
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
        line('The Mac did not answer.', 'pair-title', 'h2'),
        line('GeckIt has to be open there, with Phone turned on in Settings.'),
      ],
      [button('Try again', 'pair-fill', () => void connect()), button('Scan again', 'pair-plain', () => void scan())],
    )
    return
  }
  document.querySelector('.pair')?.remove()
  started = true
  installGeckit(link, boot)
  link.onClose(() => void mend(pairing))
  await import('../../client/src/renderer/src/chat/main')
}

/** The page stays as it was under the banner until the Mac answers again, and then starts over on the new link. */
async function mend(pairing: Pairing): Promise<void> {
  showDropped()
  for (let tried = 0; ; tried++) {
    await new Promise((done) => setTimeout(done, AGAIN[Math.min(tried, AGAIN.length - 1)]))
    try {
      ;(await dial(pairing)).close()
      location.reload()
      return
    } catch {
      // Not yet.
    }
  }
}

void App.addListener('appUrlOpen', ({ url }) => {
  const pairing = readPairing(url)
  if (pairing !== undefined) paired(pairing)
})

void App.getLaunchUrl().then((launched) => {
  const pairing = launched === undefined ? undefined : readPairing(launched.url)
  if (pairing !== undefined) paired(pairing)
  else void connect()
})
