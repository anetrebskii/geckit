import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_SETTINGS } from '../../shared/api'
import type { ChatSession, SessionImage, SessionItem } from '../../shared/api'
import { VPN_IP_UNAVAILABLE_ERROR, vpnIpMismatchError, vpnIpPausedError } from '../../shared/vpn-ip'
import type { Geckit } from '../../preload'
import type { Chat } from './chat/useChat'
import './styles.css'
import './chat/phone-home.css'

const query = new URLSearchParams(location.search)
const phone = query.has('phone')
if (phone) document.documentElement.classList.add('phone')
document.documentElement.dataset.theme = query.get('theme') === 'dark' ? 'dark' : 'light'
const noop = (): void => undefined
const at = Date.now()
const bridge: Pick<Geckit, 'platform' | 'home' | 'copy'> & { readonly chat: Pick<Geckit['chat'], 'openLink' | 'queuedPicture' | 'picture' | 'mcp' | 'browsers' | 'git' | 'onGit' | 'files' | 'read'> } = {
  platform: 'darwin', home: '/Users/alex', copy: noop,
  chat: { openLink: noop, queuedPicture: async () => undefined, picture: async () => undefined, mcp: async () => [], browsers: async () => [], git: async () => undefined, onGit: () => noop, files: async () => [], read: noop },
}
Object.assign(window, { geckit: bridge })
const { Composer } = await import('./chat/Composer')
const { Transcript } = await import('./chat/Transcript')
const { Sidebar } = await import('./chat/Sidebar')
const { TalkStatus } = await import('./chat/Status')
const scenarios = ['hook-blocked', 'blocked', 'unavailable', 'cancelled', 'paused', 'retry-pending', 'queued-retry', 'checking', 'provider-error', 'stopped', 'success', 'long'] as const
type Scenario = typeof scenarios[number]
const attachment: SessionImage = { media: 'image/svg+xml', data: btoa('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="slategray"/><text x="14" y="44" fill="white">Draft picture</text></svg>') }
const original: readonly SessionItem[] = [
  { kind: 'mine', id: 'first', text: 'Add VPN public IP checking and keep pending messages safe.' },
  { kind: 'theirs', id: 'response', text: 'I have prepared the setting and will check the public IP before the next message is sent.' },
]
const blocked: readonly SessionItem[] = [
  ...original,
  { kind: 'mine', id: 'held', text: 'Run the checks and finish the implementation.', unsent: true },
  { kind: 'note', id: 'vpn-ip-error', note: 'failed', text: vpnIpMismatchError('9.9.9.9') },
]
const pausedQueue: NonNullable<ChatSession['queued']> = [{ id: 'queued:later', text: 'Run integration checks after active work finishes.', images: 0 }]
const acceptedRetryQueue: NonNullable<ChatSession['queued']> = [{ id: 'queued:retry', text: 'Run the checks and finish the implementation.', images: 0, again: 'held' }]
const acceptedRetryItems: readonly SessionItem[] = [...original, { kind: 'mine', id: 'held', text: 'Run the checks and finish the implementation.', unsent: true }, { kind: 'mine', id: 'other-unsent', text: 'Check keyboard focus in the settings page.', unsent: true }]
const queueFor = (scenario: Scenario): ChatSession['queued'] => scenario === 'queued-retry' ? acceptedRetryQueue : scenario === 'paused' || scenario === 'retry-pending' ? pausedQueue : undefined

function Preview(): React.JSX.Element {
  const [scenario, setScenario] = useState<Scenario>(scenarios.find((one) => one === query.get('state')) ?? 'blocked')
  const [queued, setQueued] = useState<ChatSession['queued']>(queueFor(scenario))
  const [retrying, setRetrying] = useState(scenario === 'retry-pending')
  const [theme, setTheme] = useState(document.documentElement.dataset.theme)
  const [draft, setDraft] = useState('Keep this unrelated draft while retrying.')
  const [pictures, setPictures] = useState<Chat['pictures']>([attachment])
  const [mode, setMode] = useState<Chat['mode']>('auto')
  const [model, setModel] = useState('')
  const [focusSeed, setFocusSeed] = useState(0)
  const [continuing, setContinuing] = useState(false)
  const generation = useRef(0)
  const checkingIp = scenario === 'checking'
  const heldSend = scenario === 'hook-blocked' || scenario === 'blocked' || scenario === 'long' || scenario === 'unavailable' || scenario === 'cancelled' || scenario === 'paused' || scenario === 'retry-pending'
  const heldItems: readonly SessionItem[] = scenario === 'hook-blocked' ? [...original, { kind: 'mine', id: 'held', text: 'Run the checks and finish the implementation.', unsent: true }, { kind: 'note', id: 'hook-block', note: 'failed', text: 'Blocked by hook.', detail: 'UserPromptSubmit operation blocked by hook:\n[vpn-guard]: curl: (28) Failed to connect to api.ipify.org port 443 after 3002 ms: Timeout was reached\nVPN Guard: public IP lookup failed; request blocked.\n\nThis hook comes from the vpn-guard plugin.' }] : scenario === 'paused' || scenario === 'retry-pending' ? [...original, { kind: 'note', id: 'vpn-ip-error', note: 'failed', text: vpnIpPausedError(vpnIpMismatchError('9.9.9.9')) }] : scenario === 'unavailable' || scenario === 'cancelled' ? blocked.map((item) => item.id === 'vpn-ip-error' && item.kind === 'note' ? { ...item, text: scenario === 'unavailable' ? VPN_IP_UNAVAILABLE_ERROR : 'Not sent: public IP check cancelled. Try again when you are ready.' } : item) : blocked
  const items: Chat['items'] = scenario === 'queued-retry' ? acceptedRetryItems : scenario === 'long' ? [...Array.from({ length: 18 }, (_one, index): SessionItem => ({ kind: 'theirs', id: `earlier-${String(index)}`, text: `Earlier update ${String(index + 1)}: pending work stays in this conversation until an approved connection is available.` })), ...blocked] : heldSend ? heldItems : scenario === 'provider-error' ? [...original, { kind: 'note', id: 'provider-error', note: 'failed', text: 'The provider connection failed. Try again to continue this conversation.' }] : scenario === 'stopped' ? [...original, { kind: 'note', id: 'stopped', note: 'stopped', text: 'Stopped' }] : scenario === 'success' ? [...original, { kind: 'mine', id: 'held', text: continuing ? 'continue' : 'Run the checks and finish the implementation.' }, { kind: 'theirs', id: 'complete', text: 'The approved public IP was verified. I completed the checks and kept your pending draft unchanged.' }] : original
  const session: ChatSession = {
    id: 'codex:preview', root: '/Users/alex/Projects/mine/geckit', title: query.get('state') === 'hook-blocked' ? 'Hook block and recovery' : 'VPN IP check and recovery', stands: scenario === 'hook-blocked' ? 'Blocked by hook' : scenario === 'queued-retry' ? 'Working - retry queued' : checkingIp ? 'Checking public IP' : heldSend || scenario === 'provider-error' ? 'Blocked - waiting for retry' : 'Ready', state: scenario === 'queued-retry' ? 'working' : heldSend || scenario === 'provider-error' ? 'failed' : 'idle', at, here: true, mode,
    ...(checkingIp ? { checkingIp: true } : {}), ...(heldSend ? { heldSend: true } : {}), model: 'gpt-preview',
    ...(queued === undefined ? {} : { queued }),
  }
  const retry = (): void => {
    if (checkingIp || retrying) return
    const token = ++generation.current
    setContinuing(scenario === 'paused' || scenario === 'provider-error' || scenario === 'stopped')
    setRetrying(true)
    setTimeout(() => {
      if (generation.current !== token) return
      setScenario('checking')
      setTimeout(() => {
        if (generation.current !== token) return
        setScenario('success')
        setRetrying(false)
        setFocusSeed((seed) => seed + 1)
      }, 2500)
    }, 1500)
  }
  const chat: Chat = {
    settings: { ...DEFAULT_SETTINGS, phrases: [], chatView: 'list', vpnIpCheck: true, vpnAllowedIps: ['8.8.8.8'] }, hosts: [], prompts: [], lineup: { working: scenario === 'queued-retry' ? 1 : 0, limit: 6 }, full: false, change: noop,
    root: session.root, scope: session.root, sessions: [session], listed: true, everyone: [session], questions: [], waiting: [], notices: [], shown: { kind: 'session', id: session.id }, session,
    items, itemsFor: session.id, earlier: 0, showEarlier: noop, loadSteps: noop, draft, pictures, trouble: '', checkingIp, retrying, retry, uploading: false,
    account: { provider: 'codex', here: true, signedIn: true, plan: 'Plus' }, plan: undefined, plans: [], plansAt: {}, models: [{ value: 'gpt-preview', name: 'Preview model' }],
    mode, transport: 'stream', provider: 'codex', showProviders: true, reasoning: '', setReasoning: noop, model, working: session.state === 'working', focusSeed, chosen: [session.root],
    setScope: noop, alsoScope: noop, choose: noop, setRoot: noop, addProject: noop, forgetProject: noop, open: noop, show: noop, goTo: noop, dismiss: noop, startNew: noop,
    setDraft, addFiles: noop, dropPicture: (index) => setPictures((held) => held.filter((_one, at) => at !== index)), setMode, setModel, setProvider: noop, askModels: noop,
    send: noop, ask: async () => undefined, startTask: async () => undefined, planTask: async () => undefined, say: noop, answer: noop, stop: () => { generation.current++; setRetrying(false); setScenario('cancelled') },
    unqueue: (id) => setQueued((held) => held?.filter((one) => one.id !== id)), injectQueued: async () => undefined, requeue: noop, reorderQueued: noop, delegate: noop, stopShell: noop, typeShell: noop, toBackground: noop, stopTask: noop, clearTask: noop,
    tasksShown: false, showTasks: noop, compacting: undefined, setCompacting: noop, rename: noop, mark: noop, hide: noop, keep: noop, remove: noop, terminal: noop, copyTerminal: async () => false, letGo: noop, refresh: noop,
  }
  const order = useRef<readonly ChatSession[]>([])
  return <main style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
    <header className="provider-preview-controls" style={{ flexWrap: 'wrap' }}>
      <strong>VPN recovery preview</strong>
      <label>State <select aria-label="State" value={scenario} onChange={(event) => { generation.current++; const next = scenarios.find((one) => one === event.target.value) ?? 'blocked'; setScenario(next); setRetrying(next === 'retry-pending'); setQueued(queueFor(next)) }}>{scenarios.map((one) => <option key={one}>{one}</option>)}</select></label>
      <label>Theme <select aria-label="Theme" value={theme} onChange={(event) => { document.documentElement.dataset.theme = event.target.value; setTheme(event.target.value) }}><option>light</option><option>dark</option></select></label>
    </header>
    <div className="chat" style={{ flex: 1, minHeight: 0, ...(phone ? { gridTemplateColumns: '1fr' } : {}) }}>
      {phone ? null : <Sidebar chat={chat} orderRef={order} onShortcutFrom={noop} />}
      <div className="talk">
        <header className="talk-head"><strong className="title">{session.title}</strong><span className="place">geckit</span></header>
        <Transcript at={session.id} items={items} working={chat.working} onAnswer={noop} onAgain={scenario === 'queued-retry' ? noop : retry} onFile={noop} onStopShell={noop} onTypeShell={noop} onBackground={noop} onContinue={retry} onRetry={retry} checkingIp={checkingIp} retrying={retrying} queued={queued} heldSend={heldSend} tasks={undefined} onTasks={noop} />
        <Composer chat={chat} />
        {phone ? null : <TalkStatus chat={chat} onClear={noop} />}
      </div>
    </div>
  </main>
}

createRoot(document.getElementById('root')!).render(<Preview />)
