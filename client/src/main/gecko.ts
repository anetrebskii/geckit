import { app, ipcMain, Menu, powerMonitor, screen } from 'electron'
import type { IpcMainEvent } from 'electron'

import type { GeckoState, GeckoView } from '../shared/gecko'
import { getSettings, onSettings, setSettings } from './store'
import { closeGecko, geckoWindow, openChat, shownGecko } from './windows'

/** The floating gecko: its window while it is switched on and the screen is not locked, what it is told, and what a press on it does. */

let state: GeckoState = { pose: 'asleep', waiting: [], review: false }
/** The one a press opened last, so pressing again opens the next. */
let opened: string | undefined
let locked = false

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

function press(): void {
  // It never takes the keyboard, so a press does not bring the app forward by itself.
  if (process.platform === 'darwin') app.focus({ steal: true })
  const { waiting } = state
  const next = waiting[(waiting.indexOf(opened ?? '') + 1) % waiting.length]
  opened = next
  openChat(next)
}

export function startGecko(): void {
  ipcMain.handle('gecko:state', () => view())
  ipcMain.on('gecko:press', (event) => {
    if (fromGecko(event)) press()
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
