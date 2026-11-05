import { createRoot } from 'react-dom/client'
import { vpnIpMismatchError } from '../../shared/vpn-ip'
import { DEFAULT_SETTINGS, providerOf } from '../../shared/api'
import type { ChatSession, ClaudeModel, SessionItem, SessionItems, SessionProvider, Settings } from '../../shared/api'
import { DEFAULT_MANAGER_CONFIG, MANAGER_CHAT_GUIDANCE } from '../../shared/manager'
import type { ManagerApi, ManagerRequestReceipt, ManagerSendRequest, ManagerView } from '../../shared/manager'
import type { TelegramAction, TelegramView } from '../../shared/telegram'
import type { Geckit } from '../../preload'
import type { PhoneCalls } from './phone-calls'
import './styles.css'
import './chat/phone-home.css'

const query = new URLSearchParams(location.search)
if (query.has('phone')) document.documentElement.classList.add('phone')
const noop = (): void => undefined
const listen = (): (() => void) => noop
const root = '/Users/alex/Projects/mine/geckit'
let settings: Settings = { ...DEFAULT_SETTINGS, managerAvatar: 'employee-01', theme: query.get('theme') === 'dark' ? 'dark' : 'light', projects: [root, '/Users/alex/Projects/mine/notula'], chatProviders: ['claude', 'codex', 'plugin:fixture'], providerPlugins: [{ id: 'plugin:fixture', family: 'plugin:fixture', name: 'Library fixture', shortName: 'Library', icon: 'terminal', browser: 'none', loginCommand: '', planName: 'Fixture' }], chatView: query.has('list') ? 'list' : 'board', analyticsAsked: true }
const settingsListeners = new Set<(value: Settings) => void>()
const managerListeners = new Set<(value: ManagerView) => void>()
const telegramListeners = new Set<(value: TelegramView) => void>()
const managerItemListeners = new Set<(value: SessionItems) => void>()
const itemListeners = new Set<(value: SessionItems) => void>()
const sessionsListeners = new Set<(value: readonly ChatSession[]) => void>()
const initialProvider: SessionProvider = query.get('provider') === 'codex' ? 'codex' : query.get('provider') === 'library' ? 'plugin:fixture' : 'claude'
const initialModel = initialProvider === 'codex' ? 'gpt-fixture' : initialProvider === 'plugin:fixture' ? 'library-model' : 'sonnet'
let backing: ChatSession = { id: initialProvider === 'claude' ? 'manager-fixture-1' : `${initialProvider}:manager-fixture-1`, manager: true, root: '/Users/alex/Library/Application Support/geckit/manager', title: 'Manager', stands: 'Ready', state: query.get('state') === 'working' ? 'working' : 'idle', at: Date.now(), here: true, mode: 'manual', model: initialModel }
let worker: ChatSession = { id: 'codex:worker-fixture', parent: backing.id, managerManaged: true, root, title: 'Add project provider preferences', stands: 'Waiting for your answer', state: 'asks', at: Date.now(), here: true, mode: 'auto' }
if (query.has('statusHistory')) {
  worker = { ...worker, status: 'blocked', moves: [
    { status: 'review', at: 1793912400000 },
    { status: 'done', before: 'progress', at: 1793912460000, attribution: { executor: 'manager', origin: 'telegram', session: backing.id, thread: 'main', operation: 'mark:telegram', message: 'telegram:trusted:42' } },
    { status: 'blocked', before: 'done', at: 1793912520000, attribution: { executor: 'system', origin: 'unknown' } },
  ] }
}
const unknownWorker = 'codex:unlisted-worker-fixture'
if (query.has('nativeRetry')) backing = { ...backing, state: 'working', retryNotice: 'Codex is retrying automatically.\nReconnecting... 1/5\n429 Too Many Requests' }
if (query.has('nativeRetryLong')) backing = { ...backing, state: 'working', retryNotice: `${backing.retryNotice ?? ''}\n${'Long provider diagnostic without whitespace. '.repeat(12)}${'x'.repeat(300)}` }
let view: ManagerView = { ...(query.has('legacyService') ? {} : { appChat: true }), queued: query.has('pending') ? 2 : 0, config: { ...DEFAULT_MANAGER_CONFIG, provider: initialProvider, enabled: query.get('state') !== 'setup' }, state: query.get('state') === 'setup' ? 'off' : query.get('state') === 'paused' ? 'paused' : query.get('state') === 'blocked' ? 'blocked' : query.get('state') === 'working' ? 'working' : 'idle', ...(query.get('state') === 'setup' ? {} : { session: backing }), workers: query.get('state') === 'setup' ? [] : [worker], decisions: query.has('decision') ? [{ id: 'start-worker', title: 'Start provider preference work in GeckIt?', choices: [{ label: 'Start', value: 'start' }, { label: 'Refuse', value: 'refuse' }] }] : [], activity: [{ id: 'fixture-cli-1', at: Date.now(), command: ['sessions', '--json'], state: 'done' }], providers: [{ provider: 'claude', available: true }, { provider: 'codex', available: true }, { provider: 'plugin:fixture', available: true }], ...(query.get('state') === 'blocked' ? { error: query.has('vpnMismatch') ? vpnIpMismatchError('5.165.50.8') : 'Claude Code is signed out. Sign in on your computer, then try again.' } : {}) }
if (query.has('many')) view = { ...view, workers: Array.from({ length: 30 }, (_one, index) => ({ ...worker, id: `codex:worker-fixture-${String(index)}`, title: `Worker ${String(index + 1)}: ${worker.title}` })), decisions: Array.from({ length: 20 }, (_one, index) => ({ id: `decision-${String(index)}`, title: `Start task ${String(index + 1)} in GeckIt?`, choices: [{ label: 'Start', value: 'start' }, { label: 'Refuse', value: 'refuse' }] })) }
if (query.has('noProviders')) { settings = { ...settings, chatProviders: [] }; view = { ...view, providers: [] } }
else if (query.has('disabledProvider')) { settings = { ...settings, chatProviders: settings.chatProviders.filter((provider) => provider !== initialProvider) }; view = { ...view, providers: view.providers.filter((one) => one.provider !== initialProvider) } }
let items: readonly SessionItem[] = [{ kind: 'mine', id: 'fixture-mine-1', text: 'Add provider preferences for this project.' }, { kind: 'theirs', id: 'fixture-theirs-1', text: 'Worker renderer fixture. No provider has been contacted.' }]
if (query.has('workerActions')) items = [...items, { kind: 'card', id: 'worker-card', card: { kind: 'permission', title: 'Worker permission fixture', detail: 'Fixture permission detail.' } }, { kind: 'shell', id: 'worker-shell', command: 'worker fixture', output: 'Worker input remains usable.', running: true }]
const telegramState = query.get('telegram')
const initialTelegramState: TelegramView['state'] = telegramState === 'connected' || telegramState === 'offline' || telegramState === 'revoked' || telegramState === 'conflict' || telegramState === 'storage-error' ? telegramState : 'disconnected'
let telegram: TelegramView = { state: initialTelegramState, pendingLate: 0, ...(initialTelegramState === 'disconnected' ? {} : { bot: { id: 1, username: 'geckit_fixture_bot' }, account: { id: 42, chatId: 42, name: 'Alex fixture', username: 'alex_fixture' } }), ...(initialTelegramState === 'conflict' ? { detail: 'Another app is using this bot. Stop its connection, then try again.' } : initialTelegramState === 'revoked' ? { detail: 'This bot token is no longer valid. Replace it with a token from BotFather.' } : initialTelegramState === 'storage-error' ? { detail: 'Secure storage is unavailable. Unlock your system credential store, then retry.' } : {}) }
// ?links shows two links shared from Telegram, with Stop.
if (query.has('links') && telegram.account !== undefined) telegram = { ...telegram, links: [{ id: 'fixture-site', title: 'localhost:5173', expiresAt: Date.now() + 11 * 3600_000 }, { id: 'fixture-file', title: 'weekly-report-with-a-long-name.html', expiresAt: Date.now() + 40 * 60_000 }] }
let previousTelegram = telegram
let telegramAttempt = 0
if (query.get('state') === 'disabled') view = { ...view, config: { ...view.config, enabled: false }, state: 'off' }
if (query.has('threads')) {
  const slack: ChatSession = { ...backing, id: 'manager-slack-fixture', title: 'Fix login redirect' }
  const following: ChatSession = { ...worker, id: 'codex:worker-following', title: 'Deploy preview for the login fix', state: 'working', stands: 'Working' }
  view = { ...view, workers: [...view.workers.filter((one) => one.id !== worker.id), worker, following], threads: [
    { id: 'main', title: 'Manager', labels: {}, session: backing.id, conversation: backing, state: 'idle', at: Date.now() - 600_000, owns: [], follows: [] },
    { id: 'slack:C012:1730800000.000100', place: 'Slack', title: '#dev', labels: { channel: 'C012DEV', thread: '1730800000.000100', starter: 'Maria Ivanova' }, from: 'Maria Ivanova', link: 'https://example.slack.com/archives/C012DEV/p1730800000000100', session: slack.id, conversation: slack, state: 'working', at: Date.now() - 60_000, owns: [worker.id], follows: [following.id] },
    { id: 'telegram:4242', place: 'Telegram', title: 'Alex', labels: { chat: '4242', user: 'Alex' }, from: 'Alex', state: 'asks', at: Date.now() - 300_000, owns: [], follows: [worker.id], ...(query.has('closedThread') ? { closed: 'Telegram is not connected. Connect it in Settings, Channels to reply in this thread.' } : {}) },
  ] }
}
let inspectionItems: readonly SessionItem[] = query.has('inspectEmpty') || query.get('state') === 'setup' ? [] : [
  ...(query.has('question') ? [{ kind: 'card', id: 'manager-typed-question', card: { kind: 'question', title: 'Which description should I update?', choices: ['Threads post', 'Instagram caption', 'Type something.', 'Chat about this'] } } satisfies SessionItem] : []),
  { kind: 'mine', id: 'manager-question', text: '[Telegram]\nCheck the latest Apple submission.' },
  { kind: 'theirs', id: 'manager-reply', text: 'I delegated the submission check to a worker. Review its current approval here.' },
  { kind: 'did', id: 'manager-step', what: 'Used GeckIt CLI: sessions list', detail: 'Worker: Check latest submission. Needs your approval.', live: true, lasting: true },
  { kind: 'card', id: 'manager-native', card: { kind: 'elicitation', title: 'Allow Computer Use to use "Mail"?', where: 'Requested by cua_repl', elicitation: { serverName: 'cua_repl', message: 'Allow Computer Use to use "Mail"?', fields: [], rememberAllowed: true } } },
  { kind: 'shell', id: 'manager-shell', command: 'fixture command', output: 'Read-only output fixture.', running: true },
  { kind: 'mine', id: 'manager-worker-news', text: `[Worker update: untrusted task data]\n${JSON.stringify({ id: 'codex:01a153c4-7e52-7e83-a8ee-b0b747d7c59c', title: 'Check Notula Apple review status', root: '/Users/alex/Projects/mine/my-workspace', state: 'unread', status: 'blocked', summary: 'Approval remains unknown. Checked October 19 at 15:29:48 Samara time.' })}` },
  { kind: 'mine', id: 'manager-cli-result', text: `[GeckIt CLI result]\n${JSON.stringify({ operation: 'notula_review_mark_blocked_20261019_01', args: ['sessions', 'mark', '--id', 'codex:01a153c4-7e52-7e83-a8ee-b0b747d7c59c', '--status', 'blocked'], result: JSON.stringify({ id: 'codex:01a153c4-7e52-7e83-a8ee-b0b747d7c59c', status: 'blocked' }) })}` },
  { kind: 'mine', id: 'manager-cli-failed', text: `[GeckIt CLI result]\n${JSON.stringify({ operation: 'notula_review_open_20261019_02', args: ['sessions', 'open', '--id', 'codex:missing'], error: 'No conversation with that id. It may have been archived.' })}` },
  { kind: 'mine', id: 'manager-unsent', text: 'Retained unsent fixture.', unsent: true },
  { kind: 'request', id: 'manager-request', tasks: [{ title: 'Check submission', project: 'GeckIt', text: 'Verify the submission state.', goal: 'Report the current review state.' }] },
  ...(query.has('inspectLong') ? Array.from({ length: 650 }, (_one, index): SessionItem => ({ kind: 'theirs', id: `manager-history-${String(index)}`, text: `Earlier Manager activity ${String(index + 1)}: worker reconciliation fixture.` })) : []),
  { kind: 'note', id: 'manager-stopped', note: 'stopped', text: 'Stopped fixture. Continue is intentionally unavailable in inspection.' },
]
const receipts = new Map<ManagerSendRequest['id'], ManagerRequestReceipt>()
const sends: ManagerSendRequest[] = []
const answers: { readonly id: string; readonly choice: string }[] = []
const calls = { send: 0, receipt: 0, answer: 0, answerCard: 0 }
let sendAttempt = 0
let answeringFails = query.has('answerFailure')
let connected = !query.has('offline')
const connectionListeners = new Set<(value: boolean) => void>()
const pushItems = (gone?: SessionItems['gone']): void => { for (const callback of managerItemListeners) callback({ id: backing.id, items: inspectionItems, ...(gone === undefined ? {} : { gone }) }) }
const fixture = {
  sends, answers,
  answerFailure: (value: boolean): void => { answeringFails = value },
  snapshot: () => ({ view, receipts: [...receipts.values()], sends, answers, calls, items: inspectionItems, connected }),
  connection: (value: boolean): void => { connected = value; for (const callback of connectionListeners) callback(value) },
  state: (state: ManagerView['state']): void => { update({ state, ...(state === 'blocked' ? { error: 'Fixture VPN check refused this request.' } : {}) }) },
  message: (text: string): void => { inspectionItems = [...inspectionItems, { kind: 'theirs', id: crypto.randomUUID(), text }]; pushItems() },
}
Object.assign(window, { geckitManagerFixture: fixture })
let inspectionAttempts = 0
let inspectionReplacement = false
const update = (change: Partial<ManagerView>): ManagerView => { view = { ...view, ...change }; for (const callback of managerListeners) callback(view); for (const callback of sessionsListeners) callback([worker]); return view }
const modelsFor = (provider: SessionProvider): readonly ClaudeModel[] => provider === 'codex' ? [{ value: 'gpt-fixture', name: 'GPT fixture' }, { value: 'gpt-unavailable', name: 'Unavailable GPT fixture', disabled: true, says: 'Update this assistant to use this model.' }] : provider === 'plugin:fixture' ? [{ value: 'library-model', name: 'Library model fixture' }] : [{ value: 'sonnet', name: 'Sonnet fixture' }, { value: 'opus', name: 'Opus fixture' }]
const replaceBacking = (provider: SessionProvider, model: string): void => {
  const id = `manager-fixture-${String(Date.now())}`
  backing = { ...backing, id: provider === 'claude' ? id : `${provider}:${id}`, model: model || modelsFor(provider)[0]?.value || '', chosen: model }
}
const manager: ManagerApi = {
  voiceMemos: async () => ({ state: 'unsupported', detail: 'Voice Memos connection checks are unavailable in this preview.' }),
  view: async () => view,
  inspect: async (id) => {
    const attempt = ++inspectionAttempts
    if (query.has('inspectFailure') && attempt === 1) throw new Error('Fixture history read failed. No provider was contacted.')
    const snapshot: SessionItems = { id, items: inspectionReplacement ? [{ kind: 'theirs', id: 'replacement-reply', text: 'Replacement Manager session fixture. Previous history is not shown as current.' }] : inspectionItems }
    if (query.has('inspectReplace') && !inspectionReplacement) {
      inspectionReplacement = true
      setTimeout(() => { replaceBacking(view.config.provider, view.config.chatModel); update({ session: backing }) }, 300)
      await new Promise<void>((resolve) => setTimeout(resolve, 900))
    }
    if (query.has('inspectLive')) setTimeout(() => { for (const callback of managerItemListeners) callback({ id, items: [{ kind: 'theirs', id: 'manager-live-reply', text: 'Live Manager update fixture received while inspection was open.' }] }) }, 300)
    if (query.has('inspectSlow')) await new Promise<void>((resolve) => setTimeout(resolve, 1200))
    return snapshot
  },
  send: async (request) => {
    calls.send++
    if (query.has('legacyService')) throw new Error('Unknown GeckIt service method.')
    if (!connected) throw new Error('Computer disconnected. Reconnect to send.')
    const accepted = receipts.get(request.id)
    if (accepted !== undefined) return accepted
    if (!view.config.enabled || view.state === 'paused' || view.state === 'blocked') throw new Error('Manager is unavailable. Open Manager settings to continue.')
    if (query.has('sendFailure') && ++sendAttempt === 1) throw new Error('Synthetic send failure. No request was accepted.')
    sends.push(request)
    const receipt: ManagerRequestReceipt = { id: request.id, session: backing.id, state: 'queued' }
    receipts.set(request.id, receipt)
    const pending = { ...receipt, text: request.text, at: Date.now(), source: 'desktop' as const }
    update({ requests: [...(view.requests ?? []), pending], queued: (view.queued ?? 0) + 1 })
    if (query.has('sendLost')) throw new Error('Synthetic response loss after durable acceptance.')
    if (!query.has('sendQueued')) setTimeout(() => {
      inspectionItems = [...inspectionItems, { kind: 'mine', id: `app-${request.id}`, text: request.text }, { kind: 'theirs', id: `reply-${request.id}`, text: 'Manager fixture received your request. No provider was contacted.' }]
      receipts.set(request.id, { ...receipt, state: 'sent' })
      update({ state: 'idle', requests: (view.requests ?? []).filter((one) => one.id !== request.id), queued: Math.max(0, view.queued - 1) })
      pushItems()
    }, 400)
    return receipt
  },
  receipt: async (id) => { calls.receipt++; if (query.has('legacyService')) throw new Error('Unknown GeckIt service method.'); if (!connected || query.has('receiptFailure')) throw new Error('Synthetic receipt lookup unavailable.'); return receipts.get(id) },
  answer: async (request) => {
    calls.answer++
    if (query.has('legacyService')) throw new Error('Unknown GeckIt service method.')
    if (query.has('answerSlow')) await new Promise<void>((resolve) => setTimeout(resolve, 1200))
    if (answeringFails) throw new Error('Synthetic answer refusal. Nothing was accepted.')
    if (request.session !== backing.id) throw new Error('Manager session changed. Reload before answering.')
    const decision = view.decisions.find((one) => one.id === request.id)
    if (decision === undefined || !decision.choices.some((one) => one.value === request.choice)) throw new Error('This request is no longer pending.')
    answers.push({ id: request.id, choice: request.choice })
    const next = update({ decisions: view.decisions.filter((one) => one.id !== request.id) })
    return { ...next, answer: 'Answer sent.' }
  },
  answerCard: async (session, card, answer) => {
    calls.answerCard++
    if (query.has('legacyService')) throw new Error('Unknown GeckIt service method.')
    if (query.has('answerSlow')) await new Promise<void>((resolve) => setTimeout(resolve, 1200))
    if (answeringFails) throw new Error('Synthetic answer refusal. Nothing was accepted.')
    if (session !== backing.id) throw new Error('Manager session changed. Reload before answering.')
    answers.push({ id: card, choice: answer })
    inspectionItems = inspectionItems.filter((one) => one.id !== card)
    pushItems([card])
    return true
  },
  onItems: (callback) => { managerItemListeners.add(callback); return () => managerItemListeners.delete(callback) },
  configure: async (change) => {
    if (query.has('saveFailure')) throw new Error('Could not save Manager. Try again.')
    const config = { ...view.config, ...change }
    const creating = config.enabled && (view.session === undefined || config.provider !== providerOf(backing.id))
    if (creating) {
      if (query.has('switchFailure') && config.provider === 'codex') {
        const { session: archived, ...withoutSession } = view
        void archived
        view = withoutSession
        const error = 'Selected assistant could not start. Check its setup and try again.'
        update({ config, state: 'blocked', error })
        throw new Error(error)
      }
      replaceBacking(config.provider, config.chatModel)
    }
    const { error: cleared, ...withoutError } = view
    void cleared
    view = withoutError
    return update({ config, ...(config.enabled ? { session: backing } : {}), state: !config.enabled ? 'off' : view.state === 'paused' ? 'paused' : 'idle' })
  },
  pause: async () => update({ state: 'paused' }), resume: async () => update({ state: 'idle', queued: 0 }), retry: async () => { const { error: removed, ...rest } = view; void removed; view = rest; return update({ state: 'idle' }) },
  restart: async () => { replaceBacking(view.config.provider, view.config.chatModel); return update({ session: backing, state: view.state === 'paused' ? 'paused' : 'idle' }) },
  on: (callback) => { managerListeners.add(callback); return () => managerListeners.delete(callback) },
}
const telegramAction = async (action: TelegramAction): Promise<TelegramView> => {
  if (action.kind === 'connect') {
    const attempt = ++telegramAttempt
    if (query.has('telegramSlow')) await new Promise<void>((resolve) => setTimeout(resolve, 2000))
    if (attempt !== telegramAttempt) return telegram
    if (action.token === 'invalid') {
      telegram = { ...telegram, state: telegram.account === undefined ? 'revoked' : telegram.state, detail: 'That token was not accepted. Check it with @BotFather and try again.' }
      for (const callback of telegramListeners) callback(telegram)
      return telegram
    }
    previousTelegram = telegram
    telegram = { state: 'pairing', bot: { id: 1, username: 'geckit_fixture_bot' }, pairing: { url: 'https://t.me/geckit_fixture_bot?start=fixture', expiresAt: Date.now() + 600000 }, pendingLate: 0 }
  } else if (action.kind === 'confirm' && telegram.candidate !== undefined) telegram = { state: 'connected', ...(telegram.bot === undefined ? {} : { bot: telegram.bot }), account: telegram.candidate, pendingLate: 0 }
  else if (action.kind === 'disconnect') { telegramAttempt++; telegram = { state: 'disconnected', pendingLate: 0 }; previousTelegram = telegram }
  else if (action.kind === 'cancel-pairing') { telegramAttempt++; telegram = previousTelegram }
  else if (action.kind === 'stop-link') telegram = { ...telegram, links: (telegram.links ?? []).filter((one) => one.id !== action.id) }
  else if (action.kind === 'retry') { const { detail: cleared, ...rest } = telegram; void cleared; telegram = { ...rest, state: telegram.account === undefined ? 'disconnected' : 'connected' } }
  for (const callback of telegramListeners) callback(telegram)
  return telegram
}
const chat: Partial<Geckit['chat']> = {
  search: async (text) => text === '' || !`${worker.title} worker`.toLowerCase().includes(text.toLowerCase()) ? [] : [{ id: worker.id, root, said: 'Worker renderer fixture', count: 1 }], list: async () => [worker], hidden: async () => [], items: async (id) => { if (id !== worker.id && id !== unknownWorker) throw new Error(`Error invoking remote method 'chat:items': Error: ${MANAGER_CHAT_GUIDANCE}`); return [...items] }, watching: noop, listening: noop,
  send: async (message) => { if (message.session !== worker.id && message.session !== unknownWorker) throw new Error(MANAGER_CHAT_GUIDANCE); const at = String(Date.now()); items = [...items, { kind: 'mine', id: `fixture-mine-${at}`, text: message.text }, { kind: 'theirs', id: `fixture-reply-${at}`, text: 'Worker renderer fixture received this message. No provider was contacted.' }]; for (const callback of itemListeners) callback({ id: message.session, items }); return message.session },
  onSessions: (callback) => { sessionsListeners.add(callback); return () => sessionsListeners.delete(callback) }, onItems: (callback) => { itemListeners.add(callback); return () => itemListeners.delete(callback) },
  account: async (provider) => ({ provider: provider ?? 'claude', here: true, signedIn: true, plan: 'Fixture' }), onAccount: listen, plan: async () => undefined, plans: async () => [], onPlan: listen, onPlans: listen,
  models: async (_root, provider) => query.has('modelsFailure') ? undefined : [...modelsFor(provider ?? 'claude')],
  onNotice: listen, onTask: listen, onEarlier: listen, onShow: (callback) => { if (query.has('staleManager')) queueMicrotask(() => callback('archived-manager-fixture')); else if (query.has('unknownWorker')) queueMicrotask(() => callback(unknownWorker)); else if (query.has('worker')) queueMicrotask(() => callback(worker.id)); return noop }, onSpotlight: listen, onScreenshot: listen,
  cutOff: async () => [], links: async () => [], waiting: async () => undefined, repo: async () => undefined, onGit: listen, git: async () => undefined, files: async () => [], mcp: async () => [], browsers: async () => [], picture: async () => undefined, queuedPicture: async () => undefined, read: noop,
  mark: (id, status) => {
    if (id !== worker.id) return
    const before = worker.status ?? 'progress'
    const target = status ?? 'progress'
    if (target === before) return
    const { status: _old, ...rest } = worker
    worker = { ...rest, ...(status === undefined ? {} : { status }), moves: [...(worker.moves ?? []), { before, status: target, at: Date.now(), attribution: { executor: 'user', origin: 'desktop' } }] }
    for (const callback of sessionsListeners) callback([worker])
  },
  openFile: noop, stop: noop, openLink: (url) => { if (url.startsWith('https://t.me/geckit_fixture_bot?start=') && telegram.state === 'pairing') { telegram = { ...telegram, state: 'confirming', candidate: { id: 42, chatId: 42, name: 'Alex fixture', username: 'alex_fixture' } }; for (const callback of telegramListeners) callback(telegram) } },
}
const bridge: Omit<Partial<Geckit>, 'chat' | 'hosts' | 'shortcuts' | 'settings' | 'update' | 'errors' | 'speech'> & { readonly chat: typeof chat; readonly hosts: Partial<Geckit['hosts']>; readonly shortcuts: Partial<Geckit['shortcuts']>; readonly settings: Partial<Geckit['settings']>; readonly update: Partial<Geckit['update']>; readonly errors: Partial<Geckit['errors']> } = {
  platform: 'darwin', home: '/Users/alex', copy: noop, pathFor: () => '', manager,
  telegram: { view: async () => telegram, action: telegramAction, on: (callback) => { telegramListeners.add(callback); return () => telegramListeners.delete(callback) } },
  employees: { list: async () => ({ employees: [] }), save: async () => { throw new Error('Employee editing is outside this Manager fixture.') }, archive: async () => ({ employees: [] }), restore: async () => ({ employees: [] }), retryInstructions: async () => ({ employees: [] }), memory: async () => { throw new Error('No employee memory in this fixture.') }, on: listen },
  chat, hosts: { list: async () => [], prompts: async () => [], onChanged: listen, onPrompt: listen, onAnswered: listen }, shortcuts: { onManage: listen },
  settings: { get: async () => settings, set: async (change) => { settings = { ...settings, ...change }; for (const callback of settingsListeners) callback(settings); return settings }, on: (callback) => { settingsListeners.add(callback); return () => settingsListeners.delete(callback) } },
  lineup: { state: async () => ({ working: 0, limit: 6 }), onChanged: listen },
  update: { view: async () => ({ state: 'off', version: 'preview', offered: '', channel: 'dev', percent: 0, message: '', waitingFor: [] }), on: listen }, errors: { onQuestion: listen, question: async () => undefined, answer: noop },
}
const phone: Pick<PhoneCalls, 'connected' | 'onConnection' | 'version'> = { connected: () => connected, onConnection: (callback) => { connectionListeners.add(callback); return () => connectionListeners.delete(callback) }, version: async () => 'preview' }
Object.assign(window, { geckit: bridge, ...(query.has('phone') ? { geckitPhone: phone } : {}) })
const { Chat } = await import('./chat/Chat')
createRoot(document.getElementById('root')!).render(<Chat />)
