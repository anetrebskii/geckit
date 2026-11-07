import type { Settings } from './api'

export const AGENT_SETTING_RULES = {
  theme: ['system', 'light', 'dark'],
  employeeFilter: 'string', welcomed: 'boolean',
  boardHeight: 'nonnegative integer', sidebarWidth: 'nonnegative integer', progressOrder: 'string array', columnOrders: 'string array map',
  chatBounds: 'bounds', panelBounds: 'bounds', geckoBounds: 'bounds',
  nativeLanguage: 'string', secondLanguage: 'string', microphoneDeviceId: 'string',
  analytics: 'boolean', sendErrors: 'boolean', showGecko: 'boolean', autoUpdate: 'boolean',
  updateChannel: ['stable', 'dev'], flashFor: ['asks', 'all', 'never'], soundFor: ['asks', 'all', 'never'],
  workingAtOnce: 'nonnegative integer', anywhereOff: ['correct', 'dictate', 'search', 'orders', 'screenshot', 'record'],
  correctPlanModel: 'string', correctProvider: 'enabled provider', correctCodexModel: 'string',
  chatModel: 'string', codexModel: 'string', chatProvider: 'enabled provider',
  chatMode: ['manual', 'auto', 'plan'], chatTransport: ['stream', 'tmux'],
  codexReasoning: ['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
  providerModels: 'provider/model array', providerAutoUpdate: 'boolean', channelAutoUpdate: 'boolean',
  chatGrouping: ['time', 'project'], chatView: ['list', 'board'], conversationPlace: ['over', 'below'],
  chatAll: 'boolean', chatProjects: 'registered project array', newTaskRoot: 'registered project or empty',
  projectAssistants: 'root/provider array', profiles: 'profile array', profile: 'profile id or empty',
  favorites: 'string array', phrases: 'string array', boardColumns: 'column array', openWith: 'open rule array',
  browserNames: 'string map', projectColors: 'project color map',
  guideClaude: 'boolean', guideCodex: 'boolean', guidePlugins: 'boolean map', chromeBridge: 'boolean', phone: 'boolean',
  vpnIpCheck: 'boolean', vpnAllowedIps: 'string array', managerAvatar: 'portrait or empty',
} as const satisfies Partial<{ readonly [Key in keyof Settings]: string | readonly string[] }>

export type AgentSettings = Pick<Settings, keyof typeof AGENT_SETTING_RULES>
export type AgentSettingsPatch = Partial<AgentSettings>
export interface SettingsCliAsked {
  readonly action: 'settings'
  readonly args: readonly string[]
}
export type SettingsCliAnswered = { readonly ok: true; readonly result: string } | { readonly ok: false; readonly error: string }

export const AGENT_SETTINGS_SCHEMA = {
  commands: ['settings schema', 'settings show', 'settings edit --patch <JSON object> [--expected <JSON object>]'],
  fields: AGENT_SETTING_RULES,
  semantics: 'Patch only named fields; arrays replace; maps merge named entries. --expected compares named fields with current values. anywhereOff takes an array of the listed global action IDs; other choice lists take a single string. Empty patch is rejected. Read back after writes or uncertain responses.',
  unavailable: 'Credentials, pairing keys, runtime history and internal state. Use dedicated providers, channels, hosts, projects, employees and shortcuts commands for those entities; capabilities describes target authority and native boundaries. Use the dedicated shortcuts commands for saved prompts and schedules; settings manager-edit for Manager instructions.',
} as const
