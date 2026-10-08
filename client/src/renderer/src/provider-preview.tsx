import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_SETTINGS } from '../../shared/api'
import type { ClaudeModel, ModelsSaid, ProviderQuota } from '../../shared/api'
import type { LlmProviderInfo } from '../../shared/providers'
import { registerProviderInfo } from '../../shared/providers'
import type { ModelDetailsChat } from './chat/ModelDetails'
import type { Chat } from './chat/useChat'
import './styles.css'
import './chat/phone-home.css'

const query = new URLSearchParams(location.search)
const phone = query.has('phone')
if (phone) document.documentElement.classList.add('phone')
document.documentElement.dataset.theme = query.get('theme') === 'light' ? 'light' : 'dark'
Object.assign(window, { geckit: { platform: 'darwin', chat: { openLink: () => undefined } } })
const { ModelDetailsButton } = await import('./chat/ModelDetails')
const { Status } = await import('./chat/Status')
const { QuotaRows } = await import('./chat/ProviderUsage')
const provider: LlmProviderInfo = { id: 'plugin:codex-mirror', family: 'plugin:codex-mirror', name: 'Codex Mirror', shortName: 'Mirror', icon: 'mirror', iconPath: 'M8 1.8 14.2 8 8 14.2 1.8 8Z M8 4.6 11.4 8 8 11.4 4.6 8Z', browser: 'none', loginCommand: 'codex login', planName: 'ChatGPT' }
registerProviderInfo([provider])
const demo: ClaudeModel = { value: 'custom-model', id: 'custom-model-resolved-version-with-an-intentionally-long-identifier', name: 'Custom Codex model', says: 'Preview metadata for a provider with its own model catalog.', version: '5.4', contextWindow: 1_000_000, maxOutputTokens: 32_000, reasoning: [{ value: 'high', says: 'Thorough' }, { value: 'xhigh', says: 'Extra thorough' }], supportsAdaptiveThinking: true, supportsFastMode: false, supportsAutoMode: true, pricing: { currency: 'USD', input: 0, output: 2, cacheRead: 0.2, cacheWrite: 0.5, asOf: '2026-10-03', source: 'https://example.com/preview-prices' } }

function Preview(): React.JSX.Element {
  const [state, setState] = useState('complete')
  const [models, setModels] = useState<ModelsSaid>([demo])
  const [theme, setTheme] = useState(document.documentElement.dataset.theme)
  const [now] = useState(Date.now)
  const quotas: readonly ProviderQuota[] = state === 'many' ? Array.from({ length: 20 }, (_item, i) => ({ id: String(i), name: `Quota ${String(i + 1)} with a long descriptive name`, part: i / 20, resetsAt: now + 3600_000 })) : state === 'missing' ? [] : [{ id: 'hour', name: '5h', part: 0.42, resetsAt: now + 3600_000 }, { id: 'week', name: 'Week', part: 0.75 }, { id: 'requests', name: 'Daily requests', used: 25, limit: 100, unit: 'requests' }]
  const chat: ModelDetailsChat & Pick<Chat, 'chosen' | 'hosts' | 'plans' | 'plan' | 'plansAt' | 'trouble'> = {
    provider: provider.family, transport: 'stream', model: demo.value, models,
    root: '/work', session: undefined,
    settings: { ...DEFAULT_SETTINGS, providerPlugins: [provider] },
    account: { provider: provider.family, here: true, signedIn: true, plan: 'Pro', program: { version: '1.2.3' }, usage: { quotas, measuredAt: now } },
    chosen: [], hosts: [], plans: [], plan: undefined, plansAt: {}, trouble: '',
    askModels: () => {
      setModels('asking')
      if (state === 'loading') return
      window.setTimeout(() => setModels(state === 'unavailable' ? 'unsaid' : [{ ...demo, ...(state === 'missing' ? { pricing: undefined } : {}) }].map(({ pricing, ...model }) => pricing === undefined ? model : { ...model, pricing })), 600)
    },
  }
  return <main className="provider-preview">
    <header className="provider-preview-controls">
      <label>Theme <select aria-label="Theme" value={theme} onChange={(event) => { document.documentElement.dataset.theme = event.target.value; setTheme(event.target.value) }}><option value="dark">Dark</option><option value="light">Light</option></select></label>
      <label>State <select aria-label="State" value={state} onChange={(event) => { setState(event.target.value); setModels(event.target.value === 'unavailable' ? 'unsaid' : [demo]) }}><option value="complete">Complete</option><option value="missing">Missing prices and limits</option><option value="unavailable">Unavailable model</option><option value="loading">Loading</option><option value="many">Many quotas</option></select></label>
    </header>
    <section className="provider-preview-content"><h1>Provider information</h1><p>Actual GeckIt components. Values on this preview are fixtures.</p>{phone ? <div className="phone-group"><ModelDetailsButton chat={chat} phone /></div> : <ModelDetailsButton chat={chat} />}<QuotaRows usage={chat.account?.usage} now={now} /></section>
    {!phone ? <Status chat={chat} /> : null}
  </main>
}
createRoot(document.getElementById('root')!).render(<Preview />)
