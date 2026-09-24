import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { SESSION_STATUSES } from '../../../shared/api'
import type { CardAnswer, ChatSession, SessionCard, SessionStatus } from '../../../shared/api'
import { projectColor } from '../../../shared/project-color'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { Sheet } from '../ui/Sheet'
import { projectName } from './project'
import { running } from './Tasks'
import { ago } from './time'
import type { Chat } from './useChat'

/**
 * The board as an iPhone draws a list: one column at a time under a large
 * title, what asks for an answer gathered at the top with the answer on the
 * row, and a row's status set by swiping it or from the menu a long press
 * opens. See docs/ux/phone-design.md.
 */

type Column = 'progress' | 'review' | 'done'

const COLUMNS: readonly { readonly column: Column; readonly title: string; readonly empty: string }[] = [
  { column: 'progress', title: 'In progress', empty: 'Nothing in progress.' },
  { column: 'review', title: 'In review', empty: 'Nothing in review.' },
  { column: 'done', title: 'Done', empty: 'Nothing done yet.' },
]

const columnOf = (session: ChatSession): Column =>
  session.status === 'review' ? 'review' : session.status === 'done' ? 'done' : 'progress'

// Past this share of a row's width a swipe is a decision rather than a peek, as in Mail.
const FULL = 0.5
const ACTION = 84
const PRESS = 450
// Three asks fit above the fold with the rest of the column still in sight.
const FOLD = 3

/** The card a session waits on, read from its transcript, for answering it from the board. */
interface Waiting {
  readonly item: string
  readonly card: SessionCard
}

export function PhoneBoard({
  chat,
  onNew,
  onScreen,
}: {
  readonly chat: Chat
  readonly onNew: () => void
  readonly onScreen: () => void
}): React.JSX.Element {
  const [shown, setShown] = useState<Column>(() => {
    const kept = localStorage.getItem('phoneColumn')
    return kept === 'review' || kept === 'done' ? kept : 'progress'
  })
  const show = (column: Column): void => {
    setShown(column)
    localStorage.setItem('phoneColumn', column)
  }
  const [scrolled, setScrolled] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [waiting, setWaiting] = useState<ReadonlyMap<string, Waiting>>(new Map())
  const [pressed, setPressed] = useState<{ readonly session: ChatSession; readonly at: DOMRect } | undefined>()
  const [more, setMore] = useState<ChatSession | undefined>()
  const [renaming, setRenaming] = useState<ChatSession | undefined>()
  // The row whose actions are showing; a touch anywhere else puts it back.
  const [open, setOpen] = useState<string | undefined>()
  const [unfolded, setUnfolded] = useState(false)

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(tick)
  }, [])

  const rows = useMemo(
    () => chat.sessions.filter((one) => columnOf(one) === shown).sort((one, other) => other.at - one.at),
    [chat.sessions, shown],
  )
  const counts = useMemo(() => {
    const count = { progress: 0, review: 0, done: 0 }
    for (const one of chat.sessions) count[columnOf(one)] += 1
    return count
  }, [chat.sessions])
  const asking = shown === 'progress' ? rows.filter((one) => one.state === 'asks') : []
  const rest = rows.filter((one) => !asking.includes(one))
  const folded = unfolded || asking.length <= FOLD ? 0 : asking.length - FOLD

  // Which card each asking session waits on, asked for again whenever one of them moves.
  const asks = chat.sessions.filter((one) => one.state === 'asks')
  const asksKey = asks.map((one) => `${one.id}:${String(one.at)}`).join(',')
  // A new ask is felt as well as seen, wherever in the app the person is: the board stays under an open conversation.
  const asked = useRef(asks.length)
  useEffect(() => {
    if (asks.length > asked.current) tap('warning')
    asked.current = asks.length
  }, [asks.length])
  useEffect(() => {
    let gone = false
    void Promise.all(
      asks.map(async (one) => {
        const items = await window.geckit.chat.items(one.id)
        const card = items.findLast((item) => item.kind === 'card' && item.card.answered === undefined)
        return card?.kind === 'card' ? ([one.id, { item: card.id, card: card.card }] as const) : undefined
      }),
    ).then((found) => {
      if (!gone) setWaiting(new Map(found.filter((one) => one !== undefined)))
    })
    return () => {
      gone = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asksKey])

  const mark = (session: ChatSession, status: SessionStatus | undefined): void => {
    if (session.status !== status) chat.mark(session.id, status)
  }
  const answer = (session: ChatSession, answer: CardAnswer): void => {
    const card = waiting.get(session.id)
    if (card === undefined) return
    tap('light')
    window.geckit.chat.answer(session.id, card.item, answer)
  }

  const high = [chat.plan?.fiveHour, chat.plan?.sevenDay].find((one) => one !== undefined && one.part >= 0.9)
  const highName = high === chat.plan?.fiveHour ? '5-hour window' : 'Week'

  return (
    <div
      className="phone-board"
      onPointerDownCapture={(event) => {
        if (open !== undefined && !(event.target as Element).closest(`[data-row="${open}"]`)) setOpen(undefined)
      }}
    >
      <header className={`phone-bar${scrolled ? ' scrolled' : ''}`}>
        <div className="phone-bar-row">
          <span className="phone-bar-small">GeckIt</span>
          <span className="spacer" />
          <button type="button" className="phone-icon" aria-label="The Mac's screen" onClick={onScreen}>
            <Icon name="display" size={24} />
          </button>
          <button type="button" className="phone-icon" aria-label="New task" onClick={onNew}>
            <Icon name="compose" size={24} />
          </button>
        </div>
        <h1 className="phone-large">GeckIt</h1>
        <div className="phone-seg" role="tablist" style={{ '--at': COLUMNS.findIndex((one) => one.column === shown) } as React.CSSProperties}>
          <span className="phone-seg-thumb" />
          {COLUMNS.map((one) => (
            <button
              key={one.column}
              type="button"
              role="tab"
              aria-selected={one.column === shown}
              className={one.column === shown ? 'on' : ''}
              onClick={() => {
                show(one.column)
                tap('light')
              }}
            >
              {one.title}
              <span className="n">{counts[one.column]}</span>
            </button>
          ))}
        </div>
      </header>

      <div
        className="phone-list"
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 40)}
      >
        {high === undefined ? null : (
          <div className="phone-alert">
            {highName} at {Math.round(high.part * 100)}%. Resets at{' '}
            {new Date(high.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
          </div>
        )}
        {rows.length === 0 ? <div className="phone-empty">{COLUMNS.find((one) => one.column === shown)?.empty}</div> : null}
        {asking.length === 0 ? null : (
          <>
            <div className="phone-head">Needs you</div>
            <div className="phone-group">
              {asking.slice(0, asking.length - folded).map((session) => (
                <Row
                  key={session.id}
                  chat={chat}
                  session={session}
                  now={now}
                  column={shown}
                  open={open === session.id}
                  waiting={waiting.get(session.id)}
                  onOpen={(on) => setOpen(on ? session.id : undefined)}
                  onMark={(status) => mark(session, status)}
                  onMore={() => setMore(session)}
                  onPress={(at) => setPressed({ session, at })}
                  onAnswer={(how) => answer(session, how)}
                />
              ))}
              {folded === 0 ? null : (
                <button type="button" className="phone-fold" onClick={() => setUnfolded(true)}>
                  {folded} more
                </button>
              )}
            </div>
          </>
        )}
        {rest.length === 0 ? null : (
          <>
            {asking.length === 0 ? null : <div className="phone-head">Sessions</div>}
            <div className="phone-group">
              {rest.map((session) => (
                <Row
                  key={session.id}
                  chat={chat}
                  session={session}
                  now={now}
                  column={shown}
                  open={open === session.id}
                  waiting={undefined}
                  onOpen={(on) => setOpen(on ? session.id : undefined)}
                  onMark={(status) => mark(session, status)}
                  onMore={() => setMore(session)}
                  onPress={(at) => setPressed({ session, at })}
                  onAnswer={() => undefined}
                />
              ))}
            </div>
          </>
        )}
        {chat.plan?.fiveHour === undefined && chat.plan?.sevenDay === undefined ? null : (
          <div className="phone-foot">
            {[
              chat.plan.fiveHour === undefined ? '' : `5-hour window ${String(Math.round(chat.plan.fiveHour.part * 100))}%`,
              chat.plan.sevenDay === undefined ? '' : `week ${String(Math.round(chat.plan.sevenDay.part * 100))}%`,
            ]
              .filter((one) => one !== '')
              .join(', ')}
          </div>
        )}
      </div>

      {pressed === undefined ? null : (
        <Pressed
          chat={chat}
          session={pressed.session}
          at={pressed.at}
          now={now}
          waiting={waiting.get(pressed.session.id)}
          onAnswer={(how) => answer(pressed.session, how)}
          onMark={(status) => mark(pressed.session, status)}
          onRename={() => setRenaming(pressed.session)}
          onClose={() => setPressed(undefined)}
        />
      )}
      {more === undefined ? null : (
        <Menu
          anchor={new DOMRect()}
          title="Where it stands"
          explained
          chosen={more.status ?? ''}
          choices={[
            ...SESSION_STATUSES.map((one) => ({ value: one.status, label: one.label, says: one.why })),
            { value: '', label: 'No status', says: 'In progress, with nothing marked' },
          ]}
          onPick={(value) => mark(more, value === '' ? undefined : (value as SessionStatus))}
          onClose={() => setMore(undefined)}
        />
      )}
      {renaming === undefined ? null : <Rename session={renaming} chat={chat} onClose={() => setRenaming(undefined)} />}
    </div>
  )
}

/** The dot, the words and the colour a row's state is said in. */
function standing(session: ChatSession): { readonly tone: string; readonly words?: string } {
  if (session.state === 'working' || session.runs !== undefined) return { tone: 'working', words: 'Working' }
  if (session.state === 'asks') return { tone: 'asks', words: 'Needs an answer' }
  if (session.state === 'failed') return { tone: 'failed', words: 'Stopped by an error' }
  if (session.state === 'limit') return { tone: 'failed', words: 'Out of the plan for now' }
  if (session.state === 'unread') return { tone: 'unread' }
  return { tone: 'read' }
}

/** What a swipe each way does in a column, the way into the column next to it. */
function swipes(column: Column): { readonly lead: { status: SessionStatus | undefined; label: string; tone: string }; readonly trail: { status: SessionStatus | undefined; label: string; tone: string } } {
  if (column === 'progress') return { lead: { status: 'review', label: 'In review', tone: 'review' }, trail: { status: 'done', label: 'Done', tone: 'done' } }
  if (column === 'review') return { lead: { status: undefined, label: 'In progress', tone: 'back' }, trail: { status: 'done', label: 'Done', tone: 'done' } }
  return { lead: { status: undefined, label: 'In progress', tone: 'back' }, trail: { status: 'review', label: 'In review', tone: 'review' } }
}

function RowBody({
  chat,
  session,
  now,
  waiting,
  onAnswer,
}: {
  readonly chat: Chat
  readonly session: ChatSession
  readonly now: number
  readonly waiting: Waiting | undefined
  readonly onAnswer?: (how: CardAnswer) => void
}): React.JSX.Element {
  const stands = standing(session)
  const background = session.tasks?.filter(running).length ?? 0
  const said = stands.tone === 'working' ? session.stands.replace(/^Working - /, '') : session.stands
  const card = session.state === 'asks' ? waiting?.card : undefined
  return (
    <>
      <span className={`phone-dot ${stands.tone}`} />
      <div className="phone-row-text">
        <div className="phone-row-line">
          <span className="phone-row-title">{session.title}</span>
          <span className="phone-row-time">{ago(session.at, now)}</span>
        </div>
        {session.state === 'asks' ? (
          <>
            <div className="phone-row-asks">{card?.title ?? 'Needs an answer'}</div>
            {card?.detail === undefined ? null : <div className="phone-row-cmd">{card.detail}</div>}
          </>
        ) : said === '' ? null : (
          <div className={`phone-row-said${stands.tone === 'working' ? ' working' : ''}`}>{said}</div>
        )}
        <div className="phone-row-meta">
          <span style={{ color: `var(--project-${String(projectColor(session.root, chat.settings))})`, fontWeight: 600 }}>
            {projectName(session.root)}
          </span>
          {session.status === 'blocked' ? <span className="phone-row-tag blocked">Blocked</span> : null}
          {session.goal === undefined ? null : <span className="phone-row-tag">Goal</span>}
          {background === 0 ? null : <span className="phone-row-tag">{background} in the background</span>}
        </div>
        {card === undefined || onAnswer === undefined ? null : card.kind === 'permission' ? (
          <div className="phone-row-answer">
            <button type="button" className="phone-button grey" onClick={() => onAnswer('no')}>
              No
            </button>
            <button type="button" className="phone-button fill" onClick={() => onAnswer('once')}>
              Allow once
            </button>
          </div>
        ) : null}
      </div>
    </>
  )
}

function Row({
  chat,
  session,
  now,
  column,
  open,
  waiting,
  onOpen,
  onMark,
  onMore,
  onPress,
  onAnswer,
}: {
  readonly chat: Chat
  readonly session: ChatSession
  readonly now: number
  readonly column: Column
  readonly open: boolean
  readonly waiting: Waiting | undefined
  readonly onOpen: (on: boolean) => void
  readonly onMark: (status: SessionStatus | undefined) => void
  readonly onMore: () => void
  readonly onPress: (at: DOMRect) => void
  readonly onAnswer: (how: CardAnswer) => void
}): React.JSX.Element {
  const [x, setX] = useState(0)
  const [moving, setMoving] = useState(false)
  const touch = useRef<{ x: number; y: number; from: number; way?: 'side' | 'down'; timer: number; pressed: boolean } | undefined>(undefined)
  const { lead, trail } = swipes(column)
  // Measured when a finger lands on it; the row is as wide as the list.
  const [width, setWidth] = useState(360)
  const [committed, setCommitted] = useState(false)
  // Closed from outside by a touch on another row, which leaves only this row's own moves to show.
  const offset = open || moving || committed ? x : 0

  const settle = (at: number): void => {
    setMoving(false)
    if (at < -width * FULL) {
      tap('firm')
      setCommitted(true)
      setX(-width)
      setTimeout(() => onMark(trail.status), 220)
    } else if (at > width * FULL) {
      tap('firm')
      setCommitted(true)
      setX(width)
      setTimeout(() => onMark(lead.status), 220)
    } else if (at < -48) {
      setX(-ACTION * 2)
      onOpen(true)
    } else if (at > 48) {
      setX(ACTION + 12)
      onOpen(true)
    } else {
      setX(0)
      onOpen(false)
    }
  }

  const full = offset < -width * FULL
  const leadFull = offset > width * FULL

  return (
    <div className="phone-swipe" data-row={session.id}>
      <div className="phone-actions lead" style={{ width: Math.max(0, offset) }}>
        <button type="button" className={`phone-action ${lead.tone}`} style={{ width: leadFull ? '100%' : ACTION + 12 }} onClick={() => onMark(lead.status)}>
          {lead.label}
        </button>
      </div>
      <div className="phone-actions trail" style={{ width: Math.max(0, -offset) }}>
        {full ? null : (
          <button
            type="button"
            className="phone-action more"
            onClick={() => {
              onOpen(false)
              onMore()
            }}
          >
            <Icon name="more" size={20} />
            More
          </button>
        )}
        <button type="button" className={`phone-action ${trail.tone}`} style={{ width: full ? '100%' : ACTION }} onClick={() => onMark(trail.status)}>
          {trail.tone === 'done' ? <Icon name="check" size={20} /> : null}
          {trail.label}
        </button>
      </div>
      <div
        className={`phone-row${moving ? ' moving' : ''}`}
        role="button"
        tabIndex={0}
        style={{ transform: `translateX(${String(offset)}px)` }}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') chat.show(session)
        }}
        onPointerDown={(event) => {
          if ((event.target as Element).closest('button') !== null) return
          const target = event.currentTarget
          setWidth(target.offsetWidth)
          touch.current = {
            x: event.clientX,
            y: event.clientY,
            from: offset,
            pressed: false,
            timer: window.setTimeout(() => {
              if (touch.current === undefined || touch.current.way !== undefined) return
              touch.current.pressed = true
              tap('light')
              onPress(target.getBoundingClientRect())
            }, PRESS),
          }
        }}
        onPointerMove={(event) => {
          const held = touch.current
          if (held === undefined || held.pressed) return
          const dx = event.clientX - held.x
          const dy = event.clientY - held.y
          if (held.way === undefined && Math.hypot(dx, dy) > 8) {
            window.clearTimeout(held.timer)
            held.way = Math.abs(dx) > Math.abs(dy) ? 'side' : 'down'
            if (held.way === 'side') {
              event.currentTarget.setPointerCapture(event.pointerId)
              setMoving(true)
            }
          }
          if (held.way === 'side') setX(Math.max(-width, Math.min(width, held.from + dx)))
        }}
        onPointerUp={() => {
          const held = touch.current
          touch.current = undefined
          if (held === undefined) return
          window.clearTimeout(held.timer)
          if (held.pressed) return
          if (held.way === 'side') settle(x)
          else if (held.way === undefined) {
            if (open) settle(0)
            else chat.show(session)
          }
        }}
        onPointerCancel={() => {
          const held = touch.current
          touch.current = undefined
          if (held === undefined) return
          window.clearTimeout(held.timer)
          if (held.way === 'side') settle(x)
        }}
      >
        <RowBody chat={chat} session={session} now={now} waiting={waiting} onAnswer={onAnswer} />
      </div>
    </div>
  )
}

/** A long-pressed row, lifted over the blurred list, with what can be done to it under it. */
function Pressed({
  chat,
  session,
  at,
  now,
  waiting,
  onAnswer,
  onMark,
  onRename,
  onClose,
}: {
  readonly chat: Chat
  readonly session: ChatSession
  readonly at: DOMRect
  readonly now: number
  readonly waiting: Waiting | undefined
  readonly onAnswer: (how: CardAnswer) => void
  readonly onMark: (status: SessionStatus | undefined) => void
  readonly onRename: () => void
  readonly onClose: () => void
}): React.JSX.Element {
  const menu = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState<number | undefined>()
  useEffect(() => {
    const height = menu.current?.offsetHeight ?? 0
    const below = at.bottom + 8
    setTop(below + height < window.innerHeight - 20 ? below : Math.max(60, at.top - height - 8))
  }, [at])
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const pick = (then: () => void): void => {
    onClose()
    then()
  }
  const permission = session.state === 'asks' && waiting?.card.kind === 'permission'
  const is = (status: SessionStatus | undefined): boolean => session.status === status

  return createPortal(
    <>
      <div className="phone-veil" onClick={onClose} />
      <div className="phone-lifted" style={{ left: at.left, top: at.top, width: at.width }}>
        <div className="phone-row">
          <RowBody chat={chat} session={session} now={now} waiting={waiting} />
        </div>
      </div>
      <div
        ref={menu}
        className="phone-menu"
        role="menu"
        style={{ left: Math.min(at.left + 8, window.innerWidth - 262), top: top ?? -9999, visibility: top === undefined ? 'hidden' : 'visible' }}
      >
        {permission ? (
          <>
            <button type="button" role="menuitem" className="accent" onClick={() => pick(() => onAnswer('once'))}>
              Allow once
            </button>
            <button type="button" role="menuitem" onClick={() => pick(() => onAnswer('session'))}>
              Allow this session
            </button>
            <button type="button" role="menuitem" onClick={() => pick(() => onAnswer('no'))}>
              No
            </button>
            <div className="gap" />
          </>
        ) : null}
        {SESSION_STATUSES.map((one) => (
          <button key={one.status} type="button" role="menuitem" onClick={() => pick(() => onMark(is(one.status) ? undefined : one.status))}>
            {one.label}
            {is(one.status) ? <Icon name="check" size={16} /> : null}
          </button>
        ))}
        <button type="button" role="menuitem" onClick={() => pick(() => onMark(undefined))}>
          No status
          {session.status === undefined ? <Icon name="check" size={16} /> : null}
        </button>
        <div className="gap" />
        <button type="button" role="menuitem" onClick={() => pick(onRename)}>
          Rename
          <Icon name="pencil" size={16} />
        </button>
        {session.state === 'working' ? (
          <button type="button" role="menuitem" onClick={() => pick(() => window.geckit.chat.stop(session.id))}>
            Stop
            <Icon name="stop" size={16} />
          </button>
        ) : null}
      </div>
    </>,
    document.body,
  )
}

export function Rename({ session, chat, onClose }: { readonly session: ChatSession; readonly chat: Chat; readonly onClose: () => void }): React.JSX.Element {
  const [name, setName] = useState(session.title)
  const save = (): void => {
    if (name.trim() !== '' && name.trim() !== session.title) chat.rename(session.id, name.trim())
    onClose()
  }
  return (
    <Sheet title="Rename" onClose={onClose} cancel={false}>
      <input
        className="sheet-field"
        value={name}
        autoFocus
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') save()
        }}
      />
      <div className="sheet-list">
        <button type="button" className="sheet-option sheet-cancel" onClick={save}>
          Save
        </button>
      </div>
    </Sheet>
  )
}
