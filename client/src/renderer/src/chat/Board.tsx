import { useEffect, useMemo, useRef, useState } from 'react'

import { ANYWHERE, SESSION_STATUSES } from '../../../shared/api'
import type { ChatSession, SessionStatus } from '../../../shared/api'
import { projectColor } from '../../../shared/project-color'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { MOD, said } from '../ui/Shortcuts'
import { DeleteChats } from './DeleteChats'
import { NameField } from './NameField'
import { Projects } from './Projects'
import { projectName, tint } from './project'
import { STATUS_ICONS, Tags } from './Sidebar'
import { running } from './Tasks'
import { ago } from './time'
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

export function Board({
  chat,
  onNew,
  onSettings,
  onKeys,
  onShortcuts,
  onShortcutFrom,
}: {
  readonly chat: Chat
  readonly onNew: () => void
  readonly onSettings: () => void
  readonly onKeys: () => void
  readonly onShortcuts: () => void
  /** A new shortcut from this conversation, as the list's own menu makes one. */
  readonly onShortcutFrom: (session: ChatSession) => void
}): React.JSX.Element {
  // The card the menu is open on, the one being renamed, and the ones being deleted.
  const [menu, setMenu] = useState<{ readonly id: string; readonly at: DOMRect } | undefined>()
  const [renaming, setRenaming] = useState<string | undefined>()
  const [deleting, setDeleting] = useState<readonly ChatSession[] | undefined>()
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
        <Projects chat={chat} />
        <button
          type="button"
          className="icon-button no-drag"
          aria-label="Say what to do"
          title={`Say what GeckIt should do: start a conversation, answer one, mark one (${said(ANYWHERE.orders)})`}
          onClick={() => window.geckit.voice.orders()}
        >
          <Icon name="mic" />
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
        <span className="spacer" />
        <button type="button" className="new-session no-drag board-new" onClick={onNew}>
          <Icon name="plus" />
          New task
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
                  renaming={renaming === session.id}
                  onDrag={(id) => (held.current = id)}
                  onMenu={(id, at) => setMenu({ id, at })}
                  onRenamed={(id, name) => {
                    setRenaming(undefined)
                    if (name !== '') chat.rename(id, name)
                  }}
                  onStopRenaming={() => setRenaming(undefined)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {menu === undefined ? null : (
        <Menu
          anchor={menu.at}
          choices={[
            ...(chat.settings.favorites.includes(menu.id)
              ? [{ value: 'unfavorite', label: 'Remove from favorites', icon: 'star' }]
              : [{ value: 'favorite', label: 'Add to favorites', icon: 'star' }]),
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
            { value: 'hide', label: 'Hide from this list', icon: 'hidden' },
            { value: 'delete', label: 'Delete', danger: true, icon: 'trash' },
          ]}
          onPick={(value) => {
            const favorites = chat.settings.favorites
            if (value === 'favorite') chat.change({ favorites: [...favorites.filter((id) => id !== menu.id), menu.id] })
            if (value === 'unfavorite') chat.change({ favorites: favorites.filter((id) => id !== menu.id) })
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
            if (value === 'delete') {
              const one = chat.everyone.find((session) => session.id === menu.id)
              if (one !== undefined) setDeleting([one])
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
          }}
        />
      )}
    </div>
  )
}

/** What the card says is happening in it, in the words the rest of the window uses. */
function standing(session: ChatSession): { readonly words: string; readonly tone: string } | undefined {
  if (session.state === 'working') return { words: 'Claude is working', tone: 'said-working' }
  if (session.state === 'asks') return { words: 'Asking you', tone: 'said-asks' }
  if (session.state === 'unread') return { words: 'Waiting for you', tone: 'said-unread' }
  if (session.state === 'failed') return { words: 'Stopped by an error', tone: 'said-failed' }
  if (session.state === 'limit') return { words: 'Out of the plan for now', tone: 'said-failed' }
  if (session.runs !== undefined) return { words: `Running !${session.runs}`, tone: 'said-working' }
  return undefined
}

function Card({
  chat,
  session,
  now,
  renaming,
  onDrag,
  onMenu,
  onRenamed,
  onStopRenaming,
}: {
  readonly chat: Chat
  readonly session: ChatSession
  readonly now: number
  readonly renaming: boolean
  /** The card being dragged, which the board holds on to until it lands. */
  readonly onDrag: (id: string | undefined) => void
  readonly onMenu: (id: string, at: DOMRect) => void
  readonly onRenamed: (id: string, name: string) => void
  readonly onStopRenaming: () => void
}): React.JSX.Element {
  const open = chat.shown.kind === 'session' && chat.shown.id === session.id
  const stands = standing(session)
  const background = session.tasks?.filter(running).length ?? 0
  const queued = session.queued?.length ?? 0
  // The line above already says it is working, so what it says it is doing does not say it again.
  const detail = stands?.tone === 'said-working' ? session.stands.replace(/^Working - /, '') : session.stands
  return (
    <div
      className={`board-card${open ? ' on' : ''}${session.state === 'asks' || session.state === 'unread' ? ` waits ${session.state}` : ''}`}
      draggable={!renaming}
      role="button"
      tabIndex={0}
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
      onClick={() => chat.show(session)}
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
            <span className="board-card-title">{session.title}</span>
            <span className="changed">{ago(session.at, now, true)}</span>
          </>
        )}
      </div>
      <div className="board-card-foot">
        <span className="tinted" style={tint(projectColor(session.root, chat.settings))}>
          {projectName(session.root)}
        </span>
        <Tags session={session} marked={false} />
      </div>
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
      {session.goal === undefined ? null : (
        <div className="board-card-goal" title={session.goal.condition}>
          <Icon name="done" size={10} />
          <span>{session.goal.condition}</span>
        </div>
      )}
      {detail === '' ? null : (
        <div className="board-card-stands" title={session.stands}>
          <span>{detail}</span>
        </div>
      )}
    </div>
  )
}

/**
 * The form the New task button opens: which project, what to do, and the goal
 * that says when it is done.
 *
 * The goal goes first and the work after it, so it holds from the first turn
 * rather than from the second, which is what a voice order does too.
 */
export function NewTask({ chat, onClose }: { readonly chat: Chat; readonly onClose: () => void }): React.JSX.Element {
  const [root, setRoot] = useState(() => chat.root ?? chat.settings.projects[0] ?? '')
  const [text, setText] = useState('')
  const [goal, setGoal] = useState('')
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => field.current?.focus(), [])

  const start = (): void => {
    if (root === '' || text.trim() === '') return
    chat.startTask(root, text.trim(), goal.trim())
    onClose()
  }

  return (
    <div className="new-task">
      <div className="new-task-head">New task</div>
      <label className="new-task-label">
        Project
        <select className="new-task-where" value={root} onChange={(event) => setRoot(event.target.value)}>
          {chat.settings.projects.map((one) => (
            <option key={one} value={one}>
              {projectName(one)}
            </option>
          ))}
        </select>
      </label>
      <label className="new-task-label">
        What to do
        <textarea
          ref={field}
          className="new-task-text"
          rows={5}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ask Claude Code. @ picks a file, ! runs a command"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) start()
          }}
        />
      </label>
      <label className="new-task-label">
        Goal
        <input
          className="new-task-goal"
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="When it is done, as a condition. Leave empty for none"
        />
      </label>
      <div className="new-task-foot">
        <span className="new-task-why">{goal.trim() === '' ? `No goal: it stops when Claude is done. ${MOD}+Enter starts it` : 'Claude keeps working until this holds, then the card goes to In review'}</span>
        <span className="spacer" />
        <button type="button" className="quiet" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={root === '' || text.trim() === ''} onClick={start}>
          Start
        </button>
      </div>
    </div>
  )
}
