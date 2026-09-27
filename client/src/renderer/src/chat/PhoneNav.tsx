import { useRef, useState } from 'react'

import { homeOf, SESSION_STATUSES } from '../../../shared/api'
import type { SessionStatus } from '../../../shared/api'
import { hostOf } from '../../../shared/hosts'
import { shortUrl } from '../../../shared/links'
import type { Link } from '../../../shared/links'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { DeleteSheet, HideSheet, Rename } from './PhoneBoard'
import { contextLine, PhoneInfo } from './PhoneInfo'
import { HostDot } from './HostParts'
import { projectLabel } from './project'
import type { Chat } from './useChat'

/** The conversation's bar on the phone: back to the board, what it is, and everything else under More. */
export function PhoneNav({
  chat,
  links,
  onScreen,
  onClear,
  info,
  pulled,
  onInfo,
}: {
  readonly chat: Chat
  readonly links: readonly Link[]
  readonly onScreen: () => void
  readonly onClear: () => void
  readonly info: boolean
  readonly pulled: number | undefined
  readonly onInfo: (open: boolean) => void
}): React.JSX.Element {
  const [more, setMore] = useState(false)
  const [listing, setListing] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [hiding, setHiding] = useState(false)
  const session = chat.session
  const on = session === undefined ? undefined : hostOf(homeOf(session))
  const host = on === undefined ? undefined : chat.hosts.find((one) => one.id === on)
  return (
    <div className="phone-nav">
      <button type="button" className="phone-back" onClick={() => chat.open({ kind: 'new' })}>
        <Icon name="left" size={22} />
        Board
      </button>
      <div className="phone-nav-title">
        <b>{session?.title ?? 'New conversation'}</b>
        {session === undefined ? null : (
          <span>
            {host === undefined ? null : <HostDot state={host.state} />}
            {[projectLabel(homeOf(session)), contextLine(chat)].filter((one) => one !== undefined).join(' · ')}
          </span>
        )}
      </div>
      <span className="phone-nav-end">
        <button type="button" className="phone-icon" aria-label="The Mac's screen" onClick={onScreen}>
          <Icon name="display" size={24} />
        </button>
        {session === undefined ? null : (
          <button type="button" className="phone-icon" aria-label="More" onClick={() => setMore(true)}>
            <Icon name="more" size={24} />
          </button>
        )}
      </span>
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
            { value: 'info', label: 'Conversation', says: 'Context, cost, the plan, Compact and Clear' },
            { value: 'rename', label: 'Rename', icon: 'pencil' },
            ...(chat.working ? [{ value: 'stop', label: 'Stop', says: 'Interrupts Claude; the conversation stays', icon: 'stop' }] : []),
            { value: 'hide', label: 'Hide from this list', says: 'Asked about first', icon: 'hidden' },
            { value: 'delete', label: 'Delete', says: 'Asked about first', danger: true, icon: 'trash' },
          ]}
          onPick={(value) => {
            if (value === 'links') setListing(true)
            else if (value === 'info') onInfo(true)
            else if (value === 'rename') setRenaming(true)
            else if (value === 'stop') chat.stop()
            else if (value === 'hide') setHiding(true)
            else if (value === 'delete') setDeleting(true)
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
      {(info || pulled !== undefined) && session !== undefined ? <PhoneInfo chat={chat} {...(pulled === undefined ? {} : { pulled })} onClear={onClear} onClose={() => onInfo(false)} /> : null}
      {hiding && session !== undefined ? <HideSheet session={session} chat={chat} onClose={() => setHiding(false)} /> : null}
      {deleting && session !== undefined ? <DeleteSheet session={session} chat={chat} onClose={() => setDeleting(false)} /> : null}
      {renaming && session !== undefined ? <Rename session={session} chat={chat} onClose={() => setRenaming(false)} /> : null}
    </div>
  )
}

/** The strip along the right edge that draws the conversation's drawer out with the finger, the way back to the board mirrored. */
export function EdgeInfo({ onPull, onOpen }: { readonly onPull: (moved: number | undefined) => void; readonly onOpen: () => void }): React.JSX.Element {
  const drag = useRef<{ x: number; at: number; moved: number } | undefined>(undefined)
  return (
    <div
      className="phone-edge right"
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { x: event.clientX, at: Date.now(), moved: 0 }
      }}
      onPointerMove={(event) => {
        const held = drag.current
        if (held === undefined) return
        held.moved = Math.max(0, held.x - event.clientX)
        onPull(held.moved)
      }}
      onPointerUp={() => {
        const held = drag.current
        drag.current = undefined
        if (held === undefined) return
        const fast = held.moved / Math.max(1, Date.now() - held.at) > 0.6
        if (held.moved > window.innerWidth / 4 || (fast && held.moved > 30)) {
          tap('light')
          onOpen()
        }
        onPull(undefined)
      }}
      onPointerCancel={() => {
        drag.current = undefined
        onPull(undefined)
      }}
    />
  )
}
