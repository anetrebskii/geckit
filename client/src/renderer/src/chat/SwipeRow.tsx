import { useEffect, useRef, useState } from 'react'

import { tap } from '../tap'
import { Icon } from '../ui/Icon'

const ACTION = 84
const FULL = 0.5

/** A list row that opens on a tap, swipes left to Delete and, when it has a lead action, right to that. Questions and Manager draw theirs in it. */
export function SwipeRow({
  open,
  onOpen,
  onTap,
  onDelete,
  lead,
  children,
}: {
  readonly open: boolean
  readonly onOpen: (on: boolean) => void
  readonly onTap: () => void
  readonly onDelete: () => void
  readonly lead?: { readonly label: string; readonly className: string; readonly icon: 'pin'; readonly run: () => void } | undefined
  readonly children: React.ReactNode
}): React.JSX.Element {
  const [x, setX] = useState(0)
  const [moving, setMoving] = useState(false)
  const [width, setWidth] = useState(360)
  const touch = useRef<{ x: number; y: number; from: number; way?: 'side' | 'down'; at: number } | undefined>(undefined)
  const row = useRef<HTMLDivElement>(null)
  const offset = open || moving ? x : 0

  // React's touch listeners are passive, and only a non-passive one can keep the list still under a sideways swipe.
  useEffect(() => {
    const element = row.current
    if (element === null) return
    const hold = (event: TouchEvent): void => {
      if (touch.current?.way === 'side') event.preventDefault()
    }
    element.addEventListener('touchmove', hold, { passive: false })
    return () => element.removeEventListener('touchmove', hold)
  }, [])

  const close = (): void => {
    setX(0)
    onOpen(false)
  }
  const keep = (): void => {
    tap('firm')
    close()
    lead?.run()
  }
  const remove = (): void => {
    close()
    onDelete()
  }
  const settle = (at: number): void => {
    setMoving(false)
    if (at > width * FULL && lead !== undefined) keep()
    else if (at < -width * FULL) {
      tap('firm')
      remove()
    } else if (at > 48 && lead !== undefined) {
      setX(ACTION)
      onOpen(true)
    } else if (at < -48) {
      setX(-ACTION)
      onOpen(true)
    } else close()
  }

  return (
    <div className="phone-swipe">
      {lead === undefined ? null : (
        <div className="phone-actions lead" style={{ width: Math.max(0, offset) }}>
          <button type="button" className={`phone-action ${lead.className}`} style={{ width: Math.max(ACTION, offset) }} onClick={keep}>
            <Icon name={lead.icon} size={20} />
            {lead.label}
          </button>
        </div>
      )}
      <div className="phone-actions trail" style={{ width: Math.max(0, -offset) }}>
        <button type="button" className="phone-action delete" style={{ width: Math.max(ACTION, -offset) }} onClick={remove}>
          <Icon name="trash" size={20} />
          Delete
        </button>
      </div>
      <div
        ref={row}
        className={`phone-row${moving ? ' moving' : ''}`}
        role="button"
        tabIndex={0}
        style={{ transform: `translateX(${String(offset)}px)` }}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onTap()
        }}
        onPointerDown={(event) => {
          setWidth(event.currentTarget.offsetWidth)
          touch.current = { x: event.clientX, y: event.clientY, from: offset, at: offset }
        }}
        onPointerMove={(event) => {
          const held = touch.current
          if (held === undefined) return
          const dx = event.clientX - held.x
          const dy = event.clientY - held.y
          if (held.way === undefined && Math.hypot(dx, dy) > 8) {
            held.way = Math.abs(dx) > Math.abs(dy) ? 'side' : 'down'
            if (held.way === 'side') {
              event.currentTarget.setPointerCapture(event.pointerId)
              setMoving(true)
            }
          }
          if (held.way !== 'side') return
          held.at = Math.max(-width, Math.min(lead === undefined ? 0 : width, held.from + dx))
          setX(held.at)
        }}
        onPointerUp={() => {
          const held = touch.current
          touch.current = undefined
          if (held === undefined) return
          if (held.way === 'side') settle(held.at)
          else if (held.way === undefined) {
            if (open) close()
            else onTap()
          }
        }}
        onPointerCancel={() => {
          const held = touch.current
          touch.current = undefined
          if (held?.way === 'side') settle(held.at)
        }}
      >
        {children}
      </div>
    </div>
  )
}
