import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { DEFAULT_SETTINGS } from '../../shared/api'
import type { ChatSession } from '../../shared/api'
import type { Chat } from './chat/useChat'
import type { GeckoPose, GeckoShown } from '../../shared/gecko'
import './styles.css'

const query = new URLSearchParams(location.search)
document.documentElement.dataset.theme = query.get('theme') === 'dark' ? 'dark' : 'light'
const noop = (): void => undefined
Object.assign(window, { geckit: { platform: 'darwin', home: '/Users/alex', copy: noop, chat: { openLink: noop, queuedPicture: async () => undefined, mcp: async () => [], browsers: async () => [], search: async () => [] } } })
const { TopBar } = await import('./chat/Board')
const { GeckoArt } = await import('./gecko/Art')
const { RingCard } = await import('./gecko/Ring')
const { geckoItems, geckoRing } = await import('../../shared/gecko')
const pngs = import.meta.glob<string>('../../../assets/tray*Template@2x.png', { eager: true, query: '?url', import: 'default' })
const tray = {
  asleep: pngs['../../../assets/trayAsleepTemplate@2x.png'] ?? '',
  working: pngs['../../../assets/trayWorkingTemplate@2x.png'] ?? '',
  waiting: pngs['../../../assets/trayWaitingTemplate@2x.png'] ?? '',
  plain: pngs['../../../assets/trayTemplate@2x.png'] ?? '',
}

const art = import.meta.glob<string>(['../../../../docs/design/gecko/*.svg', '../../../../docs/design/gecko/ref/*.jpg'], { eager: true, query: '?url', import: 'default' })
const drawn = (name: string, kind = 'svg'): string => art[`../../../../docs/design/gecko/${name}.${kind}`] ?? ''

const directions = [
  { key: 'a', name: 'A. Glass gecko', says: 'The icon gecko seen from above, out of its tile, in green glass with a slit-pupil eye.' },
  { key: 'b', name: 'B. Gecko on the edge', says: 'The same gecko seen from the side, standing on the bottom edge of the bar.' },
  { key: 'c', name: 'C. Glass tile', says: 'The app icon itself as a small glass tile; the white gecko inside it takes the poses.' },
] as const
const poses = [
  { key: 'asleep', name: 'Asleep', says: 'nothing working, nothing waiting' },
  { key: 'working', name: 'Working', says: 'at least one working' },
  { key: 'waiting', name: 'Waiting', says: '2 waiting for you' },
  { key: 'review', name: 'Moved to review', says: 'a card just went to In review' },
] as const
const trays = ['asleep', 'working', 'waiting'] as const

const session: ChatSession = { id: 'claude:preview', root: '/work/trailmap', title: 'Trail difficulty ratings', stands: 'Working', state: 'working', at: Date.now(), here: true, mode: 'auto', queued: [] }
const chat: Chat = {
  settings: { ...DEFAULT_SETTINGS, chatView: 'board', phrases: [] }, hosts: [], prompts: [], lineup: { working: 1, limit: 6 }, full: false, change: noop,
  root: session.root, scope: session.root, sessions: [session], listed: true, everyone: [session], questions: [], waiting: [], notices: [], shown: { kind: 'new' }, session: undefined,
  items: [], itemsFor: '', earlier: 0, showEarlier: noop, loadSteps: noop, draft: '', pictures: [], trouble: '', checkingIp: false, retrying: false, retry: noop, uploading: false,
  account: { provider: 'claude', here: true, signedIn: true, plan: 'Max' }, plan: undefined, plans: [], plansAt: {}, models: [],
  mode: 'auto', transport: 'stream', provider: 'claude', showProviders: true, reasoning: '', setReasoning: noop, model: '', working: true, focusSeed: 0, chosen: [session.root],
  setScope: noop, alsoScope: noop, choose: noop, setRoot: noop, addProject: noop, forgetProject: noop, open: noop, show: noop, goTo: noop, dismiss: noop, startNew: noop,
  setDraft: noop, addFiles: noop, dropPicture: noop, setMode: noop, setModel: noop, setProvider: noop, askModels: noop,
  send: noop, ask: async () => undefined, startTask: async () => undefined, say: noop, answer: noop, stop: noop,
  unqueue: noop, injectQueued: async () => undefined, requeue: noop, reorderQueued: noop,
  delegate: noop, stopShell: noop, typeShell: noop, toBackground: noop, stopTask: noop, clearTask: noop, tasksShown: false, showTasks: noop, compacting: undefined, setCompacting: noop,
  rename: noop, mark: noop, hide: noop, keep: noop, remove: noop, terminal: noop, copyTerminal: async () => false, letGo: noop, refresh: noop,
}

/** Each pose the gecko is drawn in, as its window shows it, on a stand-in desktop. */
const built: readonly { readonly key: string; readonly name: string; readonly says: string; readonly pose: GeckoPose; readonly shown: GeckoShown; readonly count?: number; readonly blinking?: boolean; readonly petting?: boolean; readonly tilt?: number; readonly hopping?: boolean; readonly alt?: boolean; readonly look?: readonly [{ x: number; y: number }, { x: number; y: number }] }[] = [
  { key: 'asleep', name: 'Asleep', says: 'nothing working, nothing waiting', pose: 'asleep', shown: 'asleep' },
  { key: 'working', name: 'Working', says: 'one head, the hands typing', pose: 'working', shown: 'working' },
  { key: 'working-b', name: 'Working', says: 'the other hands frame', pose: 'working', shown: 'working', alt: true },
  { key: 'waiting', name: 'Waiting, 2', says: 'the foot taps now and then', pose: 'waiting', shown: 'waiting', count: 2 },
  { key: 'waiting-tap', name: 'Waiting, a tap', says: 'only the foot frame changes', pose: 'waiting', shown: 'waiting', count: 2, alt: true },
  { key: 'blink', name: 'A blink', says: 'the drawn closed eyes, 130 ms', pose: 'waiting', shown: 'waiting', count: 1, blinking: true },
  { key: 'look-left', name: 'Eyes on the cursor', says: 'down and to the left', pose: 'waiting', shown: 'waiting', count: 1, look: [{ x: -12, y: 10 }, { x: -12, y: 10 }] },
  { key: 'pet', name: 'Hovered', says: 'the head bends, pre-drawn', pose: 'waiting', shown: 'waiting', count: 1, petting: true, tilt: 7 },
  { key: 'dozing', name: 'Dozed off', says: '5 min left alone; the count stays', pose: 'waiting', shown: 'asleep', count: 2 },
  { key: 'hop', name: 'Moved to review', says: 'the happy hop', pose: 'asleep', shown: 'asleep', hopping: true },
  { key: 'done', name: 'After the hop', says: 'until it dozes', pose: 'asleep', shown: 'done' },
  { key: 'look', name: 'Menu open', says: 'eyes on the item in focus', pose: 'working', shown: 'look', look: [{ x: 14, y: -6 }, { x: 14, y: -6 }] },
  { key: 'catch', name: 'Files over it', says: 'hands up, eyes on the file', pose: 'working', shown: 'catch', look: [{ x: 4, y: -15 }, { x: 4, y: -15 }] },
  { key: 'got', name: 'Files dropped', says: 'caught', pose: 'working', shown: 'got' },
  { key: 'camera', name: 'Screenshot', says: 'the camera raised', pose: 'working', shown: 'camera' },
  { key: 'listen', name: 'Voice task', says: 'writing down what it hears', pose: 'working', shown: 'listen' },
]

/** One gecko as its window shows it, transparent, at the side it is given. */
function Floating({ one, side = 120 }: { readonly one: (typeof built)[number]; readonly side?: number }): React.JSX.Element {
  return <div className="gecko-float" data-state={one.key} style={{ width: side, height: side }}>
    <GeckoArt pose={one.pose} count={one.count ?? 0} shown={one.shown} alt={one.alt ?? false} blinking={one.blinking ?? false} petting={one.petting ?? false} tilt={one.tilt ?? 0} hopping={one.hopping ?? false} still {...(one.look === undefined ? {} : { look: one.look })} />
  </div>
}

const byKey = (key: string): (typeof built)[number] => built.find((one) => one.key === key) ?? built[0]!

/** The menu as its window lays it out round a gecko, at a place on a stand-in screen of 1440 by 900 drawn at half size. */
function Menu({ at, waiting, side = 120 }: { readonly at: { x: number; y: number }; readonly waiting: number; readonly side?: number }): React.JSX.Element {
  const items = geckoItems({ waiting, screenshot: true })
  const laid = geckoRing({ ...at, width: side, height: side }, { x: 0, y: 25, width: 1440, height: 875 }, items.length)
  return <div className="gecko-screen">
    <div className="gecko-screen-ring" style={{ left: laid.window.x, top: laid.window.y, width: laid.window.width, height: laid.window.height }}>
      <div className="gecko-float" style={{ position: 'absolute', left: laid.gecko.x, top: laid.gecko.y, width: side, height: side }}>
        <GeckoArt pose={waiting > 0 ? 'waiting' : 'working'} count={waiting} shown="look" still look={[{ x: 0, y: -16 }, { x: 0, y: -16 }]} />
      </div>
      <RingCard laid={laid} items={items} focus={false} onAct={noop} onClose={noop} />
    </div>
  </div>
}

const cycle = ['asleep', 'working', 'waiting', 'done'] as const

/** A live gecko going through its states, 4 s each, with its frames taking turns, blinks, the eyes on the pointer, a pet on hover and the menu on a click. */
function Live(): React.JSX.Element {
  const [at, setAt] = useState(0)
  const [alt, setAlt] = useState(false)
  const [blinking, setBlinking] = useState(false)
  const [tilt, setTilt] = useState(-1)
  const [menu, setMenu] = useState(false)
  const [look, setLook] = useState<readonly [{ x: number; y: number }, { x: number; y: number }]>([{ x: 0, y: 0 }, { x: 0, y: 0 }])
  const held = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const every = setInterval(() => setAt((was) => (was + 1) % cycle.length), 4000)
    const swap = setInterval(() => setAlt((was) => !was), 190)
    const blink = setInterval(() => { setBlinking(true); setTimeout(() => setBlinking(false), 130) }, 2600)
    const follow = (event: MouseEvent): void => {
      const box = held.current?.querySelector('svg')?.getBoundingClientRect()
      if (box === undefined) return
      const k = box.width / 1024
      const one = (x: number, y: number): { x: number; y: number } => {
        const dx = event.clientX - (box.left + x * k)
        const dy = event.clientY - (box.top + y * k)
        const far = Math.hypot(dx, dy) || 1
        const m = Math.min(16, far / 8)
        return { x: (dx / far) * m, y: (dy / far) * m }
      }
      setLook([one(468, 301), one(762, 236)])
    }
    addEventListener('mousemove', follow)
    return () => { clearInterval(every); clearInterval(swap); clearInterval(blink); removeEventListener('mousemove', follow) }
  }, [])
  const state = cycle[at] ?? 'asleep'
  const shown: GeckoShown = menu ? 'look' : state
  const pose: GeckoPose = state === 'done' ? 'asleep' : state
  const pet = (): void => {
    const from = performance.now()
    const step = (time: number): void => {
      const t = (time - from) / 1300
      if (t >= 1) { setTilt(-1); return }
      const keys = [[0, 0], [0.3, 7], [0.5, 4], [0.7, 7], [1, 0]] as const
      let k = 0
      for (let n = 1; n < keys.length; n += 1) { const [t1, a1] = keys[n]!; const [t0, a0] = keys[n - 1]!; if (t <= t1) { const e = (t - t0) / (t1 - t0); k = Math.round(a0 + (a1 - a0) * e * e * (3 - 2 * e)); break } }
      setTilt(k)
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }
  const laid = geckoRing({ x: 170, y: 150, width: 120, height: 120 }, { x: 0, y: 0, width: 460, height: 420 }, 6)
  return <div ref={held} className="gecko-live-stage">
    <div className="gecko-float" style={{ position: 'absolute', left: 170, top: 150, width: 120, height: 120 }} onPointerEnter={() => { if (!menu) pet() }} onClick={() => setMenu((was) => !was)}>
      <GeckoArt pose={pose} count={state === 'waiting' ? 2 : 0} shown={shown} alt={alt} blinking={blinking && tilt < 0} petting={tilt >= 0 && shown !== 'working' && shown !== 'asleep'} tilt={Math.max(0, tilt)} look={look} />
    </div>
    {menu ? <div style={{ position: 'absolute', left: laid.window.x, top: laid.window.y, width: laid.window.width, height: laid.window.height }}><RingCard laid={laid} items={geckoItems({ waiting: state === 'waiting' ? 2 : 0, screenshot: true })} onAct={() => setMenu(false)} onClose={() => setMenu(false)} /></div> : null}
  </div>
}

/** The board's own top bar, with the gecko put into its empty stretch before Ask. */
function Bar({ src, label }: { readonly src: string; readonly label: string }): React.JSX.Element {
  const held = useRef<HTMLDivElement>(null)
  const [spot, setSpot] = useState<Element | null>(null)
  useLayoutEffect(() => setSpot(held.current?.querySelector('.board-head > .spacer') ?? null), [])
  return <div ref={held} className="gecko-bar">
    <TopBar chat={chat} onNew={noop} onAsk={noop} onSeek={noop} onSettings={noop} onKeys={noop} onShortcuts={noop} />
    {spot === null ? null : createPortal(<span className="gecko-spot"><img src={src} alt={label} /></span>, spot)}
  </div>
}

function Preview(): React.JSX.Element {
  const [theme, setTheme] = useState(document.documentElement.dataset.theme)
  return <main className="gecko-preview">
    <header className="provider-preview-controls">
      <strong>The gecko</strong>
      <label>Theme <select aria-label="Theme" value={theme} onChange={(event) => { document.documentElement.dataset.theme = event.target.value; setTheme(event.target.value) }}><option>light</option><option>dark</option></select></label>
    </header>
    <section className="gecko-direction gecko-built">
      <h2>Built: the gecko from the demo's frames</h2>
      <p>The real gecko at its default size, 120 px, in its transparent window on a stand-in desktop: the frames of the demo, one body frame with one head over it, so only the hands or the foot change between frames. Hover for the accessible name. The Mochi-style drawing it replaces is in the screenshots of the earlier commits.</p>
      <div className="gecko-desktop">
        {built.map((one) => <figure key={one.key}><Floating one={one} /><figcaption>{one.name}<small>{one.says}</small></figcaption></figure>)}
      </div>
      <h2>Sizes</h2>
      <p>Dragged from the grip on its bottom right corner, square, from 72 to 320 px.</p>
      <div className="gecko-desktop gecko-sizes">
        {[72, 120, 200, 320].map((side) => <figure key={side}><Floating one={byKey('waiting')} side={side} /><figcaption>{side} px</figcaption></figure>)}
      </div>
      <h2>The menu</h2>
      <p>A press opens it round the gecko, in a transparent window of its own that takes the keyboard: the items fly out from the gecko, the first in focus; arrows move, Enter chooses, Esc or a click elsewhere closes. The gecko looks at the item in focus. Near an edge the items spread over the part of the circle on the screen. Below: a 1440 x 900 screen at half size, the gecko in the middle with 2 waiting, then in the top right corner where it starts, then 320 px in the bottom right.</p>
      <div className="gecko-menus">
        <Menu at={{ x: 660, y: 390 }} waiting={2} />
        <Menu at={{ x: 1296, y: 49 }} waiting={0} />
        <Menu at={{ x: 1100, y: 560 }} waiting={1} side={320} />
      </div>
      <h2>Live</h2>
      <p>Asleep, working, waiting and after a hop, 4 s each; the eyes follow the pointer, hover for a pet, click for the menu.</p>
      <div className="gecko-desktop"><Live /></div>
      <div className="gecko-trays">
        {(['light', 'dark'] as const).map((bar) => <div key={bar} className={`gecko-menubar ${bar}`}>
          {trays.map((pose) => <img key={pose} src={tray[pose]} alt={`${pose}, 18 px`} title={`${pose}, 18 px`} style={{ height: 18 }} />)}
          <img src={tray.plain} alt="Gecko off, 18 px" title="Gecko off, 18 px" style={{ height: 18 }} />
        </div>)}
        <small>Tray as built, the @2x PNGs at 18 px: asleep, working, waiting, then today's icon when the gecko is off. Its menu has Hide the Gecko or Show the Gecko.</small>
      </div>
    </section>
    <h2 className="gecko-stills">Still poses, step 1</h2>
    {directions.map((direction) => <section key={direction.key} className="gecko-direction">
      <h2>{direction.name}</h2>
      <p>{direction.says}</p>
      {poses.map((pose) => <div key={pose.key} className="gecko-row">
        <span className="gecko-label">{pose.name}<small>{pose.says}</small></span>
        <Bar src={drawn(`${direction.key}-${pose.key}`)} label={`${direction.name}, ${pose.name}`} />
      </div>)}
      <div className="gecko-large">
        {poses.map((pose) => <figure key={pose.key}><img src={drawn(`${direction.key}-${pose.key}`)} alt="" /><figcaption>{pose.name}</figcaption></figure>)}
      </div>
      <div className="gecko-trays">
        {(['light', 'dark'] as const).map((bar) => <div key={bar} className={`gecko-menubar ${bar}`}>
          {[16, 22].map((size) => trays.map((pose) => <img key={`${String(size)}-${pose}`} src={drawn(`tray-${direction.key}-${pose}`)} alt={`${pose}, ${String(size)} px`} title={`${pose}, ${String(size)} px`} style={{ height: size }} />))}
        </div>)}
        <small>Tray, 16 and 22 px: asleep, working, waiting. Template images, coloured black or white by the menu bar.</small>
      </div>
    </section>)}
  </main>
}

const style = document.createElement('style')
style.textContent = `
.gecko-preview { min-height: 100vh; color: var(--text); background: var(--bg-sunken); }
.gecko-direction { margin: 16px; padding: 16px; background: var(--bg); border: 1px solid var(--border); border-radius: 10px; }
.gecko-direction h2 { margin: 0; font-size: 15px; }
.gecko-direction > p { margin: 4px 0 12px; color: var(--text-dim); }
.gecko-row { display: grid; grid-template-columns: 150px 1fr; align-items: center; gap: 12px; }
.gecko-label { display: flex; flex-direction: column; font-weight: 600; }
.gecko-label small { color: var(--text-faint); font-weight: 400; }
.gecko-bar { min-width: 0; background: var(--bg); border-inline: 1px solid var(--border); }
.gecko-bar .board-head { padding-left: 12px; }
.gecko-spot { display: flex; justify-content: flex-end; align-items: center; width: 100%; }
.gecko-spot img { height: 30px; margin-inline-end: 8px; }
.gecko-large { display: flex; flex-wrap: wrap; gap: 24px; margin: 16px 0; }
.gecko-large figure { margin: 0; text-align: center; color: var(--text-dim); }
.gecko-large img { height: 128px; display: block; }
.gecko-desktop { display: flex; flex-wrap: wrap; gap: 28px; margin: 12px 0 16px; padding: 28px; border-radius: 10px; background: linear-gradient(135deg, #f3b38a, #b98fd9 45%, #6fb7e8); }
:root[data-theme='dark'] .gecko-desktop { background: linear-gradient(135deg, #3a2a4f, #1d3550 50%, #0f2a2a); }
.gecko-desktop figure { display: flex; flex-direction: column; align-items: center; gap: 8px; margin: 0; color: #fff; font-weight: 600; text-shadow: 0 1px 2px rgb(0 0 0 / 40%); }
.gecko-desktop small { display: block; font-weight: 400; text-align: center; }
.gecko-float { position: relative; width: 120px; height: 120px; }
.gecko-sizes { align-items: flex-end; }
.gecko-menus { display: flex; flex-wrap: wrap; gap: 16px; margin: 12px 0 16px; }
.gecko-screen { position: relative; width: 720px; height: 450px; overflow: hidden; border-radius: 10px; background: linear-gradient(135deg, #f3b38a, #b98fd9 45%, #6fb7e8); }
.gecko-screen-ring { position: absolute; transform-origin: 0 0; }
.gecko-screen > .gecko-screen-ring { zoom: 0.5; }
:root[data-theme='dark'] .gecko-screen { background: linear-gradient(135deg, #3a2a4f, #1d3550 50%, #0f2a2a); }
.gecko-live-stage { position: relative; width: 460px; height: 420px; }
.gecko-live-stage .gk-ring, .gecko-screen-ring .gk-ring { position: absolute; }
.gecko-stills { margin: 24px 16px 0; font-size: 15px; }
.gecko-trays { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; color: var(--text-faint); }
.gecko-menubar { display: flex; align-items: center; gap: 14px; height: 30px; padding: 0 14px; border-radius: 6px; }
.gecko-menubar.light { background: #ececec; }
.gecko-menubar.dark { background: #2b2b2e; }
.gecko-menubar.dark img { filter: invert(1); }
`
document.head.append(style)
createRoot(document.getElementById('root')!).render(<Preview />)
