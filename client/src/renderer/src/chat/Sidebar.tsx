import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { RefObject } from 'react'

import { homeOf, SESSION_STATUSES } from '../../../shared/api'
import type { ChatGrouping, ChatSession, SessionStatus } from '../../../shared/api'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { MOD } from '../ui/Shortcuts'
import { projectColor } from '../../../shared/project-color'
import { projectName, tint } from './project'
import { DeleteChats } from './DeleteChats'
import { NameField } from './NameField'
import { Projects } from './Projects'
import { Dot } from './Tasks'
import { ago } from './time'
import type { Chat } from './useChat'
import { ALL } from './useChat'

/**
 * The projects, and the conversations of one of them or of all of them.
 *
 * A conversation started in a terminal is in the same list as one started
 * here, because it is the same conversation - the tool keeps both in the same
 * place, and this only reads what is there.
 */

const DAY = 86_400_000

const FAVORITES = 'Favorites'

/** Marked done: out of the way at the bottom, folded until its heading is pressed. */
const DONE = 'Done'

function when(at: number, now: number): string {
  const days = Math.floor((now - at) / DAY)
  if (days < 1 && new Date(at).toDateString() === new Date(now).toDateString()) return 'Today'
  if (days < 2) return 'Yesterday'
  if (days < 8) return 'This week'
  return 'Earlier'
}

/**
 * The rows under their headings, in the order the headings are to stand in.
 *
 * By time the headings are the four above, oldest last. By project they are
 * the folders, the one worked in most recently first, which is the same order
 * the conversations themselves are in.
 */
function gather(
  sessions: readonly ChatSession[],
  by: ChatGrouping,
  now: number,
): [string, ChatSession[]][] {
  const groups = new Map<string, ChatSession[]>()
  for (const session of sessions) {
    const where = by === 'project' ? projectName(homeOf(session)) : when(session.at, now)
    groups.set(where, [...(groups.get(where) ?? []), session])
  }
  return [...groups.entries()]
}

type Group = readonly [string, readonly ChatSession[]]

/** A plain press, one with Cmd (Ctrl elsewhere), and one with Shift, which takes the rows between. */
type Press = 'open' | 'one' | 'run'

const NONE: ReadonlySet<string> = new Set()

/**
 * The favorites first, in the order they were put in, so Cmd+1 is always the
 * same conversation; then the rest under their headings.
 *
 * What waits for the person is not gathered under a heading of its own: a
 * conversation would leave it the moment it was opened, which is the moment
 * the person is looking at it. It is marked where it stands instead.
 */
function arrange(
  sessions: readonly ChatSession[],
  favorites: readonly string[],
  by: ChatGrouping,
  now: number,
): Group[] {
  const listed = new Map(sessions.map((one) => [one.id, one]))
  const kept = favorites.flatMap((id) => listed.get(id) ?? [])
  const favorite = new Set(kept.map((one) => one.id))
  const rest = sessions.filter((one) => !favorite.has(one.id))
  const done = rest.filter((one) => one.status === 'done')
  return [
    ...(kept.length === 0 ? [] : [[FAVORITES, kept] as const]),
    ...gather(
      rest.filter((one) => one.status !== 'done'),
      by,
      now,
    ),
    ...(done.length === 0 ? [] : [[DONE, done] as const]),
  ]
}

/** Where a row being dragged would land among the favorites: above or below the row under the pointer. */
interface Landing {
  readonly id: string
  readonly after: boolean
}

/** What it is about and where it stands: the tracker item from its first message, and the mark it was given. */
export function Tags({
  session,
  marked = true,
}: {
  readonly session: ChatSession
  /** False leaves the mark to a control of its own. */
  readonly marked?: boolean
}): React.JSX.Element | null {
  const { work } = session
  const status = marked ? session.status : undefined
  if (work === undefined && status === undefined) return null
  return (
    <>
      {work === undefined ? null : (
        <button
          type="button"
          className="tag work"
          title={`Open ${work.says}`}
          onClick={(event) => {
            event.stopPropagation()
            window.geckit.chat.openLink(work.url)
          }}
        >
          {work.label}
        </button>
      )}
      {status === undefined ? null : (
        <span className={`tag ${status}`} title={SESSION_STATUSES.find((one) => one.status === status)?.why}>
          {status === 'done' ? <Icon name="check" size={9} /> : null}
          {SESSION_STATUSES.find((one) => one.status === status)?.label}
        </span>
      )}
    </>
  )
}

export const STATUS_ICONS: Record<SessionStatus, string> = { review: 'eye', blocked: 'blocked', done: 'done' }

/**
 * One conversation in the list.
 *
 * Drawn from what it is given and nothing else, so that a keystroke in the
 * field on the right does not draw two hundred of these again. The name being
 * typed while it is renamed is its own, for the same reason.
 */
const Row = memo(function Row({
  session,
  on,
  picking,
  picked,
  place,
  where,
  color,
  changed,
  renaming,
  favorite,
  landing,
  onPress,
  onRenamed,
  onStopRenaming,
  onMenu,
  onDrag,
  onOver,
  onLand,
}: {
  readonly session: ChatSession
  readonly on: boolean
  /** Rows are being picked to be deleted together, and a press picks rather than opens. */
  readonly picking: boolean
  readonly picked: boolean
  /** Its place among the first nine drawn, which Cmd and that number open. */
  readonly place: number | undefined
  /** The folder it belongs to, where the list does not already say. */
  readonly where: string | undefined
  /** The folder's colour, as its place in the palette. */
  readonly color: number
  /** When it last changed: "5m", "14:05", "Yesterday". */
  readonly changed: string
  readonly renaming: boolean
  /** Stands among the favorites, where a row dragged over it lands. */
  readonly favorite: boolean
  /** A row dragged over this one would land above or below it. */
  readonly landing: 'before' | 'after' | undefined
  readonly onPress: (session: ChatSession, how: Press) => void
  readonly onRenamed: (id: string, title: string) => void
  readonly onStopRenaming: () => void
  readonly onMenu: (id: string, at: DOMRect) => void
  readonly onDrag: (id: string | undefined) => void
  readonly onOver: (landing: Landing | undefined) => void
  readonly onLand: () => void
}): React.JSX.Element {
  return (
    <div
      className={`row${on ? ' on' : ''}${picked ? ' picked' : ''}${session.state === 'asks' || session.state === 'unread' ? ` waits ${session.state}` : ''}${landing === undefined ? '' : ` lands-${landing}`}`}
      draggable={!picking && !renaming}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', session.title)
        onDrag(session.id)
      }}
      onDragEnd={() => onDrag(undefined)}
      onDragOver={(event) => {
        if (!favorite) {
          onOver(undefined)
          return
        }
        event.preventDefault()
        const box = event.currentTarget.getBoundingClientRect()
        onOver({ id: session.id, after: event.clientY > box.top + box.height / 2 })
      }}
      onDrop={(event) => {
        event.preventDefault()
        onLand()
      }}
      title={`${session.title === '' ? 'Untitled' : session.title}${place === undefined ? '' : ` (${MOD}+${String(place)})`}`}
      onClick={(event) =>
        onPress(session, event.shiftKey ? 'run' : (MOD === 'Cmd' ? event.metaKey : event.ctrlKey) ? 'one' : 'open')
      }
      onDoubleClick={() => {
        if (!picking) onRenamed(session.id, '')
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        onMenu(session.id, new DOMRect(event.clientX, event.clientY, 0, 0))
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onPress(session, 'open')
      }}
    >
      {picking ? (
        <span className="pick">{picked ? <Icon name="check" size={10} /> : null}</span>
      ) : session.state === 'unread' ? (
        // An answer is taken as read by pressing its mark, without opening the conversation.
        <button
          type="button"
          className="read"
          title="Mark as read"
          onClick={(event) => {
            event.stopPropagation()
            window.geckit.chat.read(session.id)
          }}
        >
          <Dot session={session} />
        </button>
      ) : (
        <Dot session={session} />
      )}
      <span className="lines">
        {renaming ? (
          <NameField
            name={session.title}
            className="row-name"
            onDone={(name) => (name === undefined ? onStopRenaming() : onRenamed(session.id, name))}
          />
        ) : (
          <span className="head">
            <span className="title">{session.title === '' ? 'Untitled' : session.title}</span>
            <span className="changed" title={new Date(session.at).toLocaleString()}>
              {changed}
            </span>
          </span>
        )}
        <span className="foot">
          <Tags session={session} />
          <span className="stands">
            {where === undefined ? null : (
              <span className="where tinted" style={tint(color)}>
                {where}
              </span>
            )}
            {session.stands === '' ? null : <span>{session.stands}</span>}
          </span>
          {place === undefined ? null : <kbd className="place">{`${MOD}+${String(place)}`}</kbd>}
        </span>
      </span>
      <button
        type="button"
        className="icon-button more"
        aria-label="More"
        onClick={(event) => {
          event.stopPropagation()
          onMenu(session.id, event.currentTarget.getBoundingClientRect())
        }}
      >
        <Icon name="more" />
      </button>
    </div>
  )
})

/** The whole list, drawn again only when the list itself changes. */
const Rows = memo(function Rows({
  groups,
  places,
  by,
  now,
  scope,
  colors,
  empty,
  shownId,
  folded,
  renaming,
  picked,
  landing,
  onPress,
  onPickAll,
  onRenamed,
  onStopRenaming,
  onMenu,
  onFold,
  onDrag,
  onOver,
  onLand,
}: {
  readonly groups: readonly Group[]
  readonly places: ReadonlyMap<string, number>
  readonly by: ChatGrouping
  readonly now: number
  readonly scope: string
  readonly colors: Parameters<typeof projectColor>[1]
  /** Said instead of the list where there is no project to list. */
  readonly empty: string | undefined
  readonly shownId: string | undefined
  readonly folded: ReadonlySet<string>
  readonly renaming: string | undefined
  readonly picked: ReadonlySet<string>
  readonly landing: Landing | undefined
  readonly onPress: (session: ChatSession, how: Press) => void
  /** Picks every row under a heading, or lets them all go where every one was picked. */
  readonly onPickAll: (rows: readonly ChatSession[]) => void
  readonly onRenamed: (id: string, title: string) => void
  readonly onStopRenaming: () => void
  readonly onMenu: (id: string, at: DOMRect) => void
  readonly onFold: (where: string) => void
  readonly onDrag: (id: string | undefined) => void
  readonly onOver: (landing: Landing | undefined) => void
  readonly onLand: () => void
}): React.JSX.Element {
  const picking = picked.size > 0
  const list = useRef<HTMLDivElement>(null)
  // The heading the open one stands under: read here so that a row leaving the
  // waiting group the moment it is opened is followed down to its own heading.
  const under = groups.find(([, rows]) => rows.some((one) => one.id === shownId))?.[0]
  // The one open is kept in sight, so one opened from the search is seen here too.
  useEffect(() => {
    list.current?.querySelector('.row.on')?.scrollIntoView({ block: 'nearest' })
  }, [shownId, under])
  return (
    <div ref={list} className={`sessions${picking ? ' picking' : ''}`}>
      {empty !== undefined ? (
        <div className="empty">{empty}</div>
      ) : groups.length === 0 ? (
        <div className="empty">
          {scope === ALL ? 'No conversations in these projects yet.' : 'No conversations about this project yet.'}
        </div>
      ) : (
        groups.map(([where, rows]) => (
          <div key={where}>
            <div
              className={`group-head${where === FAVORITES && landing?.id === '' ? ' lands-after' : ''}`}
              {...(where === FAVORITES
                ? {
                    // Dropped on the heading, it goes first.
                    onDragOver: (event: React.DragEvent) => {
                      event.preventDefault()
                      onOver({ id: '', after: true })
                    },
                    onDrop: (event: React.DragEvent) => {
                      event.preventDefault()
                      onLand()
                    },
                  }
                : {})}
            >
              <button type="button" className="group" onClick={() => onFold(where)}>
                <Icon name={folded.has(where) ? 'right' : 'down'} size={10} />
                {by === 'project' && rows[0] !== undefined && where !== FAVORITES && where !== DONE ? (
                  <span className="tinted" style={tint(projectColor(homeOf(rows[0]), colors))}>{where}</span>
                ) : (
                  where
                )}
                <span className="spacer" />
                <span className="count">{rows.length}</span>
              </button>
              {picking ? (
                <button type="button" className="group-pick" onClick={() => onPickAll(rows)}>
                  {rows.every((one) => picked.has(one.id)) ? 'Deselect' : 'Select all'}
                </button>
              ) : null}
            </div>
            {(folded.has(where) ? [] : rows).map((session) => (
              <Row
                key={session.id}
                session={session}
                on={!picking && session.id === shownId}
                picking={picking}
                picked={picked.has(session.id)}
                place={places.get(session.id)}
                where={
                  where === DONE || (scope === ALL && (by === 'time' || where === FAVORITES))
                    ? projectName(homeOf(session))
                    : undefined
                }
                color={projectColor(homeOf(session), colors)}
                changed={ago(session.at, now, by === 'time')}
                renaming={renaming === session.id}
                favorite={where === FAVORITES}
                landing={landing?.id === session.id ? (landing.after ? 'after' : 'before') : undefined}
                onPress={onPress}
                onRenamed={onRenamed}
                onStopRenaming={onStopRenaming}
                onMenu={onMenu}
                onDrag={onDrag}
                onOver={onOver}
                onLand={onLand}
              />
            ))}
          </div>
        ))
      )}
    </div>
  )
})

export function Sidebar({
  chat,
  orderRef,
  onSettings,
  onSearch,
  onKeys,
  onShortcuts,
  onShortcutFrom,
}: {
  readonly chat: Chat
  readonly orderRef: RefObject<readonly ChatSession[]>
  readonly onSettings: () => void
  readonly onSearch: () => void
  readonly onKeys: () => void
  readonly onShortcuts: () => void
  /** A new shortcut from this conversation: its project, mode and model, and its first message as the prompt. */
  readonly onShortcutFrom: (session: ChatSession) => void
}): React.JSX.Element {
  const [menu, setMenu] = useState<{ id: string; at: DOMRect } | undefined>()
  const [deleting, setDeleting] = useState<readonly ChatSession[] | undefined>()
  // What is picked belongs to the list it was picked in, and another project's list starts with nothing picked.
  const [picks, setPicks] = useState<{ readonly scope: string; readonly ids: ReadonlySet<string> }>({
    scope: '',
    ids: NONE,
  })
  const [grouping, setGrouping] = useState<DOMRect | undefined>()
  // A folder worked in every day has hundreds of conversations, and the next
  // folder is below all of them until its heading is pressed.
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set([DONE]))
  const [renaming, setRenaming] = useState<string | undefined>()
  const [now, setNow] = useState(() => Date.now())

  const openMenu = useCallback((id: string, at: DOMRect) => setMenu({ id, at }), [])
  const fold = useCallback(
    (where: string) =>
      setFolded((held) => {
        const next = new Set(held)
        if (!next.delete(where)) next.add(where)
        return next
      }),
    [],
  )
  const stopRenaming = useCallback(() => setRenaming(undefined), [])
  // An empty name is the double press that starts the renaming; anything else
  // is the name itself, and ends it.
  const rename = chat.rename
  const renamed = useCallback(
    (id: string, title: string) => {
      if (title === '') {
        setRenaming(id)
        return
      }
      rename(id, title)
      setRenaming(undefined)
    },
    [rename],
  )

  // Today becomes Yesterday while the window is open, so the clock is watched.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(tick)
  }, [])

  const by = chat.scope === ALL ? chat.settings.chatGrouping : 'time'
  const favorites = chat.settings.favorites
  const groups = useMemo(
    () => arrange(chat.sessions, favorites, by, now),
    [chat.sessions, favorites, by, now],
  )

  // A row is dragged into the favorites, or along them, and lands where the line is drawn.
  const favoritesRef = useRef(favorites)
  useEffect(() => {
    favoritesRef.current = favorites
  }, [favorites])
  const change = chat.change
  /** Puts one among the favorites next to another, or first where there is no other. */
  const place = useCallback(
    (id: string, next: Landing | undefined) => {
      if (next?.id === id) return
      const rest = favoritesRef.current.filter((one) => one !== id)
      const at = next === undefined || next.id === '' ? 0 : rest.indexOf(next.id) + (next.after ? 1 : 0)
      change({ favorites: [...rest.slice(0, at), id, ...rest.slice(at)] })
    },
    [change],
  )
  const dragged = useRef<string | undefined>(undefined)
  const [landing, setLanding] = useState<Landing | undefined>()
  const landingRef = useRef(landing)
  const over = useCallback((next: Landing | undefined) => {
    if (landingRef.current?.id === next?.id && landingRef.current?.after === next?.after) return
    landingRef.current = next
    setLanding(next)
  }, [])
  const drag = useCallback(
    (id: string | undefined) => {
      dragged.current = id
      if (id === undefined) over(undefined)
    },
    [over],
  )
  const land = useCallback(() => {
    const id = dragged.current
    const next = landingRef.current
    if (id !== undefined && next !== undefined) place(id, next)
    drag(undefined)
  }, [place, drag])
  const show = chat.show
  const shownId = chat.shown.kind === 'session' ? chat.shown.id : undefined
  // One opened from somewhere else, the search above all, unfolds its heading. So does one that moves under another heading while it is open, marked done above all: Done is folded, and a conversation that went there without a word would look lost.
  const where = groups.find(([, rows]) => rows.some((one) => one.id === shownId))?.[0]
  const [unfolded, setUnfolded] = useState<string | undefined>(undefined)
  const stands = shownId === undefined ? undefined : `${shownId} ${where ?? ''}`
  if (unfolded !== stands) {
    setUnfolded(stands)
    if (where !== undefined && folded.has(where)) setFolded(new Set([...folded].filter((one) => one !== where)))
  }
  const drawn = useMemo(() => groups.flatMap(([where, rows]) => (folded.has(where) ? [] : rows)), [groups, folded])
  const places = useMemo(() => new Map(drawn.slice(0, 9).map((one, at) => [one.id, at + 1])), [drawn])
  useEffect(() => {
    orderRef.current = drawn
  }, [orderRef, drawn])

  const scope = chat.scope
  // One that has gone from the list meanwhile is not picked any more.
  const picked = useMemo(() => {
    if (picks.scope !== scope) return NONE
    const there = new Set(groups.flatMap(([, rows]) => rows.map((one) => one.id)).filter((id) => picks.ids.has(id)))
    return there.size === 0 ? NONE : there
  }, [picks, scope, groups])
  const chosen = useMemo(() => groups.flatMap(([, rows]) => rows).filter((one) => picked.has(one.id)), [groups, picked])
  const pickedRef = useRef(picked)
  // Where Shift+click counts from: the row pressed last, or the one open.
  const fromRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    pickedRef.current = picked
  }, [picked])
  const pick = useCallback(
    (ids: ReadonlySet<string>) => {
      pickedRef.current = ids
      setPicks({ scope, ids })
    },
    [scope],
  )

  const press = useCallback(
    (session: ChatSession, how: Press) => {
      const held = pickedRef.current
      const from = fromRef.current ?? shownId
      fromRef.current = session.id
      if (how === 'open' && held.size === 0) {
        show(session)
        return
      }
      const next = new Set(held)
      const order = orderRef.current.map((one) => one.id)
      const start = from === undefined ? -1 : order.indexOf(from)
      const at = order.indexOf(session.id)
      if (how === 'run' && start !== -1 && at !== -1) {
        for (const id of order.slice(Math.min(start, at), Math.max(start, at) + 1)) next.add(id)
      } else if (!next.delete(session.id)) next.add(session.id)
      pick(next)
    },
    [show, shownId, orderRef, pick],
  )
  const pickAll = useCallback(
    (rows: readonly ChatSession[]) => {
      const held = pickedRef.current
      const every = rows.every((one) => held.has(one.id))
      const next = new Set(held)
      for (const one of rows) {
        if (every) next.delete(one.id)
        else next.add(one.id)
      }
      pick(next)
    },
    [pick],
  )

  // Esc lets go of what is picked before it stops an answer, and Delete asks about deleting it.
  useEffect(() => {
    if (chosen.length === 0 && deleting === undefined) return
    const key = (event: KeyboardEvent): void => {
      const field =
        event.target instanceof HTMLElement &&
        (event.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName))
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (deleting !== undefined) setDeleting(undefined)
        else pick(NONE)
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !field && deleting === undefined) {
        event.preventDefault()
        setDeleting(chosen)
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [chosen, deleting, pick])
  const shownFavorites = groups.find(([where]) => where === FAVORITES)?.[1].map((one) => one.id) ?? []
  const headings = groups.map(([where]) => where)
  const allFolded = headings.length > 0 && headings.every((where) => folded.has(where))

  return (
    <div className="sidebar">
      <div className="sidebar-head drag">
        <span className="spacer" />
        <button
          type="button"
          className="icon-button no-drag"
          aria-label="Search conversations"
          title={`Search conversations (${MOD}+P, or ${MOD}+Alt+P from any app)`}
          onClick={onSearch}
        >
          <Icon name="search" />
        </button>
        {headings.length === 0 ? null : (
          <button
            type="button"
            className="icon-button no-drag"
            aria-label={allFolded ? 'Expand all' : 'Collapse all'}
            title={allFolded ? 'Expand all' : 'Collapse all'}
            onClick={() => setFolded(allFolded ? new Set() : new Set(headings))}
          >
            <Icon name={allFolded ? 'expand' : 'collapse'} />
          </button>
        )}
        <button
          type="button"
          className="icon-button no-drag"
          aria-label="As a board"
          title="The conversations as a board, by what stands where"
          onClick={() => chat.change({ chatView: 'board' })}
        >
          <Icon name="board" />
        </button>
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
          aria-label="Settings"
          title={`Settings (${MOD}+,)`}
          onClick={onSettings}
        >
          <Icon name="settings" />
        </button>
        {chat.scope === ALL ? (
          <button
            type="button"
            className="icon-button no-drag"
            aria-label="Group by"
            title="How the list is gathered"
            onClick={(event) => setGrouping(event.currentTarget.getBoundingClientRect())}
          >
            <Icon name="sort" />
          </button>
        ) : null}
      </div>

      <Projects chat={chat} />

      <button type="button" className="new-session" onClick={chat.startNew}>
        <Icon name="plus" />
        New conversation
        <span className="spacer" />
        <span className="keys">{MOD}+N</span>
      </button>

      <Rows
        groups={groups}
        places={places}
        by={by}
        now={now}
        scope={chat.scope}
        colors={chat.settings}
        empty={chat.root === undefined ? 'Add a project folder to start.' : undefined}
        shownId={shownId}
        folded={folded}
        renaming={renaming}
        picked={picked}
        landing={landing}
        onPress={press}
        onPickAll={pickAll}
        onRenamed={renamed}
        onStopRenaming={stopRenaming}
        onMenu={openMenu}
        onFold={fold}
        onDrag={drag}
        onOver={over}
        onLand={land}
      />

      {menu === undefined ? null : (
        <Menu
          anchor={menu.at}
          choices={[
            ...(favorites.includes(menu.id)
              ? [
                  { value: 'unfavorite', label: 'Remove from favorites', icon: 'star' },
                  ...(shownFavorites.indexOf(menu.id) > 0 ? [{ value: 'up', label: 'Move up', icon: 'ahead' }] : []),
                  ...(shownFavorites.indexOf(menu.id) < shownFavorites.length - 1
                    ? [{ value: 'down', label: 'Move down', icon: 'behind' }]
                    : []),
                ]
              : [
                  {
                    value: 'favorite',
                    label: 'Add to favorites',
                    icon: 'star',
                    ...(shownFavorites.length < 9 ? { says: `${MOD}+${String(shownFavorites.length + 1)}` } : {}),
                  },
                ]),
            ...SESSION_STATUSES.map((one) => ({
              value: `status:${one.status}`,
              label: `Mark as ${one.label.toLowerCase()}`,
              icon: STATUS_ICONS[one.status],
              on: chat.everyone.some((session) => session.id === menu.id && session.status === one.status),
            })),
            { value: 'rename', label: 'Rename', icon: 'pencil' },
            { value: 'shortcut', label: 'Save as a shortcut...', icon: 'bolt' },
            { value: 'copy', label: 'Copy the terminal command', icon: 'copy' },
            { value: 'terminal', label: 'Open in a terminal', icon: 'terminal' },
            { value: 'select', label: 'Select', says: `${MOD}+click`, icon: 'select' },
            { value: 'hide', label: 'Hide from this list', icon: 'hidden' },
            { value: 'delete', label: 'Delete', danger: true, icon: 'trash' },
          ]}
          onPick={(value) => {
            if (value === 'favorite') change({ favorites: [...favorites.filter((id) => id !== menu.id), menu.id] })
            if (value === 'unfavorite') change({ favorites: favorites.filter((id) => id !== menu.id) })
            if (value === 'up' || value === 'down') {
              const at = shownFavorites.indexOf(menu.id)
              const other = shownFavorites[value === 'up' ? at - 1 : at + 1]
              if (other !== undefined) place(menu.id, { id: other, after: value === 'down' })
            }
            if (value.startsWith('status:')) {
              const status = value.slice('status:'.length) as SessionStatus
              const was = chat.everyone.find((session) => session.id === menu.id)?.status
              chat.mark(menu.id, was === status ? undefined : status)
            }
            if (value === 'rename') setRenaming(menu.id)
            if (value === 'shortcut') {
              const one = chat.everyone.find((session) => session.id === menu.id)
              if (one !== undefined) onShortcutFrom(one)
            }
            if (value === 'copy') chat.copyTerminal(menu.id)
            if (value === 'terminal') chat.terminal(menu.id)
            if (value === 'hide') chat.hide(menu.id)
            if (value === 'select') {
              fromRef.current = menu.id
              pick(new Set([menu.id]))
            }
            if (value === 'delete') {
              const one = groups.flatMap(([, rows]) => rows).find((row) => row.id === menu.id)
              if (one !== undefined) setDeleting([one])
            }
          }}
          onClose={() => setMenu(undefined)}
        />
      )}

      {grouping === undefined ? null : (
        <Menu
          anchor={grouping}
          title="Group by"
          choices={[
            { value: 'time', label: 'Time' },
            { value: 'project', label: 'Project' },
          ]}
          chosen={chat.settings.chatGrouping}
          onPick={(value) => chat.change({ chatGrouping: value as ChatGrouping })}
          onClose={() => setGrouping(undefined)}
        />
      )}

      {chosen.length === 0 ? null : (
        <div className="picked-bar">
          <span>{chosen.length === 1 ? '1 conversation' : `${String(chosen.length)} conversations`}</span>
          <span className="spacer" />
          <button type="button" className="quiet" title="Esc" onClick={() => pick(NONE)}>
            Cancel
          </button>
          <button type="button" className="primary danger" title="Delete" onClick={() => setDeleting(chosen)}>
            Delete
          </button>
        </div>
      )}

      {deleting === undefined ? null : (
        <DeleteChats
          chats={deleting}
          onClose={() => setDeleting(undefined)}
          onDelete={() => {
            chat.remove(deleting.map((one) => one.id))
            setDeleting(undefined)
            pick(NONE)
          }}
        />
      )}
    </div>
  )
}
