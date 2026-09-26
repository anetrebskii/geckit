import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { Icon } from '../ui/Icon'

/**
 * One picture, filling the window.
 *
 * It opens at the size that fits. Zooming is the scroll wheel, a pinch, a
 * double press or the keys, and it grows around the point under the pointer
 * or between the fingers; past the edges of the window it is dragged. On a
 * phone a picture at its fitting size is swiped up or down to put it away.
 * Escape closes it, and so does a press on the darkness around it.
 */

const LEAST = 0.2
const MOST = 8
const CLOSER = 2.5
const STILL = 10
const TWICE = 300
const AWAY = 110

type Point = { readonly x: number; readonly y: number }
type View = { readonly scale: number; readonly x: number; readonly y: number }
type Gesture = { readonly view: View; readonly from: readonly Point[]; readonly began: number; readonly around: boolean; readonly touch: boolean; moved: boolean }

const FIT: View = { scale: 1, x: 0, y: 0 }

const within = (scale: number): number => Math.min(MOST, Math.max(LEAST, scale))
const between = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const apart = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

/** `view` at a new scale, with the point `at` on the screen left where it is. */
function around(view: View, scale: number, at: Point, centre: Point): View {
  const next = within(scale)
  const by = next / view.scale
  return { scale: next, x: at.x - centre.x - by * (at.x - centre.x - view.x), y: at.y - centre.y - by * (at.y - centre.y - view.y) }
}

/** `view` with the picture kept over the window: centred while it fits, and never dragged past an edge once it does not. */
function kept(view: View, picture: HTMLImageElement | null, box: HTMLElement | null): View {
  if (view.scale <= 1 || picture === null || box === null) return { scale: view.scale, x: 0, y: 0 }
  const roomX = Math.max(0, (picture.offsetWidth * view.scale - box.clientWidth) / 2)
  const roomY = Math.max(0, (picture.offsetHeight * view.scale - box.clientHeight) / 2)
  return { scale: view.scale, x: Math.min(roomX, Math.max(-roomX, view.x)), y: Math.min(roomY, Math.max(-roomY, view.y)) }
}

export function Preview({ src, onClose }: { readonly src: string; readonly onClose: () => void }): React.JSX.Element {
  const [view, setView] = useState(FIT)
  const [easing, setEasing] = useState(false)
  const now = useRef(FIT)
  const box = useRef<HTMLDivElement>(null)
  const picture = useRef<HTMLImageElement>(null)
  const pointers = useRef(new Map<number, Point>())
  const gesture = useRef<Gesture | undefined>(undefined)
  const tapped = useRef<{ at: Point; time: number } | undefined>(undefined)
  const away = useRef(false)

  const show = useCallback((next: View, eased: boolean) => {
    now.current = next
    setView(next)
    setEasing(eased)
  }, [])

  const centre = useCallback((): Point => {
    const rect = box.current?.getBoundingClientRect()
    return rect === undefined ? { x: 0, y: 0 } : { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
  }, [])

  const fit = useCallback(() => show(FIT, true), [show])

  const zoom = useCallback(
    (by: number) => show(kept(around(now.current, now.current.scale * by, centre(), centre()), picture.current, box.current), true),
    [show, centre],
  )

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
      }
      if (event.key === '+' || event.key === '=') zoom(1.25)
      if (event.key === '-') zoom(0.8)
      if (event.key === '0') fit()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onClose, zoom, fit])

  const begin = (around: boolean, touch: boolean): void => {
    gesture.current = { view: now.current, from: [...pointers.current.values()], began: Date.now(), around, touch, moved: pointers.current.size > 1 }
  }

  const leaving = view.scale <= 1 ? Math.min(1, Math.abs(view.y) / 400) : 0

  return createPortal(
    <div
      ref={box}
      className={easing ? 'preview easing' : 'preview'}
      style={{ '--leaving': leaving } as React.CSSProperties}
      onPointerDown={(event) => {
        if (event.button !== 0 || (event.target as Element).closest('.preview-bar') !== null) return
        event.currentTarget.setPointerCapture(event.pointerId)
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
        begin(event.target === event.currentTarget, event.pointerType !== 'mouse')
      }}
      onPointerMove={(event) => {
        const held = gesture.current
        if (held === undefined || !pointers.current.has(event.pointerId)) return
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
        const points = [...pointers.current.values()]
        const [a, b] = points
        const [a0, b0] = held.from
        if (a === undefined || a0 === undefined) return
        if (b !== undefined && b0 !== undefined) {
          const scale = within((held.view.scale * apart(a, b)) / Math.max(1, apart(a0, b0)))
          const was = around(held.view, scale, between(a0, b0), centre())
          const mid = between(a, b)
          const from = between(a0, b0)
          show({ scale, x: was.x + mid.x - from.x, y: was.y + mid.y - from.y }, false)
          return
        }
        const dx = a.x - a0.x
        const dy = a.y - a0.y
        if (!held.moved && Math.hypot(dx, dy) < STILL) return
        held.moved = true
        if (held.view.scale > 1) show({ ...held.view, x: held.view.x + dx, y: held.view.y + dy }, false)
        else if (held.touch) show({ ...held.view, y: dy }, false)
      }}
      onPointerUp={(event) => {
        const held = gesture.current
        if (!pointers.current.delete(event.pointerId) || held === undefined) return
        if (pointers.current.size > 0) {
          begin(held.around, held.touch)
          if (gesture.current !== undefined) gesture.current.moved = true
          return
        }
        gesture.current = undefined
        away.current = false
        if (held.moved) {
          if (now.current.scale <= 1 && held.touch && Math.abs(now.current.y) > AWAY) return onClose()
          const settled = held.touch && now.current.scale < 1 ? FIT : now.current
          return show(kept(settled, picture.current, box.current), true)
        }
        if (Date.now() - held.began > TWICE) return
        const at = { x: event.clientX, y: event.clientY }
        const last = tapped.current
        if (last !== undefined && Date.now() - last.time < TWICE && apart(last.at, at) < STILL * 3) {
          tapped.current = undefined
          if (now.current.scale > 1) return fit()
          return show(kept(around(now.current, CLOSER, at, centre()), picture.current, box.current), true)
        }
        if (held.around) {
          away.current = true
          return
        }
        tapped.current = { at, time: Date.now() }
      }}
      onPointerCancel={(event) => {
        pointers.current.delete(event.pointerId)
        if (pointers.current.size > 0) return
        gesture.current = undefined
        show(kept(now.current.scale < 1 ? FIT : now.current, picture.current, box.current), true)
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && away.current) onClose()
      }}
      onWheel={(event) => {
        const by = Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.002))
        show(kept(around(now.current, now.current.scale * by, { x: event.clientX, y: event.clientY }, centre()), picture.current, box.current), false)
      }}
    >
      <div className="preview-bar">
        <button type="button" className="icon-button zooming" aria-label="Smaller" title="Smaller (-)" onClick={() => zoom(0.8)}>
          <Icon name="minus" size={14} />
        </button>
        <button type="button" className="quiet zooming" title="Fit (0)" onClick={fit}>
          {Math.round(view.scale * 100)}%
        </button>
        <button type="button" className="icon-button zooming" aria-label="Bigger" title="Bigger (+)" onClick={() => zoom(1.25)}>
          <Icon name="plus" size={14} />
        </button>
        <button type="button" className="icon-button" aria-label="Close" title="Close (Esc)" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </div>

      <img
        ref={picture}
        src={src}
        alt=""
        draggable={false}
        style={{
          transform: `translate(${String(view.x)}px, ${String(view.y)}px) scale(${String(view.scale)})`,
          cursor: view.scale > 1 ? 'grab' : 'zoom-in',
        }}
      />
    </div>,
    document.body,
  )
}
