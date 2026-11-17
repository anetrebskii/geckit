import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_SETTINGS } from '../../shared/api'
import type { Settings } from '../../shared/api'
import type { Chat } from './chat/useChat'
import './styles.css'
import './chat/phone-home.css'

const query = new URLSearchParams(location.search)
const phone = query.has('phone')
if (phone) document.documentElement.classList.add('phone')
document.documentElement.dataset.theme = query.get('theme') === 'light' ? 'light' : 'dark'
const noop = (): void => undefined
const started: string[] = []
Object.assign(window, { geckit: { platform: 'darwin', home: '/Users/alex', pathFor: () => '', voice: { form: noop, record: noop, dictate: noop }, chat: { openLink: noop, models: async () => [{ value: 'opus', name: 'Opus', isDefault: true }], onScreenshot: () => noop, onRecorded: () => noop, onTask: () => noop, upload: async () => ({ problem: 'none' }) } } })
if (query.has('fresh')) { localStorage.removeItem('newTask') }
const { NewTask } = await import('./chat/Board')
const { SettingsDialog } = await import('./ui/SettingsDialog')

const CHECKLISTS: Settings['checklists'] = query.has('none') ? [] : [
  { id: 'c1', name: 'Feature flow', root: '/Users/alex/Projects/app', isDefault: !query.has('nodefault'), items: [
    { id: 'i1', title: 'UX doc approved', description: 'docs/ux has the change and Alex said yes', check: 'person' },
    { id: 'i2', title: 'Tests pass', check: 'command', command: 'npm test' },
    { id: 'i3', title: 'Lint clean', check: 'command', command: 'npm run lint', final: true },
    { id: 'i4', title: 'UI checked in light and dark', check: 'review' },
    { id: 'i5', title: 'Pushed to main', check: 'none' },
  ] },
  { id: 'c2', name: 'Bug fix', items: [
    { id: 'j1', title: 'Cause found and reproduced', check: 'review' },
    { id: 'j2', title: 'Regression test fails before the fix and passes after', check: 'command', command: 'npm test' },
  ] },
]

function Preview(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS, projects: ['/Users/alex/Projects/app', '/Users/alex/Projects/notula'], newTaskRoot: query.get('root') ?? '/Users/alex/Projects/app', chatProviders: ['claude'], chatProvider: 'claude', checklists: CHECKLISTS })
  const [open, setOpen] = useState(true)
  const [section, setSection] = useState(false)
  const [last, setLast] = useState('')
  const change = (next: Partial<Settings>): void => setSettings((was) => ({ ...was, ...next }))
  const base = {
    settings, change, employees: [], employeesById: new Map(), hosts: [], lineup: { working: 1, limit: 6 }, full: false, root: '/Users/alex/Projects/app', showProviders: false, chosen: ['/Users/alex/Projects/app'],
    startTask: async (_root: string, _said: string, goal: string) => { started.push(goal); setLast(goal) },
    planTask: async (_root: string, _said: string, goal: string) => { setLast(goal) },
    ask: async () => undefined,
  }
  const chat = new Proxy(base, { get: (target, key) => (key in target ? target[key as keyof typeof target] : noop) }) as unknown as Chat
  return (
    <main style={{ position: 'relative', height: '100vh', background: 'var(--bg)' }}>
      {open ? <><div className="talk-scrim form-scrim" /><NewTask chat={chat} onClose={() => setOpen(false)} onStarting={noop} onChecklists={() => setSection(true)} /></> : (
        <div style={{ padding: 24, color: 'var(--text)', font: '13px var(--font-ui)' }}>
          <p>Goal sent:</p><pre data-goal style={{ whiteSpace: 'pre-wrap' }}>{last}</pre>
          <button type="button" className="quiet" onClick={() => setOpen(true)}>Open New task</button>
        </div>
      )}
      {section ? <SettingsDialog first="checklists" settings={settings} change={change} onClose={() => setSection(false)} onShortcuts={noop} /> : null}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<Preview />)
