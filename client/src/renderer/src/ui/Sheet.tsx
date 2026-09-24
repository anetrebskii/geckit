import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/**
 * A sheet rising from the bottom of the phone, which is where a menu opens on
 * a phone: under the thumb rather than under a control the finger covers.
 *
 * Its grabber and title are dragged down to close it, as the system's sheets
 * are; Cancel does the same for anyone who does not know that.
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

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose])

  return createPortal(
    <>
      <div className="sheet-scrim" onClick={onClose} />
      <div
        className={`sheet${dragged === undefined ? '' : ' dragging'} ${className}`}
        role="dialog"
        style={dragged === undefined ? undefined : { transform: `translateY(${String(dragged)}px)` }}
      >
        <div
          className="sheet-grab"
          onPointerDown={(event) => {
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
