import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Icon } from '../ui/Icon'

/**
 * The parts every screen of the phone's tabs is built of, as iOS draws them:
 * a page with a large title that shrinks into the bar, grouped rows, a switch,
 * and a full-height sheet with its buttons in its own bar.
 */

export function Page({
  title,
  back,
  onBack,
  actions,
  children,
}: {
  readonly title: string
  /** The page it goes back to, for the button that says so. */
  readonly back?: string
  readonly onBack?: () => void
  readonly actions?: React.ReactNode
  readonly children: React.ReactNode
}): React.JSX.Element {
  const [scrolled, setScrolled] = useState(false)
  return (
    <div className="phone-board phone-page">
      <header className={`phone-bar${scrolled ? ' scrolled' : ''}`}>
        <div className="phone-bar-row">
          {onBack === undefined ? null : (
            <button type="button" className="phone-back" onClick={onBack}>
              <Icon name="left" size={22} />
              {back ?? 'Back'}
            </button>
          )}
          <span className="phone-bar-small">{title}</span>
          {actions}
        </div>
      </header>
      <div className="phone-list" onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 40)}>
        <h1 className="phone-large">{title}</h1>
        {children}
      </div>
    </div>
  )
}

export function Cell({
  label,
  value,
  says,
  icon,
  chosen,
  danger,
  accent,
  onPress,
  children,
}: {
  readonly label: React.ReactNode
  readonly value?: React.ReactNode
  readonly says?: React.ReactNode
  readonly icon?: string
  /** A check at the end, for a choice among the group's rows. */
  readonly chosen?: boolean
  readonly danger?: boolean
  readonly accent?: boolean
  readonly onPress?: () => void
  /** What stands at the end in place of the value, a switch or a button. */
  readonly children?: React.ReactNode
}): React.JSX.Element {
  const body = (
    <>
      {icon === undefined ? null : <Icon name={icon} size={20} className="phone-cell-icon" />}
      <span className="phone-cell-words">
        <span className="phone-cell-label">{label}</span>
        {says === undefined ? null : <span className="phone-cell-says">{says}</span>}
      </span>
      {value === undefined ? null : <span className="phone-cell-value">{value}</span>}
      {children}
      {chosen === true ? <Icon name="check" size={18} className="phone-cell-check" /> : null}
      {onPress !== undefined && chosen === undefined && children === undefined && danger !== true && accent !== true ? (
        <Icon name="right" size={14} className="phone-cell-more" />
      ) : null}
    </>
  )
  const className = `phone-cell${danger === true ? ' danger' : ''}${accent === true ? ' accent' : ''}`
  return onPress === undefined ? (
    <div className={className}>{body}</div>
  ) : (
    <button type="button" className={className} onClick={onPress}>
      {body}
    </button>
  )
}

export function Switch({ on, label, onChange }: { readonly on: boolean; readonly label: string; readonly onChange: (on: boolean) => void }): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`phone-switch${on ? ' on' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        onChange(!on)
      }}
    >
      <span />
    </button>
  )
}

/** A sheet over the whole screen with Cancel, its title and its one action in the bar, pulled down to put it away. */
export function FullSheet({
  title,
  action,
  ready = true,
  onAction,
  tool,
  onClose,
  children,
}: {
  readonly title: string
  readonly action?: string
  readonly ready?: boolean
  readonly onAction?: () => void
  readonly tool?: React.ReactNode
  readonly onClose: () => void
  readonly children: React.ReactNode
}): React.JSX.Element {
  const [dragged, setDragged] = useState<number | undefined>()
  const from = useRef<number | undefined>(undefined)
  const body = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  }, [onClose])

  // Pulled down from its top, the content takes the sheet with it, as the bar does.
  useEffect(() => {
    const form = body.current
    if (form === null) return
    let start: number | undefined
    let pulled = 0
    const down = (event: TouchEvent): void => {
      start = form.scrollTop <= 0 && event.touches.length === 1 ? event.touches[0]?.clientY : undefined
      pulled = 0
    }
    const move = (event: TouchEvent): void => {
      const at = event.touches[0]?.clientY
      if (start === undefined || at === undefined) return
      const by = at - start
      if (pulled === 0 && (by <= 0 || form.scrollTop > 0)) {
        if (by < 0) start = undefined
        return
      }
      event.preventDefault()
      pulled = Math.max(1, by)
      setDragged(pulled)
    }
    const up = (): void => {
      if (start === undefined || pulled === 0) return
      start = undefined
      setDragged(undefined)
      if (pulled > 110) close.current()
    }
    form.addEventListener('touchstart', down, { passive: true })
    form.addEventListener('touchmove', move, { passive: false })
    form.addEventListener('touchend', up)
    form.addEventListener('touchcancel', up)
    return () => {
      form.removeEventListener('touchstart', down)
      form.removeEventListener('touchmove', move)
      form.removeEventListener('touchend', up)
      form.removeEventListener('touchcancel', up)
    }
  }, [])

  return createPortal(
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div
        className={`phone-task phone-full${dragged === undefined ? '' : ' dragging'}`}
        role="dialog"
        aria-label={title}
        style={dragged === undefined ? undefined : { transform: `translateY(${String(dragged)}px)` }}
      >
        <div
          className="phone-task-bar"
          onPointerDown={(event) => {
            if ((event.target as Element).closest('button') !== null) return
            event.currentTarget.setPointerCapture(event.pointerId)
            from.current = event.clientY
            setDragged(0)
          }}
          onPointerMove={(event) => {
            if (from.current !== undefined) setDragged(Math.max(0, event.clientY - from.current))
          }}
          onPointerUp={() => {
            from.current = undefined
            const far = (dragged ?? 0) > 110
            setDragged(undefined)
            if (far) onClose()
          }}
        >
          <button type="button" onClick={onClose}>
            {action === undefined ? 'Done' : 'Cancel'}
          </button>
          <b>{title}</b>
          {action === undefined ? (
            (tool ?? <span />)
          ) : (
            <button type="button" className="strong" disabled={!ready} onClick={onAction}>
              {action}
            </button>
          )}
        </div>
        <div ref={body} className="phone-task-form">
          {children}
        </div>
      </div>
    </>,
    document.body,
  )
}

/** What a Mac from before a call was there says, put in words the person can act on. */
export const tooOld = (error: unknown): string =>
  error instanceof Error && error.message.startsWith('No such call')
    ? 'Update GeckIt on the Mac for this.'
    : error instanceof Error
      ? error.message
      : String(error)
