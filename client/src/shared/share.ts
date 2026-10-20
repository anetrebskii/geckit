/**
 * A localhost site, a file or a folder on this computer, shared by a link that
 * opens in any browser. The link carries a key of its own after the #: the
 * page meets the computer in the room of that key, as the phone does in the
 * room of its pairing key, and the computer answers it for that one target.
 */

// The page a link opens, on Firebase Hosting in the same project as the rooms.
export const VIEWER = 'https://geckit-signal.web.app'

export const shareLink = (key: string): string => `${VIEWER}/#${key}`

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
const MOST = 3

/** The localhost addresses and absolute paths a message names, in order, each once; relative paths are left out. */
export function shareTargets(text: string): string[] {
  const found: { readonly at: number; readonly target: string }[] = []
  for (const match of text.matchAll(LOCALHOST)) found.push({ at: match.index, target: trimmed(match[0]) })
  const urls = found.map((one) => [one.at, one.at + one.target.length] as const)
  for (const match of text.matchAll(PATH)) {
    const path = match[1] ?? ''
    const at = match.index + match[0].length - path.length
    if (urls.some(([from, to]) => at >= from && at < to)) continue
    found.push({ at, target: trimmed(path) })
  }
  return [...new Set(found.sort((a, b) => a.at - b.at).map((one) => one.target))].slice(0, MOST)
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
