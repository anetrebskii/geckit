import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Geckit } from '../../../src/preload'
import { DEFAULT_SETTINGS } from '../../../src/shared/api'
import type { Settings } from '../../../src/shared/api'
import type { SecretMetadata, SecretUse } from '../../../src/shared/secrets'
import '../../../src/renderer/src/styles.css'

const params = new URLSearchParams(location.search)
const now = Date.now()
const initial: SecretMetadata[] = [
  { name: 'openai-key', kind: 'http', places: ['api.openai.com'], lifetime: '1h', expiresAt: now + 42 * 60_000, taskId: 'c1', cleaned: true, createdAt: now - 18 * 60_000, lastUsedAt: now - 2 * 60_000 },
  { name: 'github-login', kind: 'website', places: ['https://github.com'], field: 'password', lifetime: 'keep', cleaned: true, createdAt: now - 3 * 86_400_000, lastUsedAt: now - 26 * 3_600_000 },
  { name: 'prod-db', kind: 'command', places: ['psql'], lifetime: 'task', taskId: 'c2', cleaned: true, createdAt: now - 5 * 60_000 },
  { name: 'stage-pin', kind: 'http', places: ['*.stripe.com', 'api.stripe-staging.example.internal'], lifetime: 'once', cleaned: false, createdAt: now - 60_000 },
  { name: 'deploy-key', kind: 'ssh', places: ['github.com'], lifetime: '1d', expiresAt: now + 20 * 3_600_000, cleaned: true, createdAt: now - 4 * 3_600_000 },
]
let secrets = params.get('empty') === '1' ? [] : initial
const uses: SecretUse[] = [
  { at: now - 2 * 60_000, name: 'openai-key', taskId: 'time2you: cover images', kind: 'http', place: 'api.openai.com', result: 'used' },
  { at: now - 9 * 60_000, name: 'openai-key', taskId: 'time2you: cover images', kind: 'http', place: 'evil.example', result: 'refused: not one of its hosts' },
]
const status = params.get('state') === 'down' ? { problem: 'the secrets broker is not reachable: connect ENOENT' } : params.get('state') === 'locked' ? { store: 'keychain', locked: true } : { store: 'keychain', locked: false }
const api: Geckit['secrets'] = {
  list: async () => secrets,
  history: async (name) => uses.filter((one) => one.name === name),
  revoke: async (name) => { const before = secrets.length; secrets = secrets.filter((one) => one.name !== name); return before - secrets.length },
  status: async () => status,
}
Object.defineProperty(window, 'geckit', { value: { platform: 'darwin', home: '/Users/fixture', secrets: api }, configurable: true })
document.documentElement.dataset['theme'] = params.get('theme') === 'dark' ? 'dark' : 'light'
const { SettingsDialog } = await import('../../../src/renderer/src/ui/SettingsDialog')

function App(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  return <SettingsDialog settings={settings} first="secrets" change={(change) => setSettings((current) => ({ ...current, ...change }))} onClose={() => undefined} onShortcuts={() => undefined} />
}
const root = document.getElementById('root')
if (root === null) throw new Error('Missing fixture root')
createRoot(root).render(<App />)
