import { useRef, useState } from 'react'

import { homeOf, SESSION_STATUSES } from '../../../shared/api'
import type { SessionStatus } from '../../../shared/api'
import { shortUrl } from '../../../shared/links'
import type { Link } from '../../../shared/links'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { Rename } from './PhoneBoard'
import { projectName } from './project'
import type { Chat } from './useChat'

/** The conversation's bar on the phone: back to the board, what it is, and everything else under More. */
export function PhoneNav({ chat, links }: { readonly chat: Chat; readonly links: readonly Link[] }): React.JSX.Element {
  const [more, setMore] = useState(false)
  const [listing, setListing] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const session = chat.session
  return (
    <div className="phone-nav">
      <button type="button" className="phone-back" onClick={() => chat.open({ kind: 'new' })}>
        <Icon name="left" size={22} />
        Board
      </button>
      <div className="phone-nav-title">
        <b>{session?.title ?? 'New conversation'}</b>
        {session === undefined ? null : <span>{projectName(homeOf(session))}</span>}
      </div>
      {session === undefined ? (
        <span />
      ) : (
        <button type="button" className="phone-icon" aria-label="More" onClick={() => setMore(true)}>
          <Icon name="more" size={24} />
        </button>
      )}
      {more && session !== undefined ? (
        <Menu
          anchor={new DOMRect()}
          title="Where it stands"
          explained
          chosen={session.status ?? ''}
          choices={[
            ...SESSION_STATUSES.map((one) => ({ value: one.status, label: one.label, says: one.why })),
            { value: '', label: 'No status', says: 'In progress, with nothing marked' },
            ...(links.length === 0
              ? []
              : [{ value: 'links', label: 'Links', says: `${String(links.length)} in this conversation`, icon: 'link' }]),
            { value: 'rename', label: 'Rename', icon: 'pencil' },
            ...(chat.working ? [{ value: 'stop', label: 'Stop', says: 'Interrupts Claude; the conversation stays', icon: 'stop' }] : []),
          ]}
          onPick={(value) => {
            if (value === 'links') setListing(true)
            else if (value === 'rename') setRenaming(true)
            else if (value === 'stop') chat.stop()
            else chat.mark(session.id, value === '' ? undefined : (value as SessionStatus))
          }}
          onClose={() => setMore(false)}
        />
      ) : null}
      {listing ? (
        <Menu
          anchor={new DOMRect()}
          title="Links in this conversation, the newest first"
          choices={links.map((link) => ({
            value: link.url,
            label: link.text ?? shortUrl(link.url),
            ...(link.text === undefined ? {} : { says: shortUrl(link.url) }),
          }))}
          onPick={(url) => window.geckit.chat.openLink(url)}
          onClose={() => setListing(false)}
        />
      ) : null}
      {renaming && session !== undefined ? <Rename session={session} chat={chat} onClose={() => setRenaming(false)} /> : null}
    </div>
  )
}

/**
 * The strip along the left edge of a conversation that takes it back to the
 * board when dragged, as the system's back swipe does. It moves the
 * conversation it sits in, and lets it go back or spring home.
 */
export function EdgeBack({ onBack }: { readonly onBack: () => void }): React.JSX.Element {
  const drag = useRef<{ x: number; at: number; moved: number } | undefined>(undefined)
  const pane = (element: Element): HTMLElement | null => element.closest<HTMLElement>('.talk')
  return (
    <div
      className="phone-edge"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { x: event.clientX, at: Date.now(), moved: 0 }
        const talk = pane(event.currentTarget)
        if (talk !== null) talk.style.transition = 'none'
      }}
      onPointerMove={(event) => {
        const held = drag.current
        const talk = pane(event.currentTarget)
        if (held === undefined || talk === null) return
        held.moved = Math.max(0, event.clientX - held.x)
        talk.style.transform = `translateX(${String(held.moved)}px)`
      }}
      onPointerUp={(event) => {
        const held = drag.current
        drag.current = undefined
        const talk = pane(event.currentTarget)
        if (held === undefined || talk === null) return
        const fast = held.moved / Math.max(1, Date.now() - held.at) > 0.6
        talk.style.transition = ''
        if (held.moved > talk.offsetWidth / 3 || (fast && held.moved > 40)) {
          tap('light')
          talk.style.transform = 'translateX(100%)'
          setTimeout(() => {
            onBack()
            talk.style.transform = ''
          }, 240)
        } else talk.style.transform = ''
      }}
    />
  )
}
