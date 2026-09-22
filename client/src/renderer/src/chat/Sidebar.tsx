import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

/** A plain press, one with Cmd (Ctrl elsewhere), and one with Shift, which takes the rows between. */
type Press = 'open' | 'one' | 'run'

const NONE: ReadonlySet<string> = new Set()

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
  picking,
  picked,
  place,
  waits,
  where,
  changed,
  renaming,
  onPress,
  onRenamed,
  onStopRenaming,
  onMenu,
}: {
  readonly session: ChatSession
  readonly on: boolean
  /** Rows are being picked to be deleted together, and a press picks rather than opens. */
  readonly picking: boolean
  readonly picked: boolean
  /** Its place among the first nine drawn, which Cmd and that number open. */
  readonly place: number | undefined
  /** Stands under Waiting for you, and is tinted by what it waits for. */
  readonly waits: boolean
  /** The folder it belongs to, where the list does not already say. */
  readonly where: string | undefined
  /** When it last changed: "5m", "14:05", "Yesterday". */
  readonly changed: string
  readonly renaming: boolean
  readonly onPress: (session: ChatSession, how: Press) => void
  readonly onRenamed: (id: string, title: string) => void
  readonly onStopRenaming: () => void
  readonly onMenu: (id: string, at: DOMRect) => void
}): React.JSX.Element {
  return (
    <div
      className={`row${on ? ' on' : ''}${picked ? ' picked' : ''}${waits ? ` waits ${session.state}` : ''}`}
      title={`${session.title === '' ? 'Untitled' : session.title}${place === undefined ? '' : ` (${MOD}+${String(place)})`}`}
      onClick={(event) =>
        onPress(session, event.shiftKey ? 'run' : (MOD === 'Cmd' ? event.metaKey : event.ctrlKey) ? 'one' : 'open')
      }
      onDoubleClick={() => {
        if (!picking) onRenamed(session.id, '')
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onPress(session, 'open')
      }}
    >
      {picking ? (
        <span className="pick">{picked ? <Icon name="check" size={10} /> : null}</span>
      ) : (
        <span className={`state ${session.state}`} />
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
  picked,
  onPress,
  onPickAll,
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
  readonly picked: ReadonlySet<string>
  readonly onPress: (session: ChatSession, how: Press) => void
  /** Picks every row under a heading, or lets them all go where every one was picked. */
  readonly onPickAll: (rows: readonly ChatSession[]) => void
  readonly onRenamed: (id: string, title: string) => void
  readonly onStopRenaming: () => void
  readonly onMenu: (id: string, at: DOMRect) => void
  readonly onFold: (where: string) => void
}): React.JSX.Element {
  const picking = picked.size > 0
  return (
    <div className={`sessions${picking ? ' picking' : ''}`}>
      {empty !== undefined ? (
        <div className="empty">{empty}</div>
      ) : groups.length === 0 ? (
        <div className="empty">
          {scope === ALL ? 'No conversations in these projects yet.' : 'No conversations about this project yet.'}
        </div>
      ) : (
        groups.map(([where, rows]) => (
          <div key={where}>
            <div className="group-head">
              <button type="button" className="group" onClick={() => onFold(where)}>
                <Icon name={folded.has(where) ? 'right' : 'down'} size={10} />
                {where}
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
                waits={where === WAITING}
                where={where === WAITING || (by === 'time' && scope === ALL) ? projectName(session.root) : undefined}
                changed={ago(session.at, now, by === 'time')}
                renaming={renaming === session.id}
                onPress={onPress}
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
  const [deleting, setDeleting] = useState<readonly ChatSession[] | undefined>()
  // What is picked belongs to the list it was picked in, and another project's list starts with nothing picked.
  const [picks, setPicks] = useState<{ readonly scope: string; readonly ids: ReadonlySet<string> }>({
    scope: '',
    ids: NONE,
  })
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

  const show = chat.show
  const shownId = chat.shown.kind === 'session' ? chat.shown.id : undefined
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
        shownId={shownId}
        folded={folded}
        renaming={renaming}
        picked={picked}
        onPress={press}
        onPickAll={pickAll}
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
            { value: 'copy', label: 'Copy the terminal command' },
            { value: 'terminal', label: 'Open in a terminal' },
            { value: 'select', label: 'Select', says: `${MOD}+click` },
            { value: 'hide', label: 'Hide from this list' },
            { value: 'delete', label: 'Delete', danger: true },
          ]}
          onPick={(value) => {
            if (value === 'rename') setRenaming(menu.id)
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
        <div className="dialog-scrim" onMouseDown={() => setDeleting(undefined)}>
          <div className="dialog" onMouseDown={(event) => event.stopPropagation()}>
            {deleting.length === 1 ? (
              <>
                <h2>Delete "{deleting[0]?.title === '' ? 'Untitled' : deleting[0]?.title}"?</h2>
                <p>
                  Claude Code keeps this conversation in a file of its own. Deleting it here deletes that file, and
                  nothing anywhere keeps a copy.
                </p>
              </>
            ) : (
              <>
                <h2>Delete {deleting.length} conversations?</h2>
                <p>
                  Claude Code keeps each conversation in a file of its own. Deleting them here deletes those files, and
                  nothing anywhere keeps a copy.
                </p>
              </>
            )}
            <div className="dialog-actions">
              <button type="button" className="quiet" autoFocus onClick={() => setDeleting(undefined)}>
                Cancel
              </button>
              <button
                type="button"
                className="primary danger"
                onClick={() => {
                  chat.remove(deleting.map((one) => one.id))
                  setDeleting(undefined)
                  pick(NONE)
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
