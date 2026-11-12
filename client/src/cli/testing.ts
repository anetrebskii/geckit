import { spawn } from 'node:child_process'
import { closeSync, createWriteStream, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, watch, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Readable, Writable } from 'node:stream'
import type { TestBrowsersState, ViewFrame, ViewInput } from '../shared/api'
import background from '../../extension/background.js?raw'
import { browserFolder, findIn, profiles, serveAsks, type Reply } from './browser'
import { signInLink } from './live-view'
import { cursorPath, type CursorPoint } from './cursor'
import { acquireTestLock, browserConversation, browserStateFolder, conversationTestName, forgetTestAccount, saveTestAccount, testAccount, TestTabOwners } from './browser-lifecycle'

/** Where test browsers live: Chrome for Testing itself under chrome/, each profile under profiles/<name>/. */
export const testingFolder = (root: string = homedir()): string => join(root, '.geckit', 'chrome-for-testing')
export const profilesFolder = (root?: string): string => join(testingFolder(root), 'profiles')
const chromeFolder = (root?: string): string => join(testingFolder(root), 'chrome')
const downloadFile = (root?: string): string => join(testingFolder(root), 'download.json')
export const testLog = (name: string, root?: string): string => join(testingFolder(root), `${name}.log`)

export const TEST_PREFIX = 'geckit:'
export const TEST_BROWSER = 'geckit'
/** The earlier spelling, test and test:<name>, still accepted wherever a profile is named. */
export const currentProfile = (value: string): string => value === 'test' ? TEST_BROWSER : value.startsWith('test:') ? `${TEST_PREFIX}${value.slice(5)}` : value
export const testName = (label: string): string | undefined => { const current = currentProfile(label); return current.startsWith(TEST_PREFIX) ? current.slice(TEST_PREFIX.length) : undefined }
export const validTestName = (name: string): boolean => /^[a-z0-9][a-z0-9-]{0,39}$/.test(name)

const LIST = 'https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json'

const platformName = (): string | undefined => process.platform === 'darwin' ? (process.arch === 'arm64' ? 'mac-arm64' : 'mac-x64') : process.platform === 'linux' ? 'linux64' : undefined

function binaryIn(folder: string): string | undefined {
  const platform = platformName()
  if (platform === undefined) return undefined
  const path = platform === 'linux64' ? join(folder, 'chrome-linux64', 'chrome') : join(folder, `chrome-${platform}`, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing')
  return existsSync(path) ? path : undefined
}

const newer = (a: string, b: string): number => {
  const [x, y] = [a, b].map((one) => one.split('.').map(Number))
  for (let at = 0; at < 4; at++) if ((x?.[at] ?? 0) !== (y?.[at] ?? 0)) return (y?.[at] ?? 0) - (x?.[at] ?? 0)
  return 0
}

/** The Chrome for Testing to start: one GECKIT_CHROME_FOR_TESTING names, the newest GeckIt downloaded, or the newest in Puppeteer's cache. */
export function testingChrome(root: string = homedir()): { readonly path: string; readonly version: string } | undefined {
  const named = process.env['GECKIT_CHROME_FOR_TESTING']
  if (named !== undefined && existsSync(named)) return { path: named, version: 'named' }
  const versions = (folder: string, strip: RegExp): { path: string; version: string }[] => {
    try {
      return readdirSync(folder).flatMap((one) => {
        const path = binaryIn(join(folder, one))
        const version = one.replace(strip, '')
        return path === undefined || !/^\d+(\.\d+)*$/.test(version) ? [] : [{ path, version }]
      }).sort((a, b) => newer(a.version, b.version))
    } catch { return [] }
  }
  return versions(chromeFolder(root), /^$/)[0] ?? versions(join(root, '.cache', 'puppeteer', 'chrome'), /^[a-z_0-9]+-/)[0]
}

interface Download { readonly pid: number; readonly t: number; readonly received: number; readonly total: number; readonly version: string; readonly error?: string }

const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true } catch { return false } }

function readDownload(root?: string): Download | undefined {
  try { return JSON.parse(readFileSync(downloadFile(root), 'utf8')) as Download } catch { return undefined }
}

/** How far a download running now has come, or why the last one failed. */
export function downloading(root?: string): Download | undefined {
  const now = readDownload(root)
  if (now === undefined) return undefined
  if (now.error !== undefined) return now
  return alive(now.pid) && Date.now() - now.t < 30_000 ? now : undefined
}

function noteDownload(state: Download): void {
  const file = downloadFile()
  writeFileSync(`${file}.part`, JSON.stringify(state))
  renameSync(`${file}.part`, file)
}

const run = (command: string, args: readonly string[]): Promise<void> => new Promise((done, fail) => {
  const child = spawn(command, args, { stdio: 'ignore' })
  child.on('error', fail)
  child.on('exit', (code) => code === 0 ? done() : fail(new Error(`${command} exited with ${code}`)))
})

/** Downloads Chrome for Testing's current Stable once, while a second test browser starting meanwhile waits for it. */
async function fetchChrome(): Promise<{ readonly path: string; readonly version: string }> {
  for (;;) {
    const ready = testingChrome()
    if (ready !== undefined) return ready
    const other = downloading()
    if (other === undefined || other.error !== undefined || other.pid === process.pid) break
    await new Promise((done) => setTimeout(done, 1_000))
  }
  const platform = platformName()
  if (platform === undefined) throw new Error('Chrome for Testing runs on macOS and Linux here.')
  mkdirSync(chromeFolder(), { recursive: true })
  let version = ''
  try {
    const list = await (await fetch(LIST)).json() as { channels: { Stable: { version: string; downloads: { chrome: { platform: string; url: string }[] } } } }
    version = list.channels.Stable.version
    const url = list.channels.Stable.downloads.chrome.find((one) => one.platform === platform)?.url
    if (url === undefined) throw new Error(`no download for ${platform}`)
    const response = await fetch(url)
    if (!response.ok || response.body === null) throw new Error(`the download answered ${response.status}`)
    const total = Number(response.headers.get('content-length') ?? 0)
    const zip = join(chromeFolder(), `${version}.zip`)
    const out = createWriteStream(zip)
    let received = 0
    let said = 0
    noteDownload({ pid: process.pid, t: Date.now(), received, total, version })
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      received += chunk.length
      if (!out.write(chunk)) await new Promise<void>((done) => out.once('drain', () => done()))
      if (Date.now() - said > 500) { said = Date.now(); noteDownload({ pid: process.pid, t: said, received, total, version }) }
    }
    await new Promise<void>((done, fail) => out.end((error?: Error | null) => error ? fail(error) : done()))
    const unpacked = join(chromeFolder(), `${version}.part`)
    rmSync(unpacked, { recursive: true, force: true })
    if (process.platform === 'darwin') await run('ditto', ['-x', '-k', zip, unpacked])
    else await run('unzip', ['-q', zip, '-d', unpacked])
    rmSync(zip, { force: true })
    renameSync(unpacked, join(chromeFolder(), version))
    rmSync(downloadFile(), { force: true })
  } catch (error) {
    noteDownload({ pid: process.pid, t: Date.now(), received: 0, total: 0, version, error: error instanceof Error ? error.message : String(error) })
    throw error
  }
  const ready = testingChrome()
  if (ready === undefined) throw new Error('Chrome for Testing downloaded but its program is not where it should be.')
  return ready
}

const PAGE_FUNCTIONS = ['pageSlow', 'pageOverlay', 'pageBox', 'pageStyle', 'pageText', 'pageRead', 'pageCenter', 'pageClick', 'pageType', 'pageScroll', 'pagePointer'] as const
const MEDIA_FUNCTIONS = ['base64', 'bitmaps', 'contactSheet', 'animation', 'lzw'] as const
const MEDIA_LINES = ['bytesOf', 'LZW_CODES', 'LZW_STAMPS', 'lzwGeneration'] as const

/** A top-level function or one-line declaration of the extension's background.js, so the test browser runs the extension's own page code rather than a copy. */
export function extensionSource(name: string, from: string = background): string {
  const start = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(from)
  if (start !== null) {
    const end = from.indexOf('\n}\n', start.index)
    if (end > 0) return from.slice(start.index, end + 2)
  }
  const line = new RegExp(`^(?:const|let) ${name} = .*$`, 'm').exec(from)
  if (line !== null) return line[0]
  throw new Error(`background.js has no ${name}`)
}

export const pageScript = (): string => `var geckitPage = (() => {\n${PAGE_FUNCTIONS.map((one) => extensionSource(one)).join('\n')}\nreturn { ${PAGE_FUNCTIONS.join(', ')} }\n})()`
const mediaScript = (): string => `var geckitMedia = (() => {\n${[...MEDIA_LINES, ...MEDIA_FUNCTIONS].map((one) => extensionSource(one)).join('\n')}\nreturn { contactSheet, animation }\n})()`

/** The debugging protocol over Chrome's pipe: each message JSON, ended by a zero byte. */
class Cdp {
  private next = 1
  private readonly waiting = new Map<number, { done: (value: Record<string, unknown>) => void; fail: (error: Error) => void }>()
  private readonly listeners = new Set<(message: { method: string; params: Record<string, unknown>; sessionId?: string }) => void>()
  private held = Buffer.alloc(0)
  closed = false

  constructor(private readonly out: Writable, input: Readable) {
    input.on('data', (chunk: Buffer) => {
      this.held = Buffer.concat([this.held, chunk])
      for (let end = this.held.indexOf(0); end >= 0; end = this.held.indexOf(0)) {
        const message = JSON.parse(this.held.subarray(0, end).toString('utf8')) as { id?: number; result?: Record<string, unknown>; error?: { message: string }; method?: string; params?: Record<string, unknown>; sessionId?: string }
        this.held = this.held.subarray(end + 1)
        if (message.id !== undefined) {
          const back = this.waiting.get(message.id)
          this.waiting.delete(message.id)
          if (message.error !== undefined) back?.fail(new Error(message.error.message))
          else back?.done(message.result ?? {})
        } else if (message.method !== undefined) {
          for (const one of this.listeners) one({ method: message.method, params: message.params ?? {}, ...(message.sessionId === undefined ? {} : { sessionId: message.sessionId }) })
        }
      }
    })
    input.on('close', () => {
      this.closed = true
      for (const one of this.waiting.values()) one.fail(new Error('The test browser closed.'))
      this.waiting.clear()
    })
  }

  send<T = Record<string, unknown>>(method: string, params: object = {}, sessionId?: string): Promise<T> {
    if (this.closed) return Promise.reject(new Error('The test browser closed.'))
    const id = this.next++
    return new Promise((done, fail) => {
      this.waiting.set(id, { done: done as (value: Record<string, unknown>) => void, fail })
      this.out.write(`${JSON.stringify({ id, method, params, ...(sessionId === undefined ? {} : { sessionId }) })}\0`)
    })
  }

  on(listen: (message: { method: string; params: Record<string, unknown>; sessionId?: string }) => void): () => void {
    this.listeners.add(listen)
    return () => this.listeners.delete(listen)
  }
}

interface TargetInfo { readonly targetId: string; readonly type: string; readonly title: string; readonly url: string; readonly openerId?: string }
interface Request { readonly conversation?: string; readonly cmd: string; readonly tab?: number; readonly url?: string; readonly ref?: string | null; readonly real?: boolean; readonly text?: string; readonly by?: number; readonly key?: string; readonly code?: string; readonly pointer?: boolean; readonly reset?: boolean; readonly set?: Record<string, unknown>; readonly ms?: number; readonly slow?: number; readonly then?: { readonly cmd: string; readonly ref?: string; readonly key?: string }; readonly query?: string; readonly input?: ViewInput }

const KEYS: Record<string, { code: string; keyCode: number; key?: string; text?: string }> = {
  Enter: { code: 'Enter', keyCode: 13, text: '\r' }, Tab: { code: 'Tab', keyCode: 9 }, Escape: { code: 'Escape', keyCode: 27 },
  Backspace: { code: 'Backspace', keyCode: 8 }, Delete: { code: 'Delete', keyCode: 46 },
  ArrowUp: { code: 'ArrowUp', keyCode: 38 }, ArrowDown: { code: 'ArrowDown', keyCode: 40 }, ArrowLeft: { code: 'ArrowLeft', keyCode: 37 }, ArrowRight: { code: 'ArrowRight', keyCode: 39 },
  PageUp: { code: 'PageUp', keyCode: 33 }, PageDown: { code: 'PageDown', keyCode: 34 }, Home: { code: 'Home', keyCode: 36 }, End: { code: 'End', keyCode: 35 },
  Space: { code: 'Space', keyCode: 32, key: ' ', text: ' ' },
}

const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** On Linux sign-ins are kept with Chrome's own key rather than a keyring a server may not have, and a computer with no screen runs the browser without a window. */
export function chromeFlags(platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): string[] {
  if (platform !== 'linux') return []
  return ['--password-store=basic', ...(env['DISPLAY'] || env['WAYLAND_DISPLAY'] ? [] : ['--headless=new', '--window-size=1280,800'])]
}

export const VIEW_SIZE = { width: 1280, height: 800 } as const

/** One test browser: starts Chrome for Testing on a pipe with the profile, says who it is in the hosts folder and answers the requests addressed to it. */
export async function testBrowser(name: string, folder: string = browserFolder(), root: string = homedir(), initialConversation: string | undefined = process.env['GECKIT_TEST_CONVERSATION']): Promise<void> {
  if (!validTestName(name)) throw new Error(`${name} is not a test profile name: lowercase letters, digits and hyphens.`)
  mkdirSync(folder, { recursive: true })
  const label = `${TEST_PREFIX}${name}`
  if (profiles(folder).some((one) => one.label === label && one.pid !== process.pid && alive(one.pid))) return
  const unlock = acquireTestLock(name, folder)
  if (unlock === undefined) return
  process.once('exit', unlock)
  const owners = new TestTabOwners(name, folder, initialConversation !== undefined)
  if (initialConversation !== undefined) owners.acquire(initialConversation)
  const acquirePending = (): void => {
    for (const file of readdirSync(folder).filter((one) => one.endsWith('.launch'))) {
      try {
        const launch = JSON.parse(readFileSync(join(folder, file), 'utf8')) as { name: string; conversation?: string }
        if (launch.conversation === undefined || conversationTestName(launch.conversation, folder, launch.name) !== name) continue
        owners.acquire(launch.conversation)
        rmSync(join(folder, file), { force: true })
      } catch { continue }
    }
  }
  acquirePending()
  const chrome = testingChrome(root) ?? await fetchChrome()
  acquirePending()
  owners.released()
  if (owners.managed && owners.conversations.size === 0) { unlock(); return }
  const dir = join(profilesFolder(root), name)
  mkdirSync(dir, { recursive: true })
  const child = spawn(chrome.path, [`--user-data-dir=${dir}`, '--remote-debugging-pipe', '--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check', ...chromeFlags(), 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] })
  child.stderr?.resume()
  const cdp = new Cdp(child.stdio[3] as Writable, child.stdio[4] as Readable)
  mkdirSync(join(folder, 'hosts'), { recursive: true })
  const card = join(folder, 'hosts', `${process.pid}.json`)
  const base = 900_000_000 + process.pid * 100_000
  let counter = 0
  const ids = new Map<string, number>()
  const targets = new Map<number, TargetInfo>()
  const say = (): void => {
    writeFileSync(`${card}.part`, JSON.stringify({ pid: process.pid, label, tabs: [...targets.keys()], focused: 0, t: Date.now() }))
    renameSync(`${card}.part`, card)
  }
  const end = (): never => { rmSync(card, { force: true }); process.exit(0) }
  child.on('exit', end)
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, () => { child.kill(); end() })
  const track = (info: TargetInfo): void => {
    if (info.type !== 'page') return
    let id = ids.get(info.targetId)
    if (id === undefined) { id = base + ++counter; ids.set(info.targetId, id) }
    targets.set(id, info)
    owners.inherit(info.targetId, info.openerId)
  }
  const sessions = new Map<string, string>()
  const worlds = new Map<string, number>()
  const held = new Map<number, Record<string, unknown>>()
  const positions = new Map<string, CursorPoint>()
  cdp.on(({ method, params }) => {
    if (method === 'Target.targetCreated' || method === 'Target.targetInfoChanged') { track(params['targetInfo'] as TargetInfo); say() }
    if (method === 'Target.targetDestroyed') {
      const id = ids.get(params['targetId'] as string)
      if (id !== undefined) { targets.delete(id); held.delete(id) }
      owners.tabs.delete(params['targetId'] as string)
      sessions.delete(params['targetId'] as string)
      worlds.delete(params['targetId'] as string)
      positions.delete(params['targetId'] as string)
      say()
    }
    if (method === 'Target.detachedFromTarget' && typeof params['targetId'] === 'string') { sessions.delete(params['targetId']); worlds.delete(params['targetId']) }
  })
  const answered = await Promise.race([cdp.send('Target.setDiscoverTargets', { discover: true }).then(() => true), wait(20_000).then(() => false)])
  if (!answered) {
    process.stdout.write(`Chrome for Testing did not answer: the profile ${label} may be open in another Chrome for Testing window. Close it and start again.\n`)
    child.kill()
    end()
  }
  for (const one of (await cdp.send<{ targetInfos: TargetInfo[] }>('Target.getTargets')).targetInfos) track(one)
  say()

  let activeConversation: string | undefined
  let closing = false
  const targetOf = (id: number | undefined): string => {
    if (id === undefined || !Number.isInteger(id)) throw new Error('Give the tab id from geckit browser pages.')
    const found = targets.get(id)
    if (found === undefined) throw new Error(`No tab ${id}. Run geckit browser pages for the current ids.`)
    owners.authorize(activeConversation, found.targetId)
    return found.targetId
  }
  const session = async (targetId: string): Promise<string> => {
    const had = sessions.get(targetId)
    if (had !== undefined) return had
    const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true })
    sessions.set(targetId, sessionId)
    await cdp.send('Page.enable', {}, sessionId)
    return sessionId
  }
  const sender = async (id: number | undefined): Promise<(method: string, params?: object) => Promise<Record<string, unknown>>> => {
    const sessionId = await session(targetOf(id))
    return (method, params = {}) => cdp.send(method, params, sessionId)
  }
  const evaluate = async (targetId: string, expression: (world: number) => string): Promise<unknown> => {
    const sessionId = await session(targetId)
    for (let attempt = 0; ; attempt++) {
      let world = worlds.get(targetId)
      try {
        if (world === undefined) {
          const tree = await cdp.send<{ frameTree: { frame: { id: string } } }>('Page.getFrameTree', {}, sessionId)
          world = (await cdp.send<{ executionContextId: number }>('Page.createIsolatedWorld', { frameId: tree.frameTree.frame.id, worldName: 'geckit' }, sessionId)).executionContextId
          await cdp.send('Runtime.evaluate', { expression: pageScript(), contextId: world }, sessionId)
          worlds.set(targetId, world)
        }
        const done = await cdp.send<{ result: { value?: unknown }; exceptionDetails?: { text: string; exception?: { description?: string } } }>('Runtime.evaluate', { expression: expression(world), contextId: world, awaitPromise: true, returnByValue: true }, sessionId)
        if (done.exceptionDetails !== undefined) throw new Error(done.exceptionDetails.exception?.description ?? done.exceptionDetails.text)
        const value = done.result.value as { error?: string } | undefined
        if (value !== null && typeof value === 'object' && typeof value.error === 'string') throw Object.assign(new Error(value.error), { fromPage: true })
        return value
      } catch (error) {
        worlds.delete(targetId)
        if (attempt > 0 || (error as { fromPage?: boolean }).fromPage === true) throw error
      }
    }
  }
  const inPage = (id: number | undefined, fn: (typeof PAGE_FUNCTIONS)[number], ...args: unknown[]): Promise<unknown> => evaluate(targetOf(id), () => `geckitPage.${fn}(...${JSON.stringify(args)})`)
  const loaded = async (targetId: string, go: () => Promise<Record<string, unknown>>): Promise<void> => {
    const sessionId = await session(targetId)
    let stop = (): void => undefined
    const fired = new Promise<void>((done) => {
      const timer = setTimeout(done, 20_000)
      const off = cdp.on(({ method, sessionId: from }) => { if (method === 'Page.loadEventFired' && from === sessionId) { clearTimeout(timer); off(); done() } })
      stop = () => { clearTimeout(timer); off() }
    })
    const went = await go()
    if (typeof went['errorText'] === 'string' && went['errorText'] !== '') { stop(); throw new Error(`Chrome could not load it: ${went['errorText']}.`) }
    await fired
  }
  const describe = async (targetId: string, id: number): Promise<{ id: number; title: string; url: string }> => {
    const { targetInfo } = await cdp.send<{ targetInfo: TargetInfo }>('Target.getTargetInfo', { targetId })
    return { id, title: targetInfo.title, url: targetInfo.url }
  }
  const press = async (send: (method: string, params?: object) => Promise<unknown>, name: string): Promise<string> => {
    const key = KEYS[name] ?? (name.length === 1 ? { key: name, text: name, code: '', keyCode: name.toUpperCase().charCodeAt(0) } : undefined)
    if (key === undefined) throw new Error(`Unknown key ${name}. Known: ${Object.keys(KEYS).join(', ')} or one character.`)
    const base = { key: key.key ?? name, code: key.code, windowsVirtualKeyCode: key.keyCode }
    await send('Input.dispatchKeyEvent', { type: key.text ? 'keyDown' : 'rawKeyDown', ...base, ...(key.text ? { text: key.text } : {}) })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base })
    return base.key
  }
  const mouse = async (send: (method: string, params?: object) => Promise<unknown>, at: { x: number; y: number }, click: boolean): Promise<void> => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: at.x, y: at.y })
    if (!click) return
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: at.x, y: at.y, button: 'left', clickCount: 1 })
  }
  const moveTo = async (id: number | undefined, ref: string | undefined, kind: 'click' | 'hover' | 'type' | 'scroll'): Promise<string> => {
    const target = targetOf(id)
    const at = await inPage(id, 'pageCenter', ref) as CursorPoint & { label: string }
    const viewport = await evaluate(target, () => `({ width: Math.min(innerWidth, document.documentElement.clientWidth), height: Math.min(innerHeight, document.documentElement.clientHeight), reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches })`) as Pick<ViewFrame, 'width' | 'height'> & { reducedMotion: boolean }
    const previous = positions.get(target) ?? { x: 0, y: 0 }
    const from = { x: Math.max(0, Math.min(viewport.width - 1, previous.x)), y: Math.max(0, Math.min(viewport.height - 1, previous.y)) }
    const to = { x: Math.max(0, Math.min(viewport.width - 1, at.x)), y: Math.max(0, Math.min(viewport.height - 1, at.y)) }
    const path = viewport.reducedMotion ? [{ ...to, ms: 0 }] : cursorPath(from, to, viewport)
    const send = await sender(id)
    await inPage(id, 'pagePointer', ref, 'move', from)
    await send('Emulation.setFocusEmulationEnabled', { enabled: true })
    const started = performance.now()
    for (const point of path) {
      const remaining = point.ms - (performance.now() - started)
      if (remaining > 0) await wait(remaining)
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y })
      positions.set(target, { x: point.x, y: point.y })
    }
    const end = positions.get(target) ?? at
    await inPage(id, 'pagePointer', ref, kind, end)
    if (kind === 'click') for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: end.x, y: end.y, button: 'left', clickCount: 1 })
    return at.label
  }
  const withoutPointer = async <T>(id: number | undefined, keep: boolean | undefined, steps: () => Promise<T>): Promise<T> => {
    if (!keep) await inPage(id, 'pageOverlay', false)
    try { return await steps() } finally { if (!keep) await inPage(id, 'pageOverlay', true).catch(() => undefined) }
  }

  const answer = async (request: Request): Promise<unknown> => {
    const id = request.tab
    switch (request.cmd) {
      case 'ping': return { version: `Chrome for Testing ${chrome.version}` }
      case 'acquire': return {}
      case 'quit': if (owners.conversations.size > 0) throw new Error('This browser still belongs to conversations. Move their cards to Done to release it.'); setTimeout(() => { void cdp.send('Browser.close').catch(() => end()) }, 100); return {}
      case 'pages': return [...targets.entries()].filter(([, info]) => activeConversation === undefined ? !owners.managed : owners.tabs.get(info.targetId) === activeConversation).map(([one, info]) => ({ id: one, window: 0, active: false, title: info.title, url: info.url }))
      case 'open': {
        const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank', background: true })
        if (activeConversation !== undefined) owners.tabs.set(targetId, activeConversation)
        track({ targetId, type: 'page', title: '', url: 'about:blank' })
        const made = ids.get(targetId) as number
        const send = await sender(made)
        await loaded(targetId, () => send('Page.navigate', { url: request.url }))
        return describe(targetId, made)
      }
      case 'go': {
        const targetId = targetOf(id)
        const send = await sender(id)
        await loaded(targetId, () => send('Page.navigate', { url: request.url }))
        return describe(targetId, id as number)
      }
      case 'close': await cdp.send('Target.closeTarget', { targetId: targetOf(id) }); return {}
      case 'text': return inPage(id, 'pageText')
      case 'read': return inPage(id, 'pageRead')
      case 'style': return inPage(id, 'pageStyle', request.ref)
      case 'click': {
        return { clicked: await moveTo(id, request.ref ?? undefined, 'click') }
      }
      case 'hover': {
        return { hovered: await moveTo(id, request.ref ?? undefined, 'hover') }
      }
      case 'type': await moveTo(id, request.ref ?? undefined, 'type'); return inPage(id, 'pageType', request.ref, request.text)
      case 'scroll':
        if (request.ref != null) await moveTo(id, request.ref, 'scroll')
        else await inPage(id, 'pagePointer', null, 'scroll')
        return inPage(id, 'pageScroll', request.ref ?? null, request.by)
      case 'key': await inPage(id, 'pagePointer', null, 'key'); return { pressed: await press(await sender(id), request.key ?? '') }
      case 'eval': {
        const done = await (await sender(id))('Runtime.evaluate', { expression: request.code, awaitPromise: true, returnByValue: true, userGesture: true }) as { result: { value?: unknown; type: string }; exceptionDetails?: { text: string; exception?: { description?: string } } }
        if (done.exceptionDetails) throw new Error(done.exceptionDetails.exception?.description ?? done.exceptionDetails.text)
        return { value: done.result.value ?? null, type: done.result.type }
      }
      case 'shot': return withoutPointer(id, request.pointer, async () => {
        const send = await sender(id)
        if (request.ref !== undefined && request.ref !== null) {
          const box = await inPage(id, 'pageBox', request.ref, 8) as { x: number; y: number; width: number; height: number; scrollX: number; scrollY: number }
          return { png: (await send('Page.captureScreenshot', { format: 'png', clip: { x: box.x + box.scrollX, y: box.y + box.scrollY, width: box.width, height: box.height, scale: 1 } }))['data'] }
        }
        return { png: (await send('Page.captureScreenshot', { format: 'png' }))['data'] }
      })
      case 'view': {
        const send = await sender(id)
        if (request.reset) {
          await send('Emulation.clearDeviceMetricsOverride')
          await send('Emulation.setEmulatedMedia', { features: [] })
          held.delete(id as number)
          return { reset: true }
        }
        const next = { ...(held.get(id as number) ?? {}), ...request.set } as { width?: number; height?: number; phone?: boolean; scheme?: string; motion?: string }
        if (next.width !== undefined) await send('Emulation.setDeviceMetricsOverride', { width: next.width, height: next.height, deviceScaleFactor: next.phone ? 3 : 0, mobile: next.phone === true })
        await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: next.scheme ?? '' }, { name: 'prefers-reduced-motion', value: next.motion ?? '' }] })
        held.set(id as number, next)
        const size = await send('Runtime.evaluate', { expression: '[innerWidth, innerHeight, matchMedia("(prefers-color-scheme: dark)").matches, matchMedia("(prefers-reduced-motion: reduce)").matches]', returnByValue: true }) as { result: { value: [number, number, boolean, boolean] } }
        const [width, height, dark, still] = size.result.value
        return { width, height, dark, still }
      }
      case 'record': return record(request)
      case 'view-open': return viewOpen(request.url)
      case 'view-frame': return viewFrame()
      case 'view-input': return viewInput(request.input)
      case 'view-close': { const target = viewTarget; viewTarget = undefined; if (target !== undefined) await cdp.send('Target.closeTarget', { targetId: target }).catch(() => undefined); return {} }
      default: throw new Error(`Unknown command ${request.cmd}.`)
    }
  }

  let viewTarget: string | undefined
  const viewSend = async (): Promise<(method: string, params?: object) => Promise<Record<string, unknown>>> => {
    if (viewTarget === undefined || ![...targets.values()].some((one) => one.targetId === viewTarget)) throw new Error('The sign-in tab is closed. Start the sign-in again.')
    const sessionId = await session(viewTarget)
    return (method, params = {}) => cdp.send(method, params, sessionId)
  }
  const viewOpen = async (url: string | undefined): Promise<unknown> => {
    if (viewTarget === undefined || ![...targets.values()].some((one) => one.targetId === viewTarget)) {
      const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' })
      track({ targetId, type: 'page', title: '', url: 'about:blank' })
      viewTarget = targetId
    }
    const send = await viewSend()
    await send('Emulation.setDeviceMetricsOverride', { ...VIEW_SIZE, deviceScaleFactor: 1, mobile: false })
    if (url !== undefined && url !== '') await loaded(viewTarget, () => send('Page.navigate', { url }))
    return { ...VIEW_SIZE }
  }
  const viewFrame = async (): Promise<unknown> => {
    const send = await viewSend()
    const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 60 })
    const { targetInfo } = await cdp.send<{ targetInfo: TargetInfo }>('Target.getTargetInfo', { targetId: viewTarget })
    return { jpeg: shot['data'], ...VIEW_SIZE, url: targetInfo.url, title: targetInfo.title }
  }
  const viewInput = async (input: ViewInput | undefined): Promise<unknown> => {
    if (input === undefined) throw new Error('Nothing to do.')
    const send = await viewSend()
    if (input.type === 'click' || input.type === 'move') await mouse(send, { x: input.x, y: input.y }, input.type === 'click')
    else if (input.type === 'wheel') await send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: input.x, y: input.y, deltaX: 0, deltaY: input.dy })
    else if (input.type === 'key') await press(send, input.key)
    else if (input.type === 'text') await send('Input.insertText', { text: input.text.slice(0, 2000) })
    else if (input.type === 'go') {
      const url = /^[a-z][a-z0-9+.-]*:/i.test(input.url) ? input.url : `https://${input.url}`
      if (!/^https?:\/\//i.test(url)) throw new Error('Open an http or https address.')
      await loaded(viewTarget ?? '', () => send('Page.navigate', { url }))
    } else if (input.type === 'back') await send('Runtime.evaluate', { expression: 'history.back()' })
    return {}
  }

  const record = async (request: Request): Promise<unknown> => {
    const id = request.tab
    const ms = request.ms ?? 1500
    const slow = request.slow ?? 1
    const box = request.ref === undefined || request.ref === null ? undefined : await inPage(id, 'pageBox', request.ref, 16)
    const at = request.then?.ref === undefined ? undefined : await inPage(id, 'pageCenter', request.then.ref) as { x: number; y: number; label: string }
    const send = await sender(id)
    return withoutPointer(id, request.pointer, async () => {
      const frames: { data: string; t: number }[] = []
      if (slow !== 1) await inPage(id, 'pageSlow', slow)
      let polling = true
      const poll = (async () => {
        while (polling) {
          const asked = Date.now()
          const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85 })
          frames.push({ data: shot['data'] as string, t: (asked + Date.now()) / 2 })
        }
      })()
      try {
        if (request.then?.cmd === 'hover') await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 })
        await wait(200)
        const start = Date.now()
        let did = 'nothing'
        if (request.pointer && at !== undefined) { await inPage(id, 'pageOverlay', true); await inPage(id, 'pagePointer', request.then?.ref, request.then?.cmd) }
        if (request.then?.cmd === 'click' && at !== undefined) { await mouse(send, at, true); did = `clicked ${at.label}` }
        if (request.then?.cmd === 'hover' && at !== undefined) { await mouse(send, at, false); did = `hovered ${at.label}` }
        if (request.then?.cmd === 'key') did = `pressed ${await press(send, request.then.key ?? '')}`
        await wait(ms * slow)
        polling = false
        await poll
        const before = frames.filter((one) => one.t < start).at(-1)
        const after = frames.filter((one) => one.t >= start && one.t <= start + ms * slow + 100)
        const kept = (before === undefined ? after : [{ ...before, t: start }, ...after]).map((one) => ({ ms: Math.round((one.t - start) / slow), data: one.data }))
        if (kept.length === 0) throw new Error('Chrome drew nothing while recording.')
        const step = Math.max(1, Math.ceil(kept.length / 90))
        const sent = kept.filter((_one, index) => index % step === 0 || index === kept.length - 1)
        const made = await evaluate(targetOf(id), () => `(async () => { if (typeof geckitMedia === 'undefined') { ${mediaScript()} } const frames = ${JSON.stringify(sent)}; const box = ${JSON.stringify(box ?? null) } ?? undefined; return { sheet: await geckitMedia.contactSheet(frames, box), gif: await geckitMedia.animation(frames, box) } })()`) as { sheet: string; gif: string }
        return { did, slow, frames: sent, sheet: made.sheet, gif: made.gif, total: kept.length }
      } finally {
        polling = false
        if (slow !== 1) await inPage(id, 'pageSlow', 1).catch(() => undefined)
      }
    })
  }

  const release = async (): Promise<void> => {
    if (closing) return
    acquirePending()
    const released = owners.released()
    for (const targetId of released) {
      await cdp.send('Target.closeTarget', { targetId }).catch(() => undefined)
      owners.tabs.delete(targetId)
    }
    if (owners.managed && owners.conversations.size === 0 && !closing) {
      closing = true
      setTimeout(() => { void cdp.send('Browser.close').catch(() => end()) }, 100)
    }
  }
  let queue: Promise<Reply> = Promise.resolve({ ok: true })
  const handle = (request: object): Promise<Reply> => {
    const run = async (): Promise<Reply> => {
      const asked = request as Request
      try {
        if (closing) throw new Error('This test browser is closing. Start test again.')
        if (asked.cmd.startsWith('view-')) {
          if (asked.conversation !== undefined) throw new Error('Only the person signs in, through GeckIt.')
          return await answer(asked).then((result) => ({ ok: true, result }), (error: Error) => ({ ok: false, error: error.message }))
        }
        activeConversation = asked.conversation
        if (asked.tab !== undefined) targetOf(asked.tab)
        else owners.acquire(asked.conversation)
        const one = (next: Request): Promise<Reply> => answer(next).then((result) => ({ ok: true, result }), (error: Error) => ({ ok: false, error: error.message }))
        const reply = asked.cmd === 'find' ? await findIn(one, asked.tab, asked.query ?? '') : await one(asked)
        await release()
        if (asked.conversation !== undefined && browserConversation(asked.conversation, folder)?.done !== false) return { ok: false, error: 'This conversation is Done; its test tabs have been released.' }
        return reply
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) } }
      finally { activeConversation = undefined }
    }
    queue = queue.then(run, run)
    return queue
  }
  const pick = serveAsks(folder, (to) => to === process.pid, handle)
  watch(folder, pick)
  setInterval(() => {
    say()
    pick()
    queue = queue.then(async () => { await release(); return { ok: true } }, async () => { await release(); return { ok: true } })
  }, 1_000)

}

const tell = (source: string, reply: object): void => { writeFileSync(`${source}.told.part`, JSON.stringify(reply)); renameSync(`${source}.told.part`, `${source}.told`) }

/** Has the service start a test browser outside any sandbox: a conversation only leaves a .launch file. */
export function serveTestLaunches(executable: string, script: string, folder: string = browserFolder(), root: string = homedir()): () => void {
  mkdirSync(folder, { recursive: true })
  const pending = new Set<string>()
  const pick = (): void => {
    let files: string[]
    try { files = readdirSync(folder) } catch { return }
    for (const file of files.filter((one) => one.endsWith('.account'))) {
      const source = join(folder, file)
      try {
        const asked = JSON.parse(readFileSync(source, 'utf8')) as { name: string; note: string; create?: boolean }
        let error: string | undefined
        try { makeTestAccount(asked.name, asked.note, root, asked.create === true) } catch (failed) { error = failed instanceof Error ? failed.message : String(failed) }
        tell(source, error === undefined ? { ok: true } : { ok: false, error })
      } catch { /* A request left half written is read again next time. */ continue }
      rmSync(source, { force: true })
    }
    for (const file of files.filter((one) => one.endsWith('.signin'))) {
      const source = join(folder, file)
      let name: string
      try { name = (JSON.parse(readFileSync(source, 'utf8')) as { name: string }).name } catch { continue }
      rmSync(source, { force: true })
      try { tell(source, { ok: true, ...signInLink(name) }) } catch (error) { tell(source, { ok: false, error: error instanceof Error ? error.message : String(error) }) }
    }
    files = files.filter((one) => one.endsWith('.launch'))
    for (const file of files) {
      const source = join(folder, file)
      let name: string
      let conversation: string | undefined
      try {
        const launch = JSON.parse(readFileSync(source, 'utf8')) as { name: string; conversation?: string }
        conversation = launch.conversation
        name = conversation === undefined ? launch.name : conversationTestName(conversation, folder, launch.name)
      } catch { rmSync(source, { force: true }); continue }
      if (pending.has(name) && !profiles(folder).some((one) => one.label === `${TEST_PREFIX}${name}`)) {
        if (conversation === undefined) rmSync(source, { force: true })
        continue
      }
      if (conversation !== undefined && profiles(folder).some((one) => one.label === `${TEST_PREFIX}${name}`)) continue
      const mine = `${source}.${process.pid}`
      try { renameSync(source, mine) } catch { continue }
      rmSync(mine, { force: true })
      if (!validTestName(name) || profiles(folder).some((one) => one.label === `${TEST_PREFIX}${name}`)) continue
      pending.add(name)
      mkdirSync(testingFolder(root), { recursive: true })
      const log = openSync(testLog(name, root), 'w')
      const child = spawn(executable, [script, 'browser-test', name], { detached: true, stdio: ['ignore', log, log], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...(conversation === undefined ? {} : { GECKIT_TEST_CONVERSATION: conversation }) } })
      closeSync(log)
      child.on('error', () => { pending.delete(name) })
      child.on('exit', () => { pending.delete(name) })
      child.unref()
    }
  }
  let watcher: ReturnType<typeof watch> | undefined
  try { watcher = watch(folder, pick).unref() } catch { watcher = undefined }
  const timer = setInterval(pick, 1_000).unref()
  pick()
  return () => { watcher?.close(); clearInterval(timer) }
}

/** Every test profile kept here, whether its browser is open now, and Chrome for Testing's own state. */
export function testBrowsersState(root?: string): TestBrowsersState {
  const open = new Set(profiles().flatMap((one) => { const name = testName(one.label); return name === undefined ? [] : [name] }))
  let names: string[]
  try { names = readdirSync(profilesFolder(root)).filter((one) => validTestName(one) && statSync(join(profilesFolder(root), one)).isDirectory()) } catch { names = [] }
  const chrome = testingChrome(root)
  const fetching = downloading(root)
  return {
    supported: platformName() !== undefined,
    ...(chrome === undefined ? {} : { version: chrome.version }),
    ...(fetching === undefined ? {} : { download: { received: fetching.received, total: fetching.total, ...(fetching.error === undefined ? {} : { error: fetching.error }) } }),
    profiles: names.sort().map((name) => { const note = testAccount(name, join(root ?? homedir(), '.geckit', 'browser'))?.note; return { name, open: open.has(name), ...(note === undefined || note === '' ? {} : { note }) } }),
  }
}

/** Throws away a test profile's folder, its sign-ins with it; the browser must be closed first. */
export function deleteTestProfile(name: string, root?: string): void {
  if (!validTestName(name)) return
  const folder = join(root ?? homedir(), '.geckit', 'browser')
  const unlock = acquireTestLock(name, folder)
  if (unlock === undefined) throw new Error(`${TEST_PREFIX}${name} is in use. Close its browser and try again.`)
  try {
    rmSync(join(profilesFolder(root), name), { recursive: true, force: true })
    rmSync(testLog(name, root), { force: true })
    forgetTestAccount(name, folder)
  } finally { unlock() }
}

/** Changes a test profile's description and, with its browser closed, its name; sign-ins stay with the profile. */
export function updateTestProfile(name: string, next: string, note: string, root?: string): void {
  if (!validTestName(name) || !validTestName(next)) throw new Error('Name the profile with lowercase letters, digits and hyphens, such as github-work.')
  const folder = join(root ?? homedir(), '.geckit', 'browser')
  if (!existsSync(join(profilesFolder(root), name))) throw new Error(`There is no ${TEST_PREFIX}${name}.`)
  if (next === name) { saveTestAccount(name, note, folder); return }
  const unlock = acquireTestLock(name, folder)
  if (unlock === undefined) throw new Error(`Close ${TEST_PREFIX}${name} before renaming it.`)
  try {
    const unlockNext = acquireTestLock(next, folder)
    if (unlockNext === undefined) throw new Error(`A profile named ${next} already exists. Choose another name.`)
    try {
      if (existsSync(join(profilesFolder(root), next)) || testAccount(next, folder) !== undefined) throw new Error(`A profile named ${next} already exists. Choose another name.`)
      renameSync(join(profilesFolder(root), name), join(profilesFolder(root), next))
      saveTestAccount(next, note, folder)
      forgetTestAccount(name, folder)
      if (existsSync(testLog(name, root))) renameSync(testLog(name, root), testLog(next, root))
    } finally { unlockNext() }
  } finally { unlock() }
}

/** Makes a test profile for one account, or changes what its note says; the browser opens only when asked. */
export function makeTestAccount(name: string, note: string, root?: string, create = false): void {
  if (!validTestName(name)) throw new Error('Name the profile with lowercase letters, digits and hyphens, such as github-work.')
  const folder = join(root ?? homedir(), '.geckit', 'browser')
  const unlock = acquireTestLock(name, folder)
  if (unlock === undefined) throw new Error(`${TEST_PREFIX}${name} is in use. Close its browser and try again.`)
  const directory = join(profilesFolder(root), name)
  let created = false
  try {
    const present = (path: string): boolean => { try { lstatSync(path); return true } catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false; throw error } }
    const exists = present(directory)
    if (create && (exists || present(join(browserStateFolder(folder), 'accounts', `${name}.json`)))) throw new Error(`A profile named ${name} already exists. Choose another name.`)
    if (exists && !lstatSync(directory).isDirectory()) throw new Error('The profile path is not a directory.')
    if (!exists) { mkdirSync(profilesFolder(root), { recursive: true, mode: 0o700 }); mkdirSync(directory, { mode: 0o700 }); created = true }
    saveTestAccount(name, note, folder)
  } catch (error) {
    if (created) rmSync(directory, { recursive: true, force: true })
    throw error
  } finally { unlock() }
}
