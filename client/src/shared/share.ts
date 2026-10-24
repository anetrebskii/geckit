/**
 * A localhost site, a file or a folder on this computer, shared by a link that
 * opens in any browser. The link carries a key of its own after the #: the
 * page meets the computer in the room of that key, as the phone does in the
 * room of its pairing key, and the computer answers it for that one target.
 */

// The page a link opens, on Firebase Hosting in the same project as the rooms.
export const VIEWER = 'https://geckit-signal.web.app'

// When it ends goes after the key, so a page opened late says so at once instead of waiting for a computer that no longer listens.
export const shareLink = (key: string, expiresAt: number): string => `${VIEWER}/#${key}.${expiresAt.toString(36)}`

/** The key and, for links made since they carried it, when the link ends. */
export function readShareLink(hash: string): { readonly key: string; readonly expiresAt?: number } | undefined {
  const found = /^#([A-Za-z0-9_-]{32,})(?:\.([0-9a-z]+))?$/.exec(hash)
  if (found?.[1] === undefined) return undefined
  return found[2] === undefined ? { key: found[1] } : { key: found[1], expiresAt: parseInt(found[2], 36) }
}

export interface ShareAbout {
  readonly kind: 'site' | 'file' | 'folder'
  readonly title: string
  readonly expiresAt: number
  /** Where a site starts, as a path on its port. */
  readonly start?: string
}

/** What a file or folder link answers for a path inside it. */
export type ShareRead =
  | { readonly kind: 'folder'; readonly path: string; readonly inside: readonly { readonly name: string; readonly folder: boolean; readonly size?: number }[] }
  | { readonly kind: 'file'; readonly path: string; readonly name: string; readonly media: string; readonly size: number; readonly data: string }
  | { readonly kind: 'none'; readonly why: string }

/** A live link, as Settings and /links list it. */
export interface SharedLink {
  readonly id: string
  readonly title: string
  readonly expiresAt: number
}

/** The error the page is sent for a link that has ended, so it can say so rather than show it. */
export const ENDED = 'geckit-link-ended'

const LOCALHOST = /\bhttp:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d{2,5}(?:\/[^\s`'"<>)\]]*)?/g
const PATH = /(?:^|[\s(`'"*])((?:~|\/(?:Users|home|tmp|private|Volumes|var|opt|srv|mnt))\/[^\s`'"<>)\]*]+)/g
// A message naming more than this is a listing, not a result; the rest stay plain text.
const MOST = 8

/** Where a message names something, and how much of it to replace: a code span goes with its backticks, since a link cannot live inside code. */
export interface ShareMention {
  readonly at: number
  readonly length: number
  readonly target: string
}

/** The lines of fenced code in a message, which are code and never a link. */
function fenced(text: string): (readonly [number, number])[] {
  const out: (readonly [number, number])[] = []
  let open: { readonly at: number; readonly marker: string } | undefined
  let at = 0
  for (const line of text.split('\n')) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (marker !== undefined) {
      if (open === undefined) open = { at, marker }
      else if (marker[0] === open.marker[0] && marker.length >= open.marker.length) { out.push([open.at, at + line.length]); open = undefined }
    }
    at += line.length + 1
  }
  if (open !== undefined) out.push([open.at, text.length])
  return out
}

/** Every place a message names a localhost address or a shareable path, in order, outside fenced code. */
export function shareMentions(text: string): ShareMention[] {
  const code = fenced(text)
  const found: ShareMention[] = []
  const add = (at: number, raw: string): void => {
    const target = trimmed(raw)
    if (code.some(([from, to]) => at >= from && at < to)) return
    const span = text[at - 1] === '`' && text[at + target.length] === '`'
    found.push({ at: span ? at - 1 : at, length: span ? target.length + 2 : target.length, target })
  }
  for (const match of text.matchAll(LOCALHOST)) add(match.index, match[0])
  const urls = found.map((one) => [one.at, one.at + one.length] as const)
  for (const match of text.matchAll(PATH)) {
    const path = match[1] ?? ''
    const at = match.index + match[0].length - path.length
    if (urls.some(([from, to]) => at >= from && at < to)) continue
    add(at, path)
  }
  const named = new Set<string>()
  const kept: ShareMention[] = []
  for (const one of found.sort((left, right) => left.at - right.at)) {
    if (!named.has(one.target) && named.size >= MOST) continue
    named.add(one.target)
    kept.push(one)
  }
  return kept
}

/** The localhost addresses and absolute paths a message names, in order, each once; relative paths are left out. */
export function shareTargets(text: string): string[] {
  return [...new Set(shareMentions(text).map((one) => one.target))]
}

const trimmed = (text: string): string => text.replace(/[.,;:!?]+$/, '')

export const isSite = (target: string): boolean => /^http:\/\//.test(target)

/** What a button and a message call it: the port for a site, the last name for a file, with a slash for a folder. */
export function targetTitle(target: string, folder = false): string {
  if (isSite(target)) return new URL(target).host
  const name = target.replace(/\/+$/, '').split('/').at(-1) ?? target
  return folder ? `${name}/` : name
}

/** "7 h", "40 min", for a link that ends at `at`. */
export function endsIn(at: number, now: number): string {
  const minutes = Math.max(1, Math.ceil((at - now) / 60_000))
  return minutes >= 60 ? `${String(Math.round(minutes / 60))} h` : `${String(minutes)} min`
}
