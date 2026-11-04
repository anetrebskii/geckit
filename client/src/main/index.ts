import './local-data'

import { exec, execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir, hostname } from 'node:os'
import { join, resolve } from 'node:path'
import { app, BrowserWindow, clipboard, desktopCapturer, dialog, globalShortcut, ipcMain, Menu, nativeTheme, Notification, powerMonitor, powerSaveBlocker, screen, safeStorage, shell, systemPreferences } from 'electron'
import log from 'electron-log'
import QRCode from 'qrcode'

import { ANYWHERE, DEFAULT_SETTINGS, assistantsIn, homeOf, noticeWanted, providerOf, shownProjects } from '../shared/api'
import type { Anywhere, Answered, ErrorAnswer, PhoneView, Recording, ScreenControl, ScreenSource, SessionImage, SessionNotice, Settings, TranscribeRequest } from '../shared/api'
import type { LocalAsk } from '../shared/local'
import { newKey, pairingLink, SIGNAL } from '../shared/pairing'
import { isRemote, machineName } from '../shared/hosts'
import { geckoState } from '../shared/gecko'
import type { GeckoPose } from '../shared/gecko'
import { phoneTelegramView } from './telegram-access'
import type { ServiceSnapshot } from '../core/application'
import type { ServiceMethods, ServiceEvents } from '../service/application'
import type { RpcEvent } from '../core/rpc'
import { connectDesktop } from './service-client'
import type { DesktopServiceClient } from './service-client'
import { isVaultEnvelope } from '../core/vault'
import track from './analytics'
import { control } from './control'
import { answerErrors, errorQuestion, followErrors, startErrors, watchErrors, windowError } from './errors'
import { fileAt, fileMenu, openFile, pickApp } from './open-with'
import { extensionFolder } from '../cli/browser'
import { getSettings, onSettings, setSettings, configureSettingsClient } from './store'
import { drawTray, startTray } from './tray'
import { geckoListens, startGecko, tellGecko } from './gecko'
import { checkForUpdates, follow, restartToUpdate, startUpdates, updateView } from './updates'
import { chatListening, chatWindow, closePeer, closeVoice, everyWindow, openChat, panelWindow, peerWindow, personWindows, shownChat, shownPeer, listeningVoice, sizeVoice, tellChat, voiceWindow, watchingChat } from './windows'
import { badgeIcon } from './overlay'

log.transports.file.level = 'info'
const primary = app.requestSingleInstanceLock()
let service: DesktopServiceClient | undefined
let snapshot: ServiceSnapshot | undefined
let currentSettings = DEFAULT_SETTINGS
const settingsListeners = new Set<(settings: Settings) => void>()
const invoke = <K extends keyof ServiceMethods>(method: K, ...args: Parameters<ServiceMethods[K]>): Promise<Awaited<ReturnType<ServiceMethods[K]>>> => {
  if (service === undefined) return Promise.reject(new Error('GeckIt service is not connected.'))
  return service.call(method, ...args)
}
const report = (error: Error): void => { log.warn(error); tellChats('chat:notice', { session: '', title: error.message, subtitle: '', body: '', asks: false }) }
const send = <K extends keyof ServiceMethods>(method: K, ...args: Parameters<ServiceMethods[K]>): void => { void invoke(method, ...args).catch(report) }
configureSettingsClient({
  get: () => currentSettings,
  set: (change) => {
    currentSettings = { ...currentSettings, ...change }
    void invoke('settings:set', change).then(settingsChanged).catch((error: Error) => {
      void invoke('settings:get').then(settingsChanged).catch(report)
      report(error)
    })
    return currentSettings
  },
  on: (listener) => { settingsListeners.add(listener); return () => { settingsListeners.delete(listener) } },
})
startErrors()
watchErrors(() => { for (const window of everyWindow()) window.webContents.send('errors:question', errorQuestion()) })

const DICTATE = ANYWHERE.dictate
const CORRECT = ANYWHERE.correct
const SPOTLIGHT = ANYWHERE.search
const ORDER = ANYWHERE.orders
const RECORD = ANYWHERE.record
const SCREENSHOT = ANYWHERE.screenshot
let dictatedInto: BrowserWindow | undefined
let heardFor: 'paste' | 'orders' | 'task' | 'record' | 'fill' = 'paste'
let formOpen = false
const notices = new Set<Notification>()
let worn = -1
let pose: GeckoPose = 'asleep'
let counted: ServiceSnapshot['sessions'] = []
let phoneOn = false
let phoneKey = ''
let phoneState: { readonly count: number; readonly trouble?: string } = { count: 0 }
let phonesHere = 0
const AWAY_AFTER = 60
let phoneCode: { readonly key: string; readonly qr: string } | undefined
let shownDisplay: string | undefined
let awake: number | undefined
let watched: string | undefined

type NativeValue = object | string | number | boolean | null | undefined
const tell = (channel: string, ...args: NativeValue[]): void => {
  for (const window of everyWindow()) window.webContents.send(channel, ...args)
  shownPeer()?.webContents.send('peer:tell', channel, args[0])
}
const tellChats = (channel: string, value: NativeValue): void => {
  shownChat()?.webContents.send(channel, value)
  shownPeer()?.webContents.send('peer:tell', channel, value)
}
const computerName = (): string => machineName(hostname())
const badge = (): void => {
  const wanting = snapshot?.sessions.filter((one) => one.question !== true && one.manager !== true && (one.state === 'asks' || one.state === 'unread')).length ?? 0
  if (wanting === worn) return
  worn = wanting
  if (process.platform === 'darwin') app.dock?.setBadge(wanting === 0 ? '' : String(wanting))
  if (process.platform === 'win32') shownChat()?.setOverlayIcon(badgeIcon(wanting), wanting === 0 ? '' : `${String(wanting)} waiting for you`)
}
const phoneSettings = (settings: Settings): Settings => ({ ...settings, profile: '', chatProjects: [], chatAll: true })
const keepRecording = (): void => send('voice:keepRecording')
const dropRecording = (): void => send('voice:dropRecording')
const transcribe = (request: TranscribeRequest): Promise<Answered> => invoke('transcribe', request)
const readSaid = (said: string): Promise<Answered> => invoke('orders:read', said)
const readRecorded = (recording: Recording): Promise<Answered> => invoke('orders:recorded', recording)
async function askRecorded(recording: Recording): Promise<Answered> { const answer = await invoke('voice:ask', recording); if (answer.ok) closeVoice(); return answer }
async function carryOutPlanned(): Promise<Answered> { const answer = await invoke('orders:do'); if (answer.open !== undefined) openChat(answer.open); return answer }
const carryOutPlannedForVoice = carryOutPlanned
async function carryOutPlannedCapsule(): Promise<Answered> { const answer = await carryOutPlannedForVoice(); return answer }
async function openLink(href: string): Promise<void> {
  const root = snapshot?.sessions.find((one) => one.id === watched)?.root ?? ''
  const target = await invoke('hosts:forwardLink', root, href)
  if (target.problem !== undefined) { report(new Error(target.problem)); return }
  if (target.moved !== undefined) tellChats('chat:notice', { session: watched ?? '', title: target.moved, subtitle: '', body: '', asks: false })
  await shell.openExternal(target.href)
}



/* ------------------------------------------------------------------ */
/* The shortcuts                                                       */
/* ------------------------------------------------------------------ */

/** The capsule opens: the speech model, where it is not here yet, downloads while the person talks. */
function readyToHear(): void {
  send('speech:fetch')
}


function registerDictate(): void {
  const took = globalShortcut.register(DICTATE, () => {
    const open = listeningVoice()
    if (open !== undefined) {
      // Pressed again while it is up: that is Stop, which transcribes and pastes.
      open.webContents.send('voice:stop')
      return
    }
    track('dictate')
    heardFor = 'paste'
    dictatedInto = BrowserWindow.getFocusedWindow() ?? undefined
    readyToHear()
    voiceWindow()
  })
  if (!took) log.warn(`${DICTATE} is taken by something else, dictation has no shortcut`)
}


/** The capsule, for telling the application what to do rather than typing with it. */
function askOutLoud(): void {
  const open = listeningVoice()
  if (open !== undefined) {
    open.webContents.send('voice:stop')
    return
  }
  track('orders')
  heardFor = 'orders'
  dictatedInto = undefined
  readyToHear()
  voiceWindow()
}


function registerOrder(): void {
  const took = globalShortcut.register(ORDER, askOutLoud)
  if (!took) log.warn(`${ORDER} is taken by something else, saying what to do has no shortcut`)
}


/**
 * The capsule, for showing the screen while talking about it. Pressed again while it records, it stops.
 *
 * With a form open, the recording is for the form: Chat goes behind so what is shown is in front, and comes back with the words and frames in the form.
 */
function recordScreen(): void {
  const open = listeningVoice()
  if (open !== undefined) {
    open.webContents.send('voice:stop')
    return
  }
  track('record')
  const chat = shownChat()
  heardFor = formOpen && chat?.isVisible() === true ? 'fill' : 'record'
  dictatedInto = undefined
  if (heardFor === 'fill') chat?.hide()
  readyToHear()
  // Left out of what is recorded, so it is never in its own frames.
  voiceWindow().setContentProtection(true)
}


/** The capsule, for a voice task from the gecko, which listens with it: what was said opens the New task form. */
function voiceTask(): void {
  const open = listeningVoice()
  if (open !== undefined) {
    open.webContents.send('voice:stop')
    return
  }
  heardFor = 'task'
  dictatedInto = undefined
  readyToHear()
  voiceWindow()
  geckoListens(true)
}


/** The capsule goes; a form's recording brings Chat back to the form, whatever became of it. */
function closeCapsule(): void {
  closeVoice()
  dropRecording()
  geckoListens(false)
  if (heardFor !== 'fill') return
  heardFor = 'record'
  const chat = shownChat()
  chat?.show()
  chat?.focus()
}


function registerRecord(): void {
  const took = globalShortcut.register(RECORD, recordScreen)
  if (!took) log.warn(`${RECORD} is taken by something else, recording the screen has no shortcut`)
}


/** The screen the pointer is on, which is the one being talked about. */
async function screenToRecord(): Promise<ScreenSource> {
  // Asking for the screens is also what puts GeckIt in the Mac's list to allow, and what asks the first time.
  const screens = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
  if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') !== 'granted') return { denied: true }
  const here = String(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id)
  const source = screens.find((one) => one.display_id === here) ?? screens[0]
  return source === undefined ? { error: 'There is no screen to record' } : { id: source.id }
}


/** The screen under the pointer, as a picture for the New task form, or for the form already open. */
async function screenshot(): Promise<void> {
  track('screenshot')
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const width = display.size.width * display.scaleFactor
  const height = display.size.height * display.scaleFactor
  // The size Claude reads a picture at, as the form makes a pasted one.
  const scale = Math.min(1, 1568 / Math.max(width, height))
  const screens = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: Math.round(width * scale), height: Math.round(height * scale) } })
  if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
    void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
    return
  }
  const source = screens.find((one) => one.display_id === String(display.id)) ?? screens[0]
  if (source === undefined || source.thumbnail.isEmpty()) return
  const image: SessionImage = { media: 'image/png', data: source.thumbnail.toPNG().toString('base64') }
  openChat()
  tellChat('chat:screenshot', image)
}


function registerScreenshot(): void {
  const took = globalShortcut.register(SCREENSHOT, () => void screenshot())
  if (!took) log.warn(`${SCREENSHOT} is taken by something else, the screenshot has no shortcut`)
}


function registerCorrect(): void {
  const took = globalShortcut.register(CORRECT, () => {
    track('shortcutPressed')
    const window = panelWindow()
    const text = clipboard.readText('selection') || clipboard.readText()
    const send = (): void => window.webContents.send('panel:text', text)
    if (window.webContents.isLoading()) window.webContents.once('did-finish-load', send)
    else send()
    window.show()
    window.focus()
  })
  if (!took) log.warn(`${CORRECT} is taken by something else, the panel has no shortcut`)
}


function registerSpotlight(): void {
  const took = globalShortcut.register(SPOTLIGHT, () => {
    // Pressed again over the search that is already up, it puts it away, as Spotlight does.
    const again = watchingChat()
    openChat()
    tellChat('chat:spotlight', again)
  })
  if (!took) log.warn(`${SPOTLIGHT} is taken by something else, the search has no shortcut`)
}

const REGISTER = { correct: registerCorrect, dictate: registerDictate, search: registerSpotlight, orders: registerOrder, record: registerRecord, screenshot: registerScreenshot } satisfies { [K in Anywhere]: () => void }
const taken = new Set<Anywhere>()
function keepShortcuts(off: readonly Anywhere[]): void {
  for (const key of Object.keys(ANYWHERE) as Anywhere[]) {
    const wanted = !off.includes(key)
    if (wanted === taken.has(key)) continue
    if (wanted) {
      REGISTER[key]()
      taken.add(key)
    } else {
      globalShortcut.unregister(ANYWHERE[key])
      taken.delete(key)
    }
  }
}


/**
 * The dictation, put where the person was typing.
 *
 * The clipboard and a simulated Cmd+V, because there is no other way to type
 * into somebody else's application. The shortcut is taken down first so the
 * simulated press cannot trigger it again.
 */
function pasteBack(text: string): void {
  clipboard.writeText(text)
  const into = dictatedInto?.isDestroyed() === false ? dictatedInto : undefined
  dictatedInto = undefined
  // Hiding the app would hand the text to whatever is behind it.
  if (into !== undefined) {
    closeVoice()
    into.focus()
    void into.webContents.insertText(text)
    return
  }
  globalShortcut.unregister(DICTATE)
  closeVoice()
  if (process.platform === 'darwin') app.hide()
  setTimeout(() => {
    if (process.platform === 'darwin') {
      exec(`osascript -e 'tell application "System Events" to keystroke "v" using command down'`)
    }
    setTimeout(() => {
      if (!getSettings().anywhereOff.includes('dictate')) registerDictate()
    }, 500)
  }, 300)
}


/** A terminal in the folder with the command typed in and run: iTerm where there is one, Terminal otherwise. */
function openTerminal(root: string, run: string): void {
  if (process.platform !== 'darwin') {
    void shell.openPath(root)
    return
  }
  const command = `cd ${JSON.stringify(root)} && ${run}`
  const iterm = `
    tell application "System Events" to set present to exists application process "iTerm2"
    if present or (exists application "iTerm") then
      tell application "iTerm"
        activate
        set w to (create window with default profile)
        tell current session of w to write text ${JSON.stringify(command)}
      end tell
    else
      tell application "Terminal"
        activate
        do script ${JSON.stringify(command)}
      end tell
    end if`
  // No shell in between, which would put its own values in for the `$` in the command.
  execFile('osascript', ['-e', iterm], (error) => {
    if (error === null) return
    execFile('osascript', ['-e', `tell application "Terminal"\nactivate\ndo script ${JSON.stringify(command)}\nend tell`])
  })
}


/** The phone's window is there while the switch is on, and starts over with a new code. */
function keepPhone(on: boolean, key: string): void {
  if (on === phoneOn && key === phoneKey) return
  phoneOn = on
  phoneKey = key
  closePeer()
  phoneState = { count: 0 }
  phonesHere = 0
  keepPeer()
  if (on && awake === undefined) awake = powerSaveBlocker.start('prevent-app-suspension')
  if (!on && awake !== undefined) {
    powerSaveBlocker.stop(awake)
    awake = undefined
  }
  void phoneView().then((view) => tell('phone:state', view))
}


/** The peer window is there while Phone is on or a link is shared. */
function keepPeer(): void {
  const needed = phoneOn || (snapshot?.shares.length ?? 0) > 0
  if (needed) peerWindow()
  else if (shownPeer() !== undefined) closePeer()
}


/** What Settings shows: the code to scan, and how many phones are on it. */
async function phoneView(): Promise<PhoneView> {
  if (!phoneOn) return { count: 0 }
  const key = getSettings().phoneKey
  if (phoneCode?.key !== key) {
    phoneCode = { key, qr: await QRCode.toDataURL(pairingLink({ key, signal: SIGNAL }), { margin: 1, width: 400 }) }
  }
  return { qr: phoneCode.qr, ...phoneState }
}

function notice(notice: SessionNotice): void {
  if (notice.session === '') { tellChats('chat:notice', notice); return }
  shownPeer()?.webContents.send('peer:tell', 'chat:notice', notice)
  const { flashFor, soundFor } = getSettings()
  const sound = noticeWanted(soundFor, notice.asks)
  if (sound) shell.beep()
  if (process.platform === 'win32' && !watchingChat() && noticeWanted(flashFor, notice.asks)) shownChat()?.flashFrame(true)
  if (phoneOn && phonesHere === 0 && powerMonitor.getSystemIdleState(AWAY_AFTER) !== 'active') send('push:send', notice)
  if (watchingChat()) { shownChat()?.webContents.send('chat:notice', notice); return }
  if (Notification.isSupported()) {
    const request = notice.request
    const note = new Notification({ title: notice.title, subtitle: notice.subtitle, body: notice.body, silent: sound, actions: request === undefined ? [] : [{ type: 'button', text: 'Start all' }] })
    notices.add(note)
    if (request !== undefined) note.on('action', () => send('chat:startAll', request, 'mac'))
    note.on('click', () => { notices.delete(note); openChat(notice.session) })
    note.on('close', () => notices.delete(note))
    note.on('failed', (_event, error) => log.warn(`A notification was not shown: ${error}`))
    note.show()
  }
  app.dock?.bounce(notice.asks ? 'critical' : 'informational')
}

function listChanged(all: ServiceSnapshot['sessions']): void {
  if (snapshot !== undefined) snapshot = { ...snapshot, sessions: all, working: all.filter((one) => !isRemote(one.root) && (one.state === 'working' || one.state === 'asks')).map((one) => one.title) }
  const settings = getSettings()
  const within = (roots: readonly string[]) => all.filter((one) => one.manager !== true && (one.question === true || roots.includes(homeOf(one))))
  const shown = within(shownProjects(settings))
  shownChat()?.webContents.send('chat:sessions', shown)
  shownPeer()?.webContents.send('peer:tell', 'chat:sessions', within(settings.projects))
  const now = shown.filter((one) => assistantsIn(settings).includes(providerOf(one.id)))
  const gecko = geckoState(now, counted)
  counted = now
  pose = gecko.pose
  tellGecko(gecko)
  badge()
  drawTray()
}

function settingsChanged(settings: Settings): void {
  currentSettings = settings
  if (snapshot !== undefined) snapshot = { ...snapshot, settings }
  for (const listener of settingsListeners) listener(settings)
}

function coreEvent(event: RpcEvent<ServiceEvents>): void {
  switch (event.name) {
    case 'chat:sessions': listChanged(event.args[0]); return
    case 'settings:changed': settingsChanged(event.args[0]); return
    case 'chat:notice': notice(event.args[0]); return
    case 'chat:show': openChat(event.args[0]); return
    case 'manager:items': shownChat()?.webContents.send(event.name, event.args[0]); return
    case 'employees:changed':
      if (snapshot !== undefined) snapshot = { ...snapshot, employees: event.args[0] }
      tell(event.name, event.args[0]); drawTray(); return
    case 'peer:shares':
      if (snapshot !== undefined) snapshot = { ...snapshot, shares: event.args[0] }
      keepPeer(); shownPeer()?.webContents.send(event.name, event.args[0]); return
    case 'telegram:view':
      for (const window of everyWindow()) window.webContents.send(event.name, event.args[0])
      shownPeer()?.webContents.send('peer:tell', event.name, phoneTelegramView(event.args[0])); return
    case 'core:terminal': {
      const [root, command, status] = event.args
      openTerminal(root, status === undefined ? command : `${command}; echo $? > ${JSON.stringify(status)}`)
      return
    }
    case 'core:trash': {
      const [id, path] = event.args
      void shell.trashItem(path).then(() => invoke('desktop:completeNative', id), (error: Error) => invoke('desktop:completeNative', id, error.message)).catch(report)
      return
    }
    case 'hosts:prompt': tell(event.name, event.args[0]); if (!watchingChat()) openChat(); return
    default: tell(event.name, event.args[0])
  }
}

function applySnapshot(next: ServiceSnapshot): void {
  snapshot = next
  tellChats('chat:notice', { session: '', title: '', subtitle: '', body: '', asks: false })
  settingsChanged(next.settings)
  listChanged(next.sessions)
  tell('employees:changed', next.employees)
  tell('hosts:changed', next.hosts)
  tell('lineup:changed', next.lineup)
  tell('manager:view', next.manager)
  coreEvent({ name: 'telegram:view', args: [next.telegram] })
  tell('speech:model', next.speech)
  keepPeer()
  if (watched !== undefined) void invoke('chat:items', watched).then((items) => tellChats('chat:items', { id: watched ?? '', items })).catch(report)
}

const CORE_CHANNELS = ["hosts:list", "hosts:known", "hosts:check", "hosts:update", "hosts:forget", "hosts:remove", "hosts:connect", "hosts:reconnect", "hosts:disconnect", "hosts:folders", "hosts:addFolder", "hosts:addFolderSaying", "hosts:prompts", "hosts:answer", "hosts:install", "hosts:trustNewKey", "hosts:running", "hosts:working", "hosts:conversations", "hosts:resumeLine", "employees:list", "employees:save", "employees:archive", "employees:restore", "employees:retryInstructions", "employees:memory", "chat:assignEmployee", "manager:view", "manager:configure", "manager:pause", "manager:resume", "manager:retry", "manager:restart", "telegram:view", "telegram:action", "settings:get", "correct", "transcribe", "speech:model", "speech:fetch", "browser:state", "browser:fetchModel", "browser:deleteModel", "browser:openTest", "browser:deleteTest", "voice:video", "voice:videoPart", "chat:account", "chat:installProvider", "chat:reinstallProvider", "chat:uninstallProvider", "chat:applyProviderUpdate", "chat:checkProviderUpdates", "chat:providerPluginFailures", "chat:models", "chat:plan", "chat:plans", "chat:git", "chat:forgetProject", "chat:rememberProject", "chat:hidden", "chat:bring", "chat:list", "chat:search", "chat:delete", "chat:items", "chat:exportConversation", "chat:continueConversation", "chat:copyConversation", "chat:schedule", "chat:preparedDraft", "chat:savePreparedDraft", "chat:links", "chat:waiting", "chat:cutOff", "chat:proceed", "chat:retry", "chat:send", "chat:answer", "chat:answerRequest", "chat:startAll", "chat:answerTeamRequest", "chat:stop", "lineup:state", "chat:unqueue", "chat:injectQueued", "chat:queuedPicture", "chat:requeue", "chat:reorderQueued", "chat:delegate", "chat:mode", "chat:transport", "chat:rename", "chat:mark", "chat:hide", "chat:keep", "chat:read", "chat:remote", "chat:mcp", "chat:browsers", "chat:handOver", "chat:upload", "chat:shell", "chat:stopShell", "chat:typeShell", "chat:toBackground", "chat:stopTask", "chat:clearTask", "chat:taskOutput", "chat:exists", "chat:file", "chat:repo", "chat:files", "chat:commands", "shortcuts:save", "shortcuts:remove", "shortcuts:run"] as const satisfies readonly (keyof ServiceMethods)[]

function registerCore<K extends typeof CORE_CHANNELS[number]>(channel: K): void {
  ipcMain.handle(channel, (_event, ...args: Parameters<ServiceMethods[K]>) => {
    if (channel === 'correct' || channel === 'transcribe') track(channel)
    if (channel === 'chat:send') track('chatSent')
    return invoke(channel, ...args)
  })
  ipcMain.on(channel, (_event, ...args: Parameters<ServiceMethods[K]>) => send(channel, ...args))
}
function wire(): void {
  for (const channel of CORE_CHANNELS) registerCore(channel)

  ipcMain.handle('manager:inspect', (event, id: string) => {
    if (event.sender !== shownChat()?.webContents) throw new Error('Inspect Manager from the Desktop chat window.')
    return invoke('manager:inspect', id)
  })

  ipcMain.handle('manager:voice-memos', async (event, action?: 'privacy') => {
    if (event.sender !== shownChat()?.webContents) throw new Error('Check Voice Memos from the Desktop chat window.')
    if (action !== undefined && action !== 'privacy') throw new Error('Unsupported Voice Memos connection action.')
    if (action === 'privacy' && process.platform === 'darwin') await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles')
    return invoke('manager:voice-memos')
  })

  ipcMain.handle('update:view', () => updateView())

  ipcMain.handle('update:check', () => checkForUpdates())

  ipcMain.on('update:restart', () => restartToUpdate())

  ipcMain.handle('settings:set', async (_event, change: Partial<Settings>) => {
    const was = getSettings().sendErrors
    const settings = await invoke('settings:set', change)
    if (settings.sendErrors !== was) void followErrors(settings.sendErrors)
    return settings
  })

  ipcMain.handle('errors:question', () => errorQuestion())

  ipcMain.on('errors:answer', (_event, answer: ErrorAnswer) => {
    const was = getSettings().sendErrors
    void answerErrors(answer).then(async () => {
      if (getSettings().sendErrors !== was) await followErrors(true)
      for (const window of everyWindow()) window.webContents.send('errors:question', errorQuestion())
    })
  })

  ipcMain.on('errors:hold', (_event, name: string, message: string, stack: string) => windowError(name, message, stack))


  ipcMain.handle('voice:done', async (_event, request: TranscribeRequest) => {
    const said = await transcribe(request)
    if (!said.ok || said.text === undefined || said.text.trim() === '') return said
    // Said to the application: it is carried out, and the capsule stays up to say what was done.
    if (heardFor === 'orders') return readSaid(said.text)
    if (heardFor === 'task') {
      closeCapsule()
      if (process.platform === 'darwin') app.focus({ steal: true })
      openChat()
      tellChat('chat:task', { images: [], paths: [], text: said.text.trim() })
      return said
    }
    pasteBack(said.text)
    return said
  })

  ipcMain.handle('voice:do', () => carryOutPlannedCapsule())

  ipcMain.on('voice:size', (_event, height: number, width?: number, middle?: boolean) => sizeVoice(height, width, middle))

  ipcMain.handle('voice:mode', () => heardFor)

  ipcMain.handle('voice:screen', () => screenToRecord())

  ipcMain.handle('voice:ask', (_event, recording: Recording) => askRecorded(recording))

  ipcMain.handle('voice:task', (_event, recording: Recording) => readRecorded(recording))

  ipcMain.on('voice:allow', () => {
    closeCapsule()
    void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
  })

  ipcMain.on('voice:orders', () => askOutLoud())

  ipcMain.on('voice:record', () => recordScreen())

  ipcMain.on('voice:form', (_event, open: boolean) => {
    formOpen = open
  })

  // Dictation into the form's field, which keeps the cursor while the capsule listens.
  ipcMain.on('voice:dictate', (event) => {
    if (listeningVoice() !== undefined) return
    track('dictate')
    heardFor = 'paste'
    dictatedInto = BrowserWindow.fromWebContents(event.sender) ?? undefined
    readyToHear()
    voiceWindow()
  })

  // What a form's recording heard and saw, handed to the form.
  ipcMain.on('voice:fill', (_event, recording: Recording) => {
    keepRecording()
    tellChat('chat:recorded', recording)
    closeCapsule()
  })

  ipcMain.on('voice:cancel', () => {
    send('orders:cancel')
    closeCapsule()
  })


  ipcMain.on('chat:open', () => openChat())

  ipcMain.on('chat:listening', () => chatListening())

  ipcMain.handle('chat:addProject', async () => {
    const window = shownChat() ?? chatWindow()
    const picked = await dialog.showOpenDialog(window, {
      title: 'Choose a folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    const root = picked.filePaths[0]
    if (picked.canceled || root === undefined) return undefined
    await invoke('chat:rememberProject', root)
    return root
  })

  ipcMain.on('chat:watching', (_event, id: string | undefined) =>
    (watched = watchingChat() ? id : undefined, send('chat:watching', watched)),
  )

  ipcMain.on('chat:terminal', (_event, id: string, root: string) => {
    if (process.platform !== 'darwin') return
    void invoke('chat:terminalCommand', id, root).then((command) => { if (command?.line !== undefined) openTerminal(command.root, command.line) }).catch(report)
  })
  ipcMain.on('chat:reveal', (_event, root: string, path: string) => {
    if (!isRemote(root)) shell.showItemInFolder(fileAt(root, path))
  })

  ipcMain.on('chat:openFile', (_event, root: string, path: string) => {
    if (!isRemote(root)) openFile(getSettings().openWith, root, path)
  })

  ipcMain.on('chat:fileMenu', (event, root: string, path: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window !== null && !isRemote(root)) fileMenu(window, root, path)
  })

  ipcMain.handle('browser:openFolder', async () => { await shell.openPath(extensionFolder()) })
  ipcMain.handle('settings:pickApp', (event) => pickApp(BrowserWindow.fromWebContents(event.sender) ?? panelWindow()))

  ipcMain.handle('settings:accessibility', () => process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(false))

  ipcMain.on('settings:openAccessibility', () => {
    if (process.platform === 'darwin') void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
  })

  ipcMain.on('clipboard:write', (_event, text: string, html: string) => clipboard.write({ text, html }))

  ipcMain.on('open:link', (_event, href: string) => {
    if (!/^https?:\/\//.test(href)) return
    void openLink(href)
  })

  ipcMain.handle('phone:state', () => phoneView())

  ipcMain.on('phone:newCode', () => setSettings({ phoneKey: newKey() }))

  // Only the phone's own window may speak for the phone.
  ipcMain.handle('peer:pairing', (event) =>
    event.sender === shownPeer()?.webContents && phoneOn ? { key: getSettings().phoneKey, signal: SIGNAL } : undefined,
  )

  ipcMain.handle('peer:shares', (event) => (event.sender === shownPeer()?.webContents ? snapshot?.shares ?? [] : []))

  // A link page may ask only about its own link, and only these three things.
  ipcMain.handle('peer:share', async (event, id: string, name: string, args: readonly NativeValue[]) => {
    if (event.sender !== shownPeer()?.webContents) throw new Error('Not the phone')
    if (name === 'share.about') return invoke('share:about', id)
    if (name === 'share.fetch') return invoke('share:fetch', id, args[0] as LocalAsk)
    if (name === 'share.read') return invoke('share:read', id, typeof args[0] === 'string' ? args[0] : '')
    throw new Error(`No such call: ${name}`)
  })

  ipcMain.handle('peer:call', async (event, name: string, args: readonly NativeValue[]) => {
    if (event.sender !== shownPeer()?.webContents) throw new Error('Not the phone')
    const run = Object.hasOwn(PHONE_CALLS, name) ? PHONE_CALLS[name as keyof typeof PHONE_CALLS] : undefined
    if (run === undefined) throw new Error(`No such call: ${name}`)
    // What came over as JSON has null where it meant nothing, and every handler here takes undefined for that.
    return (run as (...args: never[]) => NativeValue | Promise<NativeValue>)(...args.map((one) => one === null ? undefined : one) as never[])
  })

  ipcMain.handle('peer:screen', async (event) => {
    if (event.sender !== shownPeer()?.webContents) return { error: 'Not the phone' }
    // Asking for the screens is also what puts GeckIt in the Mac's list to allow, and what asks the first time.
    let screens = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
    if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
      return {
        error:
          'The Mac has not allowed GeckIt to record its screen. On the Mac: System Settings, Privacy & Security, Screen & System Audio Recording, turn on GeckIt, then quit and reopen it.',
      }
    }
    // A display that has gone to sleep is not listed at all, so it is woken as a touch of the keyboard would and asked again.
    if (screens.length === 0 && process.platform === 'darwin') {
      execFile('caffeinate', ['-u', '-t', '5'])
      for (let tries = 0; tries < 10 && screens.length === 0; tries++) {
        await new Promise((done) => setTimeout(done, 400))
        screens = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
      }
    }
    const first = screens[0]
    if (first === undefined) return { error: 'The Mac has no screen to show. Its lid may be closed, or it is asleep.' }
    shownDisplay = first.display_id
    return { id: first.id }
  })

  ipcMain.on('peer:state', (event, count: number, trouble: string | null) => {
    if (event.sender !== shownPeer()?.webContents) return
    phoneState = { count, ...(trouble === null ? {} : { trouble }) }
    void phoneView().then((view) => tell('phone:state', view))
  })
  ipcMain.on('hosts:terminal', (_event, id: string, run: string | undefined) => {
    if (process.platform !== 'darwin') return
    void invoke('hosts:terminalCommand', id, run).then((line) => { if (line !== undefined) openTerminal(homedir(), line) }).catch(report)
  })
  onSettings((settings) => {
    nativeTheme.themeSource = settings.theme
    keepPhone(settings.phone, settings.phoneKey)
    keepShortcuts(settings.anywhereOff)
    follow(settings.updateChannel)
    for (const window of everyWindow()) window.webContents.send('settings:changed', settings)
    shownPeer()?.webContents.send('peer:tell', 'settings:changed', phoneSettings(settings))
    if (snapshot !== undefined) listChanged(snapshot.sessions)
    drawTray()
  })
}

const PHONE_CALLS = {
  'manager.view': (...args: Parameters<ServiceMethods['manager:view']>) => invoke('manager:view', ...args),
  'manager.configure': (...args: Parameters<ServiceMethods['manager:configure']>) => invoke('manager:configure', ...args),
  'manager.pause': (...args: Parameters<ServiceMethods['manager:pause']>) => invoke('manager:pause', ...args),
  'manager.resume': (...args: Parameters<ServiceMethods['manager:resume']>) => invoke('manager:resume', ...args),
  'manager.retry': (...args: Parameters<ServiceMethods['manager:retry']>) => invoke('manager:retry', ...args),
  'manager.restart': (...args: Parameters<ServiceMethods['manager:restart']>) => invoke('manager:restart', ...args),
  'telegram.view': (...args: Parameters<ServiceMethods['phone:telegram']>) => invoke('phone:telegram', ...args),
  'telegram.action': (...args: Parameters<ServiceMethods['phone:telegramAction']>) => invoke('phone:telegramAction', ...args),
  'employees.list': (...args: Parameters<ServiceMethods['employees:list']>) => invoke('employees:list', ...args),
  'employees.memory': (...args: Parameters<ServiceMethods['employees:memory']>) => invoke('employees:memory', ...args),
  'employees.save': (...args: Parameters<ServiceMethods['employees:save']>) => invoke('employees:save', ...args),
  'employees.archive': (...args: Parameters<ServiceMethods['employees:archive']>) => invoke('employees:archive', ...args),
  'employees.restore': (...args: Parameters<ServiceMethods['employees:restore']>) => invoke('employees:restore', ...args),
  'employees.retryInstructions': (...args: Parameters<ServiceMethods['employees:retryInstructions']>) => invoke('employees:retryInstructions', ...args),
  'chat.assignEmployee': (...args: Parameters<ServiceMethods['chat:assignEmployee']>) => invoke('chat:assignEmployee', ...args),
  'settings.get': (...args: Parameters<ServiceMethods['phone:settings']>) => invoke('phone:settings', ...args),
  'settings.set': (...args: Parameters<ServiceMethods['settings:set']>) => invoke('settings:set', ...args),
  'correct': (...args: Parameters<ServiceMethods['correct']>) => invoke('correct', ...args),
  'transcribe': (...args: Parameters<ServiceMethods['transcribe']>) => invoke('transcribe', ...args),
  'speech.model': (...args: Parameters<ServiceMethods['speech:model']>) => invoke('speech:model', ...args),
  'speech.fetch': (...args: Parameters<ServiceMethods['speech:fetch']>) => invoke('speech:fetch', ...args),
  'shortcuts.save': (...args: Parameters<ServiceMethods['shortcuts:save']>) => invoke('shortcuts:save', ...args),
  'shortcuts.remove': (...args: Parameters<ServiceMethods['shortcuts:remove']>) => invoke('shortcuts:remove', ...args),
  'shortcuts.run': (...args: Parameters<ServiceMethods['shortcuts:run']>) => invoke('shortcuts:run', ...args),
  'chat.account': (...args: Parameters<ServiceMethods['chat:account']>) => invoke('chat:account', ...args),
  'chat.models': (...args: Parameters<ServiceMethods['chat:models']>) => invoke('chat:models', ...args),
  'chat.plan': (...args: Parameters<ServiceMethods['chat:plan']>) => invoke('chat:plan', ...args),
  'chat.plans': (...args: Parameters<ServiceMethods['chat:plans']>) => invoke('chat:plans', ...args),
  'chat.list': (...args: Parameters<ServiceMethods['phone:list']>) => invoke('phone:list', ...args),
  'chat.hidden': (...args: Parameters<ServiceMethods['chat:hidden']>) => invoke('chat:hidden', ...args),
  'chat.bring': (...args: Parameters<ServiceMethods['chat:bring']>) => invoke('chat:bring', ...args),
  'chat.rememberProject': (...args: Parameters<ServiceMethods['chat:rememberProject']>) => invoke('chat:rememberProject', ...args),
  'chat.items': (...args: Parameters<ServiceMethods['chat:items']>) => invoke('chat:items', ...args),
  'chat.exportConversation': (...args: Parameters<ServiceMethods['chat:exportConversation']>) => invoke('chat:exportConversation', ...args),
  'chat.continueConversation': (...args: Parameters<ServiceMethods['chat:continueConversation']>) => invoke('chat:continueConversation', ...args),
  'chat.copyConversation': (...args: Parameters<ServiceMethods['chat:copyConversation']>) => invoke('chat:copyConversation', ...args),
  'chat.schedule': (...args: Parameters<ServiceMethods['chat:schedule']>) => invoke('chat:schedule', ...args),
  'chat.preparedDraft': (...args: Parameters<ServiceMethods['chat:preparedDraft']>) => invoke('chat:preparedDraft', ...args),
  'chat.savePreparedDraft': (...args: Parameters<ServiceMethods['chat:savePreparedDraft']>) => invoke('chat:savePreparedDraft', ...args),
  'chat.links': (...args: Parameters<ServiceMethods['chat:links']>) => invoke('chat:links', ...args),
  'chat.waiting': (...args: Parameters<ServiceMethods['chat:waiting']>) => invoke('chat:waiting', ...args),
  'chat.search': (...args: Parameters<ServiceMethods['phone:search']>) => invoke('phone:search', ...args),
  'chat.retry': (...args: Parameters<ServiceMethods['chat:retry']>) => invoke('chat:retry', ...args),
  'chat.send': (...args: Parameters<ServiceMethods['chat:send']>) => invoke('chat:send', ...args),
  'chat.shell': (...args: Parameters<ServiceMethods['chat:shell']>) => invoke('chat:shell', ...args),
  'chat.stopShell': (...args: Parameters<ServiceMethods['chat:stopShell']>) => invoke('chat:stopShell', ...args),
  'chat.typeShell': (...args: Parameters<ServiceMethods['chat:typeShell']>) => invoke('chat:typeShell', ...args),
  'chat.toBackground': (...args: Parameters<ServiceMethods['chat:toBackground']>) => invoke('chat:toBackground', ...args),
  'chat.stopTask': (...args: Parameters<ServiceMethods['chat:stopTask']>) => invoke('chat:stopTask', ...args),
  'chat.clearTask': (...args: Parameters<ServiceMethods['chat:clearTask']>) => invoke('chat:clearTask', ...args),
  'chat.taskOutput': (...args: Parameters<ServiceMethods['chat:taskOutput']>) => invoke('chat:taskOutput', ...args),
  'chat.answer': (...args: Parameters<ServiceMethods['chat:answer']>) => invoke('chat:answer', ...args),
  'chat.answerRequest': (...args: Parameters<ServiceMethods['chat:answerRequest']>) => invoke('chat:answerRequest', ...args),
  'chat.startAll': (...args: Parameters<ServiceMethods['chat:startAll']>) => invoke('chat:startAll', ...args),
  'chat.answerTeamRequest': (...args: Parameters<ServiceMethods['chat:answerTeamRequest']>) => invoke('chat:answerTeamRequest', ...args),
  'chat.stop': (...args: Parameters<ServiceMethods['chat:stop']>) => invoke('chat:stop', ...args),
  'lineup.state': (...args: Parameters<ServiceMethods['lineup:state']>) => invoke('lineup:state', ...args),
  'chat.unqueue': (...args: Parameters<ServiceMethods['chat:unqueue']>) => invoke('chat:unqueue', ...args),
  'chat.injectQueued': (...args: Parameters<ServiceMethods['chat:injectQueued']>) => invoke('chat:injectQueued', ...args),
  'chat.queuedPicture': (...args: Parameters<ServiceMethods['chat:queuedPicture']>) => invoke('chat:queuedPicture', ...args),
  'chat.requeue': (...args: Parameters<ServiceMethods['chat:requeue']>) => invoke('chat:requeue', ...args),
  'chat.reorderQueued': (...args: Parameters<ServiceMethods['chat:reorderQueued']>) => invoke('chat:reorderQueued', ...args),
  'chat.delegate': (...args: Parameters<ServiceMethods['chat:delegate']>) => invoke('chat:delegate', ...args),
  'chat.mode': (...args: Parameters<ServiceMethods['chat:mode']>) => invoke('chat:mode', ...args),
  'chat.transport': (...args: Parameters<ServiceMethods['chat:transport']>) => invoke('chat:transport', ...args),
  'chat.rename': (...args: Parameters<ServiceMethods['chat:rename']>) => invoke('chat:rename', ...args),
  'chat.mark': (...args: Parameters<ServiceMethods['chat:mark']>) => invoke('chat:mark', ...args),
  'chat.hide': (...args: Parameters<ServiceMethods['chat:hide']>) => invoke('chat:hide', ...args),
  'chat.keep': (...args: Parameters<ServiceMethods['chat:keep']>) => invoke('chat:keep', ...args),
  'chat.remove': (...args: Parameters<ServiceMethods['chat:delete']>) => invoke('chat:delete', ...args),
  'chat.read': (...args: Parameters<ServiceMethods['chat:read']>) => invoke('chat:read', ...args),
  'chat.remote': (...args: Parameters<ServiceMethods['chat:remote']>) => invoke('chat:remote', ...args),
  'chat.mcp': (...args: Parameters<ServiceMethods['chat:mcp']>) => invoke('chat:mcp', ...args),
  'chat.browsers': (...args: Parameters<ServiceMethods['chat:browsers']>) => invoke('chat:browsers', ...args),
  'chat.git': (...args: Parameters<ServiceMethods['chat:git']>) => invoke('chat:git', ...args),
  'chat.exists': (...args: Parameters<ServiceMethods['chat:exists']>) => invoke('chat:exists', ...args),
  'chat.file': (...args: Parameters<ServiceMethods['chat:file']>) => invoke('chat:file', ...args),
  'local.fetch': (...args: Parameters<ServiceMethods['local:fetch']>) => invoke('local:fetch', ...args),
  'chat.repo': (...args: Parameters<ServiceMethods['chat:repo']>) => invoke('chat:repo', ...args),
  'chat.files': (...args: Parameters<ServiceMethods['chat:files']>) => invoke('chat:files', ...args),
  'chat.commands': (...args: Parameters<ServiceMethods['chat:commands']>) => invoke('chat:commands', ...args),
  'hosts.list': (...args: Parameters<ServiceMethods['hosts:list']>) => invoke('hosts:list', ...args),
  'hosts.connect': (...args: Parameters<ServiceMethods['hosts:connect']>) => invoke('hosts:connect', ...args),
  'hosts.reconnect': (...args: Parameters<ServiceMethods['hosts:reconnect']>) => invoke('hosts:reconnect', ...args),
  'hosts.disconnect': (...args: Parameters<ServiceMethods['hosts:disconnect']>) => invoke('hosts:disconnect', ...args),
  'hosts.folders': (...args: Parameters<ServiceMethods['hosts:folders']>) => invoke('hosts:folders', ...args),
  'hosts.addFolder': (...args: Parameters<ServiceMethods['hosts:addFolder']>) => invoke('hosts:addFolder', ...args),
  'hosts.addFolderSaying': (...args: Parameters<ServiceMethods['hosts:addFolderSaying']>) => invoke('hosts:addFolderSaying', ...args),
  'hosts.running': (...args: Parameters<ServiceMethods['hosts:running']>) => invoke('hosts:running', ...args),
  'hosts.working': (...args: Parameters<ServiceMethods['hosts:working']>) => invoke('hosts:working', ...args),
  'hosts.conversations': (...args: Parameters<ServiceMethods['hosts:conversations']>) => invoke('hosts:conversations', ...args),
  'hosts.prompts': (...args: Parameters<ServiceMethods['hosts:prompts']>) => invoke('hosts:prompts', ...args),
  'hosts.answer': (...args: Parameters<ServiceMethods['hosts:answer']>) => invoke('hosts:answer', ...args),
  'hosts.forwardLink': (...args: Parameters<ServiceMethods['hosts:forwardLink']>) => invoke('hosts:forwardLink', ...args),
  'chat.forgetProject': (...args: Parameters<ServiceMethods['chat:forgetProject']>) => invoke('chat:forgetProject', ...args),
  'chat.folders': (...args: Parameters<ServiceMethods['chat:folders']>) => invoke('chat:folders', ...args),
  'chat.firstAsked': (...args: Parameters<ServiceMethods['chat:firstAsked']>) => invoke('chat:firstAsked', ...args),
  'orders.read': (...args: Parameters<ServiceMethods['orders:read']>) => invoke('orders:read', ...args),
  'recording.start': (...args: Parameters<ServiceMethods['recording:start']>) => invoke('recording:start', ...args),
  'recording.part': (...args: Parameters<ServiceMethods['recording:part']>) => invoke('recording:part', ...args),
  'recording.keep': (...args: Parameters<ServiceMethods['recording:keep']>) => invoke('recording:keep', ...args),
  'recording.drop': (...args: Parameters<ServiceMethods['recording:drop']>) => invoke('recording:drop', ...args),
  'push.token': (...args: Parameters<ServiceMethods['push:token']>) => invoke('push:token', ...args),
  boot: () => ({ home: homedir(), platform: process.platform, name: computerName() }),
  'update.view': () => updateView(),
  'mac.version': () => app.getVersion(),
  'screen.control': (order: ScreenControl) => control(order, shownDisplay),
  'push.here': (count: number) => { phonesHere = count },
  'orders.do': () => invoke('orders:do'),
}

async function migrateSecrets(): Promise<void> {
  const hello = await invoke('desktop:hello')
  if (hello.protocol !== 1) throw new Error('This GeckIt service version is incompatible. Stop the service, then open GeckIt again.')
  if (!hello.migration.available) return
  const hosts: { id: string; password: string }[] = []
  if (hello.migration.hosts.length > 0) {
    const kept = JSON.parse(readFileSync(join(app.getPath('userData'), 'hosts', 'secrets.json'), 'utf8')) as { [id: string]: string }
    for (const id of hello.migration.hosts) {
      const text = kept[id]
      if (text !== undefined) hosts.push({ id, password: safeStorage.decryptString(Buffer.from(text, 'base64')) })
    }
  }
  const sealed = hello.migration.telegram ? readFileSync(join(app.getPath('userData'), 'manager-telegram.sealed')) : undefined
  const telegram = sealed !== undefined && !isVaultEnvelope(sealed) ? safeStorage.decryptString(sealed) : undefined
  if (hosts.length > 0 || telegram !== undefined) await invoke('desktop:migrateSecrets', { hosts, ...(telegram === undefined ? {} : { telegram }) })
}

if (!primary) app.quit()
else {
  app.on('second-instance', () => {
    const window = personWindows()[0]
    if (window === undefined) { openChat(); return }
    if (window.isMinimized()) window.restore()
    window.focus()
  })
  void app.whenReady().then(async () => {
    service = await connectDesktop({
      directory: app.getPath('userData'),
      version: app.getVersion(),
      executable: process.execPath,
      script: join(app.getAppPath(), 'out', 'service', 'service.js'),
      args: process.env['GECKIT_DATA'] === undefined ? ['--app-home', app.getAppPath(), ...(!app.isPackaged ? ['--source'] : [])] : [],
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        GECKIT_WHISPER_CLI: app.isPackaged ? join(process.resourcesPath, 'whisper', process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli') : join(app.getAppPath(), 'whisper', 'bin', `${process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform}-${process.arch}`, process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli'),
        GECKIT_LLAMA_SERVER: app.isPackaged ? join(process.resourcesPath, 'llama', process.platform === 'win32' ? 'llama-server.exe' : 'llama-server') : join(app.getAppPath(), 'llama', 'bin', `${process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform}-${process.arch}`, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server'),
      },
      onEvent: coreEvent,
      onConnect: applySnapshot,
      onDisconnect: (error) => tellChats('chat:notice', { session: '', title: error?.message ?? 'GeckIt service disconnected. Reconnecting...', subtitle: '', body: '', asks: false }),
    })
    applySnapshot(service.snapshot)
    try { await migrateSecrets() } catch { log.warn('Could not migrate saved credentials to the service') }
    if (process.platform !== 'darwin') Menu.setApplicationMenu(null)
    if (!app.isPackaged) app.dock?.setIcon(resolve(import.meta.dirname, '../../assets/icon-dev.png'))
    app.on('browser-window-created', (_event, window) => { window.on('show', () => { if (window === shownChat()) { worn = -1; badge() } }) })
    wire()
    nativeTheme.themeSource = getSettings().theme
    keepPhone(getSettings().phone, getSettings().phoneKey)
    openChat()
    startTray({
      openChat,
      openPanel: () => { const panel = panelWindow(); panel.show(); panel.focus() },
      manage: (edit) => { openChat(); tellChat('chat:shortcuts', edit) },
      run: (id) => { void invoke('shortcuts:run', id).then((session) => { if (session !== undefined) openChat(session) }).catch(report) },
      busy: (id) => snapshot?.sessions.some((one) => one.id === id && (one.state === 'working' || one.state === 'asks')) ?? false,
      employees: () => snapshot?.employees.employees ?? [],
      record: recordScreen,
      pose: () => pose,
    })
    startGecko(voiceTask)
    keepShortcuts(getSettings().anywhereOff)
    powerMonitor.on('resume', () => send('core:resume'))
    startUpdates({ changed: (view) => tell('update:view', view), channel: getSettings().updateChannel, running: () => snapshot?.working ?? [], wanted: () => getSettings().autoUpdate, beforeRestart: async () => { await service?.shutdownForUpdate() } })
    app.on('activate', () => { if (personWindows().length === 0) openChat() })
  }).catch((error: Error) => { log.error(error); dialog.showErrorBox('Could not connect to GeckIt service', error.message); app.quit() })
}

app.on('window-all-closed', () => undefined)
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  service?.close()
  closePeer()
})
