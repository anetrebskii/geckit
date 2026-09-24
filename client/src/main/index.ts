import { exec, execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  nativeTheme,
  Notification,
  shell,
  systemPreferences,
} from 'electron'
import log from 'electron-log'
import QRCode from 'qrcode'

import { ANYWHERE, resumeCommand } from '../shared/api'
import { newKey, pairingLink, SIGNAL } from '../shared/pairing'
import type {
  Answered,
  CardAnswer,
  ChatSession,
  ClaudeAccount,
  CorrectRequest,
  GitState,
  PhoneView,
  PlanUsage,
  ShortcutDraft,
  SessionItems,
  SessionMessage,
  SessionMode,
  SessionStatus,
  Settings,
  ShellCommand,
  TranscribeRequest,
} from '../shared/api'
import track from './analytics'
import { correct } from './correct'
import { askOrders, carryOut, saying } from './orders'
import type { Order, Told } from './orders'
import { projectFiles } from './files'
import { fetchGit, gitRepo, gitState } from './git'
import { keepGuide } from './guide'
import { fileAt, fileMenu, isThere, openFile, pickApp } from './open-with'
import { Sessions } from './sessions'
import type { McpChange } from './sessions/mcp'
import { searchClaude } from './sessions/search'
import { removeShortcut, runShortcut, saveShortcut, startShortcuts } from './shortcuts'
import { forgetProject, getSettings, notesStore, onSettings, rememberProject, setSettings } from './store'
import { transcribe } from './transcribe'
import { drawTray, startTray } from './tray'
import { checkForUpdates, restartToUpdate, startUpdates, updateView } from './updates'
import {
  chatListening,
  chatWindow,
  closePeer,
  closeVoice,
  everyWindow,
  openChat,
  panelWindow,
  peerWindow,
  personWindows,
  shownChat,
  shownPeer,
  shownVoice,
  sizeVoice,
  tellChat,
  voiceWindow,
  watchingChat,
} from './windows'

log.transports.file.level = 'info'

const DICTATE = ANYWHERE.dictate
const CORRECT = ANYWHERE.correct
const SPOTLIGHT = ANYWHERE.search
const ORDER = ANYWHERE.orders

let sessions: Sessions | undefined
/** What GECKIT.md was last kept at, so it is only written when the switch moves. */
let guided: boolean | undefined

// GeckIt's own window the dictation was started in, which it goes back into.
let dictatedInto: BrowserWindow | undefined

/** What the capsule that is up was opened for: writing the words down, or doing what they say. */
let heardFor: 'paste' | 'orders' = 'paste'

// A notification nothing holds on to is collected, and a press on it then opens nothing.
const notices = new Set<Notification>()

/* ------------------------------------------------------------------ */
/* What the windows are told                                           */
/* ------------------------------------------------------------------ */

const tell = (channel: string, ...args: unknown[]): void => {
  for (const window of everyWindow()) window.webContents.send(channel, ...args)
  shownPeer()?.webContents.send('peer:tell', channel, args[0])
}

/** What only the Chat window is told, told to the phone as well. */
const tellChats = (channel: string, value: unknown): void => {
  shownChat()?.webContents.send(channel, value)
  shownPeer()?.webContents.send('peer:tell', channel, value)
}

const badge = (): void => {
  if (process.platform !== 'darwin' || sessions === undefined) return
  const wanting = sessions.wanting()
  app.dock?.setBadge(wanting === 0 ? '' : String(wanting))
}

function build(): Sessions {
  return new Sessions({
    notes: notesStore(),
    ...(process.platform === 'darwin' ? { terminal: openTerminal } : {}),
    changed: (all: readonly ChatSession[]) => {
      tellChats('chat:sessions', all)
      badge()
      drawTray()
    },
    items: (items: SessionItems) => tellChats('chat:items', items),
    account: (account: ClaudeAccount) => tellChats('chat:accountChanged', account),
    show: (id: string) => shownChat()?.webContents.send('chat:show', id),
    plan: (plan: PlanUsage) => tellChats('chat:plan', plan),
    notify: (notice) => {
      shownPeer()?.webContents.send('peer:tell', 'chat:notice', notice)
      // In front, the window says it itself; a banner is for when it is not being looked at.
      if (watchingChat()) {
        shownChat()?.webContents.send('chat:notice', notice)
        return
      }
      if (Notification.isSupported()) {
        const note = new Notification({ title: notice.title, subtitle: notice.subtitle, body: notice.body })
        notices.add(note)
        note.on('click', () => {
          notices.delete(note)
          openChat(notice.session)
        })
        note.on('close', () => notices.delete(note))
        note.on('failed', (_event, error) => log.warn(`A notification was not shown: ${error}`))
        note.show()
      }
      // A banner goes by in a few seconds; a question keeps the Dock icon bouncing until it is looked at.
      app.dock?.bounce(notice.asks ? 'critical' : 'informational')
    },
  })
}

/* ------------------------------------------------------------------ */
/* The shortcuts                                                       */
/* ------------------------------------------------------------------ */

function registerDictate(): void {
  const took = globalShortcut.register(DICTATE, () => {
    const open = shownVoice()
    if (open !== undefined) {
      // Pressed again while it is up: that is Stop, which transcribes and pastes.
      open.webContents.send('voice:stop')
      return
    }
    track('dictate')
    heardFor = 'paste'
    dictatedInto = BrowserWindow.getFocusedWindow() ?? undefined
    voiceWindow()
  })
  if (!took) log.warn(`${DICTATE} is taken by something else, dictation has no shortcut`)
}

/** The capsule, for telling the application what to do rather than typing with it. */
function askOutLoud(): void {
  const open = shownVoice()
  if (open !== undefined) {
    open.webContents.send('voice:stop')
    return
  }
  track('orders')
  heardFor = 'orders'
  dictatedInto = undefined
  voiceWindow()
}

function registerOrder(): void {
  const took = globalShortcut.register(ORDER, askOutLoud)
  if (!took) log.warn(`${ORDER} is taken by something else, saying what to do has no shortcut`)
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
    setTimeout(registerDictate, 500)
  }, 300)
}

/**
 * What was said to the application rather than typed with it.
 *
 * The words, the projects and the conversations there are go to the model, and
 * what comes back is orders: start one, say something in another, mark a third.
 * Every one of them is something the person could have done with the mouse, and
 * nothing reads or writes a repository on the way.
 */
/** What was heard, read as orders and waiting for a yes. Nothing runs until then. */
let planned: { readonly orders: readonly Order[]; readonly told: readonly Told[] } | undefined

async function readSaid(said: string): Promise<Answered> {
  const held = sessions
  if (held === undefined) return { ok: false, error: 'Not ready yet.' }
  const projects = getSettings().projects
  const told: Told[] = (await held.list(projects)).map((one) => ({
    id: one.id,
    title: one.title,
    root: one.root,
    state: one.state,
  }))
  const read = await askOrders(said, projects, told)
  if (read.error !== undefined) return { ok: false, error: read.error }
  const { orders, lines } = saying(read.orders, projects, told)
  if (orders.length === 0) return { ok: false, error: `Nothing to do in "${said}"` }
  planned = { orders, told }
  return { ok: true, plan: lines, heard: said }
}

/** The yes: what was read out loud a moment ago is carried out now. */
async function carryOutPlanned(): Promise<Answered> {
  const held = sessions
  const plan = planned
  planned = undefined
  if (held === undefined || plan === undefined) return { ok: false, error: 'There is nothing waiting to be done' }
  const projects = getSettings().projects
  const mode = getSettings().chatMode
  const did = await carryOut(plan.orders, projects, plan.told, {
    // The work goes first and the goal after it: a goal on its own tells Claude to
    // start working toward it, with nothing yet said about what the work is.
    start: async (root, text, goal) => {
      const id = await held.send({ root, mode, text })
      if (goal !== undefined) await held.send({ session: id, root, mode, text: `/goal ${goal}` })
      return id
    },
    say: async (id, text) => {
      const chat = plan.told.find((one) => one.id === id)
      if (chat !== undefined) await held.send({ session: id, root: chat.root, mode, text })
    },
    stop: (id) => held.stop(id),
    mark: (id, status) => held.mark(id, status),
    open: (id) => openChat(id),
    delete: async (id) => {
      unfavorite(await held.remove([id]))
    },
  })
  return did.length === 0 ? { ok: false, error: 'None of that could be done' } : { ok: true, text: did.join('\n') }
}

/**
 * A terminal in the project, with the conversation already being continued.
 *
 * iTerm where it is installed, because that is where somebody who has it is
 * expecting to land, and Terminal otherwise.
 */
/** A conversation that has gone from the list is not kept among the favorites either. */
function unfavorite(ids: readonly string[]): void {
  const favorites = getSettings().favorites
  if (favorites.some((id) => ids.includes(id))) setSettings({ favorites: favorites.filter((id) => !ids.includes(id)) })
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

/* ------------------------------------------------------------------ */
/* What a window may ask                                               */
/* ------------------------------------------------------------------ */

function listChats(root: string | undefined): Promise<ChatSession[]> {
  // Nothing for the project comes over as null, which is not a folder name.
  const where = typeof root === 'string' && root !== '' ? root : undefined
  if (where !== undefined) rememberProject(where)
  return sessions?.list(where === undefined ? getSettings().projects : [where]) ?? Promise.resolve([])
}

async function deleteChats(ids: readonly string[]): Promise<readonly string[]> {
  const gone = (await sessions?.remove(ids)) ?? []
  unfavorite(gone)
  return gone
}

function hideChat(id: string): void {
  sessions?.hide(id)
  unfavorite([id])
}

async function gitFor(root: string, fetched: (state: GitState | undefined) => void): Promise<GitState | undefined> {
  const state = await gitState(root)
  // What is there to pull is only known once the remote is asked, which is slow, so it follows.
  if (state?.upstream !== undefined) {
    void fetchGit(root).then(async (done) => {
      if (done) fetched(await gitState(root))
    })
  }
  return state
}

function wire(): void {
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('update:view', () => updateView())
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.on('update:restart', () => restartToUpdate())
  ipcMain.handle('settings:set', (_event, change: Partial<Settings>) => {
    const settings = setSettings(change)
    return settings
  })

  ipcMain.handle('correct', async (_event, request: CorrectRequest) => {
    track('correct')
    return correct(request)
  })

  ipcMain.handle('transcribe', async (_event, request: TranscribeRequest) => {
    track('transcribe')
    return transcribe(request)
  })

  ipcMain.handle('voice:done', async (_event, request: TranscribeRequest) => {
    const said = await transcribe(request)
    if (!said.ok || said.text === undefined || said.text.trim() === '') return said
    // Said to the application: it is carried out, and the capsule stays up to say what was done.
    if (heardFor === 'orders') return readSaid(said.text)
    pasteBack(said.text)
    return said
  })
  ipcMain.handle('voice:do', () => carryOutPlanned())
  ipcMain.on('voice:size', (_event, height: number) => sizeVoice(height))
  ipcMain.on('voice:orders', () => askOutLoud())
  ipcMain.on('voice:cancel', () => {
    planned = undefined
    closeVoice()
  })

  ipcMain.on('chat:open', () => openChat())
  ipcMain.on('chat:listening', () => chatListening())
  ipcMain.handle('chat:account', () => sessions?.account())
  ipcMain.handle('chat:models', () => sessions?.models())
  ipcMain.handle('chat:plan', () => {
    void sessions?.measure()
    return sessions?.plan()
  })
  ipcMain.handle('chat:git', (event, root: string) =>
    gitFor(root, (state) => {
      if (!event.sender.isDestroyed()) event.sender.send('chat:git', { root, state })
    }),
  )
  ipcMain.handle('chat:addProject', async () => {
    const window = shownChat() ?? chatWindow()
    const picked = await dialog.showOpenDialog(window, {
      title: 'Choose a project',
      properties: ['openDirectory', 'createDirectory'],
    })
    const root = picked.filePaths[0]
    if (picked.canceled || root === undefined) return undefined
    rememberProject(root)
    return root
  })
  ipcMain.handle('chat:forgetProject', (_event, root: string) => {
    forgetProject(root)
  })
  ipcMain.handle('chat:list', (_event, root: string | undefined) => listChats(root))
  ipcMain.handle('chat:search', (_event, asked: string, root: string | undefined) =>
    searchClaude(typeof root === 'string' && root !== '' ? [root] : getSettings().projects, asked),
  )
  // The window asks first, in its own words; by here it has been answered.
  ipcMain.handle('chat:delete', (_event, ids: readonly string[]) => deleteChats(ids))
  ipcMain.handle('chat:items', (_event, id: string) => sessions?.items(id) ?? [])
  ipcMain.handle('chat:links', (_event, id: string) => sessions?.links(id) ?? [])
  ipcMain.handle('chat:send', async (_event, message: SessionMessage) => {
    track('chatSent')
    return sessions?.send(message)
  })
  ipcMain.on('chat:answer', (_event, id: string, card: string, answer: CardAnswer | string) =>
    sessions?.answer(id, card, answer),
  )
  ipcMain.on('chat:stop', (_event, id: string) => sessions?.stop(id))
  ipcMain.handle('chat:unqueue', (_event, id: string, queued: string) => sessions?.unqueue(id, queued))
  ipcMain.on('chat:requeue', (_event, id: string, queued: string, text: string) => sessions?.requeue(id, queued, text))
  ipcMain.handle('chat:delegate', (_event, id: string, queued: string) => sessions?.delegate(id, queued))
  ipcMain.on('chat:mode', (_event, id: string, mode: SessionMode) => sessions?.mode(id, mode))
  ipcMain.on('chat:rename', (_event, id: string, title: string) => sessions?.rename(id, title))
  ipcMain.on('chat:mark', (_event, id: string, status: SessionStatus | null) => sessions?.mark(id, status ?? undefined))
  ipcMain.on('chat:hide', (_event, id: string) => hideChat(id))
  ipcMain.on('chat:watching', (_event, id: string | undefined) =>
    sessions?.watching(watchingChat() ? id : undefined),
  )
  ipcMain.on('chat:read', (_event, id: string) => sessions?.read(id))
  ipcMain.handle('chat:remote', (_event, id: string, on: boolean) => sessions?.remote(id, on) ?? { error: 'Not ready yet.' })
  ipcMain.handle('chat:mcp', (_event, root: string, id: string | undefined, change: McpChange | undefined) =>
    sessions?.mcp(root, id ?? undefined, change ?? undefined),
  )
  ipcMain.handle('chat:browsers', (_event, root: string, id: string | undefined, pick: string | undefined) =>
    sessions?.browsers(root, id ?? undefined, pick ?? undefined),
  )
  ipcMain.on('chat:handOver', (_event, id: string) => sessions?.handOver(id))
  ipcMain.on('chat:terminal', (_event, id: string, root: string) => {
    sessions?.handOver(id)
    openTerminal(root, resumeCommand(id))
  })
  ipcMain.handle('chat:shell', (_event, asked: ShellCommand) => sessions?.shell(asked))
  ipcMain.on('chat:stopShell', (_event, id: string, item: string) => sessions?.stopShell(id, item))
  ipcMain.on('chat:typeShell', (_event, id: string, item: string, text: string) => sessions?.typeShell(id, item, text))
  ipcMain.on('chat:toBackground', (_event, id: string, item: string) => sessions?.toBackground(id, item))
  ipcMain.on('chat:stopTask', (_event, id: string, task: string) => sessions?.stopTask(id, task))
  ipcMain.on('chat:clearTask', (_event, id: string, task: string) => sessions?.clearTask(id, task))
  ipcMain.handle('chat:taskOutput', (_event, id: string, task: string) => sessions?.taskOutput(id, task))
  ipcMain.on('chat:reveal', (_event, root: string, path: string) => shell.showItemInFolder(fileAt(root, path)))
  ipcMain.handle('chat:exists', (_event, root: string, path: string) => isThere(root, path))
  ipcMain.handle('chat:repo', (_event, root: string) => gitRepo(root))
  ipcMain.handle('chat:files', (_event, root: string) => projectFiles(root))
  ipcMain.on('chat:openFile', (_event, root: string, path: string) => openFile(getSettings().openWith, root, path))
  ipcMain.on('chat:fileMenu', (event, root: string, path: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window !== null) fileMenu(window, root, path)
  })
  ipcMain.handle('settings:pickApp', (event) => pickApp(BrowserWindow.fromWebContents(event.sender) ?? panelWindow()))
  ipcMain.on('clipboard:write', (_event, text: string, html: string) => clipboard.write({ text, html }))
  ipcMain.on('open:link', (_event, href: string) => {
    if (/^https?:\/\//.test(href)) void shell.openExternal(href)
  })
  ipcMain.handle('shortcuts:save', (_event, draft: ShortcutDraft) => saveShortcut(draft))
  ipcMain.on('shortcuts:remove', (_event, id: string) => removeShortcut(id))
  ipcMain.handle('shortcuts:run', (_event, id: string) => runShortcut(id, 'hand'))
  ipcMain.handle('phone:state', () => phoneView())
  ipcMain.on('phone:newCode', () => setSettings({ phoneKey: newKey() }))
  // Only the phone's own window may speak for the phone.
  ipcMain.handle('peer:pairing', (event) =>
    event.sender === shownPeer()?.webContents ? { key: getSettings().phoneKey, signal: SIGNAL } : undefined,
  )
  ipcMain.handle('peer:call', async (event, name: string, args: readonly unknown[]) => {
    if (event.sender !== shownPeer()?.webContents) throw new Error('Not the phone')
    const run = Object.hasOwn(PHONE_CALLS, name) ? PHONE_CALLS[name] : undefined
    if (run === undefined) throw new Error(`No such call: ${name}`)
    // What came over as JSON has null where it meant nothing, and every handler here takes undefined for that.
    return (run as (...given: unknown[]) => unknown)(...args.map((one) => (one === null ? undefined : one)))
  })
  ipcMain.handle('peer:screen', async (event) => {
    if (event.sender !== shownPeer()?.webContents) return { error: 'Not the phone' }
    // Asking for the screens is also what puts GeckIt in the Mac's list to allow, and what asks the first time.
    const screens = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
    if (process.platform === 'darwin' && systemPreferences.getMediaAccessStatus('screen') !== 'granted') {
      return {
        error:
          'The Mac has not allowed GeckIt to record its screen. On the Mac: System Settings, Privacy & Security, Screen & System Audio Recording, turn on GeckIt, then quit and reopen it.',
      }
    }
    const first = screens[0]
    return first === undefined ? { error: 'The Mac has no screen to show' } : { id: first.id }
  })
  ipcMain.on('peer:state', (event, count: number, trouble: string | null) => {
    if (event.sender !== shownPeer()?.webContents) return
    phoneState = { count, ...(trouble === null ? {} : { trouble }) }
    void phoneView().then((view) => tell('phone:state', view))
  })

  onSettings((settings) => {
    // The frames, the vibrancy behind the panel and the folder picker are the
    // system's, not the stylesheet's, and they follow this.
    nativeTheme.themeSource = settings.theme
    if (settings.guideClaude !== guided) {
      guided = settings.guideClaude
      void keepGuide(settings.guideClaude)
    }
    keepPhone(settings.phone, settings.phoneKey)
    tell('settings:changed', settings)
    drawTray()
  })
}

/* ------------------------------------------------------------------ */
/* The phone                                                           */
/* ------------------------------------------------------------------ */

type PhoneCall = (...args: never[]) => unknown

let phoneOn = false
let phoneKey = ''
let phoneState: { readonly count: number; readonly trouble?: string } = { count: 0 }
let phoneCode: { readonly key: string; readonly qr: string } | undefined

/** What the phone may ask, less what only makes sense at this Mac: files opened in its apps, its Finder, its terminal. */
function phoneCalls(): Record<string, PhoneCall> {
  const held = (): Sessions | undefined => sessions
  return {
    boot: () => ({ home: homedir(), platform: process.platform }),
    'settings.get': () => getSettings(),
    'settings.set': (change: Partial<Settings>) => setSettings(change),
    'update.view': () => updateView(),
    correct: (request: CorrectRequest) => correct(request),
    transcribe: (request: TranscribeRequest) => transcribe(request),
    'shortcuts.save': (draft: ShortcutDraft) => saveShortcut(draft),
    'shortcuts.remove': (id: string) => removeShortcut(id),
    'shortcuts.run': (id: string) => runShortcut(id, 'hand'),
    'chat.account': () => held()?.account(),
    'chat.models': () => held()?.models(),
    'chat.plan': () => {
      void held()?.measure()
      return held()?.plan()
    },
    'chat.list': (root: string | undefined) => listChats(root),
    'chat.items': (id: string) => held()?.items(id) ?? [],
    'chat.links': (id: string) => held()?.links(id) ?? [],
    'chat.search': (asked: string, root: string | undefined) =>
      searchClaude(typeof root === 'string' && root !== '' ? [root] : getSettings().projects, asked),
    'chat.send': (message: SessionMessage) => held()?.send(message),
    'chat.shell': (asked: ShellCommand) => held()?.shell(asked),
    'chat.stopShell': (id: string, item: string) => held()?.stopShell(id, item),
    'chat.typeShell': (id: string, item: string, text: string) => held()?.typeShell(id, item, text),
    'chat.toBackground': (id: string, item: string) => held()?.toBackground(id, item),
    'chat.stopTask': (id: string, task: string) => held()?.stopTask(id, task),
    'chat.clearTask': (id: string, task: string) => held()?.clearTask(id, task),
    'chat.taskOutput': (id: string, task: string) => held()?.taskOutput(id, task),
    'chat.answer': (id: string, card: string, answer: CardAnswer | string) => held()?.answer(id, card, answer),
    'chat.stop': (id: string) => held()?.stop(id),
    'chat.unqueue': (id: string, queued: string) => held()?.unqueue(id, queued),
    'chat.requeue': (id: string, queued: string, text: string) => held()?.requeue(id, queued, text),
    'chat.delegate': (id: string, queued: string) => held()?.delegate(id, queued),
    'chat.mode': (id: string, mode: SessionMode) => held()?.mode(id, mode),
    'chat.rename': (id: string, title: string) => held()?.rename(id, title),
    'chat.mark': (id: string, status: SessionStatus | undefined) => held()?.mark(id, status),
    'chat.hide': (id: string) => hideChat(id),
    'chat.remove': (ids: readonly string[]) => deleteChats(ids),
    'chat.read': (id: string) => held()?.read(id),
    'chat.remote': (id: string, on: boolean) => held()?.remote(id, on) ?? { error: 'Not ready yet.' },
    'chat.mcp': (root: string, id: string | undefined, change: McpChange | undefined) => held()?.mcp(root, id, change),
    'chat.browsers': (root: string, id: string | undefined, pick: string | undefined) => held()?.browsers(root, id, pick),
    'chat.git': (root: string) => gitFor(root, (state) => shownPeer()?.webContents.send('peer:tell', 'chat:git', { root, state })),
    'chat.exists': (root: string, path: string) => isThere(root, path),
    'chat.repo': (root: string) => gitRepo(root),
    'chat.files': (root: string) => projectFiles(root),
    'chat.forgetProject': (root: string) => forgetProject(root),
  }
}

const PHONE_CALLS = phoneCalls()

/** The phone's window is there while the switch is on, and starts over with a new code. */
function keepPhone(on: boolean, key: string): void {
  if (on === phoneOn && key === phoneKey) return
  phoneOn = on
  phoneKey = key
  closePeer()
  phoneState = { count: 0 }
  if (on) peerWindow()
  void phoneView().then((view) => tell('phone:state', view))
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

/* ------------------------------------------------------------------ */
/* Starting and stopping                                               */
/* ------------------------------------------------------------------ */

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = personWindows()[0]
    if (window === undefined) {
      openChat()
      return
    }
    if (window.isMinimized()) window.restore()
    window.focus()
  })

  void app.whenReady().then(() => {
    if (process.platform === 'darwin') void systemPreferences.askForMediaAccess('microphone')
    // A packaged app carries its icon in the bundle; run from the source, the Dock would show Electron's, so it shows one that says Local.
    if (!app.isPackaged) app.dock?.setIcon(resolve(import.meta.dirname, '../../assets/icon-dev.png'))
    const started = build()
    sessions = started
    nativeTheme.themeSource = getSettings().theme
    guided = getSettings().guideClaude
    void keepGuide(guided)
    keepPhone(getSettings().phone, getSettings().phoneKey)
    wire()
    // The conversations are what this is opened for; correcting and dictating are a shortcut away.
    openChat()
    startShortcuts({
      start: (message) => started.send(message),
      rename: (id, title) => started.rename(id, title),
      busy: (id) => started.busy(id),
    })
    startTray({
      openChat,
      openPanel: () => {
        const panel = panelWindow()
        panel.show()
        panel.focus()
      },
      manage: (edit) => {
        openChat()
        tellChat('chat:shortcuts', edit)
      },
      // Started by hand, it is shown, where a timed run only says when it is done.
      run: (id) =>
        void runShortcut(id, 'hand').then((session) => {
          if (session !== undefined) openChat(session)
        }),
      busy: (id) => started.busy(id),
    })
    registerCorrect()
    registerDictate()
    registerSpotlight()
    registerOrder()
    startUpdates({
      changed: (view) => tell('update:view', view),
      running: () => sessions?.working() ?? [],
      wanted: () => getSettings().autoUpdate,
    })

    app.on('activate', () => {
      if (personWindows().length === 0) openChat()
    })
  })
}

// The tray keeps it running with no window open, and the timed shortcuts with it; Quit is in the tray's menu.
app.on('window-all-closed', () => undefined)

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  sessions?.dispose()
  closePeer()
})
