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
const { BubbleCard } = await import('./gecko/Bubble')
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

const built = [
  { key: 'asleep', name: 'Asleep', says: 'nothing working, nothing waiting' },
  { key: 'working', name: 'Working', says: 'at least one working' },
  { key: 'waiting', name: 'Waiting', says: '2 waiting for you' },
  { key: 'review', name: 'Moved to review', says: 'a happy hop, tail curled' },
] as const
const cycle = ['asleep', 'working', 'waiting', 'review'] as const

/** One panel as its window shows it, 108 px of transparent window, on a stand-in desktop. */
function Floating({ state }: { readonly state: (typeof cycle)[number] }): React.JSX.Element {
  return <div className="gecko-float" data-state={state}>
    <GeckoPanel pose={state === 'review' ? 'working' : state} count={state === 'waiting' ? 2 : 0} hopping={state === 'review'} moving={false} />
  </div>
}

/** The bubble beside the gecko as its window shows it: what it asks after a press, or after files are dropped on it. */
const asking = [
  { key: 'press', name: 'Pressed', says: 'nothing waiting', pose: 'working', asked: { files: 0, waiting: 0, screenshot: true } },
  { key: 'press-waiting', name: 'Pressed, 2 waiting', says: 'the next waiting one each time', pose: 'waiting', asked: { files: 0, waiting: 2, screenshot: true } },
  { key: 'drop', name: 'A file dropped', says: 'it caught the file', pose: 'waiting', asked: { files: 1, waiting: 2, screenshot: true } },
  { key: 'drop-files', name: '3 files dropped', says: 'nothing waiting', pose: 'asleep', asked: { files: 3, waiting: 0, screenshot: true } },
] as const

function Asking({ one }: { readonly one: (typeof asking)[number] }): React.JSX.Element {
  return <div className="gecko-asking" data-state={one.key}>
    <div className="gecko-bubble-window"><BubbleCard asked={one.asked} side="left" focus={false} onChoose={noop} /></div>
    <div className="gecko-float"><GeckoPanel pose={one.pose} count={one.pose === 'waiting' ? 2 : 0} moving={false} /></div>
  </div>
}

/** The real panel going through the four states, 3.5 s each, with its blinks, the hop, the eyes on the pointer, a wiggle on hover, a squash and its bubble on a press, and a catch and its bubble when a file is dropped on it. */
function Live(): React.JSX.Element {
  const [at, setAt] = useState(0)
  const [hopping, setHopping] = useState(false)
  const [blinking, setBlinking] = useState(false)
  const [tapping, setTapping] = useState(false)
  const [hovering, setHovering] = useState(false)
  const [pressing, setPressing] = useState(false)
  const [over, setOver] = useState(false)
  const [catching, setCatching] = useState(false)
  const [files, setFiles] = useState<number | undefined>()
  const [look, setLook] = useState({ x: 0, y: 0 })
  const held = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let now = 0
    const every = setInterval(() => {
      now = (now + 1) % cycle.length
      setAt(now)
      setHopping(cycle[now] === 'review')
    }, 3500)
    const blink = setInterval(() => { setBlinking(true); setTapping(true); setTimeout(() => setBlinking(false), 300); setTimeout(() => setTapping(false), 1200) }, 2300)
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
  return <div ref={held} className="gecko-float gecko-live">
    <div
      className="gecko-live-hit"
      onPointerEnter={() => setHovering(true)}
      onPointerLeave={() => setHovering(false)}
      onClick={() => { setPressing(true); setTimeout(() => { setPressing(false); setFiles(0) }, 170) }}
      onDragOver={(event) => { event.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        const count = event.dataTransfer.files.length
        setOver(false)
        setCatching(true)
        setTimeout(() => { setCatching(false); setFiles(count) }, 420)
      }}
    >
      <GeckoPanel pose={pose} count={state === 'waiting' ? 2 : 0} hopping={hopping} blinking={blinking && pose !== 'asleep'} tapping={tapping && pose === 'waiting'} hovering={hovering && !over} pressing={pressing} catching={catching} look={over ? { x: 0, y: -1 } : look} onHopped={() => setHopping(false)} />
    </div>
    {files === undefined ? null : <div className="gecko-bubble-window gecko-live-bubble"><BubbleCard asked={{ files, waiting: pose === 'waiting' ? 2 : 0, screenshot: true }} side="left" onChoose={() => setFiles(undefined)} /></div>}
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
      <p>The real panel, at its real size, on a stand-in desktop: the app icon's green tile with the gecko on it. Its own window is transparent, always on top and on every desktop. Hover for the accessible name.</p>
      <div className="gecko-desktop">
        {built.map((state) => <figure key={state.key}><Floating state={state.key} /><figcaption>{state.name}<small>{state.says}</small></figcaption></figure>)}
        <figure><Live /><figcaption>Live<small>the four in turn, 3.5 s each; its eyes follow the pointer</small></figcaption></figure>
      </div>
      <h2>The bubble</h2>
      <p>A press, or files dropped on it, opens a speech bubble beside it in a window of its own: to its left, or to its right where the screen has no room. It takes the keyboard, the first choice focused; arrows move, Esc or a click elsewhere closes it. On Windows and Linux there is no screenshot choice. In Live above, press the gecko or drop a file on it.</p>
      <div className="gecko-desktop gecko-asking-row">
        {asking.map((one) => <figure key={one.key}><Asking one={one} /><figcaption>{one.name}<small>{one.says}</small></figcaption></figure>)}
      </div>
      <p>The reference Alex approved, made with Gemini through Echopub (<code>docs/design/gecko/ref/</code>): asleep, working, waiting with 2, happy hop.</p>
      <div className="gecko-reference">
        <img src={drawn('ref/gecko-poses', 'jpg')} alt="Reference poses" />
        <div className="gecko-reference-built">
          {built.map((state) => <Floating key={state.key} state={state.key} />)}
        </div>
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
.gecko-live-hit { position: absolute; inset: 0; }
.gecko-asking { display: flex; align-items: flex-start; }
.gecko-asking .gecko-bubble-window { width: 280px; box-sizing: border-box; }
.gecko-asking .gecko-float { margin-inline-start: -6px; }
.gecko-asking-row figure { color: #fff; }
.gecko-live-bubble { position: absolute; top: 0; right: calc(100% - 6px); z-index: 1; width: 280px; box-sizing: border-box; }
.gecko-reference { display: flex; align-items: center; gap: 24px; margin: 12px 0 16px; padding: 16px; border-radius: 10px; background: #eef7ef; }
.gecko-reference img { width: 260px; height: 260px; }
.gecko-reference-built { display: grid; grid-template-columns: 108px 108px; gap: 12px 20px; zoom: 1.2; }
.gecko-stills { margin: 24px 16px 0; font-size: 15px; }
.gecko-trays { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; color: var(--text-faint); }
.gecko-menubar { display: flex; align-items: center; gap: 14px; height: 30px; padding: 0 14px; border-radius: 6px; }
.gecko-menubar.light { background: #ececec; }
.gecko-menubar.dark { background: #2b2b2e; }
.gecko-menubar.dark img { filter: invert(1); }
`
document.head.append(style)
createRoot(document.getElementById('root')!).render(<Preview />)
