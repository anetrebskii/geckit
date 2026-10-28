import { execFile } from 'node:child_process'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { app, globalShortcut, ipcMain, Menu, nativeImage, powerMonitor, screen } from 'electron'
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron'

import type { TranscribeRequest } from '../shared/api'
import { geckoItems } from '../shared/gecko'
import type { GeckoAction, GeckoBubble, GeckoChoice, GeckoHanded, GeckoRing, GeckoState, GeckoView } from '../shared/gecko'
import { getSettings, onSettings, setSettings } from './store'
import { transcribe } from './transcribe'
import { onSpeechModel, speechModel } from './whisper'
import { bubbleWindow, closeBubble, closeGecko, closeRing, fitBubble, geckoWindow, keepGecko, openChat, ringLayout, ringWindow, shownBubble, shownGecko, shownRing, sizeGecko, tellChat } from './windows'

/** The floating gecko: its window while it is switched on and the screen is not locked, what it is told, its menu and what each choice does, and the bubble for dropped files and notes. */

let state: GeckoState = { pose: 'asleep', waiting: [], review: false }
/** The waiting one the bubble opened last, so the next time it opens the next. */
let opened: string | undefined
let locked = false
/** Files dropped on the gecko, held while its bubble asks what to do with them. */
let handed: GeckoHanded | undefined
/** What the bubble says when it is a note rather than a question. */
let note: string | undefined
/** The gecko is listening for a voice task. */
let listening = false
/** A note that only tells how something goes is shown without taking the keyboard. */
let fitQuietly = false

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
  if (!getSettings().showGecko || locked) heardOut()
  if (getSettings().showGecko && !locked) {
    geckoWindow()
    if (polling === undefined) {
      cursor = { x: Number.NaN, y: Number.NaN }
      follow()
    }
  } else closeGecko()
}

const fromGecko = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => event.sender === shownGecko()?.webContents
const fromBubble = (event: IpcMainEvent | IpcMainInvokeEvent): boolean => event.sender === shownBubble()?.webContents

/** The bubble opens beside the gecko, asking about what was dropped on it, or saying a note. */
function ask(given: GeckoHanded | undefined, said?: string): void {
  const window = shownGecko()
  if (window === undefined) return
  // Gone without a choice, as on a click elsewhere, the files are let go of.
  bubbleWindow(window.getBounds()).on('closed', () => {
    if (shownBubble() !== undefined) return
    handed = undefined
    note = undefined
  })
  handed = given
  note = said
}

const asked = (): GeckoBubble => ({
  files: (handed?.images.length ?? 0) + (handed?.paths.length ?? 0),
  waiting: state.waiting.length,
  ...(note === undefined ? {} : { note }),
})

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
  const made = ringWindow(window.getBounds(), offered().length)
  window.webContents.send('gecko:ring', true)
  made.on('closed', () => {
    if (shownRing() === undefined) shownGecko()?.webContents.send('gecko:ring', false)
  })
}

/** Listening ends: Esc is given back to the other apps. */
function heardOut(): void {
  if (!listening) return
  listening = false
  globalShortcut.unregister('Escape')
}

/** The gecko starts listening, and Esc anywhere stops it without a task, since its window never takes the keyboard. */
function listen(): void {
  const window = shownGecko()
  if (window === undefined) return
  listening = true
  globalShortcut.register('Escape', cancelListening)
  window.webContents.send('gecko:listen', 'start')
}

function cancelListening(): void {
  heardOut()
  shownGecko()?.webContents.send('gecko:listen', 'cancel')
}

/** A new task with what was said, heard on this computer as dictation is; while the speech model downloads, a note says how far it is, and a problem is said in the bubble as the capsule says it. */
async function heard(request: TranscribeRequest | { readonly error: string }): Promise<void> {
  heardOut()
  if ('error' in request) {
    ask(undefined, request.error)
    return
  }
  let downloading = false
  const off = onSpeechModel((model) => {
    if (model.state !== 'downloading') return
    const said = `Downloading the speech model, ${String(Math.round(model.received / 1_000_000))} of ${String(Math.round(model.total / 1_000_000))} MB. It is written down once that is done`
    if (!downloading) {
      downloading = true
      fitQuietly = true
      ask(undefined, said)
    } else note = said
    shownBubble()?.webContents.send('gecko:note', said)
  })
  if (speechModel().state !== 'ready') {
    downloading = true
    fitQuietly = true
    ask(undefined, 'Downloading the speech model. It is written down once that is done')
  }
  const said = await transcribe(request).finally(off)
  if (downloading) closeBubble()
  const text = said.text?.trim() ?? ''
  if (!said.ok || text === '') {
    ask(undefined, said.ok ? 'Nothing was heard' : (said.error ?? 'Nothing was heard'))
    return
  }
  if (process.platform === 'darwin') app.focus({ steal: true })
  openChat()
  tellChat('chat:task', { images: [], paths: [], text })
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

/** A choice in the bubble, about dropped files. */
function choose(choice: GeckoChoice): void {
  const given = handed
  handed = undefined
  note = undefined
  closeBubble()
  if (choice === 'cancel') return
  // Neither the gecko nor its bubble brings the app forward by itself.
  if (process.platform === 'darwin') app.focus({ steal: true })
  if (choice === 'task') {
    openChat()
    tellChat('chat:task', given ?? { images: [], paths: [] })
    return
  }
  const next = nextWaiting()
  openChat(next)
  if (next !== undefined && given !== undefined) tellChat('chat:attach', { id: next, ...given })
}

/** A choice in the menu. The screenshot first has the gecko raise its camera, the voice task has it listen; the rest bring GeckIt forward. */
function act(action: GeckoAction): void {
  closeRing()
  const window = shownGecko()
  if (action === 'hide') {
    setSettings({ showGecko: false })
    return
  }
  if (action === 'screenshot') {
    if (process.platform !== 'darwin') return
    if (window === undefined) screenshot()
    else window.webContents.send('gecko:camera')
    return
  }
  if (action === 'voice') {
    listen()
    return
  }
  if (process.platform === 'darwin') app.focus({ steal: true })
  if (action === 'open') openChat()
  else if (action === 'task') {
    openChat()
    tellChat('chat:task', { images: [], paths: [] })
  } else openChat(nextWaiting())
}

export function startGecko(): void {
  ipcMain.handle('gecko:state', () => view())
  ipcMain.on('gecko:press', (event) => {
    if (fromGecko(event)) toggleRing()
  })
  ipcMain.on('gecko:shoot', (event) => {
    if (fromGecko(event) && process.platform === 'darwin') screenshot()
  })
  ipcMain.handle('gecko:heard', async (event, request: TranscribeRequest | { readonly error: string }) => {
    if (fromGecko(event)) await heard(request)
  })
  ipcMain.on('gecko:resize', (event, side: number) => {
    if (fromGecko(event)) sizeGecko(side)
  })
  ipcMain.on('gecko:moved', (event) => {
    if (fromGecko(event)) keepGecko()
  })
  ipcMain.handle('gecko:ringLayout', (event): { readonly laid: GeckoRing; readonly items: ReturnType<typeof geckoItems> } | undefined => {
    const laid = ringLayout()
    return event.sender === shownRing()?.webContents && laid !== undefined ? { laid, items: offered().slice(0, laid.items.length) } : undefined
  })
  ipcMain.on('gecko:act', (event, action: GeckoAction) => {
    if (event.sender === shownRing()?.webContents) act(action)
  })
  ipcMain.on('gecko:ringClose', (event) => {
    if (event.sender === shownRing()?.webContents) closeRing()
  })
  // The item the menu has in focus: the gecko's eyes go to it.
  ipcMain.on('gecko:aim', (event, x: number, y: number) => {
    if (event.sender === shownRing()?.webContents) shownGecko()?.webContents.send('gecko:cursor', { x, y })
  })
  ipcMain.on('gecko:drop', (event, given: GeckoHanded) => {
    if (fromGecko(event) && given.images.length + given.paths.length > 0) ask(given)
  })
  ipcMain.handle('gecko:bubble', (event) => (fromBubble(event) ? asked() : undefined))
  ipcMain.on('gecko:fit', (event, height: number) => {
    if (!fromBubble(event)) return
    fitBubble(height, fitQuietly)
    fitQuietly = false
  })
  ipcMain.on('gecko:choose', (event, choice: GeckoChoice) => {
    if (fromBubble(event)) choose(choice)
  })
  ipcMain.on('gecko:menu', (event) => {
    const window = shownGecko()
    if (window === undefined || !fromGecko(event)) return
    Menu.buildFromTemplate([
      ...(listening ? [{ label: 'Cancel the voice task', click: cancelListening }, { type: 'separator' as const }] : []),
      { label: 'Hide the gecko', click: () => setSettings({ showGecko: false }) },
    ]).popup({ window })
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
