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

const RIM = '#0e5a22'

/** A limb as a rimmed stroke, and the splayed toes at its end, each ending in a round pad. */
function Limb({ d, foot, toes, skin, width = 4.6 }: { readonly d: string; readonly foot: readonly [number, number]; readonly toes: readonly number[]; readonly skin: string; readonly width?: number }): React.JSX.Element {
  const [x, y] = foot
  const ends = toes.map((deg) => [x + 3.6 * Math.cos((deg * Math.PI) / 180), y + 3.6 * Math.sin((deg * Math.PI) / 180)] as const)
  return (
    <>
      <path d={d} fill="none" stroke={RIM} strokeWidth={width + 2.2} strokeLinecap="round" strokeLinejoin="round" />
      {ends.map(([ex, ey]) => <path key={`${String(ex)}-r`} d={`M${String(x)} ${String(y)} L${ex.toFixed(2)} ${ey.toFixed(2)}`} stroke={RIM} strokeWidth="3.2" strokeLinecap="round" />)}
      <path d={d} fill="none" stroke={skin} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
      {ends.map(([ex, ey]) => <path key={`${String(ex)}-s`} d={`M${String(x)} ${String(y)} L${ex.toFixed(2)} ${ey.toFixed(2)}`} stroke={skin} strokeWidth="1.4" strokeLinecap="round" />)}
      {ends.map(([ex, ey]) => <circle key={`${String(ex)}-p`} cx={ex} cy={ey} r="1.5" fill={skin} stroke={RIM} strokeWidth="0.7" />)}
    </>
  )
}

/** A tail that tapers: the same path drawn wide for its first part, narrower further, thinnest to the tip. */
function Taper({ d, skin, widths }: { readonly d: string; readonly skin: string; readonly widths: readonly [number, number, number] }): React.JSX.Element {
  const parts = [45, 75, 100] as const
  return (
    <>
      {parts.map((dash, at) => <path key={`r${String(dash)}`} d={d} pathLength="100" fill="none" stroke={RIM} strokeWidth={widths[at]! + 2} strokeLinecap="round" strokeDasharray={`${String(dash)} 200`} />)}
      {parts.map((dash, at) => <path key={`s${String(dash)}`} d={d} pathLength="100" fill="none" stroke={skin} strokeWidth={widths[at]} strokeLinecap="round" strokeDasharray={`${String(dash)} 200`} />)}
    </>
  )
}

/** One eye on the side of the head: the white, a vertical slit pupil that follows the look and widens, the line of the upper lid, and the lid that closes over it. */
function Eye({ x, y, r, side, skin, clip }: { readonly x: number; readonly y: number; readonly r: number; readonly side: 'l' | 'r'; readonly skin: string; readonly clip: string }): React.JSX.Element {
  return (
    <g className={`gk-eye gk-eye-${side}`}>
      <clipPath id={clip}>
        <circle cx={x} cy={y} r={r} />
      </clipPath>
      <circle cx={x} cy={y} r={r + 1.1} fill={skin} stroke={RIM} strokeWidth="1" />
      <circle cx={x} cy={y} r={r} fill="#f2f7c8" stroke={RIM} strokeWidth="0.6" />
      <g clipPath={`url(#${clip})`}>
        <g className="gk-pupil">
          <rect className="gk-slit" x={x - r * 0.17} y={y - r * 0.8} width={r * 0.34} height={r * 1.6} rx={r * 0.17} fill="#10331a" />
          <circle cx={x - r * 0.38} cy={y - r * 0.4} r={r * 0.24} fill="#fff" />
        </g>
      </g>
      <path d={`M${String(x - r)} ${String(y - r * 0.25)} Q${String(x)} ${String(y - r * 1.25)} ${String(x + r)} ${String(y - r * 0.25)}`} fill="none" stroke={RIM} strokeWidth="0.8" strokeLinecap="round" />
      <circle className="gk-lid" cx={x} cy={y} r={r + 0.3} fill={skin} stroke={RIM} strokeWidth="0.8" />
    </g>
  )
}

/** The darker spots of its skin, as on the icon's gecko: x, y and size. */
const SPOTS = [[47, 34, 1.3], [41, 31, 0.9], [52, 64, 1.6], [58, 70, 1.3], [63, 76, 1.5], [56, 78, 1], [77, 87, 1.1]] as const

/** The gecko sitting up on its front legs, three-quarter toward the person, in parts that move on their own: tail, body, legs, head, each eye with its lid and pupil. */
function Drawing(): React.JSX.Element {
  const id = useId().replace(/[^\w-]/g, '')
  const skin = `url(#${id}-skin)`
  const tail = 'M68 82 C 80 89, 92 86, 92 74 C 92 63, 81 61, 79 68 C 78 72, 82 74, 84 71'
  const wrapped = 'M70 84 C 76 92, 60 95, 44 94 C 32 93, 25 91, 27 87'
  return (
    <svg className="gk-art" viewBox="9 13 88 88" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-skin`} gradientUnits="userSpaceOnUse" x1="0" y1="24" x2="0" y2="94">
          <stop offset="0" stopColor="#86e690" />
          <stop offset="0.45" stopColor="#47c257" />
          <stop offset="1" stopColor="#1c8c33" />
        </linearGradient>
      </defs>
      <ellipse className="gk-shadow" cx="56" cy="92" rx="30" ry="3" fill="#06280f" opacity="0.18" />
      <g className="gk-hop">
        <g className="gk-press">
          <g className="gk-wiggle">
            <g className="gk-bob">
              <g className="gk-tail">
                <Taper d={tail} skin={skin} widths={[7, 5, 3]} />
              </g>
              <g className="gk-breathe">
                <Limb d="M64 76 Q74 76 75 88" foot={[75, 88]} toes={[200, 150, 100, 50]} skin={skin} width={5.4} />
                <g className="gk-foot gk-foot-r">
                  <Limb d="M54 62 Q60 70 57 78 Q55 82 55 86" foot={[55, 86]} toes={[160, 120, 75, 30]} skin={skin} />
                </g>
                <path d="M41 47 C 49 45, 57 52, 62 60 C 70 70, 74 84, 62 85.5 C 51 86.5, 45 76, 42 67 C 40 61, 37 51, 41 47 Z" fill={skin} stroke={RIM} strokeWidth="1.1" />
                <path d="M48 52 C 54 54, 60 61, 64 69" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.4" />
                {SPOTS.slice(2).map(([x, y, r]) => <circle key={`${String(x)}-${String(y)}`} cx={x} cy={y} r={r} fill="#1f8f36" opacity="0.5" />)}
                <g className="gk-wrapped">
                  <Taper d={wrapped} skin={skin} widths={[6, 4.4, 2.8]} />
                </g>
                <g className="gk-foot gk-foot-l">
                  <Limb d="M44 62 Q33 67 35 76 Q37 81 36 87" foot={[36, 87]} toes={[170, 130, 85, 40]} skin={skin} />
                </g>
                <g className="gk-head-pose">
                  <g className="gk-head-look">
                    <g className="gk-head">
                      <path d="M57 38 C 56 30, 47 26, 39 28 C 31 30, 23 36, 21 42 C 19.5 47, 24 51, 32 51 C 43 51, 55 47, 57 38 Z" fill={skin} stroke={RIM} strokeWidth="1.1" />
                      <path d="M30 31.6 C 36 28.4, 45 28, 51 30.4" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" opacity="0.45" />
                      {SPOTS.slice(0, 2).map(([x, y, r]) => <circle key={`${String(x)}-${String(y)}`} cx={x} cy={y} r={r} fill="#1f8f36" opacity="0.5" />)}
                      <circle cx="23.6" cy="41.2" r="0.7" fill={RIM} />
                      <path className="gk-mouth" d="M22.4 45.4 Q30 49.6 41.6 47.2" fill="none" stroke={RIM} strokeWidth="1.1" strokeLinecap="round" />
                      <Eye x={50.4} y={33.6} r={4.1} side="r" skin={skin} clip={`${id}-eye-r`} />
                      <Eye x={34} y={36} r={5.2} side="l" skin={skin} clip={`${id}-eye-l`} />
                    </g>
                  </g>
                </g>
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
