import { randomBytes } from 'node:crypto'
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { createConnection } from 'node:net'
import { homedir } from 'node:os'
import { basename, extname, join, resolve, sep } from 'node:path'

import type { LocalAnswer, LocalAsk } from '../shared/local'
import { newKey } from '../shared/pairing'
import { ENDED, isSite, targetTitle } from '../shared/share'
import type { ShareAbout, SharedLink, ShareRead } from '../shared/share'
import { withinPage } from './file-shown'
import { localFetch } from './local-page'

export const LIFETIME = 12 * 3600_000
export const MOST_LINKS = 20
// What one answer may carry over the link, as for the phone's localhost pages.
const MOST_BYTES = 32 * 1024 * 1024

const MEDIA: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.log': 'text/plain',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.ts': 'text/plain',
  '.tsx': 'text/plain',
  '.py': 'text/plain',
  '.yml': 'text/plain',
  '.yaml': 'text/plain',
  '.xml': 'text/xml',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
}

// Keys and the stores that hold them, refused by name wherever they are.
const SECRET = /^id_(rsa|dsa|ecdsa|ed25519)|\.(pem|key|p12|p8|pfx|keychain|keychain-db|kdbx|gpg|asc|ovpn)$|^(credentials|secrets?)(\.[a-z]+)?$/i

interface Share {
  readonly id: string
  readonly key: string
  readonly kind: ShareAbout['kind']
  /** The origin of a site, or the real path of a file or folder. */
  readonly target: string
  readonly title: string
  readonly start?: string
  readonly expiresAt: number
  readonly timer: ReturnType<typeof setTimeout>
}

export interface Opened {
  readonly id: string
  readonly key: string
  readonly title: string
  readonly expiresAt: number
  /** It was live already, and the same link is handed back. */
  readonly again: boolean
}

export interface SharesOptions {
  readonly changed: () => void
  readonly ended?: (id: string) => void
  readonly now?: () => number
  readonly home?: string
}

/** What may be shared: a localhost port, or a file or folder that is not hidden, a key, the home folder or above it, or in ~/Library. */
export class Shares {
  private readonly live = new Map<string, Share>()
  private readonly now: () => number
  private readonly home: string

  constructor(private readonly options: SharesOptions) {
    this.now = options.now ?? Date.now
    this.home = resolve(options.home ?? homedir())
  }

  list(): SharedLink[] {
    return [...this.live.values()].map((share) => ({ id: share.id, title: share.title, expiresAt: share.expiresAt }))
  }

  /** The rooms the link page is answered in. */
  rooms(): { readonly id: string; readonly key: string }[] {
    return [...this.live.values()].map((share) => ({ id: share.id, key: share.key }))
  }

  async open(target: string): Promise<Opened | { readonly why: string }> {
    if (isSite(target)) {
      const site = siteOf(target)
      if (site === undefined) return { why: 'Only an address on this computer can be shared.' }
      const held = [...this.live.values()].find((one) => one.kind === 'site' && one.target === site.origin)
      if (held !== undefined) return opened(held, true)
      if (!(await answers(site.host, site.port))) return { why: `Nothing answers at ${site.host}:${String(site.port)} on your computer. Start it there, then ask Manager again.` }
      return this.add('site', site.origin, new URL(site.origin).host, site.start)
    }
    const real = await this.real(target)
    if (real === undefined) return { why: `${targetTitle(target)} is no longer on your computer.` }
    if (!this.allowed(real)) return { why: 'GeckIt does not share hidden files, keys or your whole home folder. Ask Manager for the project folder or the single file instead.' }
    const held = [...this.live.values()].find((one) => one.kind !== 'site' && one.target === real)
    if (held !== undefined) return opened(held, true)
    const folder = (await stat(real)).isDirectory()
    return this.add(folder ? 'folder' : 'file', real, targetTitle(real, folder))
  }

  stop(id: string): SharedLink | undefined {
    const share = this.live.get(id)
    if (share === undefined) return undefined
    clearTimeout(share.timer)
    this.live.delete(id)
    this.options.ended?.(id)
    this.options.changed()
    return { id, title: share.title, expiresAt: share.expiresAt }
  }

  stopAll(): void {
    if (this.live.size === 0) return
    for (const share of this.live.values()) {
      clearTimeout(share.timer)
      this.options.ended?.(share.id)
    }
    this.live.clear()
    this.options.changed()
  }

  about(id: string): ShareAbout {
    const share = this.held(id)
    return { kind: share.kind, title: share.title, expiresAt: share.expiresAt, ...(share.start === undefined ? {} : { start: share.start }) }
  }

  /** A request from the link page of a site, asked of that site's own origin and nothing else. */
  async fetch(id: string, asked: LocalAsk): Promise<LocalAnswer> {
    const share = this.held(id)
    if (share.kind !== 'site' || !asked.url.startsWith('/')) throw new Error('Only the shared address opens here.')
    const headers = asked.headers.flatMap(([name, value]): [string, string][] => {
      const lower = name.toLowerCase()
      if (lower === 'origin') return [[lower, share.target]]
      if (lower === 'referer') return URL.canParse(value) ? [[lower, `${share.target}${new URL(value).pathname}`]] : []
      return [[name, value]]
    })
    return localFetch({ ...asked, url: `${share.target}${asked.url}`, headers }, share.target)
  }

  /** A file of a file link, or a path inside a folder link: the folder's list, or the file. */
  async read(id: string, path: string): Promise<ShareRead> {
    const share = this.held(id)
    if (share.kind === 'site') throw new Error('Only the shared address opens here.')
    const clean = path.replace(/^\/+|\/+$/g, '')
    if (share.kind === 'file' && clean !== '') return { kind: 'none', why: 'Only the shared file opens here.' }
    if (clean.includes('\0') || clean.split('/').some((part) => part === '..' || part.startsWith('.'))) return { kind: 'none', why: 'That is not inside the shared folder.' }
    const asked = share.kind === 'file' ? share.target : resolve(share.target, clean)
    const real = await realpath(asked).catch(() => undefined)
    if (real === undefined) return { kind: 'none', why: `${basename(asked)} is no longer on your computer.` }
    if (!this.inside(share, real) || !this.allowed(real)) return { kind: 'none', why: 'That is not inside the shared folder.' }
    const found = await stat(real)
    if (found.isDirectory()) {
      const entries = await readdir(real, { withFileTypes: true })
      const inside = await Promise.all(entries.filter((one) => !one.name.startsWith('.') && !SECRET.test(one.name)).map(async (one) => {
        const there = await stat(join(real, one.name)).catch(() => undefined)
        return there === undefined ? undefined : { name: one.name, folder: there.isDirectory(), ...(there.isDirectory() ? {} : { size: there.size }) }
      }))
      const listed = inside.filter((one) => one !== undefined).sort((a, b) => Number(b.folder) - Number(a.folder) || a.name.localeCompare(b.name))
      return { kind: 'folder', path: clean, inside: listed }
    }
    const name = basename(real)
    if (found.size > MOST_BYTES) return { kind: 'none', why: `${name} is larger than 32 MB, too big to send over this link.` }
    const media = MEDIA[extname(name).toLowerCase()] ?? 'application/octet-stream'
    let bytes = await readFile(real)
    if (media === 'text/html') {
      const folder = resolve(real, '..')
      const html = await withinPage(bytes.toString('utf8'), folder, async (file) => {
        const there = await realpath(file).catch(() => undefined)
        return there !== undefined && there.startsWith(`${share.kind === 'file' ? folder : share.target}${sep}`) && this.allowed(there)
      })
      bytes = Buffer.from(html)
    }
    return { kind: 'file', path: clean, name, media, size: bytes.length, data: bytes.toString('base64') }
  }

  private held(id: string): Share {
    const share = this.live.get(id)
    if (share === undefined || share.expiresAt <= this.now()) throw new Error(ENDED)
    return share
  }

  private add(kind: Share['kind'], target: string, title: string, start?: string): Opened {
    // Every message that names something makes a link, so the twenty-first ends the oldest rather than being refused.
    for (const old of [...this.live.keys()].slice(0, Math.max(0, this.live.size - MOST_LINKS + 1))) this.stop(old)
    const id = randomBytes(9).toString('base64url')
    const timer = setTimeout(() => this.stop(id), LIFETIME)
    timer.unref()
    const share: Share = { id, key: newKey(), kind, target, title, expiresAt: this.now() + LIFETIME, timer, ...(start === undefined ? {} : { start }) }
    this.live.set(id, share)
    this.options.changed()
    return opened(share, false)
  }

  private async real(target: string): Promise<string | undefined> {
    const path = target === '~' || target.startsWith('~/') ? join(this.home, target.slice(2)) : target
    if (!path.startsWith('/')) return undefined
    return realpath(path).catch(() => undefined)
  }

  /** Not the disk or the home folder, nor anything holding it; nothing hidden on the way; no key; nothing in ~/Library. */
  private allowed(real: string): boolean {
    const home = this.home
    if (real === '/' || real === home || home.startsWith(`${real}${sep}`)) return false
    if (real === join(home, 'Library') || real.startsWith(`${join(home, 'Library')}${sep}`)) return false
    const parts = real.split(sep).filter((part) => part !== '')
    return !parts.some((part) => part.startsWith('.')) && !SECRET.test(parts.at(-1) ?? '')
  }

  private inside(share: Share, real: string): boolean {
    return share.kind === 'file' ? real === share.target : real === share.target || real.startsWith(`${share.target}${sep}`)
  }
}

const opened = (share: Share, again: boolean): Opened => ({ id: share.id, key: share.key, title: share.title, expiresAt: share.expiresAt, again })

function siteOf(target: string): { readonly origin: string; readonly host: string; readonly port: number; readonly start: string } | undefined {
  if (!URL.canParse(target)) return undefined
  const at = new URL(target)
  const port = Number(at.port)
  if (at.protocol !== 'http:' || !['localhost', '127.0.0.1', '0.0.0.0', '[::1]'].includes(at.hostname) || !Number.isInteger(port) || port <= 0) return undefined
  return { origin: at.origin, host: at.hostname, port, start: `${at.pathname}${at.search}` }
}

/** Whether something listens on the port, asked the way the page's requests will be. */
function answers(host: string, port: number): Promise<boolean> {
  const name = host === '[::1]' ? '::1' : host === '0.0.0.0' ? 'localhost' : host
  return new Promise((done) => {
    const socket = createConnection({ host: name, port })
    const end = (yes: boolean): void => {
      socket.destroy()
      done(yes)
    }
    socket.setTimeout(2000, () => end(false))
    socket.once('connect', () => end(true))
    socket.once('error', () => end(false))
  })
}
