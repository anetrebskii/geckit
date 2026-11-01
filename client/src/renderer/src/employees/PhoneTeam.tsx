import { useEffect, useRef, useState } from 'react'
import type { ChatSession, Shortcut, ShortcutDraft } from '../../../shared/api'
import type { Employee, EmployeeDraft } from '../../../shared/employees'
import { projectColor } from '../../../shared/project-color'
import { saveShortcut } from '../../../shared/shortcut-save'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { Cell, FullSheet, Page, Switch } from '../chat/PhoneKit'
import { projectLabel } from '../chat/project'
import type { Chat } from '../chat/useChat'
import { EMPLOYEE_AVATARS } from './avatars'
import { newEmployeeDraft, savedEmployeeId } from './draft'
import { EmployeeAvatar, EmployeeConversations, EmployeeTasks, TaskSummary, useTasksByEmployee } from './Employees'
import { shortcutDraft, shortcutRunning, shortcutWhen } from './shortcuts'
import { TeamConfirm } from './Team'
import { useEmployees } from './useEmployees'
import { managerStand } from '../chat/manager-label'
import { PhoneManager, managerFace, usePhoneManager } from './TeamManager'

type PhoneTeamChat = Pick<Chat, 'everyone' | 'settings' | 'goTo' | 'change'>
type Shown = Employee['id'] | 'none' | 'manager' | undefined

const draftOf = (employee: Employee): EmployeeDraft => ({ id: employee.id, revision: employee.revision, name: employee.name, role: employee.role, description: employee.description, avatar: employee.avatar })
const scheduled = (one: Shortcut): boolean => one.cron !== undefined || one.recurrence !== undefined
const open = (one: ChatSession): boolean => one.status !== 'done' && one.status !== 'archived'

export function PhoneTeam({ chat, back, first, onBack, onEdit }: {
  readonly chat: PhoneTeamChat
  readonly back: string
  readonly first?: Shown
  readonly onBack: () => void
  readonly onEdit: (draft: ShortcutDraft) => void
}): React.JSX.Element {
  const { view, take, loading, loadError, reload } = useEmployees()
  const manager = usePhoneManager()
  const tasksFor = useTasksByEmployee(chat.everyone)
  const [shown, setShown] = useState<Shown>(first)
  const [editing, setEditing] = useState<EmployeeDraft>()
  const [search, setSearch] = useState('')
  const [archived, setArchived] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const owned = new Set(view.employees.map((one) => one.id))
  const orphans = chat.settings.shortcuts.filter((one) => one.employeeId === undefined || !owned.has(one.employeeId))
  const found = view.employees.filter((one) => (archived || !one.archived) && `${one.name} ${one.role}`.toLowerCase().includes(search.trim().toLowerCase()))
  const current = shown === undefined || shown === 'none' || shown === 'manager' ? undefined : view.employees.find((one) => one.id === shown)
  const known = useRef<readonly Employee[]>([])
  const make = (): void => { known.current = view.employees; setEditing(newEmployeeDraft(EMPLOYEE_AVATARS[view.employees.length % EMPLOYEE_AVATARS.length]?.id ?? 'employee-01')) }
  const retry = (): void => {
    if (retrying) return
    setRetrying(true)
    void window.geckit.employees.retryInstructions().then(take).catch(() => undefined).finally(() => setRetrying(false))
  }
  const sheet = editing === undefined ? null : <EmployeeSheet given={editing} current={editing.id === undefined ? undefined : view.employees.find((one) => one.id === editing.id)} onClose={() => setEditing(undefined)} onSaved={(next, saved) => { take(next); const id = savedEmployeeId(saved, known.current, next.employees); if (id !== undefined) setShown(id); setEditing(undefined) }} />
  const alert = view.error === undefined ? null : <div className="phone-group phone-team-alert"><Cell label={view.error.trim() || 'Employee saved. Assistant instructions could not be updated.'} danger /><Cell label={retrying ? 'Retrying...' : 'Retry'} accent onPress={retry} /></div>

  if (shown === 'manager') return <PhoneManager settings={chat.settings} change={chat.change} view={manager} onBack={() => setShown(undefined)} />

  if (shown === 'none') return <Page title="No employee" back="Team" onBack={() => setShown(undefined)}>
    <div className="phone-note">Shortcuts nobody owns. Open one and choose Employee to give it to someone; its runs then start assigned.</div>
    {orphans.length === 0 ? <div className="phone-empty">Every shortcut has an employee.</div> : <PhoneShortcutRows shortcuts={orphans} chat={chat} archived={false} onEdit={onEdit} />}
  </Page>

  if (current !== undefined) return <>
    <PhoneEmployee employee={current} chat={chat} onBack={() => setShown(undefined)} onEdit={onEdit} onChange={() => setEditing(draftOf(current))} take={take} />
    {sheet}
  </>

  return <>
    <Page title="Team" back={back} onBack={onBack} actions={<button type="button" className="phone-icon" aria-label="New employee" onClick={make}><Icon name="plus" size={24} /></button>}>
      {alert}
      <div className="phone-group phone-team-group"><Cell label={<span className="phone-team-person"><EmployeeAvatar employee={managerFace(chat.settings)} size="medium" /><span><b>Manager</b><small>{managerStand(manager).short}</small></span></span>} value={managerStand(manager).tone === 'working' ? <span className="team-live" title="Working now" /> : undefined} onPress={() => setShown('manager')} /></div>
      {loadError ? <div className="phone-group phone-team-group"><Cell label="Could not load employees." /><Cell label="Retry" accent onPress={reload} /></div> : null}
      {loading ? <div className="phone-empty" role="status">Reading employees...</div> : view.employees.length === 0 && !loadError ? <div className="phone-empty">
        No employees yet. An employee is a role with its own rules and shortcuts; tasks given to it build its memory.
        <button type="button" className="phone-empty-action" onClick={make}>New employee</button>
      </div> : <>
        <input className="employee-search" type="search" aria-label="Search employees" placeholder="Search employees" value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="phone-group phone-team-group">
          {found.map((one) => {
            const tasks = tasksFor(one.id)
            const count = tasks.filter(open).length
            const working = tasks.some((task) => task.state === 'working')
            return <Cell key={one.id} label={<span className={`phone-team-person${one.archived ? ' archived' : ''}`}><EmployeeAvatar employee={one} size="medium" /><span><b>{one.name}</b><small>{one.archived ? 'Archived' : one.role || 'No role'}</small></span></span>} value={<>{working ? <span className="team-live" title="Working now" /> : null}{count === 0 ? null : <span className="employee-count">{count}</span>}</>} onPress={() => setShown(one.id)} />
          })}
          {found.length === 0 ? <Cell label="No matches" /> : null}
        </div>
        {orphans.length === 0 ? null : <div className="phone-group phone-team-group"><Cell label={<span className="phone-team-person"><span className="team-none-face small"><Icon name="bolt" size={12} /></span><span><b>No employee</b><small>{orphans.length} {orphans.length === 1 ? 'shortcut' : 'shortcuts'}</small></span></span>} onPress={() => setShown('none')} /></div>}
        {view.employees.some((one) => one.archived) ? <div className="phone-group phone-team-group"><Cell label="Show archived"><Switch on={archived} label="Show archived" onChange={setArchived} /></Cell></div> : null}
      </>}
    </Page>
    {sheet}
  </>
}

function PhoneEmployee({ employee, chat, onBack, onEdit, onChange, take }: {
  readonly employee: Employee
  readonly chat: PhoneTeamChat
  readonly onBack: () => void
  readonly onEdit: (draft: ShortcutDraft) => void
  readonly onChange: () => void
  readonly take: ReturnType<typeof useEmployees>['take']
}): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const tasks = useTasksByEmployee(chat.everyone)(employee.id)
  const shortcuts = chat.settings.shortcuts.filter((one) => one.employeeId === employee.id)
  const timed = shortcuts.filter((one) => one.on && scheduled(one)).length
  const archive = (): void => {
    if (saving) return
    setSaving(true)
    setFailed(false)
    void window.geckit.employees[employee.archived ? 'restore' : 'archive'](employee.id, employee.revision).then(take).catch(() => setFailed(true)).finally(() => { setSaving(false); setAsking(false) })
  }
  const blank = (): ShortcutDraft => ({ name: '', root: shortcuts[0]?.root ?? chat.settings.projects[0] ?? '', prompt: '', mode: 'auto', on: true, employeeId: employee.id })
  return <>
    <Page title={employee.name} back="Team" onBack={onBack} actions={<button type="button" className="phone-icon" aria-label="Edit employee" disabled={saving} onClick={onChange}><Icon name="pencil" size={22} /></button>}>
      <header className="phone-team-hero">
        <EmployeeAvatar employee={employee} size="hero" />
        <span className="phone-team-hero-words">
          <span className="employee-hero-role">{employee.role.trim() || 'No role'}{employee.archived ? <span className="employee-pill">Archived</span> : null}</span>
          <TaskSummary tasks={tasks} shortcuts={shortcuts.length} />
        </span>
      </header>
      <div className="phone-head">Shortcuts</div>
      {shortcuts.length === 0 ? null : <PhoneShortcutRows shortcuts={shortcuts} chat={chat} archived={employee.archived} onEdit={onEdit} />}
      <div className={`phone-group${shortcuts.length === 0 ? '' : ' phone-team-group'}`}><Cell label="New shortcut" accent onPress={() => { if (!employee.archived) onEdit(blank()) }} /></div>
      <div className="phone-note">Each run starts a task assigned to {employee.name}.</div>
      <div className="phone-team-block"><EmployeeTasks key={`tasks-${employee.id}`} tasks={tasks} settings={chat.settings} onOpen={chat.goTo} /></div>
      <div className="phone-head">About</div>
      <div className="phone-team-block"><p className="employee-description">{employee.description.trim() || 'No description'}</p></div>
      <div className="phone-team-block"><EmployeeConversations key={`memory-${employee.id}`} employee={employee} /></div>
      {failed ? <p className="recurrence-error" role="alert">Could not save employee. Try again.</p> : null}
      <div className="phone-group phone-team-group">{employee.archived ? <Cell label={saving ? 'Restoring...' : 'Restore'} accent onPress={archive} /> : <Cell label="Archive" danger onPress={() => { if (!saving) setAsking(true) }} />}</div>
    </Page>
    {asking ? <TeamConfirm title={`Archive ${employee.name}?`} body={`${timed === 0 ? '' : `${timed} scheduled ${timed === 1 ? 'shortcut' : 'shortcuts'} will pause. `}Their tasks and memory stay. Restore resumes the schedules.`} act="Archive" onKeep={() => setAsking(false)} onAct={archive} /> : null}
  </>
}

function PhoneShortcutRows({ shortcuts, chat, archived, onEdit }: { readonly shortcuts: readonly Shortcut[]; readonly chat: PhoneTeamChat; readonly archived: boolean; readonly onEdit: (draft: ShortcutDraft) => void }): React.JSX.Element {
  const [now, setNow] = useState(Date.now)
  const [running, setRunning] = useState<string>()
  const [failed, setFailed] = useState<string>()
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 20_000)
    return () => clearInterval(tick)
  }, [])
  const run = (one: Shortcut): void => {
    tap('light')
    setRunning(one.id)
    setFailed(undefined)
    void window.geckit.shortcuts.run(one.id).then((session) => { if (session === undefined) setFailed(one.id); else chat.goTo(session) }).catch(() => setFailed(one.id)).finally(() => setRunning(undefined))
  }
  return <div className="phone-group phone-shortcuts">
    {shortcuts.map((one) => {
      const busy = running === one.id || shortcutRunning(chat.everyone, one)
      return <div key={one.id} className="phone-shortcut">
        <button type="button" className="phone-shortcut-text" onClick={() => onEdit(one)}>
          <span className="phone-row-title">{one.name}</span>
          <span className="phone-shortcut-when"><b style={{ color: `var(--project-${String(projectColor(one.root, chat.settings))})` }}>{projectLabel(one.root)}</b> {shortcutWhen(one, chat.settings, now, archived)}</span>
          {failed === one.id ? <span className="recurrence-error" role="alert">Could not run. Check the assistant and folder.</span> : null}
        </button>
        <div className="phone-shortcut-side">
          <button type="button" className="phone-pill" disabled={busy || archived} onClick={() => run(one)}>{running === one.id ? <Icon name="spinner" size={14} /> : shortcutRunning(chat.everyone, one) ? 'Running' : 'Run'}</button>
          {scheduled(one) ? <Switch on={one.on && !archived} disabled={archived} label={`Timetable for ${one.name}`} onChange={(on) => { tap('light'); void saveShortcut(window.geckit.shortcuts, chat.settings, { ...shortcutDraft(one), on }).catch(() => setFailed(one.id)) }} /> : null}
        </div>
      </div>
    })}
  </div>
}

function EmployeeSheet({ given, current, onClose, onSaved }: {
  readonly given: EmployeeDraft
  readonly current: Employee | undefined
  readonly onClose: () => void
  readonly onSaved: (next: Awaited<ReturnType<typeof window.geckit.employees.save>>, saved: EmployeeDraft) => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(given)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [base, setBase] = useState(given)
  const dirty = draft.name !== base.name || draft.role !== base.role || draft.description !== base.description || draft.avatar !== base.avatar
  const stale = current !== undefined && draft.id !== undefined && current.revision !== draft.revision
  const change = (next: Partial<EmployeeDraft>): void => { setDraft({ ...draft, ...next }); setError(''); if (next.name !== undefined) setInvalid(false) }
  const save = (): void => {
    if (saving || stale) return
    if (draft.name.trim() === '') { setInvalid(true); return }
    setSaving(true)
    setError('')
    void window.geckit.employees.save(draft).then((next) => onSaved(next, draft)).catch(() => setError('Could not save employee. Try again.')).finally(() => setSaving(false))
  }
  const close = (): void => { if (dirty) setLeaving(true); else onClose() }
  return <>
    <FullSheet title={given.id === undefined ? 'New employee' : 'Edit employee'} action={saving ? 'Saving...' : 'Save'} ready={!saving && !stale && (given.id === undefined || dirty)} onAction={save} onClose={close}>
      <div className="phone-team-portraits" role="group" aria-label="Choose avatar">
        {EMPLOYEE_AVATARS.map((one, index) => <button key={one.id} type="button" className={draft.avatar === one.id ? 'on' : ''} aria-label={`Portrait ${index + 1}`} aria-pressed={draft.avatar === one.id} onClick={() => change({ avatar: one.id })}><EmployeeAvatar employee={{ name: draft.name, avatar: one.id }} size="medium" /></button>)}
      </div>
      <div className="phone-task-label">Name</div>
      <input className="phone-task-goal" value={draft.name} aria-invalid={invalid} placeholder="Tatiana" onChange={(event) => change({ name: event.target.value })} />
      {invalid ? <p className="recurrence-error" role="alert">Enter a name</p> : null}
      <div className="phone-task-label">Role</div>
      <input className="phone-task-goal" value={draft.role} placeholder="Promotion" onChange={(event) => change({ role: event.target.value })} />
      <div className="phone-task-label">About</div>
      <textarea className="phone-task-text" value={draft.description} placeholder="What this employee does and the rules they should follow" onChange={(event) => change({ description: event.target.value })} />
      <div className="phone-note">The rules the assistant reads when it works as this employee.</div>
      {stale && current !== undefined ? <div className="phone-group phone-team-group"><Cell label="Employee changed on your computer. Reload before saving." /><Cell label="Reload employee" accent onPress={() => { const fresh = draftOf(current); setDraft(fresh); setBase(fresh) }} /></div> : null}
      {error === '' ? null : <p className="recurrence-error" role="alert">{error}</p>}
    </FullSheet>
    {leaving ? <Menu anchor={new DOMRect()} title="Discard changes?" choices={[{ value: 'discard', label: 'Discard changes', danger: true }, { value: 'keep', label: 'Keep editing' }]} onPick={(value) => { if (value === 'discard') onClose() }} onClose={() => setLeaving(false)} /> : null}
  </>
}
