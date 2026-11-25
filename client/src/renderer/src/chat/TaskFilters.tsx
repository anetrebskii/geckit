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
  const [page, setPage] = useState<'filters' | 'folders' | 'employees' | 'columns' | 'tags'>('filters')
  const assigned = useMemo(() => new Set(chat.everyone.flatMap((one) => one.employeeId === undefined ? [] : [one.employeeId])), [chat.everyone])
  const employees = useMemo(() => chat.employees.filter((one) => !one.archived || assigned.has(one.id)), [chat.employees, assigned])
  const shown = BOARD_COLUMNS.filter((one) => columnShown(chat.settings.boardColumns, one.id))
  const every = shown.length === BOARD_COLUMNS.length
  const employee = chat.settings.employeeFilter === '' ? 'All employees' : chat.settings.employeeFilter === 'unassigned' ? 'Unassigned' : chat.employeesById.get(chat.settings.employeeFilter)?.name ?? 'Employee unavailable'
  const folders = chosenName(chat)
  const columns = every ? 'All columns' : shown.map((one) => one.title).join(', ')
  const tagFilter = chat.settings.tagFilter
  const tags = tagSummary(chat.settings)
  const filtered = chat.chosen.length > 0 || chat.settings.employeeFilter !== '' || tagFilter.length > 0
  const active = filtered || (chat.settings.chatView === 'board' && !every)
  const summary = [folders, employee, ...(chat.settings.taskTags.length === 0 ? [] : [tags]), ...(chat.settings.chatView === 'board' ? [columns] : [])].join(' · ')
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
      onPick={(value) => chat.change({ boardColumns: toggledColumns(chat.settings.boardColumns, value) })} onClose={close} /> : page === 'tags' ? <Menu anchor={anchor} title="Tags" autoFocus stays
      choices={tagChoices(chat.settings)}
      onPick={(value) => chat.change({ tagFilter: pickedTags(tagFilter, value) })} onClose={close} /> : <Menu anchor={anchor} title="Filters" explained autoFocus
      choices={[
        { value: 'folders', icon: 'folder', label: 'Folders', says: folders },
        { value: 'employees', label: 'Employees', says: employee },
        ...(chat.settings.taskTags.length === 0 ? [] : [{ value: 'tags', icon: 'tag', label: 'Tags', says: tags }]),
        ...(chat.settings.chatView === 'board' ? [{ value: 'columns', icon: 'sliders', label: 'Visible columns', says: columns }] : []),
        ...(filtered ? [{ value: 'clear', icon: 'close', label: 'Clear filters' }] : []),
      ]}
      onPick={(value) => {
        if (value === 'clear') { chat.choose([]); chat.change({ employeeFilter: '', tagFilter: [] }); close() }
        else if (value === 'folders' || value === 'employees' || value === 'columns' || value === 'tags') setPage(value)
      }} onClose={close} stays />}
  </>
}

type TagSettings = Pick<Chat['settings'], 'taskTags' | 'tagFilter'>

const tagSummary = ({ taskTags, tagFilter }: TagSettings): string =>
  tagFilter.length === 0 ? 'All tags' : tagFilter.includes('none') ? 'No tags' : taskTags.filter((one) => tagFilter.includes(one.id)).map((one) => one.name).join(', ')

const tagChoices = ({ taskTags, tagFilter }: TagSettings): { readonly value: string; readonly label: string; readonly on: boolean }[] => [
  { value: 'all', label: 'All tags', on: tagFilter.length === 0 },
  { value: 'none', label: 'No tags', on: tagFilter.includes('none') },
  ...taskTags.map((one) => ({ value: one.id, label: one.name, on: tagFilter.includes(one.id) })),
]

/** "All tags" clears, "No tags" stands alone, and a tag is added to or taken from the ones chosen. */
const pickedTags = (filter: readonly string[], value: string): readonly string[] =>
  value === 'all' ? [] : value === 'none' ? (filter.includes('none') ? [] : ['none']) : filter.includes(value) ? filter.filter((one) => one !== value) : [...filter.filter((one) => one !== 'none'), value]

/** The phone's tag filter beside its employee filter, shown once there is a tag. */
export function TagFilter({ chat }: { readonly chat: Pick<Chat, 'settings' | 'change'> }): React.JSX.Element | null {
  const [anchor, setAnchor] = useState<DOMRect>()
  if (chat.settings.taskTags.length === 0 && chat.settings.tagFilter.length === 0) return null
  const on = chat.settings.tagFilter.length > 0
  return <>
    <button type="button" className={`phone-scope employee-chip${on ? ' on' : ''}`} aria-label={`Tags: ${tagSummary(chat.settings)}`} aria-haspopup="menu" aria-expanded={anchor !== undefined} onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}>
      <Icon name="tag" size={12} />
      {on ? <span className="employee-chip-name">{tagSummary(chat.settings)}</span> : null}
      <Icon name="down" size={11} />
    </button>
    {anchor === undefined ? null : <Menu anchor={anchor} title="Tags" stays choices={tagChoices(chat.settings)} onPick={(value) => chat.change({ tagFilter: pickedTags(chat.settings.tagFilter, value) })} onClose={() => setAnchor(undefined)} />}
  </>
}
