import { execFile } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { app, ipcMain, Menu, nativeImage, powerMonitor, screen } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'

import { geckoItems } from '../shared/gecko'
import type { GeckoAction, GeckoHanded, GeckoState, GeckoView } from '../shared/gecko'
import { getSettings, onSettings, setSettings } from './store'
import { closeGecko, closeRing, geckoWindow, keepGecko, openChat, openRing, revealRing, ringPage, shownGecko, shownRing, sizeGecko, tellChat, warmRing } from './windows'

/** The floating gecko: its window while it is switched on and the screen is not locked, what it is told, its menu and what each choice does, and the files dropped on it. */

let state: GeckoState = { pose: 'asleep', waiting: [], reached: false }
/** The waiting one the menu opened last, so the next time it opens the next. */
let opened: string | undefined
let locked = false
/** The capsule, opened for a voice task. */
let voiceTask = (): void => undefined

const view = (): GeckoView => ({ pose: state.pose, count: state.waiting.length })

/** Told on every change in the conversations; the panel only when what it shows changes. */
export function tellGecko(next: GeckoState): void {
  const was = view()
  state = next
  const window = shownGecko()
  if (window === undefined) return
  if (was.pose !== next.pose || was.count !== next.waiting.length) window.webContents.send('gecko:state', view())
  if (next.reached) window.webContents.send('gecko:hop')
}

let polling: ReturnType<typeof setTimeout> | undefined
let cursor = { x: Number.NaN, y: Number.NaN }
/** How many looks in a row found the cursor where it was. */
let unmoved = 0

/** The cursor told to the eyes when it moves: ten looks a second while it does, one a second once it has rested two seconds, none without a panel. */
function follow(): void {
  const window = shownGecko()
  if (window === undefined) {
    polling = undefined
    return
  }
  if (window.isVisible()) {
    const at = screen.getCursorScreenPoint()
    const moved = at.x !== cursor.x || at.y !== cursor.y
    unmoved = moved ? 0 : unmoved + 1
    if (moved) {
      cursor = at
      window.webContents.send('gecko:cursor', at)
    }
  }
  polling = setTimeout(follow, window.isVisible() && unmoved < 20 ? 100 : 1000)
}

/** Switched off or with the screen locked, there is no window at all, so nothing of it runs. */
function keep(): void {
  if (getSettings().showGecko && !locked) {
    geckoWindow()
    warmRing()
    if (polling === undefined) {
      cursor = { x: Number.NaN, y: Number.NaN }
      follow()
    }
  } else closeGecko()
}

const fromGecko = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => event.sender === shownGecko()?.webContents

/** What the menu offers now. */
const offered = (): ReturnType<typeof geckoItems> => geckoItems({ waiting: state.waiting.length, screenshot: process.platform === 'darwin' })

/** The menu opens round the gecko, or closes when it is open; the gecko looks at it while it is. */
function toggleRing(): void {
  const window = shownGecko()
  if (window === undefined) return
  if (shownRing() !== undefined) {
    closeRing()
    return
  }
  openRing(window.getBounds(), offered())
  window.webContents.send('gecko:ring', true)
}

/** The gecko listens, in its pose, while the capsule hears a voice task. */
export function geckoListens(on: boolean): void {
  shownGecko()?.webContents.send('gecko:listen', on ? 'start' : 'cancel')
}

/** The longest edge of a picture that is read at full detail, as the chat makes a pasted one. */
const EDGE = 1568

/** A part of the screen the person picks, with the Mac's own crosshair, for the New task form or the form already open; Esc there takes nothing. */
function screenshot(): void {
  const file = join(app.getPath('temp'), `geckit-gecko-${String(Date.now())}.png`)
  execFile('screencapture', ['-i', '-x', file], () => {
    const taken = nativeImage.createFromPath(file)
    void rm(file, { force: true })
    if (taken.isEmpty()) return
    const { width, height } = taken.getSize()
    const scale = Math.min(1, EDGE / Math.max(width, height))
    const image = scale < 1 ? taken.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'best' }) : taken
    app.focus({ steal: true })
    openChat()
    tellChat('chat:screenshot', { media: 'image/png', data: image.toPNG().toString('base64') })
  })
}

/** Each time the next one that waits, wrapping round. */
function nextWaiting(): string | undefined {
  const { waiting } = state
  const next = waiting[(waiting.indexOf(opened ?? '') + 1) % waiting.length]
  opened = next
  return next
}

/** A choice in the menu. The screenshot's crosshair comes at once while the gecko flashes its camera, the voice task opens the capsule; the rest bring GeckIt forward. */
function act(action: GeckoAction): void {
  closeRing()
  if (action === 'screenshot') {
    if (process.platform !== 'darwin') return
    screenshot()
    shownGecko()?.webContents.send('gecko:camera')
    return
  }
  if (action === 'voice') {
    voiceTask()
    return
  }
  if (process.platform === 'darwin') app.focus({ steal: true })
  if (action === 'open') openChat()
  else if (action === 'task') {
    openChat()
    tellChat('chat:task', { images: [], paths: [] })
  } else openChat(nextWaiting())
}

export function startGecko(voice: () => void): void {
  voiceTask = voice
  ipcMain.handle('gecko:state', () => view())
  ipcMain.on('gecko:press', (event) => {
    if (fromGecko(event)) toggleRing()
  })
  ipcMain.on('gecko:resize', (event, side: number) => {
    if (fromGecko(event)) sizeGecko(side)
  })
  ipcMain.on('gecko:moved', (event) => {
    if (fromGecko(event)) keepGecko()
  })
  ipcMain.on('gecko:ringShown', (event) => {
    if (event.sender === ringPage()?.webContents) revealRing()
  })
  ipcMain.on('gecko:act', (event, action: GeckoAction) => {
    if (event.sender === shownRing()?.webContents) act(action)
  })
  ipcMain.on('gecko:ringClose', (event) => {
    if (event.sender === ringPage()?.webContents) closeRing()
  })
  // The item the menu has in focus: the gecko's eyes go to it.
  ipcMain.on('gecko:aim', (event, x: number, y: number) => {
    if (event.sender === shownRing()?.webContents) shownGecko()?.webContents.send('gecko:cursor', { x, y })
  })
  // Caught: GeckIt comes forward on the New task form with the files.
  ipcMain.on('gecko:drop', (event, given: GeckoHanded) => {
    if (!fromGecko(event) || given.images.length + given.paths.length === 0) return
    if (process.platform === 'darwin') app.focus({ steal: true })
    openChat()
    tellChat('chat:task', given)
  })
  ipcMain.on('gecko:menu', (event) => {
    const window = shownGecko()
    if (window === undefined || !fromGecko(event)) return
    Menu.buildFromTemplate([{ label: 'Hide the gecko', click: () => setSettings({ showGecko: false }) }]).popup({ window })
  })
  ipcMain.on('gecko:move', (event, x: number, y: number) => {
    if (fromGecko(event)) shownGecko()?.setPosition(Math.round(x), Math.round(y))
  })
  powerMonitor.on('lock-screen', () => {
    locked = true
    keep()
  })
  powerMonitor.on('unlock-screen', () => {
    locked = false
    keep()
  })
  onSettings(keep)
  keep()
}
