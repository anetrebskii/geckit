import { Fragment, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { isStep, runKey } from '../../../shared/steps'
import type { BackgroundTask, CardAnswer, SessionImage, SessionItem } from '../../../shared/api'
import { Icon } from '../ui/Icon'
import { Code, CopyButton } from './Code'
import { Preview } from './Preview'
import { Request } from './Request'
import { Files, opensTitle, Prose } from './Prose'
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
  const files = useContext(Files)
  const live = item.live === true || going
  const has = item.detail !== undefined || item.path !== undefined
  const line = (
    <button
      type="button"
      className="did"
      disabled={!has}
      {...(item.detail === undefined && item.path !== undefined ? { title: opensTitle(files?.root) } : {})}
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
            <Picture key={index} image={one} onPicture={onPicture} />
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
  const files = useContext(Files)
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
                <Picture key={index} image={one} onPicture={onPicture} />
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
        <>
          {item.phase === 'commentary' ? <div className="reply-phase">Progress update</div> : null}
          <div className="theirs" data-said={item.id}>
            <Prose text={item.text} />
          </div>
        </>
      ) : item.kind === 'did' ? (
        <Did item={item} going={going} onFile={onFile} onBackground={onBackground} onPicture={onPicture} />
      ) : item.kind === 'thought' ? (
        <div className="thought">{item.text === '' ? 'Thought about it' : item.text}</div>
      ) : item.kind === 'card' ? (
        <Card item={item} onAnswer={onAnswer} />
      ) : item.kind === 'request' ? (
        <Request item={item} />
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
              title={opensTitle(files?.root)}
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
        item.kind === 'steps' ? null : <Note item={item} />
      )}
      {at === undefined || when === undefined ? null : (
        <When at={at} said={when} onCopy={item.kind === 'theirs' ? () => onCopyAnswer(item.id, item.text) : undefined} />
      )}
    </div>
  )
})

// A picture is drawn at most 220 points wide, and fills the screen when pressed; the phone asks for each size when it is wanted, and keeps it.
const DRAWN = 220 * 3
const WHOLE = 1200
const asked = new Map<string, Promise<string | undefined>>()
const PICTURES_KEPT = 80

function pictureAt(ref: string, width: number): Promise<string | undefined> {
  const key = `${ref}\n${String(width)}`
  let held = asked.get(key)
  if (held === undefined) {
    held = window.geckit.chat
      .picture(ref, width)
      .then((one) => (one === undefined ? undefined : `data:${one.media};base64,${one.data}`))
      .catch(() => {
        asked.delete(key)
        return undefined
      })
    asked.set(key, held)
    if (asked.size > PICTURES_KEPT) asked.delete(asked.keys().next().value ?? '')
  }
  return held
}

/** A picture, carried whole or, on the phone, asked for once it comes into view. */
function Picture({ image, onPicture }: { readonly image: SessionImage; readonly onPicture: (src: string) => void }): React.JSX.Element {
  const ref = image.data === '' ? image.ref : undefined
  const [src, setSrc] = useState(ref === undefined ? `data:${image.media};base64,${image.data}` : undefined)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = box.current
    if (ref === undefined || element === null) return
    let gone = false
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((one) => one.isIntersecting)) return
      seen.disconnect()
      void pictureAt(ref, DRAWN).then((got) => {
        if (!gone && got !== undefined) setSrc(got)
      })
    })
    seen.observe(element)
    return () => {
      gone = true
      seen.disconnect()
    }
  }, [ref])
  if (src === undefined) return <div ref={box} className="picture-waiting" aria-busy="true" />
  return (
    <img
      src={src}
      alt=""
      title="Press to see it bigger"
      onClick={() => {
        if (ref === undefined) return onPicture(src)
        void pictureAt(ref, WHOLE).then((whole) => onPicture(whole ?? src))
      }}
    />
  )
}

/** The one line a run of steps is drawn as, with the pictures its steps handed back while it is shut, and the line over it once it is open. */
function Fold({
  said,
  icon,
  title,
  onPress,
  images = [],
  onPicture,
}: {
  readonly said: string
  readonly icon: 'right' | 'down' | 'spinner'
  readonly title: string
  readonly onPress: () => void
  readonly images?: readonly SessionImage[]
  readonly onPicture?: (src: string) => void
}): React.JSX.Element {
  return (
    <div className="turn step">
      <button type="button" className="did" title={title} onClick={onPress}>
        <span className={`glyph${icon === 'spinner' ? ' spinning' : ''}`}>
          <Icon name={icon} size={12} />
        </span>
        <span className="what">{said}</span>
      </button>
      {images.length === 0 || onPicture === undefined ? null : (
        <div className="pictures did-pictures fold-pictures">
          {images.map((one, index) => (
            <Picture key={one.ref ?? index} image={one} onPicture={onPicture} />
          ))}
        </div>
      )}
    </div>
  )
}

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
  onContinue,
  tasks,
  onTasks,
  seek,
  earlier = 0,
  onEarlier,
  onSteps,
  find,
  onFindClose,
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
  /** Sends "continue", offered under a Stop that is the last thing said. */
  readonly onContinue: () => void
  /** What Claude Code has in the background for it, and opening the dialog that lists it. */
  readonly tasks: readonly BackgroundTask[] | undefined
  readonly onTasks: (open: boolean) => void
  /** A message to go to once this conversation is read, found by the words searched for. */
  readonly seek?: Seek | undefined
  /** How much is before the items and not yet here, and asking for it. */
  readonly earlier?: number
  readonly onEarlier?: () => void
  /** A run of steps opened that is only a line so far: its steps are to be asked for. */
  readonly onSteps?: (run: Extract<SessionItem, { kind: 'steps' }>) => void
  /** When finding in it was last asked for, which puts the field there and in focus; none, and there is no field. */
  readonly find?: number | undefined
  readonly onFindClose?: () => void
}): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)
  const stuck = useRef(true)
  const was = useRef(at)
  const [preview, setPreview] = useState<string | undefined>()
  // How much is drawn, and of which conversation: one that has just arrived is drawn from its end, before its page is.
  const [drawn, setDrawn] = useState({ at, count: FIRST })
  const [opened, setOpened] = useState<{ readonly at: string; readonly keys: ReadonlySet<string> }>({ at, keys: new Set() })
  const [now, setNow] = useState(() => Date.now())
  const [query, setQuery] = useState('')
  // Which of the messages found is gone to, counted back from the newest.
  const [picked, setPicked] = useState(0)
  const field = useRef<HTMLInputElement>(null)

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

  // A message the person has just sent takes hold of the bottom again, however far up they were.
  const lastMine = items.findLast((item) => item.kind === 'mine')?.id
  const sent = useRef(lastMine)
  useLayoutEffect(() => {
    if (was.current !== at) {
      was.current = at
      stuck.current = true
    } else if (sent.current !== lastMine && lastMine !== undefined) stuck.current = true
    sent.current = lastMine
    if (!stuck.current || box.current === null) return
    box.current.scrollTop = box.current.scrollHeight
  }, [at, items, lastMine])

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
  // What is found in this conversation: the messages holding the words, oldest first.
  const word = find === undefined ? '' : query.trim().toLowerCase()
  const hits = useMemo(
    () =>
      word === ''
        ? []
        : items.flatMap((item, index) => ((item.kind === 'mine' || item.kind === 'theirs') && item.text.toLowerCase().includes(word) ? [index] : [])),
    [word, items],
  )
  const back = hits.length === 0 ? 0 : picked % hits.length
  const hit = hits[hits.length - 1 - back]
  const hitId = hit === undefined ? undefined : items[hit]?.id
  const go = (by: number): void => {
    if (hits.length > 0) setPicked((back + by + hits.length) % hits.length)
  }

  useEffect(() => {
    if (find === undefined) return
    field.current?.focus()
    field.current?.select()
  }, [find])

  const page = drawn.at === at ? drawn.count : FIRST
  useEffect(() => {
    if (page >= PAGE) return
    const more = setTimeout(() => setDrawn({ at, count: PAGE }), 0)
    return () => clearTimeout(more)
  }, [page, at])

  const reach = Math.max(page, sought < 0 ? 0 : items.length - sought + 20, hit === undefined ? 0 : items.length - hit + 20)
  // A request still waiting is kept at the end, where it is seen, while Claude goes on working above it; answered, it goes back to where it was asked.
  const waiting = items.filter((item) => item.kind === 'request' && item.answer === undefined)
  const inOrder = waiting.length === 0 ? items : items.filter((item) => !waiting.includes(item))
  const shown = inOrder.length > reach ? inOrder.slice(inOrder.length - reach) : inOrder

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

  useEffect(() => {
    if (hitId === undefined) return
    const element = box.current?.querySelector(`[data-item="${CSS.escape(hitId)}"]`)
    if (element === null || element === undefined) return
    stuck.current = false
    element.scrollIntoView({ block: 'center' })
  }, [hitId, back])

  // Each place the words are in what is drawn is marked, the one gone to more than the rest.
  useEffect(() => {
    if (typeof CSS.highlights === 'undefined') return
    const rest: Range[] = []
    const current: Range[] = []
    for (const index of hits) {
      const id = items[index]?.id
      const said = id === undefined ? null : box.current?.querySelector(`[data-item="${CSS.escape(id)}"] > :is(.mine, .theirs)`)
      if (said === null || said === undefined) continue
      const walk = document.createTreeWalker(said, NodeFilter.SHOW_TEXT)
      for (let node = walk.nextNode(); node !== null; node = walk.nextNode()) {
        const text = (node.textContent ?? '').toLowerCase()
        for (let from = text.indexOf(word); from >= 0; from = text.indexOf(word, from + word.length)) {
          const range = new Range()
          range.setStart(node, from)
          range.setEnd(node, from + word.length)
          ;(index === hit ? current : rest).push(range)
        }
      }
    }
    CSS.highlights.set('find', new Highlight(...rest))
    CSS.highlights.set('find-now', new Highlight(...current))
    return () => {
      CSS.highlights.delete('find')
      CSS.highlights.delete('find-now')
    }
  })

  // An answer comes in pieces between the lines of what was done; it is dated where it ends.
  const ends = new Set<string>()
  let open = true
  for (const item of [...shown].reverse()) {
    if (item.kind === 'mine') open = true
    else if (item.kind === 'theirs' && item.phase !== 'commentary' && open) {
      ends.add(item.id)
      open = false
    }
  }
  const when = (item: SessionItem): string | undefined =>
    (item.kind === 'mine' || (item.kind === 'theirs' && ends.has(item.id))) && item.at !== undefined
      ? stamp(item.at, now)
      : undefined
  const last = items.at(-1)
  const stopped = !working && last?.kind === 'note' && last.note === 'stopped'

  // A conversation reads as what was asked and what was answered: each run of steps between them is one line, opened by a press.
  // On the phone a run arrives as one `steps` item, and its steps are asked for when it is opened.
  const folds = new Map<string, { readonly first: string; readonly ids: string[]; latest: string | undefined; readonly images: SessionImage[] }>()
  const foldOf = new Map<string, string>()
  let fold: string | undefined
  for (const item of shown) {
    if (item.kind === 'steps') {
      fold = undefined
      folds.set(item.id, { first: item.id, ids: [...item.ids], latest: item.latest, images: [...(item.images ?? [])] })
      foldOf.set(item.id, item.id)
      continue
    }
    if (!isStep(item)) {
      fold = undefined
      continue
    }
    fold ??= runKey(item.id)
    const held = folds.get(fold) ?? { first: item.id, ids: [], latest: undefined, images: [] }
    held.ids.push(item.id)
    if (item.kind === 'did') {
      held.latest = item.what
      held.images.push(...(item.images ?? []))
    }
    folds.set(fold, held)
    foldOf.set(item.id, fold)
  }
  // The message searched for is shown with what is around it.
  const target = sought < 0 ? undefined : foldOf.get(items[sought]?.id ?? '')
  const openKeys = opened.at === at ? opened.keys : new Set<string>()
  const isOpen = (key: string): boolean => openKeys.has(key) || key === target
  const workingFold = working ? foldOf.get([...shown].reverse().find((item) => foldOf.has(item.id))?.id ?? '') : undefined
  const counted = (n: number): string => (n === 1 ? '1 step' : `${String(n)} steps`)

  return (
    <>
    {find === undefined ? null : (
      <div className="find-bar" role="search">
        <Icon name="search" size={13} />
        <input
          ref={field}
          type="text"
          value={query}
          placeholder="Find in this conversation"
          aria-label="Find in this conversation"
          enterKeyHint="search"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value)
            setPicked(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              onFindClose?.()
            } else if (event.key === 'Enter') {
              event.preventDefault()
              go(event.shiftKey ? -1 : 1)
            }
          }}
        />
        <span className="find-count">{word === '' ? '' : hits.length === 0 ? 'Not found' : `${String(hits.length - back)} of ${String(hits.length)}`}</span>
        {word === '' || earlier === 0 ? null : (
          <button type="button" className="quiet small" title="Only what is loaded is searched" onClick={onEarlier}>
            Load earlier
          </button>
        )}
        <button type="button" className="icon-button" title="Earlier (Enter)" aria-label="Earlier" disabled={hits.length < 2} onClick={() => go(1)}>
          <Icon name="up" size={13} />
        </button>
        <button type="button" className="icon-button" title="Later (Shift+Enter)" aria-label="Later" disabled={hits.length < 2} onClick={() => go(-1)}>
          <Icon name="down" size={13} />
        </button>
        <button type="button" className="icon-button" title="Close (Esc)" aria-label="Close" onClick={onFindClose}>
          <Icon name="close" size={13} />
        </button>
      </div>
    )}
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
        {inOrder.length > shown.length || earlier > 0 ? (
          <div className="turn">
            <button
              type="button"
              className="quiet"
              onClick={() => (inOrder.length > shown.length ? setDrawn({ at, count: reach + PAGE }) : onEarlier?.())}
            >
              Show earlier ({inOrder.length - shown.length + earlier} more)
            </button>
          </div>
        ) : null}

        {shown.map((item) => {
          const key = foldOf.get(item.id)
          const held = key === undefined ? undefined : folds.get(key)
          if (key === undefined || held === undefined) return <Turn key={item.id} item={item} going={going.has(item.id)} when={when(item)} onAnswer={onAnswer} onAgain={onAgain} onFile={onFile} onPicture={picture} onCopyAnswer={copyAnswer} onStopShell={onStopShell} onTypeShell={onTypeShell} onBackground={onBackground} />
          if (held.first !== item.id && !isOpen(key)) return null
          const open = (): void => {
            setOpened({ at, keys: new Set([...openKeys, key]) })
            if (item.kind === 'steps') onSteps?.(item)
          }
          const close = (): void => setOpened({ at, keys: new Set([...openKeys].filter((one) => one !== key)) })
          if (item.kind === 'steps') {
            const now = key === workingFold
            const loading = isOpen(key)
            return (
              <Fold
                key={item.id}
                said={`${counted(held.ids.length)}${loading ? '' : now && held.latest !== undefined ? `, ${held.latest}` : ''}`}
                icon={loading || now ? 'spinner' : 'right'}
                title={loading ? 'Hide what was done' : 'Show what was done'}
                onPress={loading ? close : open}
                images={loading ? [] : held.images}
                onPicture={picture}
              />
            )
          }
          if (!isOpen(key)) {
            const now = key === workingFold
            return (
              <Fold
                key={`fold:${key}`}
                said={`${counted(held.ids.length)}${now && held.latest !== undefined ? `, ${held.latest}` : ''}`}
                icon={now ? 'spinner' : 'right'}
                title="Show what was done"
                onPress={open}
                images={held.images}
                onPicture={picture}
              />
            )
          }
          return (
            <Fragment key={item.id}>
              {held.first === item.id ? <Fold said={counted(held.ids.length)} icon="down" title="Hide what was done" onPress={close} /> : null}
              <Turn
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
            </Fragment>
          )
        })}

        {stopped ? (
          <div className="turn">
            <button type="button" className="quiet" onClick={onContinue}>
              Continue
            </button>
          </div>
        ) : null}

        {working && items.at(-1)?.kind !== 'card' ? (
          <div className="turn">
            <div className="did" role="status" style={{ cursor: 'default' }}>
              <span className="glyph spinning">
                <Icon name="spinner" size={12} />
              </span>
              <span className="what">Still working</span>
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

        {waiting.map((item) => (
          <Turn
            key={item.id}
            item={item}
            going={false}
            when={undefined}
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
      </div>

      {preview === undefined ? null : <Preview src={preview} onClose={() => setPreview(undefined)} />}
    </div>
    </>
  )
})
