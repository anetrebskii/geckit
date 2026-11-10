import { StatusHistory } from '../src/renderer/src/chat/StatusHistory'
import { formatStatusMove } from '../src/shared/status-history'
import type { StatusMove } from '../src/shared/api'
import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { ChatSession } from '../src/shared/api'
import { DEFAULT_MANAGER_CONFIG } from '../src/shared/manager'
import type { ManagerView } from '../src/shared/manager'
import { managerAssistant, managerLabel } from '../src/renderer/src/chat/manager-label'
import type { ChannelsApi } from '../src/renderer/src/ui/Channels'

const worker: ChatSession = { id: 'codex:worker', root: '/work/project', title: 'Add provider preferences', stands: 'Working', state: 'working', at: 1, here: true, mode: 'auto' }
const ready: ManagerView = { queued: 0, config: { ...DEFAULT_MANAGER_CONFIG, enabled: true }, state: 'idle', workers: [], activity: [], providers: [{ provider: 'claude', available: true }], decisions: [] }

describe('Manager navigation state', () => {
  it('uses the actual backing assistant while a different saved provider awaits replacement', () => {
    const configured: ManagerView = { ...ready, config: { ...ready.config, provider: 'plugin:library' } }
    expect(managerAssistant(configured)).toBe('plugin:library')
    expect(managerAssistant({ ...configured, session: { ...worker, id: 'claude-backing', manager: true } })).toBe('claude')
    expect(managerAssistant({ ...configured, session: { ...worker, id: 'codex:backing', manager: true } })).toBe('codex')
    expect(managerAssistant({ ...configured, session: { ...worker, id: 'plugin:library:backing', manager: true } })).toBe('plugin:library')
  })

  it('keeps the needed user action ahead of ordinary worker progress', () => {
    expect(managerLabel({ ...ready, workers: [worker] })).toBe('Workers are working')
    expect(managerLabel({ ...ready, workers: [worker], decisions: [{ id: 'approval', title: 'Start worker?', choices: [{ label: 'Start', value: 'allow' }] }] })).toBe('Needs your answer')
    expect(managerLabel({ ...ready, workers: [{ ...worker, state: 'asks' }] })).toBe('Needs your answer')
  })

  it('gives lifecycle recovery precedence while retaining pending questions', () => {
    const asking: ManagerView = { ...ready, workers: [{ ...worker, state: 'asks' }] }
    expect(managerLabel({ ...asking, state: 'paused' })).toBe('Manager paused')
    expect(managerLabel({ ...asking, state: 'blocked' })).toBe('Manager unavailable')
    expect(managerLabel({ ...asking, state: 'working' })).toBe('Needs your answer')
    expect(managerLabel({ ...ready, state: 'working' })).toBe('Coordinating')
  })

  it('distinguishes preserved disabled history from first setup', () => {
    expect(managerLabel(undefined)).toBe('Set up Manager')
    expect(managerLabel({ ...ready, config: DEFAULT_MANAGER_CONFIG, state: 'off' })).toBe('Set up Manager')
    expect(managerLabel({ ...ready, config: DEFAULT_MANAGER_CONFIG, state: 'off', session: { ...worker, manager: true } })).toBe('Manager disabled')
  })

  it('shows a live provider retry ahead of unrelated decisions without hiding lifecycle blocks', () => {
    const retrying: ManagerView = { ...ready, state: 'working', session: { ...worker, manager: true, retryNotice: 'Codex is retrying automatically.\n429 Too Many Requests' }, workers: [{ ...worker, state: 'asks' }], decisions: [{ id: 'old-review', title: 'Review uncertain delivery', choices: [{ label: 'Reviewed', value: 'reviewed' }] }] }
    expect(managerLabel(retrying)).toBe('Waiting for Codex')
    expect(retrying.decisions).toHaveLength(1)
    expect(managerLabel({ ...retrying, state: 'paused' })).toBe('Manager paused')
    expect(managerLabel({ ...retrying, state: 'blocked' })).toBe('Manager unavailable')
    expect(managerLabel({ ...retrying, session: { ...worker, manager: true } })).toBe('Needs your answer')
    expect(managerLabel({ ...retrying, state: 'idle' })).toBe('Needs your answer')
  })
})

vi.stubGlobal('window', { geckit: { platform: 'darwin' } })
vi.stubGlobal('document', { documentElement: { classList: { contains: () => false } } })
const { originFor } = await import('../src/renderer/src/chat/Request')
const managerHook = await import('../src/renderer/src/chat/useManager')
const { ManagerSettings } = await import('../src/renderer/src/chat/Manager')

describe('Manager assistant availability', () => {
  it('keeps configuration and lifecycle in Settings without a chat or task dashboard', () => {
    const hook = vi.spyOn(managerHook, 'useManager').mockReturnValue({ ...ready, session: { ...worker, manager: true }, workers: [worker], decisions: [{ id: 'decision', title: 'Internal decision', choices: [{ label: 'Answer', value: 'answer' }] }] })
    const markup = renderToStaticMarkup(createElement(ManagerSettings, { settings: DEFAULT_SETTINGS }))
    expect(markup).toContain('Give Manager work in the app or Telegram.')
    expect(markup).toContain('Pause</button>')
    expect(markup).toContain('Restart session</button>')
    expect(markup).toContain('Disable Manager</button>')
    expect(markup).toContain('Current assistant')
    expect(markup).not.toContain('Open manager')
    expect(markup).not.toContain('Session info')
    expect(markup).not.toContain('Internal decision')
    expect(markup).not.toContain('manager-composer')
    expect(markup).not.toContain('Voice Memos')
    expect(markup).not.toContain('Automatic task sources')
    expect(markup).not.toContain(worker.title)
    hook.mockRestore()
  })

  it('keeps enabled Codex and library providers selectable without substituting the saved assistant', () => {
    const settings = { ...DEFAULT_SETTINGS, providerPlugins: [{ id: 'plugin:library', family: 'plugin:library', name: 'Library assistant', shortName: 'Library', icon: 'terminal', browser: 'none', loginCommand: '', planName: '' } satisfies (typeof DEFAULT_SETTINGS.providerPlugins)[number]] }
    for (const provider of ['codex', 'plugin:library'] as const) {
      const hook = vi.spyOn(managerHook, 'useManager').mockReturnValue({ ...ready, config: { ...ready.config, provider }, providers: [{ provider, available: true }] })
      const markup = renderToStaticMarkup(createElement(ManagerSettings, { settings }))
      expect(markup).toContain(provider === 'codex' ? 'Codex' : 'Library assistant')
      expect(markup).toContain('class="primary">Save changes</button>')
      hook.mockRestore()
    }
  })

  it('blocks saving an empty enabled list and a disabled saved selection with explicit recovery', () => {
    const hook = vi.spyOn(managerHook, 'useManager').mockReturnValue({ ...ready, providers: [] })
    const empty = renderToStaticMarkup(createElement(ManagerSettings, { settings: DEFAULT_SETTINGS }))
    expect(empty).toContain('Enable an assistant in Assistants to set up Manager.')
    expect(empty).toContain('class="primary" disabled="">Save changes</button>')
    hook.mockReturnValue({ ...ready, providers: [{ provider: 'codex', available: true }] })
    const disabled = renderToStaticMarkup(createElement(ManagerSettings, { settings: DEFAULT_SETTINGS }))
    expect(disabled).toContain('This assistant is disabled. Choose an enabled assistant or restore it in Assistants.')
    expect(disabled).toContain('Claude Code')
    expect(disabled).toContain('class="primary" disabled="">Save changes</button>')
    hook.mockRestore()
  })
})

describe('Manager guided setup', () => {
  const fresh: ManagerView = { ...ready, config: DEFAULT_MANAGER_CONFIG, state: 'off' }

  it('keeps every later step locked behind the one before it', () => {
    const hook = vi.spyOn(managerHook, 'useManager').mockReturnValue(fresh)
    const markup = renderToStaticMarkup(createElement(ManagerSettings, { settings: DEFAULT_SETTINGS }))
    expect(markup).toContain('The assistant you pick here is the one that runs it.')
    expect(markup).toContain('Loading models...')
    expect(markup).toContain('class="primary" disabled="">Continue</button>')
    expect(markup).toContain('Decide how work starts first.')
    expect(markup).toContain('Choose the assistant first.')
    expect(markup).not.toContain('Connect Telegram first.')
    expect(markup.match(/class="manager-step is-/g)).toHaveLength(3)
    expect(markup).not.toContain('aria-label="Connect Telegram"')
    expect(markup).toContain('Telegram, Slack and Discord reach Manager from Settings, Channels.')
    expect(markup).not.toContain('Enable Manager')
    expect(markup).not.toContain('Delegation policy')
    hook.mockRestore()
  })

  it('keeps Manager ready and its lifecycle controls available without a Telegram connection', () => {
    const hook = vi.spyOn(managerHook, 'useManager').mockReturnValue({ ...ready, session: { ...worker, id: 'claude-backing', manager: true } })
    const markup = renderToStaticMarkup(createElement(ManagerSettings, { settings: DEFAULT_SETTINGS }))
    expect(markup).not.toContain('Connect Telegram')
    expect(markup).toContain('Manager is on')
    expect(markup).toContain('Pause</button>')
    expect(markup).toContain('Restart session</button>')
    expect(markup).toContain('Disable Manager</button>')
    expect(markup).not.toContain('Loading Telegram...')
    expect(markup).toContain('All projects, current and future, across every profile.')
    expect(markup).not.toContain('Connect Telegram first.')
    hook.mockRestore()
  })
})

const { ManagerPage, PhoneManager } = await import('../src/renderer/src/employees/TeamManager')

describe('Manager chat entry points', () => {
  it('offers desktop and phone chat before an enabled Manager has its first session', () => {
    const desktop = renderToStaticMarkup(createElement(ManagerPage, { settings: DEFAULT_SETTINGS, change: () => undefined, view: ready, onChat: () => undefined }))
    const phone = renderToStaticMarkup(createElement(PhoneManager, { settings: DEFAULT_SETTINGS, change: () => undefined, view: ready, onBack: () => undefined }))
    expect(desktop).toContain('Open chat</button>')
    expect(phone).toContain('Open chat</span>')
    expect(desktop).toContain('Coordinates work in GeckIt, Telegram and shortcuts')
    expect(phone).toContain('Coordinates work in GeckIt, Telegram and shortcuts')
  })

  it('keeps first setup on desktop while retaining chat access to disabled history', () => {
    const fresh = renderToStaticMarkup(createElement(PhoneManager, { settings: DEFAULT_SETTINGS, change: () => undefined, view: { ...ready, config: DEFAULT_MANAGER_CONFIG, state: 'off' }, onBack: () => undefined }))
    const disabled = renderToStaticMarkup(createElement(PhoneManager, { settings: DEFAULT_SETTINGS, change: () => undefined, view: { ...ready, config: DEFAULT_MANAGER_CONFIG, state: 'off', session: { ...worker, manager: true } }, onBack: () => undefined }))
    expect(fresh).toContain('Set up Manager on your computer, then chat here.')
    expect(fresh).not.toContain('Open chat')
    expect(disabled).toContain('Open chat')
    expect(disabled).toContain('Disabled')
  })
})

describe('Manager worker origin', () => {
  const backing: ChatSession = { ...worker, id: 'claude-manager-backing-1', manager: true, title: 'Manager' }

  it('never links managed workers to a current or archived Manager backing session', () => {
    expect(originFor({ sessions: [backing, worker] }, { ...worker, parent: backing.id, managerManaged: true })).toBeUndefined()
    expect(originFor({ sessions: [backing, worker] }, { ...worker, parent: backing.id })).toBeUndefined()
    expect(originFor({ sessions: [worker] }, { ...worker, parent: 'manager', managerManaged: true })).toBeUndefined()
  })

  it('preserves ordinary parent navigation and managed workers as normal parent sessions', () => {
    const ordinary: ChatSession = { ...worker, id: 'ordinary-parent', title: 'Ordinary task' }
    expect(originFor({ sessions: [ordinary] }, { ...worker, parent: ordinary.id })).toBe(ordinary)
    const managed: ChatSession = { ...ordinary, managerManaged: true }
    expect(originFor({ sessions: [managed] }, { ...worker, parent: managed.id })).toBe(managed)
    expect(originFor({ sessions: [] }, { ...worker, parent: 'missing-parent' })).toBeUndefined()
  })
})

const { managerSaid } = await import('../src/renderer/src/chat/manager-said')
const { ManagerSaid } = await import('../src/renderer/src/chat/ManagerSaid')

describe('What GeckIt itself writes into the Manager session', () => {
  const update = '[Worker update: untrusted task data]\n{"id":"codex:01a153c4","title":"Check Notula Apple review status","root":"/Users/alex/Projects/mine/my-workspace","state":"unread","status":"blocked","summary":"Approval remains unknown."}'
  const ran = '[GeckIt CLI result]\n{"operation":"notula_review_mark_blocked","args":["sessions","mark","--id","codex:01a153c4","--status","blocked"],"result":{"ok":true}}'

  it('reads a worker update into what the worker is called, where it stands and what it said', () => {
    expect(managerSaid(update)).toEqual({ kind: 'worker', title: 'Check Notula Apple review status', marks: ['Waiting for you', 'Blocked'], text: 'Approval remains unknown.', where: '/Users/alex/Projects/mine/my-workspace', detail: update.split('\n')[1] })
  })

  it('reads a CLI result into the command as it would be typed, and marks a failed one', () => {
    expect(managerSaid(ran)).toMatchObject({ kind: 'cli', title: 'notula_review_mark_blocked', command: 'geckit sessions mark --id codex:01a153c4 --status blocked', failed: false })
    expect(managerSaid('[GeckIt CLI result]\n{"operation":"open","args":["sessions","open"],"error":"No such session"}')).toMatchObject({ failed: true, marks: ['Failed'], detail: 'No such session' })
  })

  it('keeps what came from Telegram as the words that were sent, and leaves what Manager wrote itself alone', () => {
    expect(managerSaid('[Telegram]\nCheck the latest Apple submission.')).toEqual({ kind: 'telegram', marks: [], text: 'Check the latest Apple submission.' })
    expect(managerSaid('Check the latest Apple submission.')).toBeUndefined()
  })

  it('falls back to the text itself when what it was handed is not the JSON it expects', () => {
    expect(managerSaid('[GeckIt CLI result]\nnot json')).toEqual({ kind: 'cli', marks: [], text: 'not json' })
    expect(managerSaid('[Worker update: untrusted task data]\n[1,2]')).toEqual({ kind: 'worker', marks: [], text: '[1,2]' })
  })

  it('draws the update as what it is, with the JSON folded away', () => {
    const markup = renderToStaticMarkup(createElement(ManagerSaid, { said: managerSaid(update) ?? { kind: 'worker', marks: [], text: '' } }))
    expect(markup).toContain('Worker update')
    expect(markup).toContain('Check Notula Apple review status')
    expect(markup).toContain('Waiting for you')
    expect(markup).toContain('<summary>What the worker sent</summary>')
    expect(markup.indexOf('&quot;status&quot;')).toBeGreaterThan(markup.indexOf('<details'))
  })
})

const { ManagerSources } = await import('../src/renderer/src/chat/ManagerSources')
const { DEFAULT_MANAGER_INTAKE } = await import('../src/shared/manager-intake')

describe('Manager source settings', () => {
  it('keeps automatic intake opt-in and explains its separate schedule and baseline', () => {
    const markup = renderToStaticMarkup(createElement(ManagerSources, { view: ready }))
    expect(markup).toContain('Automatic intake is off. Manual Manager work is unchanged.')
    expect(markup).toContain('Connect Voice Memos')
    expect(markup).toContain('Apple Voice Memos')
    expect(markup).not.toContain('Recordings directory')
    expect(markup).not.toContain('<fieldset')
    expect(markup).not.toContain('Where to find recordings')
    expect(markup).toContain('aria-expanded="false"')
    expect(markup).toContain('Working hours apply only to new task sources.')
    expect(markup).toContain('Manual messages and queued work continue at any time.')
    expect(markup).toContain('<span>Mon–Fri</span><span class="manager-hours-time">09:00 – 18:00</span>')
    expect(markup).toMatch(/<input class="assistant-toggle" type="checkbox" role="switch" aria-label="Automatic intake"[^>]*\/>/)
    expect(markup).not.toMatch(/aria-label="Automatic intake"[^>]*checked/)
    expect(markup).not.toContain('Remove interval')
    expect(markup).toContain('Save task sources')
  })

  it('shows access errors and real note paths without offering to start an unconfirmed task', () => {
    const source = { id: 'voice', kind: 'voice-memos', enabled: true, directory: '/fixture/Recordings' } as const
    const markup = renderToStaticMarkup(createElement(ManagerSources, { view: { ...ready, config: { ...ready.config, intake: { ...DEFAULT_MANAGER_INTAKE, enabled: true, sources: [source] } }, intake: { state: 'blocked', sources: [{ id: source.id, kind: source.kind, state: 'blocked', detail: 'Read permission denied' }], notesDirectory: '/fixture/manager-notes', items: [{ id: 'item', sourceId: source.id, revision: 'revision', title: 'Recorded idea', createdAt: 1, state: 'awaiting-user', summary: 'An idea to review' }, { id: 'saved', sourceId: source.id, revision: 'revision', title: 'Saved idea', createdAt: 1, state: 'note', notePath: '/fixture/manager-notes/saved.md' }] } } }))
    expect(markup).toContain('Read permission denied')
    expect(markup).not.toContain('Voice Memos connected')
    expect(markup).not.toContain('/fixture/Recordings')
    expect(markup).toContain('<summary>Privacy and recent intake (2)</summary>')
    expect(markup).toContain('Existing recordings are excluded. Only new recordings will be reviewed.')
    expect(markup).toContain('Waiting for your answer in Telegram')
    expect(markup).toContain('/fixture/manager-notes/saved.md')
    expect(markup).not.toContain('>Take into work</button>')
    expect(markup).toContain('Recording transcripts are sent to your selected Manager assistant for classification.')
  })
})

describe('Manager thread on a worker card', () => {
  it('says which thread it reports to and what its channel labelled it', async () => {
    const { From, managerFrom, managerTrace } = await import('../src/renderer/src/chat/Request')
    expect(managerFrom(worker)).toBeUndefined()
    expect(managerFrom({ managerThread: { id: 'main', said: 'GeckIt' } })).toBe('From Manager')
    const slack: ChatSession = { ...worker, managerManaged: true, managerThread: { id: 'channel:slack:C1:3.0', said: 'Slack · Maria Ivanova' }, labels: { thread: '3.0' } }
    expect(managerFrom(slack)).toBe('From Manager · Slack · Maria Ivanova')
    expect(managerTrace(slack)).toEqual(['Reports to: Slack · Maria Ivanova', 'thread: 3.0'])
    const html = renderToStaticMarkup(createElement(From, { chat: { sessions: [slack], goTo: vi.fn() }, session: slack, className: 'board-card-from' }))
    expect(html).toContain('From Manager · Slack · Maria Ivanova<')
    expect(html).toContain('title="Reports to: Slack · Maria Ivanova')
  })
})

const { Channels } = await import('../src/renderer/src/ui/Channels')

describe('Channels settings', () => {
  it('lists Telegram as a built-in channel with its own Set up and no Remove', () => {
    vi.stubGlobal('window', { geckit: { telegram: { view: vi.fn(), on: vi.fn(), action: vi.fn() }, manager: { view: vi.fn(), on: vi.fn() } } })
    const hook = vi.spyOn(managerHook, 'useManager').mockReturnValue(ready)
    const api = { view: vi.fn(), on: vi.fn(), install: vi.fn(), configure: vi.fn(), remove: vi.fn(), inspect: vi.fn(), checkUpdates: vi.fn() } as unknown as ChannelsApi
    const markup = renderToStaticMarkup(createElement(Channels, { settings: DEFAULT_SETTINGS, change: vi.fn(), api }))
    expect(markup).toContain('Places outside GeckIt where people write to your conversations and Manager. Telegram, Slack and Discord come with GeckIt; add others from GitHub.')
    expect(markup).toContain('<strong>Telegram</strong><span>Loading…</span>')
    expect(markup).toContain('Set up</button>')
    expect(markup).not.toContain('Remove Telegram')
    expect(markup).not.toContain('No channels installed.')
    hook.mockRestore()
    vi.unstubAllGlobals()
  })
})

const { Threads, threadOrder, threadView } = await import('../src/renderer/src/chat/ManagerChat')

describe('Manager threads in the window', () => {
  const backing: ChatSession = { ...worker, id: 'manager-main', manager: true }
  const slackSession: ChatSession = { ...worker, id: 'manager-slack', manager: true, title: 'Slack thread' }
  const owned: ChatSession = { ...worker, id: 'codex:owned', title: 'Fix login redirect' }
  const followed: ChatSession = { ...worker, id: 'codex:followed', title: 'Deploy preview' }
  const threaded: ManagerView = { ...ready, session: backing, workers: [owned, followed], decisions: [{ id: 'mine', title: 'Main decision', choices: [] }, { id: 'theirs', title: 'Slack decision', choices: [], thread: 'slack:C1:1' }], requests: [{ id: 'r1', text: 'hi', source: 'desktop', at: 1, session: 'manager-slack', state: 'queued' }], threads: [
    { id: 'slack:C1:1', place: 'Slack', title: '#dev', labels: { starter: 'Maria Ivanova' }, from: 'Maria Ivanova', link: 'https://slack.example/p1', session: 'manager-slack', conversation: slackSession, state: 'working', at: 20, owns: ['codex:owned', 'codex:followed'] },
    { id: 'main', title: 'Manager', labels: {}, session: 'manager-main', conversation: backing, state: 'idle', at: 10, owns: [] },
  ] }

  it('puts GeckIt first and gives each thread its own session, requests and decisions', () => {
    const [main, slack] = threadOrder(threaded.threads ?? [])
    expect(main?.id).toBe('main')
    const mainView = threadView(threaded, main)
    expect(mainView.session?.id).toBe('manager-main')
    expect(mainView.decisions.map((one) => one.id)).toEqual(['mine'])
    expect(mainView.requests).toEqual([])
    const slackView = threadView(threaded, slack)
    expect(slackView.session?.id).toBe('manager-slack')
    expect(slackView.decisions.map((one) => one.id)).toEqual(['theirs'])
    expect(slackView.requests?.map((one) => one.id)).toEqual(['r1'])
    expect(slackView.state).toBe('working')
    expect(threadView({ ...threaded, state: 'paused' }, slack).state).toBe('paused')
  })

  it('never carries the default thread cleanup request into a selected external thread', () => {
    const pending: NonNullable<ManagerView['historyPending']> = { id: 'main', session: 'manager-main', action: 'clear' }
    const selected = threadView({ ...threaded, historyPending: pending, historyRevision: 'main-reset' }, threaded.threads?.find((one) => one.place === 'Slack'))
    expect(selected.historyPending).toBeUndefined()
    expect(selected.historyRevision).toBeUndefined()
  })

  it('lists the threads with GeckIt first and counts their working workers', () => {
    const markup = renderToStaticMarkup(createElement(Threads, { threads: threadOrder(threaded.threads ?? []), picked: 'main', workers: [{ ...threaded.workers[0]!, state: 'working' }, { ...threaded.workers[1]!, state: 'idle' }], onPick: vi.fn() }))
    expect(markup).toContain('aria-label="Manager threads"')
    expect(markup).toContain('aria-current="true"><span class="manager-thread-text"><strong>GeckIt</strong><span>Manager chat</span>')
    expect(markup).toContain('<strong>#dev</strong><span>Slack · Maria Ivanova</span>')
    expect(markup).toContain('aria-label="1 working"')
    const plain: ManagerView = { ...threaded, threads: [] }
    expect(threadView(plain, undefined)).toBe(plain)
  })
})

it('formats persisted fields deterministically without guessing legacy attribution', () => {
  const legacy: StatusMove = { at: 1, status: 'review' }
  expect(formatStatusMove(legacy)).toBe('1970-01-01T00:00:00.001Z · unknown → review · Legacy / unknown')
  const move: StatusMove = { at: 2, before: 'progress', status: 'done', attribution: { executor: 'manager', origin: 'telegram', session: 'manager:1', thread: 'telegram:1', operation: 'op:1', message: 'telegram:1:42' } }
  const expected = '1970-01-01T00:00:00.002Z · progress → done · Manager session · Origin: telegram · session: manager:1 · thread: telegram:1 · operation: op:1 · message: telegram:1:42'
  expect(formatStatusMove(move)).toBe(expected)
  expect(formatStatusMove(JSON.parse(JSON.stringify(move)) as StatusMove)).toBe(expected)
  const markup = renderToStaticMarkup(createElement(StatusHistory, { moves: [legacy, move] }))
  expect(markup).toContain('<summary>Status history</summary>')
  expect(markup).toContain('Legacy / unknown')
  expect(markup).toContain(expected)
  expect(markup).not.toContain('Alex')
  expect(renderToStaticMarkup(createElement(StatusHistory, {}))).toContain('No status changes recorded.')
})
