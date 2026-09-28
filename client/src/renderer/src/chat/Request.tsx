import { createContext, useContext, useEffect, useRef, useState } from 'react'

import { homeOf } from '../../../shared/api'
import type { ChatSession, Lineup, SessionItem } from '../../../shared/api'
import { projectColor } from '../../../shared/project-color'
import { ON_PHONE } from '../on-phone'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { projectName, tint } from './project'
import { startedFrom } from './started'
import type { Chat } from './useChat'

/**
 * Conversations Claude asked GeckIt to start, shown in the conversation that
 * asked. Rows fold to a title so a batch is approved at a glance; the prompt,
 * the goal and a note are one press away, and nothing starts until the button.
 */

/** The window, for what a request row needs of it: the conversations it started, and opening them. */
export const RequestChat = createContext<Chat | undefined>(undefined)

export const conversations = (count: number): string => (count === 1 ? 'a conversation' : `${String(count)} conversations`)

/** How a started conversation stands, in the words its row and the asker's board card use. */
export function childSaid(session: ChatSession): { readonly words: string; readonly tone: string } {
  if (session.state === 'asks') return { words: 'asking you', tone: 'said-asks' }
  if (session.state === 'working') return { words: 'working', tone: 'said-working' }
  if (session.waits === true) return { words: 'queued', tone: '' }
  if (session.status === 'review') return { words: 'in review', tone: 'said-review' }
  if (session.status === 'blocked') return { words: 'blocked', tone: 'said-asks' }
  if (session.status === 'done') return { words: 'done', tone: 'said-done' }
  return { words: 'in progress', tone: '' }
}

const HERE = ON_PHONE ? 'phone' : 'mac'

type RequestItem = Extract<SessionItem, { kind: 'request' }>

export function Request({ item }: { readonly item: RequestItem }): React.JSX.Element {
  const chat = useContext(RequestChat)
  const color = (project: string, root?: string): React.CSSProperties | undefined => {
    const home = root ?? chat?.settings.projects.find((one) => projectName(one) === project)
    return home === undefined || chat === undefined ? undefined : tint(projectColor(home, chat.settings))
  }
  if (item.answer !== undefined) return <Answered item={item} chat={chat} color={color} />
  return <Waiting item={item} color={color} lineup={chat?.full === true ? chat.lineup : undefined} />
}

function Answered({
  item,
  chat,
  color,
}: {
  readonly item: RequestItem
  readonly chat: Chat | undefined
  readonly color: (project: string, root?: string) => React.CSSProperties | undefined
}): React.JSX.Element {
  const answer = item.answer
  const count = item.tasks.length
  const started = item.tasks.filter((task) => task.started !== undefined).length
  const queued = item.tasks.filter((task) => chat?.sessions.find((one) => one.id === task.started)?.waits === true).length
  const running = started - queued
  const withdrawn = answer?.how === 'withdrawn'
  const head = withdrawn
    ? 'Claude stopped waiting for these'
    : started === 0 && queued === 0
      ? count === 1
        ? 'Refused'
        : `Refused all ${String(count)}`
      : queued > 0
        ? running === 0
          ? `Queued ${String(queued)}`
          : `Started ${String(running)}, queued ${String(queued)}`
        : started === count
          ? `Started ${String(started)}`
          : `Started ${String(started)} of ${String(count)}`
  const elsewhere = !withdrawn && answer?.where !== undefined && answer.where !== HERE ? ` on the ${answer.where === 'mac' ? 'Mac' : 'phone'}` : ''
  return (
    <div className="card request">
      <div className="request-head">
        <span className={`request-glyph ${started + queued > 0 ? 'done' : 'gone'}`}>
          <Icon name={started + queued > 0 ? 'check' : 'close'} size={12} />
        </span>
        <div className="request-heading">
          <div className="card-title">
            {head}
            {elsewhere}
          </div>
          {withdrawn ? <div className="request-sub">Nothing was started.</div> : null}
        </div>
      </div>
      <div className="request-rows">
        {item.tasks.map((task, index) => {
          const child = task.started === undefined ? undefined : chat?.sessions.find((one) => one.id === task.started)
          const said = child === undefined ? undefined : childSaid(child)
          const line = (
            <>
              <span className="request-title">{task.title}</span>
              <span className="request-project tinted" style={color(task.project, child === undefined ? undefined : homeOf(child))}>
                {task.project}
              </span>
            </>
          )
          return (
            <div key={index} className="request-row">
              <div className="request-line">
                {child === undefined ? (
                  <span className="request-open">{line}</span>
                ) : (
                  <button type="button" className="request-open" title="Open this conversation" onClick={() => chat?.goTo(child.id)}>
                    {line}
                  </button>
                )}
                {task.started === undefined ? (
                  <span className="request-said refused">{withdrawn ? 'not started' : 'refused'}</span>
                ) : said === undefined ? null : (
                  <span className={`request-said state-said ${said.tone}`}>
                    <span className="state-dot" />
                    {said.words}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      {answer?.reply === undefined ? null : <div className="request-replied">You replied: {answer.reply}</div>}
    </div>
  )
}

function Waiting({
  item,
  color,
  lineup,
}: {
  readonly item: RequestItem
  readonly color: (project: string) => React.CSSProperties | undefined
  /** As many working as the limit allows, so what starts here waits in the queue. */
  readonly lineup: Lineup | undefined
}): React.JSX.Element {
  const count = item.tasks.length
  const one = count === 1
  const [ticked, setTicked] = useState<readonly boolean[]>(() => item.tasks.map(() => true))
  const [open, setOpen] = useState<readonly boolean[]>(() => item.tasks.map(() => false))
  const [notes, setNotes] = useState<readonly string[]>(() => item.tasks.map(() => ''))
  const [replying, setReplying] = useState(false)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const primary = useRef<HTMLButtonElement>(null)
  const chosen = ticked.filter(Boolean).length
  // Opened from a notice or from the board, the one press most answers need is where Enter goes.
  useEffect(() => primary.current?.focus({ preventScroll: false }), [])

  const answer = (start: readonly boolean[]): void => {
    if (sending) return
    setSending(true)
    void window.geckit.chat.answerRequest(item.id, { start, notes, reply, where: HERE })
  }
  const submit = (): void => {
    if (chosen > 0) answer(ticked)
  }
  const fieldKeys = (event: React.KeyboardEvent): void => {
    if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return
    event.preventDefault()
    submit()
  }
  const at = <T,>(list: readonly T[], index: number, value: T): readonly T[] => list.map((was, where) => (where === index ? value : was))

  return (
    <div className="card request" role="group" aria-label={`Claude wants to start ${conversations(count)}`}>
      <div className="request-head">
        <span className="request-glyph">
          <Icon name="plus" size={12} />
        </span>
        <div className="request-heading">
          <div className="card-title">Claude wants to start {conversations(count)}</div>
          <div className="request-sub">
            {lineup !== undefined
              ? `${String(lineup.working)} of ${String(lineup.limit)} working, so ${one ? 'this waits' : 'these wait'} in the queue.`
              : one
                ? 'Nothing starts until you press Start.'
                : 'Untick any you do not want. Nothing starts until you press Start.'}
          </div>
        </div>
      </div>
      <div className="request-rows">
        {item.tasks.map((task, index) => {
          // One task has nothing to choose between, so what it says is shown at once.
          const shown = one || open[index] === true
          const line = (
            <>
              <span className="request-title">{task.title}</span>
              <span className="request-project tinted" style={color(task.project)}>
                {task.project}
              </span>
            </>
          )
          return (
            <div
              key={index}
              className={`request-row${shown ? ' open' : ''}${ticked[index] === true ? '' : ' off'}${one ? ' alone' : ''}`}
            >
              <div className="request-line">
                {one ? (
                  <span className="request-open">{line}</span>
                ) : (
                  <>
                    <input
                      type="checkbox"
                      checked={ticked[index] === true}
                      aria-label={`Start ${task.title}`}
                      onChange={(event) => setTicked(at(ticked, index, event.target.checked))}
                    />
                    <button
                      type="button"
                      className="request-open"
                      aria-expanded={shown}
                      title={shown ? 'Hide the first message and the goal' : 'Show the first message and the goal'}
                      onClick={() => setOpen(at(open, index, !shown))}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
                          event.preventDefault()
                          setOpen(at(open, index, event.key === 'ArrowRight'))
                        }
                      }}
                    >
                      {line}
                      <Icon name="right" size={12} className="chevron" />
                    </button>
                  </>
                )}
              </div>
              {shown ? (
                <Details
                  task={task}
                  note={notes[index] ?? ''}
                  onNote={(note) => setNotes(at(notes, index, note))}
                  onKeyDown={fieldKeys}
                />
              ) : null}
            </div>
          )
        })}
      </div>
      <div className="request-foot">
        {replying ? (
          <input
            type="text"
            className="request-reply"
            placeholder="Reply to Claude (optional)"
            value={reply}
            autoFocus
            onChange={(event) => setReply(event.target.value)}
            onKeyDown={fieldKeys}
          />
        ) : (
          <>
            <button type="button" className="request-reply-add" onClick={() => setReplying(true)}>
              <Icon name="chat" size={11} />
              Reply to Claude
            </button>
            <span className="spacer" />
          </>
        )}
        <button type="button" className="quiet" disabled={sending} onClick={() => answer(item.tasks.map(() => false))}>
          {one ? 'Refuse' : 'Refuse all'}
        </button>
        <button type="button" className="primary" ref={primary} disabled={chosen === 0 || sending} onClick={submit}>
          {`${lineup === undefined ? 'Start' : 'Queue'}${one ? '' : chosen === count ? ' all' : ` ${String(chosen)} of ${String(count)}`}`}
        </button>
      </div>
    </div>
  )
}

/** What a task would start with and run to, and a note to add, under its row. */
function Details({
  task,
  note,
  onNote,
  onKeyDown,
}: {
  readonly task: RequestItem['tasks'][number]
  readonly note: string
  readonly onNote: (note: string) => void
  readonly onKeyDown: (event: React.KeyboardEvent) => void
}): React.JSX.Element {
  const [noting, setNoting] = useState(note !== '')
  return (
    <div className="request-body">
      <div className="request-message">{task.text}</div>
      <div className={`request-goal${task.goal === undefined ? ' none' : ''}`}>
        <Icon name="goal" size={11} />
        <span>{task.goal ?? 'No goal. It stops after its first answer.'}</span>
      </div>
      {noting ? (
        <label className="request-note">
          <Icon name="pencil" size={11} />
          <input
            type="text"
            placeholder="Note for this conversation, added under the message"
            value={note}
            autoFocus
            onChange={(event) => onNote(event.target.value)}
            onKeyDown={onKeyDown}
          />
        </label>
      ) : (
        <button type="button" className="request-note-add" onClick={() => setNoting(true)}>
          <Icon name="pencil" size={11} />
          Add a note
        </button>
      )}
    </div>
  )
}

/** "From <parent title>": the conversation that asked for this one, while it is still there. */
export function From({
  chat,
  session,
  className,
}: {
  readonly chat: Chat
  readonly session: ChatSession
  readonly className: string
}): React.JSX.Element | null {
  const parent = session.parent === undefined ? undefined : chat.sessions.find((one) => one.id === session.parent)
  if (parent === undefined) return null
  return (
    <div className={className}>
      From{' '}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          chat.goTo(parent.id)
        }}
      >
        {parent.title}
      </button>
    </div>
  )
}

/** "Started 2 - 1 working, 1 in review": how the conversations one asked for stand, for its board card. */
export function startedLine(sessions: readonly ChatSession[], id: string): string | undefined {
  const children = sessions.filter((one) => one.parent === id)
  if (children.length === 0) return undefined
  const counts = new Map<string, number>()
  for (const child of children) {
    const words = childSaid(child).words
    counts.set(words, (counts.get(words) ?? 0) + 1)
  }
  return `Started ${String(children.length)} - ${[...counts].map(([words, count]) => `${String(count)} ${words}`).join(', ')}`
}

/** The list "Started 3" opens on the Mac, from the head or the board card: a row a conversation, pressed to open it. */
export function StartedMenu({
  chat,
  id,
  anchor,
  onClose,
}: {
  readonly chat: Chat
  readonly id: string
  readonly anchor: DOMRect
  readonly onClose: () => void
}): React.JSX.Element {
  return (
    <Menu anchor={anchor} choices={[]} title="Started from this conversation" onPick={() => undefined} onClose={onClose}>
      {startedFrom(chat.sessions, id).map(({ session, depth }) => {
        const said = childSaid(session)
        return (
          <button
            key={session.id}
            type="button"
            role="menuitem"
            className="menu-item started-row"
            style={{ '--depth': Math.min(depth, 2) } as React.CSSProperties}
            onClick={() => {
              onClose()
              chat.goTo(session.id)
            }}
          >
            <span className={`state-said ${said.tone}`}>
              <span className="state-dot" />
            </span>
            <span className="started-words">
              <span className="started-title">{session.title}</span>
              <span className="started-meta">
                <span className="tinted" style={tint(projectColor(homeOf(session), chat.settings))}>
                  {projectName(homeOf(session))}
                </span>
                {' · '}
                <span className={`state-said ${said.tone}`}>{said.words}</span>
              </span>
            </span>
          </button>
        )
      })}
    </Menu>
  )
}

/** The way back from a started conversation to the one that asked for it, where "Started 3" stands in the parent. */
export function Back({ chat, session }: { readonly chat: Chat; readonly session: ChatSession }): React.JSX.Element | null {
  const parent = session.parent === undefined ? undefined : chat.sessions.find((one) => one.id === session.parent)
  if (parent === undefined) return null
  return (
    <button type="button" className="picker head-back no-drag" title="Open the conversation that started this one" onClick={() => chat.goTo(parent.id)}>
      <Icon name="left" size={11} />
      <span>{parent.title}</span>
    </button>
  )
}
