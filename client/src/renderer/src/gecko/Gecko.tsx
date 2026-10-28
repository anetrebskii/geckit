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
/** The eyes sit on the sides of the head, as a gecko's do, not on top of it as a frog's. */
const EYE_Y = 41

/** The darker spots of its skin, as on the icon's gecko: x, y and size. */
const SPOTS_HEAD = [[43, 34, 1.6], [56, 32, 2], [50, 38, 1.3], [62, 37, 1.3]] as const
const SPOTS_BODY = [[38, 64, 1.8], [62, 65, 1.6], [36, 74, 1.3], [64, 76, 1.5]] as const

/** One big eye: the socket, the white, the slit pupil that follows the look and widens, and the lid that closes from the top. */
function Eye({ x, side, skin }: { readonly x: number; readonly side: 'l' | 'r'; readonly skin: string }): React.JSX.Element {
  return (
    <g className={`gk-eye gk-eye-${side}`}>
      <circle cx={x} cy={EYE_Y} r="11.6" fill={skin} stroke={RIM} strokeWidth="1.2" />
      <circle cx={x} cy={EYE_Y} r="9" fill="#f2f7c8" stroke={RIM} strokeWidth="0.8" />
      <g className="gk-pupil">
        <rect className="gk-slit" x={x - 1.9} y={EYE_Y - 7} width="3.8" height="14" rx="1.9" fill="#10331a" />
        <circle cx={x - 3.2} cy={EYE_Y - 3.4} r="2" fill="#fff" />
      </g>
      <circle className="gk-lid" cx={x} cy={EYE_Y} r="9.4" fill={skin} stroke={RIM} strokeWidth="1" />
    </g>
  )
}

/** A front foot: the arm down from the shoulder and three toe pads. */
function Foot({ x, side, skin }: { readonly x: number; readonly side: 'l' | 'r'; readonly skin: string }): React.JSX.Element {
  const out = side === 'l' ? -1 : 1
  return (
    <g className={`gk-foot gk-foot-${side}`}>
      <path d={`M${x} 64 Q${x + out * 4} 74 ${x + out} 82`} fill="none" stroke={RIM} strokeWidth="7.6" strokeLinecap="round" />
      <path d={`M${x} 64 Q${x + out * 4} 74 ${x + out} 82`} fill="none" stroke={skin} strokeWidth="5.4" strokeLinecap="round" />
      {[-4, 0, 4].map((dx) => (
        <circle key={dx} cx={x + out + dx} cy={dx === 0 ? 86 : 85} r="2.4" fill={skin} stroke={RIM} strokeWidth="0.9" />
      ))}
    </g>
  )
}

/** The gecko facing the person, in parts that move on their own: tail, body, feet, head, each eye with its lid and pupil. */
function Drawing(): React.JSX.Element {
  const id = useId().replace(/[^\w-]/g, '')
  const skin = `url(#${id}-skin)`
  const tail = 'M60 84 C 76 90, 90 82, 88 68 C 86 57, 75 57, 75 65 C 75 71, 82 72, 83 67'
  const wrapped = 'M64 85 C 74 92, 60 96, 46 94 C 34 93, 27 91, 29 86'
  return (
    <svg className="gk-art" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-skin`} gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="0" y2="94">
          <stop offset="0" stopColor="#86e690" />
          <stop offset="0.45" stopColor="#47c257" />
          <stop offset="1" stopColor="#1c8c33" />
        </linearGradient>
      </defs>
      <ellipse className="gk-shadow" cx="50" cy="93" rx="24" ry="3.2" fill="#06280f" opacity="0.18" />
      <g className="gk-hop">
        <g className="gk-press">
          <g className="gk-wiggle">
            <g className="gk-bob">
              <g className="gk-tail">
                <path d={tail} fill="none" stroke={RIM} strokeWidth="8.2" strokeLinecap="round" />
                <path d={tail} fill="none" stroke={skin} strokeWidth="6" strokeLinecap="round" />
              </g>
              <g className="gk-breathe">
                <ellipse cx="33" cy="85" rx="9" ry="6" fill={skin} stroke={RIM} strokeWidth="1.2" />
                <ellipse cx="67" cy="85" rx="9" ry="6" fill={skin} stroke={RIM} strokeWidth="1.2" />
                {[26, 30.4, 35].map((x, at) => (
                  <g key={x}>
                    <circle cx={x} cy={at === 0 ? 88.6 : 90.4} r="2.2" fill={skin} stroke={RIM} strokeWidth="0.9" />
                    <circle cx={100 - x} cy={at === 0 ? 88.6 : 90.4} r="2.2" fill={skin} stroke={RIM} strokeWidth="0.9" />
                  </g>
                ))}
                <ellipse cx="50" cy="70" rx="19" ry="17" fill={skin} stroke={RIM} strokeWidth="1.2" />
                <ellipse cx="50" cy="74" rx="11" ry="10" fill="#d6f7c6" opacity="0.5" />
                {SPOTS_BODY.map(([x, y, r]) => <circle key={`${String(x)}-${String(y)}`} cx={x} cy={y} r={r} fill="#1f8f36" opacity="0.45" />)}
                <g className="gk-wrapped">
                  <path d={wrapped} fill="none" stroke={RIM} strokeWidth="7.4" strokeLinecap="round" />
                  <path d={wrapped} fill="none" stroke={skin} strokeWidth="5.2" strokeLinecap="round" />
                </g>
                <Foot x={41} side="l" skin={skin} />
                <Foot x={59} side="r" skin={skin} />
                <g className="gk-head-pose">
                  <g className="gk-head-look">
                    <g className="gk-head">
                      <path d="M50 25 C 66 25, 77 34, 76 45 C 75 56, 64 62, 50 62 C 36 62, 25 56, 24 45 C 23 34, 34 25, 50 25 Z" fill={skin} stroke={RIM} strokeWidth="1.2" />
                      <ellipse cx="50" cy="31" rx="11" ry="3.6" fill="#fff" opacity="0.45" />
                      {SPOTS_HEAD.map(([x, y, r]) => <circle key={`${String(x)}-${String(y)}`} cx={x} cy={y} r={r} fill="#1f8f36" opacity="0.45" />)}
                      <circle cx="34" cy="53" r="3.6" fill="#ff9fb0" opacity="0.45" />
                      <circle cx="66" cy="53" r="3.6" fill="#ff9fb0" opacity="0.45" />
                      <circle cx="46.4" cy="47" r="0.9" fill={RIM} />
                      <circle cx="53.6" cy="47" r="0.9" fill={RIM} />
                      <path className="gk-mouth" d="M42 54 Q50 60 58 54" fill="none" stroke={RIM} strokeWidth="1.6" strokeLinecap="round" />
                      <Eye x={27} side="l" skin={skin} />
                      <Eye x={73} side="r" skin={skin} />
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
