import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_SETTINGS } from '../../shared/api'
import type { ChatSession, SessionItem } from '../../shared/api'
import type { TaskChecklist } from '../../shared/checklists'
import { checklistMet, nextCondition } from '../../shared/checklists'
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
const { shownChecklist, TaskChecklistEditor } = await import('./chat/TaskChecklist')

const START: TaskChecklist = { from: { id: 'c1', name: 'Feature flow' }, items: [
  { id: 'i1', title: 'UX doc approved', description: 'docs/ux has the change and Alex said yes', check: 'person', state: 'passed' },
  { id: 'i2', title: 'Tests pass', check: 'command', command: 'npm test', state: query.has('approval') ? 'passed' : undefined },
  { id: 'i3', title: 'Lint clean', check: 'command', command: 'npm run lint', final: true },
  { id: 'i4', title: 'UI checked in light and dark', check: 'person', state: query.has('approval') ? 'approval' : undefined },
  { id: 'i5', title: 'Pushed to main', check: 'none' },
] }
const transcript: readonly SessionItem[] = [
  { kind: 'mine', id: 'original', text: 'Add checklists to tasks.\n\nChecklist (Feature flow), worked one item at a time: GeckIt sets each item as the goal in turn and ticks it when the goal is met.\n1. UX doc approved\n2. Tests pass\n3. Lint clean\n4. UI checked in light and dark\n5. Pushed to main' },
  { kind: 'theirs', id: 'reply', text: 'Working on the tests now.' },
]

function Preview(): React.JSX.Element {
  const [checklist, setChecklist] = useState<TaskChecklist | undefined>(query.has('plain') ? undefined : START)
  const [goal, setGoal] = useState<string | undefined>(query.has('plain') ? 'The settings page loads' : nextCondition(START))
  const [items] = useState(transcript)
  const [draft, setDraft] = useState('')
  const [log, setLog] = useState<readonly string[]>([])
  const [shown, setShown] = useState(!query.has('shut'))
  const phone = query.has('phone')
  const meet = (): void => {
    if (checklist === undefined || goal === undefined) return
    const ticked = checklistMet(checklist, goal) ?? checklist
    const next = nextCondition(ticked)
    setChecklist(ticked)
    setGoal(next)
    setLog((was) => [...was, `met: ${goal}`, ...(next === undefined ? [] : [`/goal ${next}`])])
  }
  const session: ChatSession = {
    id: 'claude:preview', root: '/work/geckit', title: 'Task checklists', stands: 'Working', state: 'working', at, here: true, mode: 'auto',
    ...(goal === undefined ? {} : { goal: { condition: goal, checks: 0 } }), ...(checklist === undefined ? {} : { checklist }),
  }
  const chat = {
    employees: [], employeesById: new Map(),
    settings: { ...DEFAULT_SETTINGS, phrases: [] }, hosts: [], prompts: [], lineup: { working: 1, limit: 6 }, full: false, change: noop,
    root: session.root, scope: session.root, sessions: [session], listed: true, listLoading: false, listProblem: undefined, listStatus: [], everyone: [session], questions: [], waiting: [], notices: [], shown: { kind: 'session', id: session.id }, session,
    items, itemsFor: session.id, earlier: 0, showEarlier: noop, loadSteps: noop, draft, pictures: [], trouble: '', checkingIp: false, retrying: false, retry: noop, uploading: false,
    account: { provider: 'claude', here: true, signedIn: true, plan: 'Max' }, plan: undefined, plans: [], plansAt: {}, models: [{ value: 'opus', name: 'Opus' }],
    mode: 'auto', transport: 'stream', provider: 'claude', showProviders: true, reasoning: '', setReasoning: noop, model: '', working: true, focusSeed: 0, chosen: [session.root],
    setDraft,
    say: (text: string) => setLog((was) => [...was, text]),
    setChecklist: (_id: string, next: TaskChecklist, typing = false) => {
      const kept = next.items.length === 0 ? undefined : next
      setChecklist(kept)
      const now = kept === undefined ? undefined : nextCondition(kept)
      if (!typing && now !== goal) { setGoal(now); if (now !== undefined) setLog((was) => [...was, `/goal ${now}`]) }
      setLog((was) => [...was, `saved ${String(next.items.length)} items${typing ? ' while typing' : ''}`])
    },
  }
  const fake = new Proxy(chat, { get: (target, key) => (key in target ? target[key as keyof typeof target] : key === 'tasksShown' ? false : noop) }) as unknown as Chat
  return <main style={{ height: '100vh', minWidth: 0, width: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
    <header className="provider-preview-controls" style={{ flexWrap: 'wrap', minWidth: 0 }}>
      <strong>Task checklist in chat</strong>
      <button type="button" data-meet onClick={meet}>Goal met</button>
      <span data-log style={{ fontSize: 11, color: 'var(--text-dim)' }}>{log.at(-1) ?? ''}</span>
    </header>
    <div className="talk" style={{ flex: 1, minHeight: 0, minWidth: 0, width: '100%' }}>
      <header className="talk-head"><strong>{session.title}</strong><span className="place">geckit / client</span></header>
      <div className="talk-main">
        <div className="talk-column"><Transcript at={session.id} items={items} working onAnswer={noop} onAgain={noop} onFile={noop} onStopShell={noop} onTypeShell={noop} onBackground={noop} onContinue={noop} onRetry={noop} tasks={undefined} onTasks={noop} find={query.has('find') ? 0 : undefined} onFindClose={noop} /></div>
        {shown && !phone ? <TaskChecklistEditor key={session.id} panel goal={session.goal?.condition} checklist={shownChecklist(session.checklist, session.goal?.condition, session.goalMet)} onSave={(next, typing) => fake.setChecklist(session.id, next, typing)} onClear={() => fake.setChecklist(session.id, { items: [] })} onClose={() => setShown(false)} /> : null}
      </div>
      <Composer chat={fake} onChecklist={phone ? undefined : () => setShown(!shown)} checklistShown={shown} />
    </div>
  </main>
}

createRoot(document.getElementById('root')!).render(<Preview />)
