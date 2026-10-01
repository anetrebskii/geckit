import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { tap } from '../tap'
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
      {onBack === undefined ? null : <EdgeBack onBack={onBack} />}
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

export function Switch({ on, label, disabled = false, onChange }: { readonly on: boolean; readonly label: string; readonly disabled?: boolean; readonly onChange: (on: boolean) => void }): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      disabled={disabled}
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
  back,
  onBack,
  onClose,
  children,
}: {
  readonly title: string
  /** A page pushed inside the sheet: the page it goes back to, in place of Cancel. */
  readonly back?: string
  readonly onBack?: () => void
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
          {onBack === undefined ? (
            <button type="button" onClick={onClose}>
              {action === undefined ? 'Done' : 'Cancel'}
            </button>
          ) : (
            <button type="button" className="phone-back" onClick={onBack}>
              <Icon name="left" size={22} />
              {back ?? 'Back'}
            </button>
          )}
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

/**
 * A panel that comes in from the right edge over two thirds and more of the
 * screen. While the edge is still being dragged it stands where the finger is,
 * `pulled` pixels in; dragged back right, or its scrim pressed, it goes.
 */
export function Drawer({
  title,
  pulled,
  onClose,
  children,
}: {
  readonly title: string
  readonly pulled?: number
  readonly onClose: () => void
  readonly children: React.ReactNode
}): React.JSX.Element {
  const panel = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [phase, setPhase] = useState<'in' | 'open' | 'out'>(pulled === undefined ? 'in' : 'open')
  const [dragged, setDragged] = useState<number | undefined>()
  const from = useRef<{ x: number; y: number; way?: 'side' | 'down'; at: number; t: number; v: number } | undefined>(undefined)

  useLayoutEffect(() => {
    setWidth(panel.current?.offsetWidth ?? 0)
  }, [])
  // Without a non-passive listener the list inside scrolls under a sideways swipe, and iOS cancels it.
  useEffect(() => {
    const element = panel.current
    if (element === null) return
    const hold = (event: TouchEvent): void => {
      if (from.current?.way === 'side') event.preventDefault()
    }
    element.addEventListener('touchmove', hold, { passive: false })
    return () => element.removeEventListener('touchmove', hold)
  }, [])
  useEffect(() => {
    if (phase !== 'in') return
    const frame = requestAnimationFrame(() => setPhase('open'))
    return () => cancelAnimationFrame(frame)
  }, [phase])

  const close = (): void => {
    setDragged(undefined)
    setPhase('out')
    setTimeout(onClose, 260)
  }

  const off = pulled !== undefined ? Math.max(0, width - pulled) : dragged !== undefined ? dragged : phase === 'open' ? 0 : width || 9999
  const moving = pulled !== undefined || dragged !== undefined
  const shown = width === 0 ? (phase === 'open' ? 1 : 0) : 1 - off / width

  return createPortal(
    <>
      <div className="phone-drawer-scrim" style={{ opacity: shown, transition: moving ? 'none' : undefined }} onClick={close} />
      <div
        ref={panel}
        className="phone-drawer"
        role="dialog"
        aria-label={title}
        style={{ transform: `translateX(${String(off)}px)`, transition: moving ? 'none' : undefined }}
        onPointerDown={(event) => {
          from.current = { x: event.clientX, y: event.clientY, at: 0, t: event.timeStamp, v: 0 }
        }}
        onPointerMove={(event) => {
          const held = from.current
          if (held === undefined) return
          const dx = event.clientX - held.x
          const dy = event.clientY - held.y
          if (held.way === undefined && Math.abs(dx) + Math.abs(dy) > 6) {
            held.way = dx > Math.abs(dy) ? 'side' : 'down'
            if (held.way === 'side') event.currentTarget.setPointerCapture(event.pointerId)
          }
          if (held.way !== 'side') return
          const at = Math.max(0, dx)
          const dt = event.timeStamp - held.t
          if (dt > 0) held.v = held.v * 0.2 + ((at - held.at) / dt) * 0.8
          held.at = at
          held.t = event.timeStamp
          setDragged(at)
        }}
        onPointerUp={(event) => {
          const held = from.current
          from.current = undefined
          if (held?.way !== 'side') return
          // A short flick to the right is enough, as a swipe back is; a finger that stopped before letting go is not a flick.
          const flick = event.timeStamp - held.t < 80 && held.v > 0.3
          if (flick || held.at > width / 3) close()
          else setDragged(undefined)
        }}
        onPointerCancel={() => {
          const held = from.current
          from.current = undefined
          if (held?.way === 'side' && held.at > width / 3) close()
          else setDragged(undefined)
        }}
      >
        <div className="phone-task-bar">
          <span />
          <b>{title}</b>
          <button type="button" className="strong" onClick={close}>
            Done
          </button>
        </div>
        <div className="phone-drawer-body">{children}</div>
      </div>
    </>,
    document.body,
  )
}

/** What a Mac from before a call was there says, put in words the person can act on. */
export const tooOld = (error: unknown): string =>
  error instanceof Error && error.message.startsWith('No such call')
    ? 'Update GeckIt on the host for this.'
    : error instanceof Error
      ? error.message
      : String(error)

/**
 * The strip along the left edge of a conversation or a pushed page that takes
 * it back when dragged, as the system's back swipe does. It moves the pane it
 * sits in, and lets it go back or spring home.
 */
export function EdgeBack({ onBack }: { readonly onBack: () => void }): React.JSX.Element {
  const drag = useRef<{ x: number; at: number; moved: number } | undefined>(undefined)
  const pane = (element: Element): HTMLElement | null => element.closest<HTMLElement>('.talk, .phone-page')
  return (
    <div
      className="phone-edge"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { x: event.clientX, at: Date.now(), moved: 0 }
        const talk = pane(event.currentTarget)
        if (talk !== null) talk.style.transition = 'none'
      }}
      onPointerMove={(event) => {
        const held = drag.current
        const talk = pane(event.currentTarget)
        if (held === undefined || talk === null) return
        held.moved = Math.max(0, event.clientX - held.x)
        talk.style.transform = `translateX(${String(held.moved)}px)`
      }}
      onPointerUp={(event) => {
        const held = drag.current
        drag.current = undefined
        const talk = pane(event.currentTarget)
        if (held === undefined || talk === null) return
        const fast = held.moved / Math.max(1, Date.now() - held.at) > 0.6
        talk.style.transition = ''
        if (held.moved > talk.offsetWidth / 3 || (fast && held.moved > 40)) {
          tap('light')
          talk.style.transform = 'translateX(100%)'
          setTimeout(() => {
            onBack()
            talk.style.transform = ''
          }, 240)
        } else talk.style.transform = ''
      }}
    />
  )
}
