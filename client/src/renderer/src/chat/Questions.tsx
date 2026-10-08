import { ProviderIcon } from './ProviderIcon'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { ChatSession } from '../../../shared/api'
import { Icon } from '../ui/Icon'
import { questionLeft } from './time'
import type { Chat } from './useChat'

/**
 * The open questions, under the Questions button. Each says how long it has
 * left, and is deleted from here: the bin asks again in the row itself, so the
 * menu stays open and nothing moves. What it looks like and why is in
 * `docs/ux/questions.md`.
 */
export function QuestionsMenu({
  chat,
  anchor,
  onAsk,
  onClose,
}: {
  readonly chat: Chat
  readonly anchor: DOMRect
  readonly onAsk: () => void
  readonly onClose: () => void
}): React.JSX.Element {
  const menu = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ left: number; top: number; height: number } | undefined>()
  const [confirming, setConfirming] = useState<string | undefined>()
  const [now, setNow] = useState(() => Date.now())
  const questions = [...chat.questions].sort((one, other) => other.at - one.at)

  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    if (chat.questions.length === 0) onClose()
  }, [chat.questions.length, onClose])

  useLayoutEffect(() => {
    const node = menu.current
    if (node === null) return
    const box = node.getBoundingClientRect()
    const wants = node.scrollHeight + 3
    const left = Math.min(Math.max(8, anchor.left), window.innerWidth - box.width - 8)
    const below = window.innerHeight - anchor.bottom - 12
    const above = anchor.top - 12
    const under = wants <= below || below >= above
    const height = Math.min(wants, under ? below : above)
    setAt({ left, height, top: under ? anchor.bottom + 4 : anchor.top - height - 4 })
  }, [anchor, chat.questions.length, confirming])

  // Escape takes back a delete being asked about before it closes the menu.
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      if (confirming === undefined) onClose()
      else setConfirming(undefined)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [confirming, onClose])

  const row = (one: ChatSession): React.JSX.Element => {
    const title = one.title === '' ? 'Untitled' : one.title
    if (confirming === one.id) {
      return (
        <div key={one.id} className="question-item confirming">
          <span className="question-title">Delete "{title}"?</span>
          <span className="question-confirm">
            <button type="button" className="question-cancel" autoFocus onClick={() => setConfirming(undefined)}>
              Cancel
            </button>
            <button
              type="button"
              className="question-delete"
              onClick={() => {
                setConfirming(undefined)
                chat.remove([one.id])
              }}
            >
              Delete
            </button>
          </span>
        </div>
      )
    }
    const left = questionLeft(one, now)
    return (
      <div key={one.id} className="question-item">
        <button
          type="button"
          role="menuitem"
          className="question-open"
          onClick={() => {
            chat.open({ kind: 'session', id: one.id })
            onClose()
          }}
        >
          <span className="question-title">{chat.showProviders ? <ProviderIcon id={one.id} transport={one.transport} /> : null}{title}</span>
          {one.stands === '' ? null : <span className="question-says">{one.stands}</span>}
        </button>
        {one.stays === true ? (
          <span className="question-left" title="Kept">
            <Icon name="pin" size={13} />
          </span>
        ) : left === undefined ? null : (
          <span className="question-left">{left}</span>
        )}
        <button
          type="button"
          className={`question-pin${one.stays === true ? ' on' : ''}`}
          aria-label={one.stays === true ? `Stop keeping ${title}` : `Keep ${title}`}
          title={one.stays === true ? 'Stop keeping' : 'Keep'}
          onClick={() => chat.keep(one.id, one.stays !== true)}
        >
          <Icon name="pin" size={13} />
        </button>
        <button type="button" className="question-bin" aria-label={`Delete ${title}`} title="Delete" onClick={() => setConfirming(one.id)}>
          <Icon name="trash" size={13} />
        </button>
      </div>
    )
  }

  return createPortal(
    <>
      <div className="scrim menu-scrim" onMouseDown={onClose} />
      <div
        ref={menu}
        className="floating menu questions-menu"
        role="menu"
        style={{
          left: at?.left ?? -9999,
          top: at?.top ?? -9999,
          ...(at === undefined ? {} : { maxHeight: at.height }),
          visibility: at === undefined ? 'hidden' : 'visible',
        }}
      >
        <div className="menu-title">Open questions</div>
        {questions.map(row)}
        <button
          type="button"
          role="menuitem"
          className="menu-item"
          onClick={() => {
            onAsk()
            onClose()
          }}
        >
          <span style={{ width: 14, flexShrink: 0 }}>
            <Icon name="plus" size={13} />
          </span>
          <span className="label">New question</span>
        </button>
        <div className="menu-note">Each is deleted a day after its last answer, unless kept.</div>
      </div>
    </>,
    document.body,
  )
}
