import { useRef, useState } from 'react'

import type { ChatSession, TaskTag } from '../../../shared/api'
import { TAGS_SHOWN } from '../../../shared/tags'
import { ON_PHONE } from '../on-phone'
import { Icon } from '../ui/Icon'
import { TagChips } from './Tags'
import { TagPicker, tagState } from './TagPicker'

const tint = (color: number): React.CSSProperties => ({ '--tint': `var(--project-${String(color)})` }) as React.CSSProperties

/** The tags of one task, every one with its remove button, and "Add tag", at the top of the details panel. */
export function TaskTags({ session, tags, catalog, everyone }: { readonly session: ChatSession; readonly tags: readonly TaskTag[]; readonly catalog: readonly TaskTag[]; readonly everyone: readonly ChatSession[] }): React.JSX.Element {
  const [anchor, setAnchor] = useState<DOMRect | undefined>()
  const add = useRef<HTMLButtonElement>(null)
  return (
    <section className="task-tags" aria-label="Tags">
      <h3>Tags</h3>
      <div className="task-tags-list">
        {tags.map((tag) => (
          <span key={tag.id} className="tag user-tag" style={tint(tag.color)}>
            <span className="tag-dot" />
            <span className="tag-name">{tag.name}</span>
            <button type="button" className="tag-remove" aria-label={`Remove ${tag.name}`} title={`Remove ${tag.name}`} onClick={() => {
                if (tags.length === 1) add.current?.focus()
                void window.geckit.chat.tag([session.id], { remove: [tag.id] })
              }}>
              <Icon name="close" size={9} />
            </button>
          </span>
        ))}
        <button ref={add} type="button" className={`quiet task-tags-add${anchor === undefined ? '' : ' on'}`} aria-haspopup="menu" onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}>
          <Icon name="plus" size={11} />
          Add tag
        </button>
      </div>
      {anchor === undefined ? null : (
        <TagPicker
          anchor={anchor}
          catalog={catalog}
          has={(id) => tagState([session.tags], id)}
          apply={(change) => window.geckit.chat.tag([session.id], change)}
          usedBy={(id) => everyone.filter((one) => one.tags?.includes(id) === true).length}
          onClose={() => setAnchor(undefined)}
        />
      )}
    </section>
  )
}

/** The header's chips, pressed to open the picker; nothing while the task has no tags. */
export function HeaderTags({ session, tags, catalog, everyone, chips }: { readonly session: ChatSession; readonly tags: readonly TaskTag[]; readonly catalog: readonly TaskTag[]; readonly everyone: readonly ChatSession[]; readonly chips: React.ReactNode }): React.JSX.Element | null {
  const [anchor, setAnchor] = useState<DOMRect | undefined>()
  if (tags.length === 0) return null
  return (
    <>
      <button type="button" className="head-tags no-drag" aria-label="Tags" aria-haspopup="menu" title={tags.map((one) => one.name).join('\n')} onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}>
        {chips}
      </button>
      {anchor === undefined ? null : (
        <TagPicker
          anchor={anchor}
          catalog={catalog}
          has={(id) => tagState([session.tags], id)}
          apply={(change) => window.geckit.chat.tag([session.id], change)}
          usedBy={(id) => everyone.filter((one) => one.tags?.includes(id) === true).length}
          onClose={() => setAnchor(undefined)}
        />
      )}
    </>
  )
}

/** The New task form's "Tags" control: the tags the task will start with, any made here made at once. */
export function TagsChoice({ catalog, value, onChange, usedBy, disabled = false, className }: { readonly catalog: readonly TaskTag[]; readonly usedBy: (id: string) => number; readonly value: readonly string[]; readonly onChange: (ids: readonly string[]) => void; readonly disabled?: boolean; readonly className: string }): React.JSX.Element {
  const [anchor, setAnchor] = useState<DOMRect | undefined>()
  const chosen = catalog.filter((one) => value.includes(one.id))
  return (
    <>
      <button type="button" className={className} disabled={disabled} aria-label={`Tags: ${chosen.length === 0 ? 'None' : chosen.map((one) => one.name).join(', ')}`} aria-haspopup="menu" aria-expanded={anchor !== undefined} onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())}>
        {chosen.length === 0 ? 'None' : <TagChipsInline tags={chosen} />}
        <Icon name="down" size={11} />
      </button>
      {anchor === undefined ? null : (
        <TagPicker
          anchor={anchor}
          catalog={catalog}
          has={(id) => (value.includes(id) ? 'on' : 'off')}
          apply={async (change) => {
            const made = change.create === undefined ? [] : await window.geckit.chat.tag([], { create: change.create })
            const kept = value.filter((id) => change.remove?.includes(id) !== true)
            onChange([...kept, ...[...(change.add ?? []), ...made.map((one) => one.id)].filter((id) => !kept.includes(id))])
          }}
          usedBy={usedBy}
          onClose={() => setAnchor(undefined)}
        />
      )}
    </>
  )
}

function TagChipsInline({ tags }: { readonly tags: readonly TaskTag[] }): React.JSX.Element {
  return (
    <span className="tags-choice">
      <TagChips tags={tags} limit={ON_PHONE ? 1 : TAGS_SHOWN} />
    </span>
  )
}
