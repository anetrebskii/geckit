import { useEffect, useState } from 'react'

import type { ChatSession, Shortcut, ShortcutDraft } from '../../../shared/api'
import geckoGlyph from '../gecko/frames/hA.webp'
import { EmployeeAvatar } from '../employees/Employees'
import { managerFace } from '../employees/TeamManager'
import { Team } from '../employees/Team'
import { Icon } from '../ui/Icon'
import { SectionBody, SettingsPage } from '../ui/SettingsDialog'
import { MOD } from '../ui/Shortcuts'
import { ManagerChat } from './ManagerChat'
import { managerStand } from './manager-label'
import { ProviderIcon } from './ProviderIcon'
import { ShortcutList } from './ShortcutList'
import { questionLeft } from './time'
import { useManager } from './useManager'
import type { Chat } from './useChat'
import { useComputers } from '../remote/Computer'
import { WORK_PLACES, WORKSPACE_PLACES, monogram, waitingCount, waitingSaid } from './places'
import type { Place, PlaceItem } from './places'
import './places.css'

const MAC = window.geckit.platform === 'darwin'
const TOGGLE_KEYS = MAC ? 'Cmd+Ctrl+S' : 'Ctrl+Alt+S'

const KEYS: { readonly [id: string]: string } = { questions: `${MOD}+Shift+N`, shortcuts: `${MOD}+J`, settings: `${MOD}+,` }

/** The window's width, followed as it is resized, for folding the sidebar's names on a narrow window. */
export function useWidth(): number {
  const [width, setWidth] = useState(window.innerWidth)
  useEffect(() => {
    const resized = (): void => setWidth(window.innerWidth)
    window.addEventListener('resize', resized)
    return () => window.removeEventListener('resize', resized)
  }, [])
  return width
}

/** The shown GeckIt computer's connection, as read beside its name. */
const linkSaid = (state: string | undefined): string => state === 'connected' ? 'connected' : state === 'connecting' ? 'connecting' : state === 'reconnecting' ? 'reconnecting' : 'not connected'

/**
 * The Chat window's sidebar: the places where work happens, the places that shape it, the computers it runs on, and Settings apart at the bottom.
 * Folded (`rail`) it shows icons alone, each name in its tooltip; `over` is the names opened over a narrow window.
 */
export function AppNav({
  chat,
  place,
  rail,
  over,
  onPlace,
  onToggle,
  onComputer,
  reading,
}: {
  readonly chat: Pick<Chat, 'sessions' | 'settings' | 'change'>
  readonly place: Place
  readonly rail: boolean
  readonly over: boolean
  readonly onPlace: (place: Place) => void
  readonly onToggle: () => void
  /** Opens a saved GeckIt computer, `:add` to connect one or `:manage` for the list, when this window shows this computer. */
  readonly onComputer: (id?: string) => void
  /** Changes when the saved computers may have changed, so they are read again. */
  readonly reading: unknown
}): React.JSX.Element {
  const folded = rail && !over
  const { source, computers, choose } = useComputers(reading, onComputer)
  const shown = source?.server.id ?? ':local'
  const computer = (id: string, name: string, icon: string): React.JSX.Element => {
    const on = id === shown
    const said = on && source !== undefined ? `${name}, ${linkSaid(source.state)}` : on ? `${name}, shown` : name
    return (
      <button key={id} type="button" className={`nav-item no-drag${on ? ' on' : ''}`} aria-current={on ? 'true' : undefined} aria-label={said} title={said} onClick={() => choose(id)}>
        {folded && id !== ':local' ? <span className="nav-monogram" aria-hidden="true">{monogram(name)}</span> : <Icon name={icon} />}
        <span className="nav-name">{name}</span>
        {on && source !== undefined ? <span className={`nav-host-dot${source.state === 'connected' ? ' up' : ''}`} aria-hidden="true" /> : null}
      </button>
    )
  }
  const waiting = chat.sessions.filter((one) => one.state === 'asks' && one.question !== true).length
  const toggle = (
    <button type="button" className="icon-button nav-toggle no-drag" aria-label={folded ? 'Show names' : 'Hide names'} aria-expanded={!folded} title={`${folded ? 'Show names' : 'Hide names'} (${TOGGLE_KEYS})`} onClick={onToggle}>
      <Icon name="sidebar" />
    </button>
  )
  const item = (one: PlaceItem): React.JSX.Element => {
    const count = one.id === 'tasks' ? waiting : 0
    const name = count > 0 ? `${one.name}, ${String(count)} waiting` : one.name
    const tip = KEYS[one.id] === undefined ? name : `${name} (${KEYS[one.id] ?? ''})`
    const said = folded ? name : count > 0 ? `${one.name}, ${waitingSaid(count)}` : undefined
    return (
      <button key={one.id} type="button" className={`nav-item no-drag${place === one.id ? ' on' : ''}`} aria-current={place === one.id ? 'page' : undefined} {...(said === undefined ? {} : { 'aria-label': said })} {...(folded ? { title: tip } : {})} onClick={() => onPlace(one.id)}>
        <Icon name={one.icon} />
        <span className="nav-name">{one.name}</span>
        {count === 0 ? null : folded ? <span className="nav-dot" aria-hidden="true" /> : <span className="nav-count" aria-hidden="true" title={waitingSaid(count)}>{waitingCount(count)}</span>}
      </button>
    )
  }
  return (
    <nav className={`app-nav${folded ? ' rail' : ''}${over ? ' over' : ''}`} aria-label="GeckIt">
      <div className="nav-top drag">{folded ? null : toggle}</div>
      <div className="nav-items">
        {folded ? <div className="nav-toggle-row">{toggle}</div> : null}
        {WORK_PLACES.map(item)}
        <div className="nav-group" role="presentation">Workspace</div>
        {WORKSPACE_PLACES.map(item)}
        <span className="nav-space" />
        <div className="nav-group" role="presentation">Computers</div>
        {computer(':local', 'This computer', 'display')}
        {computers.map((one) => computer(one.server.id, one.server.name, 'server'))}
        <button type="button" className="nav-item nav-add no-drag" {...(folded ? { 'aria-label': 'Connect computer', title: 'Connect computer' } : {})} onClick={() => choose(':add')}>
          <Icon name="plus" />
          <span className="nav-name">Connect computer</span>
        </button>
        {computers.length === 0 ? null : (
          <button type="button" className="nav-item nav-add no-drag" {...(folded ? { 'aria-label': 'Manage computers', title: 'Manage computers' } : {})} onClick={() => choose(':manage')}>
            <Icon name="settings" />
            <span className="nav-name">Manage computers</span>
          </button>
        )}
      </div>
      <div className="nav-foot">
        {chat.settings.showGecko ? null : (
          <button type="button" className="nav-item no-drag" {...(folded ? { 'aria-label': 'Show the gecko', title: 'Show the gecko' } : {})} onClick={() => chat.change({ showGecko: true })}>
            <img className="gecko-glyph" src={geckoGlyph} alt="" />
            <span className="nav-name">Show the gecko</span>
          </button>
        )}
        <button type="button" className={`nav-item no-drag${place === 'settings' ? ' on' : ''}`} aria-current={place === 'settings' ? 'page' : undefined} {...(folded ? { 'aria-label': 'Settings', title: `Settings (${MOD}+,)` } : {})} onClick={() => onPlace('settings')}>
          <Icon name="settings" />
          <span className="nav-name">Settings</span>
        </button>
      </div>
    </nav>
  )
}

function PageHead({ title, children }: { readonly title: string; readonly children?: React.ReactNode }): React.JSX.Element {
  return (
    <header className="place-head drag">
      <h1>{title}</h1>
      <span className="spacer" />
      {children}
    </header>
  )
}

function ManagerPlace({ chat, onSetUp, onOpen }: { readonly chat: Pick<Chat, 'settings'>; readonly onSetUp: () => void; readonly onOpen: (id: string) => void }): React.JSX.Element {
  const view = useManager()
  if (view === undefined) return <div className="place-body"><p className="place-note">Loading Manager...</p></div>
  if (!view.config.enabled && view.session === undefined) {
    return (
      <div className="place-body">
        <div className="place-column">
          <p className="place-note">Manager is off. It keeps the board moving and answers in Slack, Telegram and Discord threads once it is on.</p>
          <div><button type="button" className="primary" onClick={onSetUp}>Set up Manager</button></div>
        </div>
      </div>
    )
  }
  const stand = managerStand(view)
  return (
    <div className="manager-inspection place-manager">
      <ManagerChat view={view} settings={chat.settings} onSettings={onSetUp} onOpen={onOpen}
        head={<div className="manager-identity"><EmployeeAvatar employee={managerFace(chat.settings)} /><h2>Manager</h2><span className="manager-stand" data-tone={stand.tone} role="status"><span className="manager-stand-dot" aria-hidden="true" /><span className="manager-stand-text">{stand.short}</span></span></div>}
        tail={<><span className="manager-toolbar-gap" aria-hidden="true" /><button type="button" className="icon-button" aria-label="Manager settings" title="Manager settings" onClick={onSetUp}><Icon name="settings" /></button></>} />
    </div>
  )
}

function QuestionsPlace({ chat, onAsk, onOpen }: { readonly chat: Pick<Chat, 'questions' | 'showProviders' | 'keep' | 'remove'>; readonly onAsk: () => void; readonly onOpen: (id: string) => void }): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  const [confirming, setConfirming] = useState<string | undefined>()
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(tick)
  }, [])
  const questions = [...chat.questions].sort((one, other) => other.at - one.at)
  const row = (one: ChatSession): React.JSX.Element => {
    const title = one.title === '' ? 'Untitled' : one.title
    if (confirming === one.id) {
      return (
        <div key={one.id} className="question-item confirming">
          <span className="question-title">Delete "{title}"?</span>
          <span className="question-confirm">
            <button type="button" className="question-cancel" autoFocus onClick={() => setConfirming(undefined)}>Cancel</button>
            <button type="button" className="question-delete" onClick={() => { setConfirming(undefined); chat.remove([one.id]) }}>Delete</button>
          </span>
        </div>
      )
    }
    const left = questionLeft(one, now)
    return (
      <div key={one.id} className="question-item">
        <button type="button" className="question-open" onClick={() => onOpen(one.id)}>
          <span className="question-title">{chat.showProviders ? <ProviderIcon id={one.id} transport={one.transport} /> : null}{title}</span>
          {one.stands === '' ? null : <span className="question-says">{one.stands}</span>}
        </button>
        {one.stays === true ? <span className="question-left" title="Kept"><Icon name="pin" size={13} /></span> : left === undefined ? null : <span className="question-left">{left}</span>}
        <button type="button" className={`question-pin${one.stays === true ? ' on' : ''}`} aria-label={one.stays === true ? `Stop keeping ${title}` : `Keep ${title}`} title={one.stays === true ? 'Stop keeping' : 'Keep'} onClick={() => chat.keep(one.id, one.stays !== true)}>
          <Icon name="pin" size={13} />
        </button>
        <button type="button" className="question-bin" aria-label={`Delete ${title}`} title="Delete" onClick={() => setConfirming(one.id)}>
          <Icon name="trash" size={13} />
        </button>
      </div>
    )
  }
  return (
    <>
      <PageHead title="Questions">
        <button type="button" className="quiet place-add no-drag" onClick={onAsk}><Icon name="plus" size={12} />Ask a question<span className="keys">{MOD}+Shift+N</span></button>
      </PageHead>
      <div className="place-body">
        <div className="place-column">
          {questions.length === 0 ? <p className="place-note">No questions. Ask one with {MOD}+Shift+N; each is kept a day after its last answer.</p> : <div className="place-questions">{questions.map(row)}</div>}
          {questions.length === 0 ? null : <p className="place-note">Each is deleted a day after its last answer.</p>}
        </div>
      </div>
    </>
  )
}

/** The place chosen in the sidebar, other than Tasks, which is the board itself. */
export function PlacePage({
  chat,
  place,
  teamFirst,
  onPlace,
  onAsk,
  onKeys,
  onTeam,
  onShortcut,
}: {
  readonly chat: Chat
  readonly place: Place
  readonly teamFirst: string | undefined
  readonly onPlace: (place: Place) => void
  readonly onAsk: () => void
  readonly onKeys: () => void
  readonly onTeam: (first?: string) => void
  readonly onShortcut: (edit: Shortcut['id'] | ShortcutDraft) => void
}): React.JSX.Element | null {
  const toTasks = (id: string): void => {
    chat.goTo(id)
    onPlace('tasks')
  }
  switch (place) {
    case 'manager':
      return <ManagerPlace chat={chat} onSetUp={() => onTeam('manager')} onOpen={toTasks} />
    case 'questions':
      return <QuestionsPlace chat={chat} onAsk={onAsk} onOpen={toTasks} />
    case 'team':
      return <div className="place-team"><Team key={teamFirst ?? ''} place chat={chat} first={teamFirst as Parameters<typeof Team>[0]['first']} onClose={() => onPlace('tasks')} onOpen={toTasks} onShortcut={onShortcut} /></div>
    case 'shortcuts':
      return <div className="place-body place-dialog-host"><ShortcutList place chat={chat} start="list" onTeam={() => onTeam()} onClose={() => onPlace('tasks')} /></div>
    case 'checklists':
    case 'browsers':
    case 'secrets':
      return (
        <>
          <PageHead title={place === 'checklists' ? 'Checklists' : place === 'browsers' ? 'Browsers' : 'Secrets'} />
          <div className="place-body">
            <div className="place-column settings-page">
              <SectionBody section={place === 'browsers' ? 'integrations' : place} settings={chat.settings} change={chat.change} assistantChat={chat} onWelcome={() => undefined} />
            </div>
          </div>
        </>
      )
    case 'settings':
      return (
        <>
          <PageHead title="Settings" />
          <div className="place-body place-split">
            <SettingsPage settings={chat.settings} change={chat.change} onShortcuts={onKeys} assistantChat={chat} />
          </div>
        </>
      )
    default:
      return null
  }
}
