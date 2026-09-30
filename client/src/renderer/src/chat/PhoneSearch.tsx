import { useEffect, useRef, useState } from 'react'

import { homeOf } from '../../../shared/api'
import { projectColor } from '../../../shared/project-color'
import { Icon } from '../ui/Icon'
import { Page } from './PhoneKit'
import { projectLabel } from './project'
import { Marked, seeks, useFound } from './Switcher'
import type { Seek } from './Switcher'
import { ago } from './time'
import type { Chat } from './useChat'

/** The Search tab: the Mac's Cmd+P, conversations by name and then by what was said in them. See docs/ux/phone-parity.md. */
export function PhoneSearch({ chat, shown, onSeek }: { readonly chat: Chat; readonly shown: boolean; readonly onSeek: (seek: Seek) => void }): React.JSX.Element {
  const [asked, setAsked] = useState('')
  const [typing, setTyping] = useState(false)
  const { found, words } = useFound(chat, asked)
  const field = useRef<HTMLInputElement>(null)
  const [now] = useState(() => Date.now())
  // The keyboard comes up as the tab is chosen, as it does in the system's own search tabs.
  useEffect(() => {
    if (shown) field.current?.focus()
  }, [shown])
  // Where the ones found only by what was said begin: after those found by name, or at the top when none was.
  const named = (title: string): boolean => words.every((word) => title.toLowerCase().includes(word))
  const heading = found.findIndex((row, at) => row.heads === true || (at === 0 && words.length > 0 && row.hit !== undefined && !named(row.session.title)))
  const split = heading === -1 ? found.length : heading

  return (
    <Page title="Search">
      <div className="phone-search">
        <Icon name="search" size={17} />
        <input
          ref={field}
          type="search"
          enterKeyHint="search"
          placeholder="Conversations and what was said"
          value={asked}
          onChange={(event) => setAsked(event.target.value)}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
        />
        {asked === '' ? null : (
          <button type="button" aria-label="Clear" onClick={() => setAsked('')}>
            <Icon name="close" size={13} />
          </button>
        )}
      </div>
      {typing ? (
        <button type="button" className="phone-search-hide" aria-label="Hide the keyboard" onClick={() => field.current?.blur()}>
          <Icon name="keyboard-hide" size={22} />
        </button>
      ) : null}
      {words.length > 0 && found.length === 0 ? <div className="phone-empty">Nothing called that, and nothing said like it.</div> : null}
      {words.length === 0 ? <div className="phone-head">Recent</div> : null}
      {[found.slice(0, split), found.slice(split)].map((part, index) =>
        part.length === 0 ? null : (
          <div key={index}>
            {index === 1 ? <div className="phone-head">In what was said</div> : null}
            <div className="phone-group">
              {part.map((row) => (
                <button
                  key={row.session.id}
                  type="button"
                  className="phone-found"
                  onClick={() => {
                    if (seeks(row, words)) onSeek({ id: row.session.id, words })
                    field.current?.blur()
                    chat.show(row.session)
                  }}
                >
                  <span className="phone-row-line">
                    <span className="phone-row-title">
                      <Marked text={row.session.title} words={words} />
                    </span>
                    <span className="phone-row-time">{ago(row.session.at, now)}</span>
                  </span>
                  {row.hit === undefined ? null : (
                    <span className="phone-row-said">
                      <Marked text={row.hit.said} words={words} />
                    </span>
                  )}
                  <span className="phone-row-meta">
                    <span style={{ color: `var(--project-${String(projectColor(homeOf(row.session), chat.settings))})`, fontWeight: 600 }}>
                      {projectLabel(homeOf(row.session))}
                    </span>
                    {row.hit === undefined || row.hit.count < 2 ? null : <span className="phone-row-tag">{row.hit.count} messages</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ),
      )}
    </Page>
  )
}
