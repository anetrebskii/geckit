import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_SETTINGS } from '../../shared/api'
import type { ChatSession, SessionItem } from '../../shared/api'
import { elicitationAnswer, elicitationForm, elicitationSummary } from '../../shared/elicitation'
import type { Elicitation, Json } from '../../shared/elicitation'
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
const scenarios = ['confirmation', 'empty-default', 'fields', 'url', 'unsupported', 'long', 'many-fields', 'multiple', 'answered', 'resolved', 'stopped'] as const
type Scenario = typeof scenarios[number]
const schema: Json = { type: 'object', required: ['approved'], properties: { approved: { type: 'boolean', title: 'Allow access', description: 'Permit computer use for this app.' }, scope: { type: 'string', title: 'Access scope', enum: ['view', 'control'], enumNames: ['View only', 'View and control'], default: 'view' }, count: { type: 'integer', title: 'Windows', minimum: 1, maximum: 5, default: 1 }, note: { type: 'string', title: 'Note', maxLength: 120 }, actions: { type: 'array', title: 'Allowed actions', items: { type: 'string', enum: ['Read the window', 'Click controls', 'Type text'] }, minItems: 1, maxItems: 2 } } }
const basic = [{ kind: 'mine', id: 'first', text: 'Review the GeckIt Local interface.' }, { kind: 'theirs', id: 'reply', text: 'I will inspect the rendered app and check its layout, focus and scrolling.' }] satisfies SessionItem[]
const makeRequest = (scenario: Scenario): Elicitation => ({ serverName: 'computer-use', message: scenario === 'long' ? ['Allow Codex to access and control GeckIt Local for UI review?', ...Array.from({ length: 8 }, () => 'The review includes the full window, nearby controls, keyboard focus and scrolling. Your choice applies to this request.')].join('\n\n') : scenario === 'url' ? 'Complete account authorization at this address, then choose Accept.' : 'Allow Codex to access and control GeckIt Local for UI review?', ...(scenario === 'url' ? { fields: [], url: 'https://example.com/authorize?request=geckit-ui-review' } : scenario === 'empty-default' ? elicitationForm({ type: 'object', required: ['note'], properties: { note: { type: 'string', title: 'Note', default: '' } } }) : scenario === 'unsupported' ? elicitationForm({ type: 'object', properties: { private: { type: 'string', hidden: true } } }) : scenario === 'fields' || scenario === 'multiple' ? elicitationForm(schema) : scenario === 'many-fields' ? elicitationForm({ type: 'object', properties: Object.fromEntries(Array.from({ length: 18 }, (_one, index) => [`field-${String(index)}`, { type: 'string', title: `Review note ${String(index + 1)}`, maxLength: 120 }])) }) : elicitationForm({ type: 'object', properties: {} })) })
const card = (id: string, request: Elicitation): SessionItem => ({ kind: 'card', id, card: { kind: 'elicitation', title: request.message, where: `Requested by ${request.serverName}`, elicitation: request } })

function Preview(): React.JSX.Element {
  const [scenario, setScenario] = useState<Scenario>(scenarios.find((one) => one === query.get('state')) ?? 'confirmation')
  const [theme, setTheme] = useState(document.documentElement.dataset.theme)
  const [answers, setAnswers] = useState<Json[]>([])
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<Chat['mode']>('auto')
  const [model, setModel] = useState('')
  const [extra, setExtra] = useState<SessionItem[]>([])
  const pending = !['answered', 'resolved', 'stopped'].includes(scenario)
  const request = makeRequest(scenario)
  const initial: SessionItem[] = [...basic, ...(pending ? [card('card:mcp-preview', request), ...(scenario === 'multiple' ? [card('card:mcp-second', { ...makeRequest('confirmation'), serverName: 'browser', message: 'Allow browsing the local preview?' })] : [])] : scenario === 'answered' ? [{ kind: 'card', id: 'card:mcp-preview', card: { kind: 'elicitation', title: request.message, answered: `Accepted: ${request.message}` } } satisfies SessionItem] : [{ kind: 'note', id: 'resolved', note: 'stopped', text: scenario === 'stopped' ? 'Stopped' : 'The request was resolved elsewhere.' } satisfies SessionItem])]
  const items: readonly SessionItem[] = initial.map((item) => extra.find((one) => one.id === item.id) ?? item)
  const answer = (id: string, value: string): void => {
    const found = items.find((one) => one.id === id)
    if (found?.kind !== 'card' || found.card.elicitation === undefined) return
    const response = elicitationAnswer(value, found.card.elicitation)
    if (response === undefined) return
    setAnswers((before) => [...before, { ...response }])
    setExtra((before) => [...before, { ...found, card: { ...found.card, answered: `${elicitationSummary(value)}: ${found.card.title}` } }])
  }
  const asks = items.some((item) => item.kind === 'card' && item.card.answered === undefined)
  const session: ChatSession = { id: 'codex:preview', root: '/Users/alex/Projects/mine/geckit', title: 'Review GeckIt Local', stands: asks ? 'Needs your approval' : 'Ready', state: asks ? 'asks' : 'idle', at, here: true, mode, model: 'gpt-preview' }
  const chat: Chat = {
    settings: { ...DEFAULT_SETTINGS, phrases: [], chatView: 'list' }, hosts: [], prompts: [], lineup: { working: 0, limit: 6 }, full: false, change: noop,
    root: session.root, scope: session.root, sessions: [session], listed: true, everyone: [session], questions: [], waiting: asks ? [session] : [], notices: [], shown: { kind: 'session', id: session.id }, session,
    items, itemsFor: session.id, earlier: 0, showEarlier: noop, loadSteps: noop, draft, pictures: [], trouble: '', checkingIp: false, retrying: false, retry: noop, uploading: false,
    account: { provider: 'codex', here: true, signedIn: true, plan: 'Plus' }, plan: undefined, plans: [], plansAt: {}, models: [{ value: 'gpt-preview', name: 'Preview model' }],
    mode, transport: 'stream', provider: 'codex', showProviders: true, reasoning: '', setReasoning: noop, model, working: false, focusSeed: 0, chosen: [session.root],
    setScope: noop, alsoScope: noop, choose: noop, setRoot: noop, addProject: noop, forgetProject: noop, open: noop, show: noop, goTo: noop, dismiss: noop, startNew: noop,
    setDraft, addFiles: noop, dropPicture: noop, setMode, setModel, setProvider: noop, askModels: noop,
    send: noop, ask: async () => undefined, startTask: async () => undefined, say: noop, answer: (id, value) => answer(id, value), stop: () => setScenario('stopped'),
    unqueue: noop, injectQueued: async () => undefined, requeue: noop, reorderQueued: noop, delegate: noop, stopShell: noop, typeShell: noop, toBackground: noop, stopTask: noop, clearTask: noop,
    tasksShown: false, showTasks: noop, compacting: undefined, setCompacting: noop, rename: noop, mark: noop, hide: noop, keep: noop, remove: noop, terminal: noop, copyTerminal: async () => false, letGo: noop, refresh: noop,
  }
  const order = useRef<readonly ChatSession[]>([])
  return <main style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
    <header className="provider-preview-controls" style={{ flexWrap: 'wrap' }}>
      <strong>MCP approvals preview</strong>
      <label>State <select aria-label="State" value={scenario} onChange={(event) => { setScenario(scenarios.find((one) => one === event.target.value) ?? 'confirmation'); setExtra([]); setAnswers([]) }}>{scenarios.map((one) => <option key={one}>{one}</option>)}</select></label>
      <label>Theme <select aria-label="Theme" value={theme} onChange={(event) => { document.documentElement.dataset.theme = event.target.value; setTheme(event.target.value) }}><option>light</option><option>dark</option></select></label>
      <output aria-label="Responses submitted">{answers.length} responses submitted</output>
    </header>
    <div className="chat" style={{ flex: 1, minHeight: 0, ...(phone ? { gridTemplateColumns: '1fr' } : {}) }}>
      {phone ? null : <Sidebar chat={chat} orderRef={order} onShortcutFrom={noop} />}
      <div className={`talk${asks ? ' asks' : ''}`}>
        <header className="talk-head"><strong className="title">{session.title}</strong><span className="place">geckit</span></header>
        <Transcript key={scenario} at={session.id} items={items} working={false} onAnswer={answer} onAgain={noop} onFile={noop} onStopShell={noop} onTypeShell={noop} onBackground={noop} onContinue={noop} onRetry={noop} tasks={undefined} onTasks={noop} />
        <Composer chat={chat} />
        {phone ? null : <TalkStatus chat={chat} onClear={noop} />}
      </div>
    </div>
  </main>
}

createRoot(document.getElementById('root')!).render(<Preview />)
