import { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_SETTINGS } from '../../shared/api'
import type { ChatSession, SessionItem } from '../../shared/api'
import { elicitationAccessKey, elicitationAnswer, elicitationForm, elicitationSummary } from '../../shared/elicitation'
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
const scenarios = ['startup-mcp', 'question', 'native-question', 'long-question', 'long-history', 'confirmation', 'empty-default', 'fields', 'url', 'unsupported', 'long', 'many-fields', 'multiple', 'answered', 'resolved', 'stopped'] as const
type Scenario = typeof scenarios[number]
const schema: Json = { type: 'object', required: ['approved'], properties: { approved: { type: 'boolean', title: 'Allow access', description: 'Permit computer use for this app.' }, scope: { type: 'string', title: 'Access scope', enum: ['view', 'control'], enumNames: ['View only', 'View and control'], default: 'view' }, count: { type: 'integer', title: 'Windows', minimum: 1, maximum: 5, default: 1 }, note: { type: 'string', title: 'Note', maxLength: 120 }, actions: { type: 'array', title: 'Allowed actions', items: { type: 'string', enum: ['Read the window', 'Click controls', 'Type text'] }, minItems: 1, maxItems: 2 } } }
const basic = [{ kind: 'mine', id: 'first', text: 'Review the GeckIt Local interface.' }, { kind: 'theirs', id: 'reply', text: 'I will inspect the rendered app and check its layout, focus and scrolling.' }] satisfies SessionItem[]
const question: Extract<SessionItem, { kind: 'card' }> = { kind: 'card', id: 'card:question-preview', card: { kind: 'question', title: 'The four spec timing checks (SC-001, SC-002, SC-004, SC-006) need a real browser with 18 calls and the CPU slowed 4x. How should I take them?', choices: ['Timing measurements first', 'Electron commands first'] } }
const nativeLabels = ['Live tests on preview', 'Electron command fencing', 'Open the PR', 'Stop for now', 'Type something']
const formSchema = (scenario: Scenario): Json => scenario === 'empty-default' ? { type: 'object', required: ['note'], properties: { note: { type: 'string', title: 'Note', default: '' } } } : scenario === 'unsupported' ? { type: 'object', properties: { private: { type: 'string', hidden: true } } } : scenario === 'fields' || scenario === 'multiple' ? schema : scenario === 'many-fields' ? { type: 'object', properties: Object.fromEntries(Array.from({ length: 18 }, (_one, index) => [`field-${String(index)}`, { type: 'string', title: `Review note ${String(index + 1)}`, maxLength: 120 }])) } : { type: 'object', properties: {} }
const accessKey = (request: Elicitation, scenario: Scenario): string | undefined => elicitationAccessKey(request, scenario === 'url' ? 'url' : 'form', formSchema(scenario), null)
const makeRequest = (scenario: Scenario): Elicitation => {
  const request: Elicitation = { serverName: 'cua_repl', message: scenario === 'long' ? ['Allow Codex to access and control GeckIt Local for UI review?', ...Array.from({ length: 8 }, () => 'The review includes the full window, nearby controls, keyboard focus and scrolling. Your choice applies to this request.')].join('\n\n') : scenario === 'url' ? 'Complete account authorization at this address, then choose Accept.' : 'Allow Computer Use to use "Mail"?', ...(scenario === 'url' ? { fields: [], url: 'https://example.com/authorize?request=geckit-ui-review' } : elicitationForm(formSchema(scenario))) }
  return { ...request, ...(accessKey(request, scenario) === undefined ? {} : { rememberAllowed: true }) }
}
const card = (id: string, request: Elicitation): SessionItem => ({ kind: 'card', id, card: { kind: 'elicitation', title: request.message, where: `Requested by ${request.serverName}`, elicitation: request } })

function Preview(): React.JSX.Element {
  const [scenario, setScenario] = useState<Scenario>(scenarios.find((one) => one === query.get('state')) ?? 'confirmation')
  const [theme, setTheme] = useState(document.documentElement.dataset.theme)
  const [native, setNative] = useState({ revision: 0, checked: nativeLabels.map((_label, index) => scenario === 'startup-mcp' && index < 2), review: false })
  const [nativeAnswered, setNativeAnswered] = useState<string>()
  const [answers, setAnswers] = useState<Json[]>([])
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<Chat['mode']>('auto')
  const [model, setModel] = useState('')
  const remembered = useRef(new Set<string>())
  const [repeats, setRepeats] = useState<SessionItem[]>([])
  const [extra, setExtra] = useState<SessionItem[]>([])
  const pending = !['answered', 'resolved', 'stopped'].includes(scenario)
  const nativeScenario = scenario === 'native-question' || scenario === 'long-question' || scenario === 'startup-mcp'
  const working = scenario === 'long-history' || nativeScenario
  const nativeQuestion: Extract<SessionItem, { kind: 'card' }> = { kind: 'card', id: `card:native-${String(native.revision)}`, card: { kind: 'question', title: scenario === 'startup-mcp' ? '2 new MCP servers found in this project\nSelect any you wish to enable.\n\nMCP servers may execute code or access system resources. All tool calls require approval. Learn more in the MCP documentation.' : native.review ? 'Review your answers' : scenario === 'long-question' ? Array.from({ length: 8 }, () => 'The remaining spec items need a decision before the goal can close. Which should I take on now?').join(' ') : "The goal can't close until the remaining spec 017 items are handled, and each one needs a decision from you. Which should I take on now?", choices: scenario === 'startup-mcp' ? [...['linear-formula', 'notion-formula'].map((label, index) => `[${native.checked[index] === true ? '✔' : ' '}] ${label}`), 'Enable selected', 'Reject all'] : native.review ? ['Submit answers', 'Cancel'] : [...nativeLabels.map((label, index) => `[${native.checked[index] === true ? '✓' : ' '}] ${label}`), 'Submit', 'Chat about this'], ...(nativeAnswered === undefined ? {} : { answered: nativeAnswered }) } }
  const request = makeRequest(scenario)
  const history: SessionItem[] = working ? Array.from({ length: 140 }, (_value, index) => ({ kind: 'theirs', id: `history-${String(index)}`, text: index === 139 ? 'Two bigger pieces would each be a sizeable job:\n\n- **Timing measurements:** SC-001, SC-002, SC-004 and SC-006 need traces from a real browser with 18 calls and the CPU slowed 4x.\n- **Commands between Electron windows:** test the real Electron app with two windows open.' : `Progress update ${String(index + 1)}: reviewed another part of the optimization work.` })) : []
  const initial: SessionItem[] = [...basic, ...(nativeScenario ? [nativeQuestion] : scenario === 'question' || scenario === 'long-history' ? [question] : pending ? [card('card:mcp-preview', request), ...(scenario === 'multiple' ? [card('card:mcp-second', { ...makeRequest('confirmation'), serverName: 'browser', message: 'Allow browsing the local preview?', rememberAllowed: false })] : [])] : scenario === 'answered' ? [{ kind: 'card', id: 'card:mcp-preview', card: { kind: 'elicitation', title: request.message, answered: `Accepted: ${request.message}` } } satisfies SessionItem] : [{ kind: 'note', id: 'resolved', note: 'stopped', text: scenario === 'stopped' ? 'Stopped' : 'The request was resolved elsewhere.' } satisfies SessionItem]), ...history]
  const items: readonly SessionItem[] = [...initial, ...repeats].map((item) => extra.find((one) => one.id === item.id) ?? item)
  const answer = (id: string, value: string): void => {
    const found = items.find((one) => one.id === id)
    if (found?.kind !== 'card') return
    if (found.card.kind === 'question') {
      if (nativeScenario) {
        setAnswers((before) => [...before, value])
        if (scenario === 'startup-mcp') {
          const index = nativeQuestion.card.choices?.indexOf(value) ?? -1
          if (index >= 0 && index < 2) setNative((before) => ({ ...before, revision: before.revision + 1, checked: before.checked.map((checked, at) => at === index ? !checked : checked) }))
          else if (value === 'Enable selected' || value === 'Reject all') setNativeAnswered(value)
          return
        }
        if (native.review) {
          if (value === 'Cancel') setNative((before) => ({ ...before, review: false, revision: before.revision + 1 }))
          else setNativeAnswered(value)
          return
        }
        const index = nativeQuestion.card.choices?.indexOf(value) ?? -1
        if (index >= 0 && index < nativeLabels.length) setNative((before) => ({ ...before, revision: before.revision + 1, checked: before.checked.map((checked, at) => at === index ? !checked : checked) }))
        else if (value === 'Submit') setNative((before) => ({ ...before, review: true, revision: before.revision + 1 }))
        else setNativeAnswered(value)
        return
      }
      setAnswers((before) => [...before, value])
      setExtra((before) => [...before, { ...found, card: { ...found.card, answered: value } }])
      return
    }
    if (found.card.elicitation === undefined) return
    const response = elicitationAnswer(value, found.card.elicitation)
    if (response === undefined) return
    const key = accessKey(found.card.elicitation, scenario)
    if (response.remember === true && key !== undefined) remembered.current.add(key)
    setAnswers((before) => [...before, { action: response.action, content: response.content, _meta: response._meta }])
    setExtra((before) => [...before, { ...found, card: { ...found.card, answered: `${elicitationSummary(value)}: ${found.card.title}` } }])
  }
  const repeat = (): void => {
    const key = accessKey(request, scenario)
    if (key !== undefined && remembered.current.has(key)) {
      setAnswers((before) => [...before, { action: 'accept', content: {}, _meta: null }])
      return
    }
    setRepeats((before) => [...before, card(`card:mcp-repeat-${String(before.length)}`, request)])
  }
  const reset = (next: Scenario): void => {
    remembered.current.clear()
    setScenario(next)
    setNative({ revision: 0, checked: nativeLabels.map((_label, index) => next === 'startup-mcp' && index < 2), review: false })
    setNativeAnswered(undefined)
    setExtra([])
    setRepeats([])
    setAnswers([])
  }
  const asks = items.some((item) => item.kind === 'card' && item.card.answered === undefined)
  const session: ChatSession = { id: 'codex:preview', root: '/Users/alex/Projects/mine/geckit', title: 'Review GeckIt Local', stands: asks ? 'Needs your approval' : 'Ready', state: asks ? 'asks' : 'idle', at, here: true, mode, model: 'gpt-preview' }
  const chat: Chat = {
    settings: { ...DEFAULT_SETTINGS, phrases: [], chatView: 'list' }, hosts: [], prompts: [], lineup: { working: 0, limit: 6 }, full: false, change: noop,
    root: session.root, scope: session.root, sessions: [session], listed: true, everyone: [session], questions: [], waiting: asks ? [session] : [], notices: [], shown: { kind: 'session', id: session.id }, session,
    items, itemsFor: session.id, earlier: 0, showEarlier: noop, loadSteps: noop, draft, pictures: [], trouble: '', checkingIp: false, retrying: false, retry: noop, uploading: false,
    account: { provider: 'codex', here: true, signedIn: true, plan: 'Plus' }, plan: undefined, plans: [], plansAt: {}, models: [{ value: 'gpt-preview', name: 'Preview model' }],
    mode, transport: 'stream', provider: 'codex', showProviders: true, reasoning: '', setReasoning: noop, model, working, focusSeed: 0, chosen: [session.root],
    setScope: noop, alsoScope: noop, choose: noop, setRoot: noop, addProject: noop, forgetProject: noop, open: noop, show: noop, goTo: noop, dismiss: noop, startNew: noop,
    setDraft, addFiles: noop, dropPicture: noop, setMode, setModel, setProvider: noop, askModels: noop,
    send: noop, ask: async () => undefined, startTask: async () => undefined, planTask: async () => undefined, say: noop, answer: (id, value) => answer(id, value), stop: () => reset('stopped'),
    unqueue: noop, injectQueued: async () => undefined, requeue: noop, reorderQueued: noop, delegate: noop, stopShell: noop, typeShell: noop, toBackground: noop, stopTask: noop, clearTask: noop,
    tasksShown: false, showTasks: noop, compacting: undefined, setCompacting: noop, rename: noop, mark: noop, hide: noop, keep: noop, remove: noop, terminal: noop, copyTerminal: async () => false, letGo: noop, refresh: noop,
  }
  const order = useRef<readonly ChatSession[]>([])
  return <main style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
    <header className="provider-preview-controls" style={{ flexWrap: 'wrap' }}>
      <strong>MCP approvals preview</strong>
      <label>State <select aria-label="State" value={scenario} onChange={(event) => reset(scenarios.find((one) => one === event.target.value) ?? 'confirmation')}>{scenarios.map((one) => <option key={one}>{one}</option>)}</select></label>
      <label>Theme <select aria-label="Theme" value={theme} onChange={(event) => { document.documentElement.dataset.theme = event.target.value; setTheme(event.target.value) }}><option>light</option><option>dark</option></select></label>
      <button type="button" className="quiet" disabled={!pending} onClick={repeat}>Repeat request</button>
      <output aria-label="Responses submitted">{answers.length} responses submitted</output>
      <output aria-label="Last response">{typeof answers.at(-1) === 'string' ? String(answers.at(-1)) : ''}</output>
    </header>
    <div className="chat" style={{ flex: 1, minHeight: 0, ...(phone ? { gridTemplateColumns: '1fr' } : {}) }}>
      {phone ? null : <Sidebar chat={chat} orderRef={order} onShortcutFrom={noop} />}
      <div className={`talk${asks ? ' asks' : ''}`}>
        <header className="talk-head"><strong className="title">{session.title}</strong><span className="place">geckit</span></header>
        <Transcript key={scenario} at={session.id} items={items} working={working} onAnswer={answer} onAgain={noop} onFile={noop} onStopShell={noop} onTypeShell={noop} onBackground={noop} onContinue={noop} onRetry={noop} tasks={undefined} onTasks={noop} />
        <Composer chat={chat} />
        {phone ? null : <TalkStatus chat={chat} onClear={noop} />}
      </div>
    </div>
  </main>
}

createRoot(document.getElementById('root')!).render(<Preview />)
