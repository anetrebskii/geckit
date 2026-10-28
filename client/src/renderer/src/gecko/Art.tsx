import { useId } from 'react'

import type { GeckoPose, GeckoShown } from '../../../shared/gecko'

/** The frames, drawn once and only ever chosen between: 512 px bodies and the heads, each placed in a 1024 view. */
const urls = import.meta.glob<string>('./frames/*', { eager: true, query: '?url', import: 'default' })
const frame = (name: string): string => urls[`./frames/${name}`] ?? ''

/** What a screen reader and the tooltip say; review is not said on its own. */
export function named(pose: GeckoPose, count: number): string {
  if (pose === 'waiting') return `${String(count)} ${count === 1 ? 'conversation' : 'conversations'} waiting for you`
  return pose === 'working' ? 'Claude is working' : 'Nothing running'
}

/** Each layer that can be shown, in the order they are stacked. */
export type Layer = 'wA' | 'wB' | 'wHead' | 'tA' | 'tB' | 'cUp' | 'cGot' | 'lA' | 'lB' | 'cam' | 'bA' | 'tHead' | 'bAh' | 'tAc' | 'bAc' | 'petHead' | 'p0' | 'p1' | 'lens' | 'aA' | 'aAh' | 'hA'

export interface Drawn {
  readonly shown: GeckoShown
  /** The other of the two frames that alternate: the hands typing, the foot tapping, the pen writing. */
  readonly alt?: boolean
  readonly blinking?: boolean
  /** Hovered: the head bends on its pre-drawn frames instead of the sitting head. */
  readonly petting?: boolean
  readonly hopping?: boolean
}

/**
 * What is shown, as the demo layers it: one body frame, and over it one head, the closed eyes in a blink, or the pupils that follow;
 * only the hands or the foot change between the two frames of a pose, so nothing flickers. The hop shows only its happy frame.
 */
export function layers({ shown, alt = false, blinking = false, petting = false, hopping = false }: Drawn): ReadonlySet<Layer> {
  if (hopping) return new Set(['hA'])
  const on = new Set<Layer>()
  if (shown === 'working') on.add(alt ? 'wB' : 'wA').add('wHead')
  if (shown === 'waiting') on.add(alt ? 'tA' : 'tB')
  if (shown === 'catch') on.add('cUp').add('p0').add('p1')
  if (shown === 'got') on.add('cGot')
  if (shown === 'listen') on.add(alt ? 'lB' : 'lA')
  if (shown === 'camera') on.add('cam').add('p1').add('lens')
  if (shown === 'look' || shown === 'done') on.add('bA')
  if (shown === 'asleep') on.add('aA').add('aAh')
  if (shown === 'waiting' || shown === 'look' || shown === 'done') {
    if (petting) on.add('petHead')
    else if (blinking) on.add(shown === 'waiting' ? 'tAc' : 'bAc')
    else on.add(shown === 'waiting' ? 'tHead' : 'bAh').add('p0').add('p1')
  }
  return on
}

/** Where a pupil looks, in the drawing's units. */
export interface Aim {
  readonly x: number
  readonly y: number
}

/** The two eyes, the left and the right, in the drawing's units. */
export const EYES = [
  { x: 468, y: 301 },
  { x: 762, y: 236 },
] as const

/** The head drawn bent eight ways, for a pet: each head's frames, from upright to the most bent. */
const BENT = {
  wHead: { at: [400, 212, 440, 388], names: [7, 8, 9, 10, 11, 12, 13, 14].map((n, k) => `bend${String(n).padStart(2, '0')}-k${String(k)}.webp`) },
  tHead: { at: [386, 126, 502, 438], names: [23, 24, 25, 26, 27, 28, 29, 30].map((n, k) => `bend${String(n)}-k${String(k)}.webp`) },
  bAh: { at: [384, 126, 506, 444], names: [31, 32, 33, 34, 35, 36, 37, 38].map((n, k) => `bend${String(n)}-k${String(k)}.webp`) },
  petHead: { at: [384, 126, 506, 444], names: [41, 42, 43, 44, 45, 46, 47, 48].map((n, k) => `bend${String(n)}-k${String(k)}.webp`) },
  aAh: { at: [384, 126, 506, 444], names: [41, 51, 52, 53, 54, 55, 56, 57].map((n, k) => `bend${String(n)}-k${String(k)}.webp`) },
} as const

const BODIES = { working: ['wA', 'wB'], waiting: ['tA', 'tB'], catch: ['cUp', 'cGot'], listen: ['lA', 'lB'], camera: ['cam'], look: ['bA'] } as const

const on = (shown: ReadonlySet<Layer>, layer: Layer): string => (shown.has(layer) ? 'gk-layer gk-on' : 'gk-layer')

/** A whole-view frame. */
function Body({ name, shown }: { readonly name: Layer; readonly shown: ReadonlySet<Layer> }): React.JSX.Element {
  return <image className={on(shown, name)} href={frame(`${name}.webp`)} width="1024" height="1024" />
}

/** A head and its bent frames, all kept drawn so none has to load when it is shown; `tilt` picks one. */
function Head({ name, shown, tilt }: { readonly name: keyof typeof BENT; readonly shown: ReadonlySet<Layer>; readonly tilt: number }): React.JSX.Element {
  const [x, y, width, height] = BENT[name].at
  return (
    <g className={on(shown, name)}>
      {BENT[name].names.map((one, k) => (
        <image key={one} className={k === tilt ? 'gk-key gk-on' : 'gk-key'} x={x} y={y} width={width} height={height} href={frame(one)} />
      ))}
    </g>
  )
}

/** A pupil, seen only through the eye's own shape. */
function Pupil({ eye, mask, aim, shown, layer }: { readonly eye: 0 | 1; readonly mask: string; readonly aim: Aim; readonly shown: ReadonlySet<Layer>; readonly layer: Layer }): React.JSX.Element {
  const { x, y } = EYES[eye]
  const big = eye === 0 ? [44, 35, 13, 6] : [41, 32, 12, 5.5]
  const [iris = 0, dark = 0, glint = 0, small = 0] = big
  const shine = eye === 0 ? [-16, -17, 16, 21] : [-15, -17, 15, 20]
  const [gx = 0, gy = 0, sx = 0, sy = 0] = shine
  return (
    <g mask={`url(#${mask})`} className={on(shown, layer)}>
      <g className="gk-pupil" transform={`translate(${aim.x.toFixed(1)} ${aim.y.toFixed(1)})`}>
        <circle cx={x} cy={y} r={iris} fill="#2b5a3a" />
        <circle cx={x} cy={y} r={dark} fill="#13261a" />
        <circle cx={x + gx} cy={y + gy} r={glint} fill="#fff" />
        <circle cx={x + sx} cy={y + sy} r={small} fill="#fff" />
      </g>
    </g>
  )
}

export interface GeckoArtProps extends Drawn {
  readonly pose: GeckoPose
  readonly count: number
  /** Which of the eight bent heads, 0 upright. */
  readonly tilt?: number
  readonly look?: readonly [Aim, Aim]
  /** Pressed: a little squash. */
  readonly pressing?: boolean
  /** The camera's flash. */
  readonly snapping?: boolean
  /** Not seen, reduced motion, and stills: nothing animates. */
  readonly still?: boolean
}

const AHEAD: readonly [Aim, Aim] = [
  { x: 0, y: 0 },
  { x: 0, y: 0 },
]

/** The gecko as drawn from what it is told: the floating window and the preview use the same one. */
export function GeckoArt({ pose, count, shown, alt, blinking, petting, hopping, tilt = 0, look = AHEAD, pressing = false, snapping = false, still = false }: GeckoArtProps): React.JSX.Element {
  const id = useId().replace(/[^\w-]/g, '')
  const name = named(pose, count)
  const drawn = layers({ shown, alt: alt ?? false, blinking: blinking ?? false, petting: petting ?? false, hopping: hopping ?? false })
  const classes = ['gecko-art', `gk-${shown}`, hopping === true ? 'gk-hop' : '', pressing ? 'gk-press' : '', snapping ? 'gk-snap' : '', still ? 'gk-still' : ''].filter((one) => one !== '')
  const [left, right] = look
  return (
    <div className={classes.join(' ')} role="img" aria-label={name} title={name}>
      <div className="gk-box">
        <div className="gk-shadow" />
        <div className="gk-wig">
          <div className="gk-mover">
            <div className="gk-breath">
              <svg className="gk-svg" viewBox="0 0 1024 1024" aria-hidden="true">
                <defs>
                  <mask id={`${id}-m0`} maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
                    <image href={frame('mask-l.png')} width="1024" height="1024" />
                  </mask>
                  <mask id={`${id}-m1`} maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
                    <image href={frame('mask-r.png')} width="1024" height="1024" />
                  </mask>
                </defs>
                {BODIES.working.map((one) => <Body key={one} name={one} shown={drawn} />)}
                <Head name="wHead" shown={drawn} tilt={tilt} />
                {[...BODIES.waiting, ...BODIES.catch, ...BODIES.listen, ...BODIES.camera, ...BODIES.look].map((one) => <Body key={one} name={one} shown={drawn} />)}
                <Head name="tHead" shown={drawn} tilt={tilt} />
                <Head name="bAh" shown={drawn} tilt={tilt} />
                <image className={on(drawn, 'tAc')} x="386" y="127" width="478" height="437" href={frame('tAc.webp')} />
                <image className={on(drawn, 'bAc')} x="385" y="127" width="480" height="443" href={frame('bAc.webp')} />
                <Head name="petHead" shown={drawn} tilt={tilt} />
                <Pupil eye={0} mask={`${id}-m0`} aim={left} shown={drawn} layer="p0" />
                <Pupil eye={1} mask={`${id}-m1`} aim={right} shown={drawn} layer="p1" />
                <circle className={`${on(drawn, 'lens')} gk-lens`} cx="492" cy="304" r="62" fill="#fff" />
                <Body name="aA" shown={drawn} />
                <Head name="aAh" shown={drawn} tilt={tilt} />
                <Body name="hA" shown={drawn} />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div className="gk-flash" />
      {count > 0 ? (
        <span className="gk-badge" aria-hidden="true">
          {count}
        </span>
      ) : null}
    </div>
  )
}
