import type { Geckit } from '../../../src/preload'
import { DEFAULT_SETTINGS } from '../../../src/shared/api'
import type { ChatSession, Settings } from '../../../src/shared/api'
import type { Json } from '../../../src/shared/elicitation'
import type { ManagerView } from '../../../src/shared/manager'
import { DEFAULT_MANAGER_CONFIG } from '../../../src/shared/manager'

export const fixture = { sends: 0, uploads: 0, paths: 0, subscriptions: new Map<string, Set<object>>() }
const project = 'C:/Fixtures/Project'
const session: ChatSession = { id: 'fixture-session', root: project, title: 'Background conversation', state: 'idle', stands: 'Ready', at: 1, mode: 'manual', here: true }
let settings: Settings = { ...DEFAULT_SETTINGS, projects: [project], chatProjects: [project], chatView: 'list', theme: 'light', analyticsAsked: true, newTaskRoot: project, chatMode: 'manual', vpnIpCheck: false }

export const contextBridge = { exposeInMainWorld: (_name: string, api: Geckit): void => { Object.defineProperty(window, 'geckit', { value: api }) } }
export const webUtils = { getPathForFile: (file: File): string => { fixture.paths++; return `C:\\Fixtures\\${file.name}` } }
export const ipcRenderer = {
  invoke: async (channel: string, change?: Partial<Settings>): Promise<Settings | readonly ChatSession[] | ManagerView | Json | undefined> => {
    if (channel === 'settings:get') return settings
    if (channel === 'settings:set') { settings = { ...settings, ...change }; return settings }
    if (channel === 'chat:list') return [session]
    if (channel === 'chat:account') return { here: true, signedIn: true, plan: 'Max' }
    if (channel === 'lineup:state') return { working: 0, limit: 6 }
    if (channel === 'manager:view') return { config: DEFAULT_MANAGER_CONFIG, queued: 0, state: 'off', workers: [], activity: [], providers: [], decisions: [] }
    if (channel === 'chat:models') return [{ value: 'sonnet', name: 'Sonnet', isDefault: true }]
    if (channel === 'chat:send') { fixture.sends++; return session.id }
    if (channel === 'chat:upload') { fixture.uploads++; return { path: '/fixture-upload.txt' } }
    if (channel === 'settings:accessibility') return true
    if (['chat:plans', 'chat:cutOff', 'chat:items', 'chat:links', 'chat:files', 'chat:commands', 'hosts:list', 'hosts:prompts'].includes(channel)) return []
    if (['chat:plan', 'chat:git', 'chat:repo', 'errors:question'].includes(channel)) return undefined
    throw new Error(`Unconfigured fixture IPC: ${channel}`)
  },
  send: (_channel: string): void => undefined,
  on: (channel: string, listener: object): void => {
    const listeners = fixture.subscriptions.get(channel) ?? new Set<object>()
    listeners.add(listener)
    fixture.subscriptions.set(channel, listeners)
  },
  off: (channel: string, listener: object): void => { fixture.subscriptions.get(channel)?.delete(listener) },
}
