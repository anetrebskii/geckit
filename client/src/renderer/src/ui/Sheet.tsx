import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * A sheet rising from the bottom of the phone, which is where a menu opens on
 * a phone: under the thumb rather than under a control the finger covers.
 *
 * It is dragged down to close it, by the grabber or by a list already at its
 * top, as the system's sheets are, and a short flick is enough; Cancel does the
 * same for anyone who does not know that.
 */
export function Sheet({
  title,
  onClose,
  children,
  cancel = true,
  className = '',
}: {
  readonly title?: string
  readonly onClose: () => void
  readonly children: React.ReactNode
  readonly cancel?: boolean
  readonly className?: string
}): React.JSX.Element {
  const [dragged, setDragged] = useState<number | undefined>()
  const from = useRef<number | undefined>(undefined)
  const sheet = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)

  useEffect(() => {
    close.current = onClose
  }, [onClose])

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])

  // Touch rather than pointer events, as the banners do: the web view takes a vertical pan for itself and cancels the pointer, and only a non-passive touchmove keeps it.
  useEffect(() => {
    const el = sheet.current
    if (el === null) return
    let held: { x: number; y: number; at: number; t: number; v: number; way?: 'down' | 'none'; top: boolean } | undefined
    const start = (event: TouchEvent): void => {
      const touch = event.touches[0]
      if (touch === undefined || event.touches.length > 1) {
        held = undefined
        return
      }
      let top = !(event.target instanceof Element && event.target.closest('input, textarea') !== null)
      for (let node = event.target instanceof Element ? event.target : null; top && node !== null && node !== el; node = node.parentElement) {
        if (node.scrollTop > 0) top = false
      }
      held = { x: touch.clientX, y: touch.clientY, at: 0, t: event.timeStamp, v: 0, top }
    }
    const move = (event: TouchEvent): void => {
      const touch = event.touches[0]
      if (held === undefined || touch === undefined || held.way === 'none') return
      const dx = touch.clientX - held.x
      const dy = touch.clientY - held.y
      if (held.way === undefined) {
        if (!held.top || dy < 0 || Math.abs(dx) > dy) {
          if (Math.abs(dx) + Math.abs(dy) > 6) held.way = 'none'
          return
        }
        event.preventDefault()
        if (dy <= 6) return
        held.way = 'down'
      }
      event.preventDefault()
      const at = Math.max(0, dy)
      const dt = event.timeStamp - held.t
      if (dt > 0) held.v = held.v * 0.2 + ((at - held.at) / dt) * 0.8
      held.at = at
      held.t = event.timeStamp
      setDragged(at)
    }
    const end = (event: TouchEvent): void => {
      const was = held
      held = undefined
      if (was?.way !== 'down') return
      // A finger that stopped before letting go is not a flick.
      const flick = event.timeStamp - was.t < 80 && was.v > 0.3
      if (flick || was.at > 110) close.current()
      setDragged(undefined)
    }
    const cancel = (): void => {
      held = undefined
      setDragged(undefined)
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', cancel)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', cancel)
    }
  }, [])

  return createPortal(
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div
        ref={sheet}
        className={`sheet${dragged === undefined ? '' : ' dragging'} ${className}`}
        role="dialog"
        style={dragged === undefined ? undefined : { transform: `translateY(${String(dragged)}px)` }}
      >
        <div
          className="sheet-grab"
          onPointerDown={(event) => {
            if (event.pointerType === 'touch') return
            event.currentTarget.setPointerCapture(event.pointerId)
            from.current = event.clientY
            setDragged(0)
          }}
          onPointerMove={(event) => {
            if (from.current !== undefined) setDragged(Math.max(0, event.clientY - from.current))
          }}
          onPointerUp={() => {
            from.current = undefined
            if ((dragged ?? 0) > 110) onClose()
            setDragged(undefined)
          }}
          onPointerCancel={() => {
            from.current = undefined
            setDragged(undefined)
          }}
        >
          <span className="sheet-handle" />
          {title === undefined ? null : <div className="sheet-title">{title}</div>}
        </div>
        <div className="sheet-body">{children}</div>
        {cancel ? (
          <div className="sheet-list">
            <button type="button" className="sheet-option sheet-cancel" onClick={onClose}>
              Cancel
            </button>
          </div>
        ) : null}
      </div>
    </>,
    document.body,
  )
}
