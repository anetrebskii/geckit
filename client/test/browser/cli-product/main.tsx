import { createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ManagerChat } from '../../../src/renderer/src/chat/ManagerChat'
import { DEFAULT_SETTINGS } from '../../../src/shared/api'
import { DEFAULT_MANAGER_CONFIG } from '../../../src/shared/manager'
import type { ManagerApi, ManagerView } from '../../../src/shared/manager'
import '../../../src/renderer/src/styles.css'
import '../shortcut-employees/fixture.css'
import './fixture.css'

const params = new URLSearchParams(location.search)
document.documentElement.dataset['theme'] = params.get('theme') === 'dark' ? 'dark' : 'light'
document.documentElement.classList.add('framed')
const initial: ManagerView = { config: { ...DEFAULT_MANAGER_CONFIG, enabled: true }, appChat: true, state: 'idle', session: { id: 'manager-fixture-session', root: '/fixture/project', title: 'Manager', stands: '', state: 'idle', at: 1, here: true, mode: 'manual', manager: true }, workers: [], activity: [], providers: [], queued: 0, decisions: [{ id: 'bound-operation', title: 'Change 93674216-d63c-4403-a3b6-544f1c4e1d81? Native permissions remain user-controlled. ["providers","disable","--provider","claude","--expected","[\\"claude\\",\\"codex\\",\\"plugin:mcode\\"]"]', choices: [{ label: 'Allow', value: 'allow' }, { label: 'Refuse', value: 'refuse' }] }] }
let answer: Parameters<ManagerApi['answer']>[0] | undefined
const manager: Pick<ManagerApi, 'answer' | 'onItems' | 'inspect'> = { answer: async (request) => { answer = request; return { ...initial, answer: 'Answer sent.' } }, onItems: () => () => undefined, inspect: async (id) => ({ id, items: [] }) }
Object.defineProperty(window, 'geckit', { value: { manager, platform: 'darwin' } })
function App(): React.JSX.Element {
  const [view, setView] = useState(initial)
  return <><nav className="shortcut-fixture-controls" aria-label="Fixture controls"><a href="?theme=light">Light</a><a href="?theme=dark">Dark</a><button type="button" onClick={() => { setView(initial); answer = undefined }}>Reset</button><button type="button" onClick={() => setView({ ...initial, state: 'paused' })}>Paused</button><button type="button" onClick={() => { const evidence = document.getElementById('evidence'); if (evidence) evidence.textContent = JSON.stringify(answer ?? null) }}>Read receipt</button></nav><main className="cli-product-screen"><header className="manager-inspection-header"><h2>GeckIt · Manager</h2></header><ManagerChat view={view} settings={DEFAULT_SETTINGS} /></main><output id="evidence" className="shortcut-fixture-evidence" /></>
}
const root = document.getElementById('root')
if (root === null) throw new Error('Missing fixture root')
createRoot(root).render(createElement(App))
