import { createElement, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_SETTINGS } from '../../../src/shared/api'
import type { Settings, Shortcut, ShortcutDraft } from '../../../src/shared/api'
import type { Geckit } from '../../../src/preload'
import type { Employee, EmployeesApi, EmployeesView } from '../../../src/shared/employees'
import type { ShortcutChat } from '../../../src/renderer/src/chat/ShortcutList'
import type { TeamChat } from '../../../src/renderer/src/employees/Team'
import { DEFAULT_MANAGER_CONFIG } from '../../../src/shared/manager'
import type { ManagerApi, ManagerConfig, ManagerView } from '../../../src/shared/manager'
import { DEFAULT_MANAGER_INTAKE } from '../../../src/shared/manager-intake'
import type { VoiceMemosConnection } from '../../../src/shared/manager-intake'
import type { TelegramApi, TelegramView } from '../../../src/shared/telegram'
import '../../../src/renderer/src/styles.css'
import '../../../src/renderer/src/chat/phone-home.css'
import '../shortcut-employees/fixture.css'
import './fixture.css'

const params = new URLSearchParams(location.search)
const variant = params.get('state') ?? 'empty'
const source = { id: 'fixture-voice-memos', kind: 'voice-memos', enabled: true, directory: '/Users/fixture/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings' } as const
let view: ManagerView = {
  config: { ...DEFAULT_MANAGER_CONFIG, enabled: true, provider: 'codex', ...(variant === 'empty' ? {} : { intake: { ...DEFAULT_MANAGER_INTAKE, timeZone: params.get('zone') ?? DEFAULT_MANAGER_INTAKE.timeZone, enabled: true, sources: variant === 'multiple' ? [source, { ...source, id: 'legacy-source-two', directory: '/fixture/legacy/Recordings', enabled: false }] : [source] } }) },
  state: 'idle', workers: [], activity: [], providers: [{ provider: 'codex', available: true }], decisions: [], queued: 0,
  intake: { ...(variant === 'blocked' ? { detail: 'Cannot read source history. Restore its backup before enabling intake.' } : {}), state: variant === 'empty' ? 'off' : variant === 'blocked' ? 'blocked' : 'ready', sources: variant === 'empty' ? [] : [{ id: source.id, kind: source.kind, state: variant === 'blocked' ? 'blocked' : 'ready', ...(variant === 'blocked' ? { detail: 'Cannot read the Voice Memos database. Check this computer’s file access permissions.' } : {}) }], notesDirectory: '/Users/fixture/Library/Application Support/GeckIt/manager-notes', items: variant !== 'pending' ? [] : [{ id: 'fixture-item', sourceId: source.id, revision: 'revision-1', title: 'A new idea recorded on iPhone', createdAt: 1, state: 'awaiting-user', suggestion: 'task', summary: 'Investigate the proposed feature. Choose Take into work, Save note or Skip in paired Telegram.' }, { id: 'fixture-note', sourceId: source.id, revision: 'revision-1', title: 'Research notes', createdAt: 1, state: 'note', notePath: '/Users/fixture/Library/Application Support/GeckIt/manager-notes/fixture-note.md' }] },
}
const listeners = new Set<Parameters<ManagerApi['on']>[0]>()
const initialConnection: VoiceMemosConnection = { state: variant === 'blocked' || variant === 'access' ? 'access' : variant === 'missing' ? 'missing' : variant === 'unsupported' ? 'unsupported' : 'connected', detail: variant === 'unsupported' ? 'Voice Memos is available on macOS.' : 'Read-only connection check completed.', transcription: { ready: variant !== 'transcription', detail: variant === 'transcription' ? 'Local transcription is not ready.' : 'Local transcription is ready.' } }
const fixture = { saves: [] as Partial<ManagerConfig>[], failSave: false, failCheck: false, connection: initialConnection, checkDelay: 0, checks: 0, privacyCalls: 0, shortcutSaves: [] as ShortcutDraft[], runs: [] as string[], navigations: [] as string[] }
Object.defineProperty(window, 'sourceFixture', { value: fixture })
const manager: ManagerApi = {
  view: async () => view,
  voiceMemos: async (action) => { if (fixture.failCheck) throw new Error('Fixture connection check failed. Try again.'); fixture.checks++; if (action === 'privacy') fixture.privacyCalls++; const result = fixture.connection; if (fixture.checkDelay > 0) await new Promise<void>((resolve) => setTimeout(resolve, fixture.checkDelay)); return result },
  inspect: async () => { throw new Error('Fixture does not inspect sessions') },
  onItems: () => () => undefined,
  configure: async (change) => {
    if (fixture.failSave) throw new Error('Fixture storage is unavailable. Settings were not saved.')
    fixture.saves.push(change)
    view = { ...view, config: { ...view.config, ...change } }
    listeners.forEach((listener) => listener(view))
    return view
  },
  pause: async () => view, resume: async () => view, retry: async () => view, restart: async () => view,
  on: (listener) => { listeners.add(listener); return () => { listeners.delete(listener) } },
}
const telegramView: TelegramView = { state: 'connected', pendingLate: 0, bot: { id: 1, username: 'fixture_bot' }, account: { id: 2, chatId: 3, name: 'Fixture account' } }
const telegram: TelegramApi = { view: async () => telegramView, on: () => () => undefined, action: async () => { throw new Error('Fixture never changes Telegram pairing') } }
const phone = params.get('phone') === '1'
const project = '/fixture/GeckIt'
const employee: Employee = { id: 'engineer', name: 'Максим', role: 'Engineer', description: 'Builds and verifies changes.', avatar: 'employee-03', archived: false, revision: 1 }
const employeesView: EmployeesView = { employees: [employee] }
const employees: EmployeesApi = { list: async () => employeesView, save: async () => { throw new Error('Fixture does not edit employees') }, archive: async () => employeesView, restore: async () => employeesView, retryInstructions: async () => employeesView, memory: async () => ({ employee, conversations: [], availability: 'complete' }), on: () => () => undefined }
const settings: Settings = { ...DEFAULT_SETTINGS, projects: [project], chatProviders: ['codex'], chatProvider: 'codex', managerShortcutsVersion: 1, calendarRecurrenceVersion: 1, cronStartWindowVersion: 1, shortcuts: [
  { id: 'manager-recordings', name: 'Check recordings with Manager', root: project, prompt: 'Check recordings and create tasks without duplicates. Preserve recordings.', target: 'manager', mode: 'auto', on: true, since: Date.now() },
  { id: 'manager-paused', name: 'Paused Manager cron', root: project, prompt: 'Check new recordings and create tasks.', target: 'manager', mode: 'auto', on: false, cron: '0 9 * * 1-5', since: Date.now() },
] }
const settingsListeners = new Set<(change: Partial<Settings>) => void>()
const shortcuts: Geckit['shortcuts'] = {
  save: async (draft) => {
    if (fixture.failSave) throw new Error('Fixture save failed')
    fixture.shortcutSaves.push(draft)
    const old = settings.shortcuts.find((one) => one.id === draft.id)
    const saved: Shortcut = { ...draft, id: draft.id ?? `fixture-shortcut-${fixture.shortcutSaves.length}`, since: old?.since ?? Date.now() }
    const next = old === undefined ? [...settings.shortcuts, saved] : settings.shortcuts.map((one) => one.id === saved.id ? saved : one)
    Object.assign(settings, { shortcuts: next }); settingsListeners.forEach((listener) => listener({ shortcuts: next })); return saved
  },
  remove: (id) => { const next = settings.shortcuts.filter((one) => one.id !== id); Object.assign(settings, { shortcuts: next }); settingsListeners.forEach((listener) => listener({ shortcuts: next })) },
  run: async (id) => { fixture.runs.push(id); return 'fixture-manager-session' },
  onManage: () => () => undefined,
}
const native: Pick<Geckit, 'platform' | 'manager' | 'telegram' | 'employees' | 'shortcuts'> & { readonly chat: Pick<Geckit['chat'], 'models'> } = { platform: 'darwin', manager, telegram, employees, shortcuts, chat: { models: async () => [] } }
Object.defineProperty(window, 'geckit', { value: native })
document.documentElement.dataset['theme'] = params.get('theme') === 'dark' ? 'dark' : 'light'
document.documentElement.classList.add('framed')
if (phone) document.documentElement.classList.add('phone')
const { Team } = await import('../../../src/renderer/src/employees/Team')
const { PhoneTeam } = await import('../../../src/renderer/src/employees/PhoneTeam')
const { ShortcutList } = await import('../../../src/renderer/src/chat/ShortcutList')
const { ShortcutSheet } = await import('../../../src/renderer/src/chat/PhoneShortcuts')
const root = document.getElementById('root')
if (root === null) throw new Error('Missing renderer root')
function FixtureApp(): React.JSX.Element {
  const [current, setCurrent] = useState(settings)
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState<Shortcut['id'] | ShortcutDraft>()
  const change = (next: Partial<Settings>): void => { Object.assign(settings, next); setCurrent((held) => ({ ...held, ...next })) }
  useEffect(() => {
    const listener = (next: Partial<Settings>): void => setCurrent((held) => ({ ...held, ...next }))
    settingsListeners.add(listener)
    return () => { settingsListeners.delete(listener) }
  }, [])
  const chat: ShortcutChat & TeamChat = { settings: current, everyone: [], employees: employeesView.employees, root: project, goTo: (id) => { fixture.navigations.push(id) }, change }
  const theme = document.documentElement.dataset['theme'] ?? 'light'
  const phoneDraft = typeof editing === 'string' ? current.shortcuts.find((one) => one.id === editing) : editing
  const preview = params.get('preview') === 'phone'
  const content = !open ? <button type="button" className="quiet" onClick={() => setOpen(true)}>Open Team</button> : phone ? <div className="phone-home"><PhoneTeam chat={chat} first="manager" back="Tasks" onBack={() => setOpen(false)} onEdit={setEditing} />{phoneDraft === undefined ? null : <ShortcutSheet key={phoneDraft.id ?? 'new'} chat={chat} given={phoneDraft} onClose={() => setEditing(undefined)} />}</div> : <><Team chat={chat} first="manager" onClose={() => setOpen(false)} onOpen={chat.goTo} onShortcut={setEditing} />{editing === undefined ? null : <ShortcutList chat={chat} start={editing} only onClose={() => setEditing(undefined)} />}</>
  if (phone) return content
  return <>
    <nav className="shortcut-fixture-controls" aria-label="Fixture preview"><a href={`?theme=${theme}`}>Desktop</a><a href={`?preview=phone&theme=${theme}`}>Phone 390px</a><a href={`?${preview ? 'preview=phone&' : ''}theme=light`}>Light</a><a href={`?${preview ? 'preview=phone&' : ''}theme=dark`}>Dark</a></nav>
    {preview ? <iframe className="shortcut-fixture-phone" title="390px Manager preview" src={`?phone=1&theme=${theme}`} /> : content}
  </>
}
createRoot(root).render(createElement(FixtureApp))
