import { useEffect, useId, useRef, useState } from 'react'

import type { Checklist, ChecklistCheck, ChecklistItem, TaskChecklist } from '../../../shared/checklists'
import { CHECK_LABELS, CHECKLIST_HINT_AT, CHECKLIST_WARN_AT, checklistGoal, checklistsFor, copyChecklist, newItem } from '../../../shared/checklists'
import { Icon } from '../ui/Icon'
import { Menu, Picker } from '../ui/Menu'
import { ON_PHONE } from '../on-phone'
import type { Choice } from '../ui/Menu'

const CHECKS: readonly ChecklistCheck[] = ['none', 'command', 'review', 'person']

const CHECK_HINT: Readonly<Record<ChecklistCheck, string>> = {
  none: 'The assistant says when it holds',
  command: 'Passes when this exits with 0',
  review: 'Another model reads the conversation and decides',
  person: 'Waits for you to approve',
}

/** The items of a checklist, edited in place: Enter adds the next, Backspace on an empty one removes it, Alt+Up and Alt+Down move it. */
export function ChecklistItems({ items, onChange, disabled = false, focus, current, active = false, onTick }: {
  readonly items: readonly ChecklistItem[]
  readonly onChange: (items: readonly ChecklistItem[]) => void
  readonly disabled?: boolean
  /** An item to put the caret in once: one just added from outside. */
  readonly focus?: string | undefined
  /** In a running task: the item worked on now, and each row gets a box to tick it by hand. */
  readonly current?: string | undefined
  /** The current item is the conversation's goal right now, not only the next one up. */
  readonly active?: boolean
  readonly onTick?: ((id: string, passed: boolean) => void) | undefined
}): React.JSX.Element {
  const [open, setOpen] = useState<string | undefined>()
  const [dragged, setDragged] = useState<number | undefined>()
  const [over, setOver] = useState<number | undefined>()
  const focusId = useRef<string | undefined>(undefined)
  const fields = useRef(new Map<string, HTMLInputElement>())
  useEffect(() => {
    if (focus !== undefined) fields.current.get(focus)?.focus()
  }, [focus])
  useEffect(() => {
    const id = focusId.current
    if (id === undefined) return
    focusId.current = undefined
    fields.current.get(id)?.focus()
  })
  const update = (id: string, change: Partial<ChecklistItem>): void => onChange(items.map((one) => (one.id === id ? { ...one, ...change } : one)))
  const move = (from: number, to: number): void => {
    if (to < 0 || to >= items.length || from === to) return
    const next = [...items]
    const [taken] = next.splice(from, 1)
    if (taken === undefined) return
    next.splice(to, 0, taken)
    onChange(next)
  }
  const insertAfter = (at: number): void => {
    const added = newItem()
    focusId.current = added.id
    onChange([...items.slice(0, at + 1), added, ...items.slice(at + 1)])
  }
  const remove = (at: number): void => {
    const previous = items[at - 1] ?? items[at + 1]
    focusId.current = previous?.id
    onChange(items.filter((_one, index) => index !== at))
  }

  return (
    <ol className="checklist-items" aria-label="Checklist items">
      {items.map((item, at) => {
        const expanded = open === item.id
        const detailsId = `checklist-details-${item.id}`
        // Reminders shows only an info button on a row; the check it names is read in the details.
        const bare = ON_PHONE || (item.check === 'none' && (item.description ?? '').trim() === '')
        return (
          <li
            key={item.id}
            className={`checklist-item${expanded ? ' open' : ''}${item.state === 'passed' ? ' passed' : ''}${current === item.id ? (active ? ' current goal' : ' current') : ''}${dragged === at ? ' dragged' : ''}${over === at && dragged !== undefined && dragged !== at ? (dragged < at ? ' drop-after' : ' drop-before') : ''}`}
            onDragOver={(event) => {
              if (dragged === undefined) return
              event.preventDefault()
              setOver(at)
            }}
            onDrop={(event) => {
              event.preventDefault()
              if (dragged !== undefined) move(dragged, at)
              setDragged(undefined)
              setOver(undefined)
            }}
          >
            <div className="checklist-row">
              {onTick === undefined ? null : (
                <input
                  type="checkbox"
                  className="checklist-tick"
                  checked={item.state === 'passed'}
                  disabled={disabled || item.title.trim() === ''}
                  aria-label={`${item.state === 'passed' ? 'Passed' : 'Not passed'}: ${item.title || `item ${String(at + 1)}`}`}
                  onChange={(event) => onTick(item.id, event.target.checked)}
                />
              )}
              <span
                className="checklist-handle"
                draggable={!disabled}
                title="Drag to reorder, or Alt+Up and Alt+Down"
                aria-hidden="true"
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  setDragged(at)
                }}
                onDragEnd={() => {
                  setDragged(undefined)
                  setOver(undefined)
                }}
              >
                {at + 1}
              </span>
              <input
                ref={(node) => {
                  if (node === null) fields.current.delete(item.id)
                  else fields.current.set(item.id, node)
                }}
                className="checklist-title"
                value={item.title}
                disabled={disabled}
                placeholder="What is true when this step is done"
                aria-label={`Item ${String(at + 1)}`}
                onChange={(event) => update(item.id, { title: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.nativeEvent.isComposing) {
                    event.preventDefault()
                    insertAfter(at)
                  } else if (event.key === 'Backspace' && item.title === '' && items.length > 1) {
                    event.preventDefault()
                    remove(at)
                  } else if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                    event.preventDefault()
                    focusId.current = item.id
                    move(at, event.key === 'ArrowUp' ? at - 1 : at + 1)
                  }
                }}
              />
              {item.state === 'approval' && onTick !== undefined ? (
                <button type="button" className="checklist-approve" disabled={disabled} onClick={() => onTick(item.id, true)}>
                  Approve
                </button>
              ) : current === item.id && onTick !== undefined ? <span className={`checklist-now${active ? ' goal' : ''}`}>{active ? 'Goal' : 'Next'}</span> : null}
              <button
                type="button"
                className={`checklist-check${item.check === 'none' ? '' : ' set'}${bare ? ' bare' : ''}${expanded ? ' on' : ''}`}
                aria-label={bare ? (expanded ? 'Hide details' : 'Details') : undefined}
                aria-expanded={expanded}
                aria-controls={detailsId}
                disabled={disabled}
                title={expanded ? 'Hide details' : 'Description and check'}
                onClick={() => setOpen(expanded ? undefined : item.id)}
              >
                {bare ? <Icon name="info" size={ON_PHONE ? 22 : 15} /> : (
                  <>
                    {item.check === 'none' ? 'Described' : CHECK_LABELS[item.check]}
                    {item.final === true && item.check !== 'person' ? <Icon name="refresh" size={10} /> : null}
                    <Icon name={expanded ? 'up' : 'down'} size={10} />
                  </>
                )}
              </button>
              {ON_PHONE ? null : <button type="button" className="icon-button checklist-remove" aria-label={`Remove item ${String(at + 1)}`} title="Remove" disabled={disabled} onClick={() => remove(at)}>
                <Icon name="close" size={11} />
              </button>}
            </div>
            {expanded ? <ItemDetails id={detailsId} item={item} alone={items.filter((one) => one.title.trim() !== '').length < 2} disabled={disabled} onChange={(change) => update(item.id, change)} onUp={at === 0 ? undefined : () => move(at, at - 1)} onDown={at === items.length - 1 ? undefined : () => move(at, at + 1)} onRemove={() => { setOpen(undefined); remove(at) }} /> : null}
          </li>
        )
      })}
    </ol>
  )
}

function ItemDetails({ id, item, alone, disabled, onChange, onUp, onDown, onRemove }: {
  readonly id: string
  readonly item: ChecklistItem
  /** No other item yet, so nothing comes after this one to break it. */
  readonly alone: boolean
  readonly disabled: boolean
  readonly onChange: (change: Partial<ChecklistItem>) => void
  readonly onUp: (() => void) | undefined
  readonly onDown: (() => void) | undefined
  readonly onRemove: () => void
}): React.JSX.Element {
  const base = useId()
  return (
    <div id={id} className="checklist-details">
      <textarea
        className="checklist-description"
        rows={2}
        value={item.description ?? ''}
        disabled={disabled}
        placeholder="How to prove it, and what must not change"
        aria-label="Description"
        onChange={(event) => onChange({ description: event.target.value })}
      />
      <div className="checklist-settings">
        <div className="checklist-setting">
          <span id={`${base}-check`}>Check</span>
          <Picker
            className="picker checklist-check-picker"
            label={CHECK_LABELS[item.check]}
            title="Check"
            choices={CHECKS.map((one) => ({ value: one, label: CHECK_LABELS[one], says: CHECK_HINT[one] }))}
            chosen={item.check}
            explained
            disabled={disabled}
            onPick={(value) => onChange({ check: value as ChecklistCheck })}
          />
        </div>
        {item.check === 'command' ? (
          <input
            className="checklist-command"
            value={item.command ?? ''}
            disabled={disabled}
            placeholder="npm test"
            aria-label="Command"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => onChange({ command: event.target.value })}
          />
        ) : null}
        {item.check === 'person' ? null : (
          <label className="checklist-setting">
            <span>Recheck after the last item</span>
            <input className="assistant-toggle" type="checkbox" role="switch" checked={item.final === true} disabled={disabled || alone} onChange={(event) => onChange({ final: event.target.checked || undefined })} />
          </label>
        )}
      </div>
      <span className="checklist-hint">{CHECK_HINT[item.check]}.{item.check === 'person' ? '' : alone ? ' Recheck needs a later item.' : ' Recheck: after the last item, the assistant confirms this still holds.'}</span>
      {ON_PHONE ? (
        <div className="checklist-settings">
          {onUp === undefined ? null : <button type="button" className="checklist-setting checklist-action" disabled={disabled} onClick={onUp}>Move Up</button>}
          {onDown === undefined ? null : <button type="button" className="checklist-setting checklist-action" disabled={disabled} onClick={onDown}>Move Down</button>}
          <button type="button" className="checklist-setting checklist-action danger" disabled={disabled} onClick={onRemove}>Delete Item</button>
        </div>
      ) : null}
    </div>
  )
}

/** Warnings under a checklist: too long for one goal, or so many items they are probably steps rather than results. */
export function ChecklistNotes({ checklist }: { readonly checklist: TaskChecklist }): React.JSX.Element | null {
  const long = checklistGoal(checklist).length > CHECKLIST_WARN_AT
  const many = checklist.items.filter((one) => one.title.trim() !== '').length > CHECKLIST_HINT_AT
  if (!long && !many) return null
  return (
    <div className="checklist-notes">
      {long ? <p className="checklist-warn" role="status">Long checklists may not fit in one goal. Shorten descriptions.</p> : null}
      {many ? <p className="checklist-hint" role="status">Long lists often mix steps with results. Each item should be one result.</p> : null}
    </div>
  )
}

/** The Checklist field of New task: empty, typed, or a copy of a saved checklist. */
export function ChecklistField({ checklists, root, value, onChange, onManage, disabled = false }: {
  readonly checklists: readonly Checklist[]
  readonly root: string
  readonly value: TaskChecklist
  readonly onChange: (value: TaskChecklist) => void
  readonly onManage?: (() => void) | undefined
  readonly disabled?: boolean
}): React.JSX.Element {
  const [menu, setMenu] = useState<DOMRect | undefined>()
  const [before, setBefore] = useState<TaskChecklist | undefined>()
  const [focusOn, setFocusOn] = useState<string | undefined>()
  const offered = checklistsFor(checklists, root)
  const saved = [...offered.folder, ...offered.shared]
  const edit = (next: TaskChecklist): void => {
    setBefore(undefined)
    onChange(next)
  }
  const choices: readonly Choice[] = [
    ...saved.map((one): Choice => ({
      value: one.id,
      label: one.name,
      says: `${String(one.items.length)} ${one.items.length === 1 ? 'item' : 'items'}${one.root === undefined ? '' : ', this folder'}${one.isDefault === true ? ', default' : ''}`,
    })),
    ...(onManage === undefined ? [] : [{ value: 'manage', label: 'Manage checklists...', icon: 'settings' }]),
  ]
  const pick = (id: string): void => {
    setMenu(undefined)
    if (id === 'manage') {
      onManage?.()
      return
    }
    const chosen = saved.find((one) => one.id === id)
    if (chosen === undefined) return
    setBefore(value.items.some((one) => one.title.trim() !== '') ? value : undefined)
    onChange(copyChecklist(chosen))
  }
  const openMenu = (event: React.MouseEvent<HTMLButtonElement>): void => {
    const box = event.currentTarget.getBoundingClientRect()
    setMenu((was) => (was === undefined ? box : undefined))
  }
  const add = (): void => {
    const added = newItem()
    setFocusOn(added.id)
    edit({ ...value, items: [...value.items, added] })
  }

  return (
    <div className="checklist-field">
      <div className="checklist-head">
        <span className="checklist-label">{value.from === undefined ? 'Checklist' : <>Checklist: <b>{value.from.name}</b></>}</span>
        {value.from === undefined ? (
          saved.length === 0 ? null : (
            <button type="button" className="checklist-link" aria-haspopup="menu" aria-expanded={menu !== undefined} disabled={disabled} onClick={openMenu}>
              Use a checklist
            </button>
          )
        ) : (
          <>
            {before === undefined ? null : (
              <button type="button" className="checklist-link" disabled={disabled} onClick={() => edit(before)}>
                Undo
              </button>
            )}
            <button type="button" className="checklist-link" aria-haspopup="menu" aria-expanded={menu !== undefined} disabled={disabled} onClick={openMenu}>
              Change
            </button>
            <button type="button" className="checklist-link" disabled={disabled} onClick={() => edit({ items: [] })}>
              Clear
            </button>
          </>
        )}
      </div>
      {value.items.length === 0 ? (
        <button type="button" className="shortcut-add-goal checklist-add" disabled={disabled} onClick={add}>
          <Icon name="plus" size={11} />
          Add an item
          <span>it keeps working until this holds</span>
        </button>
      ) : (
        <>
          <ChecklistItems key={value.from?.id ?? 'typed'} items={value.items} disabled={disabled} focus={focusOn} onChange={(items) => edit({ ...value, items })} />
          <button type="button" className="shortcut-add-goal checklist-add" disabled={disabled} onClick={add}>
            <Icon name="plus" size={11} />
            Add an item
          </button>
          <ChecklistNotes checklist={value} />
        </>
      )}
      {menu === undefined ? null : <Menu anchor={menu} choices={choices} explained autoFocus onPick={pick} onClose={() => setMenu(undefined)} />}
    </div>
  )
}
