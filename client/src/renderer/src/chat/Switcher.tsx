import { useEffect, useRef, useState } from 'react'

import type { ChatFound, ChatSession } from '../../../shared/api'
import { Icon } from '../ui/Icon'
import { projectColor } from '../../../shared/project-color'
import { projectName, tint } from './project'
import { Dot } from './Tasks'
import { ago } from './time'
import type { Chat } from './useChat'
import { ALL } from './useChat'

/**
 * Cmd+P: any conversation in the project chosen in the sidebar, or in every
 * project when that is All projects, by what it is called, the project or
 * folder it is about, or anything said in it.
 *
 * With nothing typed it offers what was used last, opened here or worked in,
 * the one in front left out. It opens on what the sidebar already has and
 * then takes in every project, so the first keystroke never waits for the
 * disk; what was said is searched in the main process, a moment behind.
 */

export interface Seek {
  readonly id: string
  readonly words: readonly string[]
}

const WAIT = 150
const MOST = 50

const used = (session: ChatSession): number => Math.max(session.seen ?? 0, session.at)

const named = (session: ChatSession, words: readonly string[]): boolean => {
  const against = `${session.title} ${projectName(session.root)} ${session.root} ${session.stands}`.toLowerCase()
  return words.every((word) => against.includes(word))
}

/** The folder, where it is the folder that was typed rather than the project's name. */
function place(root: string, words: readonly string[]): string {
  const name = projectName(root)
  const byPath = words.some((word) => !name.toLowerCase().includes(word) && root.toLowerCase().includes(word))
  if (!byPath) return name
  const home = window.geckit.home
  return home !== '' && root.startsWith(`${home}/`) ? `~${root.slice(home.length)}` : root
}

function Marked({ text, words }: { readonly text: string; readonly words: readonly string[] }): React.JSX.Element {
  const lower = text.toLowerCase()
  const parts: React.JSX.Element[] = []
  let at = 0
  while (at < text.length) {
    const next = words
      .map((word) => ({ word, from: lower.indexOf(word, at) }))
      .filter((one) => one.from >= 0)
      .sort((one, other) => one.from - other.from)[0]
    if (next === undefined) {
      parts.push(<span key={at}>{text.slice(at)}</span>)
      break
    }
    if (next.from > at) parts.push(<span key={at}>{text.slice(at, next.from)}</span>)
    parts.push(<mark key={next.from}>{text.slice(next.from, next.from + next.word.length)}</mark>)
    at = next.from + next.word.length
  }
  return <>{parts}</>
}

interface Row {
  readonly session: ChatSession
  readonly hit?: ChatFound
  /** The first of those found only by what was said, which starts their own part of the list. */
  readonly heads?: boolean
}

export function Switcher({
  chat,
  onClose,
  onSeek,
}: {
  readonly chat: Chat
  readonly onClose: () => void
  readonly onSeek: (seek: Seek) => void
}): React.JSX.Element {
  const [every, setEvery] = useState<readonly ChatSession[]>(chat.sessions)
  const [asked, setAsked] = useState('')
  const [hits, setHits] = useState<{ readonly asked: string; readonly found: readonly ChatFound[] }>({ asked: '', found: [] })
  const [at, setAt] = useState(0)
  const [now] = useState(() => Date.now())
  const rows = useRef<HTMLDivElement>(null)

  const within = chat.scope === ALL ? undefined : chat.scope

  useEffect(() => {
    let open = true
    void window.geckit.chat.list(undefined).then((read) => {
      if (open) setEvery(read)
    })
    void window.geckit.chat.search('', within)
    return () => {
      open = false
    }
  }, [within])

  useEffect(() => {
    if (asked.trim() === '') return
    let current = true
    const wait = setTimeout(() => {
      void window.geckit.chat.search(asked, within).then((found) => {
        if (current) setHits({ asked, found })
      })
    }, WAIT)
    return () => {
      current = false
      clearTimeout(wait)
    }
  }, [asked, within])

  const all = within === undefined ? every : every.filter((one) => one.root === within)

  const words = asked.toLowerCase().split(/\s+/).filter((word) => word !== '')
  const front = chat.shown.kind === 'session' ? chat.shown.id : undefined
  const byId = new Map(all.map((one) => [one.id, one]))
  const said = new Map((hits.asked === asked ? hits.found : []).map((hit) => [hit.id, hit]))

  let found: Row[]
  if (words.length === 0) {
    found = [...all]
      .filter((one) => one.id !== front)
      .sort((one, other) => used(other) - used(one))
      .slice(0, MOST)
      .map((session) => ({ session }))
  } else {
    const byName = [...all].filter((one) => named(one, words)).sort((one, other) => used(other) - used(one))
    const shown = new Set(byName.map((one) => one.id))
    const bySaid = [...said.values()].flatMap((hit) => {
      const session = byId.get(hit.id)
      return session === undefined || shown.has(hit.id) ? [] : [{ session, hit }]
    })
    found = [
      ...byName.map((session) => {
        const hit = said.get(session.id)
        return hit === undefined ? { session } : { session, hit }
      }),
      ...bySaid.map((row, index) => (index === 0 && byName.length > 0 ? { ...row, heads: true } : row)),
    ].slice(0, MOST)
  }
  const here = Math.min(at, Math.max(0, found.length - 1))

  useEffect(() => {
    rows.current?.querySelector('.row.on')?.scrollIntoView({ block: 'nearest' })
  }, [here])

  const take = (row: Row | undefined): void => {
    if (row !== undefined) {
      chat.show(row.session)
      if (row.hit !== undefined) onSeek({ id: row.session.id, words })
    }
    onClose()
  }

  return (
    <>
      <div className="scrim" onMouseDown={onClose} />
      <div className="switcher floating">
        <div className="switcher-field">
          <Icon name="search" />
          <input
            type="text"
            value={asked}
            autoFocus
            placeholder={
              within === undefined
                ? 'Search conversations, projects, folders and what was said'
                : `Search ${projectName(within)}: conversations and what was said`
            }
            onChange={(event) => {
              setAsked(event.target.value)
              setAt(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setAt(Math.min(here + 1, found.length - 1))
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setAt(Math.max(here - 1, 0))
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                take(found[here])
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                onClose()
              }
            }}
          />
        </div>
        <div className="switcher-rows" ref={rows}>
          {words.length === 0 && found.length > 0 ? <div className="switcher-head">Used last</div> : null}
          {found.length === 0 ? (
            <div className="empty">{words.length === 0 ? 'No other conversations yet.' : 'Nothing found.'}</div>
          ) : (
            found.map((row, index) => (
              <div key={row.session.id}>
                {row.heads === true ? <div className="switcher-head">In what was said</div> : null}
                <div
                  className={`row${index === here ? ' on' : ''}${row.session.state === 'asks' || row.session.state === 'unread' ? ` waits ${row.session.state}` : ''}`}
                  role="button"
                  tabIndex={-1}
                  title={row.session.root}
                  onMouseMove={() => setAt(index)}
                  onMouseDown={() => take(row)}
                >
                  <Dot session={row.session} />
                  <span className="lines">
                    <span className="head">
                      <span className="title">
                        <Marked text={row.session.title === '' ? 'Untitled' : row.session.title} words={words} />
                      </span>
                      <span className="changed">{ago(used(row.session), now)}</span>
                    </span>
                    <span className="stands">
                      <span className="where" style={tint(projectColor(row.session.root, chat.settings))}>
                        <Marked text={place(row.session.root, words)} words={words} />
                      </span>
                      {row.hit === undefined ? (
                        row.session.stands === '' ? null : <span>{row.session.stands}</span>
                      ) : (
                        <>
                          <Marked text={row.hit.said} words={words} />
                          {row.hit.count > 1 ? <span className="more-found"> and {row.hit.count - 1} more</span> : null}
                        </>
                      )}
                    </span>
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
