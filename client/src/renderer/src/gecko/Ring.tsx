import { useEffect, useRef, useState } from 'react'

import type { GeckoAction, GeckoItem, GeckoRing } from '../../../shared/gecko'

/** Each item's glyph, the demo's own, drawn in 24 units. */
function Glyph({ action }: { readonly action: GeckoAction }): React.JSX.Element {
  const line = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {action === 'screenshot' ? (
        <>
          <path d="M4 8h3l2-3h6l2 3h3v11H4z" {...line} />
          <circle cx="12" cy="13" r="3.6" {...line} />
        </>
      ) : action === 'task' ? (
        <path d="M12 5v14M5 12h14" {...line} strokeWidth={2} />
      ) : action === 'voice' ? (
        <>
          <rect x="9" y="3.5" width="6" height="11" rx="3" {...line} />
          <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" {...line} />
        </>
      ) : action === 'waiting' ? (
        <>
          <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" {...line} />
          <path d="M10 20.5h4" {...line} />
        </>
      ) : action === 'open' ? (
        <>
          <rect x="4" y="5" width="16" height="14" rx="3" {...line} />
          <path d="M4 9h16" {...line} />
        </>
      ) : (
        <>
          <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" {...line} />
          <circle cx="12" cy="12" r="2.6" {...line} />
          <path d="M4 20L20 4" {...line} />
        </>
      )}
    </svg>
  )
}

/** The menu as drawn round the gecko: the window and the preview use the same one. `open` sends the items out from the gecko. */
export function RingCard({
  laid,
  items,
  open = true,
  focus = true,
  onAct,
  onClose,
  onAim,
}: {
  readonly laid: GeckoRing
  readonly items: readonly GeckoItem[]
  readonly open?: boolean
  /** The first item takes the keyboard; not in the preview's stills. */
  readonly focus?: boolean
  readonly onAct: (action: GeckoAction) => void
  readonly onClose: () => void
  /** The item in focus, at its centre in the window: the gecko looks at it. */
  readonly onAim?: (x: number, y: number) => void
}): React.JSX.Element {
  const list = useRef<HTMLDivElement>(null)
  const cx = laid.gecko.x + laid.gecko.width / 2
  const cy = laid.gecko.y + laid.gecko.height / 2
  useEffect(() => {
    if (focus) list.current?.querySelector('button')?.focus({ preventScroll: true })
  }, [focus])
  return (
    <div
      ref={list}
      className={open ? 'gk-ring gk-ring-open' : 'gk-ring'}
      role="menu"
      aria-label="Gecko"
      style={{ '--k': laid.scale } as React.CSSProperties}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
          return
        }
        const by = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
        if (by === 0) return
        event.preventDefault()
        const buttons = [...(list.current?.querySelectorAll<HTMLButtonElement>('.gk-item') ?? [])]
        const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
        buttons[(at + by + buttons.length) % buttons.length]?.focus()
      }}
    >
      <span
        className="gk-ring-gecko"
        style={{ left: laid.gecko.x, top: laid.gecko.y, width: laid.gecko.width, height: laid.gecko.height }}
        onPointerDown={onClose}
      />
      {items.map((item, at) => {
        const spot = laid.items[at] ?? { x: cx, y: cy }
        return (
          <button
            key={item.action}
            type="button"
            role="menuitem"
            className="gk-item"
            style={{ left: cx, top: cy, '--x': `${String(spot.x - cx)}px`, '--y': `${String(spot.y - cy)}px`, '--i': at } as React.CSSProperties}
            onFocus={() => onAim?.(spot.x, spot.y)}
            onPointerEnter={(event) => event.currentTarget.focus({ preventScroll: true })}
            onClick={() => onAct(item.action)}
          >
            <span className="gk-disc">
              <Glyph action={item.action} />
              {item.count === undefined ? null : <b className="gk-cnt">{item.count}</b>}
            </span>
            <span className="gk-lbl">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** The menu's own window, kept hidden between presses: told how it is laid out each time, sends the items out, and goes with a choice, Esc, or a click beside them. */
export function Ring(): React.JSX.Element | null {
  const [shown, setShown] = useState<{ readonly laid: GeckoRing; readonly items: readonly GeckoItem[] } | undefined>()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const offShow = window.geckit.gecko.onRingShow((next) => {
      setOpen(false)
      setShown(next)
    })
    const offHide = window.geckit.gecko.onRingHide(() => {
      setOpen(false)
      setShown(undefined)
    })
    return () => {
      offShow()
      offHide()
    }
  }, [])
  useEffect(() => {
    if (shown === undefined) return
    window.geckit.gecko.ringShown()
    const frame = requestAnimationFrame(() => setOpen(true))
    return () => cancelAnimationFrame(frame)
  }, [shown])
  if (shown === undefined) return null
  return (
    <RingCard
      laid={shown.laid}
      items={shown.items}
      open={open}
      onAct={(action) => window.geckit.gecko.act(action)}
      onClose={() => window.geckit.gecko.close()}
      onAim={(x, y) => window.geckit.gecko.aim(window.screenX + x, window.screenY + y)}
    />
  )
}
