import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import { DEFAULT_SETTINGS } from '../../shared/api'
import type { Settings } from '../../shared/api'
import type { LlmProviderInfo } from '../../shared/providers'
import { registerProviderInfo } from '../../shared/providers'
import './styles.css'

Object.assign(window, { geckit: { platform: 'darwin', home: '/Users/alex' } })
const query = new URLSearchParams(location.search)
const theme = query.get('theme') === 'light' ? 'light' : 'dark'
const libraries: readonly LlmProviderInfo[] = query.has('libraries') ? [
  { id: 'plugin:codex-mirror', family: 'plugin:codex-mirror', name: 'Codex Mirror', shortName: 'Mirror', icon: 'codex-mirror', iconPath: 'M8 1.8 14.2 8 8 14.2 1.8 8Z M8 4.6 11.4 8 8 11.4 4.6 8Z', browser: 'codex', loginCommand: 'codex login', planName: 'ChatGPT', runtime: 'codex', source: 'https://github.com/anetrebskii/geckit-codex-mirror' },
  { id: 'plugin:kimi', family: 'plugin:kimi', name: 'Kimi Code', shortName: 'Kimi', icon: 'terminal', browser: 'none', loginCommand: 'kimi login', planName: 'Kimi', source: 'https://github.com/example/geckit-kimi' },
  { id: 'claude-tmux', family: 'claude', transport: 'tmux', name: 'Claude Code (tmux)', shortName: 'Claude', icon: 'claude', browser: 'claude', loginCommand: 'claude auth login', planName: 'Claude', localOnly: true, source: 'https://github.com/example/geckit-claude-tmux' },
] : []
registerProviderInfo(libraries)
document.documentElement.dataset.theme = theme

const { SettingsDialog } = await import('./ui/SettingsDialog')

function Preview(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS, theme, providerPlugins: libraries, chatProviders: query.has('libraries') ? ['claude', 'codex', 'plugin:codex-mirror', 'plugin:kimi'] : DEFAULT_SETTINGS.chatProviders, providerUpdatesReady: query.has('libraries') ? ['plugin:kimi'] : [] })
  useEffect(() => {
    Object.assign(window.geckit, { chat: { uninstallProvider: async (id: string): Promise<void> => {
      if (query.has('removeDelay')) await new Promise<void>((resolve) => setTimeout(resolve, 4000))
      if (query.has('removeMissingHandler')) throw new Error("Error invoking remote method 'chat:uninstallProvider': Error: No handler registered for 'chat:uninstallProvider'")
      if (query.has('removeFailLong')) throw new Error("Error invoking remote method 'chat:uninstallProvider': Error: Failed to move /Users/alex/Library/Application Support/geckit-local/provider-plugins/plugin-codex-mirror to Trash: permission denied. Check access to the provider-plugins folder and try again.")
      if (query.has('removeFail')) throw new Error('Preview remove failed')
      setSettings((current) => ({ ...current, providerPlugins: current.providerPlugins.filter((one) => one.id !== id), providerRemovalPending: true }))
    } } })
  }, [])
  return <SettingsDialog first={query.get('section') === 'assistants' ? 'assistants' : 'libraries'} settings={settings} change={(change) => setSettings((current) => ({ ...current, ...change }))} onClose={() => undefined} onShortcuts={() => undefined} />
}

createRoot(document.getElementById('root')!).render(<Preview />)
