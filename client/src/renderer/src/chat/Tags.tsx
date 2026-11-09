import { SESSION_STATUSES } from '../../../shared/api'
import type { ChatSession } from '../../../shared/api'
import { Icon } from '../ui/Icon'

/** The original subject, its latest related link, and the mark it was given. */
export function Tags({ session, marked = true }: { readonly session: ChatSession; readonly marked?: boolean }): React.JSX.Element | null {
  const workItems = session.workItems ?? (session.work === undefined ? [] : [session.work])
  const status = marked ? session.status : undefined
  if (workItems.length === 0 && status === undefined) return null
  return (
    <>
      {workItems.map((work) => (
        <button
          key={work.url}
          type="button"
          className="tag work"
          title={`Open ${work.says}`}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
          }}
          onClick={(event) => {
            event.stopPropagation()
            window.geckit.chat.openLink(work.url)
          }}
        >
          {work.label}
        </button>
      ))}
      {status === undefined ? null : (
        <span className={`tag ${status}`} title={SESSION_STATUSES.find((one) => one.status === status)?.why}>
          {status === 'done' ? <Icon name="check" size={9} /> : null}
          {SESSION_STATUSES.find((one) => one.status === status)?.label}
        </span>
      )}
    </>
  )
}
