import { useCallback, useEffect, useRef, useState } from 'react'

import { Icon } from '../ui/Icon'

/**
 * One picture, filling the window.
 *
 * It opens at the size that fits. Zooming is the scroll wheel, the buttons or
 * the keys; past the edges of the window it is dragged. Escape closes it, and
 * so does a press on the darkness around it.
 */

const LEAST = 0.2
const MOST = 8

const closer = (scale: number, by: number): number => Math.min(MOST, Math.max(LEAST, scale * by))

export function Preview({ src, onClose }: { readonly src: string; readonly onClose: () => void }): React.JSX.Element {
  const [scale, setScale] = useState(1)
  const [at, setAt] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const from = useRef<{ x: number; y: number; at: { x: number; y: number } } | undefined>(undefined)

  const fit = useCallback(() => {
    setScale(1)
    setAt({ x: 0, y: 0 })
  }, [])

  const zoom = useCallback((by: number) => {
    setScale((held) => {
      const next = closer(held, by)
      if (next === 1) setAt({ x: 0, y: 0 })
      return next
    })
  }, [])

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

  return (
    <div
      className="preview"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onWheel={(event) => zoom(event.deltaY < 0 ? 1.12 : 0.89)}
    >
      <div className="preview-bar">
        <button type="button" className="icon-button" aria-label="Smaller" title="Smaller (-)" onClick={() => zoom(0.8)}>
          <Icon name="minus" size={14} />
        </button>
        <button type="button" className="quiet" title="Fit (0)" onClick={fit}>
          {Math.round(scale * 100)}%
        </button>
        <button type="button" className="icon-button" aria-label="Bigger" title="Bigger (+)" onClick={() => zoom(1.25)}>
          <Icon name="plus" size={14} />
        </button>
        <button type="button" className="icon-button" aria-label="Close" title="Close (Esc)" onClick={onClose}>
          <Icon name="close" size={14} />
        </button>
      </div>

      <img
        src={src}
        alt=""
        draggable={false}
        style={{
          transform: `translate(${String(at.x)}px, ${String(at.y)}px) scale(${String(scale)})`,
          cursor: scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
        }}
        onDoubleClick={() => (scale > 1 ? fit() : zoom(2))}
        onMouseDown={(event) => {
          if (scale <= 1) return
          event.preventDefault()
          from.current = { x: event.clientX, y: event.clientY, at }
          setDragging(true)
        }}
        onMouseMove={(event) => {
          const held = from.current
          if (held === undefined) return
          setAt({ x: held.at.x + event.clientX - held.x, y: held.at.y + event.clientY - held.y })
        }}
        onMouseUp={() => {
          from.current = undefined
          setDragging(false)
        }}
        onMouseLeave={() => {
          from.current = undefined
          setDragging(false)
        }}
      />
    </div>
  )
}
