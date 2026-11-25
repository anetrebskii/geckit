import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_SETTINGS } from '../../shared/api'
import type { ChatSession, Settings, Shortcut, TagChange, TaskTag } from '../../shared/api'
import { changedTags, cleanTagName, findTag } from '../../shared/tags'
import type { ChannelsView } from '../../shared/channels'
import type { HostView } from '../../shared/hosts'
import { DEFAULT_MANAGER_CONFIG, MANAGER_MAIN_THREAD } from '../../shared/manager'
import type { ManagerView } from '../../shared/manager'
import { createRendererApi } from '../../shared/renderer-api'
import type { RendererArgument } from '../../shared/renderer-api'
import type { SecretMetadata } from '../../shared/secrets'
import type { ConnectionStorage, SavedServer } from '../../shared/remote/storage'

// The real Chat window on a fake backend: every channel is answered from the fixtures below, and `window.preview` lets a test push changes.
const query = new URLSearchParams(location.search)
if (query.has('phone')) document.documentElement.classList.add('phone')
document.documentElement.dataset.theme = query.get('theme') === 'dark' ? 'dark' : 'light'

const at = Date.now()
const roots = ['/work/geckit', '/work/site']
const number = (key: string, fallback: number): number => Number(query.get(key) ?? fallback)
const session = (id: string, title: string, state: ChatSession['state'], extra: Partial<ChatSession> = {}): ChatSession => ({ id: `claude:${id}`, root: roots[0] ?? '', title, stands: state === 'asks' ? 'Asks to run a command' : state === 'working' ? 'Working' : 'Done', state, at: at - 60_000, here: true, mode: 'auto', ...extra })
const waiting = Array.from({ length: number('waiting', 3) }, (_one, index) => session(`asks-${String(index)}`, `Waiting conversation ${String(index + 1)}`, 'asks'))
const questions = [
  session('question-1', 'What does the queue limit do?', query.has('unread') ? 'unread' : 'idle', { question: true }),
  session('question-2', 'Which model is cheaper for long runs?', query.has('questionAsks') ? 'asks' : 'idle', { question: true }),
]
let sessions: ChatSession[] = [...waiting, session('working', 'Build the sidebar', 'working'), session('done', 'Fix the board scroll', 'idle'), ...questions]
// With `tags`, a catalog of five and tasks carrying none, two and all five, so chips, "+N", the picker and Filters can be reviewed.
const taskTags: TaskTag[] = query.has('tags') ? ['Release', 'Client', 'Bug', 'Waiting on design review', 'Later'].map((name, color) => ({ id: `tag-${String(color)}`, name, color, used: at - color * 60_000 })) : []
if (query.has('tags')) sessions = sessions.map((one, index) => (one.question === true ? one : index % 3 === 0 ? { ...one, tags: ['tag-0', 'tag-1'] } : index % 3 === 1 ? { ...one, tags: taskTags.map((tag) => tag.id) } : one))
const hostNames = ['build-box', 'staging', 'mac-mini', 'gpu-runner', 'office', 'lab-1', 'lab-2', 'lab-3', 'lab-4', 'lab-5', 'lab-6', 'lab-7']
let hosts: HostView[] = hostNames.slice(0, number('hosts', 2)).map((name, index) => ({ id: name, name, address: `${name}.local`, user: 'alex', port: 22, auth: 'key', state: index === 0 ? 'up' : 'idle', remembered: false, canRemember: true }))
let settings: Settings = {
  ...DEFAULT_SETTINGS,
  projects: [...roots, ...(hosts[0] === undefined ? [] : [`ssh://${hosts[0].id}/home/alex/app`])],
  hosts: hosts.map(({ id, name, address, user, port, auth }) => ({ id, name, address, user, port, auth })),
  showGecko: !query.has('geckoHidden'),
  analyticsAsked: true,
  taskTags,
  theme: query.get('theme') === 'dark' ? 'dark' : 'light',
  ...(query.has('place') ? { chatPlace: query.get('place') ?? 'tasks' } : {}),
  ...(query.has('noNames') ? { navNames: false } : {}),
  checklists: query.has('checklists') ? [
    { id: 'release', name: 'Release', items: [{ id: 'r1', title: 'Tests pass', check: 'command' }, { id: 'r2', title: 'Changelog written', check: 'none' }, { id: 'r3', title: 'Alex approves', check: 'person' }] },
    { id: 'review', name: 'Code review', items: [{ id: 'c1', title: 'No open comments', check: 'review' }] },
    { id: 'site', name: 'Site deploy', root: roots[1] ?? '/work/site', isDefault: true, items: [{ id: 's1', title: 'Build succeeds', check: 'command' }, { id: 's2', title: 'Pages load', check: 'none' }] },
  ] : [],
  ...(query.has('prompts') ? { promptKindsVersion: 1 as const, calendarRecurrenceVersion: 1 as const, cronStartWindowVersion: 1 as const, managerShortcutsVersion: 1 as const, shortcutDestinationsVersion: 1 as const } : {}),
  shortcuts: query.has('prompts') ? promptFixtures() : Array.from({ length: number('shortcuts', 0) }, (_, index) => ({ id: `shortcut-${String(index)}`, name: `Daily review ${String(index + 1)}`, root: roots[index % roots.length] ?? '/work/geckit', prompt: 'Review what changed yesterday and list what needs attention.', mode: 'auto', on: true, since: Date.now(), ...(index % 2 === 0 ? { cron: '0 10 * * *' } : {}) })),
}
// With `prompts`, two employees and Repeating, Scheduled and Shortcuts around now: runs that need Alex, one that ran, a long name, a busy day.
function promptFixtures(): Shortcut[] {
  const hour = 3_600_000
  const day = 24 * hour
  const nine = new Date(at); nine.setHours(9, 0, 0, 0)
  const base = { mode: 'auto' as const, on: true, since: at - day, prompt: 'Look through what changed and list what needs attention first.' }
  return [
    { ...base, id: 'r1', name: 'Morning plan', root: roots[0] ?? '', cron: '0 9 * * 1-5', vary: true, employeeId: 'e1' },
    { ...base, id: 'r2', name: 'Weekly dependency check', root: roots[1] ?? '', cron: '0 10 * * 1', model: 'claude-opus-4-1', provider: 'claude' },
    { ...base, id: 'r3', name: 'Inbox triage', root: roots[0] ?? '', cron: '30 * * * *', on: false, target: 'manager' },
    { ...base, id: 's1', name: 'Draft the release notes', root: roots[0] ?? '', at: nine.getTime() + day + hour, vary: true, employeeId: 'e2' },
    { ...base, id: 's2', name: 'Draft the LinkedIn post about the queue feature and the new Scheduled place with a long name that wraps', root: roots[1] ?? '', at: nine.getTime() + 2 * day, model: 'claude-sonnet-4-5', employeeId: 'e1' },
    { ...base, id: 's3', name: 'Clean up old worktrees', root: roots[0] ?? '', at: nine.getTime() - 2 * day, outcome: { state: 'missed' }, provider: 'codex' },
    { ...base, id: 's4', name: 'Ask about the invoice', root: roots[1] ?? '', at: nine.getTime() + 4 * hour - day, outcome: { state: 'didnt-start', reason: "Claude isn't available" } },
    { ...base, id: 's5', name: 'Back up notes', root: roots[0] ?? '', at: at - 2 * hour, outcome: { state: 'ran', started: at - 2 * hour + 42 * 60_000, session: 'claude:done', lateMinutes: 42 } },
    ...[2, 3, 4, 5].map((index) => ({ ...base, id: `s1${String(index)}`, name: `Busy day run ${String(index)}`, root: roots[index % 2] ?? '', at: nine.getTime() + 3 * day + index * hour })),
    { ...base, id: 'b1', name: 'Code review', root: roots[0] ?? '', employeeId: 'e2' },
    { ...base, id: 'b2', name: 'Summarise yesterday', root: roots[1] ?? '' },
  ]
}
const employees = query.has('prompts') ? [
  { id: 'e1', name: 'Maya Chen', role: 'Release manager', description: '', avatar: '', archived: false, revision: 1 },
  { id: 'e2', name: 'Oleg Brandt', role: 'Reviewer', description: '', avatar: '', archived: false, revision: 1 },
] : []
// With `restart`, settings and hosts survive a reload the way the service keeps them across a restart.
const restart = query.has('restart')
const read = <Value,>(key: string): Value | undefined => { try { const kept = sessionStorage.getItem(key); return kept === null ? undefined : JSON.parse(kept) as Value } catch { return undefined } }
const keep = (): void => { if (restart) { try { sessionStorage.setItem('preview-settings', JSON.stringify(settings)); sessionStorage.setItem('preview-hosts', JSON.stringify(hosts)) } catch { /* the reload starts fresh */ } } }
if (restart) { settings = read<Settings>('preview-settings') ?? settings; hosts = read<HostView[]>('preview-hosts') ?? hosts }
const manager: ManagerView = { appChat: true, queued: 0, config: { ...DEFAULT_MANAGER_CONFIG, enabled: !query.has('managerOff') }, state: query.has('managerOff') ? 'off' : 'idle', workers: [], decisions: [], activity: [], providers: [{ provider: 'claude', available: true }], ...(query.has('managerOff') ? {} : { session: session('manager', 'Manager', 'idle', { manager: true }), threads: [
  { id: MANAGER_MAIN_THREAD, title: 'GeckIt', labels: {}, provider: 'claude', model: '', state: 'idle', at: at - 120_000, owns: [] },
  { id: 'telegram:42', place: 'Telegram', title: 'Release checklist', from: 'Alex', labels: {}, provider: 'claude', model: '', state: 'working', manager: 'working', at: at - 60_000, owns: ['claude:working'] },
] }) }
let channels: ChannelsView = { failures: [], channels: [
  { id: 'channel:telegram', name: 'Telegram', icon: 'telegram', state: 'connected', says: '@geckit_alex_bot', secrets: ['token'], conversations: 2, builtIn: true },
  { id: 'channel:slack', name: 'Slack', icon: 'slack', state: 'setup', secrets: [], conversations: 0, builtIn: true },
  { id: 'channel:discord', name: 'Discord', icon: 'discord', state: 'off', secrets: [], conversations: 0, builtIn: true },
] }
let secrets: SecretMetadata[] = [
  { name: 'github-token', kind: 'http', places: ['api.github.com'], lifetime: 'keep', cleaned: true, createdAt: at - 86_400_000 },
  { name: 'staging-password', kind: 'website', places: ['https://staging.example.com'], lifetime: 'keep', cleaned: true, createdAt: at - 3_600_000 },
]

const listeners = new Map<string, Set<(value: unknown) => void>>()
const tell = (channel: string, value: unknown): void => { for (const one of listeners.get(channel) ?? []) one(value) }
const unknown = new Set<string>()
const calls = new Map<string, number>()
const answers: Record<string, (...args: readonly RendererArgument[]) => unknown> = {
  'settings:get': () => settings,
  'settings:set': (change) => { settings = { ...settings, ...(change as Partial<Settings>) }; keep(); tell('settings:changed', settings); return settings },
  'hosts:remove': (id) => { hosts = hosts.filter((one) => one.id !== id); settings = { ...settings, hosts: settings.hosts.filter((one) => one.id !== id) }; keep(); tell('hosts:changed', hosts); tell('settings:changed', settings) },
  'chat:list': () => sessions,
  'chat:send': (message) => {
    const asked = message as { root: string; text: string; tags?: readonly string[] }
    const made = session(`new-${String(Date.now())}`, asked.text, 'working', { root: asked.root, ...(asked.tags === undefined ? {} : { tags: asked.tags }) })
    sessions = [made, ...sessions]
    tell('chat:sessions', sessions)
    return made.id
  },
  'chat:tag': (ids, change) => {
    const asked = change as TagChange
    const made = (asked.create ?? []).map((raw) => { const name = cleanTagName(raw); const found = findTag(settings.taskTags, name); if (found !== undefined) return found; const tag = { id: `tag-${String(Date.now())}-${name}`, name, color: settings.taskTags.length % 8, used: Date.now() }; settings = { ...settings, taskTags: [...settings.taskTags, tag] }; return tag })
    sessions = sessions.map((one) => ((ids as string[]).includes(one.id) ? { ...one, tags: changedTags(one.tags, [...(asked.add ?? []), ...made.map((tag) => tag.id)], asked.remove ?? []) } : one))
    tell('settings:changed', settings); tell('chat:sessions', sessions)
    return made
  },
  'tags:edit': (id, change) => {
    const asked = change as { name?: string; color?: number }
    const name = asked.name === undefined ? undefined : cleanTagName(asked.name)
    if (name !== undefined && settings.taskTags.some((one) => one.id !== id && one.name.toLowerCase() === name.toLowerCase())) return Promise.reject(new Error('A tag with this name exists'))
    settings = { ...settings, taskTags: settings.taskTags.map((one) => (one.id === id ? { ...one, ...(name === undefined ? {} : { name }), ...(asked.color === undefined ? {} : { color: asked.color }) } : one)) }
    tell('settings:changed', settings)
    return settings.taskTags.find((one) => one.id === id)
  },
  'tags:delete': (id) => {
    const removedFrom = sessions.filter((one) => one.tags?.includes(id as string) === true).length
    sessions = sessions.map((one) => ({ ...one, tags: (one.tags ?? []).filter((tag) => tag !== id) }))
    settings = { ...settings, taskTags: settings.taskTags.filter((one) => one.id !== id), tagFilter: settings.tagFilter.filter((one) => one !== id) }
    tell('settings:changed', settings); tell('chat:sessions', sessions)
    return { removedFrom }
  },
  'chat:listStatus': () => [],
  'lineup:state': () => ({ working: 1, limit: 6 }),
  'hosts:list': () => hosts,
  'hosts:folders': () => [],
  'hosts:prompts': () => [],
  'hosts:known': () => [],
  'chat:cutOff': () => [],
  'chat:links': () => [],
  'chat:search': () => [],
  'chat:repo': () => undefined,
  'errors:question': () => undefined,
  'employees:list': () => ({ employees }),
  'shortcuts:save': (draft) => { const one = { ...(draft as Shortcut), since: Date.now(), id: (draft as Shortcut).id ?? `p${String(Date.now())}` }; const { startWindowMinutes: _window, ...kept } = one as Shortcut & { startWindowMinutes?: number }; settings = { ...settings, shortcuts: settings.shortcuts.some((x) => x.id === kept.id) ? settings.shortcuts.map((x) => x.id === kept.id ? { ...x, ...kept } : x) : [...settings.shortcuts, kept] }; tell('settings:changed', settings); return kept },
  'shortcuts:postpone': (id, moment) => { settings = { ...settings, shortcuts: settings.shortcuts.map((x) => { if (x.id !== id) return x; const { outcome: _outcome, ...rest } = x; return { ...rest, at: moment as number, postponedFrom: x.postponedFrom ?? x.at ?? (moment as number) } }) }; tell('settings:changed', settings); return settings.shortcuts.find((x) => x.id === id) },
  'shortcuts:remove': (id) => { settings = { ...settings, shortcuts: settings.shortcuts.filter((x) => x.id !== id) }; tell('settings:changed', settings) },
  'shortcuts:run': () => 'claude:done',
  'shortcuts:hold': () => undefined,
  'manager:view': () => manager,
  'manager:inspect': (id) => ({ id, items: [{ kind: 'mine', id: 'm1', text: 'What is running now?' }, { kind: 'theirs', id: 'm2', text: 'One conversation is working: Build the sidebar.' }] }),
  'channels:view': () => channels,
  'channels:configure': (id, change) => { channels = { ...channels, channels: channels.channels.map((one) => one.id === id ? { ...one, state: (change as { enabled?: boolean }).enabled === true ? 'connected' : 'off' } : one) }; return channels },
  'secrets:list': () => secrets,
  'secrets:status': () => ({ store: 'Keychain' }),
  'secrets:history': () => [],
  'secrets:revoke': (name) => { secrets = secrets.filter((one) => one.name !== name); return 1 },
  'secrets:prepare': () => Promise.reject(new Error('Manage secrets on the computer.')),
  'chat:account': () => ({ provider: 'claude', here: true, signedIn: true, plan: 'Max' }),
  'chat:plans': () => [],
  'chat:items': () => ({ items: [{ kind: 'mine', id: 'one', text: 'Make the sidebar fold below 884 px.' }, { kind: 'theirs', id: 'two', text: 'Done. The sidebar shows icons only below 884 px.' }], earlier: 0 }),
  'chat:models': () => [],
  'chat:git': () => undefined,
  'browser:state': () => ({ on: true, profiles: [], testing: { supported: true, profiles: [] } }),
  'shortcuts:runs': () => [],
  'shortcuts:destinations': () => [],
}
// With `live=<port>`, tags, the task list and settings go to a real service through a local bridge.
const LIVE = ['chat:list', 'chat:tag', 'tags:edit', 'tags:delete', 'settings:get', 'settings:set', 'chat:send', 'chat:schedule']
const live = query.get('live')
const toLive = async (channel: string, args: readonly RendererArgument[]): Promise<unknown> => {
  const answer = (await (await fetch(`http://localhost:${live ?? ''}/call`, { method: 'POST', body: JSON.stringify({ channel, args }) })).json()) as { result?: unknown; error?: string; sessions: ChatSession[]; settings: Settings }
  sessions = answer.sessions
  settings = { ...settings, ...answer.settings }
  tell('settings:changed', settings)
  tell('chat:sessions', sessions)
  if (answer.error !== undefined) throw new Error(answer.error)
  return answer.result
}
if (live !== null) await toLive('chat:list', [])
const transport = {
  invoke: <Result,>(channel: string, ...args: readonly RendererArgument[]): Promise<Result> => {
    calls.set(channel, (calls.get(channel) ?? 0) + 1)
    if (live !== null && LIVE.includes(channel)) return toLive(channel, args) as Promise<Result>
    const answer = answers[channel]
    if (answer === undefined && !unknown.has(channel)) { unknown.add(channel); console.warn('[preview] unanswered', channel) }
    return Promise.resolve(answer?.(...args) as Result)
  },
  send: (channel: string, ...args: readonly RendererArgument[]): void => { void answers[channel]?.(...args) },
  listen: <Value,>(channel: string, said: (value: Value) => void): (() => void) => {
    const set = listeners.get(channel) ?? new Set()
    set.add(said as (value: unknown) => void)
    listeners.set(channel, set)
    // The service pushes the full list as soon as a window listens; general questions only ever come this way.
    if (channel === 'chat:sessions') void Promise.resolve().then(() => (said as (value: unknown) => void)(sessions))
    return () => set.delete(said as (value: unknown) => void)
  },
}
// GeckIt computers this one has paired with; `remote` draws the window as the first one's workspace shows it.
const computerNames = ['Studio Mac', 'office-mini', 'Lab Linux', 'render-box', 'Mac Pro', 'nas', 'gpu-1', 'gpu-2', 'build-1', 'build-2', 'Home iMac', 'Travel Air']
const saved: SavedServer[] = computerNames.slice(0, number('computers', 2)).map((name, index) => ({ server: { id: `computer-${String(index)}`, name, publicKey: '' }, device: '', key: '', signal: '', projects: [], manager: true }))
const connectionStorage: ConnectionStorage = { publicKey: () => Promise.resolve(''), sign: () => Promise.resolve(''), list: () => Promise.resolve(saved), remember: () => Promise.resolve(), forget: () => Promise.resolve(), name: () => Promise.resolve() }
const first = saved[0]
if (query.has('remote') && first !== undefined) window.geckitRemoteComputer = { server: first.server, state: 'connected', choices: saved, onChoose: (id) => { console.warn('[preview] chose computer', id) } }
// With `screen`, the host's screen is a drawn picture and every control order is kept in `preview.orders()`.
const orders: unknown[] = []
if (query.has('screen')) {
  const canvas = Object.assign(document.createElement('canvas'), { width: 1440, height: 900 })
  const paint = canvas.getContext('2d')
  const draw = (): void => { if (paint === null) return; paint.fillStyle = '#1e3a5f'; paint.fillRect(0, 0, 1440, 900); paint.fillStyle = '#fff'; paint.font = '64px sans-serif'; paint.fillText(new Date().toLocaleTimeString(), 80, 160) }
  draw(); setInterval(draw, 500)
  Object.assign(window, { geckitScreen: {
    start: () => query.has('screenLocked') ? Promise.reject(new Error('The host is locked, and a locked computer shows nobody its screen. Unlock it, then try again.')) : Promise.resolve(canvas.captureStream(5)),
    stop: () => undefined,
    control: (order: unknown) => { orders.push(order); return Promise.resolve({ x: 0.5, y: 0.5 }) },
  } })
}
Object.assign(window, {
  geckit: { ...createRendererApi(transport, { platform: 'darwin', home: '/Users/alex', pathFor: () => '' }), connectionStorage },
  preview: {
    unknown: () => [...unknown],
    sessions: (next: ChatSession[]) => { sessions = next; tell('chat:sessions', sessions) },
    settings: () => settings,
    calls: () => Object.fromEntries(calls),
    orders: () => orders,
  },
})

await import('./styles.css')
const { Chat } = await import('./chat/Chat')
const { Tips } = await import('./ui/Tips')
createRoot(document.getElementById('root')!).render(<StrictMode><Chat /><Tips /></StrictMode>)
