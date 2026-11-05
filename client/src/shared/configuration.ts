import type { Settings, Shortcut } from './api'
import type { Employee } from './employees'
import type { ManagerConfig } from './manager'

export const PREFERENCE_SECTIONS = {
  general: ['theme', 'nativeLanguage', 'secondLanguage', 'analytics', 'analyticsAsked', 'sendErrors', 'showGecko', 'autoUpdate', 'updateChannel', 'anywhereOff', 'flashFor', 'soundFor', 'workingAtOnce', 'welcomed', 'managerAvatar'],
  assistants: ['correctPlanModel', 'correctProvider', 'correctCodexModel', 'chatModel', 'providerModels', 'chatTransport', 'chatProvider', 'chatProviders', 'providerPlugins', 'providerAutoUpdate', 'codexModel', 'codexReasoning', 'chatMode'],
  projects: ['projects', 'projectAssistants', 'newTaskRoot', 'profiles', 'profile', 'projectColors', 'chatAll', 'chatProjects', 'employeeFilter'],
  conversation: ['chatGrouping', 'chatView', 'conversationPlace', 'boardHeight', 'boardColumns', 'openWith', 'chatBounds', 'panelBounds', 'geckoBounds', 'sidebarWidth'],
  speech: ['microphoneDeviceId'],
  integrations: ['browserNames', 'guideClaude', 'guideCodex', 'guidePlugins', 'chromeBridge', 'chromeBridgeDefault', 'phone', 'vpnIpCheck', 'vpnAllowedIps', 'channels', 'channelAutoUpdate'],
} as const satisfies { readonly [section: string]: readonly (keyof Settings)[] }

export const LOCAL_SETTINGS = ['audioDevices', 'client', 'transcriptions', 'favorites', 'phoneKey', 'progressOrder', 'columnOrders', 'providerUpdatesReady', 'providerRemovalPending'] as const satisfies readonly (keyof Settings)[]

type ShortcutHistory = Pick<Shortcut, 'id' | 'since' | 'lastRun' | 'lastSession'>
export type ConfiguredShortcut = Omit<Shortcut, Exclude<keyof ShortcutHistory, 'id'>>
export type LocalSettings = Partial<Pick<Settings, typeof LOCAL_SETTINGS[number]>> & { readonly shortcutHistory?: readonly ShortcutHistory[] }
type PreferenceSections = { readonly [Section in keyof typeof PREFERENCE_SECTIONS]?: Partial<Pick<Settings, typeof PREFERENCE_SECTIONS[Section][number]>> }

export type Configuration = PreferenceSections & Partial<Pick<Settings, 'hosts' | 'phrases'>> & {
  readonly version: 1
  readonly shortcuts?: readonly ConfiguredShortcut[]
  readonly employees?: readonly Employee[]
  readonly manager?: Partial<ManagerConfig>
}

type CoveredSettings = typeof PREFERENCE_SECTIONS[keyof typeof PREFERENCE_SECTIONS][number] | typeof LOCAL_SETTINGS[number] | 'shortcuts' | 'hosts' | 'phrases' | 'calendarTimeZone' | 'calendarRecurrenceVersion' | 'cronStartWindowVersion' | 'managerShortcutsVersion'
export type UnsectionedSettings = Exclude<keyof Settings, CoveredSettings>
