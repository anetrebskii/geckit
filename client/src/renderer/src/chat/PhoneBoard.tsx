import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { homeOf, SESSION_STATUSES } from '../../../shared/api'
import type { CardAnswer, ChatSession, SessionCard, SessionStatus } from '../../../shared/api'
import { projectColor } from '../../../shared/project-color'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { Sheet } from '../ui/Sheet'
import { resetsAt } from './PhoneInfo'
import { PhoneScope, ScopeButton } from './PhoneScope'
import { Ways } from './PhoneShortcuts'
import { macs } from '../macs'
import type { Macs } from '../macs'
import { emptyProfile, projectName } from './project'
import { running } from './Tasks'
import { ago, byDay, questionLeft } from './time'
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
// A release faster than this, in px/ms, is a flick; its end is projected this many ms ahead.
const FLICK = 0.35
const PROJECT = 180
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
  onSay,
  onShortcut,
  onShortcuts,
}: {
  readonly chat: Chat
  readonly onNew: (how?: 'record') => void
  readonly onScreen: () => void
  /** Say it: what is said to GeckIt, read into orders. */
  readonly onSay: () => void
  /** A shortcut made from this conversation's first message. */
  readonly onShortcut: (session: ChatSession) => void
  /** All shortcuts, over the board: from the bolt in the bar or the end of the New task sheet. */
  readonly onShortcuts: () => void
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
  const [deleting, setDeleting] = useState<ChatSession | undefined>()
  const [hiding, setHiding] = useState<ChatSession | undefined>()
  // The row whose actions are showing; a touch anywhere else puts it back.
  const [open, setOpen] = useState<string | undefined>()
  const [unfolded, setUnfolded] = useState(false)
  // A day in Done folded away, by its heading, for as long as the app is open.
  const [foldedDays, setFoldedDays] = useState<ReadonlySet<string>>(new Set())
  const foldDay = (heading: string): void => {
    tap('light')
    setFoldedDays((was) => {
      const next = new Set(was)
      if (!next.delete(heading)) next.add(heading)
      return next
    })
  }

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
  const [ways, setWays] = useState(false)
  const [scoping, setScoping] = useState(false)
  const newPress = useRef<number | undefined>(undefined)
  const newHeld = useRef(false)
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
        const card = await window.geckit.chat.waiting(one.id)
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
        if (open !== undefined && !(event.target as Element).closest(`[data-row="${open}"]`)) {
          event.stopPropagation()
          setOpen(undefined)
        }
      }}
    >
      <header className={`phone-bar${scrolled ? ' scrolled' : ''}`}>
        <div className="phone-bar-row">
          <span className="phone-bar-small">Tasks</span>
          <button type="button" className="phone-icon" aria-label="Shortcuts" onClick={onShortcuts}>
            <Icon name="bolt" size={24} />
          </button>
          <button type="button" className="phone-icon" aria-label="Say it" onClick={onSay}>
            <Icon name="mic" size={24} />
          </button>
          <button type="button" className="phone-icon" aria-label="The Mac's screen" onClick={onScreen}>
            <Icon name="display" size={24} />
          </button>
          {/* A long press offers the other ways to start one, as the arrow beside New task does on the Mac. */}
          <button
            type="button"
            className="phone-icon"
            aria-label="New task"
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={() => {
              newHeld.current = false
              newPress.current = window.setTimeout(() => {
                newHeld.current = true
                tap('light')
                setWays(true)
              }, PRESS)
            }}
            onPointerUp={() => window.clearTimeout(newPress.current)}
            onPointerLeave={() => window.clearTimeout(newPress.current)}
            onClick={() => {
              if (!newHeld.current) onNew()
            }}
          >
            <Icon name="compose" size={24} />
          </button>
        </div>
      </header>

      <h1 className={`phone-large${scrolled ? ' folded' : ''}`}>Tasks</h1>
      <div className={`phone-seg-bar${scrolled ? ' scrolled' : ''}`}>
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
              {chat.listed ? <span className="n">{counts[one.column]}</span> : null}
            </button>
          ))}
        </div>
        <ScopeButton chat={chat} onPress={() => setScoping(true)} />
      </div>

      <div
        className="phone-list"
        onScroll={(event) => {
          const top = event.currentTarget.scrollTop
          setScrolled((was) => top > 40 || (was && top > 0))
        }}
      >
        {high === undefined ? null : (
          <div className="phone-alert">
            {highName} at {Math.round(high.part * 100)}%. Resets at{' '}
            {new Date(high.resetsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.
          </div>
        )}
        {!chat.listed ? (
          <div className="phone-group" aria-busy="true" aria-label="Reading the conversations">
            {[0, 1, 2].map((one) => (
              <div key={one} className="phone-row">
                <span className="phone-dot skeleton-dot" />
                <div className="phone-row-text">
                  <div className="skeleton-line" />
                  <div className="skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="phone-empty">
            {emptyProfile(chat.settings) === undefined
              ? COLUMNS.find((one) => one.column === shown)?.empty
              : `No projects in ${emptyProfile(chat.settings) ?? ''}. Tick some in Settings, Profiles.`}
          </div>
        ) : null}
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
        {rest.length === 0
          ? null
          : byDay(rest, now, shown === 'done').map((day) => (
              <Fragment key={day.heading}>
                {day.heading !== '' ? (
                  <button
                    type="button"
                    className="phone-head phone-day-head"
                    aria-expanded={!foldedDays.has(day.heading)}
                    onClick={() => foldDay(day.heading)}
                  >
                    {day.heading}
                    <span className="spacer" />
                    <span className="n">{day.rows.length}</span>
                    <Icon name={foldedDays.has(day.heading) ? 'right' : 'down'} size={13} />
                  </button>
                ) : asking.length === 0 ? null : (
                  <div className="phone-head">Sessions</div>
                )}
                {foldedDays.has(day.heading) ? null : <div className="phone-group">
                  {day.rows.map((session) => (
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
                </div>}
              </Fragment>
            ))}
        {chat.plan?.fiveHour === undefined && chat.plan?.sevenDay === undefined ? null : (
          <div className="phone-foot">
            {[
              chat.plan.fiveHour === undefined ? '' : `5-hour window ${String(Math.round(chat.plan.fiveHour.part * 100))}%, resets ${resetsAt(chat.plan.fiveHour.resetsAt, now)}`,
              chat.plan.sevenDay === undefined ? '' : `week ${String(Math.round(chat.plan.sevenDay.part * 100))}%, resets ${resetsAt(chat.plan.sevenDay.resetsAt, now)}`,
            ]
              .filter((one) => one !== '')
              .join(' · ')}
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
          onShortcut={() => onShortcut(pressed.session)}
          onHide={() => setHiding(pressed.session)}
          onDelete={() => setDeleting(pressed.session)}
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
            { value: 'hide', label: 'Hide from this list', says: 'Asked about first', icon: 'hidden' },
            { value: 'delete', label: 'Delete', says: 'Asked about first', danger: true, icon: 'trash' },
          ]}
          onPick={(value) => {
            if (value === 'hide') setHiding(more)
            else if (value === 'delete') setDeleting(more)
            else mark(more, value === '' ? undefined : (value as SessionStatus))
          }}
          onClose={() => setMore(undefined)}
        />
      )}
      {deleting === undefined ? null : <DeleteSheet session={deleting} chat={chat} onClose={() => setDeleting(undefined)} />}
      {hiding === undefined ? null : <HideSheet session={hiding} chat={chat} onClose={() => setHiding(undefined)} />}
      {renaming === undefined ? null : <Rename session={renaming} chat={chat} onClose={() => setRenaming(undefined)} />}
      {ways ? (
        <Ways
          chat={chat}
          onWay={(way) => {
            if (way === 'write') onNew()
            if (way === 'say') onSay()
            if (way === 'record') onNew('record')
          }}
          onShortcuts={onShortcuts}
          onClose={() => setWays(false)}
        />
      ) : null}
      {scoping ? <PhoneScope chat={chat} onClose={() => setScoping(false)} /> : null}
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

export function RowBody({
  chat,
  session,
  now,
  waiting,
  onAnswer,
  dayHeaded,
}: {
  readonly chat: Chat
  readonly session: ChatSession
  readonly now: number
  readonly waiting: Waiting | undefined
  readonly onAnswer?: (how: CardAnswer) => void
  readonly dayHeaded?: boolean
}): React.JSX.Element {
  const stands = standing(session)
  const background = session.tasks?.filter(running).length ?? 0
  const queued = session.queued?.length ?? 0
  const said = stands.tone === 'working' ? session.stands.replace(/^Working - /, '') : session.stands
  const card = session.state === 'asks' ? waiting?.card : undefined
  return (
    <>
      <span className={`phone-dot ${stands.tone}`} />
      <div className="phone-row-text">
        <div className="phone-row-line">
          <span className="phone-row-title">{session.title}</span>
          <span className="phone-row-time">{session.question === true ? (questionLeft(session, now) ?? '') : ago(session.at, now, dayHeaded)}</span>
        </div>
        {session.state === 'asks' ? (
          <>
            <div className="phone-row-asks">{card?.title ?? 'Needs an answer'}</div>
            {card?.detail === undefined ? null : <div className="phone-row-cmd">{card.detail}</div>}
          </>
        ) : said === '' ? null : (
          <div className={`phone-row-said${stands.tone === 'working' ? ' doing' : ''}`}>{said}</div>
        )}
        <div className="phone-row-meta">
          <span style={{ color: `var(--project-${String(projectColor(homeOf(session), chat.settings))})`, fontWeight: 600 }}>
            {projectName(homeOf(session))}
          </span>
          {chat.settings.favorites.includes(session.id) ? <Icon name="star" size={13} className="phone-row-star" /> : null}
          {session.status === 'blocked' ? <span className="phone-row-tag blocked">Blocked</span> : null}
          {session.goal === undefined ? null : <span className="phone-row-tag">Goal</span>}
          {background === 0 ? null : <span className="phone-row-tag">{background} in the background</span>}
          {queued === 0 ? null : <span className="phone-row-tag">{queued} queued</span>}
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
  const touch = useRef<{ x: number; y: number; from: number; way?: 'side' | 'down'; timer: number; pressed: boolean; at: number; t: number; v: number } | undefined>(undefined)
  const row = useRef<HTMLDivElement>(null)
  // React's touch listeners are passive, and only a non-passive one can keep the list still under a sideways swipe.
  useEffect(() => {
    const element = row.current
    if (element === null) return
    const hold = (event: TouchEvent): void => {
      if (touch.current?.way === 'side') event.preventDefault()
    }
    element.addEventListener('touchmove', hold, { passive: false })
    return () => element.removeEventListener('touchmove', hold)
  }, [])
  const { lead, trail } = swipes(column)
  // Measured when a finger lands on it; the row is as wide as the list.
  const [width, setWidth] = useState(360)
  const [committed, setCommitted] = useState(false)
  // Closed from outside by a touch on another row, which leaves only this row's own moves to show.
  const offset = open || moving || committed ? x : 0

  // A flick decides by where it was headed, as UIKit projects a released finger, so a quick swipe back closes the row however far it was.
  const settle = (at: number, v: number): void => {
    setMoving(false)
    const flick = Math.abs(v) > FLICK ? Math.sign(v) : 0
    const end = at + v * PROJECT
    if (flick !== 0 && Math.sign(at) !== 0 && flick !== Math.sign(at)) {
      setX(0)
      onOpen(false)
    } else if (at < -width * FULL) {
      tap('firm')
      setCommitted(true)
      setX(-width)
      setTimeout(() => onMark(trail.status), 220)
    } else if (at > width * FULL) {
      tap('firm')
      setCommitted(true)
      setX(width)
      setTimeout(() => onMark(lead.status), 220)
    } else if (end < -48) {
      setX(-ACTION * 2)
      onOpen(true)
    } else if (end > 48) {
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
        ref={row}
        className={`phone-row${chat.settings.favorites.includes(session.id) ? ' starred' : ''}${moving ? ' moving' : ''}`}
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
            at: offset,
            t: event.timeStamp,
            v: 0,
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
          if (held.way !== 'side') return
          const at = Math.max(-width, Math.min(width, held.from + dx))
          const dt = event.timeStamp - held.t
          if (dt > 0) held.v = held.v * 0.2 + ((at - held.at) / dt) * 0.8
          held.at = at
          held.t = event.timeStamp
          setX(at)
        }}
        onPointerUp={(event) => {
          const held = touch.current
          touch.current = undefined
          if (held === undefined) return
          window.clearTimeout(held.timer)
          if (held.pressed) return
          if (held.way === 'side') settle(held.at, event.timeStamp - held.t > 80 ? 0 : held.v)
          else if (held.way === undefined) {
            if (open) settle(0, 0)
            else chat.show(session)
          }
        }}
        onPointerCancel={() => {
          const held = touch.current
          touch.current = undefined
          if (held === undefined) return
          window.clearTimeout(held.timer)
          if (held.way === 'side') settle(held.at, 0)
        }}
      >
        <RowBody chat={chat} session={session} now={now} waiting={waiting} onAnswer={onAnswer} dayHeaded={column === 'done'} />
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
  onShortcut,
  onHide,
  onDelete,
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
  readonly onShortcut: () => void
  readonly onHide: () => void
  readonly onDelete: () => void
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
  const starredOne = chat.settings.favorites.includes(session.id)

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
        <button
          type="button"
          role="menuitem"
          onClick={() =>
            pick(() => {
              const favorites = chat.settings.favorites
              chat.change({ favorites: starredOne ? favorites.filter((id) => id !== session.id) : [...favorites, session.id] })
            })
          }
        >
          {starredOne ? 'Remove from favorites' : 'Add to favorites'}
          <Icon name="star" size={16} />
        </button>
        <button type="button" role="menuitem" onClick={() => pick(onShortcut)}>
          Make a shortcut
          <Icon name="bolt" size={16} />
        </button>
        {session.state === 'working' ? (
          <button type="button" role="menuitem" onClick={() => pick(() => window.geckit.chat.stop(session.id))}>
            Stop
            <Icon name="stop" size={16} />
          </button>
        ) : null}
        <div className="gap" />
        <button type="button" role="menuitem" onClick={() => pick(onHide)}>
          Hide from this list
          <Icon name="hidden" size={16} />
        </button>
        <button type="button" role="menuitem" className="danger" onClick={() => pick(onDelete)}>
          Delete
          <Icon name="trash" size={16} />
        </button>
      </div>
    </>,
    document.body,
  )
}

export function HideSheet({ session, chat, onClose }: { readonly session: ChatSession; readonly chat: Chat; readonly onClose: () => void }): React.JSX.Element {
  return (
    <Menu
      anchor={new DOMRect()}
      title={`Hide "${session.title === '' ? 'Untitled' : session.title}"?`}
      choices={[{ value: 'hide', label: 'Hide', says: 'Kept on the Mac; Settings, Hidden conversations brings it back' }]}
      onPick={() => chat.hide(session.id)}
      onClose={onClose}
    />
  )
}

export function DeleteSheet({ session, chat, onClose }: { readonly session: ChatSession; readonly chat: Chat; readonly onClose: () => void }): React.JSX.Element {
  return (
    <Menu
      anchor={new DOMRect()}
      title={`Delete "${session.title === '' ? 'Untitled' : session.title}"?`}
      choices={[{ value: 'delete', label: 'Delete', says: 'Nothing anywhere keeps a copy', danger: true }]}
      onPick={() => chat.remove([session.id])}
      onClose={onClose}
    />
  )
}

export function Rename({ session, chat, onClose }: { readonly session: ChatSession; readonly chat: Chat; readonly onClose: () => void }): React.JSX.Element {
  return (
    <RenameAlert
      name={session.title}
      canSave={(name) => name !== '' && name !== session.title}
      onSave={(name) => chat.rename(session.id, name)}
      onClose={onClose}
    />
  )
}

/** Rename as the phone's own apps ask it: a small alert over the middle of what the keyboard leaves, with Cancel and a bold Save that waits for a new name. */
function RenameAlert({
  name,
  placeholder,
  note,
  canSave,
  onSave,
  onClose,
}: {
  readonly name: string
  readonly placeholder?: string
  readonly note?: string
  readonly canSave: (name: string) => boolean
  readonly onSave: (name: string) => void
  readonly onClose: () => void
}): React.JSX.Element {
  const [given, setGiven] = useState(name)
  const ready = canSave(given.trim())
  const save = (): void => {
    if (!ready) return
    onSave(given.trim())
    onClose()
  }
  return createPortal(
    <div className="rename-alert-scrim">
      <div className="rename-alert" role="alertdialog" aria-label="Rename">
        <div className="rename-alert-text">
          <div className="rename-alert-title">Rename</div>
          {note === undefined ? null : <div className="rename-alert-note">{note}</div>}
          <div className="sheet-field">
            <input
              value={given}
              placeholder={placeholder}
              autoFocus
              enterKeyHint="done"
              onChange={(event) => setGiven(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save()
                if (event.key === 'Escape') onClose()
              }}
            />
            {given === '' ? null : (
              <button type="button" className="sheet-field-clear" aria-label="Clear" onPointerDown={(event) => event.preventDefault()} onClick={() => setGiven('')}>
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
        </div>
        <div className="rename-alert-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="default" disabled={!ready} onPointerDown={(event) => event.preventDefault()} onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Every Mac this phone is paired with, the favorites first; a row switches to its Mac, its star and its menu change it. */
export function MacList({
  paired,
  onChange,
  onClose,
}: {
  readonly paired: ReturnType<Macs['list']>
  readonly onChange: () => void
  readonly onClose: () => void
}): React.JSX.Element {
  const [acting, setActing] = useState<number | undefined>()
  const [renaming, setRenaming] = useState<number | undefined>()
  const list = macs()
  const rows = paired.map((mac, at) => ({ ...mac, at })).sort((one, other) => Number(other.favorite) - Number(one.favorite))
  const star = (at: number, on: boolean): void => {
    tap('light')
    list?.favorite(at, on)
    onChange()
  }
  const chosen = acting === undefined ? undefined : paired[acting]
  const named = renaming === undefined ? undefined : paired[renaming]

  return (
    <>
      <Sheet title="Macs this phone is paired with" onClose={onClose}>
        <div className="sheet-list">
          {rows.map((mac) => (
            <div key={mac.at} className={`sheet-option phone-mac${mac.favorite ? ' favorite' : ''}`}>
              <button
                type="button"
                className="phone-mac-star"
                aria-label={mac.favorite ? 'Remove from favorites' : 'Add to favorites'}
                aria-pressed={mac.favorite}
                onClick={() => star(mac.at, !mac.favorite)}
              >
                <Icon name="star" size={20} />
              </button>
              <button
                type="button"
                className="phone-mac-name"
                onClick={() => {
                  onClose()
                  if (!mac.current) list?.switchTo(mac.at)
                }}
              >
                <span className="label">{mac.name}</span>
                {mac.current ? <Icon name="check" size={16} /> : null}
              </button>
              <button type="button" className="phone-mac-more" aria-label={`More for ${mac.name}`} onClick={() => setActing(mac.at)}>
                <Icon name="more" size={20} />
              </button>
            </div>
          ))}
        </div>
        <div className="sheet-list phone-mac-add">
          <button
            type="button"
            className="sheet-option"
            onClick={() => {
              onClose()
              list?.add()
            }}
          >
            <span className="sheet-words">
              <span className="label">Add a Mac</span>
              <span className="says">Scan the code in its GeckIt Settings</span>
            </span>
          </button>
        </div>
      </Sheet>
      {acting === undefined || chosen === undefined ? null : (
        <Menu
          anchor={new DOMRect()}
          title={chosen.name}
          choices={[
            { value: 'rename', label: 'Rename' },
            { value: 'favorite', label: chosen.favorite ? 'Remove from favorites' : 'Add to favorites' },
            ...(paired.length > 1 ? [{ value: 'forget', label: 'Forget', says: 'Scanning its code again brings it back', danger: true }] : []),
          ]}
          onPick={(value) => {
            if (value === 'rename') setRenaming(acting)
            else if (value === 'favorite') star(acting, !chosen.favorite)
            else if (value === 'forget') {
              list?.forget(acting)
              onChange()
            }
          }}
          onClose={() => setActing(undefined)}
        />
      )}
      {renaming === undefined || named === undefined ? null : (
        <RenameMac
          name={named.name}
          onSave={(name) => {
            list?.rename(renaming, name)
            onChange()
          }}
          onClose={() => setRenaming(undefined)}
        />
      )}
    </>
  )
}

function RenameMac({
  name,
  onSave,
  onClose,
}: {
  readonly name: string
  readonly onSave: (name: string) => void
  readonly onClose: () => void
}): React.JSX.Element {
  return (
    <RenameAlert
      name={name}
      placeholder="The name the Mac gives itself"
      note="Left empty, it goes back to the name the Mac gives itself."
      canSave={(given) => given !== name}
      onSave={onSave}
      onClose={onClose}
    />
  )
}
