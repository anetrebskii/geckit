import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'

import { modelName, programLine, SESSION_MODES } from '../../../shared/api'
import type { ClaudeModel, ReasoningEffort, SessionImage, SessionMode, SessionProvider } from '../../../shared/api'
import { mentionAt, pathsFor } from '../../../shared/paths'
import { dictate, dropUnheard, hearAgain, languageCode, readUnheard, useDictationLanguage, useLevel } from '../dictate'
import type { Unheard } from '../dictate'
import { ON_PHONE } from '../on-phone'
import { BARS, time, toHear, useRecorder } from '../recorder'
import { downloading, useSpeechModel } from '../speech'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { Menu, Picker } from '../ui/Menu'
import { Sheet } from '../ui/Sheet'
import { MOD } from '../ui/Shortcuts'
import { hostOf, isRemote } from '../../../shared/hosts'
import { Chrome } from './Chrome'
import { HostDot } from './HostParts'
import { Mcp } from './Mcp'
import { computerName, needsComputer } from './PhoneHosts'
import { Preview } from './Preview'
import { Tasks } from './Tasks'
import type { Choice } from '../ui/Menu'
import { projectLabel } from './project'
import { queueWhy } from './Queued'
import type { Chat } from './useChat'

/** A path offered after @, as its name and the folder it is in. */
// A queued picture is drawn as a small square and fills the screen when pressed; each size is asked for once.
const SQUARE = 44 * 3
const WHOLE = 1200
const queuedPictures = new Map<string, Promise<string | undefined>>()

function queuedPicture(session: string, queued: string, index: number, width: number): Promise<string | undefined> {
  const key = `${session}\n${queued}\n${String(index)}\n${String(width)}`
  let held = queuedPictures.get(key)
  if (held === undefined) {
    held = window.geckit.chat
      .queuedPicture(session, queued, index, width)
      .then((one: SessionImage | undefined) => (one === undefined ? undefined : `data:${one.media};base64,${one.data}`))
      .catch(() => undefined)
    queuedPictures.set(key, held)
    if (queuedPictures.size > 40) queuedPictures.delete(queuedPictures.keys().next().value ?? '')
  }
  return held
}

function QueuedPicture({
  session,
  queued,
  index,
  onLook,
}: {
  readonly session: string
  readonly queued: string
  readonly index: number
  readonly onLook: (src: string) => void
}): React.JSX.Element {
  const [src, setSrc] = useState<string>()
  useEffect(() => {
    let gone = false
    void queuedPicture(session, queued, index, SQUARE).then((got) => {
      if (!gone) setSrc(got)
    })
    return () => {
      gone = true
    }
  }, [session, queued, index])
  return (
    <button
      type="button"
      className="queued-picture"
      aria-label="See this picture"
      title="See this picture"
      onClick={() => {
        if (src !== undefined) void queuedPicture(session, queued, index, WHOLE).then((whole) => onLook(whole ?? src))
      }}
    >
      {src === undefined ? null : <img src={src} alt="" />}
    </button>
  )
}

const pictures = (count: number): string => (count === 1 ? '1 picture' : `${String(count)} pictures`)

function Offered({ path }: { readonly path: string }): React.JSX.Element {
  const folder = path.endsWith('/')
  const bare = folder ? path.slice(0, -1) : path
  const cut = bare.lastIndexOf('/')
  return (
    <>
      <Icon name={folder ? 'folder' : 'file'} size={13} />
      <span className="name">{`${bare.slice(cut + 1)}${folder ? '/' : ''}`}</span>
      <span className="in">{cut < 0 ? '' : bare.slice(0, cut)}</span>
    </>
  )
}

/** What opens the background tasks rather than going to Claude, as in a terminal. */
const TASKS = /^\s*\/(tasks|bashes)\s*$/
const GOAL = /^\s*\/goal(\s|$)/
const COMPACT = /^\s*\/compact(\s|$)/

function GoalEditor({ condition, onSave, onClear, onClose }: {
  readonly condition: string | undefined
  readonly onSave: (value: string) => void
  readonly onClear: () => void
  readonly onClose: () => void
}): React.JSX.Element {
  const [value, setValue] = useState(condition ?? '')
  useEffect(() => {
    if (ON_PHONE) return
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [onClose])
  const save = (): void => {
    const text = value.trim()
    if (text !== '') onSave(text)
  }
  const field = <textarea autoFocus className="goal-edit-field" value={value} placeholder="What should be true when this is done?" aria-label="Goal condition" onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (!ON_PHONE && event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); save() } }} />
  if (ON_PHONE) return (
    <Sheet title="Goal" onClose={onClose} cancel={false}>
      <div className="goal-edit-phone">
        {field}
        <button type="button" className="primary" disabled={value.trim() === ''} onClick={save}>Save goal</button>
        {condition === undefined ? null : <button type="button" className="quiet danger" onClick={onClear}>Clear goal</button>}
        <button type="button" className="quiet" onClick={onClose}>Cancel</button>
      </div>
    </Sheet>
  )
  return (
    <div className="dialog-scrim" onMouseDown={onClose}>
      <div className="dialog goal-editor" role="dialog" aria-label="Goal" onMouseDown={(event) => event.stopPropagation()}>
        <h2>Goal</h2>
        {field}
        <div className="dialog-actions">
          {condition === undefined ? null : <button type="button" className="quiet danger" onClick={onClear}>Clear goal</button>}
          <span className="spacer" />
          <button type="button" className="quiet" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" disabled={value.trim() === ''} onClick={save}>Save goal</button>
        </div>
      </div>
    </div>
  )
}

/**
 * The field a message is written in, with what it will be sent to under it.
 *
 * Whose plan is about to answer is said here and not in a settings page,
 * because here is where the question is asked.
 */
export function Composer({ chat }: { readonly chat: Chat }): React.JSX.Element {
  const assistant = chat.provider === 'codex' ? 'Codex' : 'Claude'
  const field = useRef<HTMLTextAreaElement>(null)
  const photos = useRef<HTMLInputElement>(null)
  const offered = useRef<HTMLDivElement>(null)
  // Where the caret is, so the @ being typed can be found; and where to put it once a path is in.
  const [caret, setCaret] = useState(0)
  const putCaret = useRef<number | undefined>(undefined)
  const [files, setFiles] = useState<{ readonly root: string; readonly paths: readonly string[] } | undefined>()
  const [at, setAt] = useState(0)
  // Escape puts the list away for the @ it was up for.
  const [closed, setClosed] = useState<number | undefined>()
  const [editing, setEditing] = useState<{ readonly id: string; readonly text: string } | undefined>()
  const [dropping, setDropping] = useState<string | undefined>()
  const [branching, setBranching] = useState<string | undefined>()
  const [editingGoal, setEditingGoal] = useState<string | undefined>()
  // The phrase a long press or a right click is on, asked about before it goes.
  const [unphrasing, setUnphrasing] = useState<{ readonly phrase: string; readonly at: DOMRect } | undefined>()
  const phraseHeld = useRef<{ timer: number; held: boolean }>({ timer: 0, held: false })
  const [listening, setListening] = useState<string | undefined>()
  const [spoken, flipSpoken] = useDictationLanguage(chat.settings.nativeLanguage, chat.settings.secondLanguage)
  const [unheard, setUnheard] = useState<string | undefined>()
  // The host writes down what was said once the mic stops, which takes a few seconds.
  const [writing, setWriting] = useState(false)
  const level = useLevel(listening !== undefined)
  // A recording said here that the host failed to write down, kept on the phone to try again.
  const [kept, setKept] = useState<Unheard | undefined>()
  const place = chat.session?.id ?? chat.root ?? ''
  const [looking, setLooking] = useState<string | undefined>()
  // Dictation on the computer: heard by whisper here, and put after what was typed.
  const [hearing, setHearing] = useState(false)
  const [micError, setMicError] = useState('')
  const model = useSpeechModel()
  const hear = async (audio: Blob): Promise<void> => {
    setHearing(true)
    try {
      const answer = await window.geckit.transcribe(await toHear(audio))
      const text = answer.text?.trim() ?? ''
      if (!answer.ok || text === '') {
        setMicError(answer.error ?? 'Nothing was heard')
        return
      }
      const typed = chat.draft.trimEnd()
      const next = typed === '' ? text : `${typed} ${text}`
      chat.setDraft(next)
      putCaret.current = next.length
      setCaret(next.length)
    } catch (error) {
      setMicError(error instanceof Error ? error.message : String(error))
    } finally {
      setHearing(false)
      field.current?.focus()
    }
  }
  const recorder = useRecorder(chat.settings.microphoneDeviceId, (audio) => void hear(audio))
  const { cancel: dropRecording } = recorder
  // The microphone's own error, until it is closed.
  const [closedError, setClosedError] = useState('')
  const problem = micError !== '' ? micError : recorder.error !== closedError ? recorder.error : ''
  useEffect(() => () => dropRecording(), [dropRecording, chat.session?.id])
  const record = (): void => {
    if (recorder.recording) {
      recorder.stop()
      return
    }
    setMicError('')
    recorder.start()
    field.current?.focus()
  }
  const submit = (): void => {
    if (COMPACT.test(chat.draft)) {
      chat.setCompacting('typed')
      return
    }
    if (!TASKS.test(chat.draft)) {
      chat.send()
      return
    }
    chat.setDraft('')
    chat.showTasks(true)
  }

  // What Up brings back, newest first: what was said in this conversation, and the commands typed after !.
  const said = useMemo(() => {
    const all: string[] = []
    for (const item of chat.items) {
      const text = item.kind === 'mine' ? item.text : item.kind === 'shell' ? `!${item.command}` : ''
      if (text.trim() !== '' && all.at(-1) !== text) all.push(text)
    }
    return all.reverse()
  }, [chat.items])
  // How far back Up has gone, and what was in the field before it did, which Down past the newest puts back.
  const recall = useRef<{ readonly at: number; readonly kept: string } | undefined>(undefined)
  useEffect(() => {
    recall.current = undefined
  }, [chat.shown])

  const root = chat.root
  const mention = root === undefined ? undefined : mentionAt(chat.draft, caret)
  const mentioning = mention !== undefined && mention.from !== closed
  const found = mentioning && files !== undefined && files.root === root ? pathsFor(files.paths, mention.asked) : undefined
  const here = Math.min(at, Math.max(0, (found?.length ?? 0) - 1))

  // Asked again whenever an @ is begun, so a file written since is there.
  useEffect(() => {
    if (!mentioning || root === undefined) return
    let current = true
    void window.geckit.chat.files(root).then((paths) => {
      if (current) setFiles({ root, paths })
    })
    return () => {
      current = false
    }
  }, [mentioning, root])

  useEffect(() => {
    offered.current?.querySelector('.on')?.scrollIntoView({ block: 'nearest' })
  }, [here])

  const put = (path: string): void => {
    if (mention === undefined) return
    const before = chat.draft.slice(0, mention.from)
    // A folder is left open, so what is in it is offered next.
    const said = `@${path}${path.endsWith('/') ? '' : ' '}`
    chat.setDraft(`${before}${said}${chat.draft.slice(caret)}`)
    putCaret.current = before.length + said.length
    setCaret(before.length + said.length)
    setAt(0)
  }

  // On the phone a focused field is a keyboard over half the conversation, so it waits for a tap.
  useEffect(() => {
    if (!ON_PHONE) field.current?.focus()
  }, [chat.focusSeed])

  // Once /compact is answered, the caret is back in the field, where a no leaves what was typed.
  useEffect(() => {
    if (chat.compacting === undefined && !ON_PHONE) field.current?.focus()
  }, [chat.compacting])

  useLayoutEffect(() => {
    const area = field.current
    if (area === null) return
    area.style.height = '0px'
    // Over the board the conversation is put away between openings, and a field
    // that is not on the screen measures nothing. Left to itself it stands one
    // line high, which is what it is measured to anyway.
    const wanted = area.scrollHeight
    area.style.height = wanted === 0 ? '' : `${String(Math.min(wanted, 260))}px`
    if (putCaret.current !== undefined) {
      area.setSelectionRange(putCaret.current, putCaret.current)
      putCaret.current = undefined
    }
  }, [chat.draft, chat.shown])

  const models: readonly Choice[] = [
    { value: '', label: 'Default', says: `as ${chat.provider} is set up` },
    ...(Array.isArray(chat.models)
      ? chat.models.map((one) =>
          one.disabled === true
            ? { value: one.value, label: one.name, disabled: true, ...(one.says === undefined ? {} : { says: one.says }) }
            : { value: one.value, label: one.name, ...(one.id === undefined ? {} : { says: modelName(one.id) }) },
        )
      : [
          {
            value: '__asking',
            label: chat.models === 'asking' ? `Asking ${chat.provider}...` : `${chat.provider} did not say which models it has`,
          },
        ]),
  ]

  const named = Array.isArray(chat.models)
    ? (chat.models.find((one) => one.value === chat.model)?.name ?? (chat.model === '' ? 'Default' : chat.model))
    : chat.model === ''
      ? 'Default'
      : chat.model

  const catalog: readonly ClaudeModel[] | undefined = Array.isArray(chat.models) ? chat.models : undefined
  const reasoningModel = catalog?.find((one) => one.value === (chat.model || chat.session?.model)) ?? catalog?.find((one) => one.isDefault)
  const defaultEffort = reasoningModel?.defaultReasoning
  const efforts: readonly Choice[] = [{ value: '', label: defaultEffort === undefined ? 'Default' : `Default (${defaultEffort === 'xhigh' ? 'Extra high' : defaultEffort.charAt(0).toUpperCase() + defaultEffort.slice(1)})` }, ...(reasoningModel?.reasoning ?? []).map((one) => ({ value: one.value, label: one.value === 'xhigh' ? 'Extra high' : one.value.charAt(0).toUpperCase() + one.value.slice(1), says: one.says }))]

  // On a host it is that host's Claude Code that answers, not this computer's, so only its connection decides.
  const host = chat.root === undefined ? undefined : chat.hosts.find((one) => one.id === hostOf(chat.root ?? ''))

  // Another model has no cache of this conversation, so it reads all of it again.
  const again = 'Another model reads the whole conversation again at your next message'
  const used = chat.session?.spend?.used
  const cost =
    chat.session === undefined || chat.models === 'asking' || chat.models === 'unasked'
      ? undefined
      : used === undefined
        ? `${again}.`
        : `${again}: about ${(Math.round(used / 1000) * 1000).toLocaleString('en-US')} tokens from your plan.`
  // Which Claude Code named these: this computer's for a local project, that host's for one on a host, since an older one names fewer.
  const program = host === undefined ? programLine(chat.account) : host.version === undefined ? undefined : `Claude Code ${host.version}`
  const note = [program === undefined ? undefined : `${program}.`, cost].filter((line) => line !== undefined).join('\n')
  const away =
    host === undefined
      ? undefined
      : host.state === 'lost'
        ? `Reconnecting to ${host.name}`
        : host.state === 'needs' || host.state === 'missing' || host.state === 'signin'
          ? `${host.name} needs you, above`
          : host.state === 'connecting'
            ? `Connecting to ${host.name}`
            : undefined
  // The phone has no room in the field for the words, so there the buttons stay, held, and the words go on a line over it.
  const held = ON_PHONE && away !== undefined
  const shownAway = held ? undefined : away
  const cannot =
    (chat.provider === 'codex' && chat.root !== undefined && isRemote(chat.root)) ||
    held ||
    chat.uploading ||
    chat.root === undefined ||
    (host === undefined && isRemote(chat.root)) ||
    (host === undefined && (chat.account?.here === false || chat.account?.signedIn === false || chat.account?.key === true))

  const { addFiles } = chat

  // What is said goes after what was typed, and replaces itself as iOS hears it better.
  const lookKept = (): void => void readUnheard().then((one) => setKept(one?.place === place ? one : undefined))
  useEffect(lookKept, [place])
  const failed = (error: unknown): void => {
    setUnheard(error instanceof Error ? error.message : String(error))
    lookKept()
  }
  const listen = (goOn = false): void => {
    const ears = dictate()
    if (ears === undefined) return
    if (listening !== undefined) {
      setListening(undefined)
      setWriting(!ears.live)
      ears
        .stop()
        .then(() => setKept(undefined))
        .catch(failed)
        .finally(() => setWriting(false))
      return
    }
    const typed = chat.draft.trimEnd()
    setUnheard(undefined)
    setListening(spoken)
    tap('light')
    ears
      .start(spoken, (text) => chat.setDraft(typed === '' ? text : `${typed} ${text}`), () => setListening(undefined), place, goOn)
      .catch((error: unknown) => {
        setListening(undefined)
        setUnheard(error instanceof Error ? error.message : String(error))
      })
  }
  useEffect(() => () => dictate()?.cancel(), [chat.session?.id])
  const tryAgain = (): void => {
    const typed = chat.draft.trimEnd()
    setUnheard(undefined)
    setWriting(true)
    hearAgain()
      .then((text) => {
        setKept(undefined)
        if (text !== '') chat.setDraft(typed === '' ? text : `${typed} ${text}`)
      })
      .catch(failed)
      .finally(() => setWriting(false))
  }
  const goal = chat.session?.goal
  const command = chat.root !== undefined && chat.draft.trim().startsWith('!')
  // A first message, or one to a conversation not working, waits in the queue where as many are working as the limit allows.
  const idle = chat.shown.kind !== 'session' || (chat.session !== undefined && chat.session.state !== 'working' && chat.session.state !== 'asks')
  const queues = !command && idle && ((chat.full && chat.session?.question !== true) || (chat.session?.queued?.length ?? 0) > 0)
  const checked =
    goal === undefined
      ? ''
      : chat.provider === 'codex'
        ? 'Codex keeps working until this holds.'
        : goal.checks === 0
          ? 'Not checked yet. Each time Claude would stop, a check reads the conversation and sends it back to work until this holds.'
        : `Checked ${String(goal.checks)} ${goal.checks === 1 ? 'time' : 'times'}, and it does not hold yet${goal.reason === undefined ? '.' : `: ${goal.reason}`}`

  const queued = chat.session?.queued ?? []
  const session = chat.session?.id
  const phrases = chat.settings.phrases.filter((one) => one.trim() !== '')
  const draft = chat.draft.trim()
  // Each press adds its phrase on a line of its own, so a few presses make the message.
  const addPhrase = (phrase: string): void => {
    const text = draft === '' ? phrase.trim() : `${chat.draft.trimEnd()}\n${phrase.trim()}`
    chat.setDraft(text)
    putCaret.current = text.length
    setCaret(text.length)
    if (!ON_PHONE) field.current?.focus()
  }
  const keepable = draft !== '' && !draft.includes('\n') && !phrases.some((one) => one.trim() === draft)
  const dropped = queued.find((one) => one.id === dropping)
  const branched = queued.find((one) => one.id === branching)

  return (
    <div className="composer">
      {chat.session !== undefined && editingGoal === chat.session.id ? <GoalEditor condition={goal?.condition} onSave={(value) => { if (value !== goal?.condition) chat.say(`/goal ${value}`); setEditingGoal(undefined) }} onClear={() => { chat.say('/goal clear'); setEditingGoal(undefined) }} onClose={() => setEditingGoal(undefined)} /> : null}
      {dropped === undefined ? null : ON_PHONE ? (
        <Sheet title="Cancel this message?" onClose={() => setDropping(undefined)} cancel={false}>
          <p className="branch-quote">{dropped.text}</p>
          <div className="sheet-list">
            <button
              type="button"
              className="sheet-option danger"
              onClick={() => {
                chat.unqueue(dropped.id)
                setDropping(undefined)
              }}
            >
              <span className="sheet-words">
                <span className="label">Cancel message</span>
                <span className="says">It will not be sent</span>
              </span>
            </button>
          </div>
          <div className="sheet-list sheet-keep">
            <button type="button" className="sheet-option sheet-cancel" onClick={() => setDropping(undefined)}>
              Keep it
            </button>
          </div>
        </Sheet>
      ) : (
        <div className="dialog-scrim" onMouseDown={() => setDropping(undefined)}>
          <div className="dialog" onMouseDown={(event) => event.stopPropagation()}>
            <h2>Cancel this message?</h2>
            <p className="branch-quote">{dropped.text}</p>
            <div className="dialog-actions">
              <button type="button" className="quiet" onClick={() => setDropping(undefined)}>
                Keep it
              </button>
              <button
                type="button"
                className="primary danger"
                autoFocus
                title="It will not be sent"
                onClick={() => {
                  chat.unqueue(dropped.id)
                  setDropping(undefined)
                }}
              >
                Cancel message
              </button>
            </div>
          </div>
        </div>
      )}
      {branched === undefined ? null : ON_PHONE ? (
        <Sheet title="Start a new conversation" onClose={() => setBranching(undefined)}>
          <p className="branch-quote">{branched.text}</p>
          <div className="sheet-list">
            <button
              type="button"
              className="sheet-option"
              onClick={() => {
                chat.delegate(branched.id, true)
                setBranching(undefined)
              }}
            >
              <span className="sheet-words">
                <span className="label">Copy this conversation</span>
                <span className="says">Everything up to when you queued it</span>
              </span>
            </button>
            <button
              type="button"
              className="sheet-option"
              onClick={() => {
                chat.delegate(branched.id, false)
                setBranching(undefined)
              }}
            >
              <span className="sheet-words">
                <span className="label">Start empty</span>
                <span className="says">Only this message, in the same project</span>
              </span>
            </button>
          </div>
        </Sheet>
      ) : (
        <div className="dialog-scrim" onMouseDown={() => setBranching(undefined)}>
          <div className="dialog" onMouseDown={(event) => event.stopPropagation()}>
            <h2>Start a new conversation with it?</h2>
            <p className="branch-quote">{branched.text}</p>
            <div className="branch-choices">
              <button
                type="button"
                className="branch-choice"
                autoFocus
                onClick={() => {
                  chat.delegate(branched.id, true)
                  setBranching(undefined)
                }}
              >
                <Icon name="copy" size={16} />
                <span className="sheet-words">
                  <span className="label">Copy this conversation</span>
                  <span className="says">Everything up to when you queued it, then this message</span>
                </span>
              </button>
              <button
                type="button"
                className="branch-choice"
                onClick={() => {
                  chat.delegate(branched.id, false)
                  setBranching(undefined)
                }}
              >
                <Icon name="plus" size={16} />
                <span className="sheet-words">
                  <span className="label">Start empty</span>
                  <span className="says">Only this message, in the same project</span>
                </span>
              </button>
            </div>
            <div className="dialog-actions">
              <button type="button" className="quiet" onClick={() => setBranching(undefined)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {queued.length === 0 ? null : (
        <div className="queued">
          <div className="queued-head">
            {queued.length === 1 ? '1 queued' : `${String(queued.length)} queued`}
            {chat.session?.waits === true
              ? `, waiting for a slot: ${String(chat.lineup.working)} of ${String(chat.lineup.limit)} conversations working, the limit in Settings. The first goes when one of them stops`
              : `, each sent once ${assistant} answers the one before`}
          </div>
          <div className="queued-list">
          {queued.map((one) => (
            <div key={one.id} className="queued-one">
              {session === undefined
                ? null
                : Array.from({ length: Math.min(one.images, 3) }, (_none, index) => (
                    <QueuedPicture key={index} session={session} queued={one.id} index={index} onLook={setLooking} />
                  ))}
              {editing?.id === one.id ? (
                <textarea
                  className="queued-edit"
                  value={editing.text}
                  autoFocus
                  rows={1}
                  ref={(box) => {
                    if (box === null) return
                    box.style.height = 'auto'
                    box.style.height = `${String(box.scrollHeight)}px`
                  }}
                  onChange={(event) => setEditing({ id: one.id, text: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setEditing(undefined)
                    if (event.key !== 'Enter' || event.shiftKey) return
                    event.preventDefault()
                    setEditing(undefined)
                    chat.requeue(one.id, editing.text)
                  }}
                  onBlur={() => {
                    setEditing(undefined)
                    chat.requeue(one.id, editing.text)
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="queued-text"
                  title="Press to say it in other words"
                  onClick={() => setEditing({ id: one.id, text: one.text })}
                >
                  {one.text === '' ? <span className="queued-bare">{pictures(one.images)}</span> : one.text}
                </button>
              )}
              {one.images <= 3 ? null : <span className="queued-more">+{String(one.images - 3)}</span>}
              <button
                type="button"
                className="icon-button"
                aria-label="Start a new conversation with it"
                title="Start a new conversation with it, in this project, rather than wait here"
                onClick={() => setBranching(one.id)}
              >
                <Icon name="branch" size={12} />
              </button>
              <button
                type="button"
                className="icon-button"
                aria-label="Cancel this message"
                title="Cancel: it will not be sent"
                onClick={() => setDropping(one.id)}
              >
                <Icon name="close" size={11} />
              </button>
            </div>
          ))}
          </div>
        </div>
      )}
      {chat.root === undefined || (phrases.length === 0 && !keepable) ? null : (
        <div className="phrases">
          {phrases.map((phrase, at) => (
            <button
              key={at}
              type="button"
              className="phrase"
              title="Add to the message. Hold or right-click to remove it"
              onContextMenu={(event) => {
                event.preventDefault()
                setUnphrasing({ phrase, at: event.currentTarget.getBoundingClientRect() })
              }}
              onPointerDown={(event) => {
                const at = event.currentTarget.getBoundingClientRect()
                phraseHeld.current.held = false
                phraseHeld.current.timer = window.setTimeout(() => {
                  phraseHeld.current.held = true
                  tap('light')
                  setUnphrasing({ phrase, at })
                }, 450)
              }}
              onPointerUp={() => window.clearTimeout(phraseHeld.current.timer)}
              onPointerLeave={() => window.clearTimeout(phraseHeld.current.timer)}
              onClick={() => {
                if (!phraseHeld.current.held) addPhrase(phrase)
              }}
            >
              {phrase}
            </button>
          ))}
          {keepable ? (
            <button
              type="button"
              className="phrase keep"
              aria-label="Keep as a phrase"
              title="Keep what is typed as a phrase, one press away. Settings, Phrases changes or removes it"
              onClick={() => chat.change({ phrases: [...chat.settings.phrases, draft] })}
            >
              <Icon name="plus" size={11} />
            </button>
          ) : null}
        </div>
      )}
      {unphrasing === undefined ? null : (
        <Menu
          anchor={unphrasing.at}
          title={`Remove "${unphrasing.phrase}"?`}
          choices={[{ value: 'remove', label: 'Remove phrase', says: 'Only the button goes; nothing sent is changed', danger: true }]}
          onPick={() => chat.change({ phrases: chat.settings.phrases.filter((one) => one !== unphrasing.phrase) })}
          onClose={() => setUnphrasing(undefined)}
        />
      )}
      <div className={command ? 'composer-inner command' : 'composer-inner'}>
        {chat.pictures.length === 0 ? null : (
          <div className="pending">
            {chat.pictures.map((one, at) => (
              <span key={`${String(at)}:${one.data.slice(0, 16)}`} className="pending-one">
                <img src={`data:${one.media};base64,${one.data}`} alt="" onClick={() => setLooking(`data:${one.media};base64,${one.data}`)} />
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Take this picture off"
                  title="Take this picture off"
                  onClick={() => chat.dropPicture(at)}
                >
                  <Icon name="close" size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        {looking === undefined ? null : <Preview src={looking} onClose={() => setLooking(undefined)} />}
        {found === undefined ? null : (
          <div className="mentions" role="listbox" ref={offered}>
            {found.length === 0 ? (
              <div className="empty">Nothing in {projectLabel(root ?? '')} by that name</div>
            ) : (
              found.map((path, index) => (
                <div
                  key={path}
                  role="option"
                  aria-selected={index === here}
                  className={`mention${index === here ? ' on' : ''}`}
                  // Drawn at once, rather than left to React for later, so the choice keeps up with the pointer.
                  onMouseMove={() => {
                    if (index !== here) flushSync(() => setAt(index))
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault()
                    put(path)
                  }}
                >
                  <Offered path={path} />
                </div>
              ))
            )}
          </div>
        )}
        {ON_PHONE ? (
          <>
            <button
              type="button"
              className="photo-pick"
              disabled={chat.root === undefined}
              aria-label="Add a photo"
              onClick={() => photos.current?.click()}
            >
              <Icon name="photo" size={18} />
            </button>
            <input
              ref={photos}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                addFiles([...(event.target.files ?? [])])
                event.target.value = ''
              }}
            />
          </>
        ) : null}
        <textarea
          ref={field}
          rows={1}
          value={chat.draft}
          placeholder={
            chat.root === undefined
              ? 'Add a project folder first'
              : ON_PHONE
                ? listening !== undefined
                  ? `Listening in ${listening}`
                  : writing
                    ? 'Writing down what you said'
                    : (unheard ?? (chat.working ? 'Queue a message, or ! and a command' : 'Message, or ! and a command'))
                : recorder.recording
                  ? 'Listening'
                  : hearing
                    ? 'Writing down what you said'
                    : chat.working
                  ? `Send more: it waits until ${assistant} finishes. ! runs a command now`
                  : `Ask ${chat.provider === 'codex' ? 'Codex' : 'Claude Code'}. @ picks a file, ! runs a command`
          }
          disabled={chat.root === undefined}
          readOnly={listening !== undefined || writing || recorder.recording || hearing}
          onChange={(event) => {
            recall.current = undefined
            chat.setDraft(event.target.value)
            setCaret(event.target.selectionStart)
            setAt(0)
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onPaste={(event) => {
            const files = [...event.clipboardData.files]
            if (files.length === 0) return
            event.preventDefault()
            addFiles(files)
          }}
          onKeyDown={(event) => {
            if (recorder.recording && (event.key === 'Enter' || event.key === 'Escape')) {
              event.preventDefault()
              event.stopPropagation()
              if (event.key === 'Enter') recorder.stop()
              else recorder.cancel()
              return
            }
            if (found !== undefined && mention !== undefined) {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                setAt(event.key === 'ArrowDown' ? Math.min(here + 1, found.length - 1) : Math.max(here - 1, 0))
                return
              }
              const path = found[here]
              if ((event.key === 'Enter' || event.key === 'Tab') && path !== undefined) {
                event.preventDefault()
                put(path)
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                setClosed(mention.from)
                return
              }
            }
            // Up on the first line goes back through what was said, and Down on the last comes forward again.
            if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.shiftKey && !event.altKey && !event.metaKey) {
              const area = event.currentTarget
              const up = event.key === 'ArrowUp'
              const edge =
                area.selectionStart === area.selectionEnd &&
                !(up ? area.value.slice(0, area.selectionStart) : area.value.slice(area.selectionEnd)).includes('\n')
              const next = up ? (recall.current?.at ?? -1) + 1 : (recall.current?.at ?? 0) - 1
              if (edge && (up ? next < said.length : recall.current !== undefined)) {
                event.preventDefault()
                const kept = recall.current?.kept ?? chat.draft
                const text = next < 0 ? kept : (said[next] ?? kept)
                recall.current = next < 0 ? undefined : { at: next, kept }
                chat.setDraft(text)
                putCaret.current = text.length
                setCaret(text.length)
                return
              }
            }
            if (event.key !== 'Enter' || event.shiftKey) return
            event.preventDefault()
            // While Claude works a message waits its turn; a command after ! runs at once, as the terminal lets it.
            submit()
          }}
        />
        {ON_PHONE || (!recorder.recording && !hearing && problem === '') ? null : (
          <div className={problem !== '' && !recorder.recording && !hearing ? 'dictating failed' : 'dictating'}>
            {recorder.recording ? (
              <>
                <span className="dictating-dot" />
                <span className="bars">
                  {Array.from({ length: BARS }, (_one, index) => (
                    <span key={index} style={{ height: 4 + (recorder.levels[index] ?? 0) * 14 }} />
                  ))}
                </span>
                <span className="dictating-time">{time(recorder.elapsed)}</span>
                <span>Recording. Enter puts it in the field, Esc drops it</span>
              </>
            ) : hearing ? (
              <>
                <Icon name="spinner" size={12} className="spinning" />
                <span>{model?.state === 'downloading' ? `${downloading(model)}. It is written down once that is done` : 'Writing down what you said'}</span>
              </>
            ) : (
              <span>{problem}</span>
            )}
            <div className="spacer" />
            {hearing ? null : (
              <button
                type="button"
                className="icon-button"
                aria-label={recorder.recording ? 'Drop the recording' : 'Close'}
                title={recorder.recording ? 'Drop the recording (Esc)' : 'Close'}
                onClick={() => {
                  if (recorder.recording) recorder.cancel()
                  setMicError('')
                  setClosedError(recorder.error)
                  field.current?.focus()
                }}
              >
                <Icon name="close" size={12} />
              </button>
            )}
          </div>
        )}
        <div className="composer-bar">
          {!chat.showProviders ? null : (
            <Picker label={chat.provider === 'codex' ? 'Codex' : 'Claude Code'} title="Assistant" chosen={chat.provider} disabled={chat.session !== undefined} choices={[{ value: 'claude', label: 'Claude Code' }, { value: 'codex', label: 'Codex', disabled: chat.root !== undefined && isRemote(chat.root), says: ON_PHONE ? 'Your ChatGPT plan, on the paired host' : 'Your ChatGPT plan, on this computer' }]} onPick={(value) => chat.setProvider(value as SessionProvider)} />
          )}
          <Picker
            label={SESSION_MODES.find((one) => one.mode === chat.mode)?.label ?? 'Ask'}
            choices={SESSION_MODES.map((one) => ({ value: one.mode, label: one.label, says: chat.provider === 'codex' ? one.mode === 'manual' ? 'Asks before running untrusted commands. Uses a sandbox.' : one.mode === 'auto' ? 'Works in a sandbox. Codex reviews requests for more access.' : 'Reads and proposes. Changes nothing.' : one.why }))}
            chosen={chat.mode}
            title="What it may do"
            explained
            onPick={(value) => chat.setMode(value as SessionMode)}
          />
          <Picker
            label={named}
            choices={models}
            chosen={chat.model}
            title="Model"
            {...(note === '' ? {} : { note })}
            onOpen={() => chat.askModels()}
            onPick={(value) => {
              if (value !== '__asking') chat.setModel(value)
            }}
          />
          {chat.provider !== 'codex' ? null : <Picker label={`Reasoning: ${efforts.find((one) => one.value === chat.reasoning)?.label ?? 'Default'}`} choices={efforts} chosen={chat.reasoning} title="Reasoning level for the next message" onOpen={() => chat.askModels()} onPick={(value) => chat.setReasoning(value as ReasoningEffort | '')} />}
          {ON_PHONE || chat.provider === 'codex' ? null : (
            <>
              {chat.root === undefined ? null : <Mcp root={chat.root} id={chat.session?.id} />}
              {chat.root === undefined ? null : host === undefined ? (
                <Chrome
                  root={chat.root}
                  id={chat.session?.id}
                  names={chat.settings.browserNames}
                  onName={(browser, name) => {
                    const others = Object.entries(chat.settings.browserNames).filter(([one]) => one !== browser)
                    chat.change({ browserNames: Object.fromEntries(name === undefined ? others : [...others, [browser, name]]) })
                  }}
                />
              ) : (
                <button type="button" className="picker" disabled title={`Chrome is on this computer, and this conversation runs on ${host.name}`}>
                  Chrome
                </button>
              )}
            </>
          )}
          <Tasks
            session={chat.session?.id}
            tasks={chat.session?.tasks ?? []}
            open={chat.tasksShown}
            onOpen={() => chat.showTasks(true)}
            onClose={() => chat.showTasks(false)}
            onStop={chat.stopTask}
            onClear={chat.clearTask}
          />
          {chat.root === undefined ? null : goal === undefined ? (
            <button
              type="button"
              className="picker goal-control"
              disabled={cannot || chat.session === undefined}
              title="Set a goal"
              onClick={() => setEditingGoal(chat.session?.id)}
            >
              Goal
            </button>
          ) : (
            <button type="button" className="picker goal-picker goal-control" title={`Until ${goal.condition.replace(/[.\s]+$/, '')}. ${checked}`} onClick={() => setEditingGoal(chat.session?.id)}>
              <span className="remote-dot" />
              <span className="goal-text">{`Goal: ${goal.condition}`}</span>
              <Icon name="down" size={11} />
            </button>
          )}
          {chat.root !== undefined && goal === undefined && GOAL.test(chat.draft) ? (
            <span className="composer-hint">{assistant} keeps working until this holds</span>
          ) : null}
          {queues ? <span className="composer-hint">{queueWhy(chat.lineup)}</span> : null}
          {command ? (
            <span className="composer-hint command">
              Runs in {projectLabel(chat.root)}. {assistant} sees what it prints with your next message
            </span>
          ) : null}
          {ON_PHONE && kept !== undefined && listening === undefined && !writing ? (
            <Picker
              label="Not written down"
              title="What you said"
              explained
              note={kept.why}
              choices={[
                { value: 'again', label: 'Try again', says: 'The host writes down the same recording once more' },
                ...(dictate()?.live === false ? [{ value: 'on', label: 'Go on recording', says: 'What you say next is added to it, and both are written down together' }] : []),
                { value: 'drop', label: 'Drop the recording', says: 'What was said is lost', danger: true },
              ]}
              onPick={(value) => {
                if (value === 'again') tryAgain()
                else if (value === 'on') listen(true)
                else {
                  setKept(undefined)
                  setUnheard(undefined)
                  void dropUnheard()
                }
              }}
            />
          ) : null}
          <div className="spacer" />
          {shownAway === undefined ? null : (
            <span className={`host-waiting ${host?.state ?? ''}`}>
              {host === undefined ? null : <HostDot state={host.state} />}
              {away}
            </span>
          )}
          {ON_PHONE || shownAway !== undefined ? null : (
            <button
              type="button"
              className={recorder.recording ? 'icon-button dictate-mic on' : 'icon-button dictate-mic'}
              disabled={chat.root === undefined || hearing}
              onClick={record}
              title={recorder.recording ? 'Put it in the field (Enter)' : 'Dictate'}
              aria-label={recorder.recording ? 'Stop dictating' : 'Dictate'}
            >
              <Icon name={recorder.recording ? 'check' : 'mic'} size={15} />
            </button>
          )}
          {shownAway !== undefined ? null : chat.working && listening === undefined && (chat.draft.trim() !== '' || chat.pictures.length > 0) ? (
            <button
              type="button"
              className="send"
              disabled={cannot}
              onClick={submit}
              title={`Queue it: it goes when ${assistant} finishes (Enter)`}
              aria-label="Queue"
            >
              <Icon name="send" size={14} />
            </button>
          ) : null}
          {/* The phone has room for one round button in the field: typed text makes it Queue, and while Claude works an empty field makes it Stop. */}
          {/* Otherwise an empty field offers dictation in the send button's place, as Messages does. */}
          {/* Beside the mic, the language it listens in: a press switches to the other of the two in Settings, and it stays so. */}
          {/* With a picture attached, or Stop in the round button, the mic and language sit to its left, so words can still be said. */}
          {shownAway !== undefined ? null : ON_PHONE && dictate()?.live === true && listening === undefined && chat.draft.trim() === '' ? (
            <button type="button" className={chat.pictures.length > 0 || chat.working ? 'spoken beside' : 'spoken'} onClick={flipSpoken} aria-label={`Dictating in ${spoken}. Switch language`}>
              {languageCode(spoken)}
            </button>
          ) : null}
          {shownAway !== undefined ? null : ON_PHONE && dictate() !== undefined && listening === undefined && chat.draft.trim() === '' && (chat.pictures.length > 0 || chat.working) ? (
            <button type="button" className="send mic beside" disabled={cannot || writing} onClick={() => listen()} aria-label={`Dictate in ${spoken}`}>
              <Icon name="mic" size={16} />
            </button>
          ) : null}
          {shownAway !== undefined ? null : ON_PHONE && dictate() !== undefined && (listening !== undefined || (chat.draft.trim() === '' && chat.pictures.length === 0 && !chat.working)) ? (
            <button
              type="button"
              className={listening !== undefined ? 'send listening' : 'send'}
              style={{ '--level': level } as React.CSSProperties}
              disabled={cannot || writing}
              onClick={() => listen()}
              aria-label={listening !== undefined ? 'Stop dictating' : `Dictate in ${spoken}`}
            >
              <Icon name={writing ? 'spinner' : listening !== undefined ? 'stop' : 'mic'} size={listening !== undefined ? 12 : 16} />
            </button>
          ) : chat.working && ON_PHONE && (chat.draft.trim() !== '' || chat.pictures.length > 0) ? null : chat.working ? (
            <button type="button" className="send stop" onClick={chat.stop} title={chat.settings.chatView === 'board' ? `Stop (${MOD}+.)` : `Stop (Esc, ${MOD}+.)`} aria-label="Stop">
              <Icon name="stop" size={12} />
            </button>
          ) : (
            <button
              type="button"
              className="send"
              disabled={cannot || (chat.draft.trim() === '' && chat.pictures.length === 0)}
              onClick={submit}
              title={queues ? 'Queue (Enter)' : 'Send (Enter)'}
              aria-label={queues ? 'Queue' : 'Send'}
            >
              <Icon name="send" size={14} />
            </button>
          )}
        </div>
        {/* The chip row has no room for the hint, so on the phone it has a line of its own over the field. */}
        {held && host !== undefined ? (
          <div className="phone-hint away">
            {host.state === 'lost'
              ? `${host.name} is out of reach. What is typed stays until it is back`
              : host.state === 'connecting'
                ? away
                : needsComputer(host, chat.prompts)
                  ? `${host.name} needs you on ${computerName()}${host.problem === undefined ? '.' : `: ${host.problem}`}`
                  : `${host.name} needs you`}
          </div>
        ) : ON_PHONE && command ? (
          <div className="phone-hint command">Runs in {projectLabel(chat.root)} now. Claude sees what it prints with your next message</div>
        ) : ON_PHONE && queues ? (
          <div className="phone-hint">{queueWhy(chat.lineup)}</div>
        ) : ON_PHONE && chat.working && (draft !== '' || chat.pictures.length > 0) ? (
          <div className="phone-hint">Waits its turn: it goes once Claude has answered</div>
        ) : null}
      </div>
    </div>
  )
}
