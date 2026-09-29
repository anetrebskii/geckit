import { contextBridge, ipcRenderer, webUtils } from 'electron'

import type {
  Answered,
  Lineup,
  Browser,
  CardAnswer,
  FileShown,
  Folders,
  ChatFound,
  ChatSession,
  ClaudeAccount,
  ClaudeModel,
  HiddenFolder,
  CutOff,
  ErrorAnswer,
  McpServer,
  CorrectRequest,
  GitState,
  PhoneView,
  PlanUsage,
  RequestChoice,
  Shortcut,
  ShortcutDraft,
  SessionImage,
  SessionItem,
  SessionItems,
  SessionMessage,
  ShellCommand,
  SessionMode,
  SessionNotice,
  SessionStatus,
  Settings,
  TaskOutput,
  TranscribeRequest,
  UpdateView,
  Recording,
  ScreenSource,
  PlaceUsage,
  Uploaded,
  VoiceMode,
} from '../shared/api'
import type { HostAnswer, HostCheck, HostDraft, HostPrompt, HostView, KnownHost } from '../shared/hosts'
import type { Link } from '../shared/links'
import { pieceOf } from '../shared/pairing'
import type { Pairing, Piece } from '../shared/pairing'

/**
 * Everything a window may ask the main process, and nothing else.
 *
 * No `ipcRenderer` is handed over: a window names what it wants, and what it
 * wants is on this list.
 */

const listen = <T>(channel: string, said: (value: T) => void): (() => void) => {
  const on = (_event: unknown, value: T): void => said(value)
  ipcRenderer.on(channel, on)
  return () => {
    ipcRenderer.off(channel, on)
  }
}

const geckit = {
  platform: process.platform,
  /** The home folder, for writing paths under it as ~. */
  home: process.env['HOME'] ?? '',

  /** Puts both on the clipboard, so a paste takes the formatting where it can and the text where it cannot. */
  copy: (text: string, html: string): void => ipcRenderer.send('clipboard:write', text, html),

  /** Where a dropped file is, which the file itself no longer says. */
  pathFor: (file: File): string => webUtils.getPathForFile(file),

  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    set: (change: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:set', change),
    on: (said: (settings: Settings) => void): (() => void) => listen('settings:changed', said),
    /** The system's picker, opened on the Applications folder. */
    pickApp: (): Promise<string | undefined> => ipcRenderer.invoke('settings:pickApp'),
    /** Whether GeckIt may press keys in other apps, which pasting what was said needs. Always true off macOS. */
    accessibility: (): Promise<boolean> => ipcRenderer.invoke('settings:accessibility'),
    openAccessibility: (): void => ipcRenderer.send('settings:openAccessibility'),
  },

  errors: {
    /** What would be sent, while the question about errors is due. */
    question: (): Promise<string | undefined> => ipcRenderer.invoke('errors:question'),
    onQuestion: (said: (report: string | undefined) => void): (() => void) => listen('errors:question', said),
    answer: (answer: ErrorAnswer): void => ipcRenderer.send('errors:answer', answer),
    hold: (name: string, message: string, stack: string): void => ipcRenderer.send('errors:hold', name, message, stack),
  },
  update: {
    view: (): Promise<UpdateView> => ipcRenderer.invoke('update:view'),
    check: (): Promise<UpdateView> => ipcRenderer.invoke('update:check'),
    /** Now, or once no conversation is still working. */
    restart: (): void => ipcRenderer.send('update:restart'),
    on: (said: (view: UpdateView) => void): (() => void) => listen('update:view', said),
  },

  correct: (request: CorrectRequest): Promise<Answered> => ipcRenderer.invoke('correct', request),

  shortcuts: {
    save: (draft: ShortcutDraft): Promise<Shortcut> => ipcRenderer.invoke('shortcuts:save', draft),
    remove: (id: string): void => ipcRenderer.send('shortcuts:remove', id),
    /** Run by hand: the conversation it started, or nothing where it could not. */
    run: (id: string): Promise<string | undefined> => ipcRenderer.invoke('shortcuts:run', id),
    /** The tray asked for the list, `new`, or one shortcut by id to edit. */
    onManage: (said: (edit: string) => void): (() => void) => listen('chat:shortcuts', said),
  },

  transcribe: (request: TranscribeRequest): Promise<Answered> => ipcRenderer.invoke('transcribe', request),

  chat: {
    open: (): void => ipcRenderer.send('chat:open'),
    account: (): Promise<ClaudeAccount> => ipcRenderer.invoke('chat:account'),
    /** A project's own root asks a host's own claude, where one is given; without it, this computer's. */
    models: (root?: string): Promise<ClaudeModel[] | undefined> => ipcRenderer.invoke('chat:models', root),
    /** The plan's windows as last measured. Asking has them measured again; the fresh ones arrive through onPlan. */
    plan: (): Promise<PlanUsage | undefined> => ipcRenderer.invoke('chat:plan'),
    onPlan: (said: (plan: PlanUsage) => void): (() => void) => listen('chat:plan', said),
    /** Every place's plan, this computer's and each connected host's, as last measured; asking has them measured again, the fresh ones arrive through onPlans. */
    plans: (): Promise<PlaceUsage[]> => ipcRenderer.invoke('chat:plans'),
    onPlans: (said: (plans: readonly PlaceUsage[]) => void): (() => void) => listen('chat:plans', said),
    /** The folder picker. The folder chosen is remembered and given back. */
    addProject: (): Promise<string | undefined> => ipcRenderer.invoke('chat:addProject'),
    forgetProject: (root: string): Promise<void> => ipcRenderer.invoke('chat:forgetProject', root),
    /** Puts a folder on the list of projects, as Add a project does once one is chosen. */
    rememberProject: (root: string): Promise<void> => ipcRenderer.invoke('chat:rememberProject', root),
    /** What the tool kept that no board lists, from the last 30 days or from before them. */
    hidden: (older: boolean): Promise<HiddenFolder[]> => ipcRenderer.invoke('chat:hidden', older),
    bring: (id: string): Promise<void> => ipcRenderer.invoke('chat:bring', id),
    /** Nothing for the project is every conversation, in every project offered. */
    list: (root: string | undefined): Promise<ChatSession[]> => ipcRenderer.invoke('chat:list', root),
    items: (id: string): Promise<SessionItem[]> => ipcRenderer.invoke('chat:items', id),
    waiting: (id: string): Promise<SessionItem | undefined> => ipcRenderer.invoke('chat:waiting', id),
    /** What is before a line of a conversation; the phone is sent a conversation's end first, this window all of it. */
    before: async (id: string, before: string): Promise<Piece> =>
      pieceOf((await ipcRenderer.invoke('chat:items', id)) as SessionItem[], before, 200),
    /** A picture the phone was sent by name, at the width it is drawn; this window is sent them whole. */
    picture: (_ref: string, _width: number): Promise<SessionImage | undefined> => Promise.resolve(undefined),
    /** Steps of a conversation by their ids, for a run the phone was sent as one line. */
    steps: async (id: string, ids: readonly string[]): Promise<SessionItem[]> =>
      ((await ipcRenderer.invoke('chat:items', id)) as SessionItem[]).filter((item) => ids.includes(item.id)),
    /** How much of the open conversation is still on the Mac only, which only the phone is told. */
    onEarlier: (said: (earlier: { readonly id: string; readonly left: number }) => void): (() => void) => listen('chat:earlier', said),
    links: (id: string): Promise<Link[]> => ipcRenderer.invoke('chat:links', id),
    /** What closing GeckIt cut off, the first time a window asks after a start, and nothing after that. */
    cutOff: (): Promise<CutOff[]> => ipcRenderer.invoke('chat:cutOff'),
    /** Sends "continue" to each of them. */
    proceed: (ids: readonly string[]): void => ipcRenderer.send('chat:proceed', ids),
    /** Conversations in one project, or in every one offered, with a message holding every word. Nothing asked readies the index. */
    search: (asked: string, root?: string): Promise<ChatFound[]> => ipcRenderer.invoke('chat:search', asked, root),
    send: (message: SessionMessage): Promise<string> => ipcRenderer.invoke('chat:send', message),
    /** A command typed after `!`, run in the project; says which conversation it is in. */
    shell: (command: ShellCommand): Promise<string> => ipcRenderer.invoke('chat:shell', command),
    stopShell: (id: string, item: string): void => ipcRenderer.send('chat:stopShell', id, item),
    /** A line typed to a command typed after `!` that is still running, Enter included. */
    typeShell: (id: string, item: string, text: string): void => ipcRenderer.send('chat:typeShell', id, item, text),
    /** A command still running, sent on in the background as Ctrl+B does in a terminal. */
    toBackground: (id: string, item: string): void => ipcRenderer.send('chat:toBackground', id, item),
    stopTask: (id: string, task: string): void => ipcRenderer.send('chat:stopTask', id, task),
    /** Takes a task that has ended off the list. */
    clearTask: (id: string, task: string): void => ipcRenderer.send('chat:clearTask', id, task),
    taskOutput: (id: string, task: string): Promise<TaskOutput | undefined> => ipcRenderer.invoke('chat:taskOutput', id, task),
    answer: (id: string, card: string, answer: CardAnswer | string): void =>
      ipcRenderer.send('chat:answer', id, card, answer),
    /** Answers a request from `geckit start`: the ticked tasks start, the rest are refused. */
    answerRequest: (request: string, choice: RequestChoice): Promise<void> => ipcRenderer.invoke('chat:answerRequest', request, choice),
    startAll: (request: string, where: 'mac' | 'phone'): Promise<void> => ipcRenderer.invoke('chat:startAll', request, where),
    stop: (id: string): void => ipcRenderer.send('chat:stop', id),
    /** Takes a message out of the queue before it goes, and gives it back. */
    unqueue: (id: string, queued: string): Promise<SessionMessage | undefined> => ipcRenderer.invoke('chat:unqueue', id, queued),
    /** A picture waiting with a queued message; the phone is sent it at the width it is drawn, this window whole. */
    queuedPicture: (id: string, queued: string, index: number, _width: number): Promise<SessionImage | undefined> =>
      ipcRenderer.invoke('chat:queuedPicture', id, queued, index),
    /** A message waiting in the queue, said again in other words; it keeps its place and its pictures. */
    requeue: (id: string, queued: string, text: string): void => ipcRenderer.send('chat:requeue', id, queued, text),
    /** Starts a message waiting in the queue as a new conversation, empty or with this one's history as it was then, and says which. */
    delegate: (id: string, queued: string, history: boolean): Promise<string | undefined> =>
      ipcRenderer.invoke('chat:delegate', id, queued, history),
    /** How a session may act, chosen under the field: it holds from now, not from the next message. */
    mode: (id: string, mode: SessionMode): void => ipcRenderer.send('chat:mode', id, mode),
    rename: (id: string, title: string): void => ipcRenderer.send('chat:rename', id, title),
    mark: (id: string, status: SessionStatus | undefined): void => ipcRenderer.send('chat:mark', id, status ?? null),
    hide: (id: string): void => ipcRenderer.send('chat:hide', id),
    /** Keeps a general question for good, or lets it go a day after its last answer again. */
    keep: (id: string, stays: boolean): void => ipcRenderer.send('chat:keep', id, stays),
    /** Deletes the files the tool keeps them in, and says whose are gone. */
    remove: (ids: readonly string[]): Promise<readonly string[]> => ipcRenderer.invoke('chat:delete', ids),
    /** Which session is in front, so an answer that arrives here is not announced. */
    watching: (id: string | undefined): void => ipcRenderer.send('chat:watching', id),
    /** Takes the answer as read without opening it: the mark on the row is pressed. */
    read: (id: string): void => ipcRenderer.send('chat:read', id),
    /** Opens a terminal in the project with `claude --resume` already running. */
    terminal: (id: string, root: string): void => ipcRenderer.send('chat:terminal', id, root),
    /** Lets go of the process holding it, since it is about to be continued somewhere else. */
    handOver: (id: string): void => ipcRenderer.send('chat:handOver', id),
    /** Remote Control on or off for a conversation: where it is on claude.ai, or why not. */
    remote: (id: string, on: boolean): Promise<{ readonly url?: string; readonly error?: string }> =>
      ipcRenderer.invoke('chat:remote', id, on),
    /** A project's MCP servers and how each stands, with one switched on or off first. Nothing where the tool would not say. */
    mcp: (
      root: string,
      id: string | undefined,
      change?: { readonly name: string; readonly enabled: boolean },
    ): Promise<McpServer[] | undefined> => ipcRenderer.invoke('chat:mcp', root, id, change),
    /** The Chromes Claude in Chrome is signed in to, with one picked first. Nothing where the tool would not say. */
    browsers: (root: string, id: string | undefined, pick?: string): Promise<Browser[] | undefined> =>
      ipcRenderer.invoke('chat:browsers', root, id, pick),
    /** Where the project's checkout stands. Asking also has the remote asked, now and then; what it says arrives through onGit. */
    git: (root: string): Promise<GitState | undefined> => ipcRenderer.invoke('chat:git', root),
    onGit: (said: (git: { readonly root: string; readonly state: GitState | undefined }) => void): (() => void) =>
      listen('chat:git', said),
    /** Shows a file the assistant touched in the Finder. */
    reveal: (root: string, path: string): void => ipcRenderer.send('chat:reveal', root, path),
    /** Opens it in the application chosen for its kind in Settings. */
    openFile: (root: string, path: string): void => ipcRenderer.send('chat:openFile', root, path),
    /** The right-click menu for a file: open, open with, always open its kind with, show in the Finder. */
    fileMenu: (root: string, path: string): void => ipcRenderer.send('chat:fileMenu', root, path),
    /** Whether a path said in a conversation is there: from the project, or from the home folder for ~. */
    exists: (root: string, path: string): Promise<boolean> => ipcRenderer.invoke('chat:exists', root, path),
    /** A file read for the phone to show, which has no application to open it in. */
    file: (root: string, path: string): Promise<FileShown> => ipcRenderer.invoke('chat:file', root, path),
    repo: (root: string): Promise<string | undefined> => ipcRenderer.invoke('chat:repo', root),
    /** Every file and folder in a project, as paths from it, for @. */
    files: (root: string): Promise<string[]> => ipcRenderer.invoke('chat:files', root),
    /** A file carried to a project on a host, for a message to point at: where it landed there, or unchanged for a local root. */
    upload: (root: string, path: string): Promise<Uploaded> => ipcRenderer.invoke('chat:upload', root, path),
    openLink: (href: string): void => ipcRenderer.send('open:link', href),
    onSessions: (said: (sessions: readonly ChatSession[]) => void): (() => void) =>
      listen('chat:sessions', said),
    onItems: (said: (items: SessionItems) => void): (() => void) => listen('chat:items', said),
    onAccount: (said: (account: ClaudeAccount) => void): (() => void) => listen('chat:accountChanged', said),
    /** A notification was pressed, or the panel asked for a session to be shown. */
    onShow: (said: (id: string) => void): (() => void) => listen('chat:show', said),
    /** A recording made for the open form, to go into it. */
    onRecorded: (said: (recording: Recording) => void): (() => void) => listen('chat:recorded', said),
    /** Something happened in another conversation while this window is in front. */
    onNotice: (said: (notice: SessionNotice) => void): (() => void) => listen('chat:notice', said),
    /** The search shortcut was pressed in another application, or again over the search. */
    onSpotlight: (said: (again: boolean) => void): (() => void) => listen('chat:spotlight', said),
    /** Everything above is listened for: what main held while the window loaded can come now. */
    listening: (): void => ipcRenderer.send('chat:listening'),
  },

  /** The tasks waiting for fewer conversations to be working, and how full the conversations working are. */
  lineup: {
    state: (): Promise<Lineup | undefined> => ipcRenderer.invoke('lineup:state'),
    onChanged: (said: (lineup: Lineup) => void): (() => void) => listen('lineup:changed', said),
  },

  /** Other computers conversations run on, reached over SSH. */
  hosts: {
    list: (): Promise<HostView[]> => ipcRenderer.invoke('hosts:list'),
    onChanged: (said: (hosts: readonly HostView[]) => void): (() => void) => listen('hosts:changed', said),
    /** The hosts in the person's SSH config, offered as an address is typed. */
    known: (): Promise<KnownHost[]> => ipcRenderer.invoke('hosts:known'),
    /** Reaches a host not yet added, and keeps it once it was reached; what it checks arrives through onChecks. */
    check: (draft: HostDraft): Promise<{ readonly ok: true; readonly host: HostView } | { readonly ok: false; readonly problem: string }> =>
      ipcRenderer.invoke('hosts:check', draft),
    /** Edits a host already kept. Only its name changed is saved without a connection; anything else is checked again, what it checks arriving through onChecks too. */
    update: (id: string, draft: HostDraft): Promise<{ readonly ok: true; readonly host: HostView } | { readonly ok: false; readonly problem: string }> =>
      ipcRenderer.invoke('hosts:update', id, draft),
    onChecks: (said: (lines: readonly HostCheck[]) => void): (() => void) => listen('hosts:checks', said),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('hosts:remove', id),
    /** Lets go of a stored password without removing the host. */
    forget: (id: string): void => ipcRenderer.send('hosts:forget', id),
    connect: (id: string): void => ipcRenderer.send('hosts:connect', id),
    reconnect: (id: string): void => ipcRenderer.send('hosts:reconnect', id),
    disconnect: (id: string): void => ipcRenderer.send('hosts:disconnect', id),
    /** One level of a host's folders, from its home where no path is given. */
    folders: (id: string, path?: string): Promise<Folders | undefined> => ipcRenderer.invoke('hosts:folders', id, path ?? null),
    /** A folder on a host as a project; the project's root is given back. */
    addFolder: (id: string, path: string): Promise<string | undefined> => ipcRenderer.invoke('hosts:addFolder', id, path),
    /** `addFolder`, but with why it failed rather than only that it did. */
    addFolderSaying: (id: string, path: string): Promise<{ readonly root: string } | { readonly problem: string }> =>
      ipcRenderer.invoke('hosts:addFolderSaying', id, path),
    /** What hosts are asking now, and each new question as it is asked. */
    prompts: (): Promise<HostPrompt[]> => ipcRenderer.invoke('hosts:prompts'),
    onPrompt: (said: (prompt: HostPrompt) => void): (() => void) => listen('hosts:prompt', said),
    onAnswered: (said: (id: string) => void): (() => void) => listen('hosts:answered', said),
    answer: (answer: HostAnswer): void => ipcRenderer.send('hosts:answer', answer),
    install: (id: string): Promise<{ readonly ok: boolean; readonly text: string }> => ipcRenderer.invoke('hosts:install', id),
    /** Forgets a host's changed key from wherever ssh itself keeps it and reaches it again; why it could not, where it could not. */
    trustNewKey: (id: string): Promise<{ readonly ok: true } | { readonly ok: false; readonly problem: string }> => ipcRenderer.invoke('hosts:trustNewKey', id),
    /** How many runs Remove would stop on the host now, idle ones too. */
    running: (id: string): Promise<number> => ipcRenderer.invoke('hosts:running', id),
    /** How many conversations on the host are actually working or waiting on an answer now, for Disconnect. */
    working: (id: string): Promise<number> => ipcRenderer.invoke('hosts:working', id),
    /** How many conversations on the host are listed at all, for Remove to say how many stay behind. */
    conversations: (id: string): Promise<number> => ipcRenderer.invoke('hosts:conversations', id),
    /** A terminal signed in to the host, running `run` there where one is given. */
    terminal: (id: string, run?: string): void => ipcRenderer.send('hosts:terminal', id, run ?? null),
    /** What a terminal types to resume a particular conversation on a host; nothing for a local root. */
    resumeLine: (root: string, id: string): Promise<string | undefined> => ipcRenderer.invoke('hosts:resumeLine', root, id),
  },

  voice: {
    /** Transcribe, put it on the clipboard, and paste it back where the person was. */
    done: (request: TranscribeRequest): Promise<Answered> => ipcRenderer.invoke('voice:done', request),
    /** The yes: what was read as orders a moment ago is carried out. */
    do: (): Promise<Answered> => ipcRenderer.invoke('voice:do'),
    /** Opens the capsule to say what the application should do, as the shortcut does. */
    orders: (): void => ipcRenderer.send('voice:orders'),
    /** Opens the capsule to record the screen, as the shortcut does. */
    record: (): void => ipcRenderer.send('voice:record'),
    /** Whether a New task or Ask form is open, which a recording then goes into. */
    form: (open: boolean): void => ipcRenderer.send('voice:form', open),
    /** Dictation into what has the cursor in this window. */
    dictate: (): void => ipcRenderer.send('voice:dictate'),
    /** A form's recording, handed back to the form. */
    fill: (recording: Recording): void => ipcRenderer.send('voice:fill', recording),
    /** The capsule grows to hold what it asks about. */
    /** `middle`: it has become a card to read, so it is put in the middle of the screen, once. */
    size: (height: number, width?: number, middle?: boolean): void => ipcRenderer.send('voice:size', height, width, middle),
    /** What the capsule was opened for. */
    mode: (): Promise<VoiceMode> => ipcRenderer.invoke('voice:mode'),
    /** The screen under the pointer, to record. */
    screen: (): Promise<ScreenSource> => ipcRenderer.invoke('voice:screen'),
    /** A new video file for the recording that is starting; answers where. */
    video: (): Promise<string> => ipcRenderer.invoke('voice:video'),
    /** The next second or so of the video, added to its file. */
    videoPart: (part: Uint8Array): void => ipcRenderer.send('voice:videoPart', part),
    /** A recording asked about as a general question, opened in Chat. */
    ask: (recording: Recording): Promise<Answered> => ipcRenderer.invoke('voice:ask', recording),
    /** A recording read as a task: the project and the words, waiting for the yes that `do` gives. */
    task: (recording: Recording): Promise<Answered> => ipcRenderer.invoke('voice:task', recording),
    /** The Mac's own page for allowing screen recording. */
    allow: (): void => ipcRenderer.send('voice:allow'),
    cancel: (): void => ipcRenderer.send('voice:cancel'),
    onStart: (said: () => void): (() => void) => listen('voice:start', said),
    onStop: (said: () => void): (() => void) => listen('voice:stop', said),
  },

  phone: {
    state: (): Promise<PhoneView> => ipcRenderer.invoke('phone:state'),
    onState: (said: (view: PhoneView) => void): (() => void) => listen('phone:state', said),
    /** A new key: every phone on the old one has to scan again. */
    newCode: (): void => ipcRenderer.send('phone:newCode'),
  },

  /** The hidden window the phone is answered in, and nothing else, uses these. */
  peer: {
    pairing: (): Promise<Pairing | undefined> => ipcRenderer.invoke('peer:pairing'),
    call: (name: string, args: readonly unknown[]): Promise<unknown> => ipcRenderer.invoke('peer:call', name, args),
    onTell: (said: (channel: string, value: unknown) => void): (() => void) => {
      const on = (_event: unknown, channel: string, value: unknown): void => said(channel, value)
      ipcRenderer.on('peer:tell', on)
      return () => {
        ipcRenderer.off('peer:tell', on)
      }
    },
    state: (count: number, trouble: string | undefined): void => ipcRenderer.send('peer:state', count, trouble ?? null),
    /** Which screen to capture for a phone, or why this Mac will not let it be. */
    screen: (): Promise<{ readonly id?: string; readonly error?: string }> => ipcRenderer.invoke('peer:screen'),
  },

  panel: {
    /** Cmd+C+D: what was selected in the application the person was in. */
    onText: (said: (text: string) => void): (() => void) => listen('panel:text', said),
  },
}

contextBridge.exposeInMainWorld('geckit', geckit)

export type Geckit = typeof geckit
