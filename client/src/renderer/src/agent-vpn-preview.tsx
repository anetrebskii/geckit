import { useCallback, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { DEFAULT_SETTINGS } from '../../shared/api'
import type { AgentVpnApi, AgentVpnResult, AgentVpnServer, AgentVpnView, ChatSession, ProviderQuota, SessionProvider, Settings } from '../../shared/api'
import type { Chat } from './chat/useChat'
import type { PhoneCalls } from './phone-calls'
import type { Macs } from './macs'
import type { Section } from './ui/SettingsDialog'
import './styles.css'
import './chat/phone-home.css'

const query = new URLSearchParams(location.search)
const statusSurface = query.get('surface') === 'status'
const mobileSurface = query.get('surface') === 'mobile'
const boardContext = statusSurface && query.get('context') === 'board'
if (query.has('phone') || mobileSurface) document.documentElement.classList.add('phone')
if (query.get('motion') === 'reduce') {
  const matchMedia = window.matchMedia.bind(window)
  window.matchMedia = (query): MediaQueryList => query === '(prefers-reduced-motion: reduce)' ? {
    matches: true, media: query, onchange: null,
    addListener: () => undefined, removeListener: () => undefined,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    dispatchEvent: () => true,
  } : matchMedia(query)
}
const state = query.get('state') ?? 'saved'
let fixtureState = state
let connected = state !== 'offline'
const connectionListeners = new Set<(up: boolean) => void>()
const theme = query.get('theme') === 'light' ? 'light' : 'dark'
document.documentElement.dataset.theme = theme
const servers: readonly AgentVpnServer[] = [
  { id: 'first', name: query.has('long') ? 'AmneziaWG server with a long descriptive name '.repeat(3).slice(0, 120).trim() : 'Amsterdam', version: 'AmneziaWG 2' },
  { id: 'second', name: 'Helsinki', version: 'AmneziaWG 1' },
]
let view: AgentVpnView = {
  servers: state === 'empty' || state === 'storage' ? [] : servers,
  selected: state === 'empty' || state === 'storage' ? null : 'first',
  secureStorage: state !== 'storage',
  runtime: 'unavailable',
  required: state !== 'empty' && state !== 'storage',
  blocked: state !== 'empty' && state !== 'storage',
  ...(state === 'corrupt' ? { problem: 'Saved VPN configurations could not be read. The existing file has been kept; no changes can be saved.' } : {}),
}
const listeners = new Set<(next: AgentVpnView) => void>()
let reads = 0
document.documentElement.dataset.vpnReads = '0'
const result = (next: AgentVpnView): AgentVpnResult => {
  if (state === 'write-fail') return { ok: false, view, error: 'VPN changes could not be saved. Your previous servers and selection have been kept.' }
  view = { ...next, required: next.servers.length > 0 || next.problem !== undefined, blocked: next.servers.length > 0 || next.problem !== undefined }
  for (const listener of listeners) listener(view)
  return { ok: true, view }
}
const agentVpn: AgentVpnApi = {
  view: () => {
    reads += 1
    document.documentElement.dataset.vpnReads = String(reads)
    if (fixtureState === 'loading') return new Promise<AgentVpnView>(() => undefined)
    if (!connected || fixtureState === 'read-error') return Promise.reject(new Error('Preview VPN status read failed.'))
    return Promise.resolve(view)
  },
  import: async () => {
    if (state === 'invalid') return { ok: false, view, error: 'Invalid or unsupported AmneziaWG configuration. Use a native single-server .conf without scripts or unsupported parameters.' }
    if (state === 'cancel') return { ok: true, view }
    const server: AgentVpnServer = { id: crypto.randomUUID(), name: 'Imported server', version: 'AmneziaWG 2' }
    return result({ ...view, servers: [...view.servers, server], selected: view.selected ?? server.id })
  },
  select: async (id) => result({ ...view, selected: id }),
  rename: async (id, name) => result({ ...view, servers: view.servers.map((one) => one.id === id ? { ...one, name: name.trim() } : one) }),
  remove: async (id) => result({ ...view, servers: view.servers.filter((one) => one.id !== id), selected: view.selected === id ? null : view.selected }),
  check: async () => state === 'check-fail' ? { ok: false, view, error: 'Saved configuration is invalid or unsupported. Import a new native AmneziaWG .conf.' } : { ok: true, view },
  onView: (said) => { listeners.add(said); return () => { listeners.delete(said) } },
}
const chatApi: Pick<typeof window.geckit.chat, 'links' | 'search'> = { links: async () => [], search: async () => [] }
Object.assign(window, { geckit: { platform: 'darwin', home: '/Users/alex', agentVpn, chat: chatApi } })
const { SettingsDialog } = await import('./ui/SettingsDialog')
const { Status } = await import('./chat/Status')
const { PhoneAgentVpn } = await import('./chat/PhoneAgentVpn')
const { Cell } = await import('./chat/PhoneKit')
const { Board, TopBar } = await import('./chat/Board')
const phoneFixture: Pick<PhoneCalls, 'connected' | 'onConnection'> = {
  connected: () => connected,
  onConnection: (said) => { connectionListeners.add(said); return () => { connectionListeners.delete(said) } },
}
const macFixture: Pick<Macs, 'list'> = { list: () => [{ name: query.has('host-long') ? 'Alex’s computer with a long descriptive paired host name' : 'Alex’s Mac', current: true, favorite: false }] }
if (mobileSurface) Object.assign(window, { geckitPhone: phoneFixture, geckitMacs: macFixture })
type StatusChat = Parameters<typeof Status>[0]['chat']
const provider: SessionProvider = query.get('provider') === 'codex' ? 'codex' : query.get('provider') === 'plugin' ? 'plugin:preview' : 'claude'
const now = Date.now()
const quotas: readonly ProviderQuota[] = Array.from({ length: query.has('overflow') ? 12 : 2 }, (_item, index) => ({ id: String(index), name: index === 0 ? '5h' : index === 1 ? 'Week' : `Quota ${String(index + 1)}`, part: 0.42, resetsAt: now + 3600_000 }))
const noop = (): void => undefined
const baseSessions: readonly ChatSession[] = [
  { id: 'preview-vpn', root: '/Users/alex/Projects/geckit', title: 'Set up Agent VPN', stands: 'Saved configuration is ready for the native VPN component.', state: 'idle', at: now - 120_000, here: true, mode: 'manual', status: 'blocked' },
  { id: 'preview-footer', root: '/Users/alex/Projects/geckit', title: 'Review the Chat footer', stands: 'Keep status and provider usage readable at every window width.', state: 'idle', at: now - 600_000, here: true, mode: 'manual' },
  { id: 'preview-settings', root: '/Users/alex/Projects/geckit', title: 'Improve Settings navigation', stands: 'Settings now opens directly to Agent VPN.', state: 'idle', at: now - 900_000, here: true, mode: 'manual', status: 'review' },
  { id: 'preview-phone', root: '/Users/alex/Projects/mobile', title: 'Review paired host status', stands: 'Check the phone layout and return focus after closing the sheet.', state: 'idle', at: now - 1800_000, here: true, mode: 'manual', status: 'review' },
  { id: 'preview-files', root: '/Users/alex/Projects/geckit', title: 'Validate imported configurations', stands: 'Native .conf validation and encrypted storage are covered.', state: 'idle', at: now - 3600_000, here: true, mode: 'manual', status: 'done' },
  { id: 'preview-layout', root: '/Users/alex/Projects/mobile', title: 'Check narrow layouts', stands: 'Labels and controls fit the phone viewport.', state: 'idle', at: now - 7200_000, here: true, mode: 'manual', status: 'done' },
]
const sessions: readonly ChatSession[] = query.get('density') === 'full'
  ? Array.from({ length: 6 }, (_item, index) => baseSessions.map((session) => ({ ...session, id: `${session.id}-${String(index + 1)}`, title: `${session.title} ${String(index + 1)}` }))).flat()
  : baseSessions

function Preview(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS, theme })
  const [section, setSection] = useState<Section | undefined>(statusSurface ? undefined : 'agent-vpn')
  const [message, setMessage] = useState('')
  const opener = useRef<HTMLButtonElement | null>(null)
  const openVpn = useCallback((button: HTMLButtonElement) => { opener.current = button; setSection('agent-vpn') }, [])
  const close = useCallback(() => {
    setSection(undefined)
    const button = opener.current
    opener.current = null
    requestAnimationFrame(() => { if (button?.isConnected) button.focus() })
  }, [])
  const chat: StatusChat = {
    provider, account: { provider, here: true, signedIn: true, plan: 'Pro', program: { version: '1.0.0' }, usage: { quotas } },
    session: undefined, chosen: [], settings, hosts: [], plans: [], plansAt: {}, trouble: '',
    plan: { fiveHour: { part: 0.42, resetsAt: now + 3600_000 }, sevenDay: { part: 0.68, resetsAt: now + 86400_000 } },
  }
  const dialog = section === undefined ? null : <SettingsDialog first={section} settings={settings} change={(change) => setSettings((current) => ({ ...current, ...change }))} onClose={close} onShortcuts={close} />
  if (!statusSurface) return dialog ?? <button type="button" onClick={() => setSection('agent-vpn')}>Open Settings</button>
  if (boardContext) {
    const boardChat: Chat = {
      ...chat, settings: { ...settings, chatView: 'board', projects: ['/Users/alex/Projects/geckit', '/Users/alex/Projects/mobile'] },
      prompts: [], lineup: { working: 0, limit: 6 }, full: false,
      change: (change) => setSettings((current) => ({ ...current, ...change })),
      root: '/Users/alex/Projects/geckit', scope: 'all', sessions, everyone: sessions, listed: true,
      questions: [], waiting: [], notices: [], shown: { kind: 'new' }, items: [], itemsFor: '', earlier: 0,
      draft: '', pictures: [], uploading: false, models: 'unasked', mode: 'manual', transport: 'stream',
      showProviders: false, reasoning: '', model: '', working: false, focusSeed: 0, tasksShown: false, compacting: undefined,
      showEarlier: noop, loadSteps: noop, setReasoning: noop, setScope: noop, alsoScope: noop, choose: noop,
      setRoot: noop, addProject: noop, forgetProject: noop, open: noop, show: noop, goTo: noop, dismiss: noop,
      startNew: noop, setDraft: noop, addFiles: noop, dropPicture: noop, setMode: noop, setTransport: noop,
      setModel: noop, setProvider: noop, askModels: noop, send: noop, ask: async () => undefined,
      startTask: async () => undefined, say: noop, answer: noop, stop: noop, unqueue: noop, requeue: noop, reorderQueued: noop,
      delegate: noop, stopShell: noop, typeShell: noop, toBackground: noop, stopTask: noop, clearTask: noop,
      showTasks: noop, setCompacting: noop, rename: noop, mark: noop, hide: noop, keep: noop, remove: noop,
      terminal: noop, copyTerminal: async () => false, refresh: noop,
    }
    return <main className="agent-vpn-status-preview agent-vpn-board-preview">
      <TopBar chat={boardChat} onNew={noop} onAsk={noop} onSeek={noop} onSettings={() => { opener.current = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null; setSection('general') }} onKeys={noop} onShortcuts={noop} />
      <section className="agent-vpn-board-preview-content" aria-label="Example task board"><Board chat={boardChat} onShortcutFrom={noop} /></section>
      <Status chat={chat} onVpnSettings={openVpn} />
      {dialog}
    </main>
  }
  return <main className="agent-vpn-status-preview">
    <section className="agent-vpn-status-preview-content">
      <h2>Agent VPN footer preview</h2>
      <p>Real Chat footer and Settings. Account values and saved servers are examples.</p>
      <button type="button" className="quiet" onClick={(event) => { opener.current = event.currentTarget; setSection('general') }}>Ordinary Settings</button>
      <div className="field"><label htmlFor="vpn-preview-message">Preview message</label><input id="vpn-preview-message" type="text" value={message} onChange={(event) => setMessage(event.target.value)} /></div>
    </section>
    <Status chat={chat} onVpnSettings={openVpn} />
    {dialog}
  </main>
}

function MobilePreview(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState(query.get('place') ?? 'tasks')
  const [keyboard, setKeyboard] = useState(false)
  const [fixture, setFixture] = useState(state)
  const opener = useRef<HTMLElement | null>(null)
  const onOpen = useCallback(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setOpen(true)
  }, [])
  const onClose = useCallback(() => {
    setOpen(false)
    const button = opener.current
    requestAnimationFrame(() => { if (button?.isConnected) button.focus() })
  }, [])
  const changeFixture = (next: string): void => {
    fixtureState = next
    connected = next !== 'offline'
    setFixture(next)
    for (const said of connectionListeners) said(connected)
  }
  return <main className="phone-home phone-agent-vpn-preview">
    <div className="phone-tab">
      <header className="phone-bar"><h1 className="phone-large">{place === 'conversation' ? 'Example conversation' : place === 'settings' ? 'Settings' : 'Tasks'}</h1></header>
      <div className="phone-list">
        <p className="phone-note">Real mobile VPN status and sheet. Synthetic paired computer metadata.</p>
        <div className="phone-group"><label className="phone-cell">Fixture<select value={fixture} onChange={(event) => changeFixture(event.target.value)}><option value="saved">Saved / reconnect</option><option value="offline">Offline</option><option value="loading">Loading</option><option value="read-error">Read error / old host</option></select></label></div>
        <div className="phone-group"><Cell label="Rename saved server live" onPress={() => { result({ ...view, servers: view.servers.map((one) => one.id === view.selected ? { ...one, name: 'Renamed on the computer' } : one) }) }} /><Cell label={keyboard ? 'Hide keyboard fixture' : 'Show keyboard fixture'} onPress={() => { document.documentElement.classList.toggle('keyboard', !keyboard); setKeyboard(!keyboard) }} /></div>
        {place === 'settings' ? <><div className="phone-head">Host</div><div className="phone-group"><Cell label="Agent VPN" icon="settings" onPress={onOpen} /></div></> : <p className="phone-note">Your current {place === 'conversation' ? 'conversation' : 'task list'} remains here when the sheet closes.</p>}
      </div>
    </div>
    {place === 'conversation' ? <div className="composer"><div className="composer-inner"><textarea aria-label="Preview message" placeholder="Message fixture" /></div></div> : null}
    <PhoneAgentVpn conversation={place === 'conversation'} open={open} onOpen={onOpen} onClose={onClose} />
    {place === 'conversation' ? null : <nav className="phone-tabs">{['tasks', 'settings', 'conversation'].map((one) => <button type="button" key={one} onClick={() => setPlace(one)}>{one}</button>)}</nav>}
  </main>
}

const root = document.getElementById('root')
if (root !== null) createRoot(root).render(mobileSurface ? <MobilePreview /> : <Preview />)
