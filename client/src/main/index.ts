import './local-data'

import { exec, execFile } from 'node:child_process'
import { stat, writeFile } from 'node:fs/promises'
import type { Server } from 'node:net'
import { homedir, hostname } from 'node:os'
import { join, resolve } from 'node:path'

import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  Notification,
  powerSaveBlocker,
  screen,
  shell,
  systemPreferences,
} from 'electron'
import log from 'electron-log'
import QRCode from 'qrcode'

import { ANYWHERE, homeOf, resumeCommand, shownProjects } from '../shared/api'
import { newKey, pairingLink, SIGNAL } from '../shared/pairing'
import type {
  Anywhere,
  Answered,
  CardAnswer,
  RequestChoice,
  Lineup,
  ChatFound,
  CutOff,
  ErrorAnswer,
  ChatSession,
  ClaudeAccount,
  CorrectRequest,
  VoiceMode,
  GitState,
  PhoneView,
  PlanUsage,
  ShortcutDraft,
  SessionItem,
  SessionItems,
  SessionMessage,
  SessionMode,
  SessionStatus,
  Settings,
  ShellCommand,
  TranscribeRequest,
  Recording,
  ScreenControl,
  ScreenSource,
  SessionImage,
} from '../shared/api'
import track from './analytics'
import { control } from './control'
import { correct } from './correct'
import { answerErrors, errorQuestion, followErrors, startErrors, watchErrors, windowError } from './errors'
import { askOrders, carryOut, projectSaid, saying } from './orders'
import type { Order, Told } from './orders'
import { projectFiles } from './files'
import { foldersIn } from './folders'
import { fetchGit, gitRepo, gitState } from './git'
import { keepGuide } from './guide'
import { closeAsked, listenAsked } from './asked'
import type { StartAnswered, StartAsked } from './asked'
import { fileShown } from './file-shown'
import { localFetch } from './local-page'
import type { LocalAsk } from '../shared/local'
import { fileAt, fileMenu, isThere, openFile, pickApp } from './open-with'
import { Sessions } from './sessions'
import type { Asking } from './sessions'
import { firstLine } from './sessions/wording'
import type { McpChange } from './sessions/mcp'
import { readMcp } from './sessions/mcp'
import { readBrowsers } from './sessions/chrome'
import { claudeFile, deleteClaude, everyClaude, forkPoint, listClaude, readClaudeSession, readGoal, readLinks } from './sessions/disk'
import { HostDisk } from './hosts/disk'
import { Hosts } from './hosts/hosts'
import {
  foldersFor,
  hostExists,
  hostFile,
  hostFiles,
  hostGit,
  hostIsDir,
  hostMcp,
  hostModels,
  hostRepo,
  hostResumeLine,
  hostTaskOutput,
  hostTerminal,
  hostUpload,
  routedClaude,
  routedShell,
} from './hosts/route'
import type { Routes } from './hosts/route'
import { claudeModels } from './sessions/models'
import { Plans } from './plans'
import { runsAt } from './hosts/runs'
import { secretsAt } from './hosts/secrets'
import { Forwards, localPort, withPort } from './hosts/forward'
import { hostOf, isRemote, machineName } from '../shared/hosts'
import { keptOrder } from '../shared/order'
import type { HostAnswer, HostDraft } from '../shared/hosts'
import { searchClaude } from './sessions/search'
import { removeShortcut, runShortcut, saveShortcut, startShortcuts } from './shortcuts'
import { forgetProject, forgetRoots, getSettings, notesStore, onSettings, rememberProject, setSettings } from './store'
import { transcribe } from './transcribe'
import { addToRecording, dropRecording, keepRecording, startRecording, sweepRecordings } from './recordings'
import { recordedNote } from '../shared/recording'
import { drawTray, startTray } from './tray'
import { checkForUpdates, follow, restartToUpdate, startUpdates, updateView } from './updates'
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
  listeningVoice,
  sizeVoice,
  tellChat,
  voiceWindow,
  watchingChat,
} from './windows'

log.transports.file.level = 'info'

// Before `ready`, which is the only time the SDK can start; nothing leaves until the switch says so.
startErrors()
watchErrors(() => {
  for (const window of everyWindow()) window.webContents.send('errors:question', errorQuestion())
})

const DICTATE = ANYWHERE.dictate
const CORRECT = ANYWHERE.correct
const SPOTLIGHT = ANYWHERE.search
const ORDER = ANYWHERE.orders
const RECORD = ANYWHERE.record

let sessions: Sessions | undefined
let lineup: Lineup = { working: 0, limit: 0 }
let routes: Routes | undefined
/** Every place's plan: this computer's, and each host that has a project on it. Built once, over `sessions` and `routes` however they stand when it is asked. */
let plans: Plans | undefined
/** How each host last stood, so a move into Connected is told apart from every other change. */
const hostWasUp = new Map<string, boolean>()
let cutOffered = false
/** What GECKIT.md was last kept at, so it is only written when the switch moves. */
let guided: boolean | undefined
let asked: Server | undefined

// GeckIt's own window the dictation was started in, which it goes back into.
let dictatedInto: BrowserWindow | undefined

/** What the capsule that is up was opened for: writing the words down, or doing what they say. */
let heardFor: VoiceMode = 'paste'

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

/** Built once: `sessions` and `routes` are read through closures, so it works whatever they stand at when it is asked, including before either exists. */
function buildPlans(): Plans {
  return new Plans({
    sessions: () => sessions,
    routes: () => routes,
    projects: () => getSettings().projects,
    changed: (places) => tellChats('chat:plans', places),
  })
}

const badge = (): void => {
  if (process.platform !== 'darwin' || sessions === undefined) return
  const wanting = sessions.wanting()
  app.dock?.setBadge(wanting === 0 ? '' : String(wanting))
}

/** How this computer is named, the way the phone is told it: without `.local`, read as words rather than a hostname. */
const computerName = (): string => machineName(hostname())

/** A host's own name, for a project on it named to the voice model with it. */
const hostNamed = (id: string): string | undefined => routes?.hosts.config(id)?.name

/** Everything about other computers: who they are, what runs on them, and their conversations' files. */
function buildHosts(): Routes {
  const folder = join(app.getPath('userData'), 'hosts')
  const secrets = secretsAt(join(folder, 'secrets.json'))
  // Both are made from the hosts they serve, and a host reached some other way now has both let go of what they hold for it.
  const made: { forwards?: Forwards; disk?: HostDisk } = {}
  const hosts = new Hosts({
    forwardsChanged: (id) => made.forwards?.closeHost(id),
    diskForget: (id) => void made.disk?.forget(id),
    folder,
    executable: process.execPath,
    hosts: () => getSettings().hosts,
    save: (list) => setSettings({ hosts: list }),
    forgetProjects: (id) => {
      // Every trace of its roots goes at once: the list, profiles, colours and Chat's filter.
      forgetRoots((root) => hostOf(root) === id)
      for (const shortcut of getSettings().shortcuts.filter((one) => hostOf(one.root) === id)) removeShortcut(shortcut.id)
      for (const [session, run] of Object.entries(routes?.runs.all() ?? {})) if (run.host === id) routes?.runs.delete(session)
      // A favorite kept by id, not root, is only let go of for what is still held in memory: one never listed this run is not reached by this.
      unfavorite(sessions?.ids((root) => hostOf(root) === id) ?? [])
      void routes?.disk.forget(id)
    },
    remember: (root) => rememberProject(root),
    changed: (views) => {
      // A host that just came up had nothing read from it while it was not connected: read again now, and told.
      for (const view of views) {
        const was = hostWasUp.get(view.id)
        hostWasUp.set(view.id, view.state === 'up')
        if (was === true || view.state !== 'up') continue
        const roots = getSettings().projects.filter((root) => hostOf(root) === view.id)
        if (roots.length > 0) void sessions?.refresh(roots)
        plans?.hostUp(view.id)
      }
      tell('hosts:changed', views)
    },
    prompt: (prompt) => {
      tell('hosts:prompt', prompt)
      // A host asking while nothing of GeckIt's is in front brings the window up to answer it.
      if (!watchingChat()) openChat()
    },
    answered: (id) => tell('hosts:answered', id),
    checks: (lines) => tell('hosts:checks', lines),
    secrets,
  })
  made.disk = new HostDisk(hosts, folder)
  made.forwards = new Forwards(hosts)
  return { hosts, disk: made.disk, runs: runsAt(join(folder, 'runs.json')), forwards: made.forwards }
}

/** Claude Code's files about a root: this computer's, or a host's through its copy here. */
function routedDisk(held: Routes): NonNullable<ConstructorParameters<typeof Sessions>[0]['disk']> {
  const local = {
    list: listClaude,
    read: readClaudeSession,
    has: async (root: string, id: string) => (await claudeFile(root, id)) !== undefined,
    delete: deleteClaude,
    goal: readGoal,
    forkPoint,
    links: readLinks,
  }
  return {
    list: (root) => (isRemote(root) ? held.disk.list(root) : local.list(root)),
    read: (root, id) => (isRemote(root) ? held.disk.read(root, id) : local.read(root, id)),
    has: (root, id) => (isRemote(root) ? held.disk.has(root, id) : local.has(root, id)),
    delete: (root, id) => (isRemote(root) ? held.disk.delete(root, id) : local.delete(root, id)),
    goal: (root, id) => (isRemote(root) ? held.disk.goal(root, id) : local.goal(root, id)),
    forkPoint: (root, id, at) => (isRemote(root) ? held.disk.forkPoint(root, id, at) : local.forkPoint(root, id, at)),
    links: (root, id) => (isRemote(root) ? held.disk.links(root, id) : local.links(root, id)),
    // Hidden conversations looks everywhere at once: this computer's own folder, and every host's mirror.
    every: async (from, to, wanted) => [...(await everyClaude(from, to, wanted)), ...(await held.disk.every(from, to, wanted))],
  }
}

/**
 * A terminal for a root: in its folder here, or signed in to its host and in
 * its folder there. `status` is where a command that wants a keyboard is to
 * write its exit code once it is done; appended after the whole of what runs
 * here, which for a host is the ssh line itself, so it is this computer's
 * shell that writes it once ssh is back, and not the host's.
 */
function terminalFor(root: string, run: string, status?: string): void {
  const withStatus = (line: string): string => (status === undefined ? line : `${line}; echo $? > ${JSON.stringify(status)}`)
  if (!isRemote(root) || routes === undefined) {
    openTerminal(root, withStatus(run))
    return
  }
  const line = hostTerminal(routes, root, run)
  if (line !== undefined) {
    openTerminal(homedir(), withStatus(line))
    return
  }
  // Its host is gone: nothing opens to write the status file, so a `!` command waiting on it is ended here instead of polling forever.
  if (status !== undefined) void writeFile(status, '1').catch(() => undefined)
}

/**
 * Whether a folder that held a hidden conversation is still a project, for
 * Hidden conversations: this computer's own is stated locally, and a host's
 * from settings where it is already a project there, or from the host itself
 * where it is up and reachable.
 */
async function thereFor(path: string): Promise<boolean> {
  if (!isRemote(path)) return stat(path).then((found) => found.isDirectory(), () => false)
  if (getSettings().projects.includes(path)) return true
  return routes === undefined ? false : hostIsDir(routes, path)
}

function build(held: Routes): Sessions {
  return new Sessions({
    notes: notesStore(),
    ...(process.platform === 'darwin' ? { terminal: terminalFor } : {}),
    claude: routedClaude(held),
    disk: routedDisk(held),
    shell: routedShell(held),
    there: thereFor,
    taskOutput: (root, session, task) => (isRemote(root) ? hostTaskOutput(held, root, session, task) : Promise.resolve(undefined)),
    mcp: (root, change) => (isRemote(root) ? hostMcp(held, root, change) : readMcp(root, change)),
    browsers: (root, pick) => (isRemote(root) ? Promise.resolve(undefined) : readBrowsers(root, pick)),
    claudeModels: (root) => (root !== undefined && isRemote(root) ? hostModels(held, root) : claudeModels()),
    limit: () => getSettings().workingAtOnce,
    order: () => getSettings().progressOrder,
    lineup: (now) => {
      if (now.working === lineup.working && now.limit === lineup.limit) return
      lineup = now
      tellChats('lineup:changed', now)
    },
    changed: (all: readonly ChatSession[]) => {
      // Every conversation it holds, which is more than the window lists: another profile's rows stay held after a switch until they are read again. A general question belongs to no project and is always told.
      const order = keptOrder(getSettings().progressOrder, all)
      if (order !== undefined) setSettings({ progressOrder: order })
      const settings = getSettings()
      const within = (where: readonly string[]): readonly ChatSession[] =>
        all.filter((one) => one.question === true || where.includes(homeOf(one)))
      shownChat()?.webContents.send('chat:sessions', within(shownProjects(settings)))
      // The phone is in no profile, so it is told every project's.
      shownPeer()?.webContents.send('peer:tell', 'chat:sessions', within(settings.projects))
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
        const request = notice.request
        const note = new Notification({
          title: notice.title,
          subtitle: notice.subtitle,
          body: notice.body,
          actions: request === undefined ? [] : [{ type: 'button', text: 'Start all' }],
        })
        notices.add(note)
        if (request !== undefined) note.on('action', () => void sessions?.startAll(request, 'mac'))
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
    const open = listeningVoice()
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
  const open = listeningVoice()
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

/** A New task or Ask form is open in Chat, and a recording made now goes into it. */
let formOpen = false

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
  // Left out of what is recorded, so it is never in its own frames.
  voiceWindow().setContentProtection(true)
}

/** The capsule goes; a form's recording brings Chat back to the form, whatever became of it. */
function closeCapsule(): void {
  closeVoice()
  dropRecording()
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

const pictures = (recording: Recording): readonly SessionImage[] => recording.frames.map((one) => one.image)

const withNote = (text: string, recording: Recording): string =>
  `${text}\n\n${recordedNote(recording.seconds, recording.frames, recording.video)}`

/** A recording asked about as a general question, which opens in Chat with the answer coming. */
async function askRecorded(recording: Recording): Promise<Answered> {
  const held = sessions
  if (held === undefined) return { ok: false, error: 'Not ready yet.' }
  const id = await held.send({
    root: '',
    mode: getSettings().chatMode,
    text: withNote(recording.text, recording),
    images: pictures(recording),
    question: true,
  })
  keepRecording()
  closeVoice()
  openChat(id)
  return { ok: true }
}

/** A recording read as one piece of work in one project, waiting for the yes. */
async function readRecorded(recording: Recording): Promise<Answered> {
  const read = await readSaid(`Start this as one task, in the project it is about:\n${recording.text}`)
  // The lines are in the order of the orders, so the start's line is at the start's place.
  const at = planned?.orders.findIndex((one) => one.do === 'start') ?? -1
  const start = planned?.orders[at]
  const line = read.plan?.[at]
  if (planned === undefined || start === undefined || line === undefined) {
    planned = undefined
    return { ok: false, error: 'No project fits what was said. Name the project and try again.' }
  }
  planned = { orders: [start], told: planned.told, images: pictures(recording), recording }
  return { ok: true, plan: [line], heard: recording.text }
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

const REGISTER: Readonly<Record<Anywhere, () => void>> = {
  correct: registerCorrect,
  dictate: registerDictate,
  search: registerSpotlight,
  orders: registerOrder,
  record: registerRecord,
}

/** The shortcuts in any application that are on, as Settings has them: each taken or given back as it changes. */
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

/**
 * What was said to the application rather than typed with it.
 *
 * The words, the projects and the conversations there are go to the model, and
 * what comes back is orders: start one, say something in another, mark a third.
 * Every one of them is something the person could have done with the mouse, and
 * nothing reads or writes a repository on the way.
 */
/** What was heard, read as orders and waiting for a yes. Nothing runs until then. */
let planned:
  | {
      readonly orders: readonly Order[]
      readonly told: readonly Told[]
      /** A recording's frames, which go with the task it starts. */
      readonly images?: readonly SessionImage[]
      /** The recording the task is about, its note written once the project it starts in is known: on a host, the video is not there to point to. */
      readonly recording?: Recording
    }
  | undefined

async function readSaid(said: string): Promise<Answered> {
  // What was read before is replaced, whether or not this reading comes to anything.
  planned = undefined
  const held = sessions
  if (held === undefined) return { ok: false, error: 'Not ready yet.' }
  const projects = getSettings().projects
  const told: Told[] = (await held.list(projects)).map((one) => ({
    id: one.id,
    title: one.title,
    root: one.root,
    state: one.state,
  }))
  const read = await askOrders(said, projects, told, undefined, hostNamed)
  if (read.error !== undefined) return { ok: false, error: read.error }
  const { orders, lines } = saying(read.orders, projects, told, hostNamed)
  if (orders.length === 0) return { ok: false, error: `Nothing to do in "${said}"` }
  planned = { orders, told }
  return { ok: true, plan: lines, heard: said }
}

/** Conversations Claude asked for with `geckit start`, begun only as the person answers in the conversation that asked. */
async function startAsked(ask: StartAsked, gone: AbortSignal): Promise<StartAnswered> {
  const held = sessions
  if (held === undefined) return { ok: false, error: 'GeckIt is not ready yet.' }
  if (typeof ask.from !== 'string' || ask.from === '') return { ok: false, error: 'Run this from a Claude Code session.' }
  const tasks = Array.isArray(ask.tasks) ? ask.tasks : []
  if (tasks.length === 0) return { ok: false, error: 'Task 1 has no text.' }
  if (tasks.length > 20) return { ok: false, error: 'At most 20 tasks at once.' }
  const projects = getSettings().projects
  const asking: Asking[] = []
  for (const [index, task] of tasks.entries()) {
    const root = projects.find((one) => projectSaid(one, hostNamed) === task.project)
    if (root === undefined) {
      const names = projects.map((one) => projectSaid(one, hostNamed)).join(', ')
      return { ok: false, error: `Task ${String(index + 1)}: no project called ${String(task.project)}. There are: ${names}` }
    }
    const text = typeof task.text === 'string' ? task.text.trim() : ''
    if (text === '') return { ok: false, error: `Task ${String(index + 1)} has no text.` }
    const title = typeof task.title === 'string' && task.title.trim() !== '' ? task.title.trim() : text.split(/(?<=[.!?])\s/)[0] ?? text
    const goal = typeof task.goal === 'string' && task.goal.trim() !== '' ? task.goal.trim() : undefined
    asking.push({ project: task.project, root, title: firstLine(title, 100), text, ...(goal === undefined ? {} : { goal }) })
  }
  if (!(await held.list(projects)).some((one) => one.id === ask.from)) {
    return { ok: false, error: "This conversation's folder is not one of your projects in GeckIt." }
  }
  const answered = await held.request(ask.from, asking, getSettings().chatMode, gone)
  return answered === undefined ? { ok: false, error: 'Claude stopped waiting.' } : { ok: true, ...answered }
}

/** The yes: what was read out loud a moment ago is carried out now. */
async function carryOutPlanned(open: (id: string) => void = openChat): Promise<Answered> {
  const held = sessions
  const plan = planned
  planned = undefined
  if (held === undefined || plan === undefined) return { ok: false, error: 'There is nothing waiting to be done' }
  const projects = getSettings().projects
  const mode = getSettings().chatMode
  const did = await carryOut(
    plan.orders,
    projects,
    plan.told,
    {
      // The work goes first and the goal after it: a goal on its own tells Claude to
      // start working toward it, with nothing yet said about what the work is.
      start: async (root, text, goal) => {
        const recording = plan.recording
        if (recording !== undefined) keepRecording()
        // The video is on this computer; a task on a host is told only of the frames, which went with it.
        const note = recording === undefined ? undefined : recordedNote(recording.seconds, recording.frames, recording.video, isRemote(root))
        const id = await held.send({
          root,
          mode,
          text: note === undefined ? text : `${text}\n\n${note}`,
          ...(plan.images === undefined || plan.images.length === 0 ? {} : { images: plan.images }),
        })
        if (goal !== undefined) await held.send({ session: id, root, mode, text: `/goal ${goal}` })
        return id
      },
      say: async (id, text) => {
        const chat = plan.told.find((one) => one.id === id)
        if (chat !== undefined) await held.send({ session: id, root: chat.root, mode, text })
      },
      stop: (id) => held.stop(id),
      mark: (id, status) => held.mark(id, status),
      open,
      delete: async (id) => {
        unfavorite(await held.remove([id]))
      },
    },
    hostNamed,
  )
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

/** Search, routed the same way the conversation files themselves are: this computer's own, or a host's mirror. */
const searchChats = async (roots: readonly string[], asked: string): Promise<ChatFound[]> => {
  const said = await searchClaude(roots, asked, (root) => foldersFor(routes, root))
  // A conversation not begun yet has no file, and what is queued in it is all there is to find.
  const queued = (sessions?.queuedHolding(roots, asked) ?? []).filter((hit) => !said.some((one) => one.id === hit.id))
  return [...queued, ...said]
}

function listChats(root: string | undefined, every: readonly string[]): Promise<ChatSession[]> {
  // Nothing for the project comes over as null, which is not a folder name.
  const where = typeof root === 'string' && root !== '' ? root : undefined
  if (where !== undefined) rememberProject(where)
  return sessions?.list(where === undefined ? every : [where]) ?? Promise.resolve([])
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
  if (isRemote(root)) return routes === undefined ? undefined : hostGit(routes, root)
  const state = await gitState(root)
  // What is there to pull is only known once the remote is asked, which is slow, so it follows.
  if (state?.upstream !== undefined) {
    void fetchGit(root).then(async (done) => {
      if (done) fetched(await gitState(root))
    })
  }
  return state
}

const existsFor = (root: string, path: string): Promise<boolean> =>
  isRemote(root) ? (routes === undefined ? Promise.resolve(false) : hostExists(routes, root, path)) : isThere(root, path)

const fileFor = (root: string, path: string) =>
  isRemote(root) && routes !== undefined ? hostFile(routes, root, path) : fileShown(root, path)

const filesFor = (root: string): Promise<string[]> =>
  isRemote(root) ? (routes === undefined ? Promise.resolve([]) : hostFiles(routes, root)) : projectFiles(root)

const repoFor = (root: string): Promise<string | undefined> =>
  isRemote(root) ? (routes === undefined ? Promise.resolve(undefined) : hostRepo(routes, root)) : gitRepo(root)

/**
 * A link opened from a conversation. One to `localhost` said in a conversation
 * on a host is that host's, so its port is carried here first, and the person
 * told where it landed when the same port was taken.
 */
async function openLink(href: string): Promise<void> {
  const watched = sessions?.watched()
  const host = watched === undefined ? undefined : hostOf(watched.root)
  const port = localPort(href)
  if (host === undefined || port === undefined || routes === undefined || watched === undefined) {
    void shell.openExternal(href)
    return
  }
  const local = await routes.forwards.open(host, port)
  if (local === undefined) {
    // Never this computer's own localhost by mistake: nothing was actually carried over, so opening it here would show whatever answers this computer's own port, not the host's.
    const name = routes.hosts.config(host)?.name ?? host
    tellChats('chat:notice', {
      session: watched.id,
      title: `Could not bring ${name}'s ${String(port)} here. Check that ${name} is connected, then open the link again.`,
      subtitle: '',
      body: '',
      asks: false,
    })
    return
  }
  if (local !== port) {
    const name = routes.hosts.config(host)?.name ?? host
    tellChats('chat:notice', {
      session: watched.id,
      title: `${name}'s ${String(port)} is at localhost:${String(local)} here`,
      subtitle: '',
      body: '',
      asks: false,
    })
  }
  void shell.openExternal(withPort(href, local))
}

/**
 * A `localhost` link opened on the phone, in a conversation on a host: its
 * port is carried here the same way `openLink` carries the Mac's own, and the
 * phone is given the local port to open through its own page instead, with a
 * word for where it landed when the same port was already taken here.
 */
async function forwardLink(root: string, href: string): Promise<{ readonly href: string; readonly moved?: string; readonly problem?: string }> {
  const id = hostOf(root)
  const port = localPort(href)
  if (id === undefined || port === undefined || routes === undefined) return { href }
  const local = await routes.forwards.open(id, port)
  if (local === undefined) {
    const name = routes.hosts.config(id)?.name ?? id
    return { href, problem: `Could not bring ${name}'s ${String(port)} here. Check that ${name} is connected, then open the link again.` }
  }
  const next = withPort(href, local)
  if (local === port) return { href: next }
  const name = routes.hosts.config(id)?.name ?? id
  return { href: next, moved: `${name}'s ${String(port)} is at ${String(local)} on ${computerName()}` }
}

/**
 * What closing GeckIt cut off, to be offered Continue. A conversation on a host
 * was not cut: it runs on there and is picked up once its host is reached, so
 * it is left out even while its pickup is still waiting on the connection.
 */
const cutOffHere = (): CutOff[] => (sessions?.cutOff() ?? []).filter((one) => routes?.runs.get(one.id) === undefined)

/** What a window may ask about hosts. */
function wireHosts(): void {
  const hosts = (): Hosts | undefined => routes?.hosts
  ipcMain.handle('hosts:list', () => hosts()?.views() ?? [])
  ipcMain.handle('hosts:known', () => hosts()?.known() ?? [])
  ipcMain.handle('hosts:check', (_event, draft: HostDraft) => hosts()?.check(draft) ?? { ok: false, problem: 'Not ready yet.' })
  ipcMain.handle('hosts:update', (_event, id: string, draft: HostDraft) => hosts()?.update(id, draft) ?? { ok: false, problem: 'Not ready yet.' })
  ipcMain.on('hosts:forget', (_event, id: string) => hosts()?.forget(id))
  ipcMain.handle('hosts:remove', (_event, id: string) => {
    routes?.forwards.closeHost(id)
    return hosts()?.remove(id)
  })
  ipcMain.on('hosts:connect', (_event, id: string) => void hosts()?.connect(id))
  ipcMain.on('hosts:reconnect', (_event, id: string) => hosts()?.reconnect(id))
  ipcMain.on('hosts:disconnect', (_event, id: string) => {
    routes?.forwards.closeHost(id)
    hosts()?.disconnect(id)
  })
  ipcMain.handle('hosts:folders', (_event, id: string, path: string | undefined) => hosts()?.folders(id, path ?? undefined))
  ipcMain.handle('hosts:addFolder', (_event, id: string, path: string) => hosts()?.addFolder(id, path))
  ipcMain.handle('hosts:addFolderSaying', (_event, id: string, path: string) => hosts()?.addFolderSaying(id, path) ?? { problem: 'Not ready yet.' })
  ipcMain.handle('hosts:prompts', () => hosts()?.prompts() ?? [])
  ipcMain.on('hosts:answer', (_event, answer: HostAnswer) => hosts()?.answer(answer))
  ipcMain.handle('hosts:install', (_event, id: string) => hosts()?.install(id) ?? { ok: false, text: 'Not ready yet.' })
  ipcMain.handle('hosts:trustNewKey', (_event, id: string) => hosts()?.trustNewKey(id) ?? { ok: false, problem: 'Not ready yet.' })
  ipcMain.handle('hosts:running', (_event, id: string) => hosts()?.running(id) ?? 0)
  // Actually working or waiting on an answer, for Disconnect; every conversation listed there at all, idle ones too, for Remove's own count of what stays behind.
  ipcMain.handle('hosts:working', (_event, id: string) => (sessions?.ids((root) => hostOf(root) === id) ?? []).filter((one) => sessions?.busy(one) === true).length)
  ipcMain.handle('hosts:conversations', (_event, id: string) => sessions?.ids((root) => hostOf(root) === id).length ?? 0)
  ipcMain.on('hosts:terminal', (_event, id: string, run: string | undefined) => {
    // Off macOS there is no terminal to open one in; pretending to would only silently open the home folder.
    if (process.platform !== 'darwin') return
    const line = hosts()?.terminalCommand(id, undefined, run ?? undefined)
    if (line !== undefined) openTerminal(homedir(), line)
  })
  ipcMain.handle('hosts:resumeLine', (_event, root: string, id: string) => (routes === undefined ? undefined : hostResumeLine(routes, root, id)))
}

function wire(): void {
  ipcMain.handle('settings:get', () => getSettings())
  ipcMain.handle('update:view', () => updateView())
  ipcMain.handle('update:check', () => checkForUpdates())
  ipcMain.on('update:restart', () => restartToUpdate())
  ipcMain.handle('settings:set', (_event, change: Partial<Settings>) => {
    const was = getSettings().sendErrors
    const settings = setSettings(change.analytics === false ? { ...change, client: '' } : change)
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
  ipcMain.on('voice:size', (_event, height: number, width?: number, middle?: boolean) => sizeVoice(height, width, middle))
  ipcMain.handle('voice:mode', () => heardFor)
  ipcMain.handle('voice:screen', () => screenToRecord())
  ipcMain.handle('voice:video', () => startRecording())
  ipcMain.on('voice:videoPart', (_event, part: Uint8Array) => addToRecording(part))
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
    voiceWindow()
  })
  // What a form's recording heard and saw, handed to the form.
  ipcMain.on('voice:fill', (_event, recording: Recording) => {
    keepRecording()
    tellChat('chat:recorded', recording)
    closeCapsule()
  })
  ipcMain.on('voice:cancel', () => {
    planned = undefined
    closeCapsule()
  })

  ipcMain.on('chat:open', () => openChat())
  ipcMain.on('chat:listening', () => chatListening())
  ipcMain.handle('chat:account', () => sessions?.account())
  ipcMain.handle('chat:models', (_event, root: string | undefined) => sessions?.models(root ?? undefined))
  ipcMain.handle('chat:plan', () => {
    void sessions?.measure()
    return sessions?.plan()
  })
  ipcMain.handle('chat:plans', () => plans?.asked() ?? [])
  ipcMain.handle('chat:git', (event, root: string) =>
    gitFor(root, (state) => {
      if (!event.sender.isDestroyed()) event.sender.send('chat:git', { root, state })
    }),
  )
  wireHosts()
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
  ipcMain.handle('chat:rememberProject', (_event, root: string) => {
    rememberProject(root)
  })
  ipcMain.handle('chat:hidden', (_event, older: boolean) => sessions?.hidden(getSettings().projects, older) ?? [])
  ipcMain.handle('chat:bring', (_event, id: string) => sessions?.bring(id))
  ipcMain.handle('chat:list', (_event, root: string | undefined) => listChats(root, shownProjects(getSettings())))
  ipcMain.handle('chat:search', (_event, asked: string, root: string | undefined) =>
    searchChats(typeof root === 'string' && root !== '' ? [root] : shownProjects(getSettings()), asked),
  )
  // The window asks first, in its own words; by here it has been answered.
  ipcMain.handle('chat:delete', (_event, ids: readonly string[]) => deleteChats(ids))
  ipcMain.handle('chat:items', (_event, id: string) => sessions?.items(id) ?? [])
  ipcMain.handle('chat:links', (_event, id: string) => sessions?.links(id) ?? [])
  ipcMain.handle('chat:waiting', (_event, id: string) => waitingCard(id))
  // Offered once a start: a window opened again later is not asked again.
  ipcMain.handle('chat:cutOff', () => {
    if (cutOffered) return []
    cutOffered = true
    return cutOffHere()
  })
  ipcMain.on('chat:proceed', (_event, ids: readonly string[]) => {
    for (const id of ids) void sessions?.proceed(id)
  })
  ipcMain.handle('chat:send', async (_event, message: SessionMessage) => {
    track('chatSent')
    return sessions?.send(message)
  })
  ipcMain.on('chat:answer', (_event, id: string, card: string, answer: CardAnswer | string) =>
    sessions?.answer(id, card, answer),
  )
  ipcMain.handle('chat:answerRequest', (_event, request: string, choice: RequestChoice) => sessions?.answerRequest(request, choice))
  ipcMain.handle('chat:startAll', (_event, request: string, where: 'mac' | 'phone') => sessions?.startAll(request, where))
  ipcMain.on('chat:stop', (_event, id: string) => sessions?.stop(id))
  ipcMain.handle('lineup:state', () => lineup)
  ipcMain.handle('chat:unqueue', (_event, id: string, queued: string) => sessions?.unqueue(id, queued))
  ipcMain.handle('chat:queuedPicture', (_event, id: string, queued: string, index: number) => sessions?.queuedPicture(id, queued, index))
  ipcMain.on('chat:requeue', (_event, id: string, queued: string, text: string) => sessions?.requeue(id, queued, text))
  ipcMain.handle('chat:delegate', (_event, id: string, queued: string, history: boolean) =>
    sessions?.delegate(id, queued, history),
  )
  ipcMain.on('chat:mode', (_event, id: string, mode: SessionMode) => sessions?.mode(id, mode))
  ipcMain.on('chat:rename', (_event, id: string, title: string) => sessions?.rename(id, title))
  ipcMain.on('chat:mark', (_event, id: string, status: SessionStatus | null) => sessions?.mark(id, status ?? undefined))
  ipcMain.on('chat:hide', (_event, id: string) => hideChat(id))
  ipcMain.on('chat:keep', (_event, id: string, stays: boolean) => sessions?.keep(id, stays))
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
    // Off macOS there is no terminal to open one in; pretending to would only silently open the folder.
    if (process.platform !== 'darwin') return
    sessions?.handOver(id)
    terminalFor(root, resumeCommand(id))
  })
  ipcMain.handle('chat:upload', (_event, root: string, path: string) =>
    isRemote(root) ? (routes === undefined ? { problem: 'Not ready yet.' } : hostUpload(routes, root, path)) : { path },
  )
  ipcMain.handle('chat:shell', (_event, asked: ShellCommand) => sessions?.shell(asked))
  ipcMain.on('chat:stopShell', (_event, id: string, item: string) => sessions?.stopShell(id, item))
  ipcMain.on('chat:typeShell', (_event, id: string, item: string, text: string) => sessions?.typeShell(id, item, text))
  ipcMain.on('chat:toBackground', (_event, id: string, item: string) => sessions?.toBackground(id, item))
  ipcMain.on('chat:stopTask', (_event, id: string, task: string) => sessions?.stopTask(id, task))
  ipcMain.on('chat:clearTask', (_event, id: string, task: string) => sessions?.clearTask(id, task))
  ipcMain.handle('chat:taskOutput', (_event, id: string, task: string) => sessions?.taskOutput(id, task))
  // A file on a host is not on this computer to show in a folder or open in an application here.
  ipcMain.on('chat:reveal', (_event, root: string, path: string) => {
    if (!isRemote(root)) shell.showItemInFolder(fileAt(root, path))
  })
  ipcMain.handle('chat:exists', (_event, root: string, path: string) => existsFor(root, path))
  ipcMain.handle('chat:file', (_event, root: string, path: string) => fileFor(root, path))
  ipcMain.handle('chat:repo', (_event, root: string) => repoFor(root))
  ipcMain.handle('chat:files', (_event, root: string) => filesFor(root))
  ipcMain.on('chat:openFile', (_event, root: string, path: string) => {
    if (!isRemote(root)) openFile(getSettings().openWith, root, path)
  })
  ipcMain.on('chat:fileMenu', (event, root: string, path: string) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window !== null && !isRemote(root)) fileMenu(window, root, path)
  })
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

  onSettings((settings) => {
    // The frames, the vibrancy behind the panel and the folder picker are the
    // system's, not the stylesheet's, and they follow this.
    nativeTheme.themeSource = settings.theme
    if (settings.guideClaude !== guided) {
      guided = settings.guideClaude
      void keepGuide(settings.guideClaude)
    }
    keepPhone(settings.phone, settings.phoneKey)
    keepShortcuts(settings.anywhereOff)
    sessions?.again()
    follow(settings.updateChannel)
    for (const window of everyWindow()) window.webContents.send('settings:changed', settings)
    shownPeer()?.webContents.send('peer:tell', 'settings:changed', phoneSettings(settings))
    drawTray()
  })
}

/* ------------------------------------------------------------------ */
/* The phone                                                           */
/* ------------------------------------------------------------------ */

type PhoneCall = (...args: never[]) => unknown

/** The card a conversation waits on, without the whole conversation. */
const waitingCard = async (id: string): Promise<SessionItem | undefined> =>
  (await sessions?.items(id))?.findLast((item) => item.kind === 'card' && item.card.answered === undefined)

let phoneOn = false
let phoneKey = ''
let phoneState: { readonly count: number; readonly trouble?: string } = { count: 0 }
let phoneCode: { readonly key: string; readonly qr: string } | undefined
// The display the phone is shown, which its touches land on.
let shownDisplay: string | undefined
// While Phone is on the Mac does not fall asleep by itself, which would leave the phone nothing to reach; the screen still turns off, and a closed lid still sleeps.
let awake: number | undefined

/**
 * What the phone is handed instead of the Mac's own settings. A profile, and
 * the projects the list is narrowed to, are how this Mac is being looked at;
 * the phone is in none of them and shows every project's conversations.
 */
const phoneSettings = (settings: Settings): Settings => ({ ...settings, profile: '', chatProjects: [], chatAll: true })

/** What the phone may ask, less what only makes sense at this Mac: files opened in its apps, its Finder, its terminal. */
function phoneCalls(): Record<string, PhoneCall> {
  const held = (): Sessions | undefined => sessions
  return {
    // The name the phone lists this Mac under, as the network knows it: Alexs-MacBook-Pro.local reads Alexs MacBook Pro.
    boot: () => ({ home: homedir(), platform: process.platform, name: computerName() }),
    'settings.get': () => phoneSettings(getSettings()),
    'settings.set': (change: Partial<Settings>) => setSettings(change),
    'update.view': () => updateView(),
    correct: (request: CorrectRequest) => correct(request),
    transcribe: (request: TranscribeRequest) => transcribe(request),
    'shortcuts.save': (draft: ShortcutDraft) => saveShortcut(draft),
    'shortcuts.remove': (id: string) => removeShortcut(id),
    'shortcuts.run': (id: string) => runShortcut(id, 'hand'),
    'chat.account': () => held()?.account(),
    'chat.models': (root: string | undefined) => held()?.models(root),
    'chat.plan': () => {
      void held()?.measure()
      return held()?.plan()
    },
    'chat.plans': () => plans?.asked() ?? [],
    'chat.list': (root: string | undefined) => listChats(root, getSettings().projects),
    'chat.hidden': (older: boolean) => held()?.hidden(getSettings().projects, older) ?? [],
    'chat.bring': (id: string) => held()?.bring(id),
    'chat.rememberProject': (root: string) => {
      rememberProject(root)
    },
    'chat.items': (id: string) => held()?.items(id) ?? [],
    'chat.links': (id: string) => held()?.links(id) ?? [],
    'chat.waiting': (id: string) => waitingCard(id),
    'chat.search': (asked: string, root: string | undefined) =>
      searchChats(typeof root === 'string' && root !== '' ? [root] : getSettings().projects, asked),
    'chat.send': (message: SessionMessage) => held()?.send(message),
    'chat.shell': (asked: ShellCommand) => held()?.shell(asked),
    'chat.stopShell': (id: string, item: string) => held()?.stopShell(id, item),
    'chat.typeShell': (id: string, item: string, text: string) => held()?.typeShell(id, item, text),
    'chat.toBackground': (id: string, item: string) => held()?.toBackground(id, item),
    'chat.stopTask': (id: string, task: string) => held()?.stopTask(id, task),
    'chat.clearTask': (id: string, task: string) => held()?.clearTask(id, task),
    'chat.taskOutput': (id: string, task: string) => held()?.taskOutput(id, task),
    'chat.answer': (id: string, card: string, answer: CardAnswer | string) => held()?.answer(id, card, answer),
    'chat.answerRequest': (request: string, choice: RequestChoice) => held()?.answerRequest(request, choice),
    'chat.startAll': (request: string, where: 'mac' | 'phone') => held()?.startAll(request, where),
    'chat.stop': (id: string) => held()?.stop(id),
    'lineup.state': () => lineup,
    'chat.unqueue': (id: string, queued: string) => held()?.unqueue(id, queued),
    'chat.queuedPicture': (id: string, queued: string, index: number) => held()?.queuedPicture(id, queued, index),
    'chat.requeue': (id: string, queued: string, text: string) => held()?.requeue(id, queued, text),
    'chat.delegate': (id: string, queued: string, history: boolean) => held()?.delegate(id, queued, history),
    'chat.mode': (id: string, mode: SessionMode) => held()?.mode(id, mode),
    'chat.rename': (id: string, title: string) => held()?.rename(id, title),
    'chat.mark': (id: string, status: SessionStatus | undefined) => held()?.mark(id, status),
    'chat.hide': (id: string) => hideChat(id),
    'chat.keep': (id: string, stays: boolean) => held()?.keep(id, stays),
    'chat.remove': (ids: readonly string[]) => deleteChats(ids),
    'chat.read': (id: string) => held()?.read(id),
    'chat.remote': (id: string, on: boolean) => held()?.remote(id, on) ?? { error: 'Not ready yet.' },
    'chat.mcp': (root: string, id: string | undefined, change: McpChange | undefined) => held()?.mcp(root, id, change),
    'chat.browsers': (root: string, id: string | undefined, pick: string | undefined) => held()?.browsers(root, id, pick),
    'chat.git': (root: string) => gitFor(root, (state) => shownPeer()?.webContents.send('peer:tell', 'chat:git', { root, state })),
    'chat.exists': (root: string, path: string) => existsFor(root, path),
    'chat.file': (root: string, path: string) => fileFor(root, path),
    // A page a session serves on the Mac's localhost, opened on the phone: each of its requests is made here.
    'local.fetch': (asked: LocalAsk) => localFetch(asked),
    'chat.repo': (root: string) => repoFor(root),
    'chat.files': (root: string) => filesFor(root),
    // The phone reaches hosts only through this computer: it sees them, answers what they ask, and adds their folders.
    'hosts.list': () => routes?.hosts.views() ?? [],
    'hosts.connect': (id: string) => void routes?.hosts.connect(id),
    'hosts.reconnect': (id: string) => routes?.hosts.reconnect(id),
    'hosts.disconnect': (id: string) => {
      routes?.forwards.closeHost(id)
      routes?.hosts.disconnect(id)
    },
    'hosts.folders': (id: string, path: string | undefined) => routes?.hosts.folders(id, path),
    'hosts.addFolder': (id: string, path: string) => routes?.hosts.addFolder(id, path),
    'hosts.addFolderSaying': (id: string, path: string) => routes?.hosts.addFolderSaying(id, path) ?? { problem: 'Not ready yet.' },
    'hosts.running': (id: string) => routes?.hosts.running(id) ?? 0,
    'hosts.working': (id: string) => (held()?.ids((root) => hostOf(root) === id) ?? []).filter((one) => held()?.busy(one) === true).length,
    'hosts.conversations': (id: string) => held()?.ids((root) => hostOf(root) === id).length ?? 0,
    'hosts.prompts': () => routes?.hosts.prompts() ?? [],
    'hosts.answer': (answer: HostAnswer) => routes?.hosts.answer(answer),
    // A `localhost` link opened on the phone, in a conversation on a host: carried here, the way the Mac's own openLink carries it.
    'hosts.forwardLink': (root: string, href: string) => forwardLink(root, href),
    'chat.forgetProject': (root: string) => forgetProject(root),
    'chat.folders': (path: string | undefined) => foldersIn(path),
    'mac.version': () => app.getVersion(),
    'screen.control': (order: ScreenControl) => control(order, shownDisplay),
    'chat.firstAsked': async (id: string) => {
      const first = (await held()?.items(id))?.find((item) => item.kind === 'mine')
      return first?.kind === 'mine' ? first.text : ''
    },
    // Said on the phone: read as orders, and carried out on its yes; a conversation an order opens is opened on the phone.
    'orders.read': (said: string) => readSaid(said),
    'orders.do': async () => {
      let opened: string | undefined
      const did = await carryOutPlanned((id) => {
        opened = id
      })
      return { ...did, ...(opened === undefined ? {} : { open: opened }) }
    },
    // A video picked on the phone, sent a piece at a time into the same folder the Mac's recordings go.
    'recording.start': (ext: string) => startRecording(ext),
    'recording.part': (part: string) => addToRecording(Buffer.from(part, 'base64')),
    'recording.keep': () => keepRecording(),
    'recording.drop': () => dropRecording(),
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
  if (on && awake === undefined) awake = powerSaveBlocker.start('prevent-app-suspension')
  if (!on && awake !== undefined) {
    powerSaveBlocker.stop(awake)
    awake = undefined
  }
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
    else Menu.setApplicationMenu(null)
    // A packaged app carries its icon in the bundle; run from the source, the Dock would show Electron's, so it shows one that says Local.
    if (!app.isPackaged) app.dock?.setIcon(resolve(import.meta.dirname, '../../assets/icon-dev.png'))
    const held = buildHosts()
    routes = held
    const started = build(held)
    sessions = started
    plans = buildPlans()
    void started.resumeQueues()
    // What was running on hosts when GeckIt closed is still running there, and is picked up. Their hosts are
    // reached first: one not connected is read from the copy kept here, and a conversation begun just before
    // quitting has none yet, so it would come back without what was said in it.
    const running = Object.entries(held.runs.all()).map(([id, run]) => ({ id, root: run.root }))
    const reached = [...new Set(running.map((run) => hostOf(run.root)).filter((id) => id !== undefined))].map((id) => held.hosts.ensure(id))
    void Promise.allSettled(reached).then(() => started.reattach(running))
    nativeTheme.themeSource = getSettings().theme
    guided = getSettings().guideClaude
    void keepGuide(guided)
    keepPhone(getSettings().phone, getSettings().phoneKey)
    asked = listenAsked(startAsked)
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
      record: recordScreen,
    })
    keepShortcuts(getSettings().anywhereOff)
    sweepRecordings()
    startUpdates({
      changed: (view) => tell('update:view', view),
      channel: getSettings().updateChannel,
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
  plans?.dispose()
  // A debounced write still owed to a run's offset is not lost to the second it was waiting out.
  void routes?.runs.flush()
  routes?.forwards.dispose()
  routes?.hosts.dispose()
  closePeer()
  closeAsked(asked)
})
