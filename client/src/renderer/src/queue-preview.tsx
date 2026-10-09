import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_SETTINGS } from '../../shared/api'
import type { ChatSession, QueuedMessage, SessionItem } from '../../shared/api'
import type { Chat } from './chat/useChat'
import './styles.css'
import './chat/phone-home.css'

const query = new URLSearchParams(location.search)
if (query.has('phone')) document.documentElement.classList.add('phone')
document.documentElement.dataset.theme = query.get('theme') === 'dark' ? 'dark' : 'light'
const noop = (): void => undefined
const at = Date.now()
Object.assign(window, { geckit: { platform: 'darwin', home: '/Users/alex', copy: noop, chat: { openLink: noop, queuedPicture: async () => undefined, mcp: async () => [], browsers: async () => [] } } })
const { Composer } = await import('./chat/Composer')
const { Transcript } = await import('./chat/Transcript')
const scenarios = ['ready', 'unsupported', 'idle', 'approval', 'pending', 'failure', 'many'] as const
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
    id: 'codex:preview', root: '/work/geckit', title: 'Send queued messages now', stands: 'Working - updating providers', state: scenario === 'idle' ? 'idle' : scenario === 'approval' ? 'asks' : 'working', at, here: true, mode,
    queued: shownQueue, ...(scenario === 'unsupported' || scenario === 'idle' || scenario === 'approval' ? {} : { canInject: true }), ...(injecting === undefined ? {} : { injecting }),
  }
  const chat: Chat = {
    settings: { ...DEFAULT_SETTINGS, phrases: [] }, hosts: [], prompts: [], lineup: { working: 1, limit: 6 }, full: false, change: noop,
    root: session.root, scope: session.root, sessions: [session], listed: true, everyone: [session], questions: [], waiting: [], notices: [], shown: { kind: 'session', id: session.id }, session,
    items, itemsFor: session.id, earlier: 0, showEarlier: noop, loadSteps: noop, draft, pictures: [], trouble, uploading: false,
    account: { provider: 'codex', here: true, signedIn: true, plan: 'Plus' }, plan: undefined, plans: [], plansAt: {}, models: [{ value: 'gpt-preview', name: 'Preview model' }],
    mode, transport: 'stream', provider: 'codex', showProviders: true, reasoning: '', setReasoning: noop, model, working: session.state !== 'idle', focusSeed: 0, chosen: [session.root],
    setScope: noop, alsoScope: noop, choose: noop, setRoot: noop, addProject: noop, forgetProject: noop, open: noop, show: noop, goTo: noop, dismiss: noop, startNew: noop,
    setDraft, addFiles: noop, dropPicture: noop, setMode, setModel, setProvider: noop, askModels: noop,
    send: () => { if (draft.trim() === '') return; setQueued((rows) => [...rows, { id: `queued:${String(Date.now())}`, text: draft, images: 0 }]); setDraft('') },
    ask: async () => undefined, startTask: async () => undefined, say: noop, answer: noop, stop: noop,
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
    delegate: noop, stopShell: noop, typeShell: noop, toBackground: noop, stopTask: noop, clearTask: noop, tasksShown: false, showTasks: noop, compacting: undefined, setCompacting: noop,
    rename: noop, mark: noop, hide: noop, keep: noop, remove: noop, terminal: noop, copyTerminal: async () => false, refresh: noop,
  }
  return <main style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
    <header className="provider-preview-controls" style={{ flexWrap: 'wrap' }}>
      <strong>Send queued messages now</strong>
      <label>State <select aria-label="State" value={scenario} onChange={(event) => { setScenario(scenarios.find((one) => one === event.target.value) ?? 'ready'); setQueued(initial); setItems(transcript); setTrouble('') }}>{scenarios.map((one) => <option key={one}>{one}</option>)}</select></label>
      <label>Theme <select aria-label="Theme" value={theme} onChange={(event) => { document.documentElement.dataset.theme = event.target.value; setTheme(event.target.value) }}><option>light</option><option>dark</option></select></label>
    </header>
    <div className="talk" style={{ flex: 1, minHeight: 0 }}>
      <header className="talk-head"><strong>{session.title}</strong><span className="place">geckit / client</span></header>
      <Transcript at={session.id} items={items} working={chat.working} onAnswer={noop} onAgain={noop} onFile={noop} onStopShell={noop} onTypeShell={noop} onBackground={noop} onContinue={noop} tasks={undefined} onTasks={noop} />
      <Composer chat={chat} />
      {trouble === '' ? null : <p role="alert" style={{ color: 'var(--danger)', padding: '0 20px' }}>{trouble}</p>}
    </div>
  </main>
}

createRoot(document.getElementById('root')!).render(<Preview />)
