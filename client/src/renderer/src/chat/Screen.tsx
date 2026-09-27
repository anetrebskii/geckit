import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { ScreenControl, ScreenControlled, ScreenModifier } from '../../../shared/api'
import { screenLink } from '../screen-link'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { pairedName } from './PhoneHosts'

/**
 * The host's screen on the phone, the host being the one the phone works through. Look: pinch to get close, drag to move over
 * it, double tap to go in and back out. Control works it as a trackpad: a
 * finger moves the Mac's pointer, a tap clicks where the pointer is, a hold
 * and then a drag selects or moves, two fingers scroll, a two-finger tap is
 * the right click, and a pinch still zooms, with the picture following the
 * pointer once zoomed in. The Mac sends the picture only while this is open.
 * What it looks like and why is in docs/ux/phone-control.md.
 */

const MOST = 5
const HOLD = 350
const TAP = 250
const AGAIN = 400
const MODE = 'geckit.screenMode'

interface View {
  readonly scale: number
  readonly x: number
  readonly y: number
}

interface Point {
  readonly x: number
  readonly y: number
}

type Mode = 'look' | 'control'

const FIT: View = { scale: 1, x: 0, y: 0 }

const KEYS: readonly { readonly key: string; readonly label: string }[] = [
  { key: 'escape', label: 'esc' },
  { key: 'tab', label: 'tab' },
  { key: 'left', label: '←' },
  { key: 'up', label: '↑' },
  { key: 'down', label: '↓' },
  { key: 'right', label: '→' },
]

const MODIFIERS: readonly { readonly modifier: ScreenModifier; readonly label: string }[] = [
  { modifier: 'command', label: '⌘' },
  { modifier: 'option', label: '⌥' },
  { modifier: 'control', label: '⌃' },
  { modifier: 'shift', label: '⇧' },
]

// What a touch is doing, decided as it goes: one finger moves the pointer or drags, two scroll or pinch, and what is left once two have been down does nothing until every finger is up.
type Gesture =
  | { readonly kind: 'one'; readonly at: number; readonly from: Point; moved: boolean; holding: boolean; last: Point; lastAt: number }
  | { readonly kind: 'two'; readonly at: number; readonly from: Point; readonly span: number; readonly view: View; lock: 'none' | 'scroll' | 'pinch'; last: Point }
  | { readonly kind: 'spent' }

export function Screen({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  const video = useRef<HTMLVideoElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const [trouble, setTrouble] = useState<string | undefined>(() =>
    screenLink() === undefined ? 'Only the phone shows the host\'s screen.' : undefined,
  )
  const [live, setLive] = useState(false)
  const [tries, setTries] = useState(0)
  const [chrome, setChrome] = useState(true)
  const [view, setView] = useState<View>(FIT)
  const viewNow = useRef(view)
  const [mode, setMode] = useState<Mode>(() => (localStorage.getItem(MODE) === 'control' ? 'control' : 'look'))
  const [refused, setRefused] = useState<string | undefined>(undefined)
  const [hint, setHint] = useState(true)
  const [typing, setTyping] = useState(false)
  const [held, setHeld] = useState<readonly ScreenModifier[]>([])
  const heldNow = useRef(held)
  useLayoutEffect(() => {
    viewNow.current = view
    heldNow.current = held
  }, [view, held])
  const field = useRef<HTMLTextAreaElement>(null)
  const touches = useRef(new Map<number, Point>())
  const start = useRef<{ view: View; mid: Point; span: number } | undefined>(undefined)
  const lastTap = useRef(0)
  const gesture = useRef<Gesture | undefined>(undefined)
  const holdTimer = useRef(0)
  const clicks = useRef({ at: 0, count: 0 })
  const pending = useRef({ dx: 0, dy: 0, sx: 0, sy: 0, frame: 0 })

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
      if (event.key === 'Escape' && !typing) onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose, typing])

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

  // The picture's size on the phone at the scale it is drawn, and where it starts in the stage before the zoom.
  const drawn = (box: DOMRect): { wide: number; high: number; left: number; top: number } | undefined => {
    const wide = video.current?.videoWidth ?? 0
    const high = video.current?.videoHeight ?? 0
    if (wide === 0 || high === 0) return undefined
    const fit = Math.min(box.width / wide, box.height / high)
    return { wide: wide * fit, high: high * fit, left: (box.width - wide * fit) / 2, top: (box.height - high * fit) / 2 }
  }

  // Once zoomed in, the picture moves to keep the pointer away from its edges, as a magnifier follows it.
  const follow = useCallback(
    (pointer: Point): void => {
      const box = stage.current?.getBoundingClientRect()
      const size = box === undefined ? undefined : drawn(box)
      const now = viewNow.current
      if (box === undefined || size === undefined || now.scale <= 1) return
      const at = { x: now.x + (size.left + pointer.x * size.wide) * now.scale, y: now.y + (size.top + pointer.y * size.high) * now.scale }
      const edge = { x: box.width * 0.2, y: box.height * 0.2 }
      const shift = (value: number, room: number, margin: number): number =>
        value < margin ? margin - value : value > room - margin ? room - margin - value : 0
      const dx = shift(at.x, box.width, edge.x)
      const dy = shift(at.y, box.height, edge.y)
      if (dx !== 0 || dy !== 0) setView(kept({ ...now, x: now.x + dx, y: now.y + dy }, box))
    },
    [kept],
  )

  const order = useCallback(
    (one: ScreenControl): void => {
      void screenLink()
        ?.control(one)
        .then((done: ScreenControlled) => {
          if ('error' in done) {
            setRefused(done.error)
            return
          }
          follow(done)
        })
    },
    [follow],
  )

  useEffect(() => {
    localStorage.setItem(MODE, mode)
    if (mode === 'control') order({ kind: 'where' })
  }, [mode, order])

  // Moves and scrolls are gathered to one message a frame, so a fast swipe is not a flood of them to the Mac.
  const flush = useCallback((): void => {
    const now = pending.current
    now.frame = 0
    if (now.dx !== 0 || now.dy !== 0) order({ kind: 'move', dx: now.dx, dy: now.dy })
    if (now.sx !== 0 || now.sy !== 0) order({ kind: 'scroll', dx: now.sx, dy: now.sy })
    now.dx = now.dy = now.sx = now.sy = 0
  }, [order])
  const gather = (move: Partial<Record<'dx' | 'dy' | 'sx' | 'sy', number>>): void => {
    const now = pending.current
    now.dx += move.dx ?? 0
    now.dy += move.dy ?? 0
    now.sx += move.sx ?? 0
    now.sy += move.sy ?? 0
    if (now.frame === 0) now.frame = requestAnimationFrame(flush)
  }

  const press = (key: string): void => {
    order({ kind: 'key', key, modifiers: heldNow.current })
    setHeld([])
  }

  useEffect(() => {
    const input = field.current
    if (input === null) return
    const typed = (event: InputEvent): void => {
      event.preventDefault()
      const text = event.data ?? ''
      if (event.inputType === 'insertText' && text !== '') {
        if (heldNow.current.length > 0 && text.length === 1) press(text === ' ' ? 'space' : text)
        else order({ kind: 'type', text })
      } else if (event.inputType === 'insertLineBreak' || event.inputType === 'insertParagraph') press('return')
      else if (event.inputType === 'deleteContentBackward') press('delete')
    }
    input.addEventListener('beforeinput', typed)
    return () => input.removeEventListener('beforeinput', typed)
  })

  const mid = (): { x: number; y: number; span: number } => {
    const points = [...touches.current.values()]
    const [one, two] = points
    if (one === undefined) return { x: 0, y: 0, span: 0 }
    if (two === undefined) return { x: one.x, y: one.y, span: 0 }
    return { x: (one.x + two.x) / 2, y: (one.y + two.y) / 2, span: Math.hypot(one.x - two.x, one.y - two.y) }
  }

  const dropHold = (): void => window.clearTimeout(holdTimer.current)

  const controlDown = (): void => {
    setHint(false)
    const at = mid()
    const now = Date.now()
    dropHold()
    if (touches.current.size === 1) {
      const one: Gesture = { kind: 'one', at: now, from: at, moved: false, holding: false, last: at, lastAt: now }
      gesture.current = one
      holdTimer.current = window.setTimeout(() => {
        if (one.moved || gesture.current !== one) return
        one.holding = true
        tap('firm')
        order({ kind: 'press', down: true })
      }, HOLD)
      return
    }
    const was = gesture.current
    if (was?.kind === 'one' && was.holding) order({ kind: 'press', down: false })
    gesture.current =
      touches.current.size === 2 && (was?.kind !== 'one' || !was.moved || was.holding || now - was.at < 150)
        ? { kind: 'two', at: was?.kind === 'one' ? was.at : now, from: at, span: at.span, view: viewNow.current, lock: 'none', last: at }
        : { kind: 'spent' }
  }

  const controlMove = (box: DOMRect): void => {
    const now = gesture.current
    const size = drawn(box)
    if (now === undefined || size === undefined) return
    const at = mid()
    const scale = viewNow.current.scale
    if (now.kind === 'one') {
      if (Math.hypot(at.x - now.from.x, at.y - now.from.y) > 6) now.moved = true
      if (!now.moved) return
      dropHold()
      const dx = at.x - now.last.x
      const dy = at.y - now.last.y
      const time = Math.max(1, Date.now() - now.lastAt)
      // Slow is exact and quick goes far, as on a trackpad; a drag is never sped up, so what is dragged lands under the finger.
      const gain = now.holding ? 1 : 1 + Math.min(2.5, Math.max(0, Math.hypot(dx, dy) / time - 0.2) * 2)
      gather({ dx: (dx * gain) / (size.wide * scale), dy: (dy * gain) / (size.high * scale) })
      now.last = at
      now.lastAt = Date.now()
      return
    }
    if (now.kind !== 'two') return
    if (now.lock === 'none') {
      const spread = Math.abs(at.span - now.span)
      const shift = Math.hypot(at.x - now.from.x, at.y - now.from.y)
      if (spread > 24) now.lock = 'pinch'
      else if (shift > 10) now.lock = 'scroll'
      else return
    }
    if (now.lock === 'scroll') {
      gather({ sx: (at.x - now.last.x) / (size.wide * scale), sy: (at.y - now.last.y) / (size.high * scale) })
      now.last = at
      return
    }
    const next = (now.view.scale * at.span) / Math.max(1, now.span)
    const ratio = next / now.view.scale
    setView(kept({ scale: next, x: at.x - (now.from.x - now.view.x) * ratio, y: at.y - (now.from.y - now.view.y) * ratio }, box))
  }

  const controlUp = (): void => {
    const now = gesture.current
    dropHold()
    if (now?.kind === 'one' && touches.current.size === 0) {
      gesture.current = undefined
      if (now.holding) {
        order({ kind: 'press', down: false })
        return
      }
      if (now.moved || Date.now() - now.at > TAP + HOLD) return
      const time = Date.now()
      const count = time - clicks.current.at < AGAIN ? Math.min(3, clicks.current.count + 1) : 1
      clicks.current = { at: time, count }
      tap('light')
      order({ kind: 'click', button: 'left', count })
      return
    }
    if (now?.kind === 'two') {
      if (now.lock === 'none' && Date.now() - now.at < TAP * 2) {
        tap('light')
        order({ kind: 'click', button: 'right', count: 1 })
      }
      gesture.current = touches.current.size === 0 ? undefined : { kind: 'spent' }
      return
    }
    if (touches.current.size === 0) gesture.current = undefined
  }

  const shown = mode === 'control' && live

  return createPortal(
    <div className={`phone-screen${chrome ? '' : ' bare'}`}>
      <div className={`phone-screen-bar${chrome ? '' : ' hidden'}`}>
        <span className="phone-screen-title">
          {pairedName() ?? 'Host'}
          {live ? <span className="phone-screen-live">Live</span> : null}
        </span>
        <div className="phone-seg phone-screen-seg" role="tablist" style={{ '--at': mode === 'look' ? 0 : 1 } as React.CSSProperties}>
          <span className="phone-seg-thumb" />
          {(['look', 'control'] as const).map((one) => (
            <button
              key={one}
              type="button"
              role="tab"
              aria-selected={mode === one}
              className={mode === one ? 'on' : undefined}
              onClick={() => {
                setRefused(undefined)
                setHint(true)
                setMode(one)
                if (one === 'look') field.current?.blur()
              }}
            >
              {one === 'look' ? 'Look' : 'Control'}
            </button>
          ))}
        </div>
        <span className="spacer" />
        <button type="button" className="phone-screen-done icon" aria-label="Hide the bars" onClick={() => setChrome(false)}>
          <Icon name="collapse" size={18} />
        </button>
        <button type="button" className="phone-screen-done" onClick={onClose}>
          Done
        </button>
      </div>
      <div
        ref={stage}
        className="phone-screen-stage"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          const box = event.currentTarget.getBoundingClientRect()
          touches.current.set(event.pointerId, { x: event.clientX - box.left, y: event.clientY - box.top })
          if (shown) return controlDown()
          const at = mid()
          start.current = { view, mid: { x: at.x, y: at.y }, span: at.span }
        }}
        onPointerMove={(event) => {
          if (!touches.current.has(event.pointerId)) return
          const box = event.currentTarget.getBoundingClientRect()
          touches.current.set(event.pointerId, { x: event.clientX - box.left, y: event.clientY - box.top })
          if (shown) return controlMove(box)
          if (start.current === undefined) return
          const at = mid()
          const from = start.current
          const scale = from.span === 0 || at.span === 0 ? from.view.scale : (from.view.scale * at.span) / from.span
          // The point under the fingers stays under them while the scale changes.
          const ratio = scale / from.view.scale
          setView(kept({ scale, x: at.x - (from.mid.x - from.view.x) * ratio, y: at.y - (from.mid.y - from.view.y) * ratio }, box))
        }}
        onPointerUp={(event) => {
          const box = event.currentTarget.getBoundingClientRect()
          const point = touches.current.get(event.pointerId)
          touches.current.delete(event.pointerId)
          if (shown) return controlUp()
          const moved = start.current !== undefined && point !== undefined && Math.hypot(point.x - start.current.mid.x, point.y - start.current.mid.y) > 10
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
              if (lastTap.current === now) setChrome((on) => !on)
            }, 300)
          }
        }}
        onPointerCancel={(event) => {
          touches.current.delete(event.pointerId)
          start.current = undefined
          if (shown) controlUp()
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
            Asking the host for its screen
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
        {shown && hint && refused === undefined ? (
          <div className="phone-screen-hint">Move a finger to move the pointer and tap to click. Hold, then drag to select. Two fingers scroll; tap with two to right-click.</div>
        ) : null}
        {refused === undefined ? null : (
          <button type="button" className="phone-screen-refused" onClick={() => setRefused(undefined)}>
            {refused}
          </button>
        )}
        {chrome ? null : (
          <button type="button" className="phone-screen-peek" aria-label="Show the bars" onClick={() => setChrome(true)}>
            <Icon name="down" size={16} />
          </button>
        )}
      </div>
      <textarea
        ref={field}
        className="phone-screen-typing"
        aria-label="Type on the host"
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        value=""
        onChange={() => undefined}
        onFocus={() => setTyping(true)}
        onBlur={() => {
          setTyping(false)
          setHeld([])
        }}
      />
      {shown ? (
        // Pressing a key here keeps the phone's keyboard up rather than taking the focus from the field under it.
        <div
          className={`phone-screen-keys${chrome || typing ? '' : ' hidden'}`}
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button
            type="button"
            className={`phone-screen-key${typing ? ' on' : ''}`}
            aria-label={typing ? 'Hide the keyboard' : 'Type on the host'}
            onClick={() => (typing ? field.current?.blur() : field.current?.focus())}
          >
            <Icon name="keyboard" size={20} />
          </button>
          {MODIFIERS.map((one) => (
            <button
              key={one.modifier}
              type="button"
              className={`phone-screen-key${held.includes(one.modifier) ? ' on' : ''}`}
              aria-pressed={held.includes(one.modifier)}
              onClick={() => setHeld((all) => (all.includes(one.modifier) ? all.filter((it) => it !== one.modifier) : [...all, one.modifier]))}
            >
              {one.label}
            </button>
          ))}
          {KEYS.map((one) => (
            <button key={one.key} type="button" className="phone-screen-key" onClick={() => press(one.key)}>
              {one.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>,
    document.body,
  )
}
