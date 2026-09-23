import { useEffect, useMemo, useRef, useState } from 'react'

import type { ChatSession, SessionStatus } from '../../../shared/api'
import { projectColor } from '../../../shared/project-color'
import { Icon } from '../ui/Icon'
import { MOD } from '../ui/Shortcuts'
import { projectName, tint } from './project'
import { Tags } from './Sidebar'
import { Dot } from './Tasks'
import { ago } from './time'
import type { Chat } from './useChat'
import { ALL } from './useChat'

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

export function Board({ chat }: { readonly chat: Chat }): React.JSX.Element {
  // The card being dragged, and the column the pointer is over.
  const held = useRef<string | undefined>(undefined)
  const [over, setOver] = useState<string | undefined>()
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
        rows: chat.sessions
          .filter((one) => (column.status === undefined ? one.status !== 'review' && one.status !== 'done' : one.status === column.status))
          .sort((one, other) => other.at - one.at),
      })),
    [chat.sessions],
  )

  const drop = (status: SessionStatus | undefined): void => {
    const id = held.current
    held.current = undefined
    setOver(undefined)
    if (id === undefined) return
    const was = chat.sessions.find((one) => one.id === id)?.status
    if (was !== status) chat.mark(id, status)
  }

  return (
    <div className="board">
      <div className="board-head drag">
        <button
          type="button"
          className="icon-button no-drag"
          aria-label="As a list"
          title="The conversations as a list"
          onClick={() => chat.change({ chatView: 'list' })}
        >
          <Icon name="list" />
        </button>
        <select
          className="board-where no-drag"
          value={chat.scope}
          onChange={(event) => chat.setScope(event.target.value)}
          title="Show one project, or all of them"
        >
          <option value={ALL}>All projects</option>
          {chat.settings.projects.map((root) => (
            <option key={root} value={root}>
              {projectName(root)}
            </option>
          ))}
        </select>
        <span className="spacer" />
        <button type="button" className="new-session no-drag board-new" onClick={chat.startNew}>
          <Icon name="plus" />
          New conversation
          <span className="keys">{MOD}+N</span>
        </button>
      </div>

      <div className="board-columns">
        {columns.map((column) => (
          <div
            key={column.title}
            className={`board-column${over === column.title ? ' taking' : ''}`}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'move'
              setOver(column.title)
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
              setOver((one) => (one === column.title ? undefined : one))
            }}
            onDrop={(event) => {
              event.preventDefault()
              drop(column.status)
            }}
          >
            <div className="board-column-head">
              {column.title}
              <span className="spacer" />
              <span className="count">{column.rows.length}</span>
            </div>
            <div className="board-cards">
              {column.rows.map((session) => (
                <Card
                  key={session.id}
                  chat={chat}
                  session={session}
                  now={now}
                  onDrag={(id) => (held.current = id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Card({
  chat,
  session,
  now,
  onDrag,
}: {
  readonly chat: Chat
  readonly session: ChatSession
  readonly now: number
  /** The card being dragged, which the board holds on to until it lands. */
  readonly onDrag: (id: string | undefined) => void
}): React.JSX.Element {
  const open = chat.shown.kind === 'session' && chat.shown.id === session.id
  return (
    <div
      className={`card${open ? ' on' : ''}${session.state === 'asks' || session.state === 'unread' ? ` waits ${session.state}` : ''}`}
      draggable
      role="button"
      tabIndex={0}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', session.title)
        onDrag(session.id)
      }}
      onDragEnd={() => onDrag(undefined)}
      onClick={() => chat.show(session)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') chat.show(session)
      }}
    >
      <div className="card-head">
        <Dot session={session} />
        <span className="card-title">{session.title}</span>
        <span className="changed">{ago(session.at, now, true)}</span>
      </div>
      <div className="card-foot">
        <span className="where tinted" style={tint(projectColor(session.root, chat.settings))}>
          {projectName(session.root)}
        </span>
        <Tags session={session} marked={false} />
      </div>
      {session.goal === undefined ? null : (
        <div className="card-goal" title={session.goal.condition}>
          <Icon name="done" size={10} />
          <span>{session.goal.condition}</span>
        </div>
      )}
      {session.stands === '' ? null : (
        <div className="card-stands" title={session.stands}>
          <span>{session.stands}</span>
        </div>
      )}
    </div>
  )
}
