import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { BOARD_COLUMNS, columnOf, homeOf } from '../../../shared/api'
import type { BoardColumn, ChatSession, Settings } from '../../../shared/api'
import { projectColor } from '../../../shared/project-color'
import type { Employee, EmployeeConversation, EmployeeMemory } from '../../../shared/employees'
import { ON_PHONE } from '../on-phone'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import type { Choice } from '../ui/Menu'
import { Sheet } from '../ui/Sheet'
import type { Chat } from '../chat/useChat'
import { homePath, projectLabel, tint } from '../chat/project'
import { ago, stamp } from '../chat/time'
import { continuedMemory } from './memory'
import { EMPLOYEE_AVATARS } from './avatars'
import { EmployeeShortcutsRead } from './shortcuts'

export const matchesEmployee = (session: Pick<ChatSession, 'employeeId'>, filter: string): boolean =>
  filter === '' || (filter === 'unassigned' ? session.employeeId === undefined : session.employeeId === filter)

export const EmployeeAvatar = memo(function EmployeeAvatar({ employee, large = false, size }: { readonly employee: Pick<Employee, 'name' | 'avatar'>; readonly large?: boolean; readonly size?: 'medium' | 'hero' }): React.JSX.Element {
  const [failed, setFailed] = useState<string>()
  const src = EMPLOYEE_AVATARS.find((one) => one.id === employee.avatar)?.src
  return <span className={`employee-avatar${large ? ' large' : ''}${size === undefined ? '' : ` ${size}`}`} aria-hidden="true">
    {src === undefined || failed === src ? employee.name.trim().split(/\s+/).slice(0, 2).map((one) => one[0]).join('').toUpperCase() || '?' : <img src={src} alt="" onError={() => setFailed(src)} />}
  </span>
})

export const EmployeeBadge = memo(function EmployeeBadge({ employee, role = false }: { readonly employee: Employee | undefined; readonly role?: boolean }): React.JSX.Element | null {
  if (employee === undefined) return null
  return <span className="employee-badge" title={`${employee.name}${employee.role === '' ? '' : ` · ${employee.role}`}${employee.archived ? ' · Archived' : ''}`}>
    <EmployeeAvatar employee={employee} />
    <span className="employee-words"><span>{employee.name}</span>{role && employee.role !== '' ? <small>{employee.role}</small> : null}</span>
    {employee.archived ? <small>Archived</small> : null}
  </span>
})

export const TEAM_EVENT = 'geckit-team'
export const openTeam = (employee?: Employee['id']): void => { window.dispatchEvent(new CustomEvent(TEAM_EVENT, { detail: employee })) }

export type AssignChat = Pick<Chat, 'employees' | 'employeesById' | 'refresh'>

function assignChoices(chat: Pick<Chat, 'employees'>, current: Employee | undefined, search: string): readonly Choice[] {
  const found = chat.employees.filter((one) => !one.archived && `${one.name} ${one.role}`.toLowerCase().includes(search.trim().toLowerCase()))
  return [
    ...found.map((one) => ({ value: one.id, label: <EmployeeBadge employee={one} role /> })),
    { value: '', label: 'None' },
    current === undefined ? { value: 'open-team', label: 'Open Team' } : { value: 'open-team', label: `Open ${current.name} in Team` },
  ]
}

function useAssign(chat: AssignChat, session: Pick<ChatSession, 'id'>): { readonly pending: boolean; readonly error: boolean; readonly assign: (id: string) => void } {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)
  const busy = useRef(false)
  const assign = (id: string): void => {
    if (busy.current) return
    busy.current = true
    setPending(true)
    setError(false)
    void window.geckit.chat.assignEmployee(session.id, id === '' ? null : id).then(() => chat.refresh()).catch(() => setError(true)).finally(() => { busy.current = false; setPending(false) })
  }
  return { pending, error, assign }
}

export function EmployeeAssignMenu({ chat, current, anchor, onPick, onClose }: { readonly chat: Pick<Chat, 'employees'>; readonly current: Employee | undefined; readonly anchor: DOMRect; readonly onPick: (id: string) => void; readonly onClose: () => void }): React.JSX.Element {
  const [search, setSearch] = useState('')
  return <Menu anchor={anchor} title="Employee" chosen={current?.id ?? ''} autoFocus
    search={{ value: search, onChange: setSearch, placeholder: 'Search employees' }}
    choices={assignChoices(chat, current, search)}
    {...(chat.employees.length === 0 ? { note: ON_PHONE ? 'Create employees on your computer' : 'No employees yet' } : {})}
    onPick={(id) => id === 'open-team' ? openTeam(current?.id) : onPick(id)}
    onClose={onClose} />
}

export function AssignSheet({ chat, session, onClose }: { readonly chat: AssignChat; readonly session: Pick<ChatSession, 'id' | 'employeeId'>; readonly onClose: () => void }): React.JSX.Element {
  const { assign } = useAssign(chat, session)
  const current = session.employeeId === undefined ? undefined : chat.employeesById.get(session.employeeId)
  return <EmployeeAssignMenu chat={chat} current={current} anchor={new DOMRect()} onPick={assign} onClose={onClose} />
}

export function EmployeeCardAssign({ chat, session }: { readonly chat: AssignChat; readonly session: Pick<ChatSession, 'id' | 'employeeId'> }): React.JSX.Element {
  const [anchor, setAnchor] = useState<DOMRect>()
  const { pending, error, assign } = useAssign(chat, session)
  const employee = session.employeeId === undefined ? undefined : chat.employeesById.get(session.employeeId)
  const identity = employee === undefined ? 'Assign employee' : `${employee.name}${employee.role === '' ? '' : ` · ${employee.role}`}${employee.archived ? ' · Archived' : ''}`
  return <span className="employee-card-slot" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()} onDragStart={(event) => event.preventDefault()}>
    <button type="button" draggable={false} className={`employee-card-avatar${employee === undefined ? ' blank' : ''}${anchor === undefined ? '' : ' open'}`} disabled={pending} aria-label={employee === undefined ? 'Assign employee' : `Employee: ${identity}. Change`} title={identity} aria-haspopup="menu" aria-expanded={anchor !== undefined} onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}>
      {employee === undefined ? <Icon name="plus" size={10} /> : <EmployeeAvatar employee={employee} />}
    </button>
    {error ? <span className="employee-card-alert" role="alert">Could not change employee. Try again.</span> : null}
    {anchor === undefined ? null : <EmployeeAssignMenu chat={chat} current={employee} anchor={anchor} onPick={assign} onClose={() => setAnchor(undefined)} />}
  </span>
}

export function TeamButton({ chat, on, onTeam }: { readonly chat: Pick<Chat, 'employees'>; readonly on: boolean; readonly onTeam: () => void }): React.JSX.Element {
  const faces = chat.employees.filter((one) => !one.archived).slice(0, 3)
  return <button type="button" className={`team-button no-drag${on ? ' on' : ''}`} aria-pressed={on} title="Team: employees, their shortcuts and tasks" onClick={onTeam}>
    {faces.length === 0 ? <Icon name="plus" size={11} /> : <span className="team-faces">{faces.map((one) => <EmployeeAvatar key={one.id} employee={one} />)}</span>}
    Team
  </button>
}

export function EmployeeSelect({ employees, value, onPick, disabled = false, onManage, className = 'picker employee-select', filter = false, compact = false }: {
  readonly employees: readonly Employee[]
  readonly value: string
  readonly onPick: (id: string) => void
  readonly disabled?: boolean
  readonly onManage?: (() => void) | undefined
  readonly className?: string
  readonly filter?: boolean
  readonly compact?: boolean
}): React.JSX.Element {
  const [anchor, setAnchor] = useState<DOMRect>()
  const [search, setSearch] = useState('')
  const employee = employees.find((one) => one.id === value)
  const found = useMemo(() => employees.filter((one) => `${one.name} ${one.role}`.toLowerCase().includes(search.trim().toLowerCase())), [employees, search])
  const label = compact ? employee !== undefined ? <><EmployeeAvatar employee={employee} /><span className="employee-chip-name">{employee.name.split(/\s+/)[0]}</span></> : value === 'unassigned' ? <><Icon name="minus" size={12} /><span className="employee-chip-name">Unassigned</span></> : <span className="employee-chip-stack">{employees.slice(0, 2).map((one) => <EmployeeAvatar key={one.id} employee={one} />)}</span> : employee === undefined ? value === 'unassigned' ? 'Unassigned' : value !== '' ? 'Employee unavailable' : filter ? 'All employees' : 'None' : <EmployeeBadge employee={employee} />
  return <>
    <button type="button" className={className} disabled={disabled} aria-label={filter ? `Employees: ${employee?.name ?? label}` : `Employee: ${employee?.name ?? 'None'}`} aria-haspopup="menu" aria-expanded={anchor !== undefined} onClick={(event) => { setSearch(''); setAnchor(event.currentTarget.getBoundingClientRect()) }}>
      {label}<Icon name="down" size={11} />
    </button>
    {anchor === undefined ? null : <Menu anchor={anchor} title={filter ? 'Employees' : 'Employee'} chosen={value} autoFocus
      search={{ value: search, onChange: setSearch, placeholder: 'Search employees' }}
      choices={[
        { value: '', label: filter ? 'All employees' : 'None' },
        ...(filter ? [{ value: 'unassigned', label: 'Unassigned' }] : []),
        ...found.map((one) => ({ value: one.id, label: <EmployeeBadge employee={one} role />, disabled: !filter && one.archived })),
        ...(onManage === undefined ? [] : [{ value: 'manage-employees', label: 'Manage employees' }]),
      ]}
      {...(employees.length === 0 ? { note: ON_PHONE ? 'Create employees in Settings, Team' : 'No employees yet' } : {})}
      onPick={(id) => id === 'manage-employees' ? onManage?.() : onPick(id)} onClose={() => setAnchor(undefined)} />}
  </>
}

export function EmployeeFilter({ chat, compact = false }: { readonly chat: Pick<Chat, 'employees' | 'everyone' | 'settings' | 'change'>; readonly compact?: boolean }): React.JSX.Element | null {
  const assigned = useMemo(() => new Set(chat.everyone.flatMap((one) => one.employeeId === undefined ? [] : [one.employeeId])), [chat.everyone])
  const employees = useMemo(() => chat.employees.filter((one) => !one.archived || assigned.has(one.id)), [chat.employees, assigned])
  if (employees.length === 0 && assigned.size === 0 && chat.settings.employeeFilter === '') return null
  if (compact) return <EmployeeSelect employees={employees} value={chat.settings.employeeFilter} filter compact className={`phone-scope employee-chip${chat.settings.employeeFilter === '' ? '' : ' on'}`} onPick={(employeeFilter) => chat.change({ employeeFilter })} />
  return <span className="employee-filter no-drag">
    <EmployeeSelect employees={employees} value={chat.settings.employeeFilter} filter className={`picker employee-select${chat.settings.employeeFilter === '' ? '' : ' on'}`} onPick={(employeeFilter) => chat.change({ employeeFilter })} />
    {chat.settings.employeeFilter === '' ? null : <button type="button" className="icon-button" aria-label="Clear employee filter" title="Clear employee filter" onClick={() => chat.change({ employeeFilter: '' })}><Icon name="close" size={11} /></button>}
  </span>
}

export function EmployeeAssignment({ chat }: { readonly chat: Pick<Chat, 'session' | 'employees' | 'employeesById' | 'refresh'>; readonly onManage?: (() => void) | undefined }): React.JSX.Element | null {
  const [anchor, setAnchor] = useState<DOMRect>()
  const session = chat.session
  const { pending, error, assign } = useAssign(chat, session ?? { id: '' })
  if (session === undefined || session.question === true || session.manager === true) return null
  const employee = session.employeeId === undefined ? undefined : chat.employeesById.get(session.employeeId)
  return <span className="employee-assignment no-drag">
    <button type="button" className={`employee-chip${employee === undefined ? ' none' : ''}${anchor === undefined ? '' : ' open'}`} disabled={pending} aria-haspopup="menu" aria-expanded={anchor !== undefined} aria-label={`Employee: ${employee?.name ?? 'None'}`} onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}>
      {employee === undefined ? <><span className="employee-chip-blank"><Icon name="plus" size={9} /></span>No employee</> : <><EmployeeAvatar employee={employee} /><span>{employee.name}</span>{employee.role === '' ? null : <small>{employee.role}</small>}{employee.archived ? <small>Archived</small> : null}</>}
      <Icon name="down" size={10} />
    </button>
    {error ? <span className="employee-alert" role="alert">Could not change employee. Try again.</span> : null}
    {anchor === undefined ? null : <EmployeeAssignMenu chat={chat} current={employee} anchor={anchor} onPick={assign} onClose={() => setAnchor(undefined)} />}
  </span>
}

export type EmployeeWorkChat = Pick<Chat, 'everyone' | 'settings'>

const TASK_COLUMNS: readonly BoardColumn['id'][] = ['progress', 'todo', 'done', 'archived']
const titleOf = (id: BoardColumn['id']): string => BOARD_COLUMNS.find((one) => one.id === id)?.title ?? id

export function employeeTasks(everyone: readonly ChatSession[], id: Employee['id']): readonly ChatSession[] {
  return everyone.filter((one) => one.employeeId === id && one.question !== true && one.manager !== true).toSorted((one, other) => other.at - one.at)
}

const NO_TASKS: readonly ChatSession[] = []

export function useTasksByEmployee(everyone: readonly ChatSession[]): (id: Employee['id']) => readonly ChatSession[] {
  const byEmployee = useMemo(() => {
    const found = new Map<Employee['id'], ChatSession[]>()
    for (const one of everyone) {
      if (one.employeeId === undefined || one.question === true || one.manager === true) continue
      const list = found.get(one.employeeId)
      if (list === undefined) found.set(one.employeeId, [one])
      else list.push(one)
    }
    for (const list of found.values()) list.sort((one, other) => other.at - one.at)
    return found
  }, [everyone])
  return (id) => byEmployee.get(id) ?? NO_TASKS
}

export function taskCounts(tasks: readonly ChatSession[]): ReadonlyMap<BoardColumn['id'], number> {
  const counts = new Map<BoardColumn['id'], number>()
  for (const one of tasks) counts.set(columnOf(one.status).id, (counts.get(columnOf(one.status).id) ?? 0) + 1)
  return counts
}

export function TaskSummary({ tasks, shortcuts }: { readonly tasks: readonly ChatSession[]; readonly shortcuts?: number | undefined }): React.JSX.Element {
  const counts = taskCounts(tasks)
  const working = tasks.filter((one) => one.state === 'working').length
  return <span className="employee-summary">
    {working === 0 ? null : <span className="employee-live">{working} working</span>}
    {tasks.length === 0 ? <span>No tasks yet</span> : TASK_COLUMNS.flatMap((id) => id === 'done' || id === 'archived' || (counts.get(id) ?? 0) === 0 ? [] : [<span key={id}>{counts.get(id)} {titleOf(id).toLowerCase()}</span>])}
    {shortcuts === undefined || shortcuts === 0 ? null : <span>{shortcuts} {shortcuts === 1 ? 'shortcut' : 'shortcuts'}</span>}
  </span>
}

export function EmployeeTasks({ tasks, settings, onOpen }: { readonly tasks: readonly ChatSession[]; readonly settings: Pick<Settings, 'projectColors'>; readonly onOpen?: ((id: ChatSession['id']) => void) | undefined }): React.JSX.Element {
  const [column, setColumn] = useState<BoardColumn['id'] | ''>('')
  const [now] = useState(() => Date.now())
  const counts = useMemo(() => taskCounts(tasks), [tasks])
  const latest = useRef(onOpen)
  useEffect(() => { latest.current = onOpen })
  const open = useCallback((id: ChatSession['id']): void => latest.current?.(id), [])
  const ordered = useMemo(() => column === '' ? TASK_COLUMNS.flatMap((id) => tasks.filter((one) => columnOf(one.status).id === id)) : tasks.filter((one) => columnOf(one.status).id === column), [tasks, column])
  return <section className="employee-tasks" aria-label="Tasks">
    <div className="employee-section-head"><h3>Tasks</h3>{tasks.length === 0 ? null : <span className="employee-count">{tasks.length}</span>}</div>
    {tasks.length === 0 ? <p className="employee-empty">No tasks yet. Pick this employee in New task.</p> : <>
      <div className="employee-segments" role="group" aria-label="Show tasks">
        <button type="button" aria-pressed={column === ''} className={column === '' ? 'on' : ''} onClick={() => setColumn('')}>All<span>{tasks.length}</span></button>
        {TASK_COLUMNS.flatMap((id) => (counts.get(id) ?? 0) === 0 ? [] : [<button key={id} type="button" aria-pressed={column === id} className={column === id ? 'on' : ''} onClick={() => setColumn(id)}>{titleOf(id)}<span>{counts.get(id)}</span></button>])}
      </div>
      <ul className="employee-task-list">{ordered.map((one) => <EmployeeTask key={one.id} task={one} now={now} color={projectColor(homeOf(one), settings)} onOpen={onOpen === undefined ? undefined : open} />)}</ul>
    </>}
  </section>
}

const EmployeeTask = memo(function EmployeeTask({ task, now, color, onOpen }: { readonly task: ChatSession; readonly now: number; readonly color: number; readonly onOpen?: ((id: ChatSession['id']) => void) | undefined }): React.JSX.Element {
  const column = columnOf(task.status).id
  const working = task.state === 'working'
  const icon = working ? 'spinner' : task.status === 'blocked' ? 'blocked' : column === 'progress' ? 'chat' : column
  const body = <>
    <span className={`employee-task-icon ${working ? 'working' : column}`}><Icon name={icon} size={12} /></span>
    <span className="employee-task-words"><strong>{task.title || 'Untitled'}</strong><span><span className="tinted" style={tint(color)}>{projectLabel(task.root)}</span>{working ? ' · Working' : task.status === 'blocked' ? ' · Blocked' : ''}</span></span>
    <time className="employee-task-time" dateTime={new Date(task.at).toISOString()} title={stamp(task.at, now)}>{ago(task.at, now)}</time>
  </>
  return <li>{onOpen === undefined ? <div className="employee-task">{body}</div> : <button type="button" className="employee-task" onClick={() => onOpen(task.id)}>{body}<Icon name="right" size={11} /></button>}</li>
})

export function EmployeeConversations({ employee }: { readonly employee: Employee }): React.JSX.Element {
  const [memory, setMemory] = useState<EmployeeMemory>()
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const [reading, setReading] = useState(false)
  const [search, setSearch] = useState('')
  const busy = useRef(false)
  const read = (next = false): void => {
    if (busy.current) return
    busy.current = true
    setReading(true)
    setLoading(true)
    setError(false)
    void window.geckit.employees.memory(employee.id, next ? memory?.next : undefined).then((page) => {
      setMemory((held) => {
        if (!next || held === undefined) return page
        return continuedMemory(held, page)
      })
    }).catch(() => setError(true)).finally(() => { busy.current = false; setLoading(false) })
  }
  const conversations = memory?.conversations.filter((one) => `${one.session.title} ${one.session.root}`.toLowerCase().includes(search.toLowerCase())) ?? []
  return <section className="employee-memory" aria-label="Conversations" aria-busy={loading}>
    <div className="employee-section-head">
      <span><h3>Conversations</h3><p className="employee-note">What the assistant can read back from earlier tasks</p></span>
      <button type="button" className="quiet" disabled={loading} onClick={() => read()}>{loading ? 'Reading conversations...' : reading ? error || memory?.availability === 'unavailable' ? 'Retry' : 'Refresh conversations' : 'Conversations'}</button>
    </div>
    {!reading ? null : <>
      {error || memory?.availability === 'unavailable' ? <p className="employee-alert" role="alert">Conversations are unavailable. Try again.</p> : null}
      {memory?.availability === 'partial' ? <p className="employee-note" role="status">Some conversations are unavailable</p> : null}
      {memory === undefined ? null : memory.conversations.length === 0 && memory.availability !== 'unavailable' ? <p className="employee-empty">No conversations yet</p> : <>
        <input className="employee-search" type="search" aria-label="Search conversations" placeholder="Search conversations" value={search} onChange={(event) => setSearch(event.target.value)} />
        {conversations.map((source) => <MemorySource key={source.session.id} source={source} />)}
        {memory.next === undefined ? null : <button type="button" className="quiet" disabled={loading} onClick={() => read(true)}>{loading ? 'Reading conversations...' : 'Load more'}</button>}
      </>}
    </>}
  </section>
}

export function EmployeeDetail({ employee, onClose, chat, onOpen }: { readonly employee: Employee; readonly onClose: () => void; readonly chat?: EmployeeWorkChat | undefined; readonly onOpen?: ((id: ChatSession['id']) => void) | undefined }): React.JSX.Element {
  const dialog = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  const tasks = useMemo(() => chat === undefined ? undefined : employeeTasks(chat.everyone, employee.id), [chat, employee.id])
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    if (ON_PHONE) return
    const opener = document.activeElement
    dialog.current?.querySelector<HTMLElement>('button')?.focus()
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); close.current() }
      if (event.key !== 'Tab') return
      const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, summary') ?? [])]
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1)?.focus() }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0]?.focus() }
    }
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('keydown', key, true); if (opener instanceof HTMLElement && opener.isConnected) opener.focus() }
  }, [])
  const shortcuts = chat === undefined ? [] : chat.settings.shortcuts.filter((one) => one.employeeId === employee.id)
  const content = <div className="employee-detail-content">
    <header className="employee-hero">
      <EmployeeAvatar employee={employee} size="hero" />
      <span className="employee-hero-words">
        <h2>{employee.name}</h2>
        <span className="employee-hero-role">{employee.role === '' ? 'No role' : employee.role}{employee.archived ? <span className="employee-pill">Archived</span> : null}</span>
        {tasks === undefined ? null : <TaskSummary tasks={tasks} shortcuts={shortcuts.length} />}
      </span>
      {ON_PHONE ? null : <button type="button" className="icon-button employee-close" aria-label="Close" title="Close" onClick={onClose}><Icon name="close" size={12} /></button>}
    </header>
    {employee.description === '' ? null : <p className="employee-description">{employee.description}</p>}
    {chat === undefined || shortcuts.length === 0 ? null : <EmployeeShortcutsRead shortcuts={shortcuts} chat={chat} archived={employee.archived} />}
    {tasks === undefined || chat === undefined ? null : <EmployeeTasks tasks={tasks} settings={chat.settings} onOpen={onOpen} />}
    <EmployeeConversations employee={employee} />
  </div>
  return ON_PHONE ? <Sheet title="View employee" onClose={onClose}>{content}</Sheet> : createPortal(<div className="dialog-scrim" onMouseDown={onClose}><div ref={dialog} className="dialog employee-detail" role="dialog" aria-modal="true" aria-label="View employee" onMouseDown={(event) => event.stopPropagation()}>{content}</div></div>, document.body)
}

const MemorySource = memo(function MemorySource({ source }: { readonly source: EmployeeConversation }): React.JSX.Element {
  const [now] = useState(() => Date.now())
  return <details className="employee-source"><summary><strong>{source.session.title || 'Untitled'}</strong><span>{projectLabel(source.session.root)} · {stamp(source.session.at, now)}{source.hidden ? ' · Hidden' : ''}{source.session.status === undefined ? '' : ` · ${source.session.status}`}</span></summary>
    <div className="employee-source-path">{homePath(source.session.root)}</div>
    {source.unavailable === undefined ? null : <p className="employee-note">{source.unavailable}</p>}
    {source.items.map((item, index) => <div className={`employee-source-message ${item.kind}`} key={`${item.id}:${index}`}><strong>{item.kind === 'mine' ? 'You' : 'Assistant'}</strong><p>{item.text}</p></div>)}
    {source.more ? <p className="employee-note">More of this conversation is available with Load more.</p> : null}
  </details>
})
