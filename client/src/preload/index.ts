import { contextBridge, ipcRenderer, webUtils } from 'electron'

import type {
  Answered,
  Browser,
  CardAnswer,
  ChatFound,
  ChatSession,
  ClaudeAccount,
  ClaudeModel,
  McpServer,
  CorrectRequest,
  GitState,
  PhoneView,
  PlanUsage,
  Shortcut,
  ShortcutDraft,
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
} from '../shared/api'
import type { Link } from '../shared/links'
import type { Pairing } from '../shared/pairing'

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
    models: (): Promise<ClaudeModel[] | undefined> => ipcRenderer.invoke('chat:models'),
    /** The plan's windows as last measured. Asking has them measured again; the fresh ones arrive through onPlan. */
    plan: (): Promise<PlanUsage | undefined> => ipcRenderer.invoke('chat:plan'),
    onPlan: (said: (plan: PlanUsage) => void): (() => void) => listen('chat:plan', said),
    /** The folder picker. The folder chosen is remembered and given back. */
    addProject: (): Promise<string | undefined> => ipcRenderer.invoke('chat:addProject'),
    forgetProject: (root: string): Promise<void> => ipcRenderer.invoke('chat:forgetProject', root),
    /** Nothing for the project is every conversation, in every project offered. */
    list: (root: string | undefined): Promise<ChatSession[]> => ipcRenderer.invoke('chat:list', root),
    items: (id: string): Promise<SessionItem[]> => ipcRenderer.invoke('chat:items', id),
    links: (id: string): Promise<Link[]> => ipcRenderer.invoke('chat:links', id),
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
    stop: (id: string): void => ipcRenderer.send('chat:stop', id),
    /** Takes a message out of the queue before it goes, and gives it back. */
    unqueue: (id: string, queued: string): Promise<SessionMessage | undefined> => ipcRenderer.invoke('chat:unqueue', id, queued),
    /** A message waiting in the queue, said again in other words; it keeps its place and its pictures. */
    requeue: (id: string, queued: string, text: string): void => ipcRenderer.send('chat:requeue', id, queued, text),
    /** Starts a message waiting in the queue as a new conversation, and says which. */
    delegate: (id: string, queued: string): Promise<string | undefined> => ipcRenderer.invoke('chat:delegate', id, queued),
    /** How a session may act, chosen under the field: it holds from now, not from the next message. */
    mode: (id: string, mode: SessionMode): void => ipcRenderer.send('chat:mode', id, mode),
    rename: (id: string, title: string): void => ipcRenderer.send('chat:rename', id, title),
    mark: (id: string, status: SessionStatus | undefined): void => ipcRenderer.send('chat:mark', id, status ?? null),
    hide: (id: string): void => ipcRenderer.send('chat:hide', id),
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
    repo: (root: string): Promise<string | undefined> => ipcRenderer.invoke('chat:repo', root),
    /** Every file and folder in a project, as paths from it, for @. */
    files: (root: string): Promise<string[]> => ipcRenderer.invoke('chat:files', root),
    openLink: (href: string): void => ipcRenderer.send('open:link', href),
    onSessions: (said: (sessions: readonly ChatSession[]) => void): (() => void) =>
      listen('chat:sessions', said),
    onItems: (said: (items: SessionItems) => void): (() => void) => listen('chat:items', said),
    onAccount: (said: (account: ClaudeAccount) => void): (() => void) => listen('chat:accountChanged', said),
    /** A notification was pressed, or the panel asked for a session to be shown. */
    onShow: (said: (id: string) => void): (() => void) => listen('chat:show', said),
    /** Something happened in another conversation while this window is in front. */
    onNotice: (said: (notice: SessionNotice) => void): (() => void) => listen('chat:notice', said),
    /** The search shortcut was pressed in another application, or again over the search. */
    onSpotlight: (said: (again: boolean) => void): (() => void) => listen('chat:spotlight', said),
    /** Everything above is listened for: what main held while the window loaded can come now. */
    listening: (): void => ipcRenderer.send('chat:listening'),
  },

  voice: {
    /** Transcribe, put it on the clipboard, and paste it back where the person was. */
    done: (request: TranscribeRequest): Promise<Answered> => ipcRenderer.invoke('voice:done', request),
    /** The yes: what was read as orders a moment ago is carried out. */
    do: (): Promise<Answered> => ipcRenderer.invoke('voice:do'),
    /** Opens the capsule to say what the application should do, as the shortcut does. */
    orders: (): void => ipcRenderer.send('voice:orders'),
    /** The capsule grows to hold what it asks about. */
    size: (height: number): void => ipcRenderer.send('voice:size', height),
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
