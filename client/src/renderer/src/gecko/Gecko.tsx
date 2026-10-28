import { useEffect, useId, useRef, useState } from 'react'

import type { GeckoPose, GeckoView } from '../../../shared/gecko'

/** What a screen reader and the tooltip say; review is not said on its own. */
export function named(pose: GeckoPose, count: number): string {
  if (pose === 'waiting') return `${String(count)} ${count === 1 ? 'conversation' : 'conversations'} waiting for you`
  return pose === 'working' ? 'Claude is working' : 'Nothing running'
}

/** Where it looks, each from -1 to 1: right and down are positive. */
export interface Look {
  readonly x: number
  readonly y: number
}

const INK = '#2b211c'
const PAD = '#bfe3c8'
const BLUSH = '#f6a8bc'

/** An eye: a small dot that follows the look and closes in a blink, the shut arc of sleep and the upturned arc of a happy face. */
function Eye({ x, y, side }: { readonly x: number; readonly y: number; readonly side: 'l' | 'r' }): React.JSX.Element {
  return (
    <g className={`gk-eye gk-eye-${side}`}>
      <g className="gk-pupil">
        <ellipse className="gk-dot" cx={x} cy={y} rx="2.5" ry="2.8" fill={INK} />
        <circle className="gk-dot" cx={x - 0.8} cy={y - 1} r="0.7" fill="#fff" />
      </g>
      <path className="gk-shut" d={`M${String(x - 2.8)} ${String(y - 0.4)} Q${String(x)} ${String(y + 2.2)} ${String(x + 2.8)} ${String(y - 0.4)}`} fill="none" stroke={INK} strokeWidth="1" strokeLinecap="round" />
      <path className="gk-happy" d={`M${String(x - 2.8)} ${String(y + 0.8)} Q${String(x)} ${String(y - 2.4)} ${String(x + 2.8)} ${String(y + 0.8)}`} fill="none" stroke={INK} strokeWidth="1.1" strokeLinecap="round" />
    </g>
  )
}

/** A sole turned to the person: one big pad and three toe pads, a little darker than the skin. */
function Sole({ x, y }: { readonly x: number; readonly y: number }): React.JSX.Element {
  return (
    <g>
      <ellipse cx={x} cy={y + 1.2} rx="2.6" ry="2.1" fill={PAD} />
      {[-2.9, 0, 2.9].map((dx) => <circle key={dx} cx={x + dx} cy={y - (dx === 0 ? 2.6 : 1.8)} r="1.1" fill={PAD} />)}
    </g>
  )
}

/** The gecko in the soft, flat style of its reference: white with a mint tint, no outlines, dot eyes, pink blush. Sitting for working, waiting and review; lying on its belly asleep. Each part moves on its own. */
function Drawing(): React.JSX.Element {
  const id = useId().replace(/[^\w-]/g, '')
  const skin = `url(#${id}-skin)`
  const soft = `url(#${id}-soft)`
  const tail = 'M58 79 C 71 82, 80.6 75, 80.6 65 C 80.6 56.6, 72.4 53.4, 67.8 57.4 C 64.6 60.4, 66.6 65.6, 70.8 64.8 C 73.4 64.2, 73.8 61, 71.6 60.2'
  return (
    <svg className="gk-art" viewBox="12 17 78 78" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-skin`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#dcf1e1" />
        </linearGradient>
        <filter id={`${id}-soft`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>
      <ellipse className="gk-shadow" cx="50" cy="87" rx="30" ry="3.6" fill="#06280f" opacity="0.2" />
      <g className="gk-hop">
        <g className="gk-press">
          <g className="gk-wiggle">
            <g className="gk-bob">
              <g className="gk-sit">
                <g className="gk-tail">
                  <path d="M58 79 C 70 82, 79 77, 80.4 68" fill="none" stroke={skin} strokeWidth="8" strokeLinecap="round" />
                  <path d={tail} fill="none" stroke={skin} strokeWidth="4.4" strokeLinecap="round" />
                  <path d="M71.6 60.2 C 69.4 59.6, 68.4 62.4, 70.4 63" fill="none" stroke="#cfe8d5" strokeWidth="0.7" strokeLinecap="round" />
                </g>
                <g className="gk-breathe">
                  <path d="M50 52 C 63 52, 69 63, 68 72 C 67 81, 60 85, 50 85 C 40 85, 33 81, 32 72 C 31 63, 37 52, 50 52 Z" fill={skin} />
                  <ellipse cx="50" cy="73" rx="10.5" ry="9.5" fill="#fff" opacity="0.85" />
                  <ellipse cx="50" cy="59" rx="13" ry="3" fill="#bfe0c7" opacity="0.6" filter={soft} />
                  <g>
                    <ellipse cx="36" cy="81.5" rx="6.6" ry="5.6" fill={skin} />
                    <Sole x={36} y={82} />
                    <ellipse cx="64" cy="81.5" rx="6.6" ry="5.6" fill={skin} />
                    <Sole x={64} y={82} />
                  </g>
                  <g className="gk-foot gk-foot-l">
                    <ellipse cx="40.4" cy="66.4" rx="3.6" ry="7" fill={skin} transform="rotate(18 40.4 66.4)" />
                    <path d="M42.6 61 C 44.6 65, 44.4 70, 42 72.6" fill="none" stroke="#cfe8d5" strokeWidth="0.8" strokeLinecap="round" />
                  </g>
                  <g className="gk-foot gk-foot-r">
                    <ellipse cx="59.6" cy="66.4" rx="3.6" ry="7" fill={skin} transform="rotate(-18 59.6 66.4)" />
                    <path d="M57.4 61 C 55.4 65, 55.6 70, 58 72.6" fill="none" stroke="#cfe8d5" strokeWidth="0.8" strokeLinecap="round" />
                  </g>
                  <g className="gk-head-pose">
                    <g className="gk-head-look">
                      <g className="gk-head">
                        <path d="M50 21 C 64.5 21, 73 32, 73 43 C 73 53, 63 58.6, 50 58.6 C 37 58.6, 27 53, 27 43 C 27 32, 35.5 21, 50 21 Z" fill={skin} />
                        <ellipse cx="44" cy="28" rx="9" ry="3.4" fill="#fff" opacity="0.9" />
                        <circle cx="48.6" cy="47.6" r="0.6" fill={INK} opacity="0.7" />
                        <circle cx="51.4" cy="47.6" r="0.6" fill={INK} opacity="0.7" />
                        <ellipse cx="36.4" cy="48.6" rx="3.6" ry="2.2" fill={BLUSH} opacity="0.85" />
                        <ellipse cx="63.6" cy="48.6" rx="3.6" ry="2.2" fill={BLUSH} opacity="0.85" />
                        <path className="gk-mouth gk-mouth-smile" d="M47 50.6 Q50 53.2 53 50.6" fill="none" stroke={INK} strokeWidth="1" strokeLinecap="round" />
                        <ellipse className="gk-mouth gk-mouth-o" cx="50" cy="52" rx="1.2" ry="1.6" fill={INK} />
                        <path className="gk-mouth gk-mouth-happy" d="M45.6 50.2 Q50 55 54.4 50.2" fill="none" stroke={INK} strokeWidth="1.1" strokeLinecap="round" />
                        <Eye x={39.6} y={43} side="l" />
                        <Eye x={60.4} y={43} side="r" />
                      </g>
                    </g>
                  </g>
                </g>
              </g>
              <g className="gk-lie">
                <g className="gk-lie-tail">
                  <path d="M80 81.6 C 88 81.6, 92.6 76, 90.4 71 C 88.4 67, 83.6 67.6, 83.6 71.2 C 83.6 73.6, 86.4 74.4, 87.4 72.6" fill="none" stroke={skin} strokeWidth="4.4" strokeLinecap="round" />
                </g>
                <g className="gk-lie-back">
                  <path d="M38 85 C 36 68, 49 57, 64 57 C 78 57, 86.6 66, 85.6 75.6 C 85 82, 80 85, 73 85 Z" fill={skin} />
                  <path d="M66 78 C 71 73, 77 75, 78 82" fill="none" stroke="#cfe8d5" strokeWidth="0.9" strokeLinecap="round" />
                  <ellipse cx="62" cy="61.6" rx="9" ry="2.6" fill="#fff" opacity="0.9" />
                </g>
                <g className="gk-lie-head">
                  <path d="M32 58 C 43 58, 49 65, 49 72 C 49 79, 42 84, 32 84 C 22 84, 16 79, 16 72 C 16 65, 21 58, 32 58 Z" fill={skin} />
                  <ellipse cx="28" cy="62" rx="7" ry="2.4" fill="#fff" opacity="0.9" />
                  <ellipse cx="21.6" cy="75.4" rx="3" ry="1.8" fill={BLUSH} opacity="0.85" />
                  <ellipse cx="41.4" cy="75.4" rx="3" ry="1.8" fill={BLUSH} opacity="0.85" />
                  <circle cx="30.2" cy="77.4" r="0.55" fill={INK} opacity="0.7" />
                  <circle cx="33" cy="77.4" r="0.55" fill={INK} opacity="0.7" />
                  <path d="M20.4 71 Q23.4 73.4 26.4 71" fill="none" stroke={INK} strokeWidth="1" strokeLinecap="round" />
                  <g className="gk-peek-shut">
                    <path d="M36.4 71 Q39.4 73.4 42.4 71" fill="none" stroke={INK} strokeWidth="1" strokeLinecap="round" />
                  </g>
                  <ellipse className="gk-peek-open" cx="39.4" cy="71.4" rx="2.1" ry="1.3" fill={INK} />
                </g>
                <ellipse cx="33" cy="84.6" rx="9" ry="2.8" fill={skin} />
                <path d="M33 82.6 L33 86" stroke="#cfe8d5" strokeWidth="0.7" strokeLinecap="round" />
              </g>
            </g>
          </g>
        </g>
      </g>
    </svg>
  )
}

/** The panel, drawn from what it is told: the floating window and the preview use the same one. */
export function GeckoPanel({
  pose,
  count,
  hopping = false,
  moving = true,
  blinking = false,
  tilting = false,
  hovering = false,
  pressing = false,
  look = { x: 0, y: 0 },
  onHopped,
}: GeckoView & {
  readonly hopping?: boolean
  /** False while the panel is not seen, and in stills: nothing animates. */
  readonly moving?: boolean
  readonly blinking?: boolean
  readonly tilting?: boolean
  readonly hovering?: boolean
  readonly pressing?: boolean
  readonly look?: Look
  readonly onHopped?: () => void
}): React.JSX.Element {
  const name = named(pose, count)
  const classes = [
    'gecko-panel',
    `gecko-${pose}`,
    hopping ? 'gecko-hop' : '',
    moving ? '' : 'gecko-still',
    blinking ? 'gecko-blink' : '',
    tilting ? 'gecko-tilt' : '',
    hovering ? 'gecko-hover' : '',
    pressing ? 'gecko-press' : '',
  ].filter((one) => one !== '')
  return (
    <div
      className={classes.join(' ')}
      role="img"
      aria-label={name}
      title={name}
      style={{ '--lx': look.x.toFixed(3), '--ly': look.y.toFixed(3) } as React.CSSProperties}
      onAnimationEnd={(event) => {
        if (event.animationName === 'gk-hop') onHopped?.()
      }}
    >
      <Drawing />
      {pose === 'waiting' && count > 1 ? <span className="gecko-count" aria-hidden="true">{count}</span> : null}
    </div>
  )
}

const reduced = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches
const still = (): boolean => document.hidden || reduced()

/** Whether the panel is seen: hidden, nothing animates. */
function useSeen(): boolean {
  const [seen, setSeen] = useState(() => !document.hidden)
  useEffect(() => {
    const look = (): void => setSeen(!document.hidden)
    document.addEventListener('visibilitychange', look)
    return () => document.removeEventListener('visibilitychange', look)
  }, [])
  return seen
}

/** A blink now and then while its eyes are open, sometimes with a tilt of the head: one short timer at a time, none while asleep or not seen. */
function useFidget(awake: boolean): { readonly blinking: boolean; readonly tilting: boolean } {
  const [blinking, setBlinking] = useState(false)
  const [tilting, setTilting] = useState(false)
  useEffect(() => {
    if (!awake) return
    let timer: ReturnType<typeof setTimeout>
    const next = (): void => {
      timer = setTimeout(
        () => {
          if (still()) return next()
          const tilt = Math.random() < 0.35
          setBlinking(true)
          setTilting(tilt)
          timer = setTimeout(() => {
            setBlinking(false)
            timer = setTimeout(() => {
              setTilting(false)
              next()
            }, tilt ? 900 : 0)
          }, 160)
        },
        2500 + Math.random() * 4000,
      )
    }
    next()
    return () => {
      clearTimeout(timer)
      setBlinking(false)
      setTilting(false)
    }
  }, [awake])
  return { blinking, tilting }
}

/** Where the cursor is from the gecko's eyes, as a look: the direction, weaker when it is close. */
function lookAt(cursor: { readonly x: number; readonly y: number }): Look {
  const dx = cursor.x - (window.screenX + window.innerWidth / 2)
  const dy = cursor.y - (window.screenY + window.innerHeight * 0.36)
  const far = Math.hypot(dx, dy)
  if (far < 1) return { x: 0, y: 0 }
  const reach = Math.min(1, far / 240)
  return { x: (dx / far) * reach, y: (dy / far) * reach }
}

/** The floating gecko: told its state and the cursor by main, pressed to open the one that waits, dragged anywhere. */
export function Gecko(): React.JSX.Element | null {
  const [view, setView] = useState<GeckoView | undefined>()
  const [hopping, setHopping] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [pressing, setPressing] = useState(false)
  const [look, setLook] = useState<Look>({ x: 0, y: 0 })
  const seen = useSeen()
  const { blinking, tilting } = useFidget(seen && view !== undefined && view.pose !== 'asleep')
  const held = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | undefined>(undefined)

  useEffect(() => {
    void window.geckit.gecko.state().then(setView)
    const off = window.geckit.gecko.onState((next) => {
      setView(next)
      // Waiting drops a hop under way: the person has something more urgent to see.
      if (next.pose === 'waiting') setHopping(false)
    })
    // Reduced motion and a panel not seen keep the still pose; the hop is not saved for later.
    const offHop = window.geckit.gecko.onHop(() => {
      if (!still()) setHopping(true)
    })
    // The eyes follow even with reduced motion: a look is a pose, not a movement.
    const offCursor = window.geckit.gecko.onCursor((cursor) => setLook(lookAt(cursor)))
    return () => {
      off()
      offHop()
      offCursor()
    }
  }, [])

  if (view === undefined) return null
  return (
    <div
      className="gecko-window"
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.currentTarget.setPointerCapture(event.pointerId)
        held.current = { x: event.screenX, y: event.screenY, left: window.screenX, top: window.screenY, moved: false }
      }}
      onPointerMove={(event) => {
        const from = held.current
        if (from === undefined) return
        // A release that never arrived, as outside the window: the drag is over.
        if (event.buttons === 0) {
          held.current = undefined
          return
        }
        const dx = event.screenX - from.x
        const dy = event.screenY - from.y
        if (!from.moved && Math.hypot(dx, dy) < 4) return
        from.moved = true
        window.geckit.gecko.move(from.left + dx, from.top + dy)
      }}
      onPointerUp={() => {
        const from = held.current
        held.current = undefined
        if (from === undefined || from.moved) return
        if (reduced()) {
          window.geckit.gecko.press()
          return
        }
        // A little squash first, then GeckIt comes forward.
        setPressing(true)
        setTimeout(() => {
          setPressing(false)
          window.geckit.gecko.press()
        }, 170)
      }}
      onPointerCancel={() => {
        held.current = undefined
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        window.geckit.gecko.menu()
      }}
    >
      <GeckoPanel
        {...view}
        hopping={hopping}
        moving={seen}
        blinking={blinking}
        tilting={tilting}
        hovering={hovering}
        pressing={pressing}
        look={look}
        onHopped={() => setHopping(false)}
      />
    </div>
  )
}
