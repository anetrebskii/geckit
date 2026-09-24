/**
 * The contract between the main process and the windows.
 *
 * Claude Code's own protocol is read into these shapes in the main process and
 * nothing of it crosses the bridge: a window knows about items, cards and
 * sessions, never about `stream-json`.
 */

/** What a session may do without asking: Claude Code's own permission modes, in its own words. */
export type SessionMode = 'manual' | 'auto' | 'plan'

export const SESSION_MODES: readonly { mode: SessionMode; label: string; why: string }[] = [
  { mode: 'manual', label: 'Manual', why: 'Asks before it runs or changes anything.' },
  {
    mode: 'auto',
    label: 'Auto',
    why: "Claude Code's auto mode: its safety check lets routine work through and stops what looks risky.",
  },
  { mode: 'plan', label: 'Plan', why: 'Reads and proposes. Changes nothing.' },
]

/**
 * A mode as it was kept, from before manual was called by the tool's name for it.
 * One that has none, as a conversation started in a terminal, is in Auto.
 */
export const sessionMode = (kept: unknown): SessionMode =>
  kept === 'manual' || kept === 'ask' ? 'manual' : kept === 'plan' ? 'plan' : 'auto'

/** What a card is asking, which decides the buttons under it. */
export type CardKind = 'permission' | 'question' | 'start'

/** One thing the assistant may not do unasked, or one thing it asked. */
export interface SessionCard {
  readonly kind: CardKind
  /** "Wants to run a command", or the question as it was asked. */
  readonly title: string
  /** The command, the address or the plan, whole. Set in the code face. */
  readonly detail?: string
  /** "in geckit", or "Outside this folder". */
  readonly where?: string
  readonly choices?: readonly string[]
  /** What was answered, once it was: "Allowed: npm test". */
  readonly answered?: string
}

/** The three answers to a permission card. Anything else is a choice's own words. */
export type CardAnswer = 'once' | 'session' | 'no'

/**
 * One thing in a transcript.
 *
 * Upserted by `id`: a line that was live is sent again as done, a card is sent
 * again as answered, and what the assistant is saying is sent again as it
 * grows. The window never patches an item, it replaces it.
 */
export type SessionItem =
  | {
      readonly kind: 'mine'
      readonly id: string
      readonly text: string
      readonly images?: readonly SessionImage[]
      /** It never reached the assistant, and Send again is offered. */
      readonly unsent?: boolean
      /** When it was said, in ms, where known. */
      readonly at?: number
    }
  | { readonly kind: 'theirs'; readonly id: string; readonly text: string; readonly at?: number }
  | {
      readonly kind: 'did'
      readonly id: string
      /** "Read src/main/index.ts" */
      readonly what: string
      /** The whole of it, one press away. */
      readonly detail?: string
      /** A file this was about, as the project names it. */
      readonly path?: string
      readonly live?: boolean
      /** A command that has run long enough to be sent on in the background, as Ctrl+B does in a terminal. */
      readonly lasting?: boolean
      /** Pictures it handed back: a screenshot it took, an image it read. */
      readonly images?: readonly SessionImage[]
    }
  | { readonly kind: 'thought'; readonly id: string; readonly text: string }
  | {
      /** A command typed after `!`, run in the project folder and handed to Claude with the next message. */
      readonly kind: 'shell'
      readonly id: string
      readonly command: string
      /** What it printed, both streams in the order they came. */
      readonly output: string
      readonly running?: boolean
      /** How it exited, where that was not 0. */
      readonly code?: number
      readonly stopped?: boolean
      /** It wants a keyboard, so it was opened in a terminal instead of run here, and what it printed stayed there. */
      readonly terminal?: boolean
      readonly at?: number
    }
  | { readonly kind: 'card'; readonly id: string; readonly card: SessionCard }
  | { readonly kind: 'wrote'; readonly id: string; readonly paths: readonly string[] }
  | {
      readonly kind: 'note'
      readonly id: string
      readonly note: 'stopped' | 'limit' | 'failed' | 'summarised' | 'mode' | 'task' | 'goal'
      readonly text: string
      /** The tool's own last words, under "What it said". */
      readonly detail?: string
    }

/** Where a session stands, which is also which group its row is under. */
export type SessionState = 'working' | 'asks' | 'unread' | 'idle' | 'limit' | 'failed'

/**
 * How full a conversation's context is, in tokens, out of how much it may hold
 * before Claude Code summarises it; and what it has cost at API prices, as
 * Claude Code counts it, which the plan covers.
 */
export interface SessionSpend {
  readonly used?: number
  readonly window?: number
  readonly cost?: number
}

/** Where a project's git checkout stands. */
export interface GitState {
  /** The branch, or the commit where none is checked out. */
  readonly branch: string
  /** Files changed and not committed, new ones included. */
  readonly changed: number
  /** The branch it pushes to and pulls from, as `origin/main`. Nothing where it has none yet. */
  readonly upstream?: string
  /** Commits not pushed there, and commits there not pulled, as far as the last fetch knows. */
  readonly ahead: number
  readonly behind: number
  /** The first line of each of those commits, newest first, the first few only. */
  readonly outgoing: readonly string[]
  readonly incoming: readonly string[]
  /** When the remote was last asked for new commits, in milliseconds. */
  readonly fetched?: number
}

/** One of the plan's usage windows: how much of it is spent, 0 to 1, and when it starts again, in milliseconds. */
export interface PlanWindow {
  readonly part: number
  readonly resetsAt: number
}

/** The plan's windows, as the tool last reported them. */
export interface PlanUsage {
  readonly fiveHour?: PlanWindow
  readonly sevenDay?: PlanWindow
}

/** The shortcuts that work in any application, as Electron registers them. */
export const ANYWHERE = {
  correct: 'CommandOrControl+C+D',
  dictate: 'CommandOrControl+Alt+V',
  search: 'CommandOrControl+Alt+P',
  orders: 'CommandOrControl+Alt+G',
} as const

/** Something a conversation wants the person to know, and where the window is not showing it. */
export interface SessionNotice {
  readonly session: string
  /** What happened, and in which project: "Finished - geckit". */
  readonly title: string
  /** The conversation. */
  readonly subtitle: string
  readonly body: string
  /** It cannot go on until it is answered. */
  readonly asks: boolean
}

/** One row in the sidebar. */
export interface ChatSession {
  /** Claude Code's own id for it, which is what `claude --resume` takes. */
  readonly id: string
  /** The project folder it is about. */
  readonly root: string
  readonly title: string
  /** The second line: where it stands, or the first line of the last thing said. */
  readonly stands: string
  readonly state: SessionState
  /** When anything last happened in it, in milliseconds. */
  readonly at: number
  /** Started in this application rather than in a terminal. */
  readonly here: boolean
  readonly mode: SessionMode
  /** The id of what answers last: `claude-opus-5`. */
  readonly model?: string
  /** The model chosen for it here, as the tool is handed it: `sonnet`. Nothing is Default. */
  readonly chosen?: string
  readonly spend?: SessionSpend
  /** When it was last in front in this window, in milliseconds. */
  readonly seen?: number
  /** Remote Control is on, and this is where the conversation is on claude.ai. */
  readonly remote?: string
  /** What Claude Code has running in the background for it. */
  readonly tasks?: readonly BackgroundTask[]
  readonly goal?: SessionGoal
  /** A command typed after ! that is still running in it, the first where there are more. */
  readonly runs?: string
  /** The tracker item it is about, from its first message. */
  readonly work?: WorkItem
  /** Where it stands, as the person marked it; saying anything more in it clears it. */
  readonly status?: SessionStatus
  /** Messages sent while it worked, oldest first, each going once the turn before it is answered. */
  readonly queued?: readonly QueuedMessage[]
}

export interface QueuedMessage {
  readonly id: string
  readonly text: string
  /** How many pictures go with it; the pictures themselves come back only when it is taken out. */
  readonly images: number
}

/** The tracker item a conversation is about: the first issue, pull request, Linear or Jira link in its first message. */
export interface WorkItem {
  /** `#3914`, `FOR-1067` */
  readonly label: string
  readonly url: string
  /** "twins-ai/Twins-AI pull request 3908" */
  readonly says: string
}

export type SessionStatus = 'review' | 'blocked' | 'done'

export const SESSION_STATUSES: readonly { readonly status: SessionStatus; readonly label: string; readonly why: string }[] = [
  { status: 'review', label: 'In review', why: 'Finished, and waiting for you to check what it did' },
  { status: 'blocked', label: 'Blocked', why: 'Waiting on something outside it' },
  { status: 'done', label: 'Done', why: 'Moved out of the list into Done at the bottom' },
]

/** A goal set with `/goal`: Claude keeps working until a separate check after each turn finds that it holds. */
export interface SessionGoal {
  readonly condition: string
  /** How many checks have found it does not hold yet. */
  readonly checks: number
  /** What the last of them said. */
  readonly reason?: string
}

/** One thing Claude Code has in the background: a command, a watch or a helper. */
export interface BackgroundTask {
  readonly id: string
  /** The tool's word for what it is: `local_bash`, `local_agent`, `remote_agent`, `local_workflow`; and `monitor` for a watch, which the tool counts as a command. */
  readonly kind: string
  readonly what: string
  /** What a command or a watch runs. */
  readonly command?: string
  /** The tool use that started it, which is also the id of its line in the conversation. */
  readonly use?: string
  readonly status: 'running' | 'completed' | 'failed' | 'stopped'
  /** When it was started and when it ended, in milliseconds. */
  readonly started: number
  readonly ended?: number
  /** How a command exited, where the tool said. */
  readonly exit?: number
  /** Where the tool writes what it prints, where it said. A helper's is its conversation. */
  readonly output?: string
  /** What a helper is doing now, and how much it has done. */
  readonly progress?: { readonly doing: string; readonly tools: number; readonly tokens: number }
}

/** What a task in the background has to show: the end of what it printed, or a helper's conversation so far. */
export type TaskOutput =
  | { readonly kind: 'printed'; readonly text: string }
  | { readonly kind: 'helper'; readonly lines: readonly { readonly id: string; readonly who: 'asked' | 'said' | 'did'; readonly text: string }[] }

/** One MCP server Claude Code has for a project, and the tool's word for how it stands: `connected`, `failed`, `needs-auth`, `pending`, `disabled`. */
export interface McpServer {
  readonly name: string
  readonly status: string
}

/** One Chrome the extension is signed in to, as Claude in Chrome names it. A profile is its own browser. */
export interface Browser {
  readonly id: string
  readonly name: string
  /** The one Claude drives. */
  readonly current: boolean
}

/** A picture sent with a message: what it is, and the picture itself as base64. */
export interface SessionImage {
  readonly media: string
  readonly data: string
}

/** What the tool said it has, or that it is being asked, or that it did not say. */
export type ModelsSaid = 'unasked' | 'asking' | 'unsaid' | readonly ClaudeModel[]

/** A conversation in which a message says every word searched for. */
export interface ChatFound {
  readonly id: string
  readonly root: string
  /** The last message that does, cut down to the words around them. */
  readonly said: string
  /** How many messages do. */
  readonly count: number
}

/** What is sent when Send is pressed. */
export interface SessionMessage {
  /** Absent for the first message of a new session. */
  readonly session?: string
  readonly root: string
  readonly mode: SessionMode
  readonly text: string
  readonly images?: readonly SessionImage[]
  /** The model the tool is handed. Nothing is Default: the tool is handed nothing. */
  readonly model?: string
  /** The item this is a second try of, so the transcript keeps one message and not two. */
  readonly again?: string
}

/** A command typed after `!` in the composer. */
export interface ShellCommand {
  /** Absent in a new conversation, which it starts. */
  readonly session?: string
  readonly root: string
  readonly command: string
}

/** Items that arrived for one session. */
export interface SessionItems {
  readonly id: string
  readonly items: readonly SessionItem[]
  /**
   * Items that are no longer there. What the assistant is saying grows under a
   * provisional id until the tool names the finished message, and then the
   * provisional one goes.
   */
  readonly gone?: readonly string[]
}

/**
 * Whether somebody is signed in, as `claude auth status` says.
 *
 * Asked of the tool and never worked out: the answer carries who and on what
 * plan and never the secret, which is the one thing GeckIt must not hold.
 */
export interface ClaudeAccount {
  /** The command answered on this machine. */
  readonly here: boolean
  /** Undefined where the tool could not be asked. */
  readonly signedIn: boolean | undefined
  /** "Max", "Pro" - the tool's own word, capitalised. */
  readonly plan?: string
  /** Signed in, and not with a plan: a key, a token, a Console account, a cloud provider. */
  readonly key?: boolean
}

/** One model the tool says it has, in the tool's own words. */
export interface ClaudeModel {
  /** What the tool is handed to choose it: `sonnet`. */
  readonly value: string
  /** "Sonnet" */
  readonly name: string
  /** The tool's own sentence about it, where it has one. */
  readonly says?: string
  /** The id it stands for, where the tool says: `claude-sonnet-5`. */
  readonly id?: string
}

const capital = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1)

/**
 * A model the way a person says it: "Opus 5" for `claude-opus-5`, "Haiku 4.5"
 * for `claude-haiku-4-5-20251001`.
 *
 * Worked out from the id rather than looked up, because a table of models is
 * out of date the week a vendor ships one. An id this cannot read is shown as
 * it is, which is still the truth.
 */
export function modelName(id: string): string {
  const bare = id
    .trim()
    .replace(/\[[^\]]*\]$/, '')
    .replace(/-\d{8}$/, '')
  if (bare.startsWith('claude-')) {
    const parts = bare.slice('claude-'.length).split('-')
    const words = parts.filter((part) => !/^\d+$/.test(part)).map(capital)
    const version = parts.filter((part) => /^\d+$/.test(part)).join('.')
    return [...words, version].filter((part) => part !== '').join(' ')
  }
  if (/^gpt-/i.test(bare)) {
    const [, version = '', ...rest] = bare.split('-')
    return [`GPT-${version}`, ...rest.map(capital)].join(' ')
  }
  return bare
}

/** Whose plan a question is about to be spent from, for the line over the composer. */
export function planLine(account: ClaudeAccount | undefined): string {
  if (account === undefined || !account.here) return 'claude is not on this machine'
  if (account.signedIn === undefined) return 'On this machine'
  if (!account.signedIn) return 'Nobody is signed in. Run claude auth login in a terminal.'
  if (account.key === true) return 'Signed in with an API key, not a plan'
  return account.plan === undefined ? 'Your Claude plan' : `Your Claude ${account.plan} plan`
}

/** What continues a session in a terminal opened in its folder. */
export const resumeCommand = (id: string): string => `claude --resume ${id}`

/* ------------------------------------------------------------------ */
/* Correct                                                             */
/* ------------------------------------------------------------------ */

export type AIProvider = 'openai' | 'anthropic' | 'openrouter'

/** Which engine Correct runs on: the Claude subscription, or a pasted API key. */
export type CorrectEngine = 'plan' | 'key'

export type CorrectAction = 'grammar' | 'improve' | 'translate' | 'explain' | 'custom'

export interface CorrectRequest {
  readonly engine: CorrectEngine
  readonly action: CorrectAction
  readonly text: string
  readonly custom?: string
  /** On the plan, a Claude alias or id. On a key, the provider's model id. */
  readonly model: string
  readonly provider: AIProvider
}

export interface Answered {
  readonly ok: boolean
  readonly text?: string
  readonly error?: string
  /** What was said out loud, read as orders and waiting for a yes. */
  readonly plan?: readonly Planned[]
  /** The words themselves, so a mishearing is caught before anything is done. */
  readonly heard?: string
}

/** One thing that will be done, as the capsule shows it before it is agreed to. */
export interface Planned {
  readonly icon: string
  /** "Start in formula-business", "Mark Test workflows as review" */
  readonly head: string
  /** The words that will be sent, whole. */
  readonly text?: string
  /** What says it is finished: "a step runs on the VM". */
  readonly goal?: string
}

/* ------------------------------------------------------------------ */
/* Transcription                                                       */
/* ------------------------------------------------------------------ */

export interface Transcription {
  readonly id: string
  readonly text: string
  /** "Mic recording", or the name of the file that was dropped. */
  readonly source: string
  readonly at: number
  readonly seconds?: number
}

/** A microphone, as the window that could see one named it. */
export interface AudioDevice {
  readonly deviceId: string
  readonly label: string
}

export interface TranscribeRequest {
  /** base64 */
  readonly audio: string
  readonly fileName: string
}

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export interface Bounds {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Which application opens a kind of file pressed in a conversation. */
export interface OpenRule {
  /** Extensions, as `ts tsx` or `.md, .txt`. `*` is anything no other rule names. */
  readonly kinds: string
  /** The application, as its path: `/Applications/Visual Studio Code.app`. */
  readonly app: string
}

/** A file's extension, lower case and without the dot. Nothing for `Makefile` or `.gitignore`. */
export function kindOf(file: string): string {
  const name = file.slice(file.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/** The extensions a rule names, however they were written. */
const kindsOf = (rule: OpenRule): string[] =>
  rule.kinds
    .toLowerCase()
    .split(/[\s,]+/)
    .map((one) => one.replace(/^\*?\./, ''))
    .filter((one) => one !== '')

/** The rule a file is opened by: the first that names its extension, else one that says `*`. */
export function ruleFor(rules: readonly OpenRule[], file: string): OpenRule | undefined {
  const kind = kindOf(file)
  const usable = rules.filter((rule) => rule.app !== '')
  return (
    (kind === '' ? undefined : usable.find((rule) => kindsOf(rule).includes(kind))) ??
    usable.find((rule) => kindsOf(rule).includes('*'))
  )
}

/** The rules with one extension given to one application, and taken out of whichever rule had it before. */
export function withRule(rules: readonly OpenRule[], kind: string, app: string): OpenRule[] {
  const kept = rules.flatMap((rule) => {
    const named = kindsOf(rule)
    if (!named.includes(kind)) return [rule]
    const rest = named.filter((one) => one !== kind)
    return rest.length === 0 ? [] : [{ ...rule, kinds: rest.join(' ') }]
  })
  return [...kept, { kinds: kind, app }]
}

/** An application by the name it shows in the Dock. */
export const appName = (app: string): string => app.slice(app.lastIndexOf('/') + 1).replace(/\.app$/, '')

/** Light, dark, or whatever the machine is set to. */
export type Theme = 'system' | 'light' | 'dark'

/** How the conversations in the sidebar are gathered: by when, or by which project. */
export type ChatGrouping = 'time' | 'project'

/** How the conversations are shown: the list, or a board of cards in columns by how each stands. */
export type ChatView = 'list' | 'board'

/** Where an update stands, as Settings and the corner card say it. */
export interface UpdateView {
  readonly state: 'off' | 'fresh' | 'checking' | 'current' | 'behind' | 'empty' | 'downloading' | 'ready' | 'waiting' | 'failed'
  /** This build's own number. */
  readonly version: string
  /** The one the release offers. */
  readonly offered: string
  readonly percent: number
  readonly message: string
  /** The conversations a restart is waiting for, by name. */
  readonly waitingFor: readonly string[]
}

/** The line Settings shows under the version, for each state. */
export function updateText(update: UpdateView): string {
  switch (update.state) {
    case 'off':
    case 'failed':
      return update.message
    case 'fresh':
      return ''
    case 'checking':
      return 'Checking for updates...'
    case 'current':
      return 'This is the newest version.'
    case 'downloading':
      return `Downloading GeckIt ${update.offered}, ${String(update.percent)}%`
    case 'ready':
      return `GeckIt ${update.offered} is ready. It installs when the app restarts.`
    case 'waiting':
      return update.waitingFor.length === 1
        ? `Restarts when ${update.waitingFor[0] ?? ''} finishes.`
        : `Restarts when ${String(update.waitingFor.length)} conversations finish.`
    case 'behind':
      return `The newest release is ${update.offered}, older than this version.`
    case 'empty':
      return 'There is no published version yet.'
  }
}

/** The phone as Settings shows it: the code to scan while the switch is on, and how many phones are joined. */
export interface PhoneView {
  readonly qr?: string
  readonly count: number
  /** Why phones cannot find this Mac, when they cannot. */
  readonly trouble?: string
}

export interface Settings {
  readonly theme: Theme
  readonly nativeLanguage: string
  readonly secondLanguage: string
  readonly openAiKey: string
  readonly anthropicKey: string
  readonly openRouterKey: string
  readonly provider: AIProvider
  readonly microphoneDeviceId: string
  /** Kept so the dictation popup can name the microphones before it opens one. */
  readonly audioDevices: readonly AudioDevice[]
  readonly correctEngine: CorrectEngine
  /** On the plan: a Claude alias. Empty is Default. */
  readonly correctPlanModel: string
  /** On a key: the provider's own model id. */
  readonly correctKeyModel: string
  /** Project folders the chat window offers, newest first. */
  readonly projects: readonly string[]
  /** Each project folder's colour, as its place in the palette: given when it joins the list, changed only by hand. */
  readonly projectColors: Readonly<Record<string, number>>
  /** The model the next new session is handed. Empty is Default. */
  readonly chatModel: string
  readonly chatMode: SessionMode
  readonly chatGrouping: ChatGrouping
  /** The conversations as a list, or as a board of cards by what stands where. */
  readonly chatView: ChatView
  /** The chat window lists every project's conversations, and opens that way again. False is the newest project's. */
  readonly chatAll: boolean
  /** The projects whose conversations are listed. Empty is every one of them. */
  readonly chatProjects: readonly string[]
  /** Conversations kept at the top of the list, in the order they were put in; Cmd+1 opens the first. */
  readonly favorites: readonly string[]
  readonly openWith: readonly OpenRule[]
  readonly transcriptions: readonly Transcription[]
  readonly chatBounds?: Bounds
  readonly panelBounds?: Bounds
  /** How wide the Chat window's sidebar was dragged, in pixels. */
  readonly sidebarWidth: number
  /** This installation, for counting how often each thing is used. Nothing else is sent. */
  readonly client: string
  /** False stops the checks on launch and every hour; Check for Updates in Settings still works. */
  readonly autoUpdate: boolean
  /** False takes GECKIT.md and the line that reads it out of the tool's own folder again. */
  readonly guideClaude: boolean
  /** Phones with GeckIt's app can reach the conversations. */
  readonly phone: boolean
  /** What the QR code carries; made on the first start, and again by New code. */
  readonly phoneKey: string
  /** Written by the main process only, over `shortcuts:*`, so a window's older copy never undoes a run. */
  readonly shortcuts: readonly Shortcut[]
}

/** A saved prompt, run by hand or on a timetable, each time as a new conversation in its project. */
export interface Shortcut {
  readonly id: string
  readonly name: string
  readonly root: string
  readonly prompt: string
  /** What being finished means, sent as `/goal` after the prompt. Nothing is no goal. */
  readonly goal?: string
  readonly mode: SessionMode
  /** The model the conversation is handed. Nothing is Default. */
  readonly model?: string
  /** When it also runs by itself, as cron writes it: minute, hour, day of the month, month, day of the week. Nothing is by hand only. */
  readonly cron?: string
  /** False pauses the timetable and keeps it. */
  readonly on: boolean
  /** The next timed run is the first time the timetable names after this: when it was made, last ran on time, or had its time changed. */
  readonly since: number
  readonly lastRun?: number
  /** The conversation the last run started. */
  readonly lastSession?: string
}

/** What a window sends to make or change a shortcut; the main process keeps when it ran. */
export type ShortcutDraft = Omit<Shortcut, 'id' | 'since' | 'lastRun' | 'lastSession'> & { readonly id?: string }

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  nativeLanguage: 'English',
  secondLanguage: 'Russian',
  openAiKey: '',
  anthropicKey: '',
  openRouterKey: '',
  provider: 'openai',
  microphoneDeviceId: '',
  audioDevices: [],
  correctEngine: 'plan',
  correctPlanModel: '',
  correctKeyModel: '',
  projects: [],
  projectColors: {},
  chatModel: '',
  chatMode: 'auto',
  chatGrouping: 'time',
  chatView: 'board',
  chatAll: false,
  chatProjects: [],
  favorites: [],
  openWith: [],
  transcriptions: [],
  client: '',
  autoUpdate: true,
  guideClaude: true,
  phone: false,
  phoneKey: '',
  sidebarWidth: 264,
  shortcuts: [],
}
