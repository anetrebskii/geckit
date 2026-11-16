import { useCallback, useEffect, useState } from 'react'

import type { ChatSession, ShortcutDraft } from '../../../shared/api'
import { phoneCalls } from '../phone-calls'
import { tap } from '../tap'
import { TEAM_EVENT, openTeam } from '../employees/Employees'
import { Icon } from '../ui/Icon'
import { ChecklistsSection } from '../ui/Checklists'
import { SecretsSection } from '../ui/Secrets'
import { macs } from '../macs'
import { PhoneTeam } from '../employees/PhoneTeam'
import { PhoneBrowser } from './PhoneBrowser'
import { Page, PhoneMenu } from './PhoneKit'
import { menuDot, waitingCount, waitingSaid, WORK_PLACES, WORKSPACE_PLACES, type PlaceId, type PlaceItem } from './places'
import { PhoneBoard } from './PhoneBoard'
import { PhoneQuestions } from './PhoneQuestions'
import { PhoneSay } from './PhoneSay'
import { PhoneSearch } from './PhoneSearch'
import { PhoneSettings } from './PhoneSettings'
import { PhoneShortcuts, ShortcutSheet } from './PhoneShortcuts'
import { ManagerPhone } from './ManagerInspection'
import { MANAGER_CHAT_EVENT } from './manager-chat-open'
import type { Seek } from './Switcher'
import type { Chat } from './useChat'
import './phone-home.css'

/**
 * The phone's top level: the places of the Mac's sidebar, chosen from a left
 * menu opened from the button at the start of each page's bar. The
 * conversation comes up over all of it. See docs/ux/sidebar-navigation.md.
 */

const PLACES: readonly PlaceId[] = ['tasks', 'manager', 'questions', 'team', 'shortcuts', 'checklists', 'browsers', 'secrets', 'settings']

const keptPhonePlace = (): PlaceId => {
  try {
    const kept = localStorage.getItem('phonePlace')
    return PLACES.find((one) => one === kept) ?? 'tasks'
  } catch {
    return 'tasks'
  }
}

export function PhoneHome({
  chat,
  onNew,
  onAsk,
  onScreen,
  onSeek,
}: {
  readonly chat: Chat
  readonly onNew: (how?: 'record') => void
  readonly onAsk: () => void
  readonly onScreen: () => void
  readonly onSeek: (seek: Seek) => void
}): React.JSX.Element {
  const [place, setPlace] = useState<PlaceId>(keptPhonePlace)
  const [menu, setMenu] = useState(false)
  const [searching, setSearching] = useState(false)
  const [teamFirst, setTeamFirst] = useState<{ readonly first?: string; readonly at: number }>({ at: 0 })
  const [saying, setSaying] = useState(false)
  // Shortcuts opened over the board, from its bolt or from All shortcuts on the New task sheet.
  const [shortcuts, setShortcuts] = useState(false)
  const [editing, setEditing] = useState<{ readonly draft: ShortcutDraft; readonly at: number } | undefined>()

  const choose = useCallback((next: PlaceId): void => {
    tap('light')
    setMenu(false)
    setShortcuts(false)
    setSearching(false)
    setPlace(next)
    try {
      localStorage.setItem('phonePlace', next)
    } catch {
      // The place is only remembered where the web view keeps storage.
    }
  }, [])
  const edit = (draft: ShortcutDraft): void => setEditing({ draft, at: Date.now() })
  useEffect(() => {
    const open = (event: Event): void => {
      const first = (event as CustomEvent<string | undefined>).detail
      setTeamFirst({ ...(first === undefined ? {} : { first }), at: Date.now() })
      choose('team')
    }
    window.addEventListener(TEAM_EVENT, open)
    return () => window.removeEventListener(TEAM_EVENT, open)
  }, [choose])
  useEffect(() => {
    const open = (): void => choose('manager')
    window.addEventListener(MANAGER_CHAT_EVENT, open)
    return () => window.removeEventListener(MANAGER_CHAT_EVENT, open)
  }, [choose])

  // A shortcut made from a conversation starts with what was asked in it first, as the Mac's menu makes one.
  const shortcutFrom = (session: ChatSession): void =>
    void (phoneCalls()?.firstAsked(session.id) ?? Promise.resolve('')).catch(() => '').then((prompt) => {
      edit({
        name: session.title,
        root: session.root,
        prompt,
        mode: session.mode,
        ...(session.chosen === undefined || session.chosen === '' ? {} : { model: session.chosen }),
        on: true,
      })
    })

  const waiting = chat.sessions.filter((session) => session.state === 'asks' && session.question !== true).length
  const unread = chat.questions.some((one) => one.state === 'asks' || one.state === 'unread')
  const dot = menuDot(place, waiting > 0, unread)
  const item = (one: PlaceItem | { readonly id: 'settings'; readonly name: string; readonly icon: string }): React.JSX.Element => (
    <button key={one.id} type="button" className={`place-menu-item${place === one.id ? ' on' : ''}`} aria-current={place === one.id ? 'page' : undefined} onClick={() => choose(one.id)}>
      <Icon name={one.icon} size={22} />
      <span className="place-menu-name">{one.name}</span>
      {one.id === 'tasks' && waiting > 0 ? <span className="place-menu-count" aria-label={waitingSaid(waiting)}>{waitingCount(waiting)}</span> : null}
      {one.id === 'questions' && unread ? <span className="place-menu-dot" aria-label="A question has an answer" /> : null}
    </button>
  )
  const host = macs()?.list().find((one) => one.current)?.name ?? 'the host'

  return (
    <PhoneMenu.Provider value={{ dot, open: () => { tap('light'); setMenu(true) } }}>
    <div className="phone-home">
      <div className="phone-tab" hidden={place !== 'tasks' || shortcuts || searching}>
        <PhoneBoard
          chat={chat}
          onNew={onNew}
          onScreen={onScreen}
          onSay={() => setSaying(true)}
          onShortcut={shortcutFrom}
          onShortcuts={() => setShortcuts(true)}
          onSearch={() => setSearching(true)}
        />
      </div>
      {place === 'tasks' && shortcuts ? (
        <div className="phone-tab">
          <PhoneShortcuts chat={chat} back="Tasks" onBack={() => setShortcuts(false)} onEdit={edit} />
        </div>
      ) : null}
      {place === 'tasks' && searching ? (
        <div className="phone-tab">
          <PhoneSearch chat={chat} shown={chat.shown.kind !== 'session'} onSeek={onSeek} onBack={() => setSearching(false)} />
        </div>
      ) : null}
      {place === 'manager' ? <div className="phone-tab"><ManagerPhone settings={chat.settings} onSettings={() => openTeam('manager')} onOpen={(id) => chat.goTo(id)} /></div> : null}
      <div className="phone-tab" hidden={place !== 'questions'}>
        <PhoneQuestions chat={chat} onAsk={onAsk} />
      </div>
      {place === 'team' ? <div className="phone-tab"><PhoneTeam key={teamFirst.at} chat={chat} first={teamFirst.first} onEdit={edit} /></div> : null}
      {place === 'shortcuts' ? <div className="phone-tab"><PhoneShortcuts chat={chat} onEdit={edit} /></div> : null}
      {place === 'checklists' ? <div className="phone-tab"><Page title="Checklists"><div className="phone-section"><ChecklistsSection settings={chat.settings} change={chat.change} /></div></Page></div> : null}
      {place === 'browsers' ? <div className="phone-tab"><PhoneBrowser chat={chat} host={host} /></div> : null}
      {place === 'secrets' ? <div className="phone-tab"><Page title="Secrets"><div className="phone-section"><SecretsSection /></div></Page></div> : null}
      <div className="phone-tab" hidden={place !== 'settings'}>
        <PhoneSettings chat={chat} />
      </div>
      <div className={`place-menu-scrim${menu ? ' open' : ''}`} onClick={() => setMenu(false)} aria-hidden="true" />
      <nav className={`place-menu${menu ? ' open' : ''}`} aria-label="Places" inert={!menu}>
        <div className="place-menu-items">
          {WORK_PLACES.map(item)}
          <div className="place-menu-group">Workspace</div>
          {WORKSPACE_PLACES.map(item)}
        </div>
        <div className="place-menu-foot">{item({ id: 'settings', name: 'Settings', icon: 'settings' })}</div>
      </nav>
      {saying ? <PhoneSay chat={chat} onClose={() => setSaying(false)} /> : null}
      {editing === undefined ? null : <ShortcutSheet key={editing.at} chat={chat} given={editing.draft} onClose={() => setEditing(undefined)} />}
    </div>
    </PhoneMenu.Provider>
  )
}
