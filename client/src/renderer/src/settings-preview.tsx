import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { DEFAULT_SETTINGS } from '../../shared/api'
import type { Settings } from '../../shared/api'
import type { LlmProviderInfo, ProviderPluginFailure } from '../../shared/providers'
import { registerProviderInfo } from '../../shared/providers'
import './styles.css'

Object.assign(window, { geckit: { platform: 'darwin', home: '/Users/alex' } })
const query = new URLSearchParams(location.search)
const theme = query.get('theme') === 'light' ? 'light' : 'dark'
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
Object.assign(window.geckit, { chat: { getProviderPluginFailures: async (): Promise<readonly ProviderPluginFailure[]> => failedLibraries } })

const { SettingsDialog } = await import('./ui/SettingsDialog')

function Preview(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS, theme, providerPlugins: libraries, chatProviders: query.has('libraries') ? ['claude', 'codex', 'plugin:codex-mirror', 'plugin:kimi', 'plugin:claude-tmux'] : DEFAULT_SETTINGS.chatProviders, providerUpdatesReady: query.has('libraries') ? ['plugin:kimi'] : [] })
  const [failed, setFailed] = useState(failedLibraries)
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
  return <SettingsDialog first={query.get('section') === 'assistants' ? 'assistants' : 'libraries'} settings={settings} change={(change) => setSettings((current) => ({ ...current, ...change }))} onClose={() => undefined} onShortcuts={() => undefined} />
}

createRoot(document.getElementById('root')!).render(<Preview />)
