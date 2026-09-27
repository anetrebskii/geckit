import { useEffect, useState } from 'react'

import type { ChatSession } from '../../../shared/api'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { RowBody } from './PhoneBoard'
import { Page } from './PhoneKit'
import type { Chat } from './useChat'

/** The Questions tab: the general questions still kept, newest first, each with the time it has left. See docs/ux/phone-tabs.md. */
export function PhoneQuestions({ chat, onAsk }: { readonly chat: Chat; readonly onAsk: () => void }): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  const [deleting, setDeleting] = useState<ChatSession | undefined>()
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(tick)
  }, [])

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
          <div className="phone-group phone-questions">
            {[...chat.questions]
              .sort((one, other) => other.at - one.at)
              .map((session) => (
                <div key={session.id} className="phone-question">
                  <button type="button" className="phone-row" onClick={() => chat.open({ kind: 'session', id: session.id })}>
                    <RowBody chat={chat} session={session} now={now} waiting={undefined} />
                  </button>
                  <button
                    type="button"
                    className="phone-question-remove"
                    aria-label={`Delete ${session.title}`}
                    onClick={() => {
                      tap('light')
                      setDeleting(session)
                    }}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              ))}
          </div>
          <div className="phone-note">Each is deleted a day after its last answer.</div>
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
