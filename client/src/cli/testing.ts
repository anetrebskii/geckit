import type { Dialog, Download, Frame, Page } from 'playwright-core'
import WebSocket from 'ws'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, watch, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, extname, join } from 'node:path'
import type { TestBrowsersState, ViewFrame, ViewInput } from '../shared/api'
import background from '../../extension/background.js?raw'
import { browserFolder, findIn, profiles, serveAsks, type Reply } from './browser'
import { signInLink, tabHandoffLink } from './live-view'
import type { TabHandoffTarget } from './live-view'
import { addressOf, TAB_HANDOFF_LEASE, TAB_HANDOFF_TTL } from '../shared/live-view'
import type { TabHandoffPngFrame } from '../shared/live-view'
import { serveSecretFiles } from './secrets-serve'
import { receiver, type SealedValue } from '../shared/secret-seal'
import { alive, camoufoxLibraries, camoufoxSupported, downloading, migrateChromeProfiles, prepareCamoufox, profilesFolder, testingCamoufox, testingFolder } from './camoufox'
import { prepareLaunch } from './launch'
import { MEDIA_FILE, mediaPrefs } from './launch-settings'
import { HIDDEN_SCRIPT, PAINT_SCRIPT, type PictureJob } from './hidden-page'
import { isServer, presentationOf, setPresentation } from './desktop-identity'
import { acquireTestLock, browserConversation, browserStateFolder, conversationTestName, forgetTestAccount, saveTestAccount, testAccount, TEST_BROWSER_CLOSING, TEST_TAB_READ_ONLY, TestTabOwners } from './browser-lifecycle'

export { profilesFolder, testingFolder, testingCamoufox, camoufoxHeadless, downloading } from './camoufox'
export const testLog = (name: string, root?: string): string => join(testingFolder(root), `${name}.log`)
export const TEST_PREFIX = 'geckit:'
export const TEST_BROWSER = 'geckit'
export const currentProfile = (value: string): string => value === 'test' ? TEST_BROWSER : value.startsWith('test:') ? `${TEST_PREFIX}${value.slice(5)}` : value
export const testName = (label: string): string | undefined => { const current = currentProfile(label); return current.startsWith(TEST_PREFIX) ? current.slice(TEST_PREFIX.length) : undefined }
export const validTestName = (name: string): boolean => /^[a-z0-9][a-z0-9-]{0,39}$/.test(name)

const PAGE_FUNCTIONS = ['pageSlow', 'pageOverlay', 'pageBox', 'pageStyle', 'pageText', 'pageRead', 'pageCenter', 'pageField', 'pageChoose', 'pageTyped', 'pageScroll', 'pagePointer', 'pageSecrets', 'pageSecretField', 'pageGrab', 'pageHas'] as const
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
export interface TestBrowserRequest { readonly conversation?: string; readonly cmd: string; readonly tab?: number; readonly url?: string; readonly ref?: string | null; readonly real?: boolean; readonly text?: string; readonly by?: number; readonly count?: number; readonly button?: 'left' | 'right'; readonly append?: boolean; readonly files?: readonly string[]; readonly folder?: string; readonly to?: string; readonly offset?: { readonly x: number; readonly y: number }; readonly load?: boolean; readonly gone?: string; readonly accept?: boolean; readonly kind?: string; readonly setting?: string; readonly key?: string; readonly code?: string; readonly pointer?: boolean; readonly reset?: boolean; readonly set?: ViewSettings; readonly ms?: number; readonly slow?: number; readonly then?: { readonly cmd: string; readonly ref?: string; readonly key?: string }; readonly query?: string; readonly input?: ViewInput; readonly keyId?: string; readonly sealed?: SealedValue; readonly patches?: boolean }
type Center = { readonly x: number; readonly y: number; readonly label: string }
type Box = Omit<Center, 'label'> & { readonly width: number; readonly height: number; readonly scrollX: number; readonly scrollY: number }
const wait = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))
const KEY_NAMES: Record<string, string> = { cmd: 'Meta', command: 'Meta', meta: 'Meta', win: 'Meta', ctrl: 'Control', control: 'Control', alt: 'Alt', option: 'Alt', opt: 'Alt', shift: 'Shift', esc: 'Escape', return: 'Enter', del: 'Delete', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', space: ' ' }
/** A key or combination as the CLI takes it, such as Cmd+Enter or Shift+Tab, in Playwright's own names. */
export function playwrightKey(combo: string): string {
  const parts = combo.length > 1 && combo.endsWith('+') ? [...combo.slice(0, -2).split('+'), '+'] : combo.split('+')
  return parts.map((one) => KEY_NAMES[one.toLowerCase()] ?? (one.length > 1 ? one[0]?.toUpperCase() + one.slice(1) : one)).join('+')
}
const MAC = process.platform === 'darwin'
type Area = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }
type Near = Center & { readonly area: Area }
/** Where an element is now and the visible part of what scrolls it, without scrolling, so the wheel can bring it into view as a person would. */
export const nearScript = (ref: string): string => `(() => {
  const ref = ${JSON.stringify(ref)}
  const find = (root) => {
    if (globalThis.geckitHidden) return globalThis.geckitHidden.find(ref)
    const hit = root.querySelector('[data-geckit-ref="' + ref + '"]')
    if (hit) return hit
    for (const host of root.querySelectorAll('*')) if (host.shadowRoot) { const inner = find(host.shadowRoot); if (inner) return inner }
    return null
  }
  const el = find(document)
  if (!el) return { error: 'No element ' + ref + ' on this page now. Run geckit browser read again.' }
  const box = el.getBoundingClientRect()
  let area = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
  for (let up = el.parentElement; up && up !== document.body && up !== document.documentElement; up = up.parentElement) {
    if (!/(auto|scroll)/.test(getComputedStyle(up).overflowY) || up.scrollHeight <= up.clientHeight) continue
    const r = up.getBoundingClientRect()
    area = { left: Math.max(0, r.left), top: Math.max(0, r.top), right: Math.min(innerWidth, r.right), bottom: Math.min(innerHeight, r.bottom) }
    break
  }
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, area, label: (el.getAttribute('aria-label') || el.innerText || el.tagName).replace(/\\s+/g, ' ').trim().slice(0, 60) }
})()`
/** How far the wheel turns to bring a point to the middle of what scrolls it, at most most of one screen; 0 once it is in view. */
export const wheelStep = (at: Pick<Near, 'x' | 'y' | 'area'>): number => {
  const { area } = at
  const height = area.bottom - area.top
  const margin = Math.min(40, height / 4)
  if (at.y >= area.top + margin && at.y <= area.bottom - margin && at.x >= area.left && at.x <= area.right) return 0
  return Math.round(Math.max(-height * 0.8, Math.min(height * 0.8, at.y - (area.top + area.bottom) / 2)))
}
const PLACE = '({ y: Math.round(scrollY), height: document.documentElement.scrollHeight, viewport: innerHeight })'
export const VIEW_SIZE = { width: 1280, height: 800 } as const
const POINTER_REST = 3000
/** Where the caret of the focused field is, in the page's own pixels: Firefox leaves it out of screenshots, so the live view draws it. */
export const CARET_SCRIPT = `(() => {
  let field = document.activeElement
  let dx = 0, dy = 0
  while (field && field.tagName === 'IFRAME') { try { const box = field.getBoundingClientRect(); dx += box.left; dy += box.top; field = field.contentDocument.activeElement } catch { return null } }
  if (!field) return null
  const view = field.ownerDocument.defaultView
  const paint = view.getComputedStyle(field.isContentEditable ? (view.getSelection()?.focusNode?.parentElement ?? field) : field)
  const color = paint.caretColor === 'auto' || paint.caretColor === '' ? paint.color : paint.caretColor
  const done = (box, height) => box && box.width + box.height >= 0 && height > 0 ? { x: Math.round(dx + box.left), y: Math.round(dy + box.top), height: Math.round(height), color } : null
  if (field.isContentEditable) {
    const pick = view.getSelection()
    if (!pick || pick.rangeCount === 0 || !pick.isCollapsed) return null
    const range = pick.getRangeAt(0).cloneRange()
    let box = range.getClientRects()[0]
    if (!box) { const mark = document.createElement('span'); mark.textContent = '\u200b'; range.insertNode(mark); box = mark.getBoundingClientRect(); mark.remove() }
    return done(box, box.height)
  }
  const kinds = ['text', 'search', 'url', 'tel', 'email', 'password', 'number']
  if (!(field.tagName === 'TEXTAREA' || (field.tagName === 'INPUT' && kinds.includes(field.type)))) return null
  if (field.selectionStart === null || field.selectionStart !== field.selectionEnd) return null
  const style = view.getComputedStyle(field)
  if (field.tagName === 'INPUT') {
    const box = field.getBoundingClientRect()
    const doc = field.ownerDocument
    const mirror = doc.createElement('span')
    Object.assign(mirror.style, { all: 'initial', position: 'fixed', visibility: 'hidden', pointerEvents: 'none', top: '0', left: '0', whiteSpace: 'pre', unicodeBidi: 'isolate' })
    for (const name of ['font', 'fontKerning', 'fontFeatureSettings', 'fontVariationSettings', 'fontOpticalSizing', 'letterSpacing', 'wordSpacing', 'textTransform', 'direction']) mirror.style[name] = style[name]
    const text = doc.createTextNode(field.type === 'password' ? '\\u2022'.repeat(field.value.length) : field.value)
    mirror.appendChild(text)
    doc.body.appendChild(mirror)
    const range = doc.createRange()
    range.setStart(text, field.selectionStart)
    range.collapse(true)
    const line = mirror.getBoundingClientRect()
    const before = text.length === 0 ? 0 : range.getBoundingClientRect().left - line.left
    mirror.remove()
    const edge = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.paddingLeft) || 0)
    const inner = box.width - edge - (parseFloat(style.borderRightWidth) || 0) - (parseFloat(style.paddingRight) || 0)
    const rtl = style.direction === 'rtl'
    const alignRight = style.textAlign === 'right' || (style.textAlign === 'end' && !rtl) || (style.textAlign === 'start' && rtl)
    const room = inner - line.width
    const align = style.textAlign === 'center' ? Math.max(0, room / 2) : alignRight ? (rtl ? room : Math.max(0, room)) : 0
    let left = edge + align + before - field.scrollLeft
    const size = parseFloat(style.fontSize) || 16
    const height = Math.min(parseFloat(style.lineHeight) || size * 1.2, size * 1.3)
    if (left < 0 || left > box.width) return null
    if (text.length > 0) {
      try {
        const hit = doc.caretPositionFromPoint?.(box.left + left, box.top + box.height / 2)
        if (hit?.offsetNode === field && hit.offset === field.selectionStart) {
          const native = hit.getClientRect()
          if (native?.height > 0) left = native.left - box.left
        }
      } catch { /* Firefox can omit a rectangle for a focused input. */ }
    }
    return done({ left: box.left + left, top: box.top + (box.height - height) / 2, width: 0, height }, height)
  }
  const mirror = field.ownerDocument.createElement('div')
  for (const name of ['boxSizing', 'width', 'height', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'textTransform', 'textIndent', 'lineHeight', 'textAlign', 'wordSpacing', 'tabSize']) mirror.style[name] = style[name]
  const area = field.tagName === 'TEXTAREA'
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', overflow: 'hidden', whiteSpace: area ? 'pre-wrap' : 'pre', wordWrap: area ? 'break-word' : 'normal', borderColor: 'transparent' })
  const value = field.type === 'password' ? '\u2022'.repeat(field.value.length) : field.value
  mirror.textContent = value.slice(0, field.selectionStart)
  const mark = field.ownerDocument.createElement('span')
  mark.textContent = '\u200b'
  mirror.appendChild(mark)
  field.ownerDocument.body.appendChild(mirror)
  const box = field.getBoundingClientRect()
  const size = parseFloat(style.fontSize) || 16
  const line = parseFloat(style.lineHeight) || size * 1.2
  const height = Math.min(line, size * 1.3)
  const top = area ? (parseFloat(style.borderTopWidth) || 0) + mark.offsetTop - field.scrollTop + (line - height) / 2 : (box.height - height) / 2
  const left = (parseFloat(style.borderLeftWidth) || 0) + mark.offsetLeft - field.scrollLeft
  mirror.remove()
  if (left < 0 || left > box.width) return null
  return done({ left: box.left + left, top: box.top + top, width: 0, height }, height)
})()`

/** Where the page's text fields are, so the phone raises its keyboard only for a tap on one. */
export const FIELDS_SCRIPT = `(() => {
  const kinds = new Set(['', 'text', 'search', 'url', 'tel', 'email', 'password', 'number'])
  const found = []
  let focusedField
  const look = (doc, dx, dy, focused) => {
    for (const one of doc.querySelectorAll('input, textarea, [contenteditable=""], [contenteditable="true"], iframe')) {
      if (found.length >= 80) return
      const box = one.getBoundingClientRect()
      if (box.width <= 0 || box.height <= 0 || box.bottom + dy < 0 || box.top + dy > innerHeight || box.right + dx < 0 || box.left + dx > innerWidth) continue
      const active = focused && one === doc.activeElement
      if (one.tagName === 'IFRAME') { try { if (one.contentDocument) look(one.contentDocument, dx + box.left, dy + box.top, active) } catch {} continue }
      if (one.disabled || one.readOnly || (one.tagName === 'INPUT' && !kinds.has(one.type))) continue
      const field = { x: Math.round(dx + box.left), y: Math.round(dy + box.top), width: Math.round(box.width), height: Math.round(box.height) }
      found.push(field)
      if (active) focusedField = field
    }
  }
  look(document, 0, 0, true)
  return { fields: found, focusedField }
})()`

const FRAME_METADATA = `(() => {
  const metadata = { title: document.title }
  try { metadata.caret = ${CARET_SCRIPT} ?? undefined } catch {}
  try { Object.assign(metadata, ${FIELDS_SCRIPT}) } catch {}
  return metadata
})()`

/** Playwright's launch error ends with its call log; the cause is in the browser's own error lines and exit. */
export function launchFailure(message: string): string {
  const lines = message.split('\n').map((one) => one.trim())
  const head = (lines[0] ?? '').replace(/^browserType\.\w+:\s*/, '')
  const said = lines.filter((one) => /^\[pid=\d+\]\[err\]/.test(one)).map((one) => one.replace(/^\[pid=\d+\]\[err\]\s*/, '')).filter((one) => one !== '')
  const exit = lines.map((one) => /<process did exit: (.+)>/.exec(one)?.[1]).find((one) => one !== undefined)
  return [head, ...said.slice(-3), ...(exit === undefined ? [] : [`exited with ${exit}`])].filter((one) => one !== '').join(' / ')
}

export async function testBrowser(name: string, folder: string = browserFolder(), root: string = homedir()): Promise<void> {
  if (!validTestName(name)) throw new Error(`${name} is not a test profile name: lowercase letters, digits and hyphens.`)
  migrateChromeProfiles(root)
  mkdirSync(folder, { recursive: true })
  const label = `${TEST_PREFIX}${name}`
  if (profiles(folder).some((one) => one.label === label && one.pid !== process.pid && alive(one.pid))) return
  const unlock = acquireTestLock(name, folder)
  if (unlock === undefined) return
  process.once('exit', unlock)
  const owners = new TestTabOwners(name, folder)
  const binary = await prepareCamoufox(root)
  const dir = join(profilesFolder(root), name)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const libraries = camoufoxLibraries(binary.path, root)
  const { firefox } = await import('playwright-core')
  const launch = await prepareLaunch(binary.path, testingFolder(root), profilesFolder(root), name, (line) => process.stderr.write(`${line}\n`))
  process.once('exit', () => launch.virtual?.stop())
  let savedMedia: string | undefined
  try { savedMedia = readFileSync(join(dir, MEDIA_FILE), 'utf8') } catch { savedMedia = undefined }
  const prefs = { 'gfx.bundled-fonts.activate': 0, ...mediaPrefs(savedMedia) }
  const context = await firefox.launchPersistentContext(dir, {
    executablePath: binary.path,
    headless: launch.headless,
    viewport: null,
    env: { ...process.env, ...(libraries.length === 0 ? {} : { LD_LIBRARY_PATH: [...libraries, process.env['LD_LIBRARY_PATH'] ?? ''].filter((one) => one !== '').join(':') }), ...(launch.display === undefined ? {} : { DISPLAY: launch.display }), CAMOU_CONFIG_1: JSON.stringify(launch.config), CAMOU_PREFS_1: JSON.stringify(prefs) },
    firefoxUserPrefs: prefs,
    timeout: 30_000,
  }).catch((error: unknown) => { launch.virtual?.stop(); throw error })
  context.setDefaultTimeout(20_000)
  context.setDefaultNavigationTimeout(20_000)
  mkdirSync(join(folder, 'hosts'), { recursive: true })
  const card = join(folder, 'hosts', `${process.pid}.json`)
  const base = 900_000_000 + process.pid * 100_000
  let counter = 0
  const targets = new Map<number, Page>()
  const pendingTabs = new Map<number, Promise<void>>()
  let spare = context.pages().find((page) => page.url() === 'about:blank')
  const startupUntil = Date.now() + 10_000
  const ids = new Map<Page, number>()
  const held = new Map<number, ViewSettings>()
  const dialogs = new Map<Page, Dialog>()
  const openers = new Map<number, number>()
  const frameNumbers = new WeakMap<Frame, number>()
  let frameCounter = 0
  const expecting = new Set<Page>()
  const say = (): void => {
    writeFileSync(`${card}.part`, JSON.stringify({ pid: process.pid, label, engine: 'camoufox', tabs: [...targets.keys()], focused: 0, t: Date.now(), ...(launch.display === undefined ? {} : { display: launch.display }) }))
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
    const assignOwner = async (): Promise<void> => {
      const opener = await page.opener()
      const parent = opener === null ? undefined : ids.get(opener)
      if (parent !== undefined) {
        openers.set(id, parent)
        await pendingTabs.get(parent)
      }
      if (!page.isClosed() && page !== spare && !owners.tabs.has(id)) owners.tabs.set(id, parent === undefined ? null : owners.tabs.get(parent) ?? null)
    }
    pendingTabs.set(id, assignOwner().finally(() => pendingTabs.delete(id)))
    page.on('close', () => {
      if (page === spare) spare = undefined
      targets.delete(id)
      ids.delete(page)
      held.delete(id)
      openers.delete(id)
      dialogs.delete(page)
      owners.tabs.delete(id)
      say()
    })
    page.on('download', (download) => { if (expecting.has(page)) return; void saveDownload(download).catch((error: Error) => process.stderr.write(`Download failed: ${error.message}\n`)) })
    page.on('dialog', (dialog) => { if (page === viewPage || viewOpeners.includes(page)) void dialog.dismiss().catch(() => undefined); else dialogs.set(page, dialog) })
    say()
    return id
  }
  context.on('page', track)
  for (const page of context.pages()) track(page)
  say()
  const secretKeys = new Map<string, (sealed: SealedValue, info: string) => Promise<string>>()
  let activeOwner: ReturnType<TestTabOwners['identify']> = null
  let inspecting = false
  let closing = false
  const targetOf = (id: number | undefined): Page => {
    if (id === undefined || !Number.isInteger(id)) throw new Error('Give the tab id from geckit browser pages.')
    const page = targets.get(id)
    if (page === undefined) throw new Error(`No tab ${id}. Run geckit browser pages for the current ids.`)
    if (!inspecting && owners.tabs.get(id) !== activeOwner) throw new Error(TEST_TAB_READ_ONLY)
    if (handoff !== undefined && (page === viewPage || viewOpeners.includes(page))) throw new Error('The person is using this tab. Wait for them to finish.')
    return page
  }
  const evaluate = async (page: Page, expression: string): Promise<PageValue | undefined> => {
    const value = await page.evaluate<PageValue | undefined>(expression)
    if (value !== null && !Array.isArray(value) && typeof value === 'object' && typeof value['error'] === 'string') throw new Error(value['error'])
    return value
  }
  const call = (fn: (typeof PAGE_FUNCTIONS)[number], args: readonly (PageValue | undefined)[]): string => `(() => { ${HIDDEN_SCRIPT}; ${pageScript()}; return geckitPage.${fn}(...${JSON.stringify(args)}) })()`
  const inPage = (id: number | undefined, fn: (typeof PAGE_FUNCTIONS)[number], ...args: (PageValue | undefined)[]): Promise<PageValue | undefined> => evaluate(targetOf(id), call(fn, args))
  const frameNumber = (frame: Frame): number => { let known = frameNumbers.get(frame); if (known === undefined) { known = ++frameCounter; frameNumbers.set(frame, known) } return known }
  /** A ref is "12" for the page itself, or "3.12" for element 12 inside the frame read numbered 3. */
  const frameOf = (id: number | undefined, ref: string | null | undefined): { frame: Frame; ref: string; inner: boolean } => {
    const page = targetOf(id)
    const text = String(ref ?? '')
    const dot = text.indexOf('.')
    if (dot < 0) return { frame: page.mainFrame(), ref: text, inner: false }
    const wanted = Number(text.slice(0, dot))
    const frame = page.frames().find((one) => one !== page.mainFrame() && frameNumbers.get(one) === wanted)
    if (frame === undefined) throw new Error(`Frame ${wanted} is gone from tab ${id}. Run geckit browser read again.`)
    return { frame, ref: text.slice(dot + 1), inner: true }
  }
  const inRef = async (id: number | undefined, ref: string | null | undefined, fn: (typeof PAGE_FUNCTIONS)[number], ...rest: (PageValue | undefined)[]): Promise<PageValue | undefined> => {
    const at = frameOf(id, ref)
    const value = await at.frame.evaluate<PageValue | undefined>(call(fn, [at.ref, ...rest]))
    if (value !== null && !Array.isArray(value) && typeof value === 'object' && typeof value['error'] === 'string') throw new Error(value['error'])
    return value
  }
  /** Like inRef, with the point it returns moved from its frame's own viewport into the tab's. */
  const atRef = async <T extends { readonly x: number; readonly y: number }>(id: number | undefined, ref: string | null | undefined, fn: (typeof PAGE_FUNCTIONS)[number], ...rest: (PageValue | undefined)[]): Promise<T> => {
    const found = await inRef(id, ref, fn, ...rest) as unknown as T
    const at = frameOf(id, ref)
    if (!at.inner) return found
    const owner = await at.frame.frameElement()
    const box = await owner.boundingBox()
    if (box === null) throw new Error('That frame is not shown on the page.')
    const inset = await owner.evaluate(new Function('el', 'const style = getComputedStyle(el); return { x: el.clientLeft + parseFloat(style.paddingLeft), y: el.clientTop + parseFloat(style.paddingTop) }') as (el: unknown) => { x: number; y: number })
    const top = await evaluate(targetOf(id), '({ scrollX, scrollY, viewport: innerWidth })') as { scrollX: number; scrollY: number; viewport: number }
    return { ...found, x: found.x + box.x + inset.x, y: found.y + box.y + inset.y, ...('scrollX' in found ? top : {}) }
  }
  /** Waits for an action unless the page opens a dialog meanwhile, which holds the page until it is answered. */
  const orDialog = async (page: Page, work: Promise<unknown>): Promise<void> => {
    if (dialogs.has(page)) return
    work.catch(() => undefined)
    let stop = (): void => undefined
    const opened = new Promise<void>((done) => { const listen = (): void => done(); page.once('dialog', listen); stop = () => { page.off('dialog', listen) } })
    try { await Promise.race([work, opened]) } finally { stop() }
  }
  /** Notes the tabs a page opens while an action runs, such as a sign-in popup. */
  const noteOpened = async <T extends object>(steps: () => Promise<T>): Promise<T & { opened?: { id: number; title: string; url: string }[] }> => {
    const before = new Set(targets.keys())
    const result = await steps()
    await wait(300)
    const fresh = [...targets.entries()].filter(([one]) => !before.has(one))
    if (fresh.length === 0) return result
    return { ...result, opened: await Promise.all(fresh.map(async ([one, page]) => ({ id: one, title: await page.title().catch(() => ''), url: page.url() }))) }
  }
  const readAll = async (id: number | undefined): Promise<PageValue> => {
    const page = targetOf(id)
    const main = await inPage(id, 'pageRead') as { title: string; url: string; lines: string[] }
    const lines = [...main.lines]
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue
      const read = await frame.evaluate<{ title: string; url: string; lines: string[]; hidden?: boolean } | undefined>(call('pageRead', [])).catch(() => undefined)
      if (read === undefined || read.hidden === true || read.lines.length === 0) continue
      const number = frameNumber(frame)
      lines.push(`--- frame ${number}: ${(read.title || read.url).slice(0, 80)} ---`, ...read.lines.map((line) => line.replace(/^\[(\d+)\]/, `[${number}.$1]`)))
    }
    return { title: main.title, url: main.url, lines }
  }

  const describe = async (page: Page, id: number): Promise<{ id: number; title: string; url: string }> => ({ id, title: await page.title(), url: page.url() })
  const navigate = async (page: Page, url = 'about:blank'): Promise<void> => { await page.goto(url, { waitUntil: 'domcontentloaded' }) }
  const press = async (page: Page, key: string): Promise<string> => { const named = playwrightKey(key); await orDialog(page, page.keyboard.press(named)); return named }
  const pointers = new WeakMap<Page, { x: number; y: number }>()
  const pointerMoved = new WeakMap<Page, number>()
  const moveMouse = async (page: Page, x: number, y: number): Promise<void> => { await page.mouse.move(x, y); pointers.set(page, { x, y }); pointerMoved.set(page, Date.now()) }
  /** GeckIt's pointer for the live view: where its last move left the real cursor, for three seconds after, as the pointer drawn in pages used to rest. */
  const pointerShown = (page: Page): Pick<ViewFrame, 'pointer'> => { const at = pointers.get(page); return at !== undefined && Date.now() - (pointerMoved.get(page) ?? 0) < POINTER_REST ? { pointer: { x: Math.round(at.x), y: Math.round(at.y) } } : {} }
  const paint = async (page: Page, jobs: readonly PictureJob[]): Promise<string[]> => page.evaluate<string[]>(`(${PAINT_SCRIPT})(${JSON.stringify(jobs)})`)
  const mouse = async (page: Page, at: Pick<Center, 'x' | 'y'>, click: boolean, how: { button?: 'left' | 'right'; count?: number } = {}): Promise<void> => {
    await moveMouse(page, at.x, at.y)
    if (!click) return
    for (let count = 1; count <= (how.count ?? 1); count++) {
      await orDialog(page, page.mouse.down({ button: how.button ?? 'left', clickCount: count }))
      await orDialog(page, page.mouse.up({ button: how.button ?? 'left', clickCount: count }))
    }
  }
  const wheelTo = async (page: Page, ref: string): Promise<Center | undefined> => {
    let last: number | undefined
    for (let turn = 0; turn < 25; turn++) {
      const at = await evaluate(page, nearScript(ref)) as Near
      const dy = wheelStep(at)
      if (dy === 0 && turn === 0) return at
      if (dy === 0) { await wait(250); const settled = await evaluate(page, nearScript(ref)) as Near; if (wheelStep(settled) === 0) return settled }
      if (last !== undefined && Math.abs(at.y - last) < 2) return undefined
      last = at.y
      const { area } = at
      if (turn === 0) await moveMouse(page, area.left + (area.right - area.left) * (0.35 + Math.random() * 0.3), (area.top + area.bottom) / 2 + (Math.random() - 0.5) * 40)
      await page.mouse.wheel(0, dy)
      await wait(150 + Math.random() * 150)
    }
    return undefined
  }
  /** Where the pointer goes for a ref: brought into view by the wheel on the page itself, inside a frame by the frame's own scrolling. */
  const pointAt = async (id: number | undefined, ref: string | undefined): Promise<Center> => {
    if (ref != null && ref.includes('.')) return atRef<Center>(id, ref, 'pageCenter')
    return (ref == null ? undefined : await wheelTo(targetOf(id), ref)) ?? await inPage(id, 'pageCenter', ref) as Center
  }
  const moveTo = async (id: number | undefined, ref: string | undefined, kind: 'click' | 'hover' | 'type' | 'scroll', how: { button?: 'left' | 'right'; count?: number } = {}): Promise<string> => {
    const at = await pointAt(id, ref)
    await mouse(targetOf(id), at, kind === 'click' || kind === 'type', how)
    if (dialogs.has(targetOf(id))) return at.label
    const local = ref != null && ref.includes('.') ? await inRef(id, ref, 'pageCenter') as Center : at
    await inRef(id, ref, 'pagePointer', kind, { x: local.x, y: local.y })
    return at.label
  }
  const toEnd = async (page: Page): Promise<void> => { await page.keyboard.press(MAC ? 'Meta+ArrowDown' : 'Control+End'); await page.keyboard.press('End') }
  const typeKeys = async (id: number | undefined, ref: string | undefined, text: string, secret: boolean, append = false): Promise<PageValue | undefined> => {
    const field = await inRef(id, ref, 'pageField', secret) as { select?: boolean; filled?: boolean }
    if (field.select === true) return inRef(id, ref, 'pageChoose', text)
    await moveTo(id, ref, 'type')
    const page = targetOf(id)
    const at = frameOf(id, ref)
    const focused = (): Promise<boolean> => at.frame.evaluate(`globalThis.geckitHidden?.find(${JSON.stringify(at.ref)}) === document.activeElement`).then((yes) => yes === true, () => true)
    for (let clicks = 1; clicks <= 3; clicks++) {
      const started = Date.now()
      while (!await focused() && Date.now() - started < 500) await wait(50)
      // Firefox on Linux can take the first click into a frame as only leaving the field that had focus.
      if (await focused() || clicks === 3) break
      await mouse(page, await pointAt(id, ref), true)
    }
    if (append) await toEnd(page)
    else if (field.filled === true) { await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.press('Backspace') }
    const pause = Math.min(140, 30_000 / Math.max(1, text.length))
    for (const one of text) { await page.keyboard.type(one); await wait(pause * (0.4 + Math.random() * 0.8)) }
    return inRef(id, ref, 'pageTyped')
  }
  const upload = async (id: number | undefined, ref: string | undefined, files: readonly string[]): Promise<object> => {
    const page = targetOf(id)
    const at = await pointAt(id, ref)
    await inRef(id, ref, 'pagePointer', 'click')
    const chosen = page.waitForEvent('filechooser', { timeout: 5_000 }).catch(() => undefined)
    await mouse(page, at, true)
    const chooser = await chosen
    if (chooser === undefined) throw new Error(`Clicking ${at.label} opened no file chooser. Give the button or field that opens one.`)
    if (!chooser.isMultiple() && files.length > 1) throw new Error(`${at.label} takes one file.`)
    await chooser.setFiles([...files])
    return { chosen: files.length, into: at.label }
  }
  /** Firefox takes no dragged files from Playwright, so the drop is built from the files' bytes with the page's own constructors, which the page can read across the isolated world. */
  const dropFiles = async (id: number | undefined, ref: string | undefined, files: readonly string[]): Promise<object> => {
    const at = await atRef<Center>(id, ref, 'pageGrab')
    await mouse(targetOf(id), at, false)
    const types: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf', '.txt': 'text/plain', '.csv': 'text/csv', '.mp4': 'video/mp4', '.mov': 'video/quicktime' }
    const sent = files.map((one) => ({ name: basename(one), data: readFileSync(one).toString('base64'), type: types[extname(one).toLowerCase()] ?? '' }))
    const where = frameOf(id, ref)
    const dropped = await where.frame.evaluate(`((all) => { const target = globalThis.geckitHidden?.find(${JSON.stringify(where.ref)}); if (!target) return false; const own = window.wrappedJSObject ?? window; const object = (fields) => { const made = new own.Object(); for (const key of Object.keys(fields)) made[key] = fields[key]; return made }; const transfer = new own.DataTransfer(); for (const one of all) { const text = atob(one.data); const numbers = new own.Array(); for (let at = 0; at < text.length; at++) numbers.push(text.charCodeAt(at)); const parts = new own.Array(); parts.push(new own.Uint8Array(numbers)); transfer.items.add(new own.File(parts, one.name, object({ type: one.type }))) } for (const type of ['dragenter', 'dragover', 'drop']) target.dispatchEvent(new own.DragEvent(type, object({ bubbles: true, cancelable: true, composed: true, dataTransfer: transfer }))); return true })(${JSON.stringify(sent)})`)
    if (dropped !== true) throw new Error(`No element ${ref} on this page now. Run geckit browser read again.`)
    return { dropped: files.length, onto: at.label }
  }
  const download = async (id: number | undefined, ref: string | undefined, folder: string): Promise<object> => {
    const page = targetOf(id)
    const at = await pointAt(id, ref)
    await inRef(id, ref, 'pagePointer', 'click')
    expecting.add(page)
    try {
      const started = page.waitForEvent('download', { timeout: 15_000 }).catch(() => undefined)
      await mouse(page, at, true)
      const file = await started
      if (file === undefined) throw new Error(`Clicking ${at.label} started no download within 15 seconds.`)
      const guid = randomUUID()
      mkdirSync(folder, { recursive: true })
      await file.saveAs(join(folder, guid))
      return { guid, name: file.suggestedFilename(), bytes: statSync(join(folder, guid)).size }
    } finally { expecting.delete(page) }
  }
  const drag = async (id: number | undefined, request: TestBrowserRequest): Promise<object> => {
    const page = targetOf(id)
    let from = await atRef<Center>(id, request.ref, 'pageGrab')
    const target = request.to === undefined ? undefined : await atRef<Center>(id, request.to, 'pageGrab')
    if (target !== undefined) from = await atRef<Center>(id, request.ref, 'pageGrab')
    const to = target ?? { x: from.x + (request.offset?.x ?? 0), y: from.y + (request.offset?.y ?? 0), label: `${request.offset?.x ?? 0},${request.offset?.y ?? 0}` }
    await moveMouse(page, from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(to.x, to.y, { steps: 12 }); pointers.set(page, { x: to.x, y: to.y }); pointerMoved.set(page, Date.now())
    await page.mouse.up()
    return { dragged: from.label, to: to.label }
  }
  const waitFor = async (id: number | undefined, request: TestBrowserRequest): Promise<object> => {
    const page = targetOf(id)
    const started = Date.now()
    const ms = request.ms ?? 15_000
    for (;;) {
      let ok = !request.load || await page.evaluate('document.readyState').then((state) => state === 'complete', () => false)
      if (ok && request.url !== undefined) ok = page.url().includes(request.url)
      const text = request.text ?? request.gone
      if (ok && text !== undefined) {
        const seen = (await Promise.all(page.frames().map((frame) => frame.evaluate<boolean>(call('pageHas', [text])).catch(() => false)))).some((one) => one)
        ok = request.text !== undefined ? seen : !seen
      }
      if (ok) return { waited: Date.now() - started, title: await page.title(), url: page.url() }
      if (Date.now() - started >= ms) throw new Error(`Still not there after ${Math.round(ms / 1000)} s: ${request.text !== undefined ? `no "${request.text}" on the page` : request.gone !== undefined ? `"${request.gone}" is still on the page` : request.url !== undefined ? `the address is ${page.url()}` : 'the page is still loading'}.`)
      await wait(250)
    }
  }
  const answerDialog = async (id: number | undefined, request: TestBrowserRequest): Promise<object> => {
    const page = targetOf(id)
    const open = dialogs.get(page)
    if (open === undefined) throw new Error(`No dialog is open on tab ${id}.`)
    dialogs.delete(page)
    const answered = { type: open.type(), message: open.message() }
    if (request.accept === true) await open.accept(request.text); else await open.dismiss()
    await wait(300)
    return { answered, accept: request.accept === true }
  }
  const allowed = new Map<string, Set<string>>()
  const permission = async (id: number | undefined, request: TestBrowserRequest): Promise<object> => {
    const origin = new URL(targetOf(id).url()).origin
    const kind = request.kind ?? ''
    const setting = request.setting ?? ''
    if (kind === 'clipboard') throw new Error('Firefox has no clipboard permission. A page writes to the clipboard after a click; reading it, Firefox shows its own Paste button, which GeckIt cannot press. Paste with geckit browser paste, and read what a page copied with geckit browser clipboard.')
    if (kind === 'camera' || kind === 'microphone') {
      const file = join(dir, MEDIA_FILE)
      let media: Record<string, string>
      try { media = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string> } catch { media = {} }
      writeFileSync(file, JSON.stringify({ ...media, [kind]: setting }))
      return { kind, setting, origin, profile: label }
    }
    const mine = allowed.get(origin) ?? new Set<string>()
    if (setting === 'ask') {
      allowed.delete(origin)
      await context.clearPermissions()
      for (const [other, kinds] of allowed) await context.grantPermissions([...kinds], { origin: other })
    } else {
      if (setting === 'allow') mine.add(kind); else mine.delete(kind)
      allowed.set(origin, mine)
      await context.grantPermissions([...mine], { origin })
    }
    return { kind, setting, origin, ...(setting === 'ask' ? {} : { others: ['geolocation', 'notifications'].filter((one) => one !== kind && !mine.has(one)) }) }
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
  const viewOpeners: Page[] = []
  let handoff: { readonly key: string; readonly expires: number; heard: number } | undefined
  let handoffPoll: ReturnType<typeof setInterval> | undefined
  let stopVideo: (() => void) | undefined
  const releaseHandoff = (): void => {
    stopVideo?.()
    clearInterval(handoffPoll)
    handoffPoll = undefined
    handoff = undefined
    viewPage = undefined
    viewOpeners.length = 0
  }
  const followed = new WeakSet<Page>()
  /** A popup the sign-in page opens, such as Sign in with Google, is shown in its place until it closes, then the page that opened it again. */
  const follow = (page: Page): void => {
    if (followed.has(page)) return
    followed.add(page)
    page.on('popup', (popup) => {
      if (viewPage !== page) return
      stopVideo?.()
      viewOpeners.push(page)
      viewPage = popup
      follow(popup)
      if (handoff === undefined) void popup.setViewportSize(VIEW_SIZE).then(() => popup.bringToFront()).catch(() => undefined)
      popup.on('close', () => {
        if (viewPage !== popup) return
        let back = viewOpeners.pop()
        while (back !== undefined && back.isClosed()) back = viewOpeners.pop()
        viewPage = back
      })
    })
  }
  const viewTarget = (): Page => { if (viewPage === undefined || viewPage.isClosed()) throw new Error('The sign-in tab is closed. Start the sign-in again.'); return viewPage }
  const streamTab = (endpoint: string | undefined): object => {
    if (handoff === undefined || endpoint === undefined || !/^ws:\/\/127\.0\.0\.1:\d{1,5}\/[a-f0-9]{64}$/.test(endpoint) || stopVideo !== undefined) throw new Error('The tab stream is unavailable.')
    const page = viewTarget()
    const socket = new WebSocket(endpoint, { perMessageDeflate: false, handshakeTimeout: 2000 })
    const stop = (): void => {
      if (stopVideo !== stop) return
      stopVideo = undefined
      page.off('close', stop)
      page.off('framenavigated', checkPage)
      socket.terminate()
      void page.screencast.stop().catch(() => undefined)
    }
    const checkPage = (): void => {
      if (page !== viewPage || !/^https?:\/\//i.test(page.url())) stop()
    }
    stopVideo = stop
    socket.on('error', stop)
    socket.on('close', stop)
    page.on('close', stop)
    page.on('framenavigated', checkPage)
    let pending: Buffer | undefined
    let sending = false
    const send = (): void => {
      checkPage()
      if (sending || pending === undefined || socket.readyState !== WebSocket.OPEN) return
      const data = pending
      pending = undefined
      sending = true
      socket.send(data, (error) => {
        sending = false
        if (error) stop()
        else send()
      })
    }
    socket.once('open', () => {
      if (stopVideo !== stop) return
      void page.screencast.start({ quality: 80, size: { width: 1920, height: 1200 }, onFrame: ({ data }) => {
        pending = data
        send()
      } }).catch(stop)
    })
    return {}
  }
  const viewInput = async (input: ViewInput | undefined): Promise<object> => {
    if (input === undefined) throw new Error('Nothing to do.')
    const page = viewTarget()
    if (input.type === 'click' || input.type === 'move') { await mouse(page, input, input.type === 'click'); pointers.delete(page) }
    else if (input.type === 'wheel') { await page.mouse.move(input.x, input.y); pointers.delete(page); await page.mouse.wheel(0, input.dy) }
    else if (input.type === 'key') await press(page, input.key)
    else if (input.type === 'text') await page.keyboard.insertText(input.text.slice(0, 2000))
    else if (input.type === 'go') {
      const url = addressOf(input.url)
      if (!/^https?:\/\//i.test(url)) throw new Error('Open an http or https address.')
      await navigate(page, url)
    } else if (input.type === 'back') await page.goBack({ waitUntil: 'domcontentloaded' })
    return {}
  }
  const openPage = async (): Promise<Page> => {
    const reusable = spare?.url() === 'about:blank' ? spare : undefined
    if (spare !== undefined) {
      owners.tabs.set(track(spare), null)
      spare = undefined
    }
    const page = reusable ?? await context.newPage()
    owners.tabs.set(track(page), activeOwner)
    return page
  }
  const stop = (): void => {
    closing = true
    setTimeout(() => { void context.close() }, 100)
  }
  const answer = async (request: TestBrowserRequest): Promise<object | PageValue | undefined> => {
    const id = request.tab
    switch (request.cmd) {
      case 'ping': return { version: `Camoufox ${binary.version}` }
      case 'start': {
        const own = [...targets].find(([tab, page]) => owners.tabs.get(tab) === activeOwner && page !== viewPage && !viewOpeners.includes(page))
        const page = own?.[1] ?? await openPage()
        if (activeOwner === null) await page.bringToFront()
        return describe(page, track(page))
      }
      case 'quit':
        if (activeOwner !== null || [...owners.tabs.values()].some((one) => one !== null)) throw new Error('This browser still belongs to conversations. Move their cards to Done to release it.')
        stop()
        return {}
      case 'pages': {
        const visible = [...targets].filter(([, page]) => page !== spare && (handoff === undefined || (page !== viewPage && !viewOpeners.includes(page))))
        return Promise.all(visible.map(async ([tab, page]) => ({
          ...await describe(page, tab),
          window: 0,
          active: false,
          readOnly: owners.tabs.get(tab) !== activeOwner,
          opener: openers.get(tab),
        })))
      }
      case 'open': {
        const page = await openPage()
        try {
          await navigate(page, request.url)
          return await describe(page, track(page))
        } catch (error) {
          await page.close().catch(() => undefined)
          throw error
        }
      }
      case 'go': { const page = targetOf(id); await orDialog(page, navigate(page, request.url)); return describe(page, id as number) }
      case 'close': await targetOf(id).close(); return {}
      case 'text': return inPage(id, 'pageText')
      case 'read': return readAll(id)
      case 'style': return inRef(id, request.ref, 'pageStyle')
      case 'click': return noteOpened(async () => ({ clicked: await moveTo(id, request.ref ?? undefined, 'click', { ...(request.button === undefined ? {} : { button: request.button }), ...(request.count === undefined ? {} : { count: request.count }) }) }))
      case 'hover': return { hovered: await moveTo(id, request.ref ?? undefined, 'hover') }
      case 'type': return typeKeys(id, request.ref ?? undefined, request.text ?? '', false, request.append === true)
      case 'select': await inRef(id, request.ref, 'pagePointer', 'click'); return inRef(id, request.ref, 'pageChoose', request.text ?? '')
      case 'paste': {
        const page = targetOf(id)
        if (request.ref != null) { await inRef(id, request.ref, 'pageField', false); await moveTo(id, request.ref, 'type'); await toEnd(page) } else await inPage(id, 'pagePointer', null, 'key')
        if (await page.evaluate('document.hasFocus()') !== true) await page.bringToFront()
        await page.keyboard.press('ControlOrMeta+V')
        return request.ref == null ? { pasted: true } : inRef(id, request.ref, 'pageTyped')
      }
      case 'upload': return upload(id, request.ref ?? undefined, request.files ?? [])
      case 'drop': return dropFiles(id, request.ref ?? undefined, request.files ?? [])
      case 'download': return download(id, request.ref ?? undefined, request.folder ?? join(root, '.geckit', 'browser', 'downloads'))
      case 'drag': return drag(id, request)
      case 'wait': return waitFor(id, request)
      case 'dialog': return answerDialog(id, request)
      case 'permission': return permission(id, request)
      case 'secret-key': {
        const field = await inRef(id, request.ref, 'pageSecretField') as Record<string, PageValue>
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
        return typeKeys(id, request.ref ?? undefined, await open(request.sealed ?? { epk: '', iv: '', data: '' }, 'geckit-fill-v1'), true)
      }
      case 'scroll': {
        const page = targetOf(id)
        if (request.ref != null) { await moveTo(id, request.ref, 'scroll'); if (request.ref.includes('.')) await inRef(id, request.ref, 'pageScroll'); return evaluate(page, PLACE) }
        await inPage(id, 'pagePointer', null, 'scroll')
        const before = await evaluate(page, PLACE) as { y: number; viewport: number }
        const width = page.viewportSize()?.width ?? VIEW_SIZE.width
        await moveMouse(page, width * (0.35 + Math.random() * 0.3), before.viewport * (0.4 + Math.random() * 0.2))
        const goal = before.y + Math.round((request.by ?? 1) * before.viewport * 0.8)
        let after = before
        for (let turn = 0; turn < 8; turn++) {
          await page.mouse.wheel(0, goal - after.y)
          await wait(250 + Math.random() * 150)
          const now = await evaluate(page, PLACE) as { y: number; viewport: number }
          const stuck = now.y === after.y
          after = now
          if (stuck || Math.abs(goal - now.y) < 40) break
        }
        return after.y === before.y ? inPage(id, 'pageScroll', null, request.by) : after
      }
      case 'key': await inPage(id, 'pagePointer', null, 'key'); return noteOpened(async () => ({ pressed: await press(targetOf(id), request.key ?? '') }))
      case 'eval': {
        const value = await targetOf(id).evaluate<PageValue>(`mw:${request.code ?? 'undefined'}`)
        const { values } = await inPage(id, 'pageSecrets', 'values') as { values: string[] }
        return { value: scrubSecrets(value ?? null, values), type: typeof value }
      }
      case 'shot': return withoutPointer(id, request.pointer, async () => {
        const page = targetOf(id)
        const box = request.ref == null ? undefined : await atRef<Box>(id, request.ref, 'pageBox', 8)
        const clip = box === undefined ? undefined : { x: box.x + box.scrollX, y: box.y + box.scrollY, width: box.width, height: box.height }
        const data = (await page.screenshot({ type: 'png', caret: 'initial', ...(clip === undefined ? {} : { clip }) })).toString('base64')
        const [png] = await paint(page, [{ data, type: 'image/png', clip: box === undefined ? undefined : { x: box.x, y: box.y, width: box.width }, pointer: request.pointer ? pointers.get(page) : undefined }])
        return { png: png ?? data }
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
      case 'handoff-check': {
        if (activeOwner === null) throw new Error('Only the conversation that opened this tab can share it.')
        if (!/^https?:\/\//i.test(targetOf(id).url())) throw new Error('The tab must be showing an HTTP or HTTPS page.')
        return {}
      }
      case 'view-handoff': {
        if (request.key === undefined || request.tab === undefined || request.conversation === undefined) throw new Error('The browser tab is unavailable.')
        if (viewPage !== undefined && !viewPage.isClosed()) throw new Error('This browser already has a live view.')
        const page = targetOf(request.tab)
        if (!/^https?:\/\//i.test(page.url())) throw new Error('The tab must be showing an HTTP or HTTPS page.')
        const now = Date.now()
        handoff = { key: request.key, expires: now + TAB_HANDOFF_TTL, heard: now }
        handoffPoll = setInterval(pick, 40).unref()
        viewOpeners.length = 0
        viewPage = page
        follow(page)
        return {}
      }
      case 'view-open': {
        const current = viewPage?.isClosed() === false ? viewPage : undefined
        const page = current ?? await openPage()
        if (current === undefined) {
          viewOpeners.length = 0
          viewPage = page
          follow(page)
        }
        try {
          await page.setViewportSize(VIEW_SIZE)
          await page.bringToFront()
          if (request.url) await navigate(page, request.url)
          return { ...VIEW_SIZE }
        } catch (error) {
          if (current === undefined) await page.close().catch(() => undefined)
          throw error
        }
      }
      case 'view-video': return streamTab(request.url)
      case 'view-metadata':
      case 'view-frame': {
        const page = viewTarget()
        if (handoff !== undefined && !/^https?:\/\//i.test(page.url())) {
          await page.waitForURL(/^https?:\/\//i, { waitUntil: 'commit', timeout: 5000 })
          if (!/^https?:\/\//i.test(page.url())) throw new Error('The tab must be showing an HTTP or HTTPS page.')
        }
        const viewport = page.viewportSize() ?? await page.evaluate<Pick<ViewFrame, 'width' | 'height'>>('({ width: innerWidth, height: innerHeight })')
        const png = request.cmd === 'view-frame' && handoff !== undefined && request.patches ? await page.screenshot({ type: 'png', scale: 'css', caret: 'hide' }) : undefined
        const pixels = request.cmd === 'view-metadata' ? { jpeg: '' } : png !== undefined && png.length <= 1_000_000
          ? { png: png.toString('base64') }
          : { jpeg: (await page.screenshot({ type: 'jpeg', quality: 60, caret: 'initial' })).toString('base64') }
        const metadata = await page.evaluate<Pick<ViewFrame, 'title' | 'caret' | 'fields' | 'focusedField'>>(FRAME_METADATA)
        const url = page.url()
        if (handoff !== undefined && !/^https?:\/\//i.test(url)) throw new Error('The tab must be showing an HTTP or HTTPS page.')
        return { ...pixels, ...viewport, url, ...metadata, ...pointerShown(page) } satisfies ViewFrame | TabHandoffPngFrame
      }
      case 'view-input': return viewInput(request.input)
      case 'view-close': { const pages = handoff === undefined ? [...viewOpeners, ...(viewPage === undefined ? [] : [viewPage])] : []; releaseHandoff(); for (const page of pages) if (!page.isClosed()) await page.close(); return {} }
      default: throw new Error(`Unknown command ${request.cmd}.`)
    }
  }
  const record = async (request: TestBrowserRequest): Promise<object> => {
    const id = request.tab
    const page = targetOf(id)
    const ms = request.ms ?? 1500
    const slow = request.slow ?? 1
    const box = request.ref == null ? undefined : await inPage(id, 'pageBox', request.ref, 16)
    const at = request.then?.ref === undefined ? undefined : await inPage(id, 'pageCenter', request.then.ref) as Center
    return withoutPointer(id, request.pointer, async () => {
      const frames: { data: string; t: number; pointer: { x: number; y: number } | undefined }[] = []
      if (slow !== 1) await inPage(id, 'pageSlow', slow)
      let polling = true
      const poll = (async () => { while (polling) { const asked = Date.now(); const data = (await page.screenshot({ type: 'jpeg', quality: 85, caret: 'initial' })).toString('base64'); frames.push({ data, t: (asked + Date.now()) / 2, pointer: pointers.get(page) }) } })()
      try {
        await wait(200)
        let start = Date.now()
        let did = 'nothing'
        if (request.pointer && at !== undefined) { await inPage(id, 'pageOverlay', true); await inPage(id, 'pagePointer', request.then?.ref, request.then?.cmd) }
        if (request.then?.cmd === 'click' && at !== undefined) { await moveMouse(page, at.x, at.y); start = Date.now(); await page.mouse.down(); await page.mouse.up(); did = `clicked ${at.label}` }
        if (request.then?.cmd === 'hover' && at !== undefined) { await mouse(page, at, false); start = Date.now(); did = `hovered ${at.label}` }
        if (request.then?.cmd === 'key') did = `pressed ${await press(page, request.then.key ?? '')}`
        await wait(ms * slow)
        polling = false
        await poll
        const before = frames.filter((one) => one.t < start).at(-1)
        const after = frames.filter((one) => one.t >= start && one.t <= start + ms * slow + 100)
        const kept = (before === undefined ? after : [{ ...before, t: start }, ...after]).map((one) => ({ ms: Math.round((one.t - start) / slow), data: one.data, pointer: one.pointer }))
        if (kept.length === 0) throw new Error('Camoufox drew nothing while recording.')
        const step = Math.max(1, Math.ceil(kept.length / 90))
        const picked = kept.filter((_one, index) => index % step === 0 || index === kept.length - 1)
        const painted = await paint(page, picked.map((one) => ({ data: one.data, type: 'image/jpeg', pointer: request.pointer ? one.pointer : undefined })))
        const sent = picked.map((one, index) => ({ ms: one.ms, data: painted[index] ?? one.data }))
        const made = await evaluate(page, `mw:(async () => { ${mediaScript()}; const frames = ${JSON.stringify(sent)}; const box = ${JSON.stringify(box ?? null)} ?? undefined; return { sheet: await geckitMedia.contactSheet(frames, box), gif: await geckitMedia.animation(frames, box) } })()`) as { sheet: string; gif: string }
        return { did, slow, frames: sent, sheet: made.sheet, gif: made.gif, total: kept.length }
      } finally { polling = false; await poll.catch(() => undefined); if (slow !== 1) await inPage(id, 'pageSlow', 1).catch(() => undefined) }
    })
  }
  const release = async (): Promise<void> => {
    if (closing) return
    await Promise.all(pendingTabs.values())
    for (const tab of owners.released()) await targets.get(tab)?.close().catch(() => undefined)
    if (handoff !== undefined && viewPage?.isClosed() !== false && viewOpeners.every((page) => page.isClosed())) releaseHandoff()
    if (spare !== undefined) {
      if (spare.url() !== 'about:blank') {
        owners.tabs.set(track(spare), null)
        spare = undefined
      } else if (Date.now() >= startupUntil) await spare.close()
    }
    if (targets.size === 0) stop()
  }
  let queue: Promise<Reply> = Promise.resolve({ ok: true })
  const expireHandoff = (): void => {
    const now = Date.now()
    if (handoff !== undefined && (now >= handoff.expires || now - handoff.heard >= TAB_HANDOFF_LEASE)) releaseHandoff()
  }
  const handle = (request: object): Promise<Reply> => {
    const run = async (): Promise<Reply> => {
      const asked = request as TestBrowserRequest
      try {
        if (closing) throw new Error(TEST_BROWSER_CLOSING)
        expireHandoff()
        activeOwner = owners.identify(asked.conversation)
        inspecting = ['text', 'read', 'find', 'style', 'wait'].includes(asked.cmd)
        await Promise.all(pendingTabs.values())
        if (asked.cmd.startsWith('view-')) {
          if (asked.cmd === 'view-handoff') {
            if (activeOwner === null) throw new Error('Only the conversation that opened this tab can share it.')
            if (handoff !== undefined) throw new Error('This browser already has a live view.')
          } else {
            if (asked.conversation !== undefined) throw new Error('Only the person signs in, through GeckIt.')
            if (asked.key !== handoff?.key || (handoff !== undefined && asked.cmd === 'view-open')) throw new Error('This browser view belongs to another sign-in.')
            if (handoff !== undefined) handoff.heard = Date.now()
          }
          return await answer(asked).then((result) => ({ ok: true, result }), (error: Error) => ({ ok: false, error: error.message }))
        }
        if (asked.tab !== undefined) {
          const open = dialogs.get(targetOf(asked.tab))
          if (open !== undefined && !['dialog', 'pages', 'close'].includes(asked.cmd)) throw new Error(`Tab ${asked.tab} shows ${open.type() === 'alert' ? 'an' : 'a'} ${open.type()} dialog: "${open.message()}". Answer it first with dialog ${asked.tab} accept or dismiss.`)
        }
        const one = (next: TestBrowserRequest): Promise<Reply> => answer(next).then((result) => {
          const shown = next.tab === undefined ? undefined : targets.get(next.tab)
          const waiting = shown === undefined ? undefined : dialogs.get(shown)
          const noted = waiting !== undefined && next.cmd !== 'dialog' && result !== null && result !== undefined && typeof result === 'object' && !Array.isArray(result)
          return { ok: true, result: noted ? { ...result, dialog: { type: waiting.type(), message: waiting.message(), prompt: waiting.defaultValue() } } : result }
        }, (error: Error) => ({ ok: false, error: error.message }))
        const reply = asked.cmd === 'find' ? await findIn(one, asked.tab, asked.query ?? '') : await one(asked)
        if (asked.conversation !== undefined && browserConversation(asked.conversation, folder)?.done !== false) return { ok: false, error: 'This conversation is Done; its test tabs have been released.' }
        return reply
      } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) } }
      finally { await release(); activeOwner = null; inspecting = false }
    }
    queue = queue.then(run, run)
    return queue
  }
  const pick = serveAsks(folder, (to) => to === process.pid, handle)
  try {
    const watcher = watch(folder, pick)
    watcher.on('error', () => watcher.close())
  } catch { /* The periodic check also picks up commands. */ }
  setInterval(() => { say(); pick(); queue = queue.then(async () => { expireHandoff(); await release(); return { ok: true } }, async () => { expireHandoff(); await release(); return { ok: true } }) }, 1_000)
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
    for (const file of files.filter((one) => one.endsWith('.device'))) {
      const source = join(folder, file)
      let name: string
      try { name = (JSON.parse(readFileSync(source, 'utf8')) as { name: string }).name } catch { continue }
      rmSync(source, { force: true })
      try { tell(source, { ok: true, said: moveToDesktop(name, root) }) } catch (error) { tell(source, { ok: false, error: error instanceof Error ? error.message : String(error) }) }
    }
    serveSecretFiles(folder, files)
    for (const file of files.filter((one) => one.endsWith('.signin'))) {
      const source = join(folder, file)
      let asked: Pick<TabHandoffTarget, 'name'> & Partial<Omit<TabHandoffTarget, 'name'>>
      try { asked = JSON.parse(readFileSync(source, 'utf8')) as typeof asked } catch { continue }
      rmSync(source, { force: true })
      void Promise.resolve().then(() => asked.tab === undefined || asked.conversation === undefined ? signInLink(asked.name) : tabHandoffLink({ name: asked.name, tab: asked.tab, conversation: asked.conversation }))
        .then((link) => tell(source, { ok: true, ...link }), (error: Error) => tell(source, { ok: false, error: error.message }))
    }
    files = files.filter((one) => one.endsWith('.launch'))
    const started = new Set<string>()
    for (const file of files) {
      const source = join(folder, file)
      let name: string
      let previous: number | undefined
      try {
        const launch = JSON.parse(readFileSync(source, 'utf8')) as Pick<TestBrowserRequest, 'conversation'> & { readonly name: string; readonly previous?: number }
        name = launch.name
        if (launch.conversation !== undefined && conversationTestName(launch.conversation, folder, name) !== name) throw new Error('This test browser belongs to another project or account profile.')
        previous = launch.previous
      } catch { rmSync(source, { force: true }); continue }
      const open = profiles(folder).find((one) => one.label === `${TEST_PREFIX}${name}`)
      if (started.has(name) || (open !== undefined && open.pid !== previous)) { rmSync(source, { force: true }); continue }
      if (pending.has(name) || open !== undefined) continue
      const mine = `${source}.${process.pid}`
      try { renameSync(source, mine) } catch { continue }
      rmSync(mine, { force: true })
      if (!validTestName(name)) continue
      started.add(name)
      pending.add(name)
      mkdirSync(testingFolder(root), { recursive: true })
      const log = openSync(testLog(name, root), 'w')
      const child = spawn(executable, [script, 'browser-test', name], { detached: true, stdio: ['ignore', log, log], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
      closeSync(log)
      child.on('error', () => { pending.delete(name) })
      child.on('exit', () => { pending.delete(name) })
      child.unref()
    }
  }
  let watcher: ReturnType<typeof watch> | undefined
  try {
    watcher = watch(folder, pick).unref()
    watcher.on('error', () => watcher?.close())
  } catch { watcher = undefined }
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

/** On a Linux server, has a profile made before the desktop identity show it from its next start; sites see a new device. */
export function moveToDesktop(name: string, root?: string): string {
  if (!isServer()) throw new Error('Only a Linux computer without a screen presents a desktop identity. Here every test browser shows this computer as it is.')
  if (!validTestName(name) || !existsSync(join(profilesFolder(root), name))) throw new Error(`There is no ${TEST_PREFIX}${name}. Make it first with geckit browser profiles create ${name}.`)
  if (profiles().some((one) => one.label === `${TEST_PREFIX}${name}`)) throw new Error(`Close ${TEST_PREFIX}${name} first: geckit browser stop ${TEST_PREFIX}${name}.`)
  if (presentationOf(testingFolder(root), profilesFolder(root), name) === 'desktop') return `${TEST_PREFIX}${name} already presents this server's desktop.`
  setPresentation(testingFolder(root), name, 'desktop')
  return `${TEST_PREFIX}${name} now presents this server's desktop. Sites it is signed in to will see a new device and may ask to confirm the sign-in.`
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
