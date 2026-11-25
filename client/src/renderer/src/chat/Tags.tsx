import { SESSION_STATUSES } from '../../../shared/api'
import type { ChatSession } from '../../../shared/api'
import { Icon } from '../ui/Icon'
import type { TaskTag } from '../../../shared/api'
import { TAGS_SHOWN } from '../../../shared/tags'

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

/** The person's tags on a task: a neutral chip with the tag's colour in its dot, as many as `limit`, then "+N" naming the rest. */
export function TagChips({ tags, limit = TAGS_SHOWN }: { readonly tags: readonly TaskTag[]; readonly limit?: number }): React.JSX.Element | null {
  if (tags.length === 0) return null
  const rest = tags.slice(limit)
  return (
    <>
      {tags.slice(0, limit).map((tag) => (
        <span key={tag.id} className="tag user-tag" style={{ '--tint': `var(--project-${String(tag.color)})` } as React.CSSProperties} title={tag.name}>
          <span className="tag-dot" />
          <span className="tag-name">{tag.name}</span>
        </span>
      ))}
      {rest.length === 0 ? null : (
        <span className="tag more" title={rest.map((one) => one.name).join('\n')}>
          {`+${String(rest.length)}`}
        </span>
      )}
    </>
  )
}
