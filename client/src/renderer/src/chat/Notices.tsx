import { Icon } from '../ui/Icon'
import type { Chat } from './useChat'

/** What another conversation said while this window was in front, each one a way into it. */
export function Notices({ chat }: { readonly chat: Chat }): React.JSX.Element | null {
  if (chat.notices.length === 0) return null
  return (
    <div className="notices no-drag" aria-live="polite">
      {chat.notices.map((notice) => (
        <div
          key={notice.session}
          className={`notice${notice.asks ? ' asks' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => chat.goTo(notice.session)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') chat.goTo(notice.session)
          }}
        >
          <span className="state" />
          <span className="lines">
            <span className="title">{notice.title}</span>
            {notice.subtitle === '' ? null : <span className="subtitle">{notice.subtitle}</span>}
            <span className="body">{notice.body}</span>
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Dismiss"
            onClick={(event) => {
              event.stopPropagation()
              chat.dismiss(notice.session)
            }}
          >
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}
