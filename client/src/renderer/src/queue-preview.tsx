import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_SETTINGS } from '../../shared/api'
import type { BackgroundTask, ChatSession, QueuedMessage, SessionItem } from '../../shared/api'
import type { Chat } from './chat/useChat'
import { registerProviderInfo } from '../../shared/providers'
import './styles.css'
import './chat/phone-home.css'

const query = new URLSearchParams(location.search)
if (query.has('phone')) document.documentElement.classList.add('phone')
document.documentElement.dataset.theme = query.get('theme') === 'dark' ? 'dark' : 'light'
registerProviderInfo([{ id: 'plugin:claude-tmux', family: 'plugin:claude-tmux', name: 'Claude Code (tmux)', shortName: 'Claude tmux', icon: 'tmux', browser: 'claude', loginCommand: 'claude auth login', planName: 'Claude', localOnly: true }])
const noop = (): void => undefined
const at = Date.now()
Object.assign(window, { geckit: { platform: 'darwin', home: '/Users/alex', copy: noop, chat: { openLink: noop, queuedPicture: async () => undefined, mcp: async () => [], browsers: async () => [], taskOutput: async () => ({ kind: 'helper', lines: [{ id: 'fixture', who: 'did', text: 'Fixture provider boundary: no browser or native helper is running.' }] }) } } })
const { cardSays } = await import('./chat/Tasks')
const { Composer } = await import('./chat/Composer')
const { Transcript } = await import('./chat/Transcript')
const scenarios = ['ready', 'unsupported', 'idle', 'approval', 'pending', 'failure', 'many', 'helpers'] as const
type Scenario = typeof scenarios[number]
const initial: readonly QueuedMessage[] = [
  { id: 'queued:first', text: 'Keep the existing behavior when the provider cannot deliver guidance.', images: 0 },
  { id: 'queued:second', text: 'Check the selected message and attached pictures before accepting delivery.', images: 0 },
  { id: 'queued:command', text: '/compact', images: 0, command: true },
]
const transcript: readonly SessionItem[] = [
  { kind: 'mine', id: 'original', text: 'Support sending a queued message into active work for Codex, Claude and provider libraries.' },
  { kind: 'theirs', id: 'reply', text: 'I am updating the provider interface and checking transport behavior. The selected message stays queued until delivery is accepted.' },
  { kind: 'theirs', id: 'progress', phase: 'commentary', text: 'Codex targets the current turn. Claude receives guidance after its current tool calls finish. Next I will check delivery failures and keyboard focus.' },
]

function Preview(): React.JSX.Element {
  const [scenario, setScenario] = useState<Scenario>(scenarios.find((one) => one === query.get('state')) ?? 'ready')
  const [tasksShown, showTasks] = useState(false)
  const [helperTasks, setHelperTasks] = useState<readonly BackgroundTask[]>([
    { id: 'a67f158ccf6363e51', kind: 'local_agent', what: 'Check browser layout', status: 'running', started: at - 60000, observedAt: at, activity: 'browser', activityTool: 'mcp__claude-in-chrome__navigate' },
    { id: 'a8baa7ee9d2255182', kind: 'local_agent', what: 'Check login', status: 'asks', started: at - 120000, observedAt: at, activity: 'tool', activityTool: 'AskUserQuestion' },
    { id: 'stale', kind: 'local_agent', what: 'Earlier computer check', status: 'unknown', started: at - 300000, observedAt: at - 180000, activity: 'computer', activityTool: 'computer' },
    ...Array.from({ length: 14 }, (_, index): BackgroundTask => ({ id: `finished-${String(index)}`, kind: 'local_agent', what: `Finished helper ${String(index + 1)}`, status: 'completed', started: at - 300000, ended: at - 60000 })),
  ])
  const [theme, setTheme] = useState(document.documentElement.dataset.theme)
  const [queued, setQueued] = useState(initial)
  const [items, setItems] = useState(transcript)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<string>()
  const [trouble, setTrouble] = useState('')
  const [mode, setMode] = useState<Chat['mode']>('auto')
  const [model, setModel] = useState('')
  const shownQueue = scenario === 'many' ? [...queued, ...Array.from({ length: 12 }, (_one, at) => ({ id: `queued:extra-${String(at)}`, text: `Queued guidance ${String(at + 4)}: preserve settings and wait for current work to finish.`, images: 0 }))] : queued
  const injecting = scenario === 'pending' ? 'queued:second' : pending
  const session: ChatSession = {
    id: scenario === 'helpers' ? 'plugin:claude-tmux:fixture-parent' : 'codex:preview', root: '/work/geckit', title: scenario === 'helpers' ? 'Parent: verify delegated browser work' : 'Send queued messages now', stands: scenario === 'helpers' ? 'Helper waiting for input or permission' : 'Working - updating providers', state: scenario === 'idle' ? 'idle' : scenario === 'approval' || scenario === 'helpers' ? 'asks' : 'working', at, here: true, mode,
    ...(scenario === 'helpers' ? { tasks: helperTasks, held: true as const, ...(query.has('stop-fixture') ? { canStopTasks: true as const } : {}) } : {}),
    queued: shownQueue, ...(scenario === 'unsupported' || scenario === 'idle' || scenario === 'approval' || scenario === 'helpers' ? {} : { canInject: true }), ...(injecting === undefined ? {} : { injecting }),
  }
  const chat: Chat = {
    employees: [], employeesById: new Map(),
    settings: { ...DEFAULT_SETTINGS, phrases: [] }, hosts: [], prompts: [], lineup: { working: 1, limit: 6 }, full: false, change: noop,
    root: session.root, scope: session.root, sessions: [session], listed: true, everyone: [session], questions: [], waiting: [], notices: [], shown: { kind: 'session', id: session.id }, session,
    items, itemsFor: session.id, earlier: 0, showEarlier: noop, loadSteps: noop, draft, pictures: [], trouble, checkingIp: false, retrying: false, retry: noop, uploading: false,
    account: { provider: 'codex', here: true, signedIn: true, plan: 'Plus' }, plan: undefined, plans: [], plansAt: {}, models: [{ value: 'gpt-preview', name: 'Preview model' }],
    mode, transport: 'stream', provider: scenario === 'helpers' ? 'plugin:claude-tmux' : 'codex', showProviders: true, reasoning: '', setReasoning: noop, model, working: session.state !== 'idle', focusSeed: 0, chosen: [session.root],
    setScope: noop, alsoScope: noop, choose: noop, setRoot: noop, addProject: noop, forgetProject: noop, open: noop, show: noop, goTo: noop, dismiss: noop, startNew: noop,
    setDraft, addFiles: noop, dropPicture: noop, setMode, setModel, setProvider: noop, askModels: noop,
    send: () => { if (draft.trim() === '') return; setQueued((rows) => [...rows, { id: `queued:${String(Date.now())}`, text: draft, images: 0 }]); setDraft('') },
    ask: async () => undefined, startTask: async () => undefined, planTask: async () => undefined, say: noop, answer: noop, stop: noop,
    unqueue: (id) => setQueued((rows) => rows.filter((row) => row.id !== id)),
    injectQueued: async (id) => {
      const selected = shownQueue.find((row) => row.id === id)
      if (selected === undefined) return
      setPending(id)
      await new Promise<void>((resolve) => setTimeout(resolve, 1400))
      if (scenario === 'failure') setTrouble('Delivery rejected. Your message is still queued.')
      else { setQueued((rows) => rows.filter((row) => row.id !== id)); setItems((rows) => [...rows, { kind: 'mine', id, text: selected.text }]); setTrouble('') }
      setPending(undefined)
    },
    requeue: (id, text) => setQueued((rows) => rows.map((row) => row.id === id ? { ...row, text } : row)),
    reorderQueued: (id, target, after) => setQueued((rows) => { const selected = rows.find((row) => row.id === id); if (selected === undefined) return rows; const next = rows.filter((row) => row.id !== id); next.splice(next.findIndex((row) => row.id === target) + (after ? 1 : 0), 0, selected); return next }),
    delegate: noop, stopShell: noop, typeShell: noop, toBackground: noop, stopTask: noop, clearTask: (id) => setHelperTasks((rows) => rows.filter((row) => row.id !== id)), tasksShown, showTasks, compacting: undefined, setCompacting: noop,
    rename: noop, mark: noop, hide: noop, keep: noop, remove: noop, terminal: noop, copyTerminal: async () => false, letGo: noop, refresh: noop,
  }
  return <main style={{ height: '100vh', minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
    <header className="provider-preview-controls" style={{ flexWrap: 'wrap', minWidth: 0 }}>
      <strong style={{ minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{scenario === 'helpers' ? 'Claude child activity · fixture provider boundary' : 'Send queued messages now'}</strong>
      <label>State <select aria-label="State" value={scenario} onChange={(event) => { setScenario(scenarios.find((one) => one === event.target.value) ?? 'ready'); setQueued(initial); setItems(transcript); setTrouble('') }}>{scenarios.map((one) => <option key={one}>{one}</option>)}</select></label>
      {query.has('stop-fixture') ? <><button type="button" onClick={() => setHelperTasks((tasks) => tasks.map((task, index) => index === 0 ? { ...task, status: 'stopped', ended: Date.now(), observedAt: Date.now() } : task))}>Confirm fixture stop</button><button type="button" onClick={() => setHelperTasks((tasks) => tasks.map((task, index) => { if (index !== 0) return task; const { ended: _ended, ...resumed } = task; return { ...resumed, status: 'running', observedAt: Date.now() } }))}>Resume fixture helper</button></> : null}
      <label>Theme <select aria-label="Theme" value={theme} onChange={(event) => { document.documentElement.dataset.theme = event.target.value; setTheme(event.target.value) }}><option>light</option><option>dark</option></select></label>
    </header>
    <div className="talk" style={{ flex: 1, minHeight: 0, minWidth: 0, width: '100%' }}>
      <header className="talk-head" style={{ flexWrap: 'wrap', minWidth: 0, height: 'auto', minHeight: 'var(--topbar)', paddingBlock: 8 }}><strong style={{ minWidth: 0, flexShrink: 1, whiteSpace: 'normal', overflowWrap: 'anywhere' }}>{session.title}</strong>{scenario === 'helpers' ? <span className={cardSays(session)?.tone} style={{ minWidth: 0, flexShrink: 1, whiteSpace: 'normal' }}>{cardSays(session)?.words}</span> : null}<span className="place">geckit / client</span></header>
      <Transcript at={session.id} items={items} working={chat.working} onAnswer={noop} onAgain={noop} onFile={noop} onStopShell={noop} onTypeShell={noop} onBackground={noop} onContinue={noop} onRetry={noop} tasks={undefined} onTasks={noop} />
      <Composer chat={chat} />
      {trouble === '' ? null : <p role="alert" style={{ color: 'var(--danger)', padding: '0 20px' }}>{trouble}</p>}
    </div>
  </main>
}

createRoot(document.getElementById('root')!).render(<Preview />)
