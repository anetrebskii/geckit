import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_SETTINGS } from '../../shared/api'
import type { ClaudeAccount, ProviderQuota, SessionProvider } from '../../shared/api'
import type { LlmProviderInfo } from '../../shared/providers'
import { registerProviderInfo } from '../../shared/providers'
import { AssistantStatus } from './chat/AssistantStatus'
import type { AssistantStatusChat } from './chat/AssistantStatus'
import { Icon } from './ui/Icon'
import './styles.css'

const query = new URLSearchParams(location.search)
const phone = query.has('phone')
const libraries: readonly LlmProviderInfo[] = [
  { id: 'plugin:claude-tmux', family: 'plugin:claude-tmux', name: 'Claude Code (tmux)', shortName: 'Claude tmux', icon: 'tmux', browser: 'claude', loginCommand: 'claude auth login', planName: 'Claude', localOnly: true, instructions: 'claude' },
  { id: 'plugin:kimi', family: 'plugin:kimi', name: 'Kimi Code with an exceptionally long library name', shortName: 'Kimi Code', icon: 'terminal', browser: 'none', loginCommand: 'kimi login', planName: 'Kimi' },
]
registerProviderInfo(libraries)
const providers: readonly SessionProvider[] = ['claude', 'codex', 'plugin:claude-tmux', 'plugin:kimi']
const scenarios = ['ready', 'checking', 'unavailable', 'signed-out', 'no-quotas', 'single-quotas', 'many-quotas', 'multi-hosts', 'local-plan'] as const
type Scenario = typeof scenarios[number]
let scenario: Scenario = scenarios.find((one) => one === query.get('state')) ?? 'ready'
const measuredAt = Date.now()
const quotas: readonly ProviderQuota[] = [{ id: 'five-hour', name: '5h', part: 0.24, resetsAt: measuredAt + 3_600_000 }, { id: 'week', name: 'Week', part: 0.63, resetsAt: measuredAt + 86_400_000 }]
const listeners = new Set<(account: ClaudeAccount) => void>()
function fixture(provider: SessionProvider, state: Scenario): ClaudeAccount | undefined {
  if (state === 'unavailable') return undefined
  const providerQuotas: readonly ProviderQuota[] = state === 'no-quotas' ? [] : state === 'many-quotas' ? Array.from({ length: 20 }, (_, index) => ({ id: String(index), name: `Model ${String(index + 1)} monthly token allowance`, used: index * 10000, limit: 200000, unit: 'tokens', resetsAt: measuredAt + 86_400_000 })) : provider === 'codex' ? quotas.map((one) => ({ ...one, part: one.id === 'five-hour' ? 0.78 : 0.91 })) : provider === 'plugin:kimi' ? [{ id: 'requests', name: 'Day', used: 34, limit: 100, unit: 'requests' }] : quotas
  const shownQuotas = state === 'single-quotas' ? providerQuotas.filter((_quota, index) => index === (provider === 'codex' ? 1 : 0)) : providerQuotas
  return { provider, here: true, signedIn: state !== 'signed-out', plan: provider === 'codex' ? 'Plus' : provider === 'plugin:kimi' ? 'Standard' : provider === 'plugin:claude-tmux' ? 'Max' : 'Team', program: { version: provider === 'codex' ? '0.114.0' : '2.1.294', from: 'the native installer' }, usage: { quotas: shownQuotas, measuredAt } }
}
Object.assign(window, { geckit: { platform: 'darwin', home: '/Users/alex', chat: {
  account: (provider: SessionProvider): Promise<ClaudeAccount | undefined> => {
    const requested = scenario
    return new Promise((resolve) => setTimeout(() => resolve(fixture(provider, requested)), requested === 'checking' ? 20000 : 80))
  },
  onAccount: (listener: (account: ClaudeAccount) => void): (() => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
} } })
if (phone) document.documentElement.classList.add('phone')
document.documentElement.dataset.theme = query.get('theme') === 'dark' ? 'dark' : 'light'

function Preview(): React.JSX.Element {
  const [state, setState] = useState(scenario)
  const [enabled, setEnabled] = useState(true)
  const [theme, setTheme] = useState(document.documentElement.dataset.theme)
  const chat: AssistantStatusChat = {
    provider: 'claude', settings: { ...DEFAULT_SETTINGS, providerPlugins: libraries, chatProviders: enabled ? providers : ['claude', 'codex'] },
    hosts: state === 'multi-hosts' ? [{ id: 'workstation', name: 'Workstation', address: 'workstation', user: 'alex', port: 22, auth: 'key', state: 'up', plan: 'Team', version: '2.1.294', remembered: false, canRemember: false }, { id: 'devbox', name: 'Devbox (disconnected)', address: 'devbox', user: 'alex', port: 22, auth: 'key', state: 'lost', plan: 'Max', version: '2.1.290', remembered: false, canRemember: false }] : [],
    plans: state === 'multi-hosts' ? [{ place: '', account: 'team' }, { place: 'workstation', account: 'team' }, { place: 'devbox', account: 'personal', usage: { fiveHour: { part: 0.46, resetsAt: measuredAt + 3_600_000 }, sevenDay: { part: 0.85, resetsAt: measuredAt + 86_400_000 } } }] : [],
    plan: state === 'local-plan' ? { fiveHour: { part: 0.17, resetsAt: measuredAt + 3_600_000 }, sevenDay: { part: 0.41, resetsAt: measuredAt + 86_400_000 } } : undefined, plansAt: state === 'multi-hosts' ? { devbox: measuredAt - 45 * 60_000 } : {},
  }
  return <main className={`assistant-preview${phone ? ' phone-preview' : ''}`}>
    <div className="assistant-preview-controls"><label>Fixture <select aria-label="Fixture state" value={state} onChange={(event) => { scenario = scenarios.find((one) => one === event.target.value) ?? 'ready'; setState(scenario) }}>{scenarios.map((one) => <option key={one}>{one}</option>)}</select></label><button type="button" onClick={() => { const next = theme === 'light' ? 'dark' : 'light'; document.documentElement.dataset.theme = next; setTheme(next) }}>{theme}</button><button type="button" onClick={() => setEnabled(!enabled)}>{enabled ? 'Disable libraries' : 'Enable libraries'}</button></div>
    {phone ? <div className="phone-home"><header className="assistant-preview-heading"><h1>Tasks</h1><Icon name="plus" size={20} /></header><div className="assistant-preview-phone-list"><h2>In progress <span>2</span></h2><Task title="Assistant status for desktop and mobile" project="geckit / client" time="6:41 PM" /><Task title="Codex config.toml duplicate key" project="geckit / client" time="3:15 PM" /><h2>In review <span>3</span></h2><Task title="Improve assistant library settings" project="geckit / client" time="3:11 PM" /><Task title="Review mobile navigation" project="geckit / client" time="Yesterday" /><h2>Done <span>4</span></h2><Task title="Where is my code with libraries and AI providers?" project="geckit / client" time="Yesterday" /></div><AssistantStatus key={state} chat={chat} phone /><nav className="phone-tabs" aria-label="Main navigation"><button className="on"><Icon name="board" size={20} />Tasks</button><button><Icon name="folder" size={20} />Projects</button><button><Icon name="search" size={20} />Search</button><button><Icon name="settings" size={20} />Settings</button></nav></div> : <><header className="assistant-preview-heading"><h1>Tasks</h1><button className="quiet">New task</button></header><div className="assistant-preview-board board-columns">{['In progress', 'In review', 'Done'].map((column, index) => <section className="board-column" key={column}><div className="board-column-head"><h2>{column}</h2><span>{index === 1 ? '2' : '3'}</span></div><div className="board-cards"><Task title={index === 1 ? 'Assistant status for desktop and mobile' : 'Codex config.toml duplicate key'} project="geckit / client" time="6:41 PM" /><Task title={index === 2 ? 'Where is my code with libraries and AI providers?' : 'Improve assistant library settings'} project="geckit / client" time="3:15 PM" /></div></section>)}</div><AssistantStatus key={state} chat={chat} /></>}
  </main>
}
function Task({ title, project, time }: { readonly title: string; readonly project: string; readonly time: string }): React.JSX.Element {
  return <article className="board-card"><div className="board-card-head"><span className="board-card-title">{title}</span><span>{time}</span></div><div className="board-card-foot">{project}</div><p className="assistant-preview-task-note">Review changes and continue working.</p></article>
}
createRoot(document.getElementById('root')!).render(<Preview />)
