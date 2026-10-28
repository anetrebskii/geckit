import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { DEFAULT_SETTINGS } from '../../shared/api'
import type { ChatSession } from '../../shared/api'
import type { Chat } from './chat/useChat'
import './styles.css'

const query = new URLSearchParams(location.search)
document.documentElement.dataset.theme = query.get('theme') === 'dark' ? 'dark' : 'light'
const noop = (): void => undefined
Object.assign(window, { geckit: { platform: 'darwin', home: '/Users/alex', copy: noop, chat: { openLink: noop, queuedPicture: async () => undefined, mcp: async () => [], browsers: async () => [], search: async () => [] } } })
const { TopBar } = await import('./chat/Board')
const { GeckoPanel } = await import('./gecko/Gecko')
const pngs = import.meta.glob<string>('../../../assets/tray*Template@2x.png', { eager: true, query: '?url', import: 'default' })
const tray = {
  asleep: pngs['../../../assets/trayAsleepTemplate@2x.png'] ?? '',
  working: pngs['../../../assets/trayWorkingTemplate@2x.png'] ?? '',
  waiting: pngs['../../../assets/trayWaitingTemplate@2x.png'] ?? '',
  plain: pngs['../../../assets/trayTemplate@2x.png'] ?? '',
}

const art = import.meta.glob<string>('../../../../docs/design/gecko/*.svg', { eager: true, query: '?url', import: 'default' })
const drawn = (name: string): string => art[`../../../../docs/design/gecko/${name}.svg`] ?? ''

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

const built = [
  { key: 'asleep', name: 'Asleep', says: 'nothing working, nothing waiting' },
  { key: 'working', name: 'Working', says: 'at least one working' },
  { key: 'waiting', name: 'Waiting', says: '2 waiting for you' },
  { key: 'review', name: 'Moved to review', says: 'a happy hop, tail curled' },
] as const
const cycle = ['asleep', 'working', 'waiting', 'review'] as const

/** One panel as its window shows it, 108 px of transparent window, on a stand-in desktop. */
function Floating({ state, mac = false }: { readonly state: (typeof cycle)[number]; readonly mac?: boolean }): React.JSX.Element {
  return <div className={`gecko-float${mac ? ' vibrant' : ''}`} data-state={state}>
    <GeckoPanel pose={state === 'review' ? 'working' : state} count={state === 'waiting' ? 2 : 0} hopping={state === 'review'} moving={false} />
  </div>
}

/** The real panel going through the four states, 3.5 s each, with its blinks, the hop, the eyes on the pointer, a wiggle on hover and a squash on a press. */
function Live(): React.JSX.Element {
  const [at, setAt] = useState(0)
  const [hopping, setHopping] = useState(false)
  const [blinking, setBlinking] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [pressing, setPressing] = useState(false)
  const [look, setLook] = useState({ x: 0, y: 0 })
  const held = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let now = 0
    const every = setInterval(() => {
      now = (now + 1) % cycle.length
      setAt(now)
      setHopping(cycle[now] === 'review')
    }, 3500)
    const blink = setInterval(() => { setBlinking(true); setTimeout(() => setBlinking(false), 160) }, 2300)
    const follow = (event: MouseEvent): void => {
      const box = held.current?.getBoundingClientRect()
      if (box === undefined) return
      const dx = event.clientX - (box.left + box.width / 2)
      const dy = event.clientY - (box.top + box.height * 0.36)
      const far = Math.hypot(dx, dy)
      const reach = Math.min(1, far / 240)
      setLook(far < 1 ? { x: 0, y: 0 } : { x: (dx / far) * reach, y: (dy / far) * reach })
    }
    addEventListener('mousemove', follow)
    return () => { clearInterval(every); clearInterval(blink); removeEventListener('mousemove', follow) }
  }, [])
  const state = cycle[at] ?? 'asleep'
  const pose = state === 'review' ? 'working' : state
  return <div ref={held} className="gecko-float gecko-live" onPointerEnter={() => setHovering(true)} onPointerLeave={() => setHovering(false)} onClick={() => { setPressing(true); setTimeout(() => setPressing(false), 170) }}>
    <GeckoPanel pose={pose} count={state === 'waiting' ? 2 : 0} hopping={hopping} blinking={blinking && pose !== 'asleep'} hovering={hovering} pressing={pressing} look={look} onHopped={() => setHopping(false)} />
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
      <h2>Built: the floating panel</h2>
      <p>The real panel, at its real size, on a stand-in desktop. Its own window is transparent, always on top and on every desktop. Hover for the accessible name.</p>
      <div className="gecko-desktop">
        {built.map((state) => <figure key={state.key}><Floating state={state.key} /><figcaption>{state.name}<small>{state.says}</small></figcaption></figure>)}
        <figure><Live /><figcaption>Live<small>the four in turn, 3.5 s each; its eyes follow the pointer</small></figcaption></figure>
      </div>
      <p>On a Mac the window is the system's glass (vibrancy) and the page adds only the shine; here a blur stands in for it.</p>
      <div className="gecko-desktop">
        {built.map((state) => <figure key={state.key}><Floating state={state.key} mac /><figcaption>{state.name}</figcaption></figure>)}
      </div>
      <div className="gecko-trays">
        {(['light', 'dark'] as const).map((bar) => <div key={bar} className={`gecko-menubar ${bar}`}>
          {trays.map((pose) => <img key={pose} src={tray[pose]} alt={`${pose}, 18 px`} title={`${pose}, 18 px`} style={{ height: 18 }} />)}
          <img src={tray.plain} alt="Gecko off, 18 px" title="Gecko off, 18 px" style={{ height: 18 }} />
        </div>)}
        <small>Tray as built, the @2x PNGs at 18 px: asleep, working, waiting, then today's icon when the gecko is off.</small>
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
.gecko-float { position: relative; width: 108px; height: 108px; }
.gecko-float.vibrant { width: 100px; height: 100px; margin: 4px; overflow: hidden; border-radius: 16px; background: rgb(246 246 246 / 55%); backdrop-filter: blur(20px) saturate(1.8); box-shadow: 0 0 0 0.5px rgb(0 0 0 / 15%), 0 6px 16px rgb(0 0 0 / 25%); }
:root[data-theme='dark'] .gecko-float.vibrant { background: rgb(40 40 44 / 55%); }
.gecko-stills { margin: 24px 16px 0; font-size: 15px; }
.gecko-trays { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; color: var(--text-faint); }
.gecko-menubar { display: flex; align-items: center; gap: 14px; height: 30px; padding: 0 14px; border-radius: 6px; }
.gecko-menubar.light { background: #ececec; }
.gecko-menubar.dark { background: #2b2b2e; }
.gecko-menubar.dark img { filter: invert(1); }
`
document.head.append(style)
createRoot(document.getElementById('root')!).render(<Preview />)
