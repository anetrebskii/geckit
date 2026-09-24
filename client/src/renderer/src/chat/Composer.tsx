import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { modelName, SESSION_MODES } from '../../../shared/api'
import type { SessionMode } from '../../../shared/api'
import { mentionAt, pathsFor } from '../../../shared/paths'
import { ON_PHONE } from '../on-phone'
import { Icon } from '../ui/Icon'
import { Picker } from '../ui/Menu'
import { Chrome } from './Chrome'
import { Mcp } from './Mcp'
import { Tasks } from './Tasks'
import type { Choice } from '../ui/Menu'
import { projectName } from './project'
import type { Chat } from './useChat'

/** A path offered after @, as its name and the folder it is in. */
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

/**
 * The field a message is written in, with what it will be sent to under it.
 *
 * Whose plan is about to answer is said here and not in a settings page,
 * because here is where the question is asked.
 */
export function Composer({ chat }: { readonly chat: Chat }): React.JSX.Element {
  const field = useRef<HTMLTextAreaElement>(null)
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

  useEffect(() => {
    field.current?.focus()
  }, [chat.focusSeed])

  // Once /compact is answered, the caret is back in the field, where a no leaves what was typed.
  useEffect(() => {
    if (chat.compacting === undefined) field.current?.focus()
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
    { value: '', label: 'Default', says: 'as claude is set up' },
    ...(Array.isArray(chat.models)
      ? chat.models.map((one) => ({
          value: one.value,
          label: one.name,
          ...(one.id === undefined ? {} : { says: modelName(one.id) }),
        }))
      : [
          {
            value: '__asking',
            label: chat.models === 'asking' ? 'Asking claude...' : 'claude did not say which models it has',
          },
        ]),
  ]

  const named = Array.isArray(chat.models)
    ? (chat.models.find((one) => one.value === chat.model)?.name ?? (chat.model === '' ? 'Default' : chat.model))
    : chat.model === ''
      ? 'Default'
      : chat.model

  // Another model has no cache of this conversation, so it reads all of it again.
  const again = 'Another model reads the whole conversation again at your next message'
  const used = chat.session?.spend?.used
  const cost =
    chat.session === undefined || chat.models === 'asking' || chat.models === 'unasked'
      ? undefined
      : used === undefined
        ? `${again}.`
        : `${again}: about ${(Math.round(used / 1000) * 1000).toLocaleString('en-US')} tokens from your plan.`

  const cannot = chat.root === undefined || chat.account?.signedIn !== true || chat.account.key === true

  const { addFiles } = chat
  const goal = chat.session?.goal
  const checked =
    goal === undefined
      ? ''
      : goal.checks === 0
        ? 'Not checked yet. Each time Claude would stop, a check reads the conversation and sends it back to work until this holds.'
        : `Checked ${String(goal.checks)} ${goal.checks === 1 ? 'time' : 'times'}, and it does not hold yet${goal.reason === undefined ? '.' : `: ${goal.reason}`}`

  const queued = chat.session?.queued ?? []
  const dropped = queued.find((one) => one.id === dropping)

  return (
    <div className="composer">
      {dropped === undefined ? null : (
        <div className="dialog-scrim" onMouseDown={() => setDropping(undefined)}>
          <div className="dialog" onMouseDown={(event) => event.stopPropagation()}>
            <h2>Cancel this message?</h2>
            <p className="queued-dropped">{dropped.text}</p>
            <div className="dialog-actions">
              <button type="button" className="quiet" onClick={() => setDropping(undefined)}>
                Keep it
              </button>
              <button
                type="button"
                className="primary"
                autoFocus
                onClick={() => {
                  chat.unqueue(dropped.id)
                  setDropping(undefined)
                }}
              >
                Cancel it
              </button>
            </div>
          </div>
        </div>
      )}
      {queued.length === 0 ? null : (
        <div className="queued">
          <div className="queued-head">Queued: each goes once Claude has answered the one before</div>
          {queued.map((one) => (
            <div key={one.id} className="queued-one">
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
                  {one.text}
                </button>
              )}
              {one.images === 0 ? null : (
                <span className="queued-more">{one.images === 1 ? '1 picture' : `${String(one.images)} pictures`}</span>
              )}
              <button
                type="button"
                className="icon-button"
                aria-label="Start a new conversation with it"
                title="Start a new conversation with it, in this project, rather than wait here"
                onClick={() => chat.delegate(one.id)}
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
      )}
      <div className="composer-inner">
        {chat.pictures.length === 0 ? null : (
          <div className="pending">
            {chat.pictures.map((one, at) => (
              <span key={`${String(at)}:${one.data.slice(0, 16)}`} className="pending-one">
                <img src={`data:${one.media};base64,${one.data}`} alt="" />
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
        {found === undefined ? null : (
          <div className="mentions" role="listbox" ref={offered}>
            {found.length === 0 ? (
              <div className="empty">Nothing in {projectName(root ?? '')} by that name</div>
            ) : (
              found.map((path, index) => (
                <div
                  key={path}
                  role="option"
                  aria-selected={index === here}
                  className={`mention${index === here ? ' on' : ''}`}
                  onMouseMove={() => setAt(index)}
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
        <textarea
          ref={field}
          rows={1}
          value={chat.draft}
          placeholder={
            chat.root === undefined
              ? 'Add a project folder first'
              : ON_PHONE
                ? 'Message'
                : chat.working
                  ? 'Send more: it waits until Claude finishes. ! runs a command now'
                  : 'Ask Claude Code. @ picks a file, ! runs a command'
          }
          disabled={chat.root === undefined}
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
        <div className="composer-bar">
          <Picker
            label={SESSION_MODES.find((one) => one.mode === chat.mode)?.label ?? 'Ask'}
            choices={SESSION_MODES.map((one) => ({ value: one.mode, label: one.label, says: one.why }))}
            chosen={chat.mode}
            title="What it may do"
            explained
            onPick={(value) => chat.setMode(value as SessionMode)}
          />
          {ON_PHONE ? null : (
            <>
              <Picker
                label={named}
                choices={models}
                chosen={chat.model}
                title="Model"
                {...(cost === undefined ? {} : { note: cost })}
                onOpen={chat.askModels}
                onPick={(value) => {
                  if (value !== '__asking') chat.setModel(value)
                }}
              />
              {chat.root === undefined ? null : <Mcp root={chat.root} id={chat.session?.id} />}
              {chat.root === undefined ? null : <Chrome root={chat.root} id={chat.session?.id} />}
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
              className="picker"
              disabled={cannot}
              title="Set a goal: Claude keeps working until it holds, as /goal does"
              onClick={() => {
                const text = GOAL.test(chat.draft) ? chat.draft : `/goal ${chat.draft}`
                chat.setDraft(text)
                putCaret.current = text.length
                field.current?.focus()
              }}
            >
              Goal
            </button>
          ) : (
            <Picker
              className="picker goal-picker"
              label={
                <>
                  <span className="remote-dot" />
                  <span className="goal-text">{`Goal: ${goal.condition}`}</span>
                </>
              }
              tip={goal.condition}
              title="Goal"
              explained
              choices={[
                chat.working
                  ? { value: 'clear', label: 'Stop and clear it', says: 'Claude stops now, and goes on without a goal at your next message' }
                  : { value: 'clear', label: 'Clear it', says: 'Claude no longer works towards it' },
              ]}
              note={`Until ${goal.condition.replace(/[.\s]+$/, '')}. ${checked}`}
              onPick={() => chat.say('/goal clear')}
            />
          )}
          {chat.root !== undefined && goal === undefined && GOAL.test(chat.draft) ? (
            <span className="composer-hint">Claude keeps working until this holds. A check after each reply decides whether it does</span>
          ) : null}
          {chat.root !== undefined && chat.draft.trim().startsWith('!') ? (
            <span className="composer-hint">
              Runs in {projectName(chat.root)}. Claude sees what it prints with your next message
            </span>
          ) : null}
          <div className="spacer" />
          {chat.working && (chat.draft.trim() !== '' || chat.pictures.length > 0) ? (
            <button
              type="button"
              className="send"
              disabled={cannot}
              onClick={submit}
              title="Queue it: it goes when Claude finishes (Enter)"
              aria-label="Queue"
            >
              <Icon name="send" size={14} />
            </button>
          ) : null}
          {chat.working ? (
            <button type="button" className="send stop" onClick={chat.stop} title="Stop (Esc)" aria-label="Stop">
              <Icon name="stop" size={12} />
            </button>
          ) : (
            <button
              type="button"
              className="send"
              disabled={cannot || (chat.draft.trim() === '' && chat.pictures.length === 0)}
              onClick={submit}
              title="Send (Enter)"
              aria-label="Send"
            >
              <Icon name="send" size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
