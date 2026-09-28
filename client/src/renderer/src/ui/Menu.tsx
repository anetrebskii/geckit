import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { ON_PHONE } from '../on-phone'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

/**
 * A menu hanging off the control that opened it.
 *
 * It is placed where the button is, flipped up when there is no room below,
 * and closed by Escape, by a press outside, or by choosing something. It is
 * drawn at the top of the page, so a dialog it is opened in neither moves it
 * nor scrolls to make room for it.
 */

export interface Choice {
  readonly value: string
  readonly label: string
  readonly says?: string
  readonly danger?: boolean
  /** Checked whatever is chosen, for a menu of things each on or off. */
  readonly on?: boolean
  /** Drawn where the check goes, and given way to by the check while it is on. */
  readonly icon?: string
  /** Shown and not choosable: what it says is why. */
  readonly disabled?: boolean
  /** Opened beside it on hover rather than chosen itself. On the phone they are listed in its place. */
  readonly choices?: readonly Choice[]
}

export function Menu({
  anchor,
  choices,
  chosen,
  title,
  explained = false,
  note,
  onPick,
  onClose,
  children,
}: {
  readonly anchor: DOMRect
  readonly choices: readonly Choice[]
  readonly chosen?: string
  readonly title?: string
  /** What each choice says is a sentence, put under its name rather than beside it. */
  readonly explained?: boolean
  /** A sentence under the choices about choosing any of them. It wraps to the menu's width rather than widening it. */
  readonly note?: string
  readonly onPick: (value: string) => void
  readonly onClose: () => void
  /** Rows of its own drawn after the choices, for a list whose rows say more than a name. */
  readonly children?: React.ReactNode
}): React.JSX.Element {
  const menu = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ left: number; top: number; height: number } | undefined>()
  // The choice whose own list is open beside it, and where that list stands.
  const [open, setOpen] = useState<{ readonly value: string; readonly left: number; readonly top: number } | undefined>()
  const side = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const node = side.current
    if (node === null || open === undefined) return
    const top = Math.max(8, Math.min(open.top, window.innerHeight - node.offsetHeight - 8))
    if (top !== open.top) setOpen({ ...open, top })
  }, [open])

  useLayoutEffect(() => {
    const node = menu.current
    if (node === null) return
    const box = node.getBoundingClientRect()
    // What it would be without the height it was last given, so a list that
    // arrives after the menu is open - the models - is measured as it now is.
    const wants = node.scrollHeight + 3
    const left = Math.min(Math.max(8, anchor.left), window.innerWidth - box.width - 8)
    // Below unless it does not fit and there is more room above. A list longer
    // than the room it is given scrolls rather than running off the window.
    const below = window.innerHeight - anchor.bottom - 12
    const above = anchor.top - 12
    const under = wants <= below || below >= above
    const height = Math.min(wants, under ? below : above)
    setAt({ left, height, top: under ? anchor.bottom + 4 : anchor.top - height - 4 })
  }, [anchor, choices, note])

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])

  if (ON_PHONE) {
    return (
      <Sheet {...(title === undefined ? {} : { title })} onClose={onClose}>
        <div className="sheet-list" role="menu">
          {choices.flatMap((choice) => choice.choices ?? [choice]).map((choice) => (
            <button
              key={choice.value}
              type="button"
              role="menuitem"
              className={`sheet-option${choice.danger === true ? ' danger' : ''}`}
              disabled={choice.disabled === true}
              onClick={() => {
                onPick(choice.value)
                onClose()
              }}
            >
              <span className="sheet-words">
                <span className="label">{choice.label}</span>
                {choice.says === undefined ? null : <span className="says">{choice.says}</span>}
              </span>
              {choice.value === chosen || choice.on === true ? <Icon name="check" size={16} /> : null}
            </button>
          ))}
          {children}
        </div>
        {note === undefined ? null : <div className="sheet-note">{note}</div>}
      </Sheet>
    )
  }

  return createPortal(
    <>
      <div className="scrim menu-scrim" onMouseDown={onClose} />
      <div
        ref={menu}
        className={`floating menu${explained ? ' explained' : ''}`}
        role="menu"
        style={{
          left: at?.left ?? -9999,
          top: at?.top ?? -9999,
          minWidth: Math.max(170, Math.round(anchor.width)),
          ...(at === undefined ? {} : { maxHeight: at.height }),
          visibility: at === undefined ? 'hidden' : 'visible',
        }}
      >
        {title === undefined ? null : <div className="menu-title">{title}</div>}
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            role="menuitem"
            aria-haspopup={choice.choices === undefined ? undefined : 'menu'}
            className={`menu-item${choice.value === chosen ? ' on' : ''}${open?.value === choice.value ? ' open' : ''}${choice.danger === true ? ' danger' : ''}`}
            disabled={choice.disabled === true}
            onMouseEnter={(event) => {
              if (choice.choices === undefined) {
                setOpen(undefined)
                return
              }
              const box = event.currentTarget.getBoundingClientRect()
              const outer = menu.current?.getBoundingClientRect() ?? box
              const left = outer.right + 200 < window.innerWidth ? outer.right - 2 : outer.left - 200 + 2
              setOpen({ value: choice.value, left, top: box.top - 4 })
            }}
            onClick={() => {
              if (choice.choices !== undefined) return
              onPick(choice.value)
              onClose()
            }}
          >
            {row(choice, chosen)}
          </button>
        ))}
        {children}
        {note === undefined ? null : <div className="menu-note">{note}</div>}
      </div>
      {open === undefined ? null : (
        <div ref={side} className="floating menu menu-side" role="menu" style={{ left: open.left, top: open.top }}>
          {(choices.find((choice) => choice.value === open.value)?.choices ?? []).map((choice) => (
            <button
              key={choice.value}
              type="button"
              role="menuitem"
              className={`menu-item${choice.value === chosen ? ' on' : ''}${choice.danger === true ? ' danger' : ''}`}
              disabled={choice.disabled === true}
              onClick={() => {
                onPick(choice.value)
                onClose()
              }}
            >
              {row(choice, chosen)}
            </button>
          ))}
        </div>
      )}
    </>,
    document.body,
  )
}

function row(choice: Choice, chosen: string | undefined): React.JSX.Element {
  return (
    <>
      <span style={{ width: 14, flexShrink: 0 }}>
        {choice.value === chosen || choice.on === true ? (
          <Icon name="check" size={13} />
        ) : choice.icon === undefined ? null : (
          <Icon name={choice.icon} size={13} />
        )}
      </span>
      <span className="label">{choice.label}</span>
      {choice.says === undefined ? null : <span className="says">{choice.says}</span>}
      {choice.choices === undefined ? null : (
        <span className="menu-more">
          <Icon name="right" size={12} />
        </span>
      )}
    </>
  )
}

/** A control that opens a menu under itself. */
export function Picker({
  label,
  choices,
  chosen,
  title,
  tip,
  explained = false,
  note,
  onPick,
  className = 'picker',
  disabled,
  onOpen,
}: {
  readonly label: React.ReactNode
  readonly choices: readonly Choice[]
  readonly chosen?: string
  readonly title?: string
  /** Said on hover over the button. */
  readonly tip?: string
  readonly explained?: boolean
  readonly note?: string
  readonly onPick: (value: string) => void
  readonly className?: string
  readonly disabled?: boolean
  /** The menu is about to be drawn, which is when something worth asking for is asked for. */
  readonly onOpen?: () => void
}): React.JSX.Element {
  const [anchor, setAnchor] = useState<DOMRect | undefined>()
  return (
    <>
      <button
        type="button"
        className={className}
        disabled={disabled === true}
        {...(tip === undefined ? {} : { title: tip })}
        onClick={(event) => {
          onOpen?.()
          setAnchor(event.currentTarget.getBoundingClientRect())
        }}
      >
        {label}
        <Icon name="down" size={11} />
      </button>
      {anchor === undefined ? null : (
        <Menu
          anchor={anchor}
          choices={choices}
          {...(chosen === undefined ? {} : { chosen })}
          {...(title === undefined ? {} : { title })}
          explained={explained}
          {...(note === undefined ? {} : { note })}
          onPick={onPick}
          onClose={() => setAnchor(undefined)}
        />
      )}
    </>
  )
}
