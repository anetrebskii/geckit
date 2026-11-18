import { useEffect, useRef, useState } from 'react'

import type { ChecklistItem, TaskChecklist } from '../../../shared/checklists'
import { checklistDone, checklistProgress, currentItem, itemCondition, newItem } from '../../../shared/checklists'
import { ON_PHONE } from '../on-phone'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { Cell, FullSheet } from './PhoneKit'
import { ChecklistItems, ChecklistNotes } from './ChecklistField'

/** A task's checklist as the chat shows it: its own, or its plain goal as one item. */
export function shownChecklist(checklist: TaskChecklist | undefined, goal: string | undefined, met: string | undefined): TaskChecklist {
  if (checklist !== undefined) return checklist
  const condition = (goal ?? met ?? '').trim()
  return condition === '' ? { items: [] } : { items: [{ ...newItem(condition), id: 'goal', ...(goal === undefined ? { state: 'passed' as const } : {}) }] }
}

/** What the composer's control says about a task's checklist. */
export function checklistLabel(checklist: TaskChecklist): string {
  const { passed, all } = checklistProgress(checklist)
  if (all === 0) return 'Checklist'
  const count = `${String(passed)}/${String(all)}`
  if (checklistDone(checklist)) return `${count} · Done`
  const now = currentItem(checklist)
  return now?.state === 'approval' ? `${count} · Approve: ${now.title}` : `${count} · ${now?.title ?? ''}`
}

const plain = (list: readonly ChecklistItem[]): string => JSON.stringify(list.filter((one) => one.title.trim() !== '').map(({ state: _state, ...one }) => ({ ...one, title: one.title.trim() })))

/** How long an edit rests before it is saved: a pause in typing, not each key. */
const SAVE_AFTER = 600

/** The task's checklist, ticked as goals are met and edited by the person. Every change saves itself; ticks that land meanwhile are kept, and an edit made elsewhere shows when nothing here is waiting to save. */
export function TaskChecklistEditor({ checklist, goal, personItem, onSave, onClear, onClose, panel = false }: {
  readonly checklist: TaskChecklist
  /** The conversation's goal now, so the item it was set from stands out. */
  readonly goal?: string | undefined
  /** The person's item being worked, the goal though none is set. */
  readonly personItem?: string | undefined
  /** `typing` while an item is still being typed: saved, but not made the goal yet. */
  readonly onSave: (checklist: TaskChecklist, typing: boolean) => void
  readonly onClear: () => void
  readonly onClose: () => void
  /** Beside the conversation on the desktop, shown and hidden from the header. */
  readonly panel?: boolean
}): React.JSX.Element {
  const [items, setItems] = useState<readonly ChecklistItem[]>(() => (checklist.items.length === 0 ? [newItem()] : checklist.items))
  const [ticked, setTicked] = useState<ReadonlyMap<string, boolean>>(new Map())
  const [waiting, setWaiting] = useState(false)
  const [seen, setSeen] = useState(checklist)
  const [focus, setFocus] = useState<string | undefined>()
  const [more, setMore] = useState<DOMRect | undefined>()
  const [clearing, setClearing] = useState(false)
  const typing = useRef(false)
  const held = useRef(false)
  if (seen !== checklist) {
    setSeen(checklist)
    setTicked((was) => (was.size === 0 ? was : new Map([...was].filter(([id, passed]) => (checklist.items.find((one) => one.id === id)?.state === 'passed') !== passed))))
    if (!waiting && plain(items) !== plain(checklist.items)) setItems(checklist.items.length === 0 ? [newItem()] : checklist.items)
  }
  useEffect(() => {
    if (ON_PHONE || panel) return
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [onClose, panel])
  const latest = new Map(checklist.items.map((one) => [one.id, one.state]))
  const merged: readonly ChecklistItem[] = items.map((one) => {
    const mine = ticked.get(one.id)
    const state = mine === undefined ? latest.get(one.id) ?? one.state : mine ? 'passed' : undefined
    const { state: _state, ...rest } = one
    return state === undefined ? rest : { ...rest, state }
  })
  const draft: TaskChecklist = { ...checklist, items: merged }
  const now = currentItem(draft)
  const ready = merged.some((one) => one.title.trim() !== '')
  const pending = useRef({ draft, ready, waiting, onSave })
  useEffect(() => {
    pending.current = { draft, ready, waiting, onSave }
  })
  useEffect(() => {
    if (!waiting) return
    const timer = setTimeout(() => {
      const { draft: next, ready: some, onSave: save } = pending.current
      if (some) {
        save(next, typing.current)
        held.current = typing.current
      }
      setWaiting(false)
    }, SAVE_AFTER)
    return () => clearTimeout(timer)
  }, [waiting, items, ticked])
  useEffect(() => () => {
    const { draft: next, ready: some, waiting: unsaved, onSave: save } = pending.current
    if ((unsaved || held.current) && some) save(next, false)
  }, [])
  const field = (target: EventTarget | null): boolean => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
  const typed = (event: React.FocusEvent): void => {
    if (!field(event.target) || (field(event.relatedTarget) && event.currentTarget.contains(event.relatedTarget as Node))) return
    typing.current = false
    const { draft: next, ready: some, waiting: unsaved } = pending.current
    if (!unsaved && !held.current) return
    held.current = false
    setWaiting(false)
    if (some) onSave(next, false)
  }
  const edit = (next: readonly ChecklistItem[]): void => {
    setItems(next)
    setWaiting(true)
  }
  const add = (): void => {
    const added = newItem()
    setFocus(added.id)
    setItems((was) => [...was, added])
  }
  const clear = (): void => {
    setItems([newItem()])
    setTicked(new Map())
    setWaiting(false)
    onClear()
  }
  const body = (
    <>
      <div className="task-checklist-items" onFocus={(event) => { if (field(event.target)) typing.current = true }} onBlur={typed}>
        <ChecklistItems
          items={merged}
          current={now?.id}
          active={now !== undefined && (now.check === 'person' ? now.state === undefined && personItem === now.id : goal !== undefined && itemCondition(now) === goal.trim())}
          focus={focus}
          onChange={edit}
          onTick={(id, passed) => {
            setTicked((was) => new Map(was).set(id, passed))
            setWaiting(true)
          }}
        />
      </div>
      <button type="button" className="shortcut-add-goal checklist-add" onClick={add}>
        <Icon name="plus" size={11} />
        Add an item
      </button>
      <ChecklistNotes checklist={draft} />
      <p className="checklist-hint task-checklist-hint">Changes save as you make them. Each item becomes the goal in turn; when its goal is met, GeckIt ticks it and sets the next.</p>
    </>
  )
  const { passed, all } = checklistProgress(draft)
  const title = checklist.from === undefined ? 'Checklist' : `Checklist: ${checklist.from.name}`
  const clearButton = checklist.items.length === 0 ? null : <button type="button" className="quiet danger" onClick={clear}>Clear checklist</button>
  if (panel) return (
    <aside className="task-checklist-panel" aria-label={title}>
      <header className="task-checklist-panel-head">
        <div className="task-checklist-panel-title">
          <h3>{title}</h3>
          {all === 0 ? null : <span>{checklistDone(draft) ? 'All done' : `${String(passed)} of ${String(all)} done`}</span>}
        </div>
        {checklist.items.length === 0 ? null : (
          <button type="button" className="icon-button" aria-label="Checklist actions" aria-haspopup="menu" title="More" onClick={(event) => setMore(event.currentTarget.getBoundingClientRect())}>
            <Icon name="more" size={14} />
          </button>
        )}
      </header>
      <div className="task-checklist-body">{body}</div>
      {more === undefined ? null : <Menu anchor={more} choices={[{ value: 'clear', label: 'Clear Checklist…', danger: true }]} onPick={() => setClearing(true)} onClose={() => setMore(undefined)} />}
      {clearing ? (
        <div className="dialog-scrim" onMouseDown={() => setClearing(false)}>
          <div className="dialog" role="alertdialog" aria-label="Clear this checklist?" onMouseDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape') setClearing(false) }}>
            <h2>Clear this checklist?</h2>
            <p className="add-host-lead">Every item and tick is removed from this task, and its goal is no longer set from the checklist.</p>
            <div className="dialog-actions">
              <button type="button" className="quiet" autoFocus onClick={() => setClearing(false)}>Cancel</button>
              <button type="button" className="primary danger" onClick={() => { setClearing(false); clear() }}>Clear</button>
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  )
  if (ON_PHONE) return (
    <FullSheet title={title} saved onClose={onClose}>
      <div className="task-checklist-phone">
        {all === 0 ? null : <div className="phone-head">{checklistDone(draft) ? 'All done' : `${String(passed)} of ${String(all)} done`}</div>}
        {body}
        {checklist.items.length === 0 ? null : (
          <div className="phone-group"><Cell label="Clear Checklist" danger onPress={() => setClearing(true)} /></div>
        )}
      </div>
      {clearing ? <Menu anchor={new DOMRect()} title="Clear this checklist?" choices={[{ value: 'clear', label: 'Clear Checklist', says: 'Every item and tick is removed from this task.', danger: true }]} onPick={clear} onClose={() => setClearing(false)} /> : null}
    </FullSheet>
  )
  return (
    <div className="dialog-scrim" onMouseDown={onClose}>
      <div className="dialog task-checklist-editor" role="dialog" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <h2>{title}</h2>
        <div className="task-checklist-body">{body}</div>
        <div className="dialog-actions">
          {clearButton}
          <span className="spacer" />
          <button type="button" className="primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}
