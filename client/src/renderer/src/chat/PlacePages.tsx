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
import { ago, byDay, questionLeft } from './time'
import { DeleteChats } from './DeleteChats'
import { Dot } from './Tasks'
import { Menu } from '../ui/Menu'
import { useManager } from './useManager'
import type { Chat } from './useChat'
import { computerChoices, computerName, useComputers } from '../remote/Computer'
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
  const [switching, setSwitching] = useState<DOMRect>()
  const name = source === undefined ? 'This computer' : computerName(source.server.name)
  const away = source !== undefined && source.state !== 'connected'
  const said = `Computer: ${name}${source === undefined ? '' : `, ${linkSaid(source.state)}`}`
  // Which computer this window shows is a switch above the places it scopes, not one of them: one row, its menu, no selection of its own.
  const switcher = (
    <button type="button" className="nav-item nav-computer no-drag" aria-label={said} title={said} aria-haspopup="menu" aria-expanded={switching !== undefined} onClick={(event) => setSwitching(event.currentTarget.getBoundingClientRect())}>
      {folded && source !== undefined ? <span className="nav-monogram" aria-hidden="true">{monogram(name)}</span> : <Icon name="display" />}
      <span className="nav-name">{name}</span>
      {away ? <span className="nav-host-dot" aria-hidden="true" /> : null}
      {folded ? null : <Icon name="updown" size={12} className="nav-computer-more" />}
    </button>
  )
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
      <div className="nav-top drag">{toggle}</div>
      <div className="nav-items">
        {switcher}
        {WORK_PLACES.map(item)}
        <div className="nav-group" role="presentation">Workspace</div>
        {WORKSPACE_PLACES.map(item)}
        <span className="nav-space" />
      </div>
      {switching === undefined ? null : <Menu anchor={switching} autoFocus title="Computer" chosen={shown} choices={computerChoices(computers, true)} onPick={choose} onClose={() => setSwitching(undefined)} />}
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

/** Questions as the task List view shows conversations: the list on the left under its day headings, the open one beside it. */
function QuestionsPlace({ chat, openId, onAsk, onOpen }: { readonly chat: Pick<Chat, 'questions' | 'showProviders' | 'keep' | 'remove' | 'settings'>; readonly openId: string | undefined; readonly onAsk: () => void; readonly onOpen: (id: string) => void }): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  const [menu, setMenu] = useState<{ readonly id: string; readonly at: DOMRect } | undefined>()
  const [deleting, setDeleting] = useState<ChatSession | undefined>()
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(tick)
  }, [])
  const questions = [...chat.questions].sort((one, other) => other.at - one.at)
  const kept = questions.filter((one) => one.stays === true)
  const groups = [...(kept.length === 0 ? [] : [{ heading: 'Kept', rows: kept }]), ...byDay(questions.filter((one) => one.stays !== true), now)]
  const fold = (heading: string): void => setFolded((was) => {
    const next = new Set(was)
    if (!next.delete(heading)) next.add(heading)
    return next
  })
  const menuFor = menu === undefined ? undefined : questions.find((one) => one.id === menu.id)
  const row = (one: ChatSession): React.JSX.Element => {
    const title = one.title === '' ? 'Untitled' : one.title
    const left = questionLeft(one, now)
    return (
      <div
        key={one.id}
        className={`row${one.id === openId ? ' on' : ''}${one.state === 'asks' || one.state === 'unread' ? ` waits ${one.state}` : ''}`}
        role="button"
        tabIndex={0}
        title={title}
        onClick={() => onOpen(one.id)}
        onKeyDown={(event) => { if (event.key === 'Enter') onOpen(one.id) }}
        onContextMenu={(event) => {
          event.preventDefault()
          setMenu({ id: one.id, at: new DOMRect(event.clientX, event.clientY, 0, 0) })
        }}
      >
        <Dot session={one} />
        <span className="lines">
          <span className="head">
            {chat.showProviders ? <ProviderIcon id={one.id} transport={one.transport} /> : null}
            <span className="title">{title}</span>
            <span className="changed" title={new Date(one.at).toLocaleString()}>{ago(one.at, now, true)}</span>
          </span>
          <span className="foot">
            <span className="stands">{one.stands === '' ? null : <span>{one.stands}</span>}</span>
            {one.stays === true ? <span className="question-kept" title="Kept"><Icon name="pin" size={11} /></span> : left === undefined ? null : <span className="question-left-in">{left}</span>}
          </span>
        </span>
        <button type="button" className="icon-button more" aria-label={`More for ${title}`} onClick={(event) => { event.stopPropagation(); setMenu({ id: one.id, at: event.currentTarget.getBoundingClientRect() }) }}>
          <Icon name="more" />
        </button>
      </div>
    )
  }
  return (
    <>
      <PageHead title="Questions">
        <button type="button" className="quiet place-add no-drag" onClick={onAsk}><Icon name="plus" size={12} />Ask a question<span className="keys">{MOD}+Shift+N</span></button>
      </PageHead>
      <div className="questions-split" style={{ '--side': `${String(chat.settings.sidebarWidth)}px` } as React.CSSProperties}>
        <div className="sidebar questions-list">
          <div className="sessions">
            {questions.length === 0 ? <div className="empty">No questions. Ask one with {MOD}+Shift+N.</div> : groups.map((group) => (
              <div key={group.heading}>
                <div className="group-head">
                  <button type="button" className="group" onClick={() => fold(group.heading)}>
                    <Icon name={folded.has(group.heading) ? 'right' : 'down'} size={10} />
                    {group.heading}
                    <span className="spacer" />
                    <span className="count">{group.rows.length}</span>
                  </button>
                </div>
                {folded.has(group.heading) ? null : group.rows.map(row)}
              </div>
            ))}
          </div>
          <p className="questions-note">Each is deleted a day after its last answer, unless kept.</p>
        </div>
        {openId === undefined ? <div className="questions-none">{questions.length === 0 ? 'Ask a question and its answer shows here.' : 'Choose a question to read it here.'}</div> : null}
      </div>
      {menu === undefined || menuFor === undefined ? null : (
        <Menu
          anchor={menu.at}
          choices={[
            { value: 'keep', label: menuFor.stays === true ? 'Stop keeping' : 'Keep', icon: 'pin' },
            { value: 'delete', label: 'Delete', icon: 'trash', danger: true },
          ]}
          onPick={(value) => {
            if (value === 'keep') chat.keep(menuFor.id, menuFor.stays !== true)
            if (value === 'delete') setDeleting(menuFor)
          }}
          onClose={() => setMenu(undefined)}
        />
      )}
      {deleting === undefined ? null : (
        <DeleteChats
          chats={[deleting]}
          onClose={() => setDeleting(undefined)}
          onDelete={() => {
            chat.remove([deleting.id])
            setDeleting(undefined)
          }}
        />
      )}
    </>
  )
}

/** The place chosen in the sidebar, other than Tasks, which is the board itself. */
export function PlacePage({
  chat,
  place,
  teamFirst,
  openId,
  onOpenHere,
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
  readonly onOpenHere: (id: string) => void
  /** The question open beside the Questions list. */
  readonly openId: string | undefined
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
      return <QuestionsPlace chat={chat} openId={openId} onAsk={onAsk} onOpen={onOpenHere} />
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
