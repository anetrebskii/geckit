import { useEffect, useRef, useState } from 'react'

import type { ChatSession } from '../../../shared/api'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { DeleteSheet, RowBody } from './PhoneBoard'
import { Page } from './PhoneKit'
import type { Chat } from './useChat'

const ACTION = 84
const FULL = 0.5

/**
 * The Questions tab: the kept questions first, then the rest newest first, each with the time it has left.
 * A row is swiped right to keep it or let it go again, and left to delete it. See docs/ux/phone-tabs.md.
 */
export function PhoneQuestions({ chat, onAsk }: { readonly chat: Chat; readonly onAsk: () => void }): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  const [deleting, setDeleting] = useState<ChatSession | undefined>()
  const [open, setOpen] = useState<string | undefined>()
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(tick)
  }, [])

  const newest = [...chat.questions].sort((one, other) => other.at - one.at)
  const kept = newest.filter((one) => one.stays === true)
  const going = newest.filter((one) => one.stays !== true)
  const row = (session: ChatSession): React.JSX.Element => (
    <QuestionRow
      key={session.id}
      chat={chat}
      session={session}
      now={now}
      open={open === session.id}
      onOpen={(on) => setOpen(on ? session.id : undefined)}
      onDelete={() => setDeleting(session)}
    />
  )

  return (
    <Page
      title="Questions"
      actions={
        <button type="button" className="phone-icon" aria-label="Ask a question" onClick={onAsk}>
          <Icon name="compose" size={24} />
        </button>
      }
    >
      {chat.questions.length === 0 ? (
        <div className="phone-empty">No questions. Ask one from the pencil above; each is kept a day after its last answer.</div>
      ) : (
        <>
          {kept.length === 0 ? null : (
            <>
              <div className="phone-head">Kept</div>
              <div className="phone-group">{kept.map(row)}</div>
            </>
          )}
          {going.length === 0 ? null : (
            <>
              {kept.length === 0 ? null : <div className="phone-head">Recent</div>}
              <div className="phone-group">{going.map(row)}</div>
            </>
          )}
          <div className="phone-note">Each is deleted a day after its last answer. Swipe right to keep one, left to delete it.</div>
        </>
      )}
      {deleting === undefined ? null : <DeleteSheet session={deleting} chat={chat} onClose={() => setDeleting(undefined)} />}
    </Page>
  )
}

function QuestionRow({
  chat,
  session,
  now,
  open,
  onOpen,
  onDelete,
}: {
  readonly chat: Chat
  readonly session: ChatSession
  readonly now: number
  readonly open: boolean
  readonly onOpen: (on: boolean) => void
  readonly onDelete: () => void
}): React.JSX.Element {
  const [x, setX] = useState(0)
  const [moving, setMoving] = useState(false)
  const [width, setWidth] = useState(360)
  const touch = useRef<{ x: number; y: number; from: number; way?: 'side' | 'down'; at: number } | undefined>(undefined)
  const row = useRef<HTMLDivElement>(null)
  const stays = session.stays === true
  const offset = open || moving ? x : 0

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

  const close = (): void => {
    setX(0)
    onOpen(false)
  }
  const keep = (): void => {
    tap('firm')
    close()
    chat.keep(session.id, !stays)
  }
  const remove = (): void => {
    close()
    onDelete()
  }
  const settle = (at: number): void => {
    setMoving(false)
    if (at > width * FULL) keep()
    else if (at < -width * FULL) {
      tap('firm')
      remove()
    } else if (at > 48) {
      setX(ACTION)
      onOpen(true)
    } else if (at < -48) {
      setX(-ACTION)
      onOpen(true)
    } else close()
  }

  return (
    <div className="phone-swipe">
      <div className="phone-actions lead" style={{ width: Math.max(0, offset) }}>
        <button type="button" className={`phone-action ${stays ? 'back' : 'keep'}`} style={{ width: Math.max(ACTION, offset) }} onClick={keep}>
          <Icon name="pin" size={20} />
          {stays ? 'Unkeep' : 'Keep'}
        </button>
      </div>
      <div className="phone-actions trail" style={{ width: Math.max(0, -offset) }}>
        <button type="button" className="phone-action delete" style={{ width: Math.max(ACTION, -offset) }} onClick={remove}>
          <Icon name="trash" size={20} />
          Delete
        </button>
      </div>
      <div
        ref={row}
        className={`phone-row${moving ? ' moving' : ''}`}
        role="button"
        tabIndex={0}
        style={{ transform: `translateX(${String(offset)}px)` }}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') chat.open({ kind: 'session', id: session.id })
        }}
        onPointerDown={(event) => {
          setWidth(event.currentTarget.offsetWidth)
          touch.current = { x: event.clientX, y: event.clientY, from: offset, at: offset }
        }}
        onPointerMove={(event) => {
          const held = touch.current
          if (held === undefined) return
          const dx = event.clientX - held.x
          const dy = event.clientY - held.y
          if (held.way === undefined && Math.hypot(dx, dy) > 8) {
            held.way = Math.abs(dx) > Math.abs(dy) ? 'side' : 'down'
            if (held.way === 'side') {
              event.currentTarget.setPointerCapture(event.pointerId)
              setMoving(true)
            }
          }
          if (held.way !== 'side') return
          held.at = Math.max(-width, Math.min(width, held.from + dx))
          setX(held.at)
        }}
        onPointerUp={() => {
          const held = touch.current
          touch.current = undefined
          if (held === undefined) return
          if (held.way === 'side') settle(held.at)
          else if (held.way === undefined) {
            if (open) close()
            else chat.open({ kind: 'session', id: session.id })
          }
        }}
        onPointerCancel={() => {
          const held = touch.current
          touch.current = undefined
          if (held?.way === 'side') settle(held.at)
        }}
      >
        <RowBody chat={chat} session={session} now={now} waiting={undefined} />
      </div>
    </div>
  )
}
