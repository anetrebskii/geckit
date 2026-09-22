import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { BackgroundTask, TaskOutput } from '../../../shared/api'
import { Icon } from '../ui/Icon'
import { Code } from './Code'
import { Prose } from './Prose'

/** The sections of the terminal's `/tasks`, in its order, under the words this window uses. */
const GROUPS: readonly { readonly title: string; readonly kind: string }[] = [
  { title: 'Commands', kind: 'local_bash' },
  { title: 'Watches', kind: 'monitor' },
  { title: 'Helpers', kind: 'local_agent' },
  { title: 'Helpers in the cloud', kind: 'remote_agent' },
  { title: 'Workflows', kind: 'local_workflow' },
]

/** How much of a helper's conversation is shown, the last of it, as the terminal shows its recent messages. */
const RECENT = 12

const running = (task: BackgroundTask): boolean => task.status === 'running'

/** How long something ran, as short as a row allows: 12s, 3m 4s, 1h 2m. */
function lasted(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  if (seconds < 60) return `${String(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${String(minutes)}m ${String(seconds % 60)}s`
  return `${String(Math.floor(minutes / 60))}h ${String(minutes % 60)}m`
}

function standing(task: BackgroundTask, stopping: boolean): string {
  if (running(task)) return stopping ? 'Stopping' : 'Running'
  if (task.status === 'stopped') return 'Stopped'
  const code = task.exit === undefined || task.exit === 0 ? '' : `, exit code ${String(task.exit)}`
  return `${task.status === 'failed' ? 'Failed' : 'Finished'}${code}`
}

function Glyph({ task }: { readonly task: BackgroundTask }): React.JSX.Element {
  if (running(task)) {
    return (
      <span className="glyph spinning">
        <Icon name="spinner" size={11} />
      </span>
    )
  }
  const name = task.status === 'completed' ? 'check' : task.status === 'failed' ? 'close' : 'stop'
  return (
    <span className={`glyph ${task.status}`}>
      <Icon name={name} size={11} />
    </span>
  )
}

/** The time, told again every second while something runs. */
function useNow(ticking: boolean): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!ticking) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [ticking])
  return now
}

/**
 * What Claude Code has in the background for the conversation, as `/tasks`
 * has it in a terminal. A button under the field while there is any, and a
 * dialog with each one by kind, where one is opened to read what it printed,
 * stopped while it runs, and cleared once it has ended.
 */
export function Tasks({
  session,
  tasks,
  open,
  onOpen,
  onClose,
  onStop,
  onClear,
}: {
  readonly session: string | undefined
  readonly tasks: readonly BackgroundTask[]
  readonly open: boolean
  readonly onOpen: () => void
  readonly onClose: () => void
  readonly onStop: (task: string) => void
  readonly onClear: (task: string) => void
}): React.JSX.Element {
  const count = tasks.filter(running).length
  return (
    <>
      {tasks.length === 0 ? null : (
        <button
          type="button"
          className="picker"
          title="What Claude Code has in the background. Typing /tasks opens it too"
          onClick={onOpen}
        >
          {count > 0 ? `${String(count)} in the background` : `${String(tasks.length)} finished in the background`}
        </button>
      )}
      {open ? <Background session={session} tasks={tasks} onClose={onClose} onStop={onStop} onClear={onClear} /> : null}
    </>
  )
}

function Background({
  session,
  tasks,
  onClose,
  onStop,
  onClear,
}: {
  readonly session: string | undefined
  readonly tasks: readonly BackgroundTask[]
  readonly onClose: () => void
  readonly onStop: (task: string) => void
  readonly onClear: (task: string) => void
}): React.JSX.Element {
  const [opened, setOpened] = useState<string | undefined>()
  const [at, setAt] = useState(0)
  const [stopping, setStopping] = useState<ReadonlySet<string>>(new Set())
  const box = useRef<HTMLDivElement>(null)
  const now = useNow(tasks.some(running))

  const known = new Set(GROUPS.map((group) => group.kind))
  const groups = [
    ...GROUPS.map((group) => ({ title: group.title, tasks: tasks.filter((task) => task.kind === group.kind) })),
    { title: 'Other', tasks: tasks.filter((task) => !known.has(task.kind)) },
  ].filter((group) => group.tasks.length > 0)
  const order = groups.flatMap((group) => group.tasks)
  const here = Math.min(at, order.length - 1)
  const shown = tasks.find((task) => task.id === opened)

  const act = (task: BackgroundTask): void => {
    if (running(task)) {
      setStopping(new Set([...stopping, task.id]))
      onStop(task.id)
    } else {
      onClear(task.id)
      if (task.id === opened) setOpened(undefined)
    }
  }

  // It takes the keys while it is open, and gives the field back what it had.
  useEffect(() => {
    const before = document.activeElement
    box.current?.focus()
    return () => {
      if (before instanceof HTMLElement) before.focus()
    }
  }, [])

  // Taken first, so the Escape that closes it does not also stop the answer behind it.
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      const onButton = event.target instanceof HTMLButtonElement
      const task = shown ?? order[here]
      const take = (): void => {
        event.preventDefault()
        event.stopPropagation()
      }
      if (event.key === 'Escape') {
        take()
        onClose()
      } else if (event.key === 'x' && task !== undefined) {
        take()
        act(task)
      } else if (shown !== undefined) {
        if (event.key === 'ArrowLeft') {
          take()
          setOpened(undefined)
        }
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        take()
        setAt(Math.max(0, Math.min(here + (event.key === 'ArrowDown' ? 1 : -1), order.length - 1)))
      } else if (event.key === 'Enter' && !onButton && task !== undefined) {
        take()
        setOpened(task.id)
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  })

  return (
    <div className="dialog-scrim" onMouseDown={onClose}>
      <div
        className={`dialog tasks${shown === undefined ? '' : ' one'}`}
        ref={box}
        tabIndex={-1}
        role="dialog"
        aria-label="Background"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {shown === undefined || session === undefined ? (
          <>
            <h2>Background</h2>
            {order.length === 0 ? (
              <p>Nothing is running in the background.</p>
            ) : (
              groups.map((group) => (
                <section key={group.title}>
                  <h3>{group.title}</h3>
                  {group.tasks.map((task) => {
                    const index = order.indexOf(task)
                    return (
                      <div
                        key={task.id}
                        className={`task-row${index === here ? ' on' : ''}`}
                        role="button"
                        tabIndex={-1}
                        onMouseMove={() => setAt(index)}
                        onClick={() => setOpened(task.id)}
                      >
                        <Glyph task={task} />
                        <span className="what">{task.what || task.id}</span>
                        <span className="lasted">{lasted((task.ended ?? now) - task.started)}</span>
                        <span className={`how ${task.status}`}>{standing(task, stopping.has(task.id))}</span>
                      </div>
                    )
                  })}
                </section>
              ))
            )}
            <div className="dialog-actions">
              {order.length === 0 ? null : (
                <span className="task-keys">Up and Down to choose, Enter to open, X to stop or clear</span>
              )}
              <button type="button" className="primary" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <Details
            session={session}
            task={shown}
            now={now}
            stopping={stopping.has(shown.id)}
            onBack={() => setOpened(undefined)}
            onAct={() => act(shown)}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}

/** One task opened: how it stands, what it runs, and what it printed, read again every second while it runs. */
function Details({
  session,
  task,
  now,
  stopping,
  onBack,
  onAct,
  onClose,
}: {
  readonly session: string
  readonly task: BackgroundTask
  readonly now: number
  readonly stopping: boolean
  readonly onBack: () => void
  readonly onAct: () => void
  readonly onClose: () => void
}): React.JSX.Element {
  const [output, setOutput] = useState<TaskOutput | undefined>()
  const printed = useRef<HTMLDivElement>(null)
  const live = running(task)

  useEffect(() => {
    let gone = false
    const read = (): void => {
      void window.geckit.chat.taskOutput(session, task.id).then((read) => {
        if (!gone) setOutput(read)
      })
    }
    read()
    const timer = live ? setInterval(read, 1000) : undefined
    return () => {
      gone = true
      clearInterval(timer)
    }
  }, [session, task.id, live])

  // What it prints next is followed, unless the person has scrolled up to read what came before.
  const text = output?.kind === 'printed' ? output.text : ''
  const following = useRef(true)
  useLayoutEffect(() => {
    const pre = printed.current?.querySelector('pre')
    if (pre !== null && pre !== undefined && following.current) pre.scrollTop = pre.scrollHeight
  }, [text])

  const lines = output?.kind === 'helper' ? output.lines : []
  const asked = lines.find((line) => line.who === 'asked')
  const said = lines.filter((line) => line.who !== 'asked')
  const recent = said.slice(-RECENT)

  return (
    <>
      <h2>{task.what || task.id}</h2>
      <dl className="task-facts">
        <div>
          <dt>Status</dt>
          <dd className={`how ${task.status}`}>{standing(task, stopping)}</dd>
        </div>
        <div>
          <dt>Runtime</dt>
          <dd>{lasted((task.ended ?? now) - task.started)}</dd>
        </div>
        {task.progress === undefined ? null : (
          <div>
            <dt>So far</dt>
            <dd>
              {`${task.progress.tools.toLocaleString()} ${task.progress.tools === 1 ? 'tool use' : 'tool uses'}, ${task.progress.tokens.toLocaleString()} tokens`}
              {live && task.progress.doing !== '' ? `. ${task.progress.doing}` : ''}
            </dd>
          </div>
        )}
      </dl>
      {task.command === undefined ? null : (
        <>
          <h3>Runs</h3>
          <Code detail>{task.command}</Code>
        </>
      )}
      {asked === undefined ? null : (
        <>
          <h3>Asked</h3>
          <p className="task-asked">{asked.text}</p>
        </>
      )}
      {output === undefined ? null : output.kind === 'printed' ? (
        <>
          <h3>Output</h3>
          {text === '' ? (
            <p>{live ? 'Nothing printed yet.' : 'It printed nothing.'}</p>
          ) : (
            <div
              className="task-printed"
              ref={printed}
              onScrollCapture={(event) => {
                const pre = event.target
                if (pre instanceof HTMLPreElement) following.current = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 24
              }}
            >
              <Code detail>{text}</Code>
            </div>
          )}
        </>
      ) : (
        <>
          <h3>Lately</h3>
          {recent.length === 0 ? (
            <p>{live ? 'Nothing said or done yet.' : 'It said and did nothing.'}</p>
          ) : (
            <ol className="task-lines">
              {recent.map((line) =>
                line.who === 'said' ? (
                  <li key={line.id} className="task-said">
                    <Prose text={line.text} />
                  </li>
                ) : (
                  <li key={line.id} className="task-did">
                    {line.text}
                  </li>
                ),
              )}
            </ol>
          )}
          {said.length > RECENT ? <p className="task-more">{`The last ${String(RECENT)} of ${String(said.length)}`}</p> : null}
        </>
      )}
      <div className="dialog-actions">
        <button type="button" className="quiet" onClick={onBack}>
          Back
        </button>
        <span className="task-keys">Left to go back, X to {live ? 'stop' : 'clear'}</span>
        <button type="button" className="quiet" disabled={stopping} onClick={onAct}>
          {live ? 'Stop' : 'Clear'}
        </button>
        <button type="button" className="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </>
  )
}
