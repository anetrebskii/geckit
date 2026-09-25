import { join } from 'node:path'

import { BrowserWindow, screen, shell } from 'electron'

import type { Bounds } from '../shared/api'
import { getSettings, setSettings } from './store'

/**
 * The three windows.
 *
 * The panel is the small one that opens on the shortcut: correcting and
 * dictating, one press from anywhere. Chat is a window of its own, big enough
 * to work in. Voice is the capsule that appears while something is being
 * dictated.
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

const load = (window: BrowserWindow, name: string): void => {
  const where = page(name)
  void ('url' in where ? window.loadURL(where.url) : window.loadFile(where.file))
  if ('url' in where && name !== 'voice') window.webContents.on('did-finish-load', () => void window.webContents.insertCSS(LOCAL))
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

const remember = (window: BrowserWindow, which: 'panelBounds' | 'chatBounds'): void => {
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
    backgroundColor: '#ffffff',
    webPreferences: { preload, sandbox: false },
    ...onScreen(getSettings().chatBounds),
  })
  load(chat, 'chat')
  outside(chat)
  remember(chat, 'chatBounds')
  chat.once('ready-to-show', () => chat?.show())
  chat.webContents.on('did-start-loading', () => {
    listening = false
  })
  chat.on('closed', () => {
    chat = undefined
    held = []
  })
  return chat
}

export const openChat = (session?: string): void => {
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

export function voiceWindow(): BrowserWindow {
  if (voice !== undefined && !voice.isDestroyed()) return voice
  voice = new BrowserWindow({
    width: 340,
    height: 92,
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

/** The capsule grows to hold what it is asking about, around the middle it already stands on. */
export function sizeVoice(height: number): void {
  const open = shownVoice()
  if (open === undefined) return
  const was = open.getBounds()
  const next = Math.max(92, Math.min(520, Math.round(height)))
  if (next === was.height) return
  open.setBounds({ ...was, y: Math.round(was.y - (next - was.height) / 2), height: next })
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

/** Every window, for telling them all the same thing. */
export const everyWindow = (): BrowserWindow[] => BrowserWindow.getAllWindows().filter((one) => !one.isDestroyed())

/** The windows a person can see and go back to; the phone's is not one. */
export const personWindows = (): BrowserWindow[] => everyWindow().filter((one) => one !== peer)
