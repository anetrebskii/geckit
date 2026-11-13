import type { Download, Page } from 'playwright-core'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, watch, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join } from 'node:path'
import type { TestBrowsersState, ViewFrame, ViewInput } from '../shared/api'
import background from '../../extension/background.js?raw'
import { browserFolder, findIn, profiles, serveAsks, type Reply } from './browser'
import { signInLink } from './live-view'
import { serveSecretFiles } from './secrets-serve'
import { receiver, type SealedValue } from '../shared/secret-seal'
import { alive, camoufoxHeadless, camoufoxSupported, downloading, fetchCamoufox, migrateChromeProfiles, profilesFolder, testingCamoufox, testingFolder } from './camoufox'
import { acquireTestLock, browserConversation, browserStateFolder, conversationTestName, forgetTestAccount, saveTestAccount, testAccount, TestTabOwners } from './browser-lifecycle'

export { profilesFolder, testingFolder, testingCamoufox, camoufoxHeadless, downloading } from './camoufox'
export const testLog = (name: string, root?: string): string => join(testingFolder(root), `${name}.log`)
export const TEST_PREFIX = 'geckit:'
export const TEST_BROWSER = 'geckit'
export const currentProfile = (value: string): string => value === 'test' ? TEST_BROWSER : value.startsWith('test:') ? `${TEST_PREFIX}${value.slice(5)}` : value
export const testName = (label: string): string | undefined => { const current = currentProfile(label); return current.startsWith(TEST_PREFIX) ? current.slice(TEST_PREFIX.length) : undefined }
export const validTestName = (name: string): boolean => /^[a-z0-9][a-z0-9-]{0,39}$/.test(name)

const PAGE_FUNCTIONS = ['pageSlow', 'pageOverlay', 'pageBox', 'pageStyle', 'pageText', 'pageRead', 'pageCenter', 'pageClick', 'pageType', 'pageScroll', 'pagePointer', 'pageSecrets', 'pageSecretField', 'pageTypeSecret'] as const
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

type PageValue = string | number | boolean | null | PageValue[] | { [key: string]: PageValue }

export function scrubSecrets(value: PageValue, secrets: readonly string[]): PageValue {
  if (secrets.length === 0) return value
  let text = JSON.stringify(value)
  for (const one of secrets) text = text.split(JSON.stringify(one).slice(1, -1)).join('[secret]')
  return JSON.parse(text) as PageValue
}
interface ViewSettings { readonly width?: number; readonly height?: number; readonly phone?: boolean; readonly scheme?: 'light' | 'dark'; readonly motion?: 'reduce' | 'no-preference' }
interface Request { readonly conversation?: string; readonly cmd: string; readonly tab?: number; readonly url?: string; readonly ref?: string | null; readonly real?: boolean; readonly text?: string; readonly by?: number; readonly key?: string; readonly code?: string; readonly pointer?: boolean; readonly reset?: boolean; readonly set?: ViewSettings; readonly ms?: number; readonly slow?: number; readonly then?: { readonly cmd: string; readonly ref?: string; readonly key?: string }; readonly query?: string; readonly input?: ViewInput; readonly keyId?: string; readonly sealed?: SealedValue }
type Center = { readonly x: number; readonly y: number; readonly label: string }
type Box = Omit<Center, 'label'> & { readonly width: number; readonly height: number; readonly scrollX: number; readonly scrollY: number }
const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))
export const VIEW_SIZE = { width: 1280, height: 800 } as const

export async function testBrowser(name: string, folder: string = browserFolder(), root: string = homedir(), initialConversation: string | undefined = process.env['GECKIT_TEST_CONVERSATION']): Promise<void> {
  if (!validTestName(name)) throw new Error(`${name} is not a test profile name: lowercase letters, digits and hyphens.`)
  migrateChromeProfiles(root)
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
        const launch = JSON.parse(readFileSync(join(folder, file), 'utf8')) as Pick<Request, 'conversation'> & { readonly name: string }
        if (launch.conversation === undefined || conversationTestName(launch.conversation, folder, launch.name) !== name) continue
        owners.acquire(launch.conversation)
        rmSync(join(folder, file), { force: true })
      } catch { continue }
    }
  }
  acquirePending()
  const binary = testingCamoufox(root) ?? await fetchCamoufox(root)
  acquirePending()
  owners.released()
  if (owners.managed && owners.conversations.size === 0) { unlock(); return }
  const dir = join(profilesFolder(root), name)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const { firefox } = await import('playwright-core')
  const context = await firefox.launchPersistentContext(dir, {
    executablePath: binary.path,
    headless: camoufoxHeadless(),
    viewport: null,
    env: { ...process.env, CAMOU_CONFIG_1: JSON.stringify({ humanize: true, 'humanize:maxTime': 1.5, allowMainWorld: true }), CAMOU_PREFS_1: JSON.stringify({ 'gfx.bundled-fonts.activate': 0 }) },
    firefoxUserPrefs: { 'gfx.bundled-fonts.activate': 0 },
    timeout: 30_000,
  })
  context.setDefaultTimeout(20_000)
  context.setDefaultNavigationTimeout(20_000)
  mkdirSync(join(folder, 'hosts'), { recursive: true })
  const card = join(folder, 'hosts', `${process.pid}.json`)
  const base = 900_000_000 + process.pid * 100_000
  let counter = 0
  const targets = new Map<number, Page>()
  const ids = new Map<Page, number>()
  const held = new Map<number, ViewSettings>()
  const say = (): void => {
    writeFileSync(`${card}.part`, JSON.stringify({ pid: process.pid, label, tabs: [...targets.keys()], focused: 0, t: Date.now() }))
    renameSync(`${card}.part`, card)
  }
  const end = (): never => { rmSync(card, { force: true }); unlock(); process.exit(0) }
  context.on('close', end)
  for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) process.on(signal, () => { void context.close().finally(end) })
  const saveDownload = async (download: Download): Promise<void> => {
    const directory = join(root, 'Downloads')
    mkdirSync(directory, { recursive: true })
    const name = basename(download.suggestedFilename().replaceAll('\\', '/')) || 'download'
    const extension = extname(name)
    let target = join(directory, name)
    for (let next = 1; ; next++) {
      try { closeSync(openSync(target, 'wx', 0o600)); break } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
        target = join(directory, `${name.slice(0, name.length - extension.length)} (${next})${extension}`)
      }
    }
    try { await download.saveAs(target) } catch (error) { rmSync(target, { force: true }); throw error }
  }
  const track = (page: Page): number => {
    const existing = ids.get(page)
    if (existing !== undefined) return existing
    const id = base + ++counter
    targets.set(id, page)
    ids.set(page, id)
    void page.opener().then((opener) => { const parent = opener === null ? undefined : ids.get(opener); owners.inherit(String(id), parent === undefined ? undefined : String(parent)) })
    page.on('close', () => { targets.delete(id); ids.delete(page); held.delete(id); owners.tabs.delete(String(id)); say() })
    page.on('download', (download) => { void saveDownload(download).catch((error: Error) => process.stderr.write(`Download failed: ${error.message}\n`)) })
    say()
    return id
  }
  context.on('page', track)
  for (const page of context.pages()) track(page)
  say()
  const secretKeys = new Map<string, (sealed: SealedValue, info: string) => Promise<string>>()
  let activeConversation: string | undefined
  let closing = false
  const targetOf = (id: number | undefined): Page => {
    if (id === undefined || !Number.isInteger(id)) throw new Error('Give the tab id from geckit browser pages.')
    const page = targets.get(id)
    if (page === undefined) throw new Error(`No tab ${id}. Run geckit browser pages for the current ids.`)
    owners.authorize(activeConversation, String(id))
    return page
  }
  const evaluate = async (page: Page, expression: string): Promise<PageValue | undefined> => {
    const value = await page.evaluate<PageValue | undefined>(expression)
    if (value !== null && !Array.isArray(value) && typeof value === 'object' && typeof value['error'] === 'string') throw new Error(value['error'])
    return value
  }
  const inPage = (id: number | undefined, fn: (typeof PAGE_FUNCTIONS)[number], ...args: (PageValue | undefined)[]): Promise<PageValue | undefined> => evaluate(targetOf(id), `(() => { ${pageScript()}; return geckitPage.${fn}(...${JSON.stringify(args)}) })()`)
  const describe = async (page: Page, id: number): Promise<{ id: number; title: string; url: string }> => ({ id, title: await page.title(), url: page.url() })
  const navigate = async (page: Page, url = 'about:blank'): Promise<void> => { await page.goto(url, { waitUntil: 'domcontentloaded' }) }
  const press = async (page: Page, key: string): Promise<string> => { await page.keyboard.press(key === 'Space' ? ' ' : key); return key }
  const mouse = async (page: Page, at: Pick<Center, 'x' | 'y'>, click: boolean): Promise<void> => { await page.mouse.move(at.x, at.y); if (click) { await page.mouse.down(); await page.mouse.up() } }
  const moveTo = async (id: number | undefined, ref: string | undefined, kind: 'click' | 'hover' | 'type' | 'scroll'): Promise<string> => {
    const at = await inPage(id, 'pageCenter', ref) as Center
    await mouse(targetOf(id), at, kind === 'click')
    await inPage(id, 'pagePointer', ref, kind, { x: at.x, y: at.y })
    return at.label
  }
  const withoutPointer = async <T>(id: number | undefined, keep: boolean | undefined, steps: () => Promise<T>): Promise<T> => {
    if (!keep) await inPage(id, 'pageOverlay', false)
    await inPage(id, 'pageSecrets', 'hide').catch(() => undefined)
    try { return await steps() } finally {
      if (!keep) await inPage(id, 'pageOverlay', true).catch(() => undefined)
      await inPage(id, 'pageSecrets', 'show').catch(() => undefined)
    }
  }
  let viewPage: Page | undefined
  const viewTarget = (): Page => { if (viewPage === undefined || viewPage.isClosed()) throw new Error('The sign-in tab is closed. Start the sign-in again.'); return viewPage }
  const viewInput = async (input: ViewInput | undefined): Promise<object> => {
    if (input === undefined) throw new Error('Nothing to do.')
    const page = viewTarget()
    if (input.type === 'click' || input.type === 'move') await mouse(page, input, input.type === 'click')
    else if (input.type === 'wheel') { await page.mouse.move(input.x, input.y); await page.mouse.wheel(0, input.dy) }
    else if (input.type === 'key') await press(page, input.key)
    else if (input.type === 'text') await page.keyboard.insertText(input.text.slice(0, 2000))
    else if (input.type === 'go') {
      const url = /^[a-z][a-z0-9+.-]*:/i.test(input.url) ? input.url : `https://${input.url}`
      if (!/^https?:\/\//i.test(url)) throw new Error('Open an http or https address.')
      await navigate(page, url)
    } else if (input.type === 'back') await page.goBack({ waitUntil: 'domcontentloaded' })
    return {}
  }
  const answer = async (request: Request): Promise<object | PageValue | undefined> => {
    const id = request.tab
    switch (request.cmd) {
      case 'ping': return { version: `Camoufox ${binary.version}` }
      case 'acquire': return {}
      case 'quit': if (owners.conversations.size > 0) throw new Error('This browser still belongs to conversations. Move their cards to Done to release it.'); setTimeout(() => { void context.close() }, 100); return {}
      case 'pages': return Promise.all([...targets.entries()].filter(([one]) => activeConversation === undefined ? !owners.managed : owners.tabs.get(String(one)) === activeConversation).map(async ([one, page]) => ({ ...await describe(page, one), window: 0, active: false })))
      case 'open': {
        const page = await context.newPage()
        const made = track(page)
        if (activeConversation !== undefined) owners.tabs.set(String(made), activeConversation)
        await navigate(page, request.url)
        return describe(page, made)
      }
      case 'go': { const page = targetOf(id); await navigate(page, request.url); return describe(page, id as number) }
      case 'close': await targetOf(id).close(); return {}
      case 'text': return inPage(id, 'pageText')
      case 'read': return inPage(id, 'pageRead')
      case 'style': return inPage(id, 'pageStyle', request.ref)
      case 'click': return { clicked: await moveTo(id, request.ref ?? undefined, 'click') }
      case 'hover': return { hovered: await moveTo(id, request.ref ?? undefined, 'hover') }
      case 'type': await moveTo(id, request.ref ?? undefined, 'type'); return inPage(id, 'pageType', request.ref, request.text)
      case 'secret-key': {
        const field = await inPage(id, 'pageSecretField', request.ref) as Record<string, PageValue>
        const key = await receiver()
        const keyId = randomUUID()
        secretKeys.set(keyId, key.open)
        setTimeout(() => secretKeys.delete(keyId), 60_000).unref()
        return { ...field, keyId, endpointKey: key.publicKey }
      }
      case 'type-secret': {
        const open = secretKeys.get(String(request.keyId))
        secretKeys.delete(String(request.keyId))
        if (open === undefined) throw new Error('The secret took too long to arrive. Try again.')
        await moveTo(id, request.ref ?? undefined, 'type')
        return inPage(id, 'pageTypeSecret', request.ref, await open(request.sealed ?? { epk: '', iv: '', data: '' }, 'geckit-fill-v1'))
      }
      case 'scroll': if (request.ref != null) await moveTo(id, request.ref, 'scroll'); else await inPage(id, 'pagePointer', null, 'scroll'); return inPage(id, 'pageScroll', request.ref ?? null, request.by)
      case 'key': await inPage(id, 'pagePointer', null, 'key'); return { pressed: await press(targetOf(id), request.key ?? '') }
      case 'eval': {
        const value = await targetOf(id).evaluate<PageValue>(`mw:${request.code ?? 'undefined'}`)
        const { values } = await inPage(id, 'pageSecrets', 'values') as { values: string[] }
        return { value: scrubSecrets(value ?? null, values), type: typeof value }
      }
      case 'shot': return withoutPointer(id, request.pointer, async () => {
        const page = targetOf(id)
        const box = request.ref == null ? undefined : await inPage(id, 'pageBox', request.ref, 8) as Box
        const clip = box === undefined ? undefined : { x: box.x + box.scrollX, y: box.y + box.scrollY, width: box.width, height: box.height }
        return { png: (await page.screenshot({ type: 'png', ...(clip === undefined ? {} : { clip }) })).toString('base64') }
      })
      case 'view': {
        const page = targetOf(id)
        if (request.reset) { await page.setViewportSize(VIEW_SIZE); await page.emulateMedia({ colorScheme: null, reducedMotion: null }); held.delete(id as number); return { reset: true } }
        const next = { ...held.get(id as number), ...request.set }
        if (next.width !== undefined) await page.setViewportSize({ width: next.width, height: next.height ?? VIEW_SIZE.height })
        await page.emulateMedia({ colorScheme: next.scheme ?? null, reducedMotion: next.motion ?? null })
        held.set(id as number, next)
        return evaluate(page, '({width: innerWidth, height: innerHeight, dark: matchMedia("(prefers-color-scheme: dark)").matches, still: matchMedia("(prefers-reduced-motion: reduce)").matches})')
      }
      case 'record': return record(request)
      case 'view-open': if (viewPage === undefined || viewPage.isClosed()) viewPage = await context.newPage(); await viewPage.setViewportSize(VIEW_SIZE); if (request.url) await navigate(viewPage, request.url); return { ...VIEW_SIZE }
      case 'view-frame': { const page = viewTarget(); return { jpeg: (await page.screenshot({ type: 'jpeg', quality: 60 })).toString('base64'), ...VIEW_SIZE, url: page.url(), title: await page.title() } satisfies ViewFrame }
      case 'view-input': return viewInput(request.input)
      case 'view-close': { const page = viewPage; viewPage = undefined; if (page !== undefined && !page.isClosed()) await page.close(); return {} }
      default: throw new Error(`Unknown command ${request.cmd}.`)
    }
  }
  const record = async (request: Request): Promise<object> => {
    const id = request.tab
    const page = targetOf(id)
    const ms = request.ms ?? 1500
    const slow = request.slow ?? 1
    const box = request.ref == null ? undefined : await inPage(id, 'pageBox', request.ref, 16)
    const at = request.then?.ref === undefined ? undefined : await inPage(id, 'pageCenter', request.then.ref) as Center
    return withoutPointer(id, request.pointer, async () => {
      const frames: { data: string; t: number }[] = []
      if (slow !== 1) await inPage(id, 'pageSlow', slow)
      let polling = true
      const poll = (async () => { while (polling) { const asked = Date.now(); const data = (await page.screenshot({ type: 'jpeg', quality: 85 })).toString('base64'); frames.push({ data, t: (asked + Date.now()) / 2 }) } })()
      try {
        await wait(200)
        let start = Date.now()
        let did = 'nothing'
        if (request.pointer && at !== undefined) { await inPage(id, 'pageOverlay', true); await inPage(id, 'pagePointer', request.then?.ref, request.then?.cmd) }
        if (request.then?.cmd === 'click' && at !== undefined) { await page.mouse.move(at.x, at.y); start = Date.now(); await page.mouse.down(); await page.mouse.up(); did = `clicked ${at.label}` }
        if (request.then?.cmd === 'hover' && at !== undefined) { await mouse(page, at, false); start = Date.now(); did = `hovered ${at.label}` }
        if (request.then?.cmd === 'key') did = `pressed ${await press(page, request.then.key ?? '')}`
        await wait(ms * slow)
        polling = false
        await poll
        const before = frames.filter((one) => one.t < start).at(-1)
        const after = frames.filter((one) => one.t >= start && one.t <= start + ms * slow + 100)
        const kept = (before === undefined ? after : [{ ...before, t: start }, ...after]).map((one) => ({ ms: Math.round((one.t - start) / slow), data: one.data }))
        if (kept.length === 0) throw new Error('Camoufox drew nothing while recording.')
        const step = Math.max(1, Math.ceil(kept.length / 90))
        const sent = kept.filter((_one, index) => index % step === 0 || index === kept.length - 1)
        const made = await evaluate(page, `mw:(async () => { ${mediaScript()}; const frames = ${JSON.stringify(sent)}; const box = ${JSON.stringify(box ?? null)} ?? undefined; return { sheet: await geckitMedia.contactSheet(frames, box), gif: await geckitMedia.animation(frames, box) } })()`) as { sheet: string; gif: string }
        return { did, slow, frames: sent, sheet: made.sheet, gif: made.gif, total: kept.length }
      } finally { polling = false; await poll.catch(() => undefined); if (slow !== 1) await inPage(id, 'pageSlow', 1).catch(() => undefined) }
    })
  }
  const release = async (): Promise<void> => {
    if (closing) return
    acquirePending()
    for (const targetId of owners.released()) { await targets.get(Number(targetId))?.close().catch(() => undefined); owners.tabs.delete(targetId) }
    if (owners.managed && owners.conversations.size === 0) { closing = true; setTimeout(() => { void context.close() }, 100) }
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
  setInterval(() => { say(); pick(); queue = queue.then(async () => { await release(); return { ok: true } }, async () => { await release(); return { ok: true } }) }, 1_000)
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
    serveSecretFiles(folder, files)
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


export function testBrowsersState(root?: string): TestBrowsersState {
  const migrated = migrateChromeProfiles(root)
  const open = new Set(profiles().flatMap((one) => { const name = testName(one.label); return name === undefined ? [] : [name] }))
  let names: string[]
  try { names = readdirSync(profilesFolder(root)).filter((one) => validTestName(one) && statSync(join(profilesFolder(root), one)).isDirectory()) } catch { names = [] }
  const camoufox = testingCamoufox(root)
  const fetching = downloading(root)
  return {
    supported: camoufoxSupported(),
    ...(migrated ? { migrated: true } : {}),
    ...(camoufox === undefined ? {} : { version: camoufox.version }),
    ...(fetching === undefined ? {} : { download: { received: fetching.received, total: fetching.total, phase: fetching.phase, ...(fetching.error === undefined ? {} : { error: fetching.error }) } }),
    profiles: names.sort().map((name) => { const note = testAccount(name, join(root ?? homedir(), '.geckit', 'browser'))?.note; return { name, open: open.has(name), ...(note === undefined || note === '' ? {} : { note }) } }),
  }
}

/** Throws away a test profile's folder, its sign-ins with it; the browser must be closed first. */
export function deleteTestProfile(name: string, root?: string): void {
  migrateChromeProfiles(root)
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
  migrateChromeProfiles(root)
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
  migrateChromeProfiles(root)
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
