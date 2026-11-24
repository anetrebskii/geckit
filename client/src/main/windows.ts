import { join } from 'node:path'

import { app, BrowserWindow, screen, shell } from 'electron'

import type { Bounds, ConversationWindow } from '../shared/api'
import { GECKO_SIDE, geckoRing, geckoSide, keptIn } from '../shared/gecko'
import type { GeckoItem, GeckoRing } from '../shared/gecko'
import { getSettings, setSettings } from './store'

/**
 * The windows.
 *
 * The panel is the small one that opens on the shortcut: correcting and
 * dictating, one press from anywhere. Chat is a window of its own, big enough
 * to work in. Voice is the capsule that appears while something is being
 * dictated.
 *
 * The gecko floats on the desktop, showing what the conversations are doing.
 */

const preload = join(import.meta.dirname, '../preload/index.mjs')

const page = (name: string): { url: string } | { file: string } => {
  const dev = process.env['ELECTRON_RENDERER_URL']
  return dev === undefined
    ? { file: join(import.meta.dirname, `../renderer/${name}.html`) }
    : { url: `${dev}/${name}.html` }
}

/** Run from the source, a window says so along its top, so it is never taken for the installed app. */
const LOCAL = `
html::before { content: ''; position: fixed; inset: 0 0 auto; z-index: 2147483647; height: 2px; background: #e8710f; pointer-events: none }
html::after { content: 'Local'; position: fixed; top: 0; left: 50%; z-index: 2147483647; padding: 0 8px 1px; font: 600 10px/14px -apple-system, system-ui, sans-serif; letter-spacing: 0.04em; color: #fff; background: #e8710f; border-radius: 0 0 5px 5px; transform: translateX(-50%); pointer-events: none }
`

const load = (window: BrowserWindow, name: string, query: Record<string, string> = {}): void => {
  const where = page(name)
  const asked = new URLSearchParams(query).toString()
  void ('url' in where ? window.loadURL(asked === '' ? where.url : `${where.url}?${asked}`) : window.loadFile(where.file, { query }))
  if ('url' in where && name !== 'voice' && name !== 'gecko') window.webContents.on('did-finish-load', () => void window.webContents.insertCSS(LOCAL))
}

/** Bounds that are still on a screen this computer has. */
function onScreen(bounds: Bounds | undefined): Partial<Bounds> {
  if (bounds === undefined) return {}
  const fits = screen.getAllDisplays().some((display) => {
    const area = display.workArea
    return (
      bounds.x < area.x + area.width &&
      bounds.x + bounds.width > area.x &&
      bounds.y < area.y + area.height &&
      bounds.y + bounds.height > area.y
    )
  })
  return fits ? bounds : {}
}

const remember = (window: BrowserWindow, which: 'panelBounds' | 'chatBounds' | 'geckoBounds'): void => {
  let soon: NodeJS.Timeout | undefined
  const keep = (): void => {
    clearTimeout(soon)
    soon = setTimeout(() => {
      if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) return
      setSettings({ [which]: window.getBounds() })
    }, 400)
  }
  window.on('resize', keep)
  window.on('move', keep)
}

const outside = (window: BrowserWindow): void => {
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
}

let panel: BrowserWindow | undefined
let chat: BrowserWindow | undefined
let voice: BrowserWindow | undefined
let peer: BrowserWindow | undefined
let gecko: BrowserWindow | undefined

export function panelWindow(): BrowserWindow {
  if (panel !== undefined && !panel.isDestroyed()) return panel
  panel = new BrowserWindow({
    width: 460,
    height: 560,
    minWidth: 380,
    minHeight: 420,
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...(process.platform === 'darwin' ? { vibrancy: 'sidebar' as const } : { backgroundColor: '#f6f6f7' }),
    webPreferences: { preload, sandbox: false },
    ...onScreen(getSettings().panelBounds),
  })
  load(panel, 'panel')
  outside(panel)
  remember(panel, 'panelBounds')
  panel.once('ready-to-show', () => panel?.show())
  panel.on('closed', () => {
    panel = undefined
  })
  return panel
}

// Its listeners are set up after the page loads, so what is said to it before then waits until it says it listens.
let listening = false
let held: [string, unknown][] = []

export function tellChat(channel: string, value: unknown): void {
  const window = shownChat()
  if (window !== undefined && listening) window.webContents.send(channel, value)
  else held.push([channel, value])
}

export function chatListening(): void {
  listening = true
  tellWindows()
  for (const [channel, value] of held) shownChat()?.webContents.send(channel, value)
  held = []
}

export function chatWindow(): BrowserWindow {
  if (chat !== undefined && !chat.isDestroyed()) return chat
  listening = false
  chat = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 760,
    minHeight: 520,
    show: false,
    title: 'Chat',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    // Centred on the bar's 45 px row, with the sidebar button after them as in Slack; places.css keeps the two in step.
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 16, y: 16 } } : {}),
    backgroundColor: '#ffffff',
    webPreferences: { preload, sandbox: false },
    ...onScreen(getSettings().chatBounds),
  })
  load(chat, 'chat')
  outside(chat)
  remember(chat, 'chatBounds')
  chat.once('ready-to-show', () => chat?.show())
  // Brought to the front, it stops flashing in the taskbar for the notice that made it; where nothing flashes, as on the Mac, this does nothing.
  chat.on('focus', () => chat?.flashFrame(false))
  // Only the page itself loading again; a frame inside it, as a file's HTML shown, leaves its listeners where they are.
  chat.webContents.on('did-start-navigation', ({ isMainFrame, isSameDocument }) => {
    if (isMainFrame && !isSameDocument) listening = false
  })
  chat.on('closed', () => {
    chat = undefined
    held = []
  })
  return chat
}

/** Conversations open in windows of their own, by id; only This computer's, since another computer's are read through Chat's own link to it. */
const conversations = new Map<string, BrowserWindow>()
/** Windows closed by GeckIt rather than the person, as Chat going to another computer or the app quitting: they stay remembered and come back. */
const putAway = new WeakSet<BrowserWindow>()
let chatAway = false
app.on('before-quit', () => { for (const window of conversations.values()) putAway.add(window) })

const keptWindows = (): readonly ConversationWindow[] => getSettings().conversationWindows ?? []

const keepWindow = (id: string, bounds?: Bounds): void => {
  const kept = keptWindows()
  const next = kept.some((one) => one.id === id)
    ? kept.map((one) => (one.id === id && bounds !== undefined ? { id, bounds } : one))
    : [...kept, { id, ...(bounds === undefined ? {} : { bounds }) }]
  setSettings({ conversationWindows: next })
}

const tellWindows = (): void => { shownChat()?.webContents.send('chat:windows', [...conversations.keys()]) }

function conversationWindow(id: string, bounds: Bounds | undefined, front: boolean): BrowserWindow {
  const open = conversations.get(id)
  if (open !== undefined && !open.isDestroyed()) return open
  const window = new BrowserWindow({
    width: 760,
    height: 760,
    minWidth: 480,
    minHeight: 420,
    show: false,
    title: 'Chat',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 16, y: 16 } } : {}),
    backgroundColor: '#ffffff',
    webPreferences: { preload, sandbox: false },
    ...onScreen(bounds),
  })
  conversations.set(id, window)
  load(window, 'chat', { conversation: id })
  outside(window)
  window.once('ready-to-show', () => { if (front) window.show(); else window.showInactive() })
  let soon: NodeJS.Timeout | undefined
  const keep = (): void => {
    clearTimeout(soon)
    soon = setTimeout(() => {
      if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) return
      keepWindow(id, window.getBounds())
    }, 400)
  }
  window.on('resize', keep)
  window.on('move', keep)
  window.on('closed', () => {
    clearTimeout(soon)
    if (conversations.get(id) === window) conversations.delete(id)
    if (!putAway.has(window)) setSettings({ conversationWindows: keptWindows().filter((one) => one.id !== id) })
    tellWindows()
  })
  tellWindows()
  return window
}

/** A conversation in a window of its own, or that window brought to the front where it already has one. */
export function openConversationWindow(id: string): void {
  const open = conversations.get(id)
  if (open !== undefined && !open.isDestroyed()) {
    if (open.isMinimized()) open.restore()
    open.show()
    open.focus()
    return
  }
  if (chatAway) return
  const kept = keptWindows().find((one) => one.id === id)
  if (kept === undefined) keepWindow(id)
  conversationWindow(id, kept?.bounds, true)
}

/** Chat shows another computer, or This computer again: the conversation windows close and are remembered, or come back where they were, behind Chat. */
export function chatShowsAway(away: boolean): void {
  chatAway = away
  if (away) {
    for (const window of conversations.values()) {
      putAway.add(window)
      window.close()
    }
    return
  }
  for (const one of keptWindows()) conversationWindow(one.id, one.bounds, false)
}

export const conversationWindows = (): BrowserWindow[] => [...conversations.values()].filter((one) => !one.isDestroyed())

/** The window showing this page: Chat, or a conversation's own. */
export const isChatPage = (contents: Electron.WebContents): boolean =>
  contents === shownChat()?.webContents || conversationWindows().some((one) => one.webContents === contents)

/** Chat and the conversation windows, the one in front first. */
export const chatPages = (): BrowserWindow[] => [...(shownChat() === undefined ? [] : [shownChat() as BrowserWindow]), ...conversationWindows()]

export const openChat = (session?: string): void => {
  const own = session === undefined ? undefined : conversations.get(session)
  if (own !== undefined && !own.isDestroyed()) {
    openConversationWindow(session as string)
    return
  }
  const window = chatWindow()
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  if (session !== undefined) tellChat('chat:show', session)
}

export const shownChat = (): BrowserWindow | undefined =>
  chat !== undefined && !chat.isDestroyed() ? chat : undefined

/** Whether the person is looking at the chat window right now. */
export const watchingChat = (): boolean => shownChat()?.isFocused() === true

/** Chat or a conversation's own window, whichever the person is looking at. */
export const focusedChat = (): BrowserWindow | undefined => chatPages().find((one) => one.isFocused())

/** How far above the bottom of the screen the capsule stands, clear of the Dock and of what is being shown. */
const CAPSULE_FROM_BOTTOM = 24

/** The capsule has been put in the middle as a card, and from then on grows around where it stands, wherever it is moved. */
let voiceInMiddle = false

export function voiceWindow(): BrowserWindow {
  if (voice !== undefined && !voice.isDestroyed()) return voice
  // At the bottom of the screen the pointer is on, out of the way of what is being talked about.
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  voiceInMiddle = false
  voice = new BrowserWindow({
    width: 340,
    height: 92,
    x: Math.round(area.x + (area.width - 340) / 2),
    y: area.y + area.height - 92 - CAPSULE_FROM_BOTTOM,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: { preload, sandbox: false, devTools: false },
  })
  load(voice, 'voice')
  voice.once('ready-to-show', () => {
    voice?.show()
    voice?.webContents.send('voice:start')
  })
  voice.webContents.on('render-process-gone', () => voice?.destroy())
  voice.on('unresponsive', () => voice?.destroy())
  voice.on('closed', () => {
    voice = undefined
  })
  return voice
}

export const shownVoice = (): BrowserWindow | undefined =>
  voice !== undefined && !voice.isDestroyed() ? voice : undefined

/** The capsule a second press should stop; one that never showed or whose page died is thrown away instead, so the press opens a new one. */
export function listeningVoice(): BrowserWindow | undefined {
  const open = shownVoice()
  if (open === undefined) return undefined
  if (open.isVisible() && !open.webContents.isCrashed()) return open
  open.destroy()
  voice = undefined
  return undefined
}

/**
 * The capsule sized to what it holds.
 *
 * As a pill at the bottom it grows upward, its bottom edge staying put. When it
 * becomes a card to read (`middle`), it goes to the middle of its screen once,
 * where all of it can be seen; after that it grows around where it stands, so a
 * card that was moved is not pulled back.
 */
export function sizeVoice(height: number, width?: number, middle = false): void {
  const open = shownVoice()
  if (open === undefined) return
  const was = open.getBounds()
  const next = Math.max(92, Math.min(520, Math.round(height)))
  const wide = width === undefined ? was.width : Math.max(340, Math.min(520, Math.round(width)))
  if (middle && !voiceInMiddle) {
    voiceInMiddle = true
    const area = screen.getDisplayMatching(was).workArea
    open.setBounds({
      x: Math.round(area.x + (area.width - wide) / 2),
      y: Math.round(area.y + (area.height - next) / 2),
      width: wide,
      height: next,
    })
    return
  }
  if (next === was.height && wide === was.width) return
  open.setBounds({
    x: Math.round(was.x - (wide - was.width) / 2),
    y: voiceInMiddle ? Math.round(was.y - (next - was.height) / 2) : was.y - (next - was.height),
    width: wide,
    height: next,
  })
}

export function closeVoice(): void {
  shownVoice()?.close()
  voice = undefined
}

/**
 * The window the phone is answered in, never shown: WebRTC is Chromium's, and
 * Chromium is in a window, not in the main process. Kept from being throttled
 * like a window in the background, since it is always one.
 */
export function peerWindow(): BrowserWindow {
  if (peer !== undefined && !peer.isDestroyed()) return peer
  peer = new BrowserWindow({ show: false, webPreferences: { preload, sandbox: false, backgroundThrottling: false } })
  load(peer, 'peer')
  peer.on('closed', () => {
    peer = undefined
  })
  return peer
}

export const shownPeer = (): BrowserWindow | undefined =>
  peer !== undefined && !peer.isDestroyed() ? peer : undefined

export function closePeer(): void {
  shownPeer()?.destroy()
  peer = undefined
}

/** The gecko floating on the desktop: above other windows and on every desktop, never in the Dock, the taskbar or the window switcher, and never taking the keyboard, so it can sit there while the person types elsewhere. Square, as large as it was made, and on a screen this computer has. */
export function geckoWindow(): BrowserWindow {
  if (gecko !== undefined && !gecko.isDestroyed()) return gecko
  const area = screen.getPrimaryDisplay().workArea
  const kept = getSettings().geckoBounds
  const side = geckoSide(kept?.width ?? GECKO_SIDE)
  const at = onScreen(kept === undefined ? undefined : { ...kept, width: side, height: side })
  gecko = new BrowserWindow({
    width: side,
    height: side,
    x: area.x + area.width - side - 24,
    y: area.y + 24,
    ...at,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    acceptFirstMouse: true,
    alwaysOnTop: true,
    transparent: true,
    roundedCorners: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    // A panel, so a press does not bring GeckIt's other windows forward.
    ...(process.platform === 'darwin' ? { type: 'panel', hiddenInMissionControl: true } : {}),
    webPreferences: { preload, sandbox: false, devTools: false },
  })
  gecko.setAlwaysOnTop(true, 'floating')
  // Without the full screen spaces, which would turn GeckIt into an app with no Dock icon to get there.
  gecko.setVisibleOnAllWorkspaces(true, { skipTransformProcessType: true })
  load(gecko, 'gecko')
  remember(gecko, 'geckoBounds')
  gecko.once('ready-to-show', () => gecko?.showInactive())
  gecko.webContents.on('render-process-gone', () => gecko?.destroy())
  gecko.on('closed', () => {
    gecko = undefined
  })
  return gecko
}

/** The gecko where it was dropped: all of it on the screen it is mostly on. */
export function keepGecko(): void {
  const window = shownGecko()
  if (window === undefined) return
  const at = window.getBounds()
  const kept = keptIn(at, screen.getDisplayMatching(at).workArea)
  if (kept.x !== at.x || kept.y !== at.y) window.setPosition(kept.x, kept.y)
}

/** The gecko made larger or smaller from its top left corner, square, between its smallest and largest, and kept on its screen. */
export function sizeGecko(side: number): void {
  const window = shownGecko()
  if (window === undefined) return
  const at = window.getBounds()
  const next = geckoSide(side)
  if (next === at.width && next === at.height) return
  window.setBounds(keptIn({ x: at.x, y: at.y, width: next, height: next }, screen.getDisplayMatching(at).workArea))
}

export const shownGecko = (): BrowserWindow | undefined =>
  gecko !== undefined && !gecko.isDestroyed() ? gecko : undefined

export function closeGecko(): void {
  dropRing()
  shownGecko()?.destroy()
  gecko = undefined
}

let ring: BrowserWindow | undefined
let ringLoaded = false
/** What the menu shows next, held until its page has loaded. */
let ringNext: { readonly laid: GeckoRing; readonly items: readonly GeckoItem[] } | undefined

/** The gecko's menu, in a transparent window of its own made with the gecko and kept hidden, so a press only places and shows it. It takes the keyboard without bringing the rest of GeckIt forward, and goes as soon as it loses it. */
export function warmRing(): BrowserWindow {
  if (ring !== undefined && !ring.isDestroyed()) return ring
  const made = new BrowserWindow({
    width: 1,
    height: 1,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    ...(process.platform === 'darwin' ? { type: 'panel', hiddenInMissionControl: true } : {}),
    webPreferences: { preload, sandbox: false, devTools: false, backgroundThrottling: false },
  })
  ring = made
  ringLoaded = false
  made.setAlwaysOnTop(true, 'floating')
  made.setVisibleOnAllWorkspaces(true, { skipTransformProcessType: true })
  load(made, 'gecko', { ring: '1' })
  made.webContents.on('did-finish-load', () => {
    ringLoaded = true
    if (ringNext !== undefined) made.webContents.send('gecko:ringShow', ringNext)
  })
  made.on('blur', closeRing)
  made.webContents.on('render-process-gone', () => made.destroy())
  made.on('closed', () => {
    if (ring === made) {
      ring = undefined
      ringNext = undefined
    }
  })
  return made
}

/** The menu laid out round the gecko for its screen; the page draws it and says so, and only then is it shown. */
export function openRing(around: Bounds, items: readonly GeckoItem[]): void {
  const made = warmRing()
  const laid = geckoRing(around, screen.getDisplayMatching(around).workArea, items.length)
  made.setBounds(laid.window)
  ringNext = { laid, items: items.slice(0, laid.items.length) }
  if (ringLoaded) made.webContents.send('gecko:ringShow', ringNext)
}

/** The page has drawn the menu: shown, it takes the keyboard. */
export function revealRing(): void {
  if (ringNext !== undefined) ring?.show()
}

/** The menu's page, shown or not, for telling what it sends. */
export const ringPage = (): BrowserWindow | undefined => (ring !== undefined && !ring.isDestroyed() ? ring : undefined)

export const shownRing = (): BrowserWindow | undefined => (ringPage()?.isVisible() === true ? ring : undefined)

/** Hidden again, ready for the next press, and the gecko stops looking at it. */
export function closeRing(): void {
  const page = ringPage()
  const was = ringNext !== undefined || page?.isVisible() === true
  ringNext = undefined
  if (page === undefined || !was) return
  page.webContents.send('gecko:ringHide')
  page.hide()
  shownGecko()?.webContents.send('gecko:ring', false)
}

/** Gone with the gecko. */
export function dropRing(): void {
  ringPage()?.destroy()
  ring = undefined
  ringNext = undefined
}

/** Every window, for telling them all the same thing. */
export const everyWindow = (): BrowserWindow[] => BrowserWindow.getAllWindows().filter((one) => !one.isDestroyed())

/** The windows a person can see and go back to; the phone's is not one, nor the gecko's or its menu. */
export const personWindows = (): BrowserWindow[] => everyWindow().filter((one) => one !== peer && one !== gecko && one !== ring)
