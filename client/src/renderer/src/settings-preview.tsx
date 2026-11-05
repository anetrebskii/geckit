import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { DEFAULT_SETTINGS } from '../../shared/api'
import type { ClaudeAccount, SessionProvider, Settings } from '../../shared/api'
import type { LlmProviderInfo, ProviderPluginFailure } from '../../shared/providers'
import type { ChannelChange, ChannelSetting, ChannelsView } from '../../shared/channels'
import { registerProviderInfo } from '../../shared/providers'
import { DEFAULT_MANAGER_CONFIG } from '../../shared/manager'
import type { TelegramAction, TelegramView } from '../../shared/telegram'
import './styles.css'
import './chat/phone-home.css'

Object.assign(window, { geckit: { platform: 'darwin', home: '/Users/alex' } })
const query = new URLSearchParams(location.search)
const theme = query.get('theme') === 'light' ? 'light' : 'dark'
if (query.has('phone')) document.documentElement.classList.add('phone')
const claudeTmux: LlmProviderInfo = { id: 'plugin:claude-tmux', family: 'plugin:claude-tmux', name: 'Claude Code (tmux)', shortName: 'Claude tmux', icon: 'tmux', browser: 'claude', loginCommand: 'claude auth login', planName: 'Claude', localOnly: true, instructions: 'claude', source: 'https://github.com/example/geckit-claude-tmux' }
const sourceLibraries: readonly LlmProviderInfo[] = query.has('libraries') ? [
  { id: 'plugin:codex-mirror', family: 'plugin:codex-mirror', name: 'Codex Mirror', shortName: 'Mirror', icon: 'codex-mirror', iconPath: 'M8 1.8 14.2 8 8 14.2 1.8 8Z M8 4.6 11.4 8 8 11.4 4.6 8Z', browser: 'codex', loginCommand: 'codex login', planName: 'ChatGPT', runtime: 'codex', source: 'https://github.com/anetrebskii/geckit-codex-mirror' },
  { id: 'plugin:kimi', family: 'plugin:kimi', name: 'Kimi Code', shortName: 'Kimi', icon: 'terminal', browser: 'none', loginCommand: 'kimi login', planName: 'Kimi', source: 'https://github.com/example/geckit-kimi' },
  query.has('legacy') ? { ...claudeTmux, id: 'claude-tmux', family: 'claude', transport: 'tmux' } : claudeTmux,
 ] : []
const libraries = sourceLibraries.filter((one) => !(query.has('failed') && one.id === 'plugin:claude-tmux'))
const failedLibraries: readonly ProviderPluginFailure[] = query.has('failed') ? [{ id: 'plugin:claude-tmux', name: 'Claude Code (tmux)', icon: 'tmux', source: 'https://github.com/anetrebskii/geckit-claude-tmux', error: 'Plugin does not implement LlmProvider.' }] : []
registerProviderInfo(libraries)
document.documentElement.dataset.theme = theme
Object.assign(window.geckit, { chat: { getProviderPluginFailures: async (): Promise<readonly ProviderPluginFailure[]> => failedLibraries, account: async (provider: SessionProvider): Promise<ClaudeAccount> => ({ provider, here: true, signedIn: true, plan: provider === 'codex' ? 'Plus' : 'Max', program: { version: 'preview' }, usage: { quotas: [{ id: 'five-hour', name: '5h', part: 0.24 }, { id: 'week', name: 'Week', part: 0.63 }], measuredAt: Date.now() } }), onAccount: () => () => undefined } })

const chrome = query.get('chrome') ?? 'waiting'
let chromeConnected = chrome === 'connected'
let chromeReceived = ['ready', 'kept', 'connected'].includes(chrome) ? 2_497_281_120 : 1_210_000_000
let chromeModel = chrome === 'absent' ? false : true
let testProfiles = [{ name: 'store', open: true }, { name: 'staging', open: false }]
Object.assign(window.geckit, { browser: {
  state: async () => {
    if (chrome === 'downloading' || chrome === 'waiting') chromeReceived = Math.min(2_497_281_120, chromeReceived + 90_000_000)
    const done = chromeReceived >= 2_497_281_120
    return { supported: chrome !== 'windows', connected: chromeConnected, folder: '/Users/alex/.geckit/chrome-extension', modelServer: chrome !== 'noserver', model: !chromeModel ? { state: 'absent', received: 0, total: 2_497_281_120 } : chrome === 'failed' ? { state: 'failed', received: 640_000_000, total: 2_497_281_120, error: 'Model download answered 503' } : { state: done ? 'ready' : 'downloading', received: chromeReceived, total: 2_497_281_120 }, testing: { supported: true, version: '142.0.7444.175', profiles: testProfiles } }
  },
  fetchModel: async () => undefined,
  deleteModel: async () => { chromeModel = false },
  openTest: async (name: string) => { testProfiles = testProfiles.map((one) => one.name === name ? { ...one, open: true } : one) },
  deleteTest: async (name: string) => { testProfiles = testProfiles.filter((one) => one.name !== name) },
  openFolder: async () => { setTimeout(() => { chromeConnected = true }, 3000) },
} })

const slackInfo: ChannelSetting['info'] = { id: 'channel:slack', name: 'Slack', icon: 'chat', source: 'https://github.com/example/geckit-slack', fields: [{ key: 'botToken', label: 'Bot token', type: 'secret', required: true, help: 'xoxb-, from OAuth and Permissions.' }, { key: 'appToken', label: 'App token', type: 'secret', required: true, help: 'xapp-, with connections:write.' }, { key: 'allow', label: 'People who may write', type: 'list', help: 'Slack user IDs. Empty lets nobody in.' }, { key: 'verify', label: 'Check messages for secrets before sending', type: 'boolean', default: true }] }
let channelSettings: readonly ChannelSetting[] = query.has('channels') ? [{ info: slackInfo, enabled: query.get('channels') !== 'off', projects: ['/Users/alex/Projects/app'], manager: false, config: { allow: ['U012ABC'] } }] : []
let channelView: ChannelsView = { channels: channelSettings.map((one): ChannelsView['channels'][number] => ({ id: one.info.id, name: one.info.name, icon: one.info.icon, source: one.info.source ?? '', state: query.get('channels') === 'off' ? 'off' : query.get('channels') === 'failed' ? 'failed' : 'connected', ...(query.get('channels') === 'failed' ? { says: 'Slack refused the app token: invalid_auth' } : { says: 'Listening in 3 channels' }), secrets: query.get('channels') === 'off' ? [] : ['botToken', 'appToken'], conversations: 4, threads: 3, builtIn: true })), failures: query.has('channelFailed') ? [{ id: 'channel:jira', name: 'Jira', source: 'https://github.com/example/geckit-jira', error: 'Channel library must export create().' }] : [] }
const channelListeners = new Set<(view: ChannelsView) => void>()
const telegramConnected = query.get('telegram') === 'connected'
let telegramView: TelegramView = { state: telegramConnected ? 'connected' : 'disconnected', pendingLate: 0, ...(telegramConnected ? { bot: { id: 1, username: 'alex_geckit_bot' }, account: { id: 4242, name: 'Alex Netrebskii', username: 'anetrebskii' } } : {}) } as TelegramView
Object.assign(window.geckit, {
  telegram: { view: async () => telegramView, on: () => () => undefined, action: async (action: TelegramAction) => { if (action.kind === 'disconnect') telegramView = { state: 'disconnected', pendingLate: 0 } as TelegramView; return telegramView } },
  manager: { view: async () => ({ queued: 0, config: { ...DEFAULT_MANAGER_CONFIG, enabled: !query.has('managerOff') }, state: 'idle', workers: [], activity: [], providers: [], decisions: [] }), on: () => () => undefined },
})
let channelSettingsChanged: (channels: readonly ChannelSetting[]) => void = () => undefined
const tellChannels = (): ChannelsView => { channelSettingsChanged(channelSettings); for (const listener of channelListeners) listener(channelView); return channelView }
Object.assign(window.geckit, { channels: {
  view: async () => channelView,
  install: async () => { await new Promise<void>((resolve) => setTimeout(resolve, 800)); throw new Error('This repository is not a GeckIt channel library.') },
  configure: async (id: string, change: ChannelChange) => {
    await new Promise<void>((resolve) => setTimeout(resolve, 300))
    if (change.config?.['allow'] !== undefined && (change.config['allow'] as readonly string[]).some((one) => one.trim() !== '' && !/^U[A-Z0-9]+$/.test(one.trim()))) throw new Error('People who may write takes Slack user IDs such as U012ABC.')
    channelSettings = channelSettings.map((one) => one.info.id === id ? { ...one, ...(change.enabled === undefined ? {} : { enabled: change.enabled }), ...(change.projects === undefined ? {} : { projects: change.projects }), ...(change.manager === undefined ? {} : { manager: change.manager }), ...(change.config === undefined ? {} : { config: change.config }) } : one)
    const secrets = new Set(channelView.channels.find((one) => one.id === id)?.secrets ?? [])
    for (const [key, value] of Object.entries(change.secrets ?? {})) { if (value === null || value === '') { if (value === null) secrets.delete(key) } else secrets.add(key) }
    const enabled = channelSettings.find((one) => one.info.id === id)?.enabled === true
    const missing = ['botToken', 'appToken'].filter((key) => !secrets.has(key))
    channelView = { ...channelView, channels: channelView.channels.map((one) => one.id === id ? { ...one, secrets: [...secrets], state: !enabled ? 'off' : missing.length > 0 ? 'setup' : 'connected', says: !enabled ? undefined : missing.length > 0 ? `Fill in ${missing.map((key) => key === 'botToken' ? 'Bot token' : 'App token').join(', ')}.` : 'Listening in 3 channels' } as ChannelsView['channels'][number] : one) }
    return tellChannels()
  },
  remove: async (id: string) => { channelSettings = channelSettings.filter((one) => one.info.id !== id); channelView = { channels: channelView.channels.filter((one) => one.id !== id), failures: channelView.failures.filter((one) => one.id !== id) }; return tellChannels() },
  checkUpdates: async () => { await new Promise<void>((resolve) => setTimeout(resolve, 600)); return { updated: [], failed: [] } },
  on: (said: (view: ChannelsView) => void) => { channelListeners.add(said); return () => channelListeners.delete(said) },
} })

const { SettingsDialog } = await import('./ui/SettingsDialog')
const { PhoneVpnSettings } = await import('./ui/VpnIpSettings')
const { Cell, Page } = await import('./chat/PhoneKit')

function Preview(): React.JSX.Element {
  const [open, setOpen] = useState(true)
  const trigger = useRef<HTMLButtonElement>(null)
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS, theme, chromeBridge: !['off', 'kept', 'windows'].includes(chrome), vpnIpCheck: query.has('vpnEnabled'), vpnAllowedIps: query.has('vpnLong') ? Array.from({ length: 64 }, (_one, index) => `8.8.4.${String(index + 1)}`) : query.has('vpnSaved') ? ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'] : DEFAULT_SETTINGS.vpnAllowedIps, providerPlugins: libraries, chatProviders: query.has('libraries') ? ['claude', 'codex', 'plugin:codex-mirror', 'plugin:kimi', 'plugin:claude-tmux'] : DEFAULT_SETTINGS.chatProviders, providerUpdatesReady: query.has('libraries') ? ['plugin:kimi'] : [], channels: channelSettings, projects: ['/Users/alex/Projects/app', '/Users/alex/Projects/notula', '/Users/alex/Projects/private'] })
  useEffect(() => { channelSettingsChanged = (channels) => setSettings((current) => ({ ...current, channels })) }, [])
  const [failed, setFailed] = useState(failedLibraries)
  useEffect(() => {
    if (!open) trigger.current?.focus()
  }, [open])
  useEffect(() => {
    if (settings.theme === 'system') delete document.documentElement.dataset.theme
    else document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])
  useEffect(() => {
    Object.assign(window.geckit, { chat: {
      getProviderPluginFailures: async (): Promise<readonly ProviderPluginFailure[]> => failed,
      reinstallProvider: async (id: string): Promise<LlmProviderInfo> => {
        if (query.has('reinstallDelay')) await new Promise<void>((resolve) => setTimeout(resolve, 1500))
        if (query.has('reinstallFail')) throw new Error('Preview reinstall failed')
        const provider = failedLibraries.find((one) => one.id === id)
        if (provider === undefined) throw new Error('Library is not installed.')
        setFailed((current) => current.filter((one) => one.id !== id))
        setSettings((current) => ({ ...current, providerPlugins: [...current.providerPlugins.filter((one) => one.id !== id), claudeTmux] }))
        return claudeTmux
      },
      uninstallProvider: async (id: string): Promise<void> => {
        if (query.has('removeDelay')) await new Promise<void>((resolve) => setTimeout(resolve, 4000))
        if (query.has('removeMissingHandler')) throw new Error("Error invoking remote method 'chat:uninstallProvider': Error: No handler registered for 'chat:uninstallProvider'")
        if (query.has('removeFailLong')) throw new Error("Error invoking remote method 'chat:uninstallProvider': Error: Failed to move /Users/alex/Library/Application Support/geckit-local/provider-plugins/plugin-codex-mirror to Trash: permission denied. Check access to the provider-plugins folder and try again.")
        if (query.has('removeFail')) throw new Error('Preview remove failed')
        setSettings((current) => ({ ...current, providerPlugins: current.providerPlugins.filter((one) => one.id !== id), providerRemovalPending: true }))
        setFailed((current) => current.filter((one) => one.id !== id))
      },
      applyProviderUpdate: async (id: string): Promise<LlmProviderInfo> => {
        if (query.has('applyDelay')) await new Promise<void>((resolve) => setTimeout(resolve, 1500))
        if (query.has('applyFail')) throw new Error('Preview update failed')
        const provider = libraries.find((one) => one.id === id)
        if (provider === undefined) throw new Error('Library is not installed.')
        setSettings((current) => ({ ...current, providerUpdatesReady: current.providerUpdatesReady.filter((one) => one !== id) }))
        return provider
      },
    } })
  }, [failed])
  const change = (next: Partial<Settings>): void => setSettings((current) => ({ ...current, ...next }))
  const save = async (next: Partial<Settings>): Promise<Settings> => {
    if (query.has('vpnSaveDelay')) await new Promise<void>((resolve) => setTimeout(resolve, 1500))
    if (query.has('vpnSaveFail')) throw new Error('Could not save VPN IP check. Try again.')
    const updated = { ...settings, ...next }
    setSettings(updated)
    return updated
  }
  Object.assign(window.geckit, { settings: { set: save, pickApp: (): Promise<string | undefined> => Promise.resolve(undefined) } })
  if (query.has('phone')) return open ? <PhoneVpnSettings settings={settings} save={save} back="Settings" onBack={() => setOpen(false)} /> : <Page title="Settings"><div className="phone-group"><Cell label="VPN IP check" value={settings.vpnIpCheck ? 'On' : 'Off'} onPress={() => setOpen(true)} /></div></Page>
  return <>
    <header className="board-head"><h1>GeckIt</h1><button ref={trigger} type="button" className="quiet" onClick={() => setOpen(true)}>Settings</button></header>
    {open ? <SettingsDialog first={query.get('section') === 'vpn' ? 'vpn' : query.get('section') === 'general' ? 'general' : query.get('section') === 'assistants' ? 'assistants' : query.get('section') === 'integrations' ? 'integrations' : query.get('section') === 'channels' ? 'channels' : 'assistants'} settings={settings} change={change} onClose={() => setOpen(false)} onShortcuts={() => undefined} /> : null}
  </>
}

createRoot(document.getElementById('root')!).render(<Preview />)
