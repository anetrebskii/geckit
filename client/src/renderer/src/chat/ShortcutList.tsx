import { useEffect, useState } from 'react'

import { modelName, SESSION_MODES } from '../../../shared/api'
import type { SessionMode, Shortcut, ShortcutDraft } from '../../../shared/api'
import { cronOf, describeCron, describeTime, nextRun, nextTimed, WEEKDAYS, whenOf } from '../../../shared/schedule'
import type { When } from '../../../shared/schedule'
import { Icon } from '../ui/Icon'
import { Picker } from '../ui/Menu'
import { projectColor } from '../../../shared/project-color'
import { homePath, projectName, tint } from './project'
import type { Chat } from './useChat'

/** Saved prompts, each run a new conversation in its project: by hand, from here or the menu bar, or on a timetable. */

type Repeats = 'never' | When['kind']

const REPEATS: readonly { readonly value: Repeats; readonly label: string }[] = [
  { value: 'never', label: 'Never, only by hand' },
  { value: 'hour', label: 'Every hour' },
  { value: 'day', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday' },
  { value: 'week', label: 'Every week' },
  { value: 'cron', label: 'Cron' },
]

/** Where a new timetable starts. */
const FIRST_CRON = '0 9 * * 1-5'

/** The same time of day, as another kind of timetable. */
function turned(when: When, kind: When['kind']): When {
  const hour = 'hour' in when ? when.hour : 9
  const minute = 'minute' in when ? when.minute : 0
  switch (kind) {
    case 'hour':
      return { kind, minute }
    case 'day':
    case 'weekdays':
      return { kind, hour, minute }
    case 'week':
      return { kind, weekday: 'weekday' in when ? when.weekday : 1, hour, minute }
    case 'cron':
      return { kind, cron: cronOf(when) }
  }
}

const clock = (hour: number, minute: number): string => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

const busy = (chat: Chat, session: string | undefined): boolean =>
  session !== undefined && chat.everyone.some((one) => one.id === session && (one.state === 'working' || one.state === 'asks'))

export function ShortcutList({
  chat,
  start,
  onClose,
}: {
  readonly chat: Chat
  /** The list, `new`, a shortcut's id to edit, or a new one already filled in. */
  readonly start: string | ShortcutDraft
  readonly onClose: () => void
}): React.JSX.Element {
  const shortcuts = chat.settings.shortcuts
  const blank = (): ShortcutDraft => ({
    name: '',
    root: chat.root ?? chat.settings.projects[0] ?? '',
    prompt: '',
    mode: 'auto',
    on: true,
  })
  const [editing, setEditing] = useState<ShortcutDraft | undefined>(() =>
    typeof start !== 'string' ? start : start === 'new' ? blank() : shortcuts.find((one) => one.id === start),
  )
  // "Next today at 9:00" goes on being true for a minute at most.
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 20_000)
    return () => clearInterval(tick)
  }, [])

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  const run = (one: Shortcut): void => {
    onClose()
    void window.geckit.shortcuts.run(one.id).then((session) => {
      if (session !== undefined) chat.goTo(session)
    })
  }

  return (
    <div className="dialog-scrim" onMouseDown={onClose}>
      <div className="dialog shortcut-list" onMouseDown={(event) => event.stopPropagation()}>
        {editing === undefined ? (
          <>
            <h2>Shortcuts</h2>
            <p>A shortcut starts a new conversation in its project with its prompt. Run one here or from the gecko in the menu bar, or give it a timetable to run by itself while GeckIt is open.</p>
            {shortcuts.length === 0 ? <div className="shortcut-empty">No shortcuts yet.</div> : null}
            {shortcuts.map((one) => {
              const next = nextTimed(one, now)
              const running = busy(chat, one.lastSession)
              return (
                <div key={one.id} className="shortcut-row">
                  <button type="button" className="shortcut-text" title="Edit" onClick={() => setEditing(one)}>
                    <span className="shortcut-name">{one.name}</span>
                    <span className="shortcut-when">
                      <span style={tint(projectColor(one.root, chat.settings))}>{projectName(one.root)}</span>
                      {one.cron === undefined ? null : <span>{one.on ? describeCron(one.cron) : 'Timetable paused'}</span>}
                      {running ? (
                        <span>Running now</span>
                      ) : next !== undefined ? (
                        <span>{`Next ${describeTime(next, now)}`}</span>
                      ) : one.lastRun === undefined ? null : (
                        <span>{`Last run ${describeTime(one.lastRun, now)}`}</span>
                      )}
                    </span>
                    <span className="shortcut-prompt">{one.prompt}</span>
                  </button>
                  {one.lastSession === undefined ? null : (
                    <button
                      type="button"
                      className="quiet"
                      title="Open the conversation the last run started"
                      onClick={() => {
                        if (one.lastSession !== undefined) chat.goTo(one.lastSession)
                        onClose()
                      }}
                    >
                      Last run
                    </button>
                  )}
                  <button type="button" className="primary" title="Start a new conversation with this prompt" onClick={() => run(one)}>
                    Run
                  </button>
                </div>
              )
            })}
            <div className="dialog-actions">
              <button type="button" className="quiet" onClick={() => setEditing(blank())}>
                New shortcut
              </button>
              <span className="spacer" />
              <button type="button" className="quiet" onClick={onClose}>
                Done
              </button>
            </div>
          </>
        ) : (
          <Editor key={editing.id ?? 'new'} chat={chat} given={editing} now={now} onDone={() => setEditing(undefined)} />
        )}
      </div>
    </div>
  )
}

function Editor({
  chat,
  given,
  now,
  onDone,
}: {
  readonly chat: Chat
  readonly given: ShortcutDraft
  readonly now: number
  readonly onDone: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState<ShortcutDraft>(given)
  // Kept apart from the line itself, so a cron being typed that happens to spell "every day" stays a cron line.
  const [repeats, setRepeats] = useState<Repeats>(() => (given.cron === undefined ? 'never' : whenOf(given.cron).kind))
  const [sure, setSure] = useState(false)
  const cron = draft.cron ?? FIRST_CRON
  const when = repeats === 'cron' ? ({ kind: 'cron', cron } as const) : turned(whenOf(cron), repeats === 'never' ? 'weekdays' : repeats)
  const setWhen = (next: When): void => setDraft({ ...draft, cron: cronOf(next) })
  const next = draft.cron === undefined ? undefined : nextRun(draft.cron, now)
  const change = (change: Partial<ShortcutDraft>): void => setDraft({ ...draft, ...change })

  const models = [
    { value: '', label: 'Default', says: 'as claude is set up' },
    ...(Array.isArray(chat.models)
      ? chat.models.map((one) => ({ value: one.value, label: one.name, ...(one.id === undefined ? {} : { says: modelName(one.id) }) }))
      : [{ value: '__asking', label: chat.models === 'asking' ? 'Asking claude...' : 'claude did not say which models it has' }]),
  ]
  const model = draft.model ?? ''
  const modelLabel = Array.isArray(chat.models) ? (chat.models.find((one) => one.value === model)?.name ?? (model || 'Default')) : model || 'Default'

  const name = draft.name.trim() || (draft.prompt.trim().split('\n')[0] ?? '').slice(0, 60)
  const ready = name !== '' && draft.root !== '' && draft.prompt.trim() !== '' && (draft.cron === undefined || next !== undefined)
  const save = (): void => {
    if (!ready) return
    void window.geckit.shortcuts.save({ ...draft, name, prompt: draft.prompt.trim() }).then(onDone)
  }

  const time = (
    <input
      type="time"
      aria-label="At"
      value={'hour' in when ? clock(when.hour, when.minute) : '09:00'}
      onChange={(event) => {
        const [hour = 9, minute = 0] = event.target.value.split(':').map(Number)
        if (when.kind === 'day' || when.kind === 'weekdays' || when.kind === 'week') setWhen({ ...when, hour, minute })
      }}
    />
  )

  return (
    <>
      <h2>{given.id === undefined ? 'New shortcut' : 'Edit shortcut'}</h2>
      <p>Each run starts a new conversation in the project, and the prompt is its first message.</p>

      <div className="two">
        <div className="field">
          <label htmlFor="shortcut-name">Name</label>
          <input
            id="shortcut-name"
            type="text"
            value={draft.name}
            placeholder={name || 'Review my pull requests'}
            onChange={(event) => change({ name: event.target.value })}
          />
        </div>
        <div className="field">
          <label>Project</label>
          <Picker
            label={draft.root === '' ? 'Choose a project' : projectName(draft.root)}
            choices={chat.settings.projects.map((one) => ({ value: one, label: projectName(one), says: homePath(one) }))}
            chosen={draft.root}
            {...(draft.root === '' ? {} : { tip: homePath(draft.root) })}
            className="select"
            onPick={(root) => change({ root })}
          />
        </div>
      </div>

      <div className="field">
        <label htmlFor="shortcut-prompt">Prompt</label>
        <textarea
          id="shortcut-prompt"
          rows={5}
          value={draft.prompt}
          placeholder="Look through the pull requests waiting for my review and tell me which ones need me first."
          onChange={(event) => change({ prompt: event.target.value })}
        />
      </div>

      <div className="two">
        <div className="field">
          <label>What it may do</label>
          <Picker
            label={SESSION_MODES.find((one) => one.mode === draft.mode)?.label ?? 'Auto'}
            choices={SESSION_MODES.map((one) => ({ value: one.mode, label: one.label, says: one.why }))}
            chosen={draft.mode}
            explained
            {...(draft.cron === undefined
              ? {}
              : { note: 'A timed run has nobody watching: in Manual it stops at the first thing it asks, and waits for you.' })}
            className="select"
            onPick={(mode) => change({ mode: mode as SessionMode })}
          />
        </div>
        <div className="field">
          <label>Model</label>
          <Picker
            label={modelLabel}
            choices={models}
            chosen={model}
            className="select"
            onOpen={chat.askModels}
            onPick={(value) => {
              if (value === '__asking') return
              const { model: _model, ...rest } = draft
              setDraft(value === '' ? rest : { ...rest, model: value })
            }}
          />
        </div>
      </div>

      <div className="field">
        <label>Runs by itself</label>
        <div className="shortcut-repeat">
          <Picker
            label={REPEATS.find((one) => one.value === repeats)?.label ?? 'Cron'}
            choices={REPEATS}
            chosen={repeats}
            className="select"
            onPick={(value) => {
              const picked = value as Repeats
              setRepeats(picked)
              if (picked === 'never') {
                const { cron: _cron, ...rest } = draft
                setDraft(rest)
              } else {
                setWhen(turned(when, picked))
              }
            }}
          />
          {repeats === 'never' ? null : when.kind === 'hour' ? (
            <label className="shortcut-minute">
              at
              <input
                type="number"
                min={0}
                max={59}
                aria-label="Minutes past the hour"
                value={when.minute}
                onChange={(event) => setWhen({ ...when, minute: Math.min(59, Math.max(0, Math.round(Number(event.target.value)) || 0)) })}
              />
              past
            </label>
          ) : when.kind === 'week' ? (
            <>
              <Picker
                label={WEEKDAYS[when.weekday] ?? 'Monday'}
                choices={[1, 2, 3, 4, 5, 6, 0].map((day) => ({ value: String(day), label: WEEKDAYS[day] ?? '' }))}
                chosen={String(when.weekday)}
                className="select"
                onPick={(day) => setWhen({ ...when, weekday: Number(day) })}
              />
              {time}
            </>
          ) : when.kind === 'cron' ? (
            <input
              type="text"
              className="shortcut-cron"
              aria-label="Cron line"
              value={cron}
              placeholder={FIRST_CRON}
              spellCheck={false}
              onChange={(event) => change({ cron: event.target.value })}
            />
          ) : (
            time
          )}
        </div>
        {draft.cron === undefined ? (
          <span className="shortcut-next">It runs when you start it, from the Shortcuts list or the gecko in the menu bar.</span>
        ) : next === undefined ? (
          <span className="shortcut-next wrong">
            Cron takes five fields: minute, hour, day of the month, month and day of the week, such as {FIRST_CRON}.
          </span>
        ) : (
          <label className="check shortcut-on">
            <input type="checkbox" checked={draft.on} onChange={(event) => change({ on: event.target.checked })} />
            {draft.on ? `On, next run ${describeTime(next, now)}` : 'Paused, the timetable is kept'}
          </label>
        )}
      </div>

      <div className="dialog-actions">
        {given.id === undefined ? null : sure ? (
          <button
            type="button"
            className="primary danger"
            onClick={() => {
              if (given.id !== undefined) window.geckit.shortcuts.remove(given.id)
              onDone()
            }}
          >
            Delete it
          </button>
        ) : (
          <button type="button" className="icon-button" aria-label="Delete" title="Delete this shortcut" onClick={() => setSure(true)}>
            <Icon name="trash" />
          </button>
        )}
        <span className="spacer" />
        <span className="together">
          <button type="button" className="quiet" onClick={onDone}>
            Cancel
          </button>
          <button type="button" className="primary" disabled={!ready} onClick={save}>
            Save
          </button>
        </span>
      </div>
    </>
  )
}
