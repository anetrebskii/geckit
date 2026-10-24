import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it, vi } from 'vitest'

import { LIFETIME, MOST_LINKS, Shares } from '../src/main/shares'
import type { Opened } from '../src/main/shares'
import { ENDED, endsIn, readShareLink, shareLink, shareTargets } from '../src/shared/share'

const home = realpathSync(mkdtempSync(join(tmpdir(), 'geckit-shares-')))
const project = join(home, 'Projects', 'app')
mkdirSync(join(project, 'docs', 'deep'), { recursive: true })
mkdirSync(join(project, '.git'))
mkdirSync(join(home, '.ssh'))
mkdirSync(join(home, 'Library', 'Keychains'), { recursive: true })
writeFileSync(join(project, 'report.html'), '<link rel="stylesheet" href="look.css"><img src="../secret.png"><p>Report</p>')
writeFileSync(join(project, 'look.css'), 'p { color: red }')
writeFileSync(join(home, 'Projects', 'secret.png'), 'not for the page')
writeFileSync(join(project, 'notes.md'), '# Notes')
writeFileSync(join(project, '.env'), 'TOKEN=1')
writeFileSync(join(project, 'server.pem'), 'key')
writeFileSync(join(project, 'docs', 'deep', 'a.txt'), 'deep')
writeFileSync(join(home, '.ssh', 'id_ed25519'), 'key')
writeFileSync(join(home, 'Library', 'Keychains', 'login.keychain-db'), 'key')
writeFileSync(join(home, 'outside.txt'), 'outside the folder')
symlinkSync(join(home, 'outside.txt'), join(project, 'docs', 'escape.txt'))

const seen: { url: string | undefined; origin: string | undefined }[] = []
const server = createServer((request, answer) => {
  seen.push({ url: request.url, origin: request.headers.origin })
  if (request.url === '/go') {
    answer.writeHead(302, { location: '/home' })
    answer.end()
  } else if (request.url === '/away') {
    answer.writeHead(302, { location: 'http://127.0.0.1:1/' })
    answer.end()
  } else {
    answer.writeHead(200, { 'content-type': 'text/plain' })
    answer.end(`page ${request.url ?? ''}`)
  }
})
await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
const port = (server.address() as AddressInfo).port
const site = `http://127.0.0.1:${String(port)}`

afterAll(() => {
  server.close()
  rmSync(home, { recursive: true, force: true })
})

const made = (changed = vi.fn(), ended = vi.fn()): { readonly shares: Shares; readonly changed: typeof changed; readonly ended: typeof ended } => ({ shares: new Shares({ home, changed, ended }), changed, ended })
const live = (opened: Opened | { readonly why: string }): Opened => {
  if ('why' in opened) throw new Error(opened.why)
  return opened
}
const text = (base64: string): string => Buffer.from(base64, 'base64').toString()

describe('what a message names that could be shared', () => {
  it('finds localhost addresses and absolute paths, each once, and leaves relative paths and the web alone', () => {
    expect(shareTargets('Running at http://localhost:5173/app. Report: `/Users/alex/app/report.html`, notes in ~/notes/today.md and src/x.ts, see https://example.com/a')).toEqual([
      'http://localhost:5173/app',
      '/Users/alex/app/report.html',
      '~/notes/today.md',
    ])
    expect(shareTargets('http://localhost:3000 and http://localhost:3000')).toEqual(['http://localhost:3000'])
    expect(shareTargets('a /Users/a/1 b /Users/a/2 c /Users/a/3 d /Users/a/4')).toHaveLength(4)
    expect(shareTargets([...Array(12).keys()].map((at) => `/Users/a/${String(at)}`).join(' '))).toHaveLength(8)
    expect(shareTargets('**/Users/alex/app/report.html**')).toEqual(['/Users/alex/app/report.html'])
  })

  it('puts the key after the #, which a browser never sends to the server', () => {
    const key = 'a'.repeat(43)
    expect(shareLink(key, 1_800_000_000_000)).toBe(`https://geckit-signal.web.app/#${key}.${(1_800_000_000_000).toString(36)}`)
    expect(readShareLink(new URL(shareLink(key, 1_800_000_000_000)).hash)).toEqual({ key, expiresAt: 1_800_000_000_000 })
    expect(readShareLink(`#${key}`)).toEqual({ key })
    expect(readShareLink('#short')).toBeUndefined()
    expect(endsIn(LIFETIME, 0)).toBe('12 h')
    expect(endsIn(10 * 60_000, 0)).toBe('10 min')
  })
})

describe('a link to a file or folder', () => {
  it('shares only what is there and may be shared', async () => {
    const { shares } = made()
    expect('why' in await shares.open(join(project, 'report.html'))).toBe(false)
    expect('why' in await shares.open(project)).toBe(false)
    expect('why' in await shares.open(join(project, 'gone.html'))).toBe(true)
    for (const refused of [home, join(home, 'Projects', '..'), '/', join(project, '.env'), join(project, '.git'), join(project, 'server.pem'), join(home, '.ssh', 'id_ed25519'), join(home, 'Library', 'Keychains', 'login.keychain-db'), join(home, 'Library')]) {
      expect('why' in await shares.open(refused), refused).toBe(true)
    }
    expect(shares.list()).toHaveLength(2)
  })

  it('refuses a private target when pressed, with the reason', async () => {
    const { shares } = made()
    expect(await shares.open(home)).toEqual({ why: 'GeckIt does not share hidden files, keys or your whole home folder. Ask Manager for the project folder or the single file instead.' })
    expect(await shares.open(join(project, 'gone.html'))).toEqual({ why: 'gone.html is no longer on your computer.' })
    expect(shares.list()).toEqual([])
  })

  it('shares one file, and nothing beside it', async () => {
    const { shares } = made()
    const opened = live(await shares.open(join(project, 'notes.md')))
    expect(opened.title).toBe('notes.md')
    const read = await shares.read(opened.id, '')
    expect(read).toMatchObject({ kind: 'file', name: 'notes.md', media: 'text/markdown' })
    expect(read.kind === 'file' ? text(read.data) : '').toBe('# Notes')
    expect(await shares.read(opened.id, 'report.html')).toEqual({ kind: 'none', why: 'Only the shared file opens here.' })
    await expect(shares.fetch(opened.id, { url: '/', method: 'GET', headers: [], body: '' })).rejects.toThrow('Only the shared address')
  })

  it('puts a page’s own styles inside it, and nothing from outside its folder', async () => {
    const { shares } = made()
    const opened = live(await shares.open(join(project, 'report.html')))
    const read = await shares.read(opened.id, '')
    const html = read.kind === 'file' ? text(read.data) : ''
    expect(html).toContain(`href="data:text/css;base64,${Buffer.from('p { color: red }').toString('base64')}"`)
    expect(html).toContain('src="../secret.png"')
  })

  it('lists a folder without its hidden files and keys, and refuses climbing out of it', async () => {
    const { shares } = made()
    const opened = live(await shares.open(project))
    expect(opened.title).toBe('app/')
    const read = await shares.read(opened.id, '')
    expect(read.kind === 'folder' ? read.inside.map((one) => one.name) : []).toEqual(['docs', 'look.css', 'notes.md', 'report.html'])
    expect(await shares.read(opened.id, 'docs/deep/a.txt')).toMatchObject({ kind: 'file', path: 'docs/deep/a.txt' })
    for (const out of ['..', '../secret.png', 'docs/../../secret.png', '.env', '.git/config', 'server.pem', 'docs/escape.txt', `x\0y`]) {
      const refused = await shares.read(opened.id, out)
      expect(refused.kind, out).toBe('none')
    }
  })

  it('hands back the same link when pressed again', async () => {
    const { shares } = made()
    const first = live(await shares.open(join(project, 'notes.md')))
    const again = live(await shares.open(join(project, 'notes.md')))
    expect(again).toMatchObject({ id: first.id, key: first.key, again: true })
    expect(first.key).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })
})

describe('a link to a localhost site', () => {
  it('refuses a port nothing answers on', async () => {
    const { shares } = made()
    expect(await shares.open('http://127.0.0.1:1/')).toEqual({ why: 'Nothing answers at 127.0.0.1:1 on your computer. Start it there, then ask Manager again.' })
  })

  it('asks only its own origin, with the origin the server knows, and follows redirects within it', async () => {
    const { shares } = made()
    const opened = live(await shares.open(`${site}/app?x=1`))
    expect(opened.title).toBe(`127.0.0.1:${String(port)}`)
    expect(shares.about(opened.id)).toMatchObject({ kind: 'site', start: '/app?x=1' })
    const got = await shares.fetch(opened.id, { url: '/api', method: 'GET', headers: [['Origin', 'https://geckit-signal.web.app']], body: '' })
    expect(text(got.body)).toBe('page /api')
    expect(seen.at(-1)).toEqual({ url: '/api', origin: site })
    const moved = await shares.fetch(opened.id, { url: '/go', method: 'GET', headers: [], body: '' })
    expect(moved).toMatchObject({ status: 200, moved: '/home' })
    const away = await shares.fetch(opened.id, { url: '/away', method: 'GET', headers: [], body: '' })
    expect(away.status).toBe(302)
    expect(seen.some((one) => one.url === '/' && one.origin === undefined)).toBe(false)
    await expect(shares.fetch(opened.id, { url: 'http://127.0.0.1:1/', method: 'GET', headers: [], body: '' })).rejects.toThrow('Only the shared address')
    await shares.fetch(opened.id, { url: '//evil.example/', method: 'GET', headers: [], body: '' })
    expect(seen.at(-1)?.url).toBe('//evil.example/')
    await expect(shares.read(opened.id, '')).rejects.toThrow('Only the shared address')
  })
})

describe('how a link ends', () => {
  it('ends on Stop, says it has ended after, and tells who carried it', async () => {
    const { shares, ended } = made()
    const opened = live(await shares.open(join(project, 'notes.md')))
    expect(shares.rooms()).toEqual([{ id: opened.id, key: opened.key }])
    expect(shares.stop(opened.id)?.title).toBe('notes.md')
    expect(ended).toHaveBeenCalledWith(opened.id)
    expect(shares.rooms()).toEqual([])
    expect(() => shares.about(opened.id)).toThrow(ENDED)
    await expect(shares.read(opened.id, '')).rejects.toThrow(ENDED)
    expect(shares.stop(opened.id)).toBeUndefined()
  })

  it('ends by itself after 12 hours', async () => {
    vi.useFakeTimers()
    try {
      const { shares, ended } = made()
      const opened = live(await shares.open(join(project, 'notes.md')))
      vi.advanceTimersByTime(LIFETIME - 1)
      expect(shares.list()).toHaveLength(1)
      vi.advanceTimersByTime(1)
      expect(shares.list()).toEqual([])
      expect(ended).toHaveBeenCalledWith(opened.id)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps no more than twenty live, ending the oldest for a new one, and ends them all at once', async () => {
    const { shares, ended } = made()
    let oldest: Opened | undefined
    for (let at = 0; at < MOST_LINKS; at++) {
      const file = join(project, 'docs', `f${String(at)}.txt`)
      writeFileSync(file, String(at))
      const one = live(await shares.open(file))
      oldest ??= one
    }
    writeFileSync(join(project, 'docs', 'one-more.txt'), 'x')
    const extra = live(await shares.open(join(project, 'docs', 'one-more.txt')))
    expect(shares.list()).toHaveLength(MOST_LINKS)
    expect(shares.list().map((one) => one.id)).not.toContain(oldest?.id)
    expect(shares.list().map((one) => one.id)).toContain(extra.id)
    expect(ended).toHaveBeenCalledWith(oldest?.id)
    shares.stopAll()
    expect(shares.list()).toEqual([])
    expect(ended).toHaveBeenCalledTimes(MOST_LINKS + 1)
  })
})
