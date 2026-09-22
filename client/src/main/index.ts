import { exec, execFile } from 'node:child_process'
import { resolve } from 'node:path'

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  nativeTheme,
  Notification,
  shell,
  systemPreferences,
} from 'electron'
import log from 'electron-log'

import { ANYWHERE, resumeCommand } from '../shared/api'
import type {
  CardAnswer,
  ChatSession,
  ClaudeAccount,
  CorrectRequest,
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
import { projectFiles } from './files'
import { fetchGit, gitState } from './git'
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
  closeVoice,
  everyWindow,
  openChat,
  panelWindow,
  shownChat,
  shownVoice,
  tellChat,
  voiceWindow,
  watchingChat,
} from './windows'

log.transports.file.level = 'info'

const DICTATE = ANYWHERE.dictate
const CORRECT = ANYWHERE.correct
const SPOTLIGHT = ANYWHERE.search

let sessions: Sessions | undefined

// GeckIt's own window the dictation was started in, which it goes back into.
let dictatedInto: BrowserWindow | undefined

// A notification nothing holds on to is collected, and a press on it then opens nothing.
const notices = new Set<Notification>()

/* ------------------------------------------------------------------ */
/* What the windows are told                                           */
/* ------------------------------------------------------------------ */

const tell = (channel: string, ...args: unknown[]): void => {
  for (const window of everyWindow()) window.webContents.send(channel, ...args)
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
      shownChat()?.webContents.send('chat:sessions', all)
      badge()
      drawTray()
    },
    items: (items: SessionItems) => shownChat()?.webContents.send('chat:items', items),
    account: (account: ClaudeAccount) => shownChat()?.webContents.send('chat:accountChanged', account),
    plan: (plan: PlanUsage) => shownChat()?.webContents.send('chat:plan', plan),
    notify: (notice) => {
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
    dictatedInto = BrowserWindow.getFocusedWindow() ?? undefined
    voiceWindow()
  })
  if (!took) log.warn(`${DICTATE} is taken by something else, dictation has no shortcut`)
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
    if (said.ok && said.text !== undefined && said.text.trim() !== '') pasteBack(said.text)
    return said
  })
  ipcMain.on('voice:cancel', () => closeVoice())

  ipcMain.on('chat:open', () => openChat())
  ipcMain.on('chat:listening', () => chatListening())
  ipcMain.handle('chat:account', () => sessions?.account())
  ipcMain.handle('chat:models', () => sessions?.models())
  ipcMain.handle('chat:plan', () => {
    void sessions?.measure()
    return sessions?.plan()
  })
  ipcMain.handle('chat:git', async (event, root: string) => {
    const state = await gitState(root)
    // What is there to pull is only known once the remote is asked, which is slow, so it follows.
    if (state?.upstream !== undefined) {
      void fetchGit(root).then(async (fetched) => {
        if (fetched && !event.sender.isDestroyed()) event.sender.send('chat:git', { root, state: await gitState(root) })
      })
    }
    return state
  })
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
  ipcMain.handle('chat:list', (_event, root: string | undefined) => {
    // Nothing for the project comes over as null, which is not a folder name.
    const where = typeof root === 'string' && root !== '' ? root : undefined
    if (where !== undefined) rememberProject(where)
    return sessions?.list(where === undefined ? getSettings().projects : [where]) ?? []
  })
  ipcMain.handle('chat:search', (_event, asked: string, root: string | undefined) =>
    searchClaude(typeof root === 'string' && root !== '' ? [root] : getSettings().projects, asked),
  )
  // The window asks first, in its own words; by here it has been answered.
  ipcMain.handle('chat:delete', async (_event, ids: readonly string[]) => {
    const gone = (await sessions?.remove(ids)) ?? []
    unfavorite(gone)
    return gone
  })
  ipcMain.handle('chat:items', (_event, id: string) => sessions?.items(id) ?? [])
  ipcMain.handle('chat:send', async (_event, message: SessionMessage) => {
    track('chatSent')
    return sessions?.send(message)
  })
  ipcMain.on('chat:answer', (_event, id: string, card: string, answer: CardAnswer | string) =>
    sessions?.answer(id, card, answer),
  )
  ipcMain.on('chat:stop', (_event, id: string) => sessions?.stop(id))
  ipcMain.handle('chat:unqueue', (_event, id: string, queued: string) => sessions?.unqueue(id, queued))
  ipcMain.handle('chat:delegate', (_event, id: string, queued: string) => sessions?.delegate(id, queued))
  ipcMain.on('chat:mode', (_event, id: string, mode: SessionMode) => sessions?.mode(id, mode))
  ipcMain.on('chat:rename', (_event, id: string, title: string) => sessions?.rename(id, title))
  ipcMain.on('chat:mark', (_event, id: string, status: SessionStatus | null) => sessions?.mark(id, status ?? undefined))
  ipcMain.on('chat:hide', (_event, id: string) => {
    sessions?.hide(id)
    unfavorite([id])
  })
  ipcMain.on('chat:watching', (_event, id: string | undefined) =>
    sessions?.watching(watchingChat() ? id : undefined),
  )
  ipcMain.handle('chat:remote', (_event, id: string, on: boolean) => sessions?.remote(id, on) ?? { error: 'Not ready yet.' })
  ipcMain.handle('chat:mcp', (_event, root: string, id: string | undefined, change: McpChange | undefined) =>
    sessions?.mcp(root, id ?? undefined, change ?? undefined),
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

  onSettings((settings) => {
    // The frames, the vibrancy behind the panel and the folder picker are the
    // system's, not the stylesheet's, and they follow this.
    nativeTheme.themeSource = settings.theme
    tell('settings:changed', settings)
    drawTray()
  })
}

/* ------------------------------------------------------------------ */
/* Starting and stopping                                               */
/* ------------------------------------------------------------------ */

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0] ?? panelWindow()
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
    wire()
    panelWindow()
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
    startUpdates({
      changed: (view) => tell('update:view', view),
      running: () => sessions?.working() ?? [],
      wanted: () => getSettings().autoUpdate,
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) panelWindow()
    })
  })
}

// The tray keeps it running with no window open, and the timed shortcuts with it; Quit is in the tray's menu.
app.on('window-all-closed', () => undefined)

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  sessions?.dispose()
})
