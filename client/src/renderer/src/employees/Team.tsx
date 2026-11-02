import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import type { ChatSession, Shortcut, ShortcutDraft } from '../../../shared/api'
import type { Employee, EmployeeDraft } from '../../../shared/employees'
import { saveShortcut } from '../../../shared/shortcut-save'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import type { Chat } from '../chat/useChat'
import { EmployeeAvatar, EmployeeBadge, EmployeeConversations, EmployeeTasks, TaskSummary, useTasksByEmployee } from './Employees'
import { EMPLOYEE_AVATARS } from './avatars'
import { useEmployees } from './useEmployees'
import { newEmployeeDraft, savedEmployeeId } from './draft'
import { EmployeeShortcut, shortcutDraft } from './shortcuts'
import { useManager } from '../chat/useManager'
import { managerStand } from '../chat/manager-label'
import { ManagerPage, managerFace } from './TeamManager'

export type TeamChat = Pick<Chat, 'everyone' | 'settings' | 'change'>
type Selected = Employee['id'] | 'none' | 'manager'

const draftOf = (employee: Employee): EmployeeDraft => ({ id: employee.id, revision: employee.revision, name: employee.name, role: employee.role, description: employee.description, avatar: employee.avatar })
const sameFields = (one: EmployeeDraft, other: EmployeeDraft): boolean => one.name === other.name && one.role === other.role && one.description === other.description && one.avatar === other.avatar

export function Team({ chat, first, onClose, onOpen, onShortcut }: {
  readonly chat: TeamChat
  readonly first?: Selected | undefined
  readonly onClose: () => void
  readonly onOpen: (id: ChatSession['id']) => void
  readonly onShortcut: (edit: Shortcut['id'] | ShortcutDraft) => void
}): React.JSX.Element {
  const { view, take, loading, loadError, reload } = useEmployees()
  const manager = useManager()
  const tasksFor = useTasksByEmployee(chat.everyone)
  const stand = managerStand(manager)
  const [selected, setSelected] = useState<Selected | undefined>(first)
  const [draft, setDraft] = useState<EmployeeDraft>()
  const [original, setOriginal] = useState<EmployeeDraft>()
  const [search, setSearch] = useState('')
  const [archived, setArchived] = useState(false)
  const [avatars, setAvatars] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [discarding, setDiscarding] = useState<() => void>()
  const [archiving, setArchiving] = useState(false)
  const [more, setMore] = useState<DOMRect>()
  const [giving, setGiving] = useState<{ readonly anchor: DOMRect; readonly id: Shortcut['id'] }>()
  const [now] = useState(() => Date.now())
  const busy = useRef(false)
  const name = useRef<HTMLInputElement>(null)
  const employees = view.employees.filter((one) => (archived || !one.archived || one.id === selected) && `${one.name} ${one.role}`.toLowerCase().includes(search.toLowerCase()))
  const owned = new Set(view.employees.map((one) => one.id))
  const orphans = chat.settings.shortcuts.filter((one) => one.target !== 'manager' && (one.employeeId === undefined || !owned.has(one.employeeId)))
  const shownId = selected ?? (draft === undefined ? employees.find((one) => !one.archived)?.id ?? employees[0]?.id : undefined)
  const current = shownId === 'none' || shownId === 'manager' ? undefined : view.employees.find((one) => one.id === shownId)
  const editing = draft !== undefined
  const form = draft ?? (current === undefined ? undefined : draftOf(current))
  const dirty = draft !== undefined && original !== undefined && !sameFields(draft, original)
  const stale = current !== undefined && draft !== undefined && draft.id !== undefined && current.revision !== draft.revision
  const close = useRef(onClose)
  const guard = useRef({ dirty, editing })
  useEffect(() => { close.current = onClose; guard.current = { dirty, editing } })
  const request = (action: () => void): void => {
    if (busy.current) return
    if (dirty) setDiscarding(() => action)
    else action()
  }
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      const target = event.target
      if (target instanceof HTMLElement && target.closest('.dialog-scrim, .menu') !== null) return
      event.preventDefault()
      if (guard.current.dirty) setDiscarding(() => close.current)
      else if (guard.current.editing) { setDraft(undefined); setOriginal(undefined); setAvatars(false) }
      else close.current()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  const choose = (id: Selected): void => {
    setSelected(id)
    setDraft(undefined)
    setOriginal(undefined)
    setAvatars(false)
    setError('')
    setInvalid(false)
  }
  const make = (): void => {
    const avatar = EMPLOYEE_AVATARS[view.employees.length % EMPLOYEE_AVATARS.length]?.id ?? 'employee-01'
    const created = newEmployeeDraft(avatar)
    setSelected(undefined)
    setDraft(created)
    setOriginal(created)
    setAvatars(false)
    setError('')
    setInvalid(false)
    requestAnimationFrame(() => name.current?.focus())
  }
  const startEdit = (): void => {
    if (current === undefined) return
    setSelected(current.id)
    setDraft(draftOf(current))
    setOriginal(draftOf(current))
    requestAnimationFrame(() => name.current?.focus())
  }
  const edit = (change: Partial<EmployeeDraft>): void => {
    if (form === undefined) return
    setDraft({ ...form, ...change })
    setError('')
    if (change.name !== undefined) setInvalid(false)
  }
  const cancel = (): void => request(() => { setDraft(undefined); setOriginal(undefined); setAvatars(false); setError('') })
  const save = (): void => {
    if (form === undefined || busy.current || stale) return
    if (form.name.trim() === '') { setInvalid(true); name.current?.focus(); return }
    busy.current = true
    setSaving(true)
    setError('')
    void window.geckit.employees.save(form).then((next) => {
      take(next)
      setSelected(savedEmployeeId(form, view.employees, next.employees))
      setDraft(undefined)
      setOriginal(undefined)
      setAvatars(false)
    }).catch(() => setError('Could not save employee. Try again.')).finally(() => { busy.current = false; setSaving(false) })
  }
  const archive = (): void => {
    if (current === undefined || busy.current) return
    busy.current = true
    setSaving(true)
    setError('')
    void window.geckit.employees[current.archived ? 'restore' : 'archive'](current.id, current.revision).then((next) => {
      take(next)
      if (!current.archived) setArchived(true)
    }).catch(() => setError('Could not save employee. Try again.')).finally(() => { busy.current = false; setSaving(false); setArchiving(false) })
  }
  const retry = (): void => {
    if (busy.current) return
    busy.current = true
    setSaving(true)
    void window.geckit.employees.retryInstructions().then(take).catch(() => setError('Employee saved. Assistant instructions could not be updated.')).finally(() => { busy.current = false; setSaving(false) })
  }
  const give = (id: Shortcut['id'], employeeId: Employee['id']): void => {
    const one = chat.settings.shortcuts.find((shortcut) => shortcut.id === id)
    if (one === undefined) return
    void saveShortcut(window.geckit.shortcuts, chat.settings, { ...shortcutDraft(one), employeeId }).catch(() => setError('Could not save the shortcut. Try again.'))
  }
  const openTask = (id: ChatSession['id']): void => request(() => onOpen(id))
  const openCount = (id: Employee['id']): number => tasksFor(id).filter((one) => one.status !== 'done' && one.status !== 'archived').length
  const empty = view.employees.length === 0 && !loading && !loadError && draft === undefined
  const shortcuts = current === undefined ? [] : chat.settings.shortcuts.filter((one) => one.employeeId === current.id)
  const scheduledCount = shortcuts.filter((one) => one.on && (one.cron !== undefined || one.recurrence !== undefined)).length

  const page = (): React.ReactNode => {
    if (shownId === 'manager' && draft === undefined) return <ManagerPage settings={chat.settings} change={chat.change} view={manager}>
      <section className="team-section" aria-label="Shortcuts"><div className="employee-section-head"><h3>Shortcuts</h3><button type="button" className="quiet" onClick={() => onShortcut({ name: '', root: chat.settings.projects[0] ?? '', prompt: '', mode: 'auto', on: true, target: 'manager' })}><Icon name="plus" size={11} />New shortcut</button></div>
        <p className="employee-note">Run recurring Manager requests from Shortcuts.</p>
        <div className="team-box">{chat.settings.shortcuts.filter((one) => one.target === 'manager').map((one) => <EmployeeShortcut key={one.id} shortcut={one} chat={chat} archived={false} now={now} onEdit={onShortcut} onOpen={openTask} />)}</div>
      </section>
    </ManagerPage>
    if (shownId === 'none' && draft === undefined) return <>
      <header className="employee-profile">
        <span className="team-none-face"><Icon name="bolt" size={22} /></span>
        <span className="employee-hero-words"><h2>No employee</h2><span className="employee-hero-role">Shortcuts nobody owns. Give one to an employee and its tasks start assigned.</span></span>
      </header>
      <section className="team-section" aria-label="Shortcuts">
        <div className="employee-section-head"><span><h3>Shortcuts <span className="employee-count">{orphans.length}</span></h3></span></div>
        {orphans.length === 0 ? <p className="employee-empty">Every shortcut has an employee.</p> : <div className="team-box">{orphans.map((one) => <EmployeeShortcut key={one.id} shortcut={one} chat={chat} archived={false} now={now} onEdit={onShortcut} onGive={view.employees.some((employee) => !employee.archived) ? (anchor, id) => setGiving({ anchor, id }) : undefined} onOpen={openTask} />)}</div>}
      </section>
    </>
    if (form === undefined) return <p className="employee-note team-choose">Choose an employee</p>
    const tasks = current === undefined ? undefined : tasksFor(current.id)
    return <>
      <header className="employee-profile">
        {editing ? <button type="button" className={`employee-portrait${avatars ? ' on' : ''}`} disabled={saving} aria-label="Change avatar" title="Change avatar" aria-expanded={avatars} onClick={() => setAvatars(!avatars)}>
          <EmployeeAvatar employee={form} size="hero" /><span className="employee-portrait-edit"><Icon name="pencil" size={10} /></span>
        </button> : <EmployeeAvatar employee={form} size="hero" />}
        {editing ? <span className="employee-fields team-name-fields">
          <label>Name<input ref={name} value={form.name} disabled={saving} aria-invalid={invalid} onChange={(event) => edit({ name: event.target.value })} />{invalid ? <span className="employee-alert" role="alert">Enter a name</span> : null}</label>
          <label>Role<input value={form.role} disabled={saving} placeholder="Promotion" onChange={(event) => edit({ role: event.target.value })} /></label>
        </span> : <span className="employee-hero-words">
          <h2>{form.name}</h2>
          <span className="employee-hero-role">{form.role.trim() || 'No role'}{current?.archived === true ? <span className="employee-pill">Archived</span> : null}</span>
          {tasks === undefined ? null : <TaskSummary tasks={tasks} shortcuts={shortcuts.length} />}
        </span>}
        {editing || current === undefined ? null : <span className="team-hero-actions">
          <button type="button" className="quiet" disabled={saving} onClick={startEdit}><Icon name="pencil" size={11} />Edit</button>
          <button type="button" className="icon-button" aria-label="More" title="More" aria-haspopup="menu" disabled={saving} onClick={(event) => setMore(event.currentTarget.getBoundingClientRect())}><Icon name="more" size={14} /></button>
        </span>}
      </header>
      {!avatars ? null : <div className="employee-avatar-options" role="group" aria-label="Choose avatar">{EMPLOYEE_AVATARS.map((one, index) => <button key={one.id} type="button" className={form.avatar === one.id ? 'on' : ''} disabled={saving} aria-label={`Portrait ${index + 1}`} aria-pressed={form.avatar === one.id} onClick={() => { edit({ avatar: one.id }); setAvatars(false) }}><EmployeeAvatar employee={{ name: form.name, avatar: one.id }} size="medium" /></button>)}</div>}
      {current === undefined ? null : <section className="team-section" aria-label="Shortcuts">
        <div className="employee-section-head">
          <span><h3>Shortcuts <span className="employee-count">{shortcuts.length}</span></h3><p className="employee-note">What {current.name} does by hand or on a schedule. Each run is a new task assigned to them.</p></span>
          <button type="button" className="quiet employee-new" disabled={current.archived} onClick={() => onShortcut({ name: '', root: shortcuts[0]?.root ?? chat.settings.projects[0] ?? '', prompt: '', mode: 'auto', on: true, employeeId: current.id })}><Icon name="plus" size={11} />New shortcut</button>
        </div>
        {shortcuts.length === 0 ? <p className="employee-empty">No shortcuts yet. Add what this employee does by hand or on a schedule.</p> : <div className="team-box">{shortcuts.map((one) => <EmployeeShortcut key={one.id} shortcut={one} chat={chat} archived={current.archived} now={now} onEdit={onShortcut} onOpen={openTask} />)}</div>}
      </section>}
      {tasks === undefined || current === undefined ? null : <EmployeeTasks key={`tasks-${current.id}`} tasks={tasks} settings={chat.settings} onOpen={openTask} />}
      <section className="team-section" aria-label="About">
        <div className="employee-section-head"><span><h3>About</h3><p className="employee-note">The rules the assistant reads when it works as this employee</p></span></div>
        {editing ? <form className="employee-form team-about" onSubmit={(event) => { event.preventDefault(); save() }}>
          <textarea rows={7} value={form.description} disabled={saving} aria-label="Description" placeholder="What this employee does and the rules they should follow" onChange={(event) => edit({ description: event.target.value })} />
          {!stale || current === undefined ? null : <p className="employee-alert" role="alert">Employee changed in another window. Reload before saving. <button type="button" className="quiet" onClick={() => request(() => { setDraft(draftOf(current)); setOriginal(draftOf(current)) })}>Reload employee</button></p>}
          {error === '' ? null : <p className="employee-alert" role="alert">{error}</p>}
          <footer><span className="spacer" /><button type="button" className="quiet" disabled={saving} onClick={() => current === undefined ? request(() => { setDraft(undefined); setOriginal(undefined); setSelected(undefined) }) : cancel()}>Cancel</button><button type="submit" className="primary" disabled={saving || stale || (current !== undefined && !dirty)}>{saving ? 'Saving...' : error === '' ? 'Save' : 'Retry'}</button></footer>
        </form> : <p className="employee-description">{form.description.trim() || 'No description'}</p>}
      </section>
      {current === undefined || editing ? null : <EmployeeConversations key={`memory-${current.id}`} employee={current} />}
    </>
  }

  return <section className="team-page" aria-label="Team" aria-busy={saving}>
    <header className="team-bar">
      <button type="button" className="icon-button" aria-label="Back to tasks" title="Back to tasks (Esc)" onClick={() => request(onClose)}><Icon name="left" size={13} /></button>
      <h2>Team</h2>
      <span className="spacer" />
      {empty ? null : <button type="button" className="quiet employee-new" disabled={saving} onClick={() => request(make)}><Icon name="plus" size={11} />New employee</button>}
    </header>
    {loadError ? <p className="employee-alert team-alert" role="alert">Could not load employees. <button type="button" className="quiet" onClick={reload}>Retry</button></p> : null}
    {view.error === undefined ? null : <p className="employee-alert team-alert" role="alert">{view.error.trim() || 'Employee saved. Assistant instructions could not be updated.'} <button type="button" className="quiet" disabled={saving} onClick={retry}>Retry</button></p>}
    <div className="team-split">
      <aside className="employee-roster">
        <label className="employee-find"><Icon name="search" size={11} /><input type="search" aria-label="Search employees" placeholder="Search employees" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <div className="employee-settings-list">
          {!'manager'.includes(search.trim().toLowerCase()) ? null : <><button type="button" className={`employee-settings-row${shownId === 'manager' ? ' on' : ''}`} aria-current={shownId === 'manager'} disabled={saving} onClick={() => request(() => choose('manager'))}>
            <EmployeeAvatar employee={managerFace(chat.settings)} size="medium" />
            <span className="employee-row-words"><strong>Manager</strong><small>{stand.short}</small></span>
            {stand.tone === 'working' ? <span className="team-live" title="Working now" /> : null}
          </button><span className="team-roster-rule" /></>}
          {loading ? <p className="employee-note employee-none" role="status">Reading employees...</p> : null}
          {draft !== undefined && draft.id === undefined ? <div className="employee-settings-row on new" aria-current="true"><EmployeeAvatar employee={draft} size="medium" /><span className="employee-row-words"><strong>{draft.name.trim() || 'New employee'}</strong><small>{draft.role || 'Not saved yet'}</small></span></div> : null}
          {employees.map((one) => {
            const count = openCount(one.id)
            const working = tasksFor(one.id).some((task) => task.state === 'working')
            return <button key={one.id} type="button" className={`employee-settings-row${shownId === one.id ? ' on' : ''}${one.archived ? ' archived' : ''}`} aria-current={shownId === one.id} disabled={saving} onClick={() => request(() => choose(one.id))}>
              <EmployeeAvatar employee={one} size="medium" />
              <span className="employee-row-words"><strong>{one.name}</strong><small>{one.archived ? 'Archived' : one.role || 'No role'}</small></span>
              {working ? <span className="team-live" title="Working now" /> : null}
              {count === 0 ? null : <span className="employee-count" title="Open tasks">{count}</span>}
            </button>
          })}
          {employees.length === 0 && view.employees.length > 0 ? <p className="employee-note employee-none">No matches</p> : null}
          {orphans.length === 0 ? null : <>
            <span className="team-roster-rule" />
            <button type="button" className={`employee-settings-row${shownId === 'none' ? ' on' : ''}`} disabled={saving} onClick={() => request(() => choose('none'))}>
              <span className="team-none-face small"><Icon name="bolt" size={12} /></span>
              <span className="employee-row-words"><strong>No employee</strong><small>{orphans.length} {orphans.length === 1 ? 'shortcut' : 'shortcuts'}</small></span>
            </button>
          </>}
        </div>
        {view.employees.some((one) => one.archived) ? <label className="check"><input type="checkbox" checked={archived} onChange={(event) => setArchived(event.target.checked)} />Show archived</label> : null}
      </aside>
      <div className="team-main">
        {empty && shownId !== 'none' && shownId !== 'manager' ? <div className="employee-welcome">
          <span className="employee-stack" aria-hidden="true">{EMPLOYEE_AVATARS.slice(0, 3).map((one) => <EmployeeAvatar key={one.id} employee={{ name: '', avatar: one.id }} large />)}</span>
          <strong>No employees yet</strong>
          <p className="employee-note">An employee is a role with its own rules and shortcuts. Tasks given to it build its memory.</p>
          <button type="button" className="primary" onClick={make}>New employee</button>
        </div> : <div className="team-inner">{page()}</div>}
      </div>
    </div>
    {more === undefined || current === undefined ? null : <Menu anchor={more} autoFocus choices={[{ value: current.archived ? 'restore' : 'archive', label: current.archived ? 'Restore' : 'Archive' }]} onPick={(value) => value === 'restore' ? archive() : setArchiving(true)} onClose={() => setMore(undefined)} />}
    {giving === undefined ? null : <Menu anchor={giving.anchor} autoFocus title="Give to" choices={view.employees.filter((one) => !one.archived).map((one) => ({ value: one.id, label: <EmployeeBadge employee={one} role /> }))} onPick={(id) => give(giving.id, id)} onClose={() => setGiving(undefined)} />}
    {!archiving || current === undefined ? null : <TeamConfirm title={`Archive ${current.name}?`} body={`${scheduledCount === 0 ? '' : `${scheduledCount} scheduled ${scheduledCount === 1 ? 'shortcut' : 'shortcuts'} will pause. `}Their tasks and memory stay. Restore resumes the schedules.`} act="Archive" onKeep={() => setArchiving(false)} onAct={archive} />}
    {discarding === undefined ? null : <TeamConfirm title="Discard changes?" act="Discard changes" keep="Keep editing" onKeep={() => setDiscarding(undefined)} onAct={() => { const action = discarding; setDiscarding(undefined); setDraft(undefined); setOriginal(undefined); setAvatars(false); action() }} />}
  </section>
}

export function TeamConfirm({ title, body, act, keep = 'Cancel', onKeep, onAct }: { readonly title: string; readonly body?: string; readonly act: string; readonly keep?: string; readonly onKeep: () => void; readonly onAct: () => void }): React.JSX.Element {
  const dialog = useRef<HTMLDivElement>(null)
  const kept = useRef(onKeep)
  useEffect(() => { kept.current = onKeep }, [onKeep])
  useEffect(() => {
    const opener = document.activeElement
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); kept.current() }
      if (event.key === 'Tab') {
        const controls = dialog.current?.querySelectorAll<HTMLButtonElement>('button')
        if (controls === undefined) return
        if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[1]?.focus() }
        else if (!event.shiftKey && document.activeElement === controls[1]) { event.preventDefault(); controls[0]?.focus() }
      }
    }
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('keydown', key, true); if (opener instanceof HTMLElement && opener.isConnected) opener.focus() }
  }, [])
  return createPortal(<div className="dialog-scrim employee-discard" onMouseDown={onKeep}><div ref={dialog} className="dialog" role="alertdialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><h2>{title}</h2>{body === undefined ? null : <p>{body}</p>}<div className="dialog-actions"><button type="button" className="quiet" onClick={onKeep}>{keep}</button><button type="button" className="primary" onClick={onAct}>{act}</button></div></div></div>, document.body)
}
