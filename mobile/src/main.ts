import { App } from '@capacitor/app'
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner'

import '../../client/src/renderer/src/styles.css'
import './pair.css'
import { dial } from '../../client/src/renderer/src/link'
import type { Link } from '../../client/src/renderer/src/link'
import { installGeckit, showDropped } from '../../client/src/renderer/src/phone'
import type { Boot } from '../../client/src/renderer/src/phone'
import { readPairing } from '../../client/src/shared/pairing'
import type { Pairing } from '../../client/src/shared/pairing'

const KEPT = 'pairing'
// A drop from switching networks mends in seconds; a Mac that is asleep should not be asked every second.
const AGAIN = [0, 2000, 5000, 10_000, 30_000]

const kept = (): Pairing | undefined => readPairing(localStorage.getItem(KEPT) ?? '')

function screen(parts: readonly (HTMLElement | string)[]): void {
  document.querySelector('.pair')?.remove()
  const shown = document.createElement('main')
  shown.className = 'pair'
  shown.append(...parts)
  document.body.append(shown)
}

function line(text: string, className = ''): HTMLElement {
  const said = document.createElement('p')
  said.className = className
  said.textContent = text
  return said
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
  screen([
    line('GeckIt', 'pair-name'),
    line("Scan the code in GeckIt's Settings on your Mac."),
    ...(wrong ? [line('That is not a GeckIt code.', 'phone-error')] : []),
    button('Scan', 'primary', () => void scan()),
  ])
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
  screen([line('Connecting to the Mac', 'pair-wait')])
  let link: Link
  let boot: Boot
  try {
    link = await dial(pairing)
    boot = await bootOf(link)
  } catch {
    screen([
      line('The Mac did not answer. GeckIt has to be open there, with Phone turned on in Settings.'),
      button('Try again', 'primary', () => void connect()),
      button('Scan again', 'quiet', () => void scan()),
    ])
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
