import { execFile } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { app, ipcMain, Menu, nativeImage, powerMonitor, screen } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'

import type { GeckoBubble, GeckoChoice, GeckoHanded, GeckoState, GeckoView } from '../shared/gecko'
import { getSettings, onSettings, setSettings } from './store'
import { bubbleWindow, closeBubble, closeGecko, fitBubble, geckoWindow, openChat, shownBubble, shownGecko, tellChat } from './windows'

/** The floating gecko: its window while it is switched on and the screen is not locked, what it is told, and what its bubble does. */

let state: GeckoState = { pose: 'asleep', waiting: [], review: false }
/** The waiting one the bubble opened last, so the next time it opens the next. */
let opened: string | undefined
let locked = false
/** Files dropped on the gecko, held while its bubble asks what to do with them. */
let handed: GeckoHanded | undefined

const view = (): GeckoView => ({ pose: state.pose, count: state.waiting.length })

/** Told on every change in the conversations; the panel only when what it shows changes. */
export function tellGecko(next: GeckoState): void {
  const was = view()
  state = next
  const window = shownGecko()
  if (window === undefined) return
  if (was.pose !== next.pose || was.count !== next.waiting.length) window.webContents.send('gecko:state', view())
  if (next.review) window.webContents.send('gecko:hop')
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
    if (polling === undefined) {
      cursor = { x: Number.NaN, y: Number.NaN }
      follow()
    }
  } else closeGecko()
}

const fromGecko = (event: IpcMainEvent): boolean => event.sender === shownGecko()?.webContents
const fromBubble = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => event.sender === shownBubble()?.webContents

/** The bubble opens beside the gecko, asking about what was dropped on it, or about nothing. */
function ask(given: GeckoHanded | undefined): void {
  const window = shownGecko()
  if (window === undefined) return
  // Gone without a choice, as on a click elsewhere, the files are let go of.
  bubbleWindow(window.getBounds()).on('closed', () => {
    if (shownBubble() === undefined) handed = undefined
  })
  handed = given
}

const asked = (): GeckoBubble => ({
  files: (handed?.images.length ?? 0) + (handed?.paths.length ?? 0),
  waiting: state.waiting.length,
  screenshot: process.platform === 'darwin',
})

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

function choose(choice: GeckoChoice): void {
  const given = handed
  handed = undefined
  closeBubble()
  if (choice === 'cancel') return
  if (choice === 'screenshot') {
    if (process.platform === 'darwin') screenshot()
    return
  }
  // Neither the gecko nor its bubble brings the app forward by itself.
  if (process.platform === 'darwin') app.focus({ steal: true })
  if (choice === 'open') openChat()
  else if (choice === 'task') {
    openChat()
    tellChat('chat:task', given ?? { images: [], paths: [] })
  } else {
    // Each time the next one that waits, wrapping round.
    const { waiting } = state
    const next = waiting[(waiting.indexOf(opened ?? '') + 1) % waiting.length]
    opened = next
    openChat(next)
    if (next !== undefined && given !== undefined) tellChat('chat:attach', { id: next, ...given })
  }
}

export function startGecko(): void {
  ipcMain.handle('gecko:state', () => view())
  ipcMain.on('gecko:press', (event) => {
    if (fromGecko(event)) ask(undefined)
  })
  ipcMain.on('gecko:drop', (event, given: GeckoHanded) => {
    if (fromGecko(event) && given.images.length + given.paths.length > 0) ask(given)
  })
  ipcMain.handle('gecko:bubble', (event) => (fromBubble(event) ? asked() : undefined))
  ipcMain.on('gecko:fit', (event, height: number) => {
    if (fromBubble(event)) fitBubble(height)
  })
  ipcMain.on('gecko:choose', (event, choice: GeckoChoice) => {
    if (fromBubble(event)) choose(choice)
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
