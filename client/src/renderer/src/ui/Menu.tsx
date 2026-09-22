import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Icon } from './Icon'

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
}): React.JSX.Element {
  const menu = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ left: number; top: number; height: number } | undefined>()

  useLayoutEffect(() => {
    const node = menu.current
    if (node === null) return
    const box = node.getBoundingClientRect()
    // What it would be without the height it was last given, so a list that
    // arrives after the menu is open - the models - is measured as it now is.
    const wants = node.scrollHeight + 2
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
            className={`menu-item${choice.value === chosen ? ' on' : ''}${choice.danger === true ? ' danger' : ''}`}
            onClick={() => {
              onPick(choice.value)
              onClose()
            }}
          >
            <span style={{ width: 14, flexShrink: 0 }}>
              {choice.value === chosen || choice.on === true ? <Icon name="check" size={13} /> : null}
            </span>
            <span className="label">{choice.label}</span>
            {choice.says === undefined ? null : <span className="says">{choice.says}</span>}
          </button>
        ))}
        {note === undefined ? null : <div className="menu-note">{note}</div>}
      </div>
    </>,
    document.body,
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
