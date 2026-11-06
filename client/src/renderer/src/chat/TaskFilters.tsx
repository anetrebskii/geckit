import { useEffect, useMemo, useRef, useState } from 'react'
import { BOARD_COLUMNS, columnShown, toggledColumns } from '../../../shared/api'
import { EmployeeSelectMenu } from '../employees/Employees'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { MOD } from '../ui/Shortcuts'
import { chosenName, ProjectMenu } from './Projects'
import type { Chat } from './useChat'

export function TaskFilters({ chat }: { readonly chat: Chat }): React.JSX.Element {
  const button = useRef<HTMLButtonElement>(null)
  const [anchor, setAnchor] = useState<DOMRect>()
  const [page, setPage] = useState<'filters' | 'folders' | 'employees' | 'columns'>('filters')
  const assigned = useMemo(() => new Set(chat.everyone.flatMap((one) => one.employeeId === undefined ? [] : [one.employeeId])), [chat.everyone])
  const employees = useMemo(() => chat.employees.filter((one) => !one.archived || assigned.has(one.id)), [chat.employees, assigned])
  const shown = BOARD_COLUMNS.filter((one) => columnShown(chat.settings.boardColumns, one.id))
  const every = shown.length === BOARD_COLUMNS.length
  const employee = chat.settings.employeeFilter === '' ? 'All employees' : chat.settings.employeeFilter === 'unassigned' ? 'Unassigned' : chat.employeesById.get(chat.settings.employeeFilter)?.name ?? 'Employee unavailable'
  const folders = chosenName(chat)
  const columns = every ? 'All columns' : shown.map((one) => one.title).join(', ')
  const filtered = chat.chosen.length > 0 || chat.settings.employeeFilter !== ''
  const active = filtered || (chat.settings.chatView === 'board' && !every)
  const summary = [folders, employee, ...(chat.settings.chatView === 'board' ? [columns] : [])].join(' · ')
  const close = (): void => {
    setAnchor(undefined)
    requestAnimationFrame(() => { if (document.activeElement === document.body) button.current?.focus() })
  }
  useEffect(() => {
    const folders = (): void => { setPage('folders'); setAnchor(button.current?.getBoundingClientRect()) }
    window.addEventListener('geckit:folders', folders)
    return () => window.removeEventListener('geckit:folders', folders)
  }, [])
  return <>
    <button ref={button} type="button" className={`icon-button task-filters board-view-options no-drag${anchor === undefined ? '' : ' on'}`} aria-label={`Filters: ${summary}`} title={`Filters: ${summary} (${MOD}+K for folders)`} aria-haspopup="menu" aria-expanded={anchor !== undefined} onClick={(event) => { setPage('filters'); setAnchor(event.currentTarget.getBoundingClientRect()) }}>
      <Icon name="sliders" />
      {active ? <span className="board-view-dot" aria-hidden="true" /> : null}
    </button>
    <ProjectMenu chat={chat} anchor={page === 'folders' ? anchor : undefined} onClose={close} />
    {anchor === undefined || page === 'folders' ? null : page === 'employees' ? <EmployeeSelectMenu employees={employees} value={chat.settings.employeeFilter} filter anchor={anchor} onPick={(employeeFilter) => chat.change({ employeeFilter })} onClose={close} /> : page === 'columns' ? <Menu anchor={anchor} title="Visible columns" autoFocus stays
      choices={[{ value: 'all', label: 'All columns', on: every }, ...BOARD_COLUMNS.map((one) => ({ value: one.id, label: one.title, on: shown.includes(one) }))]}
      onPick={(value) => chat.change({ boardColumns: toggledColumns(chat.settings.boardColumns, value) })} onClose={close} /> : <Menu anchor={anchor} title="Filters" explained autoFocus
      choices={[
        { value: 'folders', icon: 'folder', label: 'Folders', says: folders },
        { value: 'employees', label: 'Employees', says: employee },
        ...(chat.settings.chatView === 'board' ? [{ value: 'columns', icon: 'sliders', label: 'Visible columns', says: columns }] : []),
        ...(filtered ? [{ value: 'clear', icon: 'close', label: 'Clear filters' }] : []),
      ]}
      onPick={(value) => {
        if (value === 'clear') { chat.choose([]); chat.change({ employeeFilter: '' }); close() }
        else if (value === 'folders' || value === 'employees' || value === 'columns') setPage(value)
      }} onClose={close} stays />}
  </>
}
