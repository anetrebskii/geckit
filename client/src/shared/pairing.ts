import type { SessionItem } from './api'

/**
 * What the phone and the Mac share once the QR code is scanned, and how they
 * use it to find each other through Firestore.
 *
 * The key never leaves the two of them: the room they meet in is a hash of it,
 * and what they leave in the room is sealed with it, so Firestore sees neither
 * the offer nor the addresses in it. Plain WebCrypto, so it runs in a window
 * on the Mac, in the app on the phone, and in the tests.
 */

// Where the relay's keys are asked for; the rooms themselves are in Firestore.
export const SIGNAL = 'https://europe-west1-geckit-signal.cloudfunctions.net'

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

/** What the phone is sent of a conversation: `count` lines before `before`, or its end, and how many are left before them. */
export interface Piece {
  readonly items: SessionItem[]
  readonly left: number
}

export function pieceOf(all: readonly SessionItem[], before: string | undefined, count: number): Piece {
  const found = before === undefined ? all.length : all.findIndex((item) => item.id === before)
  if (found === -1) return { items: [], left: 0 }
  const start = Math.max(0, found - count)
  return { items: all.slice(start, found), left: start }
}

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

/* ------------------------------------------------------------------ */
/* Compressed, once both sides have said they can read it             */
/* ------------------------------------------------------------------ */

/** What is shorter than this goes as text: compressing it saves nothing worth the time. */
export const SQUEEZE_FROM = 512
// Four bytes of message, two of piece, two of how many pieces.
const HEAD = 8

async function through(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer())
}

/** A message deflated and cut into binary pieces, each headed with which message, which piece and of how many. */
export async function packed(message: LinkMessage, m: number): Promise<ArrayBuffer[]> {
  const body = await through(new TextEncoder().encode(JSON.stringify(message)), new CompressionStream('deflate-raw'))
  const n = Math.max(1, Math.ceil(body.length / FRAME))
  return Array.from({ length: n }, (_one, i) => {
    const part = body.subarray(i * FRAME, (i + 1) * FRAME)
    const frame = new Uint8Array(HEAD + part.length)
    const head = new DataView(frame.buffer)
    head.setUint32(0, m)
    head.setUint16(4, i)
    head.setUint16(6, n)
    frame.set(part, HEAD)
    return frame.buffer
  })
}

/** Puts binary pieces back together and inflates them; a message comes out once its last piece is in. */
export function unpacker(): (frame: ArrayBuffer) => Promise<LinkMessage | undefined> {
  const held = new Map<number, Uint8Array<ArrayBuffer>[]>()
  return async (raw) => {
    const head = new DataView(raw)
    const m = head.getUint32(0)
    const i = head.getUint16(4)
    const n = head.getUint16(6)
    const parts = held.get(m) ?? []
    parts[i] = new Uint8Array(raw, HEAD)
    if (parts.filter((one) => one !== undefined).length < n) {
      held.set(m, parts)
      return undefined
    }
    held.delete(m)
    const body = new Uint8Array(parts.reduce((all, one) => all + one.length, 0))
    let at = 0
    for (const one of parts) {
      body.set(one, at)
      at += one.length
    }
    return JSON.parse(new TextDecoder().decode(await through(body, new DecompressionStream('deflate-raw')))) as LinkMessage
  }
}
