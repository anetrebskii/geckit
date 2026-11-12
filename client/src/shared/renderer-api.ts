import type {
  ViewFrame,
  ViewInput,
  Answered,
  ConfigurationApi,
  Lineup,
  Browser,
  CardAnswer,
  FileShown,
  Folders,
  ChatFound,
  ChatSession,
  ConversationContinuation,
  PreparedConversationDraft,
  ConversationExport,
  ClaudeTransport,
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
  TeamChoice,
  Shortcut,
  ShortcutDraft,
  SessionImage,
  SessionItem,
  SessionItems,
  SessionMessage,
  ShellCommand,
  SessionMode,
  SessionProvider,
  SessionNotice,
  SessionStatus,
  Settings,
  TaskOutput,
  SpeechModel,
  BrowserBridgeState,
  TranscribeRequest,
  UpdateView,
  Recording,
  ScreenSource,
  PlaceUsage,
  Uploaded,
  VoiceMode,
} from './api'
import type { GeckoAction, GeckoHanded, GeckoItem, GeckoRing, GeckoView } from './gecko'
import type { HostAnswer, HostCheck, HostDraft, HostPrompt, HostView, KnownHost } from './hosts'
import type { Link } from './links'
import type { LlmProviderInfo, PluginUpdateResult, ProviderPluginFailure } from './providers'
import { pieceOf } from './pairing'
import type { Piece } from './pairing'
import type { VoiceMemosConnection } from './manager-intake'
import type { ManagerApi, ManagerAnswerRequest, ManagerAnswerResult, ManagerConfig, ManagerRequestReceipt, ManagerSendRequest, ManagerView } from './manager'
import type { TelegramAction, TelegramApi, TelegramView } from './telegram'
import type { ChannelChange, ChannelId, ChannelInspectRequest, ChannelInspectResult, ChannelsView } from './channels'
import type { EmployeeDraft, EmployeeMemory, EmployeesApi, EmployeesView } from './employees'
import type { SessionListStatus } from './session-list'

export type RendererArgument = object | string | number | boolean | null | undefined

export interface RendererTransport {
  invoke<Result>(channel: string, ...args: readonly RendererArgument[]): Promise<Result>
  send(channel: string, ...args: readonly RendererArgument[]): void
  listen<Value>(channel: string, said: (value: Value) => void): () => void
}

export interface RendererNative {
  readonly platform: string
  readonly home: string
  readonly pathFor: (file: File) => string
}

export function createRendererApi(rendererTransport: RendererTransport, native: RendererNative) {
return {
  platform: native.platform,
  /** The home folder, for writing paths under it as ~. */
  home: native.home,

  /** Puts both on the clipboard, so a paste takes the formatting where it can and the text where it cannot. */
  copy: (text: string, html: string): void => rendererTransport.send('clipboard:write', text, html),

  /** Where a dropped file is, which the file itself no longer says. */
  pathFor: (file: File): string => native.pathFor(file),

  configuration: {
    reveal: (): Promise<void> => rendererTransport.invoke('configuration:reveal'),
    export: (): Promise<boolean> => rendererTransport.invoke('configuration:export'),
    import: (): Promise<boolean> => rendererTransport.invoke('configuration:import'),
  } satisfies ConfigurationApi,

  employees: {
    list: (): Promise<EmployeesView> => rendererTransport.invoke('employees:list'),
    save: (draft: EmployeeDraft): Promise<EmployeesView> => rendererTransport.invoke('employees:save', draft),
    archive: (id: string, revision: number): Promise<EmployeesView> => rendererTransport.invoke('employees:archive', id, revision),
    restore: (id: string, revision: number): Promise<EmployeesView> => rendererTransport.invoke('employees:restore', id, revision),
    retryInstructions: (): Promise<EmployeesView> => rendererTransport.invoke('employees:retryInstructions'),
    memory: (id: string, cursor?: string): Promise<EmployeeMemory> => rendererTransport.invoke('employees:memory', id, cursor),
    on: (said: (view: EmployeesView) => void): (() => void) => rendererTransport.listen('employees:changed', said),
  } satisfies EmployeesApi,

  manager: {
    voiceMemos: (action?: 'privacy'): Promise<VoiceMemosConnection> => rendererTransport.invoke('manager:voice-memos', action),
    view: (): Promise<ManagerView> => rendererTransport.invoke('manager:view'),
    history: (request: Parameters<ManagerApi['history']>[0]): Promise<ManagerView> => rendererTransport.invoke('manager:history', request),
    inspect: (id: string): Promise<SessionItems> => rendererTransport.invoke('manager:inspect', id),
    send: (request: ManagerSendRequest): Promise<ManagerRequestReceipt> => rendererTransport.invoke('manager:sendApp', request),
    receipt: (id: ManagerSendRequest['id']): Promise<ManagerRequestReceipt | undefined> => rendererTransport.invoke('manager:receipt', id),
    answer: (request: ManagerAnswerRequest): Promise<ManagerAnswerResult> => rendererTransport.invoke('manager:answerApp', request),
    answerCard: (session: string, card: string, answer: string): Promise<boolean> => rendererTransport.invoke('manager:answerCard', session, card, answer),
    onItems: (said: (items: SessionItems) => void): (() => void) => rendererTransport.listen('manager:items', said),
    configure: (change: Partial<ManagerConfig>): Promise<ManagerView> => rendererTransport.invoke('manager:configure', change),
    pause: (): Promise<ManagerView> => rendererTransport.invoke('manager:pause'),
    resume: (): Promise<ManagerView> => rendererTransport.invoke('manager:resume'),
    retry: (): Promise<ManagerView> => rendererTransport.invoke('manager:retry'),
    restart: (): Promise<ManagerView> => rendererTransport.invoke('manager:restart'),
    on: (said: (view: ManagerView) => void): (() => void) => rendererTransport.listen('manager:view', said),
  } satisfies ManagerApi,

  telegram: {
    view: (): Promise<TelegramView> => rendererTransport.invoke('telegram:view'),
    action: (action: TelegramAction): Promise<TelegramView> => rendererTransport.invoke('telegram:action', action),
    on: (said: (view: TelegramView) => void): (() => void) => rendererTransport.listen('telegram:view', said),
  } satisfies TelegramApi,

  channels: {
    view: (): Promise<ChannelsView> => rendererTransport.invoke('channels:view'),
    install: (url: string): Promise<ChannelsView> => rendererTransport.invoke('channels:install', url),
    configure: (id: ChannelId, change: ChannelChange): Promise<ChannelsView> => rendererTransport.invoke('channels:configure', id, change),
    remove: (id: ChannelId): Promise<ChannelsView> => rendererTransport.invoke('channels:remove', id),
    /** What a channel sees with its saved settings, for its Set up. */
    inspect: (id: ChannelId, request: ChannelInspectRequest): Promise<ChannelInspectResult> => rendererTransport.invoke('channels:inspect', id, request),
    checkUpdates: (): Promise<{ readonly updated: readonly ChannelId[]; readonly failed: readonly ChannelId[] }> => rendererTransport.invoke('channels:checkUpdates'),
    on: (said: (view: ChannelsView) => void): (() => void) => rendererTransport.listen('channels:changed', said),
  },

  settings: {
    get: (): Promise<Settings> => rendererTransport.invoke('settings:get'),
    set: (change: Partial<Settings>): Promise<Settings> => rendererTransport.invoke('settings:set', change),
    on: (said: (settings: Settings) => void): (() => void) => rendererTransport.listen('settings:changed', said),
    /** The system's picker, opened on the Applications folder. */
    pickApp: (): Promise<string | undefined> => rendererTransport.invoke('settings:pickApp'),
    /** Whether GeckIt may press keys in other apps, which pasting what was said needs. Always true off macOS. */
    accessibility: (): Promise<boolean> => rendererTransport.invoke('settings:accessibility'),
    openAccessibility: (): void => rendererTransport.send('settings:openAccessibility'),
  },


  errors: {
    /** What would be sent, while the question about errors is due. */
    question: (): Promise<string | undefined> => rendererTransport.invoke('errors:question'),
    onQuestion: (said: (report: string | undefined) => void): (() => void) => rendererTransport.listen('errors:question', said),
    answer: (answer: ErrorAnswer): void => rendererTransport.send('errors:answer', answer),
    hold: (name: string, message: string, stack: string): void => rendererTransport.send('errors:hold', name, message, stack),
  },
  update: {
    view: (): Promise<UpdateView> => rendererTransport.invoke('update:view'),
    check: (): Promise<UpdateView> => rendererTransport.invoke('update:check'),
    /** Now, or once no conversation is still working. */
    restart: (): void => rendererTransport.send('update:restart'),
    on: (said: (view: UpdateView) => void): (() => void) => rendererTransport.listen('update:view', said),
  },

  correct: (request: CorrectRequest): Promise<Answered> => rendererTransport.invoke('correct', request),

  shortcuts: {
    save: (draft: ShortcutDraft): Promise<Shortcut> => rendererTransport.invoke('shortcuts:save', draft),
    remove: (id: string): void => rendererTransport.send('shortcuts:remove', id),
    /** Run by hand: the conversation it started, or nothing where it could not. */
    run: (id: string): Promise<string | undefined> => rendererTransport.invoke('shortcuts:run', id),
    /** The tray asked for the list, `new`, or one shortcut by id to edit. */
    onManage: (said: (edit: string) => void): (() => void) => rendererTransport.listen('chat:shortcuts', said),
  },

  transcribe: (request: TranscribeRequest): Promise<Answered> => rendererTransport.invoke('transcribe', request),

  /** The model dictation hears with on this computer: where its download stands, starting it, and each step of it. */
  speech: {
    model: (): Promise<SpeechModel> => rendererTransport.invoke('speech:model'),
    fetch: (): void => rendererTransport.send('speech:fetch'),
    onModel: (said: (model: SpeechModel) => void): (() => void) => rendererTransport.listen('speech:model', said),
  },

  /** A sign-in link opened from another app: the desktop shows its computer's live view. */
  signIn: {
    onOpen: (said: (url: string) => void): (() => void) => rendererTransport.listen('remote:signin', said),
  },

  /** Chrome through GeckIt: whether the extension answers, the find model, and the folder Chrome loads the extension from. */
  browser: {
    state: (): Promise<BrowserBridgeState> => rendererTransport.invoke('browser:state'),
    fetchModel: (): Promise<void> => rendererTransport.invoke('browser:fetchModel'),
    deleteModel: (): Promise<void> => rendererTransport.invoke('browser:deleteModel'),
    openTest: (name: string): Promise<void> => rendererTransport.invoke('browser:openTest', name),
    deleteTest: (name: string): Promise<void> => rendererTransport.invoke('browser:deleteTest', name),
    /** Makes a test profile for one account, or changes which account its note names. */
    account: (name: string, note: string): Promise<void> => rendererTransport.invoke('browser:account', name, note),
    updateTest: (name: string, next: string, note: string): Promise<void> => rendererTransport.invoke('browser:updateTest', name, next, note),
    viewStart: (name: string, url?: string, token?: string): Promise<{ readonly width: number; readonly height: number }> => rendererTransport.invoke('browser:viewStart', name, url, token),
    viewFrame: (name: string): Promise<ViewFrame> => rendererTransport.invoke('browser:viewFrame', name),
    viewInput: (name: string, input: ViewInput): Promise<void> => rendererTransport.invoke('browser:viewInput', name, input),
    viewEnd: (name: string): Promise<void> => rendererTransport.invoke('browser:viewEnd', name),
    openFolder: (): Promise<void> => rendererTransport.invoke('browser:openFolder'),
  },

  chat: {
    open: (): void => rendererTransport.send('chat:open'),
    installProvider: (url: string): Promise<LlmProviderInfo> => rendererTransport.invoke('chat:installProvider', url),
    reinstallProvider: (id: string): Promise<LlmProviderInfo> => rendererTransport.invoke('chat:reinstallProvider', id),
    uninstallProvider: (id: string): Promise<void> => rendererTransport.invoke('chat:uninstallProvider', id),
    applyProviderUpdate: (id: string): Promise<LlmProviderInfo> => rendererTransport.invoke('chat:applyProviderUpdate', id),
    checkProviderUpdates: (): Promise<PluginUpdateResult> => rendererTransport.invoke('chat:checkProviderUpdates'),
    getProviderPluginFailures: (): Promise<readonly ProviderPluginFailure[]> => rendererTransport.invoke('chat:providerPluginFailures'),
    account: (provider?: SessionProvider): Promise<ClaudeAccount> => rendererTransport.invoke('chat:account', provider),
    /** A project's own root asks a host's own claude, where one is given; without it, this computer's. */
    models: (root?: string, provider?: SessionProvider): Promise<ClaudeModel[] | undefined> => rendererTransport.invoke('chat:models', root, provider),
    /** The plan's windows as last measured. Asking has them measured again; the fresh ones arrive through onPlan. */
    plan: (): Promise<PlanUsage | undefined> => rendererTransport.invoke('chat:plan'),
    onPlan: (said: (plan: PlanUsage) => void): (() => void) => rendererTransport.listen('chat:plan', said),
    /** Every place's plan, this computer's and each connected host's, as last measured; asking has them measured again, the fresh ones arrive through onPlans. */
    plans: (): Promise<PlaceUsage[]> => rendererTransport.invoke('chat:plans'),
    onPlans: (said: (plans: readonly PlaceUsage[]) => void): (() => void) => rendererTransport.listen('chat:plans', said),
    /** The folder picker. The folder chosen is remembered and given back. */
    addProject: (): Promise<string | undefined> => rendererTransport.invoke('chat:addProject'),
    forgetProject: (root: string): Promise<void> => rendererTransport.invoke('chat:forgetProject', root),
    /** Puts a folder on the list of projects, as Add a project does once one is chosen. */
    rememberProject: (root: string): Promise<void> => rendererTransport.invoke('chat:rememberProject', root),
    /** What the tool kept that no board lists, from the last 30 days or from before them. */
    hidden: (older: boolean): Promise<HiddenFolder[]> => rendererTransport.invoke('chat:hidden', older),
    bring: (id: string): Promise<void> => rendererTransport.invoke('chat:bring', id),
    /** Nothing for the project is every conversation, in every project offered. */
    list: (root: string | undefined): Promise<ChatSession[]> => rendererTransport.invoke('chat:list', root),
    listStatus: (): Promise<readonly SessionListStatus[]> => rendererTransport.invoke('chat:listStatus'),
    onListStatus: (said: (status: readonly SessionListStatus[]) => void): (() => void) => rendererTransport.listen('chat:listStatus', said),
    items: (id: string): Promise<SessionItem[]> => rendererTransport.invoke('chat:items', id),
    exportConversation: (id: string): Promise<ConversationExport> => rendererTransport.invoke('chat:exportConversation', id),
    continueConversation: (request: ConversationContinuation): Promise<string> => rendererTransport.invoke('chat:continueConversation', request),
    copyConversation: (request: ConversationContinuation): Promise<string> => rendererTransport.invoke('chat:copyConversation', request),
    /** A new task put in To do, nothing sent: its id. */
    schedule: (message: SessionMessage): Promise<string> => rendererTransport.invoke('chat:schedule', message),
    preparedDraft: (id: string): Promise<string | undefined> => rendererTransport.invoke('chat:preparedDraft', id),
    savePreparedDraft: (id: string, change: PreparedConversationDraft): Promise<void> => rendererTransport.invoke('chat:savePreparedDraft', id, change),
    waiting: (id: string): Promise<SessionItem | undefined> => rendererTransport.invoke('chat:waiting', id),
    /** What is before a line of a conversation; the phone is sent a conversation's end first, this window all of it. */
    before: async (id: string, before: string): Promise<Piece> =>
      pieceOf((await rendererTransport.invoke('chat:items', id)) as SessionItem[], before, 200),
    /** A picture the phone was sent by name, at the width it is drawn; this window is sent them whole. */
    picture: (_ref: string, _width: number): Promise<SessionImage | undefined> => Promise.resolve(undefined),
    /** Steps of a conversation by their ids, for a run the phone was sent as one line. */
    steps: async (id: string, ids: readonly string[]): Promise<SessionItem[]> =>
      ((await rendererTransport.invoke('chat:items', id)) as SessionItem[]).filter((item) => ids.includes(item.id)),
    /** How much of the open conversation is still on the Mac only, which only the phone is told. */
    onEarlier: (said: (earlier: { readonly id: string; readonly left: number }) => void): (() => void) => rendererTransport.listen('chat:earlier', said),
    links: (id: string): Promise<Link[]> => rendererTransport.invoke('chat:links', id),
    /** What closing GeckIt cut off, the first time a window asks after a start, and nothing after that. */
    cutOff: (): Promise<CutOff[]> => rendererTransport.invoke('chat:cutOff'),
    /** Sends "continue" to each of them. */
    proceed: (ids: readonly string[]): void => rendererTransport.send('chat:proceed', ids),
    /** Conversations in one project, or in every one offered, with a message holding every word. Nothing asked readies the index. */
    search: (asked: string, root?: string): Promise<ChatFound[]> => rendererTransport.invoke('chat:search', asked, root),
    retry: (id: string): Promise<string | undefined> => rendererTransport.invoke('chat:retry', id),
    send: (message: SessionMessage): Promise<string> => rendererTransport.invoke('chat:send', message),
    /** A command typed after `!`, run in the project; says which conversation it is in. */
    shell: (command: ShellCommand): Promise<string> => rendererTransport.invoke('chat:shell', command),
    stopShell: (id: string, item: string): void => rendererTransport.send('chat:stopShell', id, item),
    /** A line typed to a command typed after `!` that is still running, Enter included. */
    typeShell: (id: string, item: string, text: string): void => rendererTransport.send('chat:typeShell', id, item, text),
    /** A command still running, sent on in the background as Ctrl+B does in a terminal. */
    toBackground: (id: string, item: string): void => rendererTransport.send('chat:toBackground', id, item),
    stopTask: (id: string, task: string): void => rendererTransport.send('chat:stopTask', id, task),
    /** Takes a task that has ended off the list. */
    clearTask: (id: string, task: string): void => rendererTransport.send('chat:clearTask', id, task),
    taskOutput: (id: string, task: string): Promise<TaskOutput | undefined> => rendererTransport.invoke('chat:taskOutput', id, task),
    answer: (id: string, card: string, answer: CardAnswer | string): void =>
      rendererTransport.send('chat:answer', id, card, answer),
    /** Answers a request from `geckit start`: the ticked tasks start, the rest are refused. */
    answerRequest: (request: string, choice: RequestChoice): Promise<void> => rendererTransport.invoke('chat:answerRequest', request, choice),
    startAll: (request: string, where: 'mac' | 'phone'): Promise<void> => rendererTransport.invoke('chat:startAll', request, where),
    /** Answers a change to the team asked for with `geckit employees`. */
    answerTeamRequest: (request: string, choice: TeamChoice): Promise<void> => rendererTransport.invoke('chat:answerTeamRequest', request, choice),
    stop: (id: string): void => rendererTransport.send('chat:stop', id),
    /** Takes a message out of the queue before it goes, and gives it back. */
    unqueue: (id: string, queued: string): Promise<SessionMessage | undefined> => rendererTransport.invoke('chat:unqueue', id, queued),
    injectQueued: (id: string, queued: string): Promise<void> => rendererTransport.invoke('chat:injectQueued', id, queued),
    /** A picture waiting with a queued message; the phone is sent it at the width it is drawn, this window whole. */
    queuedPicture: (id: string, queued: string, index: number, _width: number): Promise<SessionImage | undefined> =>
      rendererTransport.invoke('chat:queuedPicture', id, queued, index),
    /** A message waiting in the queue, said again in other words; it keeps its place and its pictures. */
    requeue: (id: string, queued: string, text: string): void => rendererTransport.send('chat:requeue', id, queued, text),
    reorderQueued: (id: string, queued: string, target: string, after: boolean): void => rendererTransport.send('chat:reorderQueued', id, queued, target, after),
    /** Starts a message waiting in the queue as a new conversation, empty or with this one's history as it was then, and says which. */
    delegate: (id: string, queued: string, history: boolean): Promise<string | undefined> =>
      rendererTransport.invoke('chat:delegate', id, queued, history),
    /** How a session may act, chosen under the field: it holds from now, not from the next message. */
    mode: (id: string, mode: SessionMode): void => rendererTransport.send('chat:mode', id, mode),
    transport: (id: string, transport: ClaudeTransport): void => rendererTransport.send('chat:transport', id, transport),
    assignEmployee: (id: string, employeeId: string | null): Promise<void> => rendererTransport.invoke('chat:assignEmployee', id, employeeId),
    rename: (id: string, title: string): void => rendererTransport.send('chat:rename', id, title),
    mark: (id: string, status: SessionStatus | undefined): void => rendererTransport.send('chat:mark', id, status ?? null),
    hide: (id: string): void => rendererTransport.send('chat:hide', id),
    /** Keeps a general question for good, or lets it go a day after its last answer again. */
    keep: (id: string, stays: boolean): void => rendererTransport.send('chat:keep', id, stays),
    /** Deletes the files the tool keeps them in, and says whose are gone. */
    remove: (ids: readonly string[]): Promise<readonly string[]> => rendererTransport.invoke('chat:delete', ids),
    /** Which session is in front, so an answer that arrives here is not announced. */
    watching: (id: string | undefined): void => rendererTransport.send('chat:watching', id),
    /** Takes the answer as read without opening it: the mark on the row is pressed. */
    read: (id: string): void => rendererTransport.send('chat:read', id),
    /** Opens a terminal in the project with `claude --resume` already running. */
    terminal: (id: string, root: string): void => rendererTransport.send('chat:terminal', id, root),
    /** Lets go of the process holding it, since it is about to be continued somewhere else. */
    handOver: (id: string): void => rendererTransport.send('chat:handOver', id),
    /** Remote Control on or off for a conversation: where it is on claude.ai, or why not. */
    remote: (id: string, on: boolean): Promise<{ readonly url?: string; readonly error?: string }> =>
      rendererTransport.invoke('chat:remote', id, on),
    /** A project's MCP servers and how each stands, with one switched on or off first. Nothing where the tool would not say. */
    mcp: (
      root: string,
      id: string | undefined,
      change?: { readonly name: string; readonly enabled: boolean },
    ): Promise<McpServer[] | undefined> => rendererTransport.invoke('chat:mcp', root, id, change),
    /** The Chromes Claude in Chrome is signed in to, with one picked first. Nothing where the tool would not say. */
    browsers: (root: string, id: string | undefined, pick?: string): Promise<Browser[] | undefined> =>
      rendererTransport.invoke('chat:browsers', root, id, pick),
    /** Where the project's checkout stands. Asking also has the remote asked, now and then; what it says arrives through onGit. */
    git: (root: string): Promise<GitState | undefined> => rendererTransport.invoke('chat:git', root),
    onGit: (said: (git: { readonly root: string; readonly state: GitState | undefined }) => void): (() => void) =>
      rendererTransport.listen('chat:git', said),
    /** Shows a file the assistant touched in the Finder. */
    reveal: (root: string, path: string): void => rendererTransport.send('chat:reveal', root, path),
    /** Opens it in the application chosen for its kind in Settings. */
    openFile: (root: string, path: string): void => rendererTransport.send('chat:openFile', root, path),
    /** The right-click menu for a file: open, open with, always open its kind with, show in the Finder. */
    fileMenu: (root: string, path: string): void => rendererTransport.send('chat:fileMenu', root, path),
    /** Whether a path said in a conversation is there: from the project, or from the home folder for ~. */
    exists: (root: string, path: string): Promise<boolean> => rendererTransport.invoke('chat:exists', root, path),
    /** A file read for the phone to show, which has no application to open it in. */
    file: (root: string, path: string): Promise<FileShown> => rendererTransport.invoke('chat:file', root, path),
    repo: (root: string): Promise<string | undefined> => rendererTransport.invoke('chat:repo', root),
    /** Every file and folder in a project, as paths from it, for @. */
    files: (root: string): Promise<string[]> => rendererTransport.invoke('chat:files', root),
    commands: (root: string): Promise<readonly string[]> => rendererTransport.invoke('chat:commands', root),
    /** A file carried to a project on a host, for a message to point at: where it landed there, or unchanged for a local root. */
    upload: (root: string, path: string): Promise<Uploaded> => rendererTransport.invoke('chat:upload', root, path),
    openLink: (href: string): void => rendererTransport.send('open:link', href),
    onSessions: (said: (sessions: readonly ChatSession[]) => void): (() => void) =>
      rendererTransport.listen('chat:sessions', said),
    onItems: (said: (items: SessionItems) => void): (() => void) => rendererTransport.listen('chat:items', said),
    onAccount: (said: (account: ClaudeAccount) => void): (() => void) => rendererTransport.listen('chat:accountChanged', said),
    /** A notification was pressed, or the panel asked for a session to be shown. */
    onShow: (said: (id: string) => void): (() => void) => rendererTransport.listen('chat:show', said),
    /** A recording made for the open form, to go into it. */
    onRecorded: (said: (recording: Recording) => void): (() => void) => rendererTransport.listen('chat:recorded', said),
    /** The screenshot shortcut was pressed, and this is what it took. */
    onScreenshot: (said: (image: SessionImage) => void): (() => void) => rendererTransport.listen('chat:screenshot', said),
    /** A new task from the gecko, with what was dropped on it or said to it. */
    onTask: (said: (handed: GeckoHanded) => void): (() => void) => rendererTransport.listen('chat:task', said),
    /** Something happened in another conversation while this window is in front. */
    onNotice: (said: (notice: SessionNotice) => void): (() => void) => rendererTransport.listen('chat:notice', said),
    /** The search shortcut was pressed in another application, or again over the search. */
    onSpotlight: (said: (again: boolean) => void): (() => void) => rendererTransport.listen('chat:spotlight', said),
    /** Everything above is listened for: what main held while the window loaded can come now. */
    listening: (): void => rendererTransport.send('chat:listening'),
  },

  /** The tasks waiting for fewer conversations to be working, and how full the conversations working are. */
  lineup: {
    state: (): Promise<Lineup | undefined> => rendererTransport.invoke('lineup:state'),
    onChanged: (said: (lineup: Lineup) => void): (() => void) => rendererTransport.listen('lineup:changed', said),
  },

  /** Other computers conversations run on, reached over SSH. */
  hosts: {
    list: (): Promise<HostView[]> => rendererTransport.invoke('hosts:list'),
    onChanged: (said: (hosts: readonly HostView[]) => void): (() => void) => rendererTransport.listen('hosts:changed', said),
    /** The hosts in the person's SSH config, offered as an address is typed. */
    known: (): Promise<KnownHost[]> => rendererTransport.invoke('hosts:known'),
    /** Reaches a host not yet added, and keeps it once it was reached; what it checks arrives through onChecks. */
    check: (draft: HostDraft): Promise<{ readonly ok: true; readonly host: HostView } | { readonly ok: false; readonly problem: string }> =>
      rendererTransport.invoke('hosts:check', draft),
    /** Edits a host already kept. Only its name changed is saved without a connection; anything else is checked again, what it checks arriving through onChecks too. */
    update: (id: string, draft: HostDraft): Promise<{ readonly ok: true; readonly host: HostView } | { readonly ok: false; readonly problem: string }> =>
      rendererTransport.invoke('hosts:update', id, draft),
    onChecks: (said: (lines: readonly HostCheck[]) => void): (() => void) => rendererTransport.listen('hosts:checks', said),
    remove: (id: string): Promise<void> => rendererTransport.invoke('hosts:remove', id),
    /** Lets go of a stored password without removing the host. */
    forget: (id: string): void => rendererTransport.send('hosts:forget', id),
    connect: (id: string): void => rendererTransport.send('hosts:connect', id),
    reconnect: (id: string): void => rendererTransport.send('hosts:reconnect', id),
    disconnect: (id: string): void => rendererTransport.send('hosts:disconnect', id),
    /** One level of a host's folders, from its home where no path is given. */
    folders: (id: string, path?: string): Promise<Folders | undefined> => rendererTransport.invoke('hosts:folders', id, path ?? null),
    /** A folder on a host as a project; the project's root is given back. */
    addFolder: (id: string, path: string): Promise<string | undefined> => rendererTransport.invoke('hosts:addFolder', id, path),
    /** `addFolder`, but with why it failed rather than only that it did. */
    addFolderSaying: (id: string, path: string): Promise<{ readonly root: string } | { readonly problem: string }> =>
      rendererTransport.invoke('hosts:addFolderSaying', id, path),
    /** What hosts are asking now, and each new question as it is asked. */
    prompts: (): Promise<HostPrompt[]> => rendererTransport.invoke('hosts:prompts'),
    onPrompt: (said: (prompt: HostPrompt) => void): (() => void) => rendererTransport.listen('hosts:prompt', said),
    onAnswered: (said: (id: string) => void): (() => void) => rendererTransport.listen('hosts:answered', said),
    answer: (answer: HostAnswer): void => rendererTransport.send('hosts:answer', answer),
    install: (id: string): Promise<{ readonly ok: boolean; readonly text: string }> => rendererTransport.invoke('hosts:install', id),
    /** Forgets a host's changed key from wherever ssh itself keeps it and reaches it again; why it could not, where it could not. */
    trustNewKey: (id: string): Promise<{ readonly ok: true } | { readonly ok: false; readonly problem: string }> => rendererTransport.invoke('hosts:trustNewKey', id),
    /** How many runs Remove would stop on the host now, idle ones too. */
    running: (id: string): Promise<number> => rendererTransport.invoke('hosts:running', id),
    /** How many conversations on the host are actually working or waiting on an answer now, for Disconnect. */
    working: (id: string): Promise<number> => rendererTransport.invoke('hosts:working', id),
    /** How many conversations on the host are listed at all, for Remove to say how many stay behind. */
    conversations: (id: string): Promise<number> => rendererTransport.invoke('hosts:conversations', id),
    /** A terminal signed in to the host, running `run` there where one is given. */
    terminal: (id: string, run?: string): void => rendererTransport.send('hosts:terminal', id, run ?? null),
    /** What a terminal types to resume a particular conversation on a host; nothing for a local root. */
    resumeLine: (root: string, id: string): Promise<string | undefined> => rendererTransport.invoke('hosts:resumeLine', root, id),
  },

  voice: {
    /** Transcribe, put it on the clipboard, and paste it back where the person was. */
    done: (request: TranscribeRequest): Promise<Answered> => rendererTransport.invoke('voice:done', request),
    /** The yes: what was read as orders a moment ago is carried out. */
    do: (): Promise<Answered> => rendererTransport.invoke('voice:do'),
    /** Opens the capsule to say what the application should do, as the shortcut does. */
    orders: (): void => rendererTransport.send('voice:orders'),
    /** Opens the capsule to record the screen, as the shortcut does. */
    record: (): void => rendererTransport.send('voice:record'),
    /** Whether a New task or Ask form is open, which a recording then goes into. */
    form: (open: boolean): void => rendererTransport.send('voice:form', open),
    /** Dictation into what has the cursor in this window. */
    dictate: (): void => rendererTransport.send('voice:dictate'),
    /** A form's recording, handed back to the form. */
    fill: (recording: Recording): void => rendererTransport.send('voice:fill', recording),
    /** The capsule grows to hold what it asks about. */
    /** `middle`: it has become a card to read, so it is put in the middle of the screen, once. */
    size: (height: number, width?: number, middle?: boolean): void => rendererTransport.send('voice:size', height, width, middle),
    /** What the capsule was opened for. */
    mode: (): Promise<VoiceMode> => rendererTransport.invoke('voice:mode'),
    /** The screen under the pointer, to record. */
    screen: (): Promise<ScreenSource> => rendererTransport.invoke('voice:screen'),
    /** A new video file for the recording that is starting; answers where. */
    video: (): Promise<string> => rendererTransport.invoke('voice:video'),
    /** The next second or so of the video, added to its file. */
    videoPart: (part: Uint8Array): void => rendererTransport.send('voice:videoPart', part),
    /** A recording asked about as a general question, opened in Chat. */
    ask: (recording: Recording): Promise<Answered> => rendererTransport.invoke('voice:ask', recording),
    /** A recording read as a task: the project and the words, waiting for the yes that `do` gives. */
    task: (recording: Recording): Promise<Answered> => rendererTransport.invoke('voice:task', recording),
    /** The Mac's own page for allowing screen recording. */
    allow: (): void => rendererTransport.send('voice:allow'),
    cancel: (): void => rendererTransport.send('voice:cancel'),
    onStart: (said: () => void): (() => void) => rendererTransport.listen('voice:start', said),
    onStop: (said: () => void): (() => void) => rendererTransport.listen('voice:stop', said),
  },

  /** The floating gecko's window, and nothing else, uses these. */
  gecko: {
    state: (): Promise<GeckoView> => rendererTransport.invoke('gecko:state'),
    onState: (said: (view: GeckoView) => void): (() => void) => rendererTransport.listen('gecko:state', said),
    /** A card's goal has just been reached: one hop. */
    onHop: (said: () => void): (() => void) => rendererTransport.listen('gecko:hop', said),
    /** Where the cursor is on the screen, told only when it moves, for the eyes to follow. */
    onCursor: (said: (at: { x: number; y: number }) => void): (() => void) => rendererTransport.listen('gecko:cursor', said),
    /** Its menu opened round it, or closed. */
    onRing: (said: (open: boolean) => void): (() => void) => rendererTransport.listen('gecko:ring', said),
    /** Screenshot was chosen: it raises its camera, then says to take the shot. */
    onCamera: (said: () => void): (() => void) => rendererTransport.listen('gecko:camera', said),
    /** Voice task was chosen, or cancelled with Esc or its menu. */
    onListen: (said: (what: 'start' | 'cancel') => void): (() => void) => rendererTransport.listen('gecko:listen', said),
    /** Pressed: its menu opens round it, or closes. */
    press: (): void => rendererTransport.send('gecko:press'),
    /** Files dropped on it: GeckIt opens on New task with them. */
    drop: (given: GeckoHanded): void => rendererTransport.send('gecko:drop', given),
    /** Its own small menu, at the pointer. */
    menu: (): void => rendererTransport.send('gecko:menu'),
    /** Dragged: where its top left corner goes on the screen. */
    move: (x: number, y: number): void => rendererTransport.send('gecko:move', x, y),
    /** Let go of after a drag: kept on the screen it was dropped on. */
    moved: (): void => rendererTransport.send('gecko:moved'),
    /** Its grip dragged: its new side. */
    resize: (side: number): void => rendererTransport.send('gecko:resize', side),
    /** The menu's window, and nothing else, uses these: how it is laid out, the item in focus for the eyes, a choice, and closing. */
    /** Main laid the menu out round the gecko: draw it, then say so with `ringShown`, and it is shown. */
    onRingShow: (said: (shown: { readonly laid: GeckoRing; readonly items: readonly GeckoItem[] }) => void): (() => void) => rendererTransport.listen('gecko:ringShow', said),
    ringShown: (): void => rendererTransport.send('gecko:ringShown'),
    /** The menu was hidden, kept for the next press. */
    onRingHide: (said: () => void): (() => void) => rendererTransport.listen('gecko:ringHide', said),
    aim: (x: number, y: number): void => rendererTransport.send('gecko:aim', x, y),
    act: (action: GeckoAction): void => rendererTransport.send('gecko:act', action),
    close: (): void => rendererTransport.send('gecko:ringClose'),
  },

  phone: {
    state: (): Promise<PhoneView> => rendererTransport.invoke('phone:state'),
    onState: (said: (view: PhoneView) => void): (() => void) => rendererTransport.listen('phone:state', said),
    /** A new key: every phone on the old one has to scan again. */
    newCode: (): void => rendererTransport.send('phone:newCode'),
  },

  panel: {
    /** Cmd+C+D: what was selected in the application the person was in. */
    onText: (said: (text: string) => void): (() => void) => rendererTransport.listen('panel:text', said),
  },
}

}

export type RendererApi = ReturnType<typeof createRendererApi>
