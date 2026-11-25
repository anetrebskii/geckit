import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { TagChange, TaskTag } from '../../../shared/api'
import { findTag, TAG_COLORS, TAG_NAME_MAX, TOO_LONG } from '../../../shared/tags'
import { ON_PHONE } from '../on-phone'
import { useBack } from '../phone-back'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'

/** Whether the tasks it is opened for have a tag: all of them, none, or some. */
export type TagHas = 'on' | 'off' | 'mixed'

/** Counts how many of these tag lists hold the tag. */
export const tagState = (lists: readonly (readonly string[] | undefined)[], id: string): TagHas => {
  const count = lists.filter((one) => one?.includes(id) === true).length
  return count === 0 ? 'off' : count === lists.length ? 'on' : 'mixed'
}

/** What a refusal from the service says, without Electron's wrapping. */
const said = (error: unknown): string => (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

const tint = (color: number): React.CSSProperties => ({ '--tint': `var(--project-${String(color)})` }) as React.CSSProperties

/**
 * The one place tags are put on, made, renamed, recoloured and deleted: a field over the tags, each with its own "...".
 * `has` says which tags the tasks it is for carry; `apply` puts them on and takes them off, making the named ones first.
 */
export function TagPicker({
  anchor,
  side = false,
  catalog,
  has,
  apply,
  usedBy,
  onClose,
}: {
  readonly anchor: DOMRect
  /** Opened beside a menu's row rather than under a control. */
  readonly side?: boolean
  readonly catalog: readonly TaskTag[]
  readonly has: (id: string) => TagHas
  readonly apply: (change: TagChange) => Promise<unknown>
  /** How many tasks carry a tag, said when deleting it. */
  readonly usedBy: (id: string) => number
  readonly onClose: () => void
}): React.JSX.Element {
  const [typed, setTyped] = useState('')
  const [at, setAt] = useState(0)
  const [options, setOptions] = useState<{ readonly id: string; readonly rect: DOMRect; readonly page: 'main' | 'colour' } | undefined>()
  const [renaming, setRenaming] = useState<{ readonly id: string; readonly draft: string; readonly error?: string } | undefined>()
  const [deleting, setDeleting] = useState<string | undefined>()
  const [failed, setFailed] = useState<string | undefined>()
  const field = useRef<HTMLInputElement>(null)

  const text = typed.trim()
  const lower = text.toLowerCase()
  const rows = catalog
    .filter((tag) => tag.name.toLowerCase().includes(lower))
    .sort((one, other) => Number(has(one.id) === 'off') - Number(has(other.id) === 'off') || other.used - one.used)
  const create = text !== '' && findTag(catalog, text) === undefined ? text : undefined
  const tooLong = create !== undefined && create.length > TAG_NAME_MAX
  const total = rows.length + (create === undefined ? 0 : 1)
  const highlighted = Math.min(at, Math.max(0, total - 1))

  const run = (work: Promise<unknown>): void => {
    setFailed(undefined)
    work.catch((error: unknown) => setFailed(said(error)))
  }
  const toggle = (id: string): void => run(apply(has(id) === 'on' ? { remove: [id] } : { add: [id] }))
  const make = (): void => {
    if (create === undefined || tooLong) return
    run(apply({ create: [create] }))
    setTyped('')
    setAt(0)
  }
  const back = (): void => {
    setOptions(undefined)
    requestAnimationFrame(() => field.current?.focus())
  }
  const rename = (): void => {
    if (renaming === undefined) return
    if (renaming.draft.trim() === '') return
    window.geckit.chat
      .editTag(renaming.id, { name: renaming.draft })
      .then(() => {
        setRenaming(undefined)
        requestAnimationFrame(() => field.current?.focus())
      })
      .catch((error: unknown) => setRenaming({ ...renaming, error: said(error) }))
  }
  const remove = (id: string): void => {
    setOptions(undefined)
    if (usedBy(id) === 0) run(window.geckit.chat.deleteTag(id))
    else setDeleting(id)
  }

  const keys = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setAt(Math.min(highlighted + 1, total - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setAt(Math.max(highlighted - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const row = rows[highlighted]
      if (row !== undefined) toggle(row.id)
      else make()
    }
  }

  const list = (
    <>
      <input
        ref={field}
        className="menu-search"
        aria-label="Search or create a tag"
        placeholder="Search or create a tag"
        value={typed}
        maxLength={64}
        autoFocus={!ON_PHONE}
        onChange={(event) => {
          setTyped(event.target.value)
          setAt(0)
        }}
        onKeyDown={keys}
      />
      <div className="tag-rows" role="menu">
        {rows.map((tag, index) =>
          renaming?.id === tag.id ? (
            <div key={tag.id} className="tag-line editing">
              <input
                aria-label={`Rename ${tag.name}`}
                value={renaming.draft}
                maxLength={TAG_NAME_MAX}
                autoFocus
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setRenaming({ id: tag.id, draft: event.target.value })}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Enter') rename()
                  if (event.key === 'Escape') {
                    setRenaming(undefined)
                    requestAnimationFrame(() => field.current?.focus())
                  }
                }}
              />
              {renaming.error === undefined ? null : <div className="tag-line-error">{renaming.error}</div>}
            </div>
          ) : (
            <div key={tag.id} className={`tag-line${index === highlighted ? ' at' : ''}`} style={tint(tag.color)}>
              <button type="button" role="menuitemcheckbox" aria-checked={has(tag.id) === 'mixed' ? 'mixed' : has(tag.id) === 'on'} className="menu-item" tabIndex={-1} onClick={() => toggle(tag.id)}>
                <span className="tag-mark">{has(tag.id) === 'on' ? <Icon name="check" size={13} /> : has(tag.id) === 'mixed' ? <Icon name="minus" size={13} /> : null}</span>
                <span className="tag-dot" />
                <span className="label">{tag.name}</span>
              </button>
              <button
                type="button"
                className={`icon-button tag-line-more${options?.id === tag.id ? ' open' : ''}`}
                aria-label={`${tag.name} options`}
                title={`${tag.name} options`}
                aria-haspopup="menu"
                onClick={(event) => setOptions({ id: tag.id, rect: event.currentTarget.getBoundingClientRect(), page: 'main' })}
              >
                <Icon name="more" size={14} />
              </button>
            </div>
          ),
        )}
        {create === undefined ? null : (
          <button type="button" className={`menu-item tag-create${highlighted === rows.length ? ' at' : ''}`} disabled={tooLong} onClick={make}>
            <span className="tag-mark">
              <Icon name="plus" size={13} />
            </span>
            <span className="label">{`Create tag "${create}"`}</span>
          </button>
        )}
      </div>
      {catalog.length === 0 && create === undefined ? <div className="menu-note tag-note">Type a name to create a tag</div> : null}
      {tooLong ? <div className="menu-note tag-note">{TOO_LONG}</div> : null}
      {failed === undefined ? null : <div className="menu-note tag-note tag-failed">{failed}</div>}
    </>
  )

  const optionsFor = options === undefined ? undefined : catalog.find((one) => one.id === options.id)
  const deletingTag = deleting === undefined ? undefined : catalog.find((one) => one.id === deleting)

  return (
    <>
      {ON_PHONE ? (
        <Sheet title="Tags" onClose={onClose}>
          <div className="sheet-list tag-sheet">{list}</div>
        </Sheet>
      ) : (
        <Floating anchor={anchor} side={side} className="tag-picker" onClose={onClose}>
          {list}
        </Floating>
      )}
      {optionsFor === undefined || options === undefined ? null : ON_PHONE ? (
        <Sheet title={optionsFor.name} onClose={back}>
          <div className="sheet-list">
            {options.page === 'colour' ? (
              <Swatches tag={optionsFor} onPick={back} />
            ) : (
              <>
                <button type="button" className="sheet-option" onClick={() => { setOptions(undefined); setRenaming({ id: optionsFor.id, draft: optionsFor.name }) }}>Rename</button>
                <button type="button" className="sheet-option" onClick={() => setOptions({ ...options, page: 'colour' })}>Colour</button>
                <button type="button" className="sheet-option danger" onClick={() => remove(optionsFor.id)}>Delete</button>
              </>
            )}
          </div>
        </Sheet>
      ) : (
        <Floating anchor={options.rect} side className="tag-options" onClose={back}>
          {options.page === 'colour' ? (
            <>
              <div className="menu-title">Colour</div>
              <Swatches tag={optionsFor} onPick={back} />
            </>
          ) : (
            <>
              <button type="button" role="menuitem" className="menu-item" autoFocus onClick={() => { setOptions(undefined); setRenaming({ id: optionsFor.id, draft: optionsFor.name }) }}>
                <span className="label">Rename</span>
              </button>
              <button type="button" role="menuitem" className="menu-item" aria-haspopup="menu" onClick={() => setOptions({ ...options, page: 'colour' })}>
                <span className="label">Colour</span>
                <span className="menu-more">
                  <Icon name="right" size={12} />
                </span>
              </button>
              <button type="button" role="menuitem" className="menu-item danger" onClick={() => remove(optionsFor.id)}>
                <span className="label">Delete</span>
              </button>
            </>
          )}
        </Floating>
      )}
      {deletingTag === undefined ? null : (
        <DeleteTag
          tag={deletingTag}
          count={usedBy(deletingTag.id)}
          onClose={() => {
            setDeleting(undefined)
            requestAnimationFrame(() => field.current?.focus())
          }}
        />
      )}
    </>
  )
}

function Swatches({ tag, onPick }: { readonly tag: TaskTag; readonly onPick: () => void }): React.JSX.Element {
  return (
    <div className="tag-swatches">
      {Array.from({ length: TAG_COLORS }, (_none, color) => (
        <button
          key={color}
          type="button"
          className={`tag-swatch${tag.color === color ? ' on' : ''}`}
          style={tint(color)}
          aria-label={`Colour ${String(color + 1)}`}
          aria-pressed={tag.color === color}
          autoFocus={tag.color === color}
          onClick={() => {
            void window.geckit.chat.editTag(tag.id, { color })
            onPick()
          }}
        />
      ))}
    </div>
  )
}

function DeleteTag({ tag, count, onClose }: { readonly tag: TaskTag; readonly count: number; readonly onClose: () => void }): React.JSX.Element {
  return createPortal(
    <div className="dialog-scrim tag-delete-scrim" onMouseDown={onClose}>
      <div
        className="dialog"
        role="alertdialog"
        aria-label={`Delete tag "${tag.name}"?`}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.stopPropagation()
          onClose()
        }}
      >
        <h2>{`Delete tag "${tag.name}"?`}</h2>
        <p className="add-host-lead">{`It is removed from ${count === 1 ? '1 task' : `${String(count)} tasks`}. The tasks stay.`}</p>
        <div className="dialog-actions">
          <button type="button" className="quiet" autoFocus onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="primary danger"
            onClick={() => {
              void window.geckit.chat.deleteTag(tag.id)
              onClose()
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** A menu-like panel over the page, placed under or beside what opened it, closed by Escape or a press outside. */
function Floating({ anchor, side, className, onClose, children }: { readonly anchor: DOMRect; readonly side: boolean; readonly className: string; readonly onClose: () => void; readonly children: React.ReactNode }): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ left: number; top: number } | undefined>()
  useBack(onClose, box)
  useLayoutEffect(() => {
    const node = box.current
    if (node === null) return
    const width = node.offsetWidth
    const height = node.offsetHeight
    let left = side ? anchor.right + 2 : anchor.left
    let top = side ? anchor.top - 4 : anchor.bottom + 4
    if (left + width > window.innerWidth - 8) left = side ? Math.max(8, anchor.left - width - 2) : window.innerWidth - width - 8
    if (top + height > window.innerHeight - 8) top = Math.max(8, side ? window.innerHeight - height - 8 : anchor.top - height - 4)
    setAt((was) => (was?.left === left && was.top === top ? was : { left, top }))
  }, [anchor, side, children])
  useEffect(() => {
    const node = box.current
    if (at === undefined || node === null || node.contains(document.activeElement)) return
    // autoFocus fell on the box while it was hidden for measuring, so it is given again once shown.
    node.querySelector<HTMLElement>('input, [aria-pressed="true"], button')?.focus()
  }, [at])
  return createPortal(
    <>
      <div className="scrim menu-scrim" onMouseDown={onClose} />
      <div
        ref={box}
        className={`floating menu ${className}`}
        style={{ left: at?.left ?? -9999, top: at?.top ?? -9999, visibility: at === undefined ? 'hidden' : 'visible' }}
        onKeyDown={(event) => {
          if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !(event.target instanceof HTMLInputElement) && box.current !== null) {
            const items = [...box.current.querySelectorAll<HTMLElement>('[role="menuitem"], .tag-swatch')]
            const index = items.indexOf(event.target as HTMLElement)
            if (index === -1) return
            event.preventDefault()
            items[(index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
            return
          }
          if (event.key !== 'Escape') return
          event.stopPropagation()
          onClose()
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  )
}
