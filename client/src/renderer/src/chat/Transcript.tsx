import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import type { BackgroundTask, CardAnswer, SessionItem } from '../../../shared/api'
import { Icon } from '../ui/Icon'
import { Code, CopyButton } from './Code'
import { Preview } from './Preview'
import { OPENS, Prose } from './Prose'
import type { FileHow } from './Prose'
import { richOf, richSelection } from './rich'
import type { Seek } from './Switcher'
import { running } from './Tasks'
import { stamp } from './time'

/**
 * The conversation, as it happened.
 *
 * Every item is drawn from its own kind: what was said, what was done, what is
 * being asked. A line that is going has a turning glyph; pressing it opens
 * what it produced. Nothing is hidden that changes what the assistant did.
 *
 * A turn is drawn once and then left alone, and only the end of a long
 * conversation is drawn at all: a year of work in one folder runs to thousands
 * of turns, and drawing them all again on every keystroke is what makes a
 * window feel slow.
 */

/** How much of a conversation is drawn at once, and how much more each press adds. */
const PAGE = 300
/** What is drawn the moment a conversation opens, its end; the rest of the page follows once that is on screen. */
const FIRST = 40

function Did({
  item,
  going,
  onFile,
  onBackground,
  onPicture,
}: {
  readonly item: Extract<SessionItem, { kind: 'did' }>
  /** What it started still runs in the background. */
  readonly going: boolean
  readonly onFile: (path: string, how: FileHow) => void
  readonly onBackground: (item: string) => void
  readonly onPicture: (src: string) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const live = item.live === true || going
  const has = item.detail !== undefined || item.path !== undefined
  const line = (
    <button
      type="button"
      className="did"
      disabled={!has}
      {...(item.detail === undefined && item.path !== undefined ? { title: OPENS } : {})}
      onClick={(event) => {
        if (item.detail !== undefined) setOpen(!open)
        else if (item.path !== undefined) onFile(item.path, event.metaKey ? 'reveal' : 'open')
      }}
      onContextMenu={(event) => {
        if (item.path === undefined) return
        event.preventDefault()
        onFile(item.path, 'menu')
      }}
    >
      <span className={`glyph${live ? ' spinning' : ''}`}>
        <Icon name={live ? 'spinner' : item.detail === undefined ? 'check' : open ? 'down' : 'right'} size={12} />
      </span>
      <span className="what">{item.what}</span>
    </button>
  )
  return (
    <>
      {item.live === true && item.lasting === true ? (
        <div className="did-row">
          {line}
          <button type="button" className="quiet small" onClick={() => onBackground(item.id)} title="Ctrl+B">
            Run in the background
          </button>
        </div>
      ) : (
        line
      )}
      {open && item.detail !== undefined ? <Code detail>{item.detail}</Code> : null}
      {item.images === undefined ? null : (
        <div className="pictures did-pictures">
          {item.images.map((one, index) => (
            <img
              key={index}
              src={`data:${one.media};base64,${one.data}`}
              alt=""
              title="Press to see it bigger"
              onClick={() => onPicture(`data:${one.media};base64,${one.data}`)}
            />
          ))}
        </div>
      )}
    </>
  )
}

function Card({
  item,
  onAnswer,
}: {
  readonly item: Extract<SessionItem, { kind: 'card' }>
  readonly onAnswer: (card: string, answer: CardAnswer | string) => void
}): React.JSX.Element {
  const [else_, setElse] = useState('')
  const card = item.card
  if (card.answered !== undefined) {
    return (
      <div className="card answered">
        <span className="glyph">
          <Icon name="check" size={12} />
        </span>
        <span>{card.answered}</span>
      </div>
    )
  }
  return (
    <div className="card">
      <div className="card-title">{card.title}</div>
      {card.where === undefined ? null : <div className="where">{card.where}</div>}
      {card.detail === undefined ? null : <Code detail>{card.detail}</Code>}
      <div className="card-actions">
        {card.kind === 'question' ? (
          <>
            {(card.choices ?? []).map((choice) => (
              <button key={choice} type="button" className="quiet" onClick={() => onAnswer(item.id, choice)}>
                {choice}
              </button>
            ))}
            <input
              type="text"
              value={else_}
              placeholder="Something else"
              style={{ flex: 1, minWidth: 140 }}
              onChange={(event) => setElse(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || else_.trim() === '') return
                event.preventDefault()
                onAnswer(item.id, else_.trim())
              }}
            />
          </>
        ) : card.kind === 'start' ? (
          <>
            <button type="button" className="quiet" onClick={() => onAnswer(item.id, 'no')}>
              Keep reading only
            </button>
            <button type="button" className="primary" onClick={() => onAnswer(item.id, 'once')}>
              Start
            </button>
          </>
        ) : (
          <>
            <button type="button" className="quiet" onClick={() => onAnswer(item.id, 'no')}>
              No
            </button>
            <button type="button" className="quiet" onClick={() => onAnswer(item.id, 'session')}>
              Allow this session
            </button>
            <button type="button" className="primary" onClick={() => onAnswer(item.id, 'once')}>
              Allow once
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** What a command asks when what is typed to it should not be shown. */
const SECRET = /(password|passphrase)[^\n]*:\s*$/i

/** A command typed after `!`, with what it printed under it and a line to type to it while it runs. */
function Shell({
  item,
  onStop,
  onType,
}: {
  readonly item: Extract<SessionItem, { kind: 'shell' }>
  readonly onStop: (item: string) => void
  readonly onType: (item: string, text: string) => void
}): React.JSX.Element {
  const [typed, setTyped] = useState('')
  const terminal = item.terminal === true
  const ended =
    item.stopped === true
      ? terminal
        ? 'Not waited for'
        : 'Stopped'
      : item.code !== undefined
        ? `Exit code ${String(item.code)}${terminal ? ' in the terminal' : ''}`
        : terminal
          ? 'Done in the terminal'
          : ''
  return (
    <div className="shell">
      <div className="shell-head">
        <span className="shell-command">!{item.command}</span>
        {item.running === true ? (
          <>
            {terminal ? <span className="shell-ended">In a terminal, since it wants a keyboard</span> : null}
            <span className="glyph spinning">
              <Icon name="spinner" size={12} />
            </span>
            <button type="button" className="quiet small" onClick={() => onStop(item.id)}>
              {terminal ? 'Stop waiting' : 'Stop'}
            </button>
          </>
        ) : ended === '' ? null : (
          <span className={`shell-ended${item.code === undefined ? '' : ' failed'}`}>{ended}</span>
        )}
      </div>
      {item.output === '' ? null : <Code detail>{item.output}</Code>}
      {item.running === true && !terminal ? (
        <input
          type={SECRET.test(item.output) ? 'password' : 'text'}
          className="shell-typed"
          value={typed}
          placeholder="Type to it here, Enter sends the line"
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            onType(item.id, `${typed}\n`)
            setTyped('')
          }}
        />
      ) : null}
    </div>
  )
}

function Note({ item }: { readonly item: Extract<SessionItem, { kind: 'note' }> }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const summary = item.note === 'summarised'
  return (
    <div className={`note ${item.note}`}>
      {item.text}
      {item.detail === undefined ? null : (
        <>
          {' '}
          <button
            type="button"
            style={{ color: 'inherit', textDecoration: 'underline' }}
            onClick={() => setOpen(!open)}
          >
            {summary ? (open ? 'Hide the summary' : 'Read the summary') : open ? 'Hide what it said' : 'What it said'}
          </button>
          {!open ? null : summary ? (
            <div className="note-summary">
              <Prose text={item.detail} />
            </div>
          ) : (
            <Code detail>{item.detail}</Code>
          )}
        </>
      )}
    </div>
  )
}

function When({
  at,
  said,
  onCopy,
}: {
  readonly at: number
  readonly said: string
  readonly onCopy?: (() => void) | undefined
}): React.JSX.Element {
  return (
    <div className="when">
      <span title={new Date(at).toLocaleString()}>{said}</span>
      {onCopy === undefined ? null : (
        <CopyButton className="copy-answer" title="Copy the answer, formatting and all" copy={onCopy} />
      )}
    </div>
  )
}

const Turn = memo(function Turn({
  item,
  going,
  when,
  onAnswer,
  onAgain,
  onFile,
  onPicture,
  onCopyAnswer,
  onStopShell,
  onTypeShell,
  onBackground,
}: {
  readonly item: SessionItem
  readonly going: boolean
  /** When it was said, where it is one to date: a message, or the end of an answer. */
  readonly when: string | undefined
  readonly onAnswer: (card: string, answer: CardAnswer | string) => void
  readonly onAgain: (id: string) => void
  readonly onFile: (path: string, how: FileHow) => void
  readonly onPicture: (src: string) => void
  /** Copies an answer, which is the piece it ends with: what came before it is what was being done. */
  readonly onCopyAnswer: (id: string, text: string) => void
  readonly onStopShell: (item: string) => void
  readonly onTypeShell: (item: string, text: string) => void
  readonly onBackground: (item: string) => void
}): React.JSX.Element {
  const at = item.kind === 'mine' || item.kind === 'theirs' ? item.at : undefined
  // A line of what was done sits close to the next one, so a run of them reads as one list.
  const step =
    item.kind === 'did' ||
    item.kind === 'thought' ||
    item.kind === 'wrote' ||
    (item.kind === 'card' && item.card.answered !== undefined)
  return (
    <div className={`turn${step ? ' step' : ''}`} data-item={item.id}>
      {item.kind === 'mine' ? (
        <div className={`mine${item.unsent === true ? ' unsent' : ''}`}>
          {item.text}
          {item.images === undefined ? null : (
            <div className="pictures">
              {item.images.map((one, index) => (
                <img
                  key={index}
                  src={`data:${one.media};base64,${one.data}`}
                  alt=""
                  title="Press to see it bigger"
                  onClick={() => onPicture(`data:${one.media};base64,${one.data}`)}
                />
              ))}
            </div>
          )}
          {item.unsent === true ? (
            <div style={{ marginTop: 6 }}>
              <button type="button" className="quiet" onClick={() => onAgain(item.id)}>
                Send again
              </button>
            </div>
          ) : null}
        </div>
      ) : item.kind === 'theirs' ? (
        <div className="theirs" data-said={item.id}>
          <Prose text={item.text} />
        </div>
      ) : item.kind === 'did' ? (
        <Did item={item} going={going} onFile={onFile} onBackground={onBackground} onPicture={onPicture} />
      ) : item.kind === 'thought' ? (
        <div className="thought">{item.text === '' ? 'Thought about it' : item.text}</div>
      ) : item.kind === 'card' ? (
        <Card item={item} onAnswer={onAnswer} />
      ) : item.kind === 'shell' ? (
        <Shell item={item} onStop={onStopShell} onType={onTypeShell} />
      ) : item.kind === 'wrote' ? (
        <div className="wrote">
          Changed
          {item.paths.map((path) => (
            <button
              key={path}
              type="button"
              className="chip"
              title={OPENS}
              onClick={(event) => onFile(path, event.metaKey ? 'reveal' : 'open')}
              onContextMenu={(event) => {
                event.preventDefault()
                onFile(path, 'menu')
              }}
            >
              <Icon name="file" size={11} />
              {path}
            </button>
          ))}
        </div>
      ) : (
        <Note item={item} />
      )}
      {at === undefined || when === undefined ? null : (
        <When at={at} said={when} onCopy={item.kind === 'theirs' ? () => onCopyAnswer(item.id, item.text) : undefined} />
      )}
    </div>
  )
})

export const Transcript = memo(function Transcript({
  at,
  items,
  working,
  onAnswer,
  onAgain,
  onFile,
  onStopShell,
  onTypeShell,
  onBackground,
  tasks,
  onTasks,
  seek,
}: {
  /** Which conversation this is, so another one opens at its end rather than where this one was left. */
  readonly at: string
  readonly items: readonly SessionItem[]
  readonly working: boolean
  readonly onAnswer: (card: string, answer: CardAnswer | string) => void
  readonly onAgain: (id: string) => void
  /** A file pressed: opened, shown in the Finder, or its menu asked for. */
  readonly onFile: (path: string, how: FileHow) => void
  readonly onStopShell: (item: string) => void
  readonly onTypeShell: (item: string, text: string) => void
  readonly onBackground: (item: string) => void
  /** What Claude Code has in the background for it, and opening the dialog that lists it. */
  readonly tasks: readonly BackgroundTask[] | undefined
  readonly onTasks: (open: boolean) => void
  /** A message to go to once this conversation is read, found by the words searched for. */
  readonly seek?: Seek | undefined
}): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const stuck = useRef(true)
  const was = useRef(at)
  const [preview, setPreview] = useState<string | undefined>()
  // How much is drawn, and of which conversation: one that has just arrived is drawn from its end, before its page is.
  const [drawn, setDrawn] = useState({ at, count: FIRST })
  const [now, setNow] = useState(() => Date.now())

  const picture = useCallback((src: string) => setPreview(src), [])

  const runs = useMemo(() => (tasks ?? []).filter(running), [tasks])
  const going = useMemo(() => new Set(runs.flatMap((task) => (task.use === undefined ? [] : [task.use]))), [runs])

  // The Markdown it was written in is its plain text.
  const copyAnswer = useCallback((id: string, text: string) => {
    const drawn = box.current?.querySelector(`[data-said="${CSS.escape(id)}"]`)
    window.geckit.copy(text, richOf(drawn === null || drawn === undefined ? [] : [drawn]).html)
  }, [])

  // Today's "14:05" becomes "Yesterday 14:05" while the window is open.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(tick)
  }, [])

  // Only the person lets go of the bottom, by moving up, and reaching it again takes hold.
  useEffect(() => {
    const scroller = box.current
    const content = scroller?.firstElementChild
    if (scroller === null || content === null || content === undefined) return
    let last = scroller.scrollTop
    const gap = (): number => scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
    // Content getting shorter pulls it up too, and then it is still at the bottom.
    const said = (): void => {
      if (scroller.scrollTop < last && gap() > 1) stuck.current = false
      else if (scroller.scrollTop > last && gap() < 16) stuck.current = true
      last = scroller.scrollTop
    }
    const wheel = (event: WheelEvent): void => {
      if (event.deltaY < 0 && scroller.scrollTop > 0) stuck.current = false
    }
    // What grows without a new item, the Working line or a picture loading, is followed too.
    const follow = new ResizeObserver(() => {
      if (stuck.current) scroller.scrollTop = scroller.scrollHeight
    })
    follow.observe(scroller)
    follow.observe(content)
    scroller.addEventListener('scroll', said)
    scroller.addEventListener('wheel', wheel, { passive: true })
    return () => {
      follow.disconnect()
      scroller.removeEventListener('scroll', said)
      scroller.removeEventListener('wheel', wheel)
    }
  }, [])

  useLayoutEffect(() => {
    if (was.current !== at) {
      was.current = at
      stuck.current = true
    }
    if (!stuck.current || box.current === null) return
    box.current.scrollTop = box.current.scrollHeight
  }, [at, items])

  // The message a search went to, however far back it is.
  const sought = useMemo(
    () =>
      seek === undefined || seek.id !== at
        ? -1
        : items.findLastIndex(
            (item) =>
              (item.kind === 'mine' || item.kind === 'theirs') &&
              seek.words.every((word) => item.text.toLowerCase().includes(word)),
          ),
    [seek, at, items],
  )
  const page = drawn.at === at ? drawn.count : FIRST
  useEffect(() => {
    if (page >= PAGE) return
    const more = setTimeout(() => setDrawn({ at, count: PAGE }), 0)
    return () => clearTimeout(more)
  }, [page, at])

  const reach = sought < 0 ? page : Math.max(page, items.length - sought + 20)
  const shown = items.length > reach ? items.slice(items.length - reach) : items

  const went = useRef<Seek | undefined>(undefined)
  // The conversation arrives a moment after it is chosen, so this waits for the message to be in it.
  useEffect(() => {
    const target = items[sought]
    if (seek === undefined || went.current === seek || target === undefined) return
    const element = box.current?.querySelector(`[data-item="${CSS.escape(target.id)}"]`)
    if (element === null || element === undefined) return
    went.current = seek
    stuck.current = false
    element.scrollIntoView({ block: 'center' })
    element.classList.add('found')
    setTimeout(() => element.classList.remove('found'), 2400)
  }, [seek, items, sought])

  useEffect(() => {
    if (seek === undefined) return
    // Words that are nowhere in it any more, or a conversation that never came, are not waited on for ever.
    const give = setTimeout(() => {
      went.current = seek
    }, 5000)
    return () => clearTimeout(give)
  }, [seek])

  // An answer comes in pieces between the lines of what was done; it is dated where it ends.
  const ends = new Set<string>()
  let open = true
  for (const item of [...shown].reverse()) {
    if (item.kind === 'mine') open = true
    else if (item.kind === 'theirs' && open) {
      ends.add(item.id)
      open = false
    }
  }
  const when = (item: SessionItem): string | undefined =>
    (item.kind === 'mine' || (item.kind === 'theirs' && ends.has(item.id))) && item.at !== undefined
      ? stamp(item.at, now)
      : undefined

  return (
    <div
      className="transcript"
      ref={box}
      onCopy={(event) => {
        const copied = richSelection(document.getSelection(), event.currentTarget)
        if (copied === undefined) return
        event.preventDefault()
        event.clipboardData.setData('text/html', copied.html)
        event.clipboardData.setData('text/plain', copied.text)
      }}
    >
      <div>
        {items.length > shown.length ? (
          <div className="turn">
            <button type="button" className="quiet" onClick={() => setDrawn({ at, count: reach + PAGE })}>
              Show earlier ({items.length - shown.length} more)
            </button>
          </div>
        ) : null}

        {shown.map((item) => (
          <Turn
            key={item.id}
            item={item}
            going={going.has(item.id)}
            when={when(item)}
            onAnswer={onAnswer}
            onAgain={onAgain}
            onFile={onFile}
            onPicture={picture}
            onCopyAnswer={copyAnswer}
            onStopShell={onStopShell}
            onTypeShell={onTypeShell}
            onBackground={onBackground}
          />
        ))}

        {working && items.at(-1)?.kind !== 'card' ? (
          <div className="turn">
            <div className="did" style={{ cursor: 'default' }}>
              <span className="glyph spinning">
                <Icon name="spinner" size={12} />
              </span>
              <span className="what">Working</span>
            </div>
          </div>
        ) : null}

        {/* Its turn is over, and what it started goes on. */}
        {working || runs.length === 0 ? null : (
          <div className="turn">
            <button type="button" className="did" title="What runs in the background (/tasks)" onClick={() => onTasks(true)}>
              <span className="glyph spinning">
                <Icon name="spinner" size={12} />
              </span>
              <span className="what">
                {runs.length === 1 ? `Running in the background: ${runs[0]?.what ?? ''}` : `${String(runs.length)} running in the background`}
              </span>
            </button>
          </div>
        )}
      </div>

      {preview === undefined ? null : <Preview src={preview} onClose={() => setPreview(undefined)} />}
    </div>
  )
})
