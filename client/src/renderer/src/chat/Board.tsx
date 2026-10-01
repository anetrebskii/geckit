import { ProviderIcon } from './ProviderIcon'
import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react'

import { assistantFor, assistantsIn, ANYWHERE, homeOf, profileOf, SESSION_STATUSES, shownProjects } from '../../../shared/api'
import type { ChatSession, ClaudeModel, ModelsSaid, ReasoningEffort, RecordedFrame, SessionImage, SessionProvider, SessionStatus } from '../../../shared/api'
import { movedOrder, ordered } from '../../../shared/order'
import { clock, MOST_FRAMES, recordedNote, thinFrames } from '../../../shared/recording'
import { projectColor } from '../../../shared/project-color'
import { dictate, languageCode, useDictationLanguage, useLevel } from '../dictate'
import { ON_PHONE } from '../on-phone'
import { asImage, canShow } from '../pictures'
import { hostOf, isRemote, outOfReach, outOfReachLine } from '../../../shared/hosts'
import type { HostView } from '../../../shared/hosts'
import { HostFolders } from './HostFolders'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { MOD, said } from '../ui/Shortcuts'
import { DeleteChats } from './DeleteChats'
import { HiddenChats } from './HiddenChats'
import { NameField } from './NameField'
import { PhoneProject } from './PhoneProject'
import { PhoneRecord } from './PhoneRecord'
import { Preview } from './Preview'
import { From, startedLine, StartedMenu } from './Request'
import { Projects } from './Projects'
import { queueWhy } from './Queued'
import { QuestionsMenu } from './Questions'
import { HostTag } from './HostTag'
import { emptyProfile, hostName, projectLabel, projectName, tint } from './project'
import { STATUS_ICONS, Tags, Views } from './Sidebar'
import { BoardSearch } from './Switcher'
import type { Seek } from './Switcher'
import { cardSays, running, useNeedsYou, working } from './Tasks'
import { shortUrl } from '../../../shared/links'
import type { Link } from '../../../shared/links'
import { ago, byDay } from './time'
import type { Chat } from './useChat'

/**
 * The conversations as cards in columns, by how each stands.
 *
 * The same conversations as the list, seen from the side that matters when
 * several are running at once: what is still going, what is finished and
 * waiting to be looked at, and what is over. A card is dragged from one column
 * to the next, which is the same as marking it, and pressing one opens the
 * conversation itself over the board.
 */

/** No column for what has not been started: a conversation exists because it was. */
const COLUMNS: readonly { readonly status: SessionStatus | undefined; readonly title: string }[] = [
  { status: undefined, title: 'In progress' },
  { status: 'review', title: 'In review' },
  { status: 'done', title: 'Done' },
]

/** Before which card of In progress the pointer is, counting the cards above it in the part kept in the person's order. */
function landingAt(column: HTMLElement, y: number): number {
  const cards = [...column.querySelectorAll<HTMLElement>('[data-kept] [data-card]')]
  const at = cards.findIndex((card) => {
    const box = card.getBoundingClientRect()
    return y < box.top + box.height / 2
  })
  return at === -1 ? cards.length : at
}

/** The bar across the top in both views, so switching between them changes only what is below it. */
export function TopBar({
  chat,
  onNew,
  onAsk,
  onSeek,
  onSettings,
  onKeys,
  onShortcuts,
}: {
  readonly chat: Chat
  readonly onNew: () => void
  readonly onAsk: () => void
  /** A conversation opened on something said in it, marked there as the Cmd+P panel marks it. */
  readonly onSeek: (seek: Seek) => void
  readonly onSettings: () => void
  readonly onKeys: () => void
  readonly onShortcuts: () => void
}): React.JSX.Element {
  const [asked, setAsked] = useState<DOMRect | undefined>()
  const [ways, setWays] = useState<DOMRect | undefined>()
  const [hidden, setHidden] = useState(false)
  return (
    <div className="board-head drag">
      <Views chat={chat} />
      <Projects chat={chat} />
      <BoardSearch chat={chat} onSeek={onSeek} />
      <button
        type="button"
        className="icon-button no-drag"
        aria-label="Shortcuts"
        title={`Shortcuts: saved prompts to run by hand or on a timetable (${MOD}+J)`}
        onClick={onShortcuts}
      >
        <Icon name="bolt" />
      </button>
      <button
        type="button"
        className="icon-button no-drag"
        aria-label="Keyboard shortcuts"
        title={`Keyboard shortcuts (${MOD}+/)`}
        onClick={onKeys}
      >
        <Icon name="keyboard" />
      </button>
      <button
        type="button"
        className="icon-button no-drag"
        aria-label="Hidden conversations"
        title="Hidden conversations: kept by Claude Code and not on the board"
        onClick={() => setHidden(true)}
      >
        <Icon name="hidden" />
      </button>
      <button
        type="button"
        className="icon-button no-drag"
        aria-label="Settings"
        title={`Settings (${MOD}+,)`}
        onClick={onSettings}
      >
        <Icon name="settings" />
      </button>
      <span className="spacer" />
      <button
        type="button"
        className="new-session no-drag board-new"
        title="A question that is not about a project: it is not put on the board, and is deleted a day after the last answer"
        onClick={(event) => {
          if (chat.questions.length === 0) onAsk()
          else setAsked(event.currentTarget.getBoundingClientRect())
        }}
      >
        <Icon name="chat" />
        {chat.questions.length === 0 ? 'Ask' : `Questions ${String(chat.questions.length)}`}
        <span className="keys">{MOD}+Shift+N</span>
      </button>
      {asked === undefined ? null : (
        <QuestionsMenu chat={chat} anchor={asked} onAsk={onAsk} onClose={() => setAsked(undefined)} />
      )}
      {/* Writing it is the usual way; the arrow offers the others, each saying what it does, so recording and speaking read as ways to start a task. */}
      <span className="board-split no-drag">
        <button type="button" className="new-session board-new" onClick={onNew}>
          <Icon name="plus" />
          New task
          <span className="keys">{MOD}+N</span>
        </button>
        <button
          type="button"
          className={`board-more${ways === undefined ? '' : ' on'}`}
          aria-label="Other ways to start a task"
          aria-haspopup="menu"
          title="Other ways to start a task"
          onClick={(event) => setWays(event.currentTarget.parentElement?.getBoundingClientRect())}
        >
          <Icon name="down" size={11} />
        </button>
      </span>
      {ways === undefined ? null : (
        <Menu
          anchor={ways}
          explained
          choices={[
            { value: 'write', icon: 'pencil', label: 'Write it', says: `The form: project, what to do, a goal. ${MOD}+N` },
            {
              value: 'record',
              icon: 'display',
              label: 'Record the screen',
              says: `Show it and talk. The recording becomes the task. ${said(ANYWHERE.record)}`,
            },
            {
              value: 'say',
              icon: 'mic',
              label: 'Say it',
              says: `Tell GeckIt what to start, answer or mark. ${said(ANYWHERE.orders)}`,
            },
          ]}
          onPick={(way) => {
            if (way === 'write') onNew()
            if (way === 'record') window.geckit.voice.record()
            if (way === 'say') window.geckit.voice.orders()
          }}
          onClose={() => setWays(undefined)}
        />
      )}
      {hidden ? <HiddenChats chat={chat} onClose={() => setHidden(false)} /> : null}
    </div>
  )
}

export function Board({
  chat,
  onShortcutFrom,
}: {
  readonly chat: Chat
  /** A new shortcut from this conversation, as the list's own menu makes one. */
  readonly onShortcutFrom: (session: ChatSession) => void
}): React.JSX.Element {
  // The card the menu is open on, the one being renamed, and the ones being deleted.
  const [menu, setMenu] = useState<{ readonly id: string; readonly at: DOMRect } | undefined>()
  const [renaming, setRenaming] = useState<string | undefined>()
  const [deleting, setDeleting] = useState<readonly ChatSession[] | undefined>()
  // The cards being dragged, and the column the pointer is over.
  const held = useRef<readonly string[]>([])
  const [over, setOver] = useState<string | undefined>()
  // A day in Done folded away, by its heading, for as long as the window is open.
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const fold = (heading: string): void =>
    setFolded((was) => {
      const next = new Set(was)
      if (!next.delete(heading)) next.add(heading)
      return next
    })

  // The times on the cards, kept fresh the way the list keeps them.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(tick)
  }, [])

  const columns = useMemo(
    () =>
      COLUMNS.map((column) => ({
        ...column,
        // Blocked stands in the first column: it is work that is not over, and its
        // tag on the card says what it is waiting on.
        rows: ordered(
          chat.sessions
            .filter((one) => (column.status === undefined ? one.status !== 'review' && one.status !== 'done' : one.status === column.status))
            .sort((one, other) => other.at - one.at),
          column.status === undefined ? chat.settings.progressOrder : [],
        ),
      })),
    [chat.sessions, chat.settings.progressOrder],
  )
  const startedLines = useMemo(() => {
    const lines = new Map<string, string>()
    for (const parent of new Set(chat.sessions.flatMap((one) => (one.parent === undefined ? [] : [one.parent])))) {
      const line = startedLine(chat.sessions, parent)
      if (line !== undefined) lines.set(parent, line)
    }
    return lines
  }, [chat.sessions])
  const progress = columns[0]?.rows ?? []
  // What needs the person is drawn on top of In progress; the rest keeps the order, which still holds every card and decides who takes a free slot.
  const needs = useNeedsYou(progress, chat.shown.kind === 'session' ? chat.shown.id : undefined)
  // What works now comes under it, out of the order while it works and back in its place once it stops.
  const busy = progress.filter((one) => !needs.includes(one) && working(one))
  const kept = progress.filter((one) => !needs.includes(one) && !busy.includes(one))
  const groups = (column: (typeof columns)[number]): { readonly heading: string; readonly rows: readonly ChatSession[] }[] => {
    if (column.status !== undefined) return byDay(column.rows, now, column.status === 'done')
    if (needs.length === 0 && busy.length === 0) return [{ heading: '', rows: kept }]
    return [
      ...(needs.length === 0 ? [] : [{ heading: 'Needs you', rows: needs }]),
      ...(busy.length === 0 ? [] : [{ heading: 'Working', rows: busy }]),
      { heading: 'In your order', rows: kept },
    ]
  }
  // Where in In progress a dragged card would land. The order is who a free slot goes to first, and moving a card changes nothing else.
  const [landing, setLanding] = useState<number | undefined>()

  // The cards picked with Cmd or Shift, to be moved, hidden or deleted together. One gone from the board is not picked any more.
  const [picks, setPicks] = useState<ReadonlySet<string>>(new Set())
  const picked = useMemo(
    () => new Set(chat.sessions.filter((one) => picks.has(one.id)).map((one) => one.id)),
    [chat.sessions, picks],
  )
  const chosen = useMemo(() => chat.sessions.filter((one) => picked.has(one.id)), [chat.sessions, picked])
  // Where Shift+click counts from: the card pressed last.
  const from = useRef<string | undefined>(undefined)
  const order = columns.flatMap((column) =>
    groups(column).flatMap((day) => (folded.has(day.heading) ? [] : day.rows.map((one) => one.id))),
  )
  const press = (session: ChatSession, how: 'open' | 'one' | 'run'): void => {
    const start = from.current === undefined ? -1 : order.indexOf(from.current)
    from.current = session.id
    if (how === 'open' && picked.size === 0) {
      chat.show(session)
      return
    }
    const next = new Set(picked)
    const at = order.indexOf(session.id)
    if (how === 'run' && start !== -1 && at !== -1) {
      for (const id of order.slice(Math.min(start, at), Math.max(start, at) + 1)) next.add(id)
    } else if (!next.delete(session.id)) next.add(session.id)
    setPicks(next)
  }
  // What the menu of a picked card does, it does to every picked one.
  const targets = (id: string): readonly string[] => (picked.has(id) ? [...picked] : [id])
  // A card is drawn again only when what it shows changes, so what it calls is read from here at the time.
  const latest = useRef({ press, targets })
  useEffect(() => {
    latest.current = { press, targets }
  })

  // Esc lets go of what is picked, and Delete asks about deleting it.
  useEffect(() => {
    if (chosen.length === 0 || deleting !== undefined) return
    const key = (event: KeyboardEvent): void => {
      const field =
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))
      if (field) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        setPicks(new Set())
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault()
        setDeleting(chosen)
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [chosen, deleting])

  const drop = (status: SessionStatus | undefined): void => {
    const ids = held.current
    const where = landing
    held.current = []
    setOver(undefined)
    setLanding(undefined)
    for (const id of ids) {
      const was = chat.sessions.find((one) => one.id === id)?.status
      if (was !== status) chat.mark(id, status)
    }
    if (status === undefined && where !== undefined) dropSessions(ids, where)
  }

  // Conversations dropped in In progress take that place among the others, before the card they were dropped above.
  const dropSessions = (ids: readonly string[], where: number): void => {
    const rest = progress.map((session) => session.id).filter((id) => !ids.includes(id))
    const before = kept.slice(where).find((session) => !ids.includes(session.id))
    const at = before === undefined ? rest.length : rest.indexOf(before.id)
    const placed = [...rest.slice(0, at), ...ids, ...rest.slice(at)]
    chat.change({ progressOrder: [...placed, ...chat.settings.progressOrder.filter((id) => !placed.includes(id))] })
  }

  const hide = (ids: readonly string[]): void => {
    for (const id of ids) chat.hide(id)
    setPicks(new Set())
  }

  return (
    <div className="board">
      {emptyProfile(chat.settings) === undefined ? null : (
        <div className="board-empty">No projects in {emptyProfile(chat.settings)}. Tick some in Settings, Profiles.</div>
      )}
      <div className="board-columns">
        {columns.map((column) => (
            <div
              key={column.title}
              className={`board-column${over === column.title && column.status !== undefined ? ' taking' : ''}`}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setOver(column.title)
                if (column.status !== undefined) {
                  setLanding(undefined)
                  return
                }
                setLanding(landingAt(event.currentTarget, event.clientY))
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
                setOver((one) => (one === column.title ? undefined : one))
                if (column.status === undefined) setLanding(undefined)
              }}
              onDrop={(event) => {
                event.preventDefault()
                drop(column.status)
              }}
            >
              <div className="board-column-head">
                {column.title}
                <span className="spacer" />
                {column.status === undefined && chat.lineup.limit !== 0 ? (
                  <span className={`state-said working-count${chat.lineup.working > 0 ? ' said-working' : ''}`} title="Conversations working, against the limit set in Settings">
                    <span className="state-dot" />
                    {`${String(chat.lineup.working)} of ${String(chat.lineup.limit)} working`}
                  </span>
                ) : null}
                <span className="count">{column.rows.length}</span>
              </div>
              <div className="board-cards">
                {groups(column).map((day) => (
                  <div key={day.heading} className="board-day" {...(column.status === undefined && day.rows === kept ? { 'data-kept': '' } : {})}>
                    {day.heading === '' ? null : (
                      <button type="button" className="board-day-head" onClick={() => fold(day.heading)}>
                        <Icon name={folded.has(day.heading) ? 'right' : 'down'} size={10} />
                        {day.heading}
                        <span className="spacer" />
                        <span className="count">{day.rows.length}</span>
                      </button>
                    )}
                    {(folded.has(day.heading) ? [] : day.rows).map((session) => (
                      <Fragment key={session.id}>
                      {column.status === undefined && landing !== undefined && landing === kept.indexOf(session) ? <div className="board-drop" /> : null}
                      <BoardCard
                        chat={chat}
                        showProviders={chat.showProviders}
                        session={session}
                        now={now}
                        renaming={renaming === session.id}
                        picked={picked.has(session.id)}
                        started={startedLines.get(session.id)}
                        onPress={(one, how) => latest.current.press(one, how)}
                        onDrag={(id) => (held.current = id === undefined ? [] : latest.current.targets(id))}
                        onMenu={(id, at) => setMenu({ id, at })}
                        onRenamed={(id, name) => {
                          setRenaming(undefined)
                          if (name !== '') chat.rename(id, name)
                        }}
                        onStopRenaming={() => setRenaming(undefined)}
                      />
                      </Fragment>
                    ))}
                  </div>
                ))}
                {column.status === undefined && landing === kept.length ? <div className="board-drop" /> : null}
              </div>
            </div>
          ))}
      </div>

      {chosen.length === 0 ? null : (
        <div className="picked-bar board-picked">
          <span>{chosen.length === 1 ? '1 conversation' : `${String(chosen.length)} conversations`}</span>
          <span className="board-picked-how">Drag one to move them all</span>
          <span className="spacer" />
          <button type="button" className="quiet" title="Esc" onClick={() => setPicks(new Set())}>
            Cancel
          </button>
          <button type="button" className="quiet" onClick={() => hide(chosen.map((one) => one.id))}>
            Hide
          </button>
          <button type="button" className="primary danger" title="Delete" onClick={() => setDeleting(chosen)}>
            Delete
          </button>
        </div>
      )}

      {menu === undefined ? null : (
        <Menu
          anchor={menu.at}
          choices={[
            ...(chat.settings.favorites.includes(menu.id)
              ? [{ value: 'unfavorite', label: 'Remove from favorites', icon: 'star' }]
              : [{ value: 'favorite', label: 'Add to favorites', icon: 'star' }]),
            {
              value: 'status',
              label: 'Mark as',
              icon: 'board',
              choices: SESSION_STATUSES.map((one) => ({
                value: `status:${one.status}`,
                label: one.label,
                icon: STATUS_ICONS[one.status],
                on: targets(menu.id).every((id) => chat.everyone.some((session) => session.id === id && session.status === one.status)),
              })),
            },
            ...(targets(menu.id).every((id) => progress.some((session) => session.id === id))
              ? [
                  {
                    value: 'move',
                    label: 'Move',
                    icon: 'sort',
                    choices: [
                      { value: 'top', label: 'To the top', icon: 'ahead' },
                      { value: 'bottom', label: 'To the bottom', icon: 'behind' },
                    ],
                  },
                ]
              : []),
            ...(picked.has(menu.id) && picked.size > 1
              ? [
                  { value: 'hide', label: `Hide ${String(picked.size)} from this list`, icon: 'hidden' },
                  { value: 'delete', label: `Delete ${String(picked.size)}`, danger: true, icon: 'trash' },
                ]
              : [
                  { value: 'rename', label: 'Rename', icon: 'pencil' },
                  { value: 'shortcut', label: 'Save as a shortcut...', icon: 'bolt' },
                  {
                    value: 'terminals',
                    label: 'Terminal',
                    icon: 'terminal',
                    choices: [
                      { value: 'terminal', label: 'Open in a terminal', icon: 'terminal' },
                      { value: 'copy', label: 'Copy the command', icon: 'copy' },
                    ],
                  },
                  { value: 'hide', label: 'Hide from this list', icon: 'hidden' },
                  { value: 'delete', label: 'Delete', danger: true, icon: 'trash' },
                ]),
          ]}
          onPick={(value) => {
            const favorites = chat.settings.favorites
            if (value === 'favorite') chat.change({ favorites: [...favorites.filter((id) => id !== menu.id), menu.id] })
            if (value === 'unfavorite') chat.change({ favorites: favorites.filter((id) => id !== menu.id) })
            if (value.startsWith('status:')) {
              const status = value.slice('status:'.length) as SessionStatus
              const ids = targets(menu.id)
              const all = ids.every((id) => chat.everyone.find((session) => session.id === id)?.status === status)
              for (const id of ids) chat.mark(id, all ? undefined : status)
            }
            if (value === 'top' || value === 'bottom') {
              const ids = progress.filter((session) => targets(menu.id).includes(session.id)).map((session) => session.id)
              chat.change({ progressOrder: movedOrder(chat.settings.progressOrder, ids, value) })
            }
            if (value === 'rename') setRenaming(menu.id)
            if (value === 'shortcut') {
              const one = chat.everyone.find((session) => session.id === menu.id)
              if (one !== undefined) onShortcutFrom(one)
            }
            if (value === 'copy') void chat.copyTerminal(menu.id)
            if (value === 'terminal') chat.terminal(menu.id)
            if (value === 'hide') hide(targets(menu.id))
            if (value === 'delete') {
              const ids = targets(menu.id)
              const some = chat.everyone.filter((session) => ids.includes(session.id))
              if (some.length > 0) setDeleting(some)
            }
          }}
          onClose={() => setMenu(undefined)}
        />
      )}

      {deleting === undefined ? null : (
        <DeleteChats
          chats={deleting}
          onClose={() => setDeleting(undefined)}
          onDelete={() => {
            chat.remove(deleting.map((one) => one.id))
            setDeleting(undefined)
            setPicks(new Set())
          }}
        />
      )}
    </div>
  )
}

function Card({
  showProviders,
  chat,
  session,
  now,
  renaming,
  picked,
  started,
  onPress,
  onDrag,
  onMenu,
  onRenamed,
  onStopRenaming,
}: {
  readonly showProviders: boolean
  readonly chat: Chat
  readonly session: ChatSession
  readonly now: number
  readonly renaming: boolean
  readonly picked: boolean
  /** "Started 2 - 1 working", worked out once for the board rather than by each card. */
  readonly started: string | undefined
  /** Cmd+click picks one card, Shift+click the run up to it, and a plain click opens it unless some are picked. */
  readonly onPress: (session: ChatSession, how: 'open' | 'one' | 'run') => void
  /** The card being dragged, which the board holds on to until it lands. */
  readonly onDrag: (id: string | undefined) => void
  readonly onMenu: (id: string, at: DOMRect) => void
  readonly onRenamed: (id: string, name: string) => void
  readonly onStopRenaming: () => void
}): React.JSX.Element {
  const open = opened(chat, session)
  const starred = chat.settings.favorites.includes(session.id)
  // The links written in it, counted on the card and listed where the button opens.
  const [links, setLinks] = useState<readonly Link[]>([])
  const [listing, setListing] = useState<DOMRect | undefined>()
  const [kids, setKids] = useState<DOMRect | undefined>()
  useEffect(() => {
    let gone = false
    void window.geckit.chat.links(session.id).then((found) => {
      if (!gone) setLinks(found)
    })
    return () => {
      gone = true
    }
  }, [session.id, session.at])
  // Out of reach, what was working or asking there still is, and the card says so in place of what it last said.
  const host = chat.hosts.find((one) => one.id === hostOf(session.root))
  const away = host !== undefined && outOfReach(host.state) && (session.state === 'working' || session.state === 'asks')
  const stands = away ? { words: outOfReachLine(host.name), tone: 'said-away' } : cardSays(session)
  const background = session.tasks?.filter(running).length ?? 0
  const queued = session.queued?.length ?? 0
  // The line above already says it is working, so what it says it is doing does not say it again.
  const detail = stands?.tone === 'said-working' ? session.stands.replace(/^Working - /, '') : session.stands
  return (
    <div
      className={`board-card${starred ? ' starred' : ''}${open ? ' on' : ''}${picked ? ' picked' : ''}${session.state === 'asks' || session.state === 'unread' ? ` waits ${session.state}` : ''}`}
      draggable={!renaming}
      role="button"
      tabIndex={0}
      data-card={session.id}
      onContextMenu={(event) => {
        event.preventDefault()
        onMenu(session.id, new DOMRect(event.clientX, event.clientY, 0, 0))
      }}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', session.title)
        onDrag(session.id)
      }}
      onDragEnd={() => onDrag(undefined)}
      onClick={(event) =>
        onPress(session, event.shiftKey ? 'run' : (MOD === 'Cmd' ? event.metaKey : event.ctrlKey) ? 'one' : 'open')
      }
      onKeyDown={(event) => {
        if (event.key === 'Enter') chat.show(session)
      }}
    >
      <div className="board-card-head">
        {renaming ? (
          <NameField
            name={session.title}
            className="board-card-name"
            onDone={(name) => (name === undefined ? onStopRenaming() : onRenamed(session.id, name))}
          />
        ) : (
          <>
            {starred ? <Icon name="star" size={11} className="board-card-star" /> : null}
            <span className="board-card-title">{session.title}</span>
            <span className="changed">{ago(session.at, now, true)}</span>
          </>
        )}
      </div>
      <div className="board-card-foot">
        <span>
          <span className="tinted" style={tint(projectColor(homeOf(session), chat.settings))}>
            {projectName(homeOf(session))}
          </span>
          <HostTag root={homeOf(session)} />
          {session.project === undefined ? null : (
            <span className="subfolder"> / {session.root.slice(session.project.length + 1)}</span>
          )}
        </span>
        <Tags session={session} marked={false} />
        <span className="spacer" />
        {links.length === 0 ? null : (
          <button
            type="button"
            className="board-card-links"
            aria-label={`${links.length} links in this conversation`}
            title="Links in this conversation, the newest first"
            onClick={(event) => {
              event.stopPropagation()
              setListing(event.currentTarget.getBoundingClientRect())
            }}
          >
            <Icon name="link" size={11} />
            {links.length}
          </button>
        )}
      </div>
      <From chat={chat} session={session} className="board-card-from" />
      {stands === undefined && background === 0 && queued === 0 ? null : (
        <div className="board-card-state">
          {stands === undefined ? null : (
            <span className={`state-said ${stands.tone}`}>
              <span className="state-dot" />
              {stands.words}
            </span>
          )}
          {background === 0 ? null : (
            <span className="state-said said-background" title="Running in the background">
              <span className="state-dot" />
              {background} in the background
            </span>
          )}
          {queued === 0 ? null : (
            <span className="state-said" title="Messages waiting to go once Claude finishes">
              {queued} queued
            </span>
          )}
        </div>
      )}
      {listing === undefined ? null : (
        <Menu
          anchor={listing}
          choices={links.map((link) => ({
            value: link.url,
            label: link.text ?? shortUrl(link.url),
            ...(link.text === undefined ? {} : { says: shortUrl(link.url) }),
          }))}
          onPick={(url) => window.geckit.chat.openLink(url)}
          onClose={() => setListing(undefined)}
        />
      )}
      {session.goal === undefined ? null : (
        <div className="board-card-goal" title={session.goal.condition}>
          <Icon name="goal" size={10} />
          <span>{session.goal.condition}</span>
        </div>
      )}
      {detail === '' ? null : (
        <div className="board-card-stands" title={session.stands}>
          <span>{detail}</span>
        </div>
      )}
      {started === undefined ? null : (
        <div className="board-card-kids">
          <button
            type="button"
            title="Show them"
            onClick={(event) => {
              event.stopPropagation()
              setKids(event.currentTarget.getBoundingClientRect())
            }}
          >
            {started}
          </button>
        </div>
      )}
      {/* Drawn over the page but inside the card in React, so a row pressed must not also open the card. */}
      {kids === undefined ? null : (
        <span onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
          <StartedMenu chat={chat} id={session.id} anchor={kids} onClose={() => setKids(undefined)} />
        </span>
      )}
      {showProviders ? <ProviderIcon id={session.id} /> : null}
    </div>
  )
}

const opened = (chat: Chat, session: ChatSession): boolean => chat.shown.kind === 'session' && chat.shown.id === session.id

// Typing, and every line streaming into an open conversation, change `chat` without changing anything a card shows.
const BoardCard = memo(
  Card,
  (was, now) =>
    was.showProviders === now.showProviders &&
    was.session === now.session &&
    was.now === now.now &&
    was.renaming === now.renaming &&
    was.picked === now.picked &&
    (was.chat.shown === now.chat.shown || opened(was.chat, was.session) === opened(now.chat, now.session)) &&
    (was.chat.settings === now.chat.settings ||
      (was.chat.settings.favorites.includes(was.session.id) === now.chat.settings.favorites.includes(now.session.id) &&
        projectColor(homeOf(was.session), was.chat.settings) === projectColor(homeOf(now.session), now.chat.settings))) &&
    was.chat.hosts === now.chat.hosts &&
    was.started === now.started,
)

/**
 * The form the New task button opens: which project, what to do, and the goal
 * that says when it is done.
 *
 * The goal goes first and the work after it, so it holds from the first turn
 * rather than from the second, which is what a voice order does too.
 */
/** The row that opens the folder picker rather than choosing a project already there. */
const PICK = '\u0000pick'
/** Choose a folder on a host, by its id after this. */
const PICK_ON = '\u0000on:'

interface KeptTask {
  readonly root: string
  readonly text: string
  readonly goal: string
}

const keptKey = (question: boolean): string => (question ? 'newQuestion' : 'newTask')

/** What was being written in the form when the app went away, so a restart brings it back. */
export function keptTask(question: boolean): KeptTask | undefined {
  try {
    const kept = JSON.parse(localStorage.getItem(keptKey(question)) ?? 'null') as KeptTask | null
    return kept === null || (kept.text.trim() === '' && kept.goal.trim() === '') ? undefined : kept
  } catch {
    return undefined
  }
}

/** What recordings made for the form brought: their length together, their videos, and their frames. */
interface Recorded {
  readonly seconds: number
  readonly videos: readonly string[]
  readonly frames: readonly RecordedFrame[]
}

export function NewTask({
  chat,
  onClose,
  question = false,
  record = false,
  seed = [],
  onSwitch,
  onStarting,
}: {
  readonly chat: Chat
  readonly onClose: () => void
  /** A general question: no project, no goal, and no card. */
  readonly question?: boolean
  /** On the phone: opened to be filled from a recording, whose picker comes up at once. */
  readonly record?: boolean
  /** The pictures it opens with: a screenshot that opened it, or what the other form held. */
  readonly seed?: readonly SessionImage[]
  /** Turned from a task into a question or back, with the pictures carried over; what is written goes over through what the other form keeps. */
  readonly onSwitch?: ((pictures: readonly SessionImage[]) => void) | undefined
  readonly onStarting: (starting: boolean) => void
}): React.JSX.Element {
  const [kept] = useState(() => keptTask(question))
  const [root, setRoot] = useState(() => kept?.root ?? chat.root ?? shownProjects(chat.settings)[0] ?? '')
  const provider = assistantFor(chat.settings, question ? '' : root)
  const modelRoot = question ? undefined : root || undefined
  const [models, setModels] = useState<{ readonly provider: SessionProvider; readonly root: string | undefined; readonly said: ModelsSaid }>()
  useEffect(() => {
    let current = true
    void window.geckit.chat.models(modelRoot, provider).then((said) => {
      if (current) setModels({ provider, root: modelRoot, said: said ?? 'unsaid' })
    }).catch(() => {
      if (current) setModels({ provider, root: modelRoot, said: 'unsaid' })
    })
    return () => { current = false }
  }, [modelRoot, provider])
  const model = provider === 'codex' ? chat.settings.codexModel : chat.settings.chatModel
  const catalog: readonly ClaudeModel[] | undefined = models?.provider === provider && models.root === modelRoot && Array.isArray(models.said) ? models.said : undefined
  const selectedModel = model === '' ? catalog?.find((one) => one.isDefault) : catalog?.find((one) => one.value === model)
  const reasoning = chat.settings.codexReasoning
  const modelChoices = (
    <div className={ON_PHONE ? 'phone-task-group' : 'new-task-models'}>
      <label className={ON_PHONE ? 'phone-task-cell' : 'new-task-label'}>
        Model
        <select
          className="new-task-where task-model-select"
          value={model}
          onChange={(event) => {
            const value = event.target.value
            if (provider === 'claude') chat.change({ chatModel: value })
            else {
              const next = value === '' ? catalog?.find((one) => one.isDefault) : catalog?.find((one) => one.value === value)
              chat.change({ codexModel: value, codexReasoning: next?.reasoning?.some((one) => one.value === reasoning) === true ? reasoning : '' })
            }
          }}
        >
          <option value="">Default</option>
          {model === '' || catalog?.some((one) => one.value === model) ? null : <option value={model}>{model}</option>}
          {catalog === undefined ? <option disabled>{models?.provider === provider && models.root === modelRoot && models.said === 'unsaid' ? 'Models unavailable' : `Asking ${provider === 'codex' ? 'Codex' : 'Claude Code'}...`}</option> : catalog.map((one) => <option key={one.value} value={one.value} disabled={one.disabled} title={one.says}>{one.name}</option>)}
        </select>
      </label>
      {provider !== 'codex' ? null : <label className={ON_PHONE ? 'phone-task-cell' : 'new-task-label'}>
        Reasoning
        <select className="new-task-where task-model-select" value={reasoning} onChange={(event) => chat.change({ codexReasoning: event.target.value as ReasoningEffort | '' })}>
          <option value="">{selectedModel?.defaultReasoning === undefined ? 'Default' : `Default (${selectedModel.defaultReasoning === 'xhigh' ? 'Extra high' : selectedModel.defaultReasoning.charAt(0).toUpperCase() + selectedModel.defaultReasoning.slice(1)})`}</option>
          {reasoning === '' || selectedModel?.reasoning?.some((one) => one.value === reasoning) ? null : <option value={reasoning} disabled>{reasoning === 'xhigh' ? 'Extra high' : reasoning.charAt(0).toUpperCase() + reasoning.slice(1)}</option>}
          {selectedModel?.reasoning?.map((one) => <option key={one.value} value={one.value} title={one.says}>{one.value === 'xhigh' ? 'Extra high' : one.value.charAt(0).toUpperCase() + one.value.slice(1)}</option>)}
        </select>
      </label>}
    </div>
  )
  // A host whose folders are being chosen from, for a project there.
  const [folderOn, setFolderOn] = useState<HostView | undefined>()
  const [text, setText] = useState(kept?.text ?? '')
  const [goal, setGoal] = useState(kept?.goal ?? '')
  useEffect(() => localStorage.setItem(keptKey(question), JSON.stringify({ root, text, goal })), [question, root, text, goal])
  // Closed on purpose, it is let go of; a restart does not unmount it, so what was written stays for the next start.
  useEffect(() => () => localStorage.removeItem(keptKey(question)), [question])
  const [pictures, setPictures] = useState<readonly SessionImage[]>(seed)
  const [starting, setStarting] = useState(false)
  const startingRef = useRef(false)
  const [startError, setStartError] = useState<string | undefined>()
  const [over, setOver] = useState(false)
  const [recorded, setRecorded] = useState<Recorded | undefined>(undefined)
  const [looking, setLooking] = useState<string | undefined>()
  // A file dropped for a project on a host cannot be read there, so it is copied over first; this says so while it goes.
  const [copying, setCopying] = useState<{ readonly text: string; readonly failed: boolean } | undefined>()
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => field.current?.focus(), [])
  // A screenshot taken while the form is open goes among its pictures.
  useEffect(() => window.geckit.chat.onScreenshot((image) => setPictures((held) => [...held, image].slice(0, 8))), [])

  // While the form is open, a recording is made for it: from its own button, the menu, or Cmd+Alt+R.
  useEffect(() => {
    if (ON_PHONE) return
    window.geckit.voice.form(true)
    return () => window.geckit.voice.form(false)
  }, [])

  // The words go at the end of what is written, and the frames among the pictures, kept to what the form holds.
  useEffect(
    () =>
      window.geckit.chat.onRecorded((recording) => {
        if (recording.text !== '') setText((now) => (now.trim() === '' ? recording.text : `${now.trimEnd()}\n${recording.text}`))
        setRecorded((was) => ({
          seconds: (was?.seconds ?? 0) + recording.seconds,
          videos: [...(was?.videos ?? []), ...(recording.video === undefined ? [] : [recording.video])],
          frames: [...(was?.frames ?? []), ...recording.frames],
        }))
        requestAnimationFrame(() => {
          const box = field.current
          if (box === null) return
          box.focus()
          box.setSelectionRange(box.value.length, box.value.length)
        })
      }),
    [],
  )
  const room = Math.max(0, MOST_FRAMES - pictures.length)
  const frames = recorded === undefined || room === 0 ? [] : thinFrames(recorded.frames, room)
  // A file still on its way to a host holds the task back until its path is in the words.
  const [uploading, setUploading] = useState(0)
  const ready = uploading === 0 && (text.trim() !== '' || pictures.length > 0 || frames.length > 0)

  // Pictures are carried with the first message; anything else goes into the field as its path, as the composer does.
  const addPath = (path: string): void =>
    setText((now) => `${now}${now === '' || now.endsWith(' ') ? '' : ' '}${path.includes(' ') ? `"${path}"` : path} `)
  const take = (files: readonly File[]): void => {
    // A general question runs on this computer whatever project the board is on, so nothing of it goes to a host.
    const target = question ? '' : root
    for (const one of files.filter((one) => !canShow(one))) {
      const local = window.geckit.pathFor(one)
      if (local === '') continue
      if (target === '' || !isRemote(target)) {
        addPath(local)
        continue
      }
      const busy = `Copying ${one.name} to ${hostName(target) ?? target}...`
      setCopying({ text: busy, failed: false })
      setUploading((now) => now + 1)
      void window.geckit.chat
        .upload(target, local)
        .catch(() => ({ problem: `Could not copy ${one.name}.` }))
        .then((landed) => {
          setUploading((now) => Math.max(0, now - 1))
          if ('problem' in landed) {
            setCopying({ text: landed.problem, failed: true })
            return
          }
          setCopying((now) => (now?.text === busy ? undefined : now))
          addPath(landed.path)
        })
    }
    const wanted = files.filter(canShow)
    if (wanted.length === 0) return
    void Promise.all(wanted.map((file) => asImage(file).catch(() => undefined))).then((read) => {
      const kept = read.filter((one): one is SessionImage => one !== undefined)
      if (kept.length > 0) setPictures((held) => [...held, ...kept].slice(0, 8))
    })
  }

  const start = (): void => {
    if ((root === '' && !question) || !ready || startingRef.current) return
    // What the frames are and where the video is goes under the words, for Claude rather than for the form; on a host the video is not there, so only the frames are said.
    const note = recorded === undefined ? '' : recordedNote(recorded.seconds, frames, recorded.videos.join(' and ') || undefined, !question && isRemote(root))
    const said = note === '' ? text.trim() : `${text.trim()}\n\n${note}`.trim()
    const sent = [...pictures, ...frames.map((one) => one.image)]
    startingRef.current = true
    setStarting(true)
    onStarting(true)
    setStartError(undefined)
    void (question ? chat.ask(said, sent) : chat.startTask(root, said, goal.trim(), sent)).then(onClose, (error: Error) => {
      startingRef.current = false
      setStarting(false)
      onStarting(false)
      setStartError(error.message)
    })
  }
  const startHint = provider === 'codex' && !question && isRemote(root) ? 'Enable Claude Code in Settings to use this host' : chat.full && !question ? queueWhy(chat.lineup) : question ? `Not on the board. It is deleted a day after the last answer. ${MOD}+Enter asks` : goal.trim() === '' ? `No goal: it stops when ${provider === 'codex' ? 'Codex' : 'Claude'} is done. ${MOD}+Enter starts it` : `${provider === 'codex' ? 'Codex' : 'Claude'} keeps working until this holds, then the card goes to In review`

  if (ON_PHONE) {
    return (
      <PhoneNewTask
        chat={chat}
        question={question}
        root={root}
        text={text}
        goal={goal}
        pictures={pictures}
        onRoot={setRoot}
        onText={setText}
        onGoal={setGoal}
        onPictures={take}
        onDrop={(at) => setPictures((held) => held.filter((_one, index) => index !== at))}
        onStart={start}
        onClose={onClose}
        starting={starting}
        startError={startError}
        record={record}
        frames={frames.map((one) => one.image)}
        recorded={recorded === undefined ? undefined : { seconds: recorded.seconds, video: recorded.videos.length > 0 }}
        onUnrecord={() => setRecorded(undefined)}
        copying={copying}
        modelChoices={modelChoices}
      />
    )
  }

  const profiled = profileOf(chat.settings) !== undefined
  const localProjects = shownProjects(chat.settings).filter((one) => hostOf(one) === undefined)

  return (
    <div
      className="new-task"
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
        event.preventDefault()
        start()
      }}
    >
      {onSwitch === undefined ? (
        <div className="new-task-head">{question ? 'Ask a question' : 'New task'}</div>
      ) : (
        <div className="new-task-head new-task-kinds">
          {[false, true].map((kind) => (
            <button
              key={String(kind)}
              type="button"
              className={`tab${kind === question ? ' on' : ''}`}
              disabled={starting}
              onClick={() => {
                if (kind === question) return
                localStorage.setItem(keptKey(kind), JSON.stringify({ root, text, goal }))
                onSwitch(pictures)
              }}
            >
              {kind ? 'Ask a question' : 'New task'}
            </button>
          ))}
        </div>
      )}
      {question ? null : (
        <label className="new-task-label">
          Project
          <select
            className="new-task-where"
            value={root}
            onChange={(event) => {
              const value = event.target.value
              if (value.startsWith(PICK_ON)) {
                setFolderOn(chat.hosts.find((one) => one.id === value.slice(PICK_ON.length)))
                return
              }
              if (value !== PICK) {
                setRoot(value)
                return
              }
              void window.geckit.chat.addProject().then((picked) => {
                if (picked !== undefined) setRoot(picked)
              })
            }}
          >
            {chat.hosts.length === 0 ? (
              shownProjects(chat.settings).map((one) => (
                <option key={one} value={one}>
                  {projectName(one)}
                </option>
              ))
            ) : (
              <>
                {/* Groups follow projects: in a profile, a group it has no projects in is not its business, and is reached from Settings, Hosts. */}
                {profiled && localProjects.length === 0 ? null : (
                  <optgroup label="Local">
                    {localProjects.map((one) => (
                      <option key={one} value={one}>
                        {projectName(one)}
                      </option>
                    ))}
                  </optgroup>
                )}
                {chat.hosts.map((host) => {
                  const onHost = shownProjects(chat.settings).filter((one) => hostOf(one) === host.id)
                  // Unlike Local, a host group is never its own destination here: with nothing to pick under it, it stays out of the list, in or out of a profile.
                  if (onHost.length === 0) return null
                  return (
                    <optgroup key={host.id} label={host.name}>
                      {onHost.map((one) => (
                        <option key={one} value={one}>
                          {projectLabel(one)}
                        </option>
                      ))}
                    </optgroup>
                  )
                })}
              </>
            )}
            <option value={PICK}>{chat.hosts.length === 0 ? 'Choose a folder...' : 'Choose a folder on this computer...'}</option>
            {/* A folder is only ever added on a host reached now: one not connected has nothing to read it with. */}
            {chat.hosts
              .filter((host) => host.state === 'up')
              .map((host) => (
                <option key={host.id} value={`${PICK_ON}${host.id}`}>
                  Choose a folder on {host.name}...
                </option>
              ))}
          </select>
        </label>
      )}
      {!chat.showProviders ? null : <label className="new-task-label">
        Assistant
        <select className="new-task-where" value={provider} onChange={(event) => chat.change({ chatProvider: event.target.value as SessionProvider })}>
          {assistantsIn(chat.settings).includes('claude') ? <option value="claude">Claude Code</option> : null}
          {assistantsIn(chat.settings).includes('codex') ? <option value="codex" disabled={!question && isRemote(root)}>Codex</option> : null}
        </select>
      </label>}
      {modelChoices}
      <label className="new-task-label">
        {question ? 'Question' : 'What to do'}
        <textarea
          ref={field}
          className={`new-task-text${over ? ' taking' : ''}`}
          rows={5}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={question ? 'Anything, not about a project. Paste a picture, drop a file, or record the screen' : `Ask ${provider === 'codex' ? 'Codex' : 'Claude Code'}. Paste a picture, drop a file, or record the screen`}
          onPaste={(event) => {
            const files = [...event.clipboardData.files]
            if (files.length === 0) return
            event.preventDefault()
            take(files)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(event) => {
            event.preventDefault()
            setOver(false)
            take([...event.dataTransfer.files])
          }}
        />
      </label>
      <div className="new-task-ways">
        <button
          type="button"
          className="quiet"
          title={`Show what you mean and talk; the words and frames come back into this form (${said(ANYWHERE.record)})`}
          onClick={() => window.geckit.voice.record()}
        >
          <Icon name="display" size={13} />
          Record the screen
        </button>
        <button
          type="button"
          className="quiet"
          title={`Say it instead of typing it (${said(ANYWHERE.dictate)})`}
          onClick={() => {
            field.current?.focus()
            window.geckit.voice.dictate()
          }}
        >
          <Icon name="mic" size={13} />
          Dictate
        </button>
      </div>
      {copying === undefined ? null : <p className={copying.failed ? 'error' : 'new-task-why'}>{copying.text}</p>}
      {pictures.length === 0 && frames.length === 0 ? null : (
        <div className="pending">
          {frames.map((one) => (
            <span key={`frame:${String(one.at)}:${one.image.data.slice(-16)}`} className="pending-one">
              <img src={`data:${one.image.media};base64,${one.image.data}`} alt="" onClick={() => setLooking(`data:${one.image.media};base64,${one.image.data}`)} title={`At ${clock(one.at)} in the recording`} />
              <button
                type="button"
                className="icon-button"
                aria-label="Take this frame off"
                title="Take this frame off"
                onClick={() =>
                  setRecorded((was) => (was === undefined ? was : { ...was, frames: was.frames.filter((kept) => kept !== one) }))
                }
              >
                <Icon name="close" size={11} />
              </button>
            </span>
          ))}
          {pictures.map((one, at) => (
            <span key={`${String(at)}:${one.data.slice(0, 16)}`} className="pending-one">
              <img src={`data:${one.media};base64,${one.data}`} alt="" onClick={() => setLooking(`data:${one.media};base64,${one.data}`)} />
              <button
                type="button"
                className="icon-button"
                aria-label="Take this picture off"
                title="Take this picture off"
                onClick={() => setPictures((held) => held.filter((_one, index) => index !== at))}
              >
                <Icon name="close" size={11} />
              </button>
            </span>
          ))}
          {looking === undefined ? null : <Preview src={looking} onClose={() => setLooking(undefined)} />}
        </div>
      )}
      {recorded === undefined ? null : (
        <div className="new-task-recorded">
          <Icon name="display" size={12} />
          <span>From a {clock(recorded.seconds)} recording. Claude gets the video too.</span>
          <button
            type="button"
            className="icon-button"
            aria-label="Take the recording off"
            title="Take the recording off"
            onClick={() => setRecorded(undefined)}
          >
            <Icon name="close" size={11} />
          </button>
        </div>
      )}
      {question ? null : (
        <label className="new-task-label">
          Goal
          <input
            className="new-task-goal"
            value={goal}
            onChange={(event) => setGoal(event.target.value)}
            placeholder="When it is done, as a condition. Leave empty for none"
          />
        </label>
      )}
      <div className="new-task-foot">
        <span className={`new-task-why${startError === undefined ? '' : ' trouble'}`} role={startError === undefined ? 'status' : 'alert'}>{startError ?? (starting ? `Starting ${provider === 'codex' ? 'Codex' : 'Claude Code'}...` : startHint)}</span>
        <span className="spacer" />
        <button type="button" className="quiet" disabled={starting} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={starting || (root === '' && !question) || !ready || (provider === 'codex' && !question && isRemote(root))}
          onClick={start}
        >
          {starting ? 'Starting...' : chat.full && !question ? 'Queue' : question ? 'Ask' : 'Start'}
        </button>
      </div>
      {folderOn === undefined ? null : (
        <HostFolders
          host={folderOn}
          onClose={() => setFolderOn(undefined)}
          onAdded={(added) => setRoot(added)}
        />
      )}
    </div>
  )
}

/** New task on the phone: a sheet over the board, its buttons in its own bar, pulled down to put it away. */
function PhoneNewTask({
  chat,
  question,
  root,
  text,
  goal,
  pictures,
  onRoot,
  onText,
  onGoal,
  onPictures,
  onDrop,
  onStart,
  onClose,
  starting,
  startError,
  record,
  frames,
  recorded,
  onUnrecord,
  copying,
  modelChoices,
}: {
  readonly chat: Chat
  readonly question: boolean
  readonly root: string
  readonly text: string
  readonly goal: string
  readonly pictures: readonly SessionImage[]
  readonly record: boolean
  /** A recording's frames, which go with the pictures. */
  readonly frames: readonly SessionImage[]
  readonly recorded: { readonly seconds: number; readonly video: boolean } | undefined
  readonly onUnrecord: () => void
  /** A file being copied to a host for this task, or what went wrong copying it. */
  readonly copying: { readonly text: string; readonly failed: boolean } | undefined
  readonly onRoot: (root: string) => void
  readonly onText: (text: string) => void
  readonly onGoal: (goal: string) => void
  readonly onPictures: (files: readonly File[]) => void
  readonly onDrop: (at: number) => void
  readonly onStart: () => void
  readonly onClose: () => void
  readonly starting: boolean
  readonly startError: string | undefined
  readonly modelChoices: React.JSX.Element
}): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  const [pickingAssistant, setPickingAssistant] = useState(false)
  const provider = assistantFor(chat.settings, question ? '' : root)
  const [choosing, setChoosing] = useState(false)
  const [recording, setRecording] = useState(record)
  const [listening, setListening] = useState(false)
  const [writing, setWriting] = useState(false)
  const level = useLevel(listening)
  // Dictation goes after what was already typed, as the composer's does.
  const typed = useRef('')
  const [spoken, flipSpoken] = useDictationLanguage(chat.settings.nativeLanguage, chat.settings.secondLanguage)
  const dictating = (): void => {
    const ear = dictate()
    if (ear === undefined) return
    if (listening) {
      setListening(false)
      setWriting(!ear.live)
      void ear.stop().catch(() => undefined).finally(() => setWriting(false))
      return
    }
    typed.current = text.trim() === '' ? '' : `${text.trimEnd()} `
    setListening(true)
    ear
      .start(
        spoken,
        (heard) => onText(`${typed.current}${heard}`),
        () => setListening(false),
      )
      .catch(() => setListening(false))
  }
  useEffect(() => () => dictate()?.cancel(), [])
  const [dragged, setDragged] = useState<number | undefined>()
  const [looking, setLooking] = useState<string | undefined>()
  const from = useRef<number | undefined>(undefined)
  const photos = useRef<HTMLInputElement>(null)
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    if (!record) field.current?.focus()
  }, [record])
  // Nothing typed goes without asking; something typed asks before it is thrown away.
  const leave = (): void => {
    if (starting) return
    if (text.trim() === '' && pictures.length === 0 && frames.length === 0) onClose()
    else setAsking(true)
  }
  const ready = (root !== '' || question) && (question || provider !== 'codex' || !isRemote(root)) && (text.trim() !== '' || pictures.length > 0 || frames.length > 0)
  return (
    <>
      <div className="sheet-scrim" onClick={leave} />
      <div
        className={`phone-task phone-compose${dragged === undefined ? '' : ' dragging'}`}
        role="dialog"
        aria-label={question ? 'Ask a question' : 'New task'}
        style={dragged === undefined ? undefined : { transform: `translateY(${String(dragged)}px)` }}
      >
        <div
          className="phone-task-bar"
          onPointerDown={(event) => {
            if ((event.target as Element).closest('button') !== null) return
            event.currentTarget.setPointerCapture(event.pointerId)
            from.current = event.clientY
            setDragged(0)
          }}
          onPointerMove={(event) => {
            if (from.current !== undefined) setDragged(Math.max(0, event.clientY - from.current))
          }}
          onPointerUp={() => {
            from.current = undefined
            const far = (dragged ?? 0) > 110
            setDragged(undefined)
            if (far) leave()
          }}
        >
          <button type="button" disabled={starting} onClick={leave}>
            Cancel
          </button>
          <b>{question ? 'Question' : 'New task'}</b>
          <button type="button" className="strong" disabled={!ready || starting} onClick={onStart}>
            {starting ? 'Starting...' : question ? 'Ask' : 'Start'}
          </button>
        </div>
        <div className="phone-task-form">
          {starting || startError !== undefined ? <div className={`phone-task-note${startError === undefined ? '' : ' trouble'}`} role={startError === undefined ? 'status' : 'alert'}>{startError ?? `Starting ${provider === 'codex' ? 'Codex' : 'Claude Code'}...`}</div> : null}
          {chat.showProviders ? <div className="phone-task-group"><button type="button" className="phone-task-cell" onClick={() => setPickingAssistant(true)}>Assistant<span>{provider === 'codex' ? 'Codex' : 'Claude Code'}<Icon name="right" size={14} /></span></button></div> : null}
          {pickingAssistant ? <Menu anchor={new DOMRect()} title="Assistant" chosen={provider} choices={[{ value: 'claude', label: 'Claude Code' }, { value: 'codex', label: 'Codex', disabled: !question && isRemote(root), says: 'Your ChatGPT plan, on the paired host' }]} onPick={(value) => chat.change({ chatProvider: value as SessionProvider })} onClose={() => setPickingAssistant(false)} /> : null}
          {modelChoices}
          {question ? null : (
            <>
              <div className="phone-task-group">
                <button type="button" className="phone-task-cell" onClick={() => setChoosing(true)}>
                  Project
                  <span>
                    <span className="phone-task-cell-text">{root === '' ? 'None' : projectLabel(root)}</span>
                    <Icon name="right" size={14} />
                  </span>
                </button>
                <label className="phone-task-cell">
                  Goal
                  <input className="phone-task-goal" value={goal} placeholder="None" onChange={(event) => onGoal(event.target.value)} />
                </label>
              </div>
              <div className="phone-task-note">
                {goal.trim() === '' ? `Without a goal, it stops when ${provider === 'codex' ? 'Codex' : 'Claude'} is done.` : `${provider === 'codex' ? 'Codex' : 'Claude'} keeps working until this holds, then the card goes to In review.`}
              </div>
            </>
          )}
          <textarea
            ref={field}
            className="phone-task-text"
            value={text}
            aria-label={question ? 'Question' : 'What to do'}
            placeholder={listening ? 'Listening' : writing ? 'Writing down what you said' : question ? 'Ask anything; it is not a task' : 'What to do'}
            onChange={(event) => onText(event.target.value)}
          />
          {copying === undefined ? null : (
            <div className={copying.failed ? 'phone-task-note error' : 'phone-task-note'}>{copying.text}</div>
          )}
          {recorded === undefined ? null : (
            <div className="phone-task-recorded">
              <Icon name="display" size={16} />
              <span>
                From a {clock(recorded.seconds)} recording. {provider === 'codex' ? 'Codex gets the frames.' : recorded.video ? 'Claude gets the video too.' : 'Claude gets the frames, not the video.'}
                {text.trim() === '' ? ' Nothing was said in it. Write what to do.' : ''}
              </span>
              <button type="button" aria-label="Take the recording off" onClick={onUnrecord}>
                <Icon name="close" size={13} />
              </button>
            </div>
          )}
          {frames.length === 0 ? null : (
            <div className="pending">
              {frames.map((one, at) => (
                <span key={`f${String(at)}`} className="pending-one">
                  <img src={`data:${one.media};base64,${one.data}`} alt="" onClick={() => setLooking(`data:${one.media};base64,${one.data}`)} />
                </span>
              ))}
              {looking === undefined || pictures.length > 0 ? null : <Preview src={looking} onClose={() => setLooking(undefined)} />}
            </div>
          )}
          {pictures.length === 0 ? null : (
            <div className="pending">
              {pictures.map((one, at) => (
                <span key={`${String(at)}:${one.data.slice(0, 16)}`} className="pending-one">
                  <img src={`data:${one.media};base64,${one.data}`} alt="" onClick={() => setLooking(`data:${one.media};base64,${one.data}`)} />
                  <button type="button" className="icon-button" aria-label="Take this picture off" onClick={() => onDrop(at)}>
                    <Icon name="close" size={11} />
                  </button>
                </span>
              ))}
              {looking === undefined ? null : <Preview src={looking} onClose={() => setLooking(undefined)} />}
            </div>
          )}
        </div>
        {/* What adds to the text sits on the keyboard, as in Notes and Mail, so it is in reach while typing. */}
        <div className="phone-task-tools">
          <button type="button" className={listening ? 'on' : ''} style={{ '--level': level } as React.CSSProperties} disabled={writing} aria-label={listening ? 'Stop dictating' : `Dictate in ${spoken}`} onClick={dictating}>
            <Icon name={writing ? 'spinner' : listening ? 'stop' : 'mic'} size={22} />
          </button>
          {dictate()?.live === false ? null : (
            <button type="button" className="spoken" disabled={listening} onClick={flipSpoken} aria-label={`Dictating in ${spoken}. Switch language`}>
              {languageCode(spoken)}
            </button>
          )}
          <button type="button" aria-label="From a recording" onClick={() => setRecording(true)}>
            <Icon name="display" size={22} />
          </button>
          <button type="button" aria-label="Add photo" onClick={() => photos.current?.click()}>
            <Icon name="photo" size={22} />
          </button>
          <input
            ref={photos}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(event) => {
              onPictures([...(event.target.files ?? [])])
              event.target.value = ''
            }}
          />
          {question ? <span className="phone-task-tools-note">Deleted a day after its last answer.</span> : null}
        </div>
      </div>
      {choosing ? <PhoneProject chat={chat} root={root} onPick={onRoot} onClose={() => setChoosing(false)} /> : null}
      {recording ? <PhoneRecord language={chat.settings.nativeLanguage} onClose={() => setRecording(false)} /> : null}
      {asking ? (
        <Menu
          anchor={new DOMRect()}
          title="Discard this task?"
          choices={[{ value: 'discard', label: 'Discard', danger: true }]}
          onPick={onClose}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </>
  )
}
