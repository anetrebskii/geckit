import { useEffect, useMemo, useRef, useState } from 'react'

import { ANYWHERE, homeOf, SESSION_STATUSES, shownProjects } from '../../../shared/api'
import type { ChatSession, RecordedFrame, SessionImage, SessionStatus } from '../../../shared/api'
import { clock, MOST_FRAMES, recordedNote, thinFrames } from '../../../shared/recording'
import { projectColor } from '../../../shared/project-color'
import { dictate, languageCode, useDictationLanguage } from '../dictate'
import { ON_PHONE } from '../on-phone'
import { asImage, canShow } from '../pictures'
import { hostOf, outOfReach, outOfReachLine } from '../../../shared/hosts'
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
import { Projects } from './Projects'
import { QuestionsMenu } from './Questions'
import { HostTag } from './HostTag'
import { emptyProfile, projectLabel, projectName, tint } from './project'
import { STATUS_ICONS, Tags, Views } from './Sidebar'
import { BoardSearch } from './Switcher'
import type { Seek } from './Switcher'
import { running } from './Tasks'
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
        title="Hidden conversations: kept by Claude Code on this Mac and not on the board"
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
        rows: chat.sessions
          .filter((one) => (column.status === undefined ? one.status !== 'review' && one.status !== 'done' : one.status === column.status))
          .sort((one, other) => other.at - one.at),
      })),
    [chat.sessions],
  )

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
    byDay(column.rows, now, column.status === 'done').flatMap((day) => (folded.has(day.heading) ? [] : day.rows.map((one) => one.id))),
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
    held.current = []
    setOver(undefined)
    for (const id of ids) {
      const was = chat.sessions.find((one) => one.id === id)?.status
      if (was !== status) chat.mark(id, status)
    }
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
                {byDay(column.rows, now, column.status === 'done').map((day) => (
                  <div key={day.heading} className="board-day">
                    {day.heading === '' ? null : (
                      <button type="button" className="board-day-head" onClick={() => fold(day.heading)}>
                        <Icon name={folded.has(day.heading) ? 'right' : 'down'} size={10} />
                        {day.heading}
                        <span className="spacer" />
                        <span className="count">{day.rows.length}</span>
                      </button>
                    )}
                    {(folded.has(day.heading) ? [] : day.rows).map((session) => (
                      <Card
                        key={session.id}
                        chat={chat}
                        session={session}
                        now={now}
                        renaming={renaming === session.id}
                        picked={picked.has(session.id)}
                        onPress={press}
                        onDrag={(id) => (held.current = id === undefined ? [] : targets(id))}
                        onMenu={(id, at) => setMenu({ id, at })}
                        onRenamed={(id, name) => {
                          setRenaming(undefined)
                          if (name !== '') chat.rename(id, name)
                        }}
                        onStopRenaming={() => setRenaming(undefined)}
                      />
                    ))}
                  </div>
                ))}
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
            ...SESSION_STATUSES.map((one) => ({
              value: `status:${one.status}`,
              label: `Mark as ${one.label.toLowerCase()}`,
              icon: STATUS_ICONS[one.status],
              on: targets(menu.id).every((id) => chat.everyone.some((session) => session.id === id && session.status === one.status)),
            })),
            ...(picked.has(menu.id) && picked.size > 1
              ? [
                  { value: 'hide', label: `Hide ${String(picked.size)} from this list`, icon: 'hidden' },
                  { value: 'delete', label: `Delete ${String(picked.size)}`, danger: true, icon: 'trash' },
                ]
              : [
                  { value: 'rename', label: 'Rename', icon: 'pencil' },
                  { value: 'shortcut', label: 'Save as a shortcut...', icon: 'bolt' },
                  { value: 'copy', label: 'Copy the terminal command', icon: 'copy' },
                  { value: 'terminal', label: 'Open in a terminal', icon: 'terminal' },
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
            if (value === 'rename') setRenaming(menu.id)
            if (value === 'shortcut') {
              const one = chat.everyone.find((session) => session.id === menu.id)
              if (one !== undefined) onShortcutFrom(one)
            }
            if (value === 'copy') chat.copyTerminal(menu.id)
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
  picked,
  onPress,
  onDrag,
  onMenu,
  onRenamed,
  onStopRenaming,
}: {
  readonly chat: Chat
  readonly session: ChatSession
  readonly now: number
  readonly renaming: boolean
  readonly picked: boolean
  /** Cmd+click picks one card, Shift+click the run up to it, and a plain click opens it unless some are picked. */
  readonly onPress: (session: ChatSession, how: 'open' | 'one' | 'run') => void
  /** The card being dragged, which the board holds on to until it lands. */
  readonly onDrag: (id: string | undefined) => void
  readonly onMenu: (id: string, at: DOMRect) => void
  readonly onRenamed: (id: string, name: string) => void
  readonly onStopRenaming: () => void
}): React.JSX.Element {
  const open = chat.shown.kind === 'session' && chat.shown.id === session.id
  const starred = chat.settings.favorites.includes(session.id)
  // The links written in it, counted on the card and listed where the button opens.
  const [links, setLinks] = useState<readonly Link[]>([])
  const [listing, setListing] = useState<DOMRect | undefined>()
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
  const stands = away ? { words: outOfReachLine(host.name), tone: 'said-away' } : standing(session)
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
}: {
  readonly chat: Chat
  readonly onClose: () => void
  /** A general question: no project, no goal, and no card. */
  readonly question?: boolean
  /** On the phone: opened to be filled from a recording, whose picker comes up at once. */
  readonly record?: boolean
}): React.JSX.Element {
  const [kept] = useState(() => keptTask(question))
  const [root, setRoot] = useState(() => kept?.root ?? chat.root ?? shownProjects(chat.settings)[0] ?? '')
  // A host whose folders are being chosen from, for a project there.
  const [folderOn, setFolderOn] = useState<HostView | undefined>()
  const [text, setText] = useState(kept?.text ?? '')
  const [goal, setGoal] = useState(kept?.goal ?? '')
  useEffect(() => localStorage.setItem(keptKey(question), JSON.stringify({ root, text, goal })), [question, root, text, goal])
  // Closed on purpose, it is let go of; a restart does not unmount it, so what was written stays for the next start.
  useEffect(() => () => localStorage.removeItem(keptKey(question)), [question])
  const [pictures, setPictures] = useState<readonly SessionImage[]>([])
  const [over, setOver] = useState(false)
  const [recorded, setRecorded] = useState<Recorded | undefined>(undefined)
  const [looking, setLooking] = useState<string | undefined>()
  const field = useRef<HTMLTextAreaElement>(null)
  useEffect(() => field.current?.focus(), [])

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
  const ready = text.trim() !== '' || pictures.length > 0 || frames.length > 0

  // Pictures are carried with the first message; anything else goes into the field as its path, as the composer does.
  const take = (files: readonly File[]): void => {
    const paths = files
      .filter((one) => !canShow(one))
      .map((one) => window.geckit.pathFor(one))
      .filter((path) => path !== '')
      .map((path) => (path.includes(' ') ? `"${path}"` : path))
    if (paths.length > 0) setText((now) => `${now}${now === '' || now.endsWith(' ') ? '' : ' '}${paths.join(' ')} `)
    const wanted = files.filter(canShow)
    if (wanted.length === 0) return
    void Promise.all(wanted.map((file) => asImage(file).catch(() => undefined))).then((read) => {
      const kept = read.filter((one): one is SessionImage => one !== undefined)
      if (kept.length > 0) setPictures((held) => [...held, ...kept].slice(0, 8))
    })
  }

  const start = (): void => {
    if ((root === '' && !question) || !ready) return
    // What the frames are and where the video is goes under the words, for Claude rather than for the form.
    const note = recorded === undefined ? '' : recordedNote(recorded.seconds, frames, recorded.videos.join(' and ') || undefined)
    const said = note === '' ? text.trim() : `${text.trim()}\n\n${note}`.trim()
    const sent = [...pictures, ...frames.map((one) => one.image)]
    if (question) chat.ask(said, sent)
    else chat.startTask(root, said, goal.trim(), sent)
    onClose()
  }

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
        record={record}
        frames={frames.map((one) => one.image)}
        recorded={recorded === undefined ? undefined : { seconds: recorded.seconds, video: recorded.videos.length > 0 }}
        onUnrecord={() => setRecorded(undefined)}
      />
    )
  }

  return (
    <div
      className="new-task"
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
        event.preventDefault()
        start()
      }}
    >
      <div className="new-task-head">{question ? 'Ask a question' : 'New task'}</div>
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
                <optgroup label="Local">
                  {shownProjects(chat.settings)
                    .filter((one) => hostOf(one) === undefined)
                    .map((one) => (
                      <option key={one} value={one}>
                        {projectName(one)}
                      </option>
                    ))}
                </optgroup>
                {chat.hosts.map((host) => (
                  <optgroup key={host.id} label={host.name}>
                    {shownProjects(chat.settings)
                      .filter((one) => hostOf(one) === host.id)
                      .map((one) => (
                        <option key={one} value={one}>
                          {projectLabel(one)}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </>
            )}
            <option value={PICK}>{chat.hosts.length === 0 ? 'Choose a folder...' : 'Choose a folder on this computer...'}</option>
            {chat.hosts.map((host) => (
              <option key={host.id} value={`${PICK_ON}${host.id}`}>
                Choose a folder on {host.name}...
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="new-task-label">
        {question ? 'Question' : 'What to do'}
        <textarea
          ref={field}
          className={`new-task-text${over ? ' taking' : ''}`}
          rows={5}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={question ? 'Anything, not about a project. Paste a picture, drop a file, or record the screen' : 'Ask Claude Code. Paste a picture, drop a file, or record the screen'}
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
        <span className="new-task-why">{question ? `Not on the board. It is deleted a day after the last answer. ${MOD}+Enter asks` : goal.trim() === '' ? `No goal: it stops when Claude is done. ${MOD}+Enter starts it` : 'Claude keeps working until this holds, then the card goes to In review'}</span>
        <span className="spacer" />
        <button type="button" className="quiet" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={(root === '' && !question) || !ready}
          onClick={start}
        >
          {question ? 'Ask' : 'Start'}
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
  record,
  frames,
  recorded,
  onUnrecord,
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
  readonly onRoot: (root: string) => void
  readonly onText: (text: string) => void
  readonly onGoal: (goal: string) => void
  readonly onPictures: (files: readonly File[]) => void
  readonly onDrop: (at: number) => void
  readonly onStart: () => void
  readonly onClose: () => void
}): React.JSX.Element {
  const [asking, setAsking] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [recording, setRecording] = useState(record)
  const [listening, setListening] = useState(false)
  // Dictation goes after what was already typed, as the composer's does.
  const typed = useRef('')
  const [spoken, flipSpoken] = useDictationLanguage(chat.settings.nativeLanguage, chat.settings.secondLanguage)
  const dictating = (): void => {
    const ear = dictate()
    if (ear === undefined) return
    if (listening) {
      ear.stop()
      setListening(false)
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
  useEffect(() => () => dictate()?.stop(), [])
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
    if (text.trim() === '' && pictures.length === 0 && frames.length === 0) onClose()
    else setAsking(true)
  }
  const ready = (root !== '' || question) && (text.trim() !== '' || pictures.length > 0 || frames.length > 0)
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
          <button type="button" onClick={leave}>
            Cancel
          </button>
          <b>{question ? 'Question' : 'New task'}</b>
          <button type="button" className="strong" disabled={!ready} onClick={onStart}>
            {question ? 'Ask' : 'Start'}
          </button>
        </div>
        <div className="phone-task-form">
          {question ? null : (
            <>
              <div className="phone-task-group">
                <button type="button" className="phone-task-cell" onClick={() => setChoosing(true)}>
                  Project
                  <span>
                    {root === '' ? 'None' : projectName(root)}
                    <Icon name="right" size={14} />
                  </span>
                </button>
                <label className="phone-task-cell">
                  Goal
                  <input className="phone-task-goal" value={goal} placeholder="None" onChange={(event) => onGoal(event.target.value)} />
                </label>
              </div>
              <div className="phone-task-note">
                {goal.trim() === '' ? 'Without a goal, it stops when Claude is done.' : 'Claude keeps working until this holds, then the card goes to In review.'}
              </div>
            </>
          )}
          <textarea
            ref={field}
            className="phone-task-text"
            value={text}
            aria-label={question ? 'Question' : 'What to do'}
            placeholder={listening ? 'Listening' : question ? 'Ask anything; it is not a task' : 'What to do'}
            onChange={(event) => onText(event.target.value)}
          />
          {recorded === undefined ? null : (
            <div className="phone-task-recorded">
              <Icon name="display" size={16} />
              <span>
                From a {clock(recorded.seconds)} recording. {recorded.video ? 'Claude gets the video too.' : 'Claude gets the frames, not the video.'}
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
          <button type="button" className={listening ? 'on' : ''} aria-label={listening ? 'Stop dictating' : `Dictate in ${spoken}`} onClick={dictating}>
            <Icon name={listening ? 'stop' : 'mic'} size={22} />
          </button>
          <button type="button" className="spoken" disabled={listening} onClick={flipSpoken} aria-label={`Dictating in ${spoken}. Switch language`}>
            {languageCode(spoken)}
          </button>
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
