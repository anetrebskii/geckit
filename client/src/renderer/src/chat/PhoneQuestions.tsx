import { useEffect, useState } from 'react'

import type { ChatSession } from '../../../shared/api'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { RowBody } from './PhoneBoard'
import { Page } from './PhoneKit'
import { SwipeRow } from './SwipeRow'
import type { Chat } from './useChat'

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
      title="Quick chats"
      actions={
        <button type="button" className="phone-icon" aria-label="New quick chat" onClick={onAsk}>
          <Icon name="compose" size={24} />
        </button>
      }
    >
      {chat.questions.length === 0 ? (
        <div className="phone-empty">No quick chats. Off the board. Each is deleted a day after its last answer, unless kept.</div>
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
      {deleting === undefined ? null : (
        <Menu
          anchor={new DOMRect()}
          title={`Delete "${deleting.title === '' ? 'Untitled' : deleting.title}"?`}
          choices={[{ value: 'delete', label: 'Delete', says: 'Nothing anywhere keeps a copy', danger: true }]}
          onPick={() => chat.remove([deleting.id])}
          onClose={() => setDeleting(undefined)}
        />
      )}
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
  const stays = session.stays === true
  return (
    <SwipeRow open={open} onOpen={onOpen} onTap={() => chat.open({ kind: 'session', id: session.id })} onDelete={onDelete} lead={{ label: stays ? 'Unkeep' : 'Keep', className: stays ? 'back' : 'keep', icon: 'pin', run: () => chat.keep(session.id, !stays) }}>
      <RowBody chat={chat} session={session} now={now} waiting={undefined} />
    </SwipeRow>
  )
}
