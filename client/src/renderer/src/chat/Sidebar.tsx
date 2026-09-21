import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import type { RefObject } from 'react'

import type { ChatGrouping, ChatSession } from '../../../shared/api'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { MOD } from '../ui/Shortcuts'
import { projectName } from './project'
import { NameField } from './NameField'
import { Projects } from './Projects'
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

const WAITING = 'Waiting for you'

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
    const where = by === 'project' ? projectName(session.root) : when(session.at, now)
    groups.set(where, [...(groups.get(where) ?? []), session])
  }
  return [...groups.entries()]
}

type Group = readonly [string, readonly ChatSession[]]

/** What waits for the person first, then the rest under their headings. */
function arrange(
  sessions: readonly ChatSession[],
  waiting: readonly ChatSession[],
  by: ChatGrouping,
  now: number,
): Group[] {
  const waits = new Set(waiting.map((one) => one.id))
  return [
    ...(waiting.length === 0 ? [] : [[WAITING, waiting] as const]),
    ...gather(
      sessions.filter((one) => !waits.has(one.id)),
      by,
      now,
    ),
  ]
}

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
  place,
  waits,
  where,
  changed,
  renaming,
  onOpen,
  onRenamed,
  onStopRenaming,
  onMenu,
}: {
  readonly session: ChatSession
  readonly on: boolean
  /** Its place among the first nine drawn, which Cmd and that number open. */
  readonly place: number | undefined
  /** Stands under Waiting for you, and is tinted by what it waits for. */
  readonly waits: boolean
  /** The folder it belongs to, where the list does not already say. */
  readonly where: string | undefined
  /** When it last changed: "5m", "14:05", "Yesterday". */
  readonly changed: string
  readonly renaming: boolean
  readonly onOpen: (session: ChatSession) => void
  readonly onRenamed: (id: string, title: string) => void
  readonly onStopRenaming: () => void
  readonly onMenu: (id: string, at: DOMRect) => void
}): React.JSX.Element {
  return (
    <div
      className={`row${on ? ' on' : ''}${waits ? ` waits ${session.state}` : ''}`}
      title={`${session.title === '' ? 'Untitled' : session.title}${place === undefined ? '' : ` (${MOD}+${String(place)})`}`}
      onClick={() => onOpen(session)}
      onDoubleClick={() => onRenamed(session.id, '')}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen(session)
      }}
    >
      <span className={`state ${session.state}`} />
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
            {place === undefined ? null : <span className="keys place">{`${MOD}+${String(place)}`}</span>}
            <span className="changed" title={new Date(session.at).toLocaleString()}>
              {changed}
            </span>
          </span>
        )}
        <span className="stands">
          {where === undefined ? null : <span className="where">{where}</span>}
          {session.stands === '' ? null : <span>{session.stands}</span>}
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
  empty,
  shownId,
  folded,
  renaming,
  onOpen,
  onRenamed,
  onStopRenaming,
  onMenu,
  onFold,
}: {
  readonly groups: readonly Group[]
  readonly places: ReadonlyMap<string, number>
  readonly by: ChatGrouping
  readonly now: number
  readonly scope: string
  /** Said instead of the list where there is no project to list. */
  readonly empty: string | undefined
  readonly shownId: string | undefined
  readonly folded: ReadonlySet<string>
  readonly renaming: string | undefined
  readonly onOpen: (session: ChatSession) => void
  readonly onRenamed: (id: string, title: string) => void
  readonly onStopRenaming: () => void
  readonly onMenu: (id: string, at: DOMRect) => void
  readonly onFold: (where: string) => void
}): React.JSX.Element {
  return (
    <div className="sessions">
      {empty !== undefined ? (
        <div className="empty">{empty}</div>
      ) : groups.length === 0 ? (
        <div className="empty">
          {scope === ALL ? 'No conversations in these projects yet.' : 'No conversations about this project yet.'}
        </div>
      ) : (
        groups.map(([where, rows]) => (
          <div key={where}>
            <button type="button" className="group" onClick={() => onFold(where)}>
              <Icon name={folded.has(where) ? 'right' : 'down'} size={10} />
              {where}
              <span className="spacer" />
              <span className="count">{rows.length}</span>
            </button>
            {(folded.has(where) ? [] : rows).map((session) => (
              <Row
                key={session.id}
                session={session}
                on={session.id === shownId}
                place={places.get(session.id)}
                waits={where === WAITING}
                where={where === WAITING || (by === 'time' && scope === ALL) ? projectName(session.root) : undefined}
                changed={ago(session.at, now, by === 'time')}
                renaming={renaming === session.id}
                onOpen={onOpen}
                onRenamed={onRenamed}
                onStopRenaming={onStopRenaming}
                onMenu={onMenu}
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
}: {
  readonly chat: Chat
  readonly orderRef: RefObject<readonly ChatSession[]>
  readonly onSettings: () => void
  readonly onSearch: () => void
  readonly onKeys: () => void
}): React.JSX.Element {
  const [menu, setMenu] = useState<{ id: string; at: DOMRect } | undefined>()
  const [deleting, setDeleting] = useState<ChatSession | undefined>()
  const [grouping, setGrouping] = useState<DOMRect | undefined>()
  // A folder worked in every day has hundreds of conversations, and the next
  // folder is below all of them until its heading is pressed.
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
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
  const groups = useMemo(() => arrange(chat.sessions, chat.waiting, by, now), [chat.sessions, chat.waiting, by, now])
  const drawn = useMemo(() => groups.flatMap(([where, rows]) => (folded.has(where) ? [] : rows)), [groups, folded])
  const places = useMemo(() => new Map(drawn.slice(0, 9).map((one, at) => [one.id, at + 1])), [drawn])
  useEffect(() => {
    orderRef.current = drawn
  }, [orderRef, drawn])
  // Waiting for you is left open, so what comes into it is seen.
  const headings = groups.map(([where]) => where).filter((where) => where !== WAITING)
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
        empty={chat.root === undefined ? 'Add a project folder to start.' : undefined}
        shownId={chat.shown.kind === 'session' ? chat.shown.id : undefined}
        folded={folded}
        renaming={renaming}
        onOpen={chat.show}
        onRenamed={renamed}
        onStopRenaming={stopRenaming}
        onMenu={openMenu}
        onFold={fold}
      />

      {menu === undefined ? null : (
        <Menu
          anchor={menu.at}
          choices={[
            { value: 'rename', label: 'Rename' },
            { value: 'terminal', label: 'Continue in a terminal' },
            { value: 'hide', label: 'Hide from this list' },
            { value: 'delete', label: 'Delete', danger: true },
          ]}
          onPick={(value) => {
            if (value === 'rename') setRenaming(menu.id)
            if (value === 'terminal') chat.terminal(menu.id)
            if (value === 'hide') chat.hide(menu.id)
            if (value === 'delete') setDeleting(chat.sessions.find((one) => one.id === menu.id))
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

      {deleting === undefined ? null : (
        <div className="dialog-scrim" onMouseDown={() => setDeleting(undefined)}>
          <div className="dialog" onMouseDown={(event) => event.stopPropagation()}>
            <h2>Delete "{deleting.title === '' ? 'Untitled' : deleting.title}"?</h2>
            <p>
              Claude Code keeps this conversation in a file of its own. Deleting it here deletes that file, and nothing
              anywhere keeps a copy.
            </p>
            <div className="dialog-actions">
              <button type="button" className="quiet" autoFocus onClick={() => setDeleting(undefined)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary danger"
                onClick={() => {
                  chat.remove(deleting.id)
                  setDeleting(undefined)
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
