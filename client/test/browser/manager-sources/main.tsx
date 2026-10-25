import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_SETTINGS } from '../../../src/shared/api'
import { DEFAULT_MANAGER_CONFIG } from '../../../src/shared/manager'
import type { ManagerApi, ManagerConfig, ManagerView } from '../../../src/shared/manager'
import { DEFAULT_MANAGER_INTAKE } from '../../../src/shared/manager-intake'
import type { TelegramApi, TelegramView } from '../../../src/shared/telegram'
import '../../../src/renderer/src/styles.css'

const params = new URLSearchParams(location.search)
const variant = params.get('state') ?? 'empty'
const source = { id: 'fixture-voice-memos', kind: 'voice-memos', enabled: true, directory: '/Users/fixture/Library/Group Containers/group.com.apple.VoiceMemos.shared/Recordings' } as const
let view: ManagerView = {
  config: { ...DEFAULT_MANAGER_CONFIG, enabled: true, provider: 'codex', intake: { ...DEFAULT_MANAGER_INTAKE, ...(variant === 'empty' ? {} : { enabled: true, sources: [source] }) } },
  state: 'idle', workers: [], activity: [], providers: [{ provider: 'codex', available: true }], decisions: [], queued: 0,
  intake: { ...(variant === 'blocked' ? { detail: 'Cannot read source history. Restore its backup before enabling intake.' } : {}), state: variant === 'empty' ? 'off' : variant === 'blocked' ? 'blocked' : 'ready', sources: variant === 'empty' ? [] : [{ id: source.id, kind: source.kind, state: variant === 'blocked' ? 'blocked' : 'ready', ...(variant === 'blocked' ? { detail: 'Cannot read the Voice Memos database. Check this computer’s file access permissions.' } : {}) }], notesDirectory: '/Users/fixture/Library/Application Support/GeckIt/manager-notes', items: variant !== 'pending' ? [] : [{ id: 'fixture-item', sourceId: source.id, revision: 'revision-1', title: 'A new idea recorded on iPhone', createdAt: 1, state: 'awaiting-user', suggestion: 'task', summary: 'Investigate the proposed feature. Choose Take into work, Save note or Skip in paired Telegram.' }, { id: 'fixture-note', sourceId: source.id, revision: 'revision-1', title: 'Research notes', createdAt: 1, state: 'note', notePath: '/Users/fixture/Library/Application Support/GeckIt/manager-notes/fixture-note.md' }] },
}
const listeners = new Set<Parameters<ManagerApi['on']>[0]>()
const fixture = { saves: [] as Partial<ManagerConfig>[], failSave: false }
Object.defineProperty(window, 'sourceFixture', { value: fixture })
const manager: ManagerApi = {
  view: async () => view,
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
Object.defineProperty(window, 'geckit', { value: { platform: 'darwin', manager, telegram, chat: { models: async () => [] } } })
document.documentElement.dataset['theme'] = params.get('theme') === 'dark' ? 'dark' : 'light'
document.documentElement.classList.add('framed')
const { SettingsDialog } = await import('../../../src/renderer/src/ui/SettingsDialog')
const root = document.getElementById('root')
if (root === null) throw new Error('Missing renderer root')
createRoot(root).render(createElement(SettingsDialog, { settings: DEFAULT_SETTINGS, first: 'manager', change: () => undefined, onClose: () => undefined, onShortcuts: () => undefined }))
