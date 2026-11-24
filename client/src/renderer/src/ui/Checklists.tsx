import { useEffect, useId, useRef, useState } from 'react'

import type { Settings } from '../../../shared/api'
import { shownProjects } from '../../../shared/api'
import type { Checklist, ChecklistItem } from '../../../shared/checklists'
import { newItem } from '../../../shared/checklists'
import { ChecklistItems, ChecklistNotes } from '../chat/ChecklistField'
import { projectName } from '../chat/project'
import { Cell, FullSheet, Switch } from '../chat/PhoneKit'
import { Icon } from './Icon'
import { Menu } from './Menu'

interface Part {
  readonly settings: Settings
  readonly change: (change: Partial<Settings>) => void
}

const SHARED = ''

function ChecklistForm({ checklist, folders, onSave, onCancel, onDelete, askFirst = false, label }: {
  readonly checklist: Checklist
  readonly label?: string
  /** Opened from Delete in the row's menu: the question comes first. */
  readonly askFirst?: boolean
  readonly folders: readonly string[]
  readonly onSave: (checklist: Checklist) => void
  readonly onCancel: () => void
  readonly onDelete?: (() => void) | undefined
}): React.JSX.Element {
  const id = useId()
  const [name, setName] = useState(checklist.name)
  const [root, setRoot] = useState(checklist.root ?? SHARED)
  const [isDefault, setIsDefault] = useState(checklist.isDefault === true)
  const [items, setItems] = useState(checklist.items.length === 0 ? [newItem()] : checklist.items)
  const [asking, setAsking] = useState(askFirst)
  const first = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!askFirst) first.current?.focus() }, [askFirst])
  const ready = name.trim() !== '' && items.some((one) => one.title.trim() !== '')
  const save = (): void => {
    if (!ready) return
    onSave({
      id: checklist.id,
      name: name.trim(),
      ...(root === SHARED ? {} : { root }),
      ...(root !== SHARED && isDefault ? { isDefault: true } : {}),
      items: items.filter((one) => one.title.trim() !== '').map((one) => ({ ...one, title: one.title.trim() })),
    })
  }
  const places = checklist.root === undefined || folders.includes(checklist.root) ? folders : [...folders, checklist.root]

  return (
    <form
      className="browser-profiles-form checklist-form"
      aria-label={label ?? (checklist.name === '' ? 'New checklist' : `Edit ${checklist.name}`)}
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        if (asking) setAsking(false)
        else onCancel()
      }}
    >
      <label htmlFor={`${id}-name`}>Name</label>
      <div className="browser-profiles-field">
        <input ref={first} id={`${id}-name`} type="text" value={name} maxLength={80} placeholder="Feature flow" onChange={(event) => setName(event.target.value)} />
      </div>
      <label htmlFor={`${id}-root`}>Belongs to</label>
      <div className="browser-profiles-field">
        <select id={`${id}-root`} className="select checklist-root" value={root} onChange={(event) => setRoot(event.target.value)}>
          <option value={SHARED}>Shared</option>
          {places.map((one) => <option key={one} value={one}>{projectName(one)}</option>)}
        </select>
        <span className="browser-profiles-hint">{root === SHARED ? 'Offered in New task for every folder.' : `Offered in New task for ${projectName(root)} only.`}</span>
        {root === SHARED ? null : (
          <label className="checklist-final checklist-default">
            <input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
            Default for new tasks in this folder
          </label>
        )}
      </div>
      <span className="secret-form-label">Items</span>
      <div className="browser-profiles-field checklist-form-items">
        <ChecklistItems items={items} onChange={setItems} />
        <button type="button" className="shortcut-add-goal checklist-add" onClick={() => setItems((was) => [...was, newItem()])}>
          <Icon name="plus" size={11} />
          Add an item
        </button>
        <ChecklistNotes checklist={{ items }} />
        <span className="browser-profiles-hint">Each item is a result, in order. A task moves on to the next one only when this one holds.</span>
      </div>
      {asking ? (
        <div className="browser-profile-confirm browser-profiles-form-wide">
          <p>Delete {checklist.name}? Running tasks keep their copy.</p>
          <div className="browser-profile-confirm-actions">
            <button type="button" className="quiet" autoFocus onClick={() => setAsking(false)}>Cancel</button>
            <button type="button" className="primary danger" onClick={onDelete}>Delete</button>
          </div>
        </div>
      ) : (
        <div className="browser-profiles-form-actions browser-profiles-form-wide checklist-form-actions">
          {onDelete === undefined ? null : <button type="button" className="quiet checklist-delete" onClick={() => setAsking(true)}>Delete</button>}
          <button type="button" className="quiet" onClick={onCancel}>Cancel</button>
          <button type="submit" className="primary" disabled={!ready}>Save</button>
        </div>
      )}
    </form>
  )
}

/** On the phone, a checklist is written in a sheet of its own, as a shortcut is: Cancel and Save in its bar, the rows grouped, Delete at the foot. */
function ChecklistSheet({ checklist, folders, onSave, onCancel, onDelete, askFirst = false, title }: {
  readonly checklist: Checklist
  readonly title?: string
  readonly askFirst?: boolean
  readonly folders: readonly string[]
  readonly onSave: (checklist: Checklist) => void
  readonly onCancel: () => void
  readonly onDelete?: (() => void) | undefined
}): React.JSX.Element {
  const [name, setName] = useState(checklist.name)
  const [root, setRoot] = useState(checklist.root ?? SHARED)
  const [isDefault, setIsDefault] = useState(checklist.isDefault === true)
  const [items, setItems] = useState(checklist.items.length === 0 ? [newItem()] : checklist.items)
  const [picking, setPicking] = useState(false)
  const [asking, setAsking] = useState(askFirst)
  const fresh = checklist.name === '' || title !== undefined
  const ready = name.trim() !== '' && items.some((one) => one.title.trim() !== '')
  const places = checklist.root === undefined || folders.includes(checklist.root) ? folders : [...folders, checklist.root]
  const save = (): void => {
    if (!ready) return
    onSave({
      id: checklist.id,
      name: name.trim(),
      ...(root === SHARED ? {} : { root }),
      ...(root !== SHARED && isDefault ? { isDefault: true } : {}),
      items: items.filter((one) => one.title.trim() !== '').map((one) => ({ ...one, title: one.title.trim() })),
    })
  }
  return (
    <FullSheet title={title ?? (fresh ? 'New checklist' : checklist.name)} action="Save" ready={ready} onAction={save} onClose={onCancel}>
      <div className="phone-task-label">Name</div>
      <input className="phone-task-goal" autoFocus={fresh} aria-label="Name" value={name} maxLength={80} placeholder="Feature flow" onChange={(event) => setName(event.target.value)} />
      <div className="phone-group phone-form-group">
        <Cell label="Belongs to" value={root === SHARED ? 'Shared' : projectName(root)} says={root === SHARED ? 'Offered in New task for every folder' : `Offered in New task for ${projectName(root)} only`} onPress={() => setPicking(true)} />
        {root === SHARED ? null : (
          <Cell label="Default for this folder" says="New tasks there start with it">
            <Switch on={isDefault} label="Default for this folder" onChange={setIsDefault} />
          </Cell>
        )}
      </div>
      <div className="phone-task-label">Items</div>
      <div className="checklist-sheet-items">
        <ChecklistItems items={items} onChange={setItems} />
        <button type="button" className="shortcut-add-goal checklist-add" onClick={() => setItems((was) => [...was, newItem()])}>
          <Icon name="plus" size={11} />
          Add an item
        </button>
        <ChecklistNotes checklist={{ items }} />
      </div>
      <div className="phone-note">Each item is a result, in order. A task moves on to the next one only when this one holds.</div>
      {onDelete === undefined ? null : (
        <div className="phone-group phone-form-group">
          <Cell label="Delete Checklist" danger onPress={() => setAsking(true)} />
        </div>
      )}
      {picking ? (
        <Menu
          anchor={new DOMRect()}
          title="Belongs to"
          chosen={root}
          choices={[{ value: SHARED, label: 'Shared', says: 'Every folder' }, ...places.map((one) => ({ value: one, label: projectName(one) }))]}
          onPick={setRoot}
          onClose={() => setPicking(false)}
        />
      ) : null}
      {asking && onDelete !== undefined ? (
        <Menu
          anchor={new DOMRect()}
          title={`Delete "${checklist.name}"?`}
          choices={[{ value: 'delete', label: 'Delete Checklist', says: 'Running tasks keep their copy', danger: true }]}
          onPick={onDelete}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </FullSheet>
  )
}

/** The saved list with one checklist added or replaced; a new default clears the folder's previous one. */
const withChecklist = (checklists: readonly Checklist[], saved: Checklist): readonly Checklist[] => {
  const cleared = saved.isDefault === true ? checklists.map((one) => (one.id !== saved.id && one.root === saved.root && one.isDefault === true ? { ...one, isDefault: undefined } : one)) : checklists
  return cleared.some((one) => one.id === saved.id) ? cleared.map((one) => (one.id === saved.id ? saved : one)) : [...cleared, saved]
}

/** A task's items saved as a new checklist, in the same editor as Settings: a dialog on the desktop, a sheet on the phone. */
export function SaveAsChecklist({ settings, change, name, root, items, onClose }: Part & {
  readonly name: string
  readonly root: string | undefined
  readonly items: readonly ChecklistItem[]
  readonly onClose: () => void
}): React.JSX.Element {
  const folders = shownProjects(settings)
  const [checklist] = useState<Checklist>(() => ({
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 80),
    ...(root === undefined || root === '' ? {} : { root }),
    items: items.filter((one) => one.title.trim() !== '').map(({ state: _state, ...one }) => ({ ...one, id: crypto.randomUUID() })),
  }))
  const save = (saved: Checklist): void => {
    change({ checklists: withChecklist(settings.checklists ?? [], saved) })
    onClose()
  }
  if (document.documentElement.classList.contains('phone')) return <ChecklistSheet checklist={checklist} folders={folders} title="Save as Checklist" onSave={save} onCancel={onClose} />
  return (
    <div className="dialog-scrim" onMouseDown={onClose}>
      <div className="dialog checklist-save-dialog" role="dialog" aria-label="Save as Checklist" onMouseDown={(event) => event.stopPropagation()}>
        <h2>Save as Checklist</h2>
        <p className="add-host-lead">New tasks can start with these items. This task keeps its own copy.</p>
        <ChecklistForm checklist={checklist} folders={folders} label="Save as Checklist" onSave={save} onCancel={onClose} />
      </div>
    </div>
  )
}

export function ChecklistsSection({ settings, change }: Part): React.JSX.Element {
  const checklists = settings.checklists ?? []
  const folders = shownProjects(settings)
  const [editing, setEditing] = useState<string | undefined>()
  const [deleting, setDeleting] = useState(false)
  const [adding, setAdding] = useState<Checklist | undefined>()
  const [more, setMore] = useState<{ readonly id: string; readonly anchor: DOMRect } | undefined>()
  const phone = document.documentElement.classList.contains('phone')
  const store = (next: readonly Checklist[]): void => change({ checklists: next })
  const save = (saved: Checklist): void => {
    store(withChecklist(checklists, saved))
    setEditing(undefined)
    setAdding(undefined)
  }
  const remove = (id: string): void => {
    store(checklists.filter((one) => one.id !== id))
    setEditing(undefined)
  }
  const duplicate = (id: string): void => {
    const source = checklists.find((one) => one.id === id)
    if (source === undefined) return
    const { isDefault: _default, ...rest } = source
    store([...checklists, { ...rest, id: crypto.randomUUID(), name: `${source.name} copy`, items: source.items.map((one) => ({ ...one, id: crypto.randomUUID() })) }])
  }
  const startNew = (): void => {
    setEditing(undefined)
    setAdding({ id: crypto.randomUUID(), name: '', items: [] })
  }
  const groups: readonly { readonly key: string; readonly title: string; readonly list: readonly Checklist[] }[] = [
    { key: 'shared', title: 'Shared', list: checklists.filter((one) => one.root === undefined) },
    ...[...new Set(checklists.flatMap((one) => (one.root === undefined ? [] : [one.root])))].map((root) => ({ key: root, title: projectName(root), list: checklists.filter((one) => one.root === root) })),
  ].filter((group) => group.list.length > 0)

  return (
    <section className="checklists-section" aria-labelledby="checklists-title">
      <header className="browser-profiles-header">
        <div className="secrets-heading">
          <h4 id="checklists-title">Checklists</h4>
          <p>Results a task must reach, in order. Pick one in New task, or make one the default for a folder.</p>
        </div>
        <button type="button" className="quiet browser-profiles-new" disabled={adding !== undefined} onClick={startNew}>
          <Icon name="plus" size={14} />
          New checklist
        </button>
      </header>
      {adding === undefined || phone ? null : (
        <div className="browser-profiles-group">
          <ChecklistForm checklist={adding} folders={folders} onSave={save} onCancel={() => setAdding(undefined)} />
        </div>
      )}
      {checklists.length === 0 && adding === undefined ? (
        <div className="checklists-empty">
          <p>No checklists yet. A checklist is a list of results a task must reach, in order.</p>
        </div>
      ) : null}
      {groups.map((group) => (
        <div key={group.key} className="checklists-group">
          <h5 className="checklists-group-title">{group.title}</h5>
          <div className="browser-profiles-group">
            <ul className="browser-profiles-list">
              {group.list.map((one) =>
                editing === one.id && !phone ? (
                  <li key={one.id} className="browser-profile editing">
                    <ChecklistForm checklist={one} folders={folders} onSave={save} onCancel={() => setEditing(undefined)} onDelete={() => remove(one.id)} askFirst={deleting} />
                  </li>
                ) : (
                  <li key={one.id} className="browser-profile checklist-row-saved">
                    <div className="browser-profile-main">
                      <button type="button" className="checklist-open" onClick={() => { setAdding(undefined); setDeleting(false); setEditing(one.id) }}>
                        <span className="browser-profile-lines">
                          <span className="browser-profile-title">
                            <strong>{one.name}</strong>
                            {one.isDefault === true ? <span className="secret-badge">Default</span> : null}
                          </span>
                          <span className="secret-row-line" title={one.items.map((item) => item.title).join(', ')}>
                            {one.items.length} {one.items.length === 1 ? 'item' : 'items'}: {one.items.map((item) => item.title).join(', ')}
                          </span>
                        </span>
                      </button>
                      <div className="browser-profile-actions">
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`More for ${one.name}`}
                          aria-haspopup="menu"
                          aria-expanded={more?.id === one.id}
                          onClick={(event) => {
                            const anchor = event.currentTarget.getBoundingClientRect()
                            setMore((was) => (was?.id === one.id ? undefined : { id: one.id, anchor }))
                          }}
                        >
                          <Icon name="more" size={16} />
                        </button>
                      </div>
                    </div>
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
      ))}
      {phone && adding !== undefined ? <ChecklistSheet checklist={adding} folders={folders} onSave={save} onCancel={() => setAdding(undefined)} /> : null}
      {phone && editing !== undefined ? (() => {
        const one = checklists.find((each) => each.id === editing)
        return one === undefined ? null : <ChecklistSheet key={one.id} checklist={one} folders={folders} onSave={save} onCancel={() => setEditing(undefined)} onDelete={() => remove(one.id)} askFirst={deleting} />
      })() : null}
      {more === undefined ? null : (
        <Menu
          anchor={more.anchor}
          autoFocus
          choices={[{ value: 'edit', label: 'Edit' }, { value: 'duplicate', label: 'Duplicate' }, { value: 'delete', label: 'Delete...', danger: true }]}
          onPick={(value) => {
            const id = more.id
            setMore(undefined)
            if (value === 'duplicate') duplicate(id)
            else { setAdding(undefined); setDeleting(value === 'delete'); setEditing(id) }
          }}
          onClose={() => setMore(undefined)}
        />
      )}
    </section>
  )
}
