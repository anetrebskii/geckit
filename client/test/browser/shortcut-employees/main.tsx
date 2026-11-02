import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Geckit } from '../../../src/preload'
import { DEFAULT_SETTINGS } from '../../../src/shared/api'
import type { Shortcut, ShortcutDraft } from '../../../src/shared/api'
import type { Employee } from '../../../src/shared/employees'
import type { ShortcutChat } from '../../../src/renderer/src/chat/ShortcutList'
import '../../../src/renderer/src/styles.css'
import '../../../src/renderer/src/chat/phone-home.css'
import './fixture.css'

const params = new URLSearchParams(location.search)
const phone = params.get('phone') === '1'
const project = '/fixture/GeckIt'
const employees: Employee[] = [
  { id: 'engineer', name: 'Максим', role: 'Engineer', description: '', avatar: 'employee-03', archived: false, revision: 1 },
  { id: 'writer', name: 'Татьяна', role: 'Writer', description: '', avatar: 'employee-01', archived: false, revision: 1 },
  { id: 'archived', name: 'Андрей', role: 'Research', description: '', avatar: 'employee-02', archived: true, revision: 1 },
  { id: 'long', name: 'Alexandra A Very Long Employee Name That Must Remain Readable', role: 'Editor', description: '', avatar: 'employee-04', archived: false, revision: 1 },
]
const base: Pick<Shortcut, 'root' | 'mode' | 'on' | 'since' | 'provider'> = { root: project, mode: 'auto', on: true, since: Date.now(), provider: 'claude' }
let settings: ShortcutChat['settings'] = { ...DEFAULT_SETTINGS, projects: [project], chatProviders: ['claude'], calendarRecurrenceVersion: 1, cronStartWindowVersion: 1, shortcuts: [
  { ...base, id: 'review', name: 'Review pending pull requests', prompt: 'Review pending pull requests and report actionable findings.', employeeId: 'engineer' },
  { ...base, id: 'writing', name: 'Prepare product update', prompt: 'Write a product update using the approved feature list.', employeeId: 'writer' },
  { ...base, id: 'archived', name: 'Archived research timetable', prompt: 'Summarize the research queue.', employeeId: 'archived', cron: '0 9 * * 1-5' },
  { ...base, id: 'unknown', name: 'Missing employee assignment', prompt: 'Keep the saved assignment even when the employee catalog is unavailable.', employeeId: 'missing' },
  { ...base, id: 'unassigned', name: 'Unassigned manual shortcut', prompt: 'Check the current project.' },
  { ...base, id: 'long', name: 'A long shortcut title that should leave its actions reachable on narrow screens', prompt: 'A long prompt checks that the list keeps its existing density while the assigned employee name remains identifiable.', employeeId: 'long' },
  { ...base, id: 'unassigned-two', name: 'Daily project plan', prompt: 'Prepare the next work plan.', cron: '0 10 * * *' },
] }
const listeners = new Set<(next: ShortcutChat['settings']) => void>()
const fixture = { saves: [] as ShortcutDraft[], removed: [] as string[], runs: [] as string[], navigations: [] as string[], failSave: false }
Object.defineProperty(window, 'shortcutFixture', { value: fixture })
const publish = (): void => listeners.forEach((listener) => listener(settings))
const shortcuts: Geckit['shortcuts'] = {
  save: async (draft) => {
    fixture.saves.push(draft)
    if (fixture.failSave) { publish(); throw new Error('Fixture save failed') }
    const kept = settings.shortcuts.find((one) => one.id === draft.id)
    const saved: Shortcut = { ...draft, id: draft.id ?? `fixture-${fixture.saves.length}`, since: kept?.since ?? Date.now() }
    settings = { ...settings, shortcuts: kept === undefined ? [...settings.shortcuts, saved] : settings.shortcuts.map((one) => one.id === saved.id ? saved : one) }
    publish()
    return saved
  },
  remove: (id) => { fixture.removed.push(id); settings = { ...settings, shortcuts: settings.shortcuts.filter((one) => one.id !== id) }; publish() },
  run: async (id) => { fixture.runs.push(id); publish(); return undefined },
  onManage: () => () => undefined,
}
const chatNative: Pick<Geckit['chat'], 'models'> = { models: async () => [{ value: 'sonnet', name: 'Sonnet', isDefault: true }] }
const native: Pick<Geckit, 'platform' | 'shortcuts'> & { readonly chat: typeof chatNative } = { platform: 'darwin', shortcuts, chat: chatNative }
Object.defineProperty(window, 'geckit', { value: native })
document.documentElement.dataset['theme'] = params.get('theme') === 'dark' ? 'dark' : 'light'
document.documentElement.classList.add('framed')
if (phone) document.documentElement.classList.add('phone')

const { ShortcutList } = await import('../../../src/renderer/src/chat/ShortcutList')
const { PhoneShortcuts, ShortcutSheet } = await import('../../../src/renderer/src/chat/PhoneShortcuts')

function Fixture(): React.JSX.Element {
  const [current, setCurrent] = useState(settings)
  const [open, setOpen] = useState(true)
  const [editing, setEditing] = useState<ShortcutDraft>()
  const [, renderEvidence] = useState(0)
  useEffect(() => {
    const update = (next: ShortcutChat['settings']): void => { setCurrent(next); renderEvidence((revision) => revision + 1) }
    listeners.add(update)
    return () => { listeners.delete(update) }
  }, [])
  const chat: ShortcutChat = { settings: current, root: project, employees, everyone: [], goTo: (id) => { fixture.navigations.push(id) } }
  const preview = params.get('preview') === 'phone'
  const theme = document.documentElement.dataset['theme'] ?? 'light'
  const content = !open ? <button type="button" className="quiet" onClick={() => setOpen(true)}>Open Shortcuts</button> : phone ? <div className="phone-home"><PhoneShortcuts chat={chat} back="Settings" onBack={() => setOpen(false)} onEdit={setEditing} />{editing === undefined ? null : <ShortcutSheet key={editing.id ?? 'new'} chat={chat} given={editing} onClose={() => setEditing(undefined)} />}</div> : <ShortcutList chat={chat} start="list" onClose={() => setOpen(false)} />
  if (phone) return <>{content}<div className="shortcut-fixture-evidence" aria-live="polite">Saves: {fixture.saves.length}; runs: {fixture.runs.length}; last assignment: {fixture.saves.at(-1)?.employeeId ?? 'none'}</div></>
  return <>
    <nav className="shortcut-fixture-controls" aria-label="Fixture preview">
      <a href={`?theme=${theme}`}>Desktop</a>
      <a href={`?preview=phone&theme=${theme}`}>Phone 390px</a>
      <a href={`?${preview ? 'preview=phone&' : ''}theme=light`}>Light</a>
      <a href={`?${preview ? 'preview=phone&' : ''}theme=dark`}>Dark</a>
      <label><input type="checkbox" onChange={(event) => { fixture.failSave = event.target.checked }} />Fail save</label>
    </nav>
    {preview ? <iframe className="shortcut-fixture-phone" title="390px phone preview" src={`?phone=1&theme=${theme}`} /> : content}
    <details className="shortcut-fixture-evidence"><summary>Mock native evidence: {fixture.saves.length} saves, {fixture.runs.length} runs, {fixture.removed.length} removed</summary><pre>{JSON.stringify(fixture, null, 2)}</pre></details>
  </>
}

const root = document.getElementById('root')
if (root === null) throw new Error('Missing fixture root')
createRoot(root).render(<Fixture />)
