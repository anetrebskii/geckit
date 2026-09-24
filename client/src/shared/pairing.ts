/**
 * What the phone and the Mac share once the QR code is scanned, and how they
 * use it to find each other through the signaling function on weroost.
 *
 * The key never leaves the two of them: the room they meet in is a hash of it,
 * and what they leave in the room is sealed with it, so weroost sees neither
 * the offer nor the addresses in it. Plain WebCrypto, so it runs in a window
 * on the Mac, in the app on the phone, and in the tests.
 */

export const SIGNAL = 'https://geckit--signal.weroostapp.ru'

export interface Pairing {
  readonly key: string
  readonly signal: string
}

export const pairingLink = (pairing: Pairing): string =>
  `geckit://pair?k=${pairing.key}&s=${encodeURIComponent(pairing.signal)}`

export function readPairing(text: string): Pairing | undefined {
  if (!text.startsWith('geckit://pair?')) return undefined
  const asked = new URLSearchParams(text.slice('geckit://pair?'.length))
  const key = asked.get('k') ?? ''
  const signal = asked.get('s') ?? ''
  if (!/^[A-Za-z0-9_-]{32,}$/.test(key) || !/^https:\/\/[^\s]+$/.test(signal)) return undefined
  return { key, signal }
}

const bytes = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text)

const hex = (buffer: ArrayBuffer): string => [...new Uint8Array(buffer)].map((one) => one.toString(16).padStart(2, '0')).join('')

const base64url = (data: Uint8Array): string =>
  btoa(String.fromCharCode(...data))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')

const unbase64url = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (one) => one.charCodeAt(0))

export const newKey = (): string => base64url(crypto.getRandomValues(new Uint8Array(32)))

export async function roomOf(key: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', bytes(`geckit room ${key}`)))
}

async function sealing(key: string): ReturnType<typeof crypto.subtle.importKey> {
  const raw = await crypto.subtle.digest('SHA-256', bytes(`geckit seal ${key}`))
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export async function seal(key: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealing(key), bytes(JSON.stringify(value))))
  const box = new Uint8Array(iv.length + sealed.length)
  box.set(iv)
  box.set(sealed, iv.length)
  return base64url(box)
}

/** Nothing when it was sealed with another key or changed on the way. */
export async function unseal<T>(key: string, box: string): Promise<T | undefined> {
  try {
    const data = unbase64url(box)
    const opened = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.slice(0, 12) }, await sealing(key), data.slice(12))
    return JSON.parse(new TextDecoder().decode(opened)) as T
  } catch {
    return undefined
  }
}

/** What one side leaves in the room: its half of the connection, and when, so an old one is not taken for new. */
export interface Signed {
  readonly sdp: string
  readonly at: number
}

/* ------------------------------------------------------------------ */
/* What goes over the link once it is up                               */
/* ------------------------------------------------------------------ */

export type LinkMessage =
  | { readonly t: 'call'; readonly id: number; readonly name: string; readonly args: readonly unknown[] }
  | { readonly t: 'reply'; readonly id: number; readonly value?: unknown; readonly error?: string }
  | { readonly t: 'tell'; readonly channel: string; readonly value: unknown }

/** A data channel carries messages of a few hundred kilobytes at most, and a pasted photo is megabytes, so every message goes in pieces. */
export const FRAME = 16_000

interface Frame {
  readonly m: number
  readonly i: number
  readonly n: number
  readonly d: string
}

export function framesOf(message: LinkMessage, m: number): string[] {
  const text = JSON.stringify(message)
  const n = Math.max(1, Math.ceil(text.length / FRAME))
  return Array.from({ length: n }, (_one, i) => JSON.stringify({ m, i, n, d: text.slice(i * FRAME, (i + 1) * FRAME) }))
}

/** Puts the pieces back together; a message comes out once its last piece is in. */
export function assembler(): (frame: string) => LinkMessage | undefined {
  const held = new Map<number, string[]>()
  return (raw) => {
    const frame = JSON.parse(raw) as Frame
    const parts = held.get(frame.m) ?? []
    parts[frame.i] = frame.d
    if (parts.filter((one) => one !== undefined).length < frame.n) {
      held.set(frame.m, parts)
      return undefined
    }
    held.delete(frame.m)
    return JSON.parse(parts.join('')) as LinkMessage
  }
}
