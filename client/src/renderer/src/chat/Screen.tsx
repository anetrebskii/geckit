import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { screenLink } from '../screen-link'
import { Icon } from '../ui/Icon'

/**
 * The Mac's screen on the phone, to look at and not to touch: pinch to get
 * close to the text, drag to move over it, double tap to go in and back out.
 * The Mac sends it only while this is open.
 */

const MOST = 5

interface View {
  readonly scale: number
  readonly x: number
  readonly y: number
}

const FIT: View = { scale: 1, x: 0, y: 0 }

export function Screen({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  const video = useRef<HTMLVideoElement>(null)
  const [trouble, setTrouble] = useState<string | undefined>(() =>
    screenLink() === undefined ? 'Only the phone shows the Mac screen.' : undefined,
  )
  const [live, setLive] = useState(false)
  const [tries, setTries] = useState(0)
  const [chrome, setChrome] = useState(true)
  const [view, setView] = useState<View>(FIT)
  const touches = useRef(new Map<number, { x: number; y: number }>())
  const start = useRef<{ view: View; mid: { x: number; y: number }; span: number } | undefined>(undefined)
  const lastTap = useRef(0)

  useEffect(() => {
    const link = screenLink()
    if (link === undefined) return
    let gone = false
    link.start().then(
      (stream) => {
        if (gone || video.current === null) return
        video.current.srcObject = stream
        void video.current.play().catch(() => undefined)
      },
      (error: unknown) => {
        if (!gone) setTrouble(error instanceof Error ? error.message : String(error))
      },
    )
    return () => {
      gone = true
      link.stop()
    }
  }, [tries])

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  // Held to the picture rather than the black around it: a side that fills the screen cannot be dragged off it, and one that does not stays centred.
  const kept = useCallback((next: View, box: DOMRect): View => {
    const scale = Math.min(MOST, Math.max(1, next.scale))
    const wide = video.current?.videoWidth || box.width
    const high = video.current?.videoHeight || box.height
    const fit = Math.min(box.width / wide, box.height / high)
    const hold = (at: number, room: number, size: number): number => {
      const edge = (room - size) / 2
      if (size * scale <= room) return (room - size * scale) / 2 - edge * scale
      return Math.min(-edge * scale, Math.max(room - (edge + size) * scale, at))
    }
    return { scale, x: hold(next.x, box.width, wide * fit), y: hold(next.y, box.height, high * fit) }
  }, [])

  const mid = (): { x: number; y: number; span: number } => {
    const points = [...touches.current.values()]
    const [one, two] = points
    if (one === undefined) return { x: 0, y: 0, span: 0 }
    if (two === undefined) return { x: one.x, y: one.y, span: 0 }
    return { x: (one.x + two.x) / 2, y: (one.y + two.y) / 2, span: Math.hypot(one.x - two.x, one.y - two.y) }
  }

  return createPortal(
    <div className="phone-screen">
      <div
        className="phone-screen-stage"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          const box = event.currentTarget.getBoundingClientRect()
          touches.current.set(event.pointerId, { x: event.clientX - box.left, y: event.clientY - box.top })
          const at = mid()
          start.current = { view, mid: { x: at.x, y: at.y }, span: at.span }
        }}
        onPointerMove={(event) => {
          if (!touches.current.has(event.pointerId) || start.current === undefined) return
          const box = event.currentTarget.getBoundingClientRect()
          touches.current.set(event.pointerId, { x: event.clientX - box.left, y: event.clientY - box.top })
          const at = mid()
          const from = start.current
          const scale = from.span === 0 || at.span === 0 ? from.view.scale : (from.view.scale * at.span) / from.span
          // The point under the fingers stays under them while the scale changes.
          const ratio = scale / from.view.scale
          setView(
            kept(
              { scale, x: at.x - (from.mid.x - from.view.x) * ratio, y: at.y - (from.mid.y - from.view.y) * ratio },
              box,
            ),
          )
        }}
        onPointerUp={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          const point = touches.current.get(event.pointerId)
          const moved = start.current !== undefined && point !== undefined && Math.hypot(point.x - start.current.mid.x, point.y - start.current.mid.y) > 10
          touches.current.delete(event.pointerId)
          const at = mid()
          start.current = touches.current.size === 0 ? undefined : { view, mid: { x: at.x, y: at.y }, span: at.span }
          if (moved || point === undefined || touches.current.size > 0) return
          const now = Date.now()
          if (now - lastTap.current < 300) {
            lastTap.current = 0
            setView(view.scale > 1 ? FIT : kept({ scale: 2.5, x: point.x - point.x * 2.5, y: point.y - point.y * 2.5 }, box))
          } else {
            lastTap.current = now
            setTimeout(() => {
              if (lastTap.current === now) setChrome((shown) => !shown)
            }, 300)
          }
        }}
        onPointerCancel={(event) => {
          touches.current.delete(event.pointerId)
          start.current = undefined
        }}
      >
        <video
          ref={video}
          className="phone-screen-video"
          playsInline
          muted
          autoPlay
          style={{ transform: `translate(${String(view.x)}px, ${String(view.y)}px) scale(${String(view.scale)})` }}
          onPlaying={() => setLive(true)}
        />
        {live || trouble !== undefined ? null : (
          <div className="phone-screen-note">
            <span className="phone-spin" />
            Asking the Mac for its screen
          </div>
        )}
        {trouble === undefined ? null : (
          <div className="phone-screen-note">
            <span>{trouble}</span>
            <button
              type="button"
              className="phone-button fill"
              onClick={() => {
                setTrouble(undefined)
                setLive(false)
                setTries((one) => one + 1)
              }}
            >
              Try again
            </button>
          </div>
        )}
      </div>
      <div className={`phone-screen-bar${chrome ? '' : ' hidden'}`}>
        <span className="phone-screen-title">
          Mac
          {live ? <span className="phone-screen-live">Live</span> : null}
        </span>
        <span className="spacer" />
        {view.scale > 1 ? (
          <button type="button" className="phone-screen-done" onClick={() => setView(FIT)}>
            Fit
          </button>
        ) : null}
        <button type="button" className="phone-screen-done" onClick={onClose}>
          Done
        </button>
      </div>
      {chrome ? null : (
        <button type="button" className="phone-screen-peek" aria-label="Show the controls" onClick={() => setChrome(true)}>
          <Icon name="down" size={16} />
        </button>
      )}
    </div>,
    document.body,
  )
}
