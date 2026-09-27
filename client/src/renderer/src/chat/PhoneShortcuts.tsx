import { useEffect, useState } from 'react'

import { SESSION_MODES, shownProjects } from '../../../shared/api'
import type { SessionMode, Shortcut, ShortcutDraft } from '../../../shared/api'
import { projectColor } from '../../../shared/project-color'
import { cronOf, describeCron, describeTime, isCron, nextRun, nextTimed, WEEKDAYS, whenOf } from '../../../shared/schedule'
import type { When } from '../../../shared/schedule'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { Cell, FullSheet, Page, Switch } from './PhoneKit'
import { projectName } from './project'
import { FIRST_CRON, REPEATS, turned } from './ShortcutList'
import type { Repeats } from './ShortcutList'
import type { Chat } from './useChat'

/** The Shortcuts tab: saved prompts, each run by hand from its row or on its timetable by the Mac. See docs/ux/phone-parity.md. */

const busy = (chat: Chat, session: string | undefined): boolean =>
  session !== undefined && chat.everyone.some((one) => one.id === session && (one.state === 'working' || one.state === 'asks'))

// "Tomorrow at 9:00 AM" after "next", its first word only.
const lowered = (text: string): string => `${text.charAt(0).toLowerCase()}${text.slice(1)}`

/** What the row says under the name: when it runs next, that it is paused, or that it runs by hand. */
function when(one: Shortcut, chat: Chat, now: number): string {
  if (busy(chat, one.lastSession)) return 'Running now'
  if (one.cron === undefined) return one.lastRun === undefined ? 'By hand' : `By hand, last ${describeTime(one.lastRun, now)}`
  if (!one.on) return 'Paused'
  const next = nextTimed(one, now)
  return next === undefined ? describeCron(one.cron) : `${describeCron(one.cron)}, next ${lowered(describeTime(next, now))}`
}

export function PhoneShortcuts({ chat, onEdit }: { readonly chat: Chat; readonly onEdit: (draft: ShortcutDraft) => void }): React.JSX.Element {
  const [now, setNow] = useState(Date.now)
  const [running, setRunning] = useState<string | undefined>()
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 20_000)
    return () => clearInterval(tick)
  }, [])
  const shown = shownProjects(chat.settings)
  const shortcuts = chat.settings.shortcuts.filter((one) => shown.includes(one.root))
  const blank = (): ShortcutDraft => ({ name: '', root: chat.root ?? shown[0] ?? '', prompt: '', mode: 'auto', on: true })

  const run = (one: Shortcut): void => {
    tap('light')
    setRunning(one.id)
    void window.geckit.shortcuts
      .run(one.id)
      .then((session) => {
        if (session !== undefined) chat.goTo(session)
      })
      .finally(() => setRunning(undefined))
  }

  return (
    <Page
      title="Shortcuts"
      actions={
        <button type="button" className="phone-icon" aria-label="New shortcut" onClick={() => onEdit(blank())}>
          <Icon name="plus" size={24} />
        </button>
      }
    >
      {shortcuts.length === 0 ? (
        <div className="phone-empty">
          No shortcuts. A shortcut is a prompt you run by hand or on a timetable.
          <button type="button" className="phone-empty-action" onClick={() => onEdit(blank())}>
            New shortcut
          </button>
        </div>
      ) : (
        <div className="phone-group phone-shortcuts">
          {shortcuts.map((one) => (
            <div key={one.id} className="phone-shortcut">
              <button type="button" className="phone-shortcut-text" onClick={() => onEdit(one)}>
                <span className="phone-row-title">{one.name}</span>
                <span className="phone-shortcut-when">
                  <b style={{ color: `var(--project-${String(projectColor(one.root, chat.settings))})` }}>{projectName(one.root)}</b>
                  {' '}
                  {when(one, chat, now)}
                </span>
                <span className="phone-row-said">{one.prompt}</span>
              </button>
              <div className="phone-shortcut-side">
                <button type="button" className="phone-pill" disabled={running === one.id} onClick={() => run(one)}>
                  {running === one.id ? <Icon name="spinner" size={14} /> : 'Run'}
                </button>
                {one.cron === undefined ? null : (
                  <Switch
                    on={one.on}
                    label={`Timetable for ${one.name}`}
                    onChange={(on) => {
                      tap('light')
                      void window.geckit.shortcuts.save({ ...one, on })
                    }}
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="phone-note">Timetables run on the Mac while GeckIt is open there.</div>
    </Page>
  )
}

const MODE_LABEL = (mode: SessionMode): string => SESSION_MODES.find((one) => one.mode === mode)?.label ?? mode

/** One shortcut, new or kept, with every field the Mac's editor has. */
export function ShortcutSheet({ chat, given, onClose }: { readonly chat: Chat; readonly given: ShortcutDraft; readonly onClose: () => void }): React.JSX.Element {
  const [draft, setDraft] = useState<ShortcutDraft>(given)
  const [repeats, setRepeats] = useState<Repeats>(() => (given.cron === undefined ? 'never' : whenOf(given.cron).kind))
  const [now] = useState(() => Date.now())
  const [picking, setPicking] = useState<'project' | 'mode' | 'repeats' | 'weekday' | 'delete' | undefined>()
  const change = (next: Partial<ShortcutDraft>): void => setDraft({ ...draft, ...next })
  const cron = draft.cron ?? FIRST_CRON
  const shape: When = repeats === 'cron' ? { kind: 'cron', cron } : turned(whenOf(cron), repeats === 'never' ? 'weekdays' : repeats)
  const setWhen = (next: When): void => change({ cron: cronOf(next) })
  const next = draft.cron === undefined ? undefined : nextRun(draft.cron, now)
  const name = draft.name.trim() || (draft.prompt.trim().split('\n')[0] ?? '').slice(0, 60)
  const ready = name !== '' && draft.root !== '' && draft.prompt.trim() !== '' && (draft.cron === undefined || next !== undefined)
  const kept = draft.id === undefined ? undefined : chat.settings.shortcuts.find((one) => one.id === draft.id)

  const save = (): void => {
    if (!ready) return
    void window.geckit.shortcuts.save({ ...draft, name, prompt: draft.prompt.trim() }).then(onClose)
  }
  const time = (hour: number, minute: number, set: (hour: number, minute: number) => void): React.JSX.Element => (
    <input
      type="time"
      className="phone-time"
      aria-label="At"
      value={`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`}
      onChange={(event) => {
        const [h, m] = event.target.value.split(':').map(Number)
        if (h !== undefined && m !== undefined && !Number.isNaN(h) && !Number.isNaN(m)) set(h, m)
      }}
    />
  )

  return (
    <>
      <FullSheet title={given.id === undefined ? 'New shortcut' : given.name} action="Save" ready={ready} onAction={save} onClose={onClose}>
        <div className="phone-task-label">Name</div>
        <input className="phone-task-goal" value={draft.name} placeholder={name === '' ? 'Morning check' : name} onChange={(event) => change({ name: event.target.value })} />
        <div className="phone-task-label">Prompt</div>
        <textarea className="phone-task-text" value={draft.prompt} placeholder="What Claude is asked each time" onChange={(event) => change({ prompt: event.target.value })} />
        <div className="phone-task-label">Goal</div>
        <input
          className="phone-task-goal"
          value={draft.goal ?? ''}
          placeholder="When it is done, as a condition"
          onChange={(event) => {
            const { goal: _, ...rest } = draft
            setDraft(event.target.value === '' ? rest : { ...rest, goal: event.target.value })
          }}
        />
        <div className="phone-group phone-form-group">
          <Cell label="Project" value={draft.root === '' ? 'None' : projectName(draft.root)} onPress={() => setPicking('project')} />
          <Cell label="Mode" value={MODE_LABEL(draft.mode)} onPress={() => setPicking('mode')} />
        </div>
        <div className="phone-group phone-form-group">
          <Cell label="Repeats" value={REPEATS.find((one) => one.value === repeats)?.label} onPress={() => setPicking('repeats')} />
          {repeats === 'never' ? null : shape.kind === 'hour' ? (
            <Cell label="Minutes past">
              <input
                className="phone-number"
                inputMode="numeric"
                value={String(shape.minute)}
                onChange={(event) => setWhen({ kind: 'hour', minute: Math.max(0, Math.min(59, Number(event.target.value) || 0)) })}
              />
            </Cell>
          ) : shape.kind === 'cron' ? (
            <Cell label="Cron">
              <input className="phone-cron" value={cron} spellCheck={false} autoCapitalize="off" onChange={(event) => change({ cron: event.target.value })} />
            </Cell>
          ) : (
            <>
              {shape.kind === 'week' ? <Cell label="On" value={WEEKDAYS[shape.weekday]} onPress={() => setPicking('weekday')} /> : null}
              <Cell label="At">{time(shape.hour, shape.minute, (hour, minute) => setWhen({ ...shape, hour, minute }))}</Cell>
            </>
          )}
          {draft.cron === undefined ? null : (
            <Cell label="Timetable on" says={next === undefined ? (isCron(cron) ? 'It never comes round' : 'Not a cron line') : `Next ${lowered(describeTime(next, now))}`}>
              <Switch on={draft.on} label="Timetable on" onChange={(on) => change({ on })} />
            </Cell>
          )}
        </div>
        {kept === undefined ? null : (
          <div className="phone-group phone-form-group">
            <Cell
              label="Run now"
              accent
              onPress={() => {
                onClose()
                void window.geckit.shortcuts.run(kept.id).then((session) => {
                  if (session !== undefined) chat.goTo(session)
                })
              }}
            />
            <Cell label="Delete shortcut" danger onPress={() => setPicking('delete')} />
          </div>
        )}
      </FullSheet>
      {picking === 'project' ? (
        <Menu
          anchor={new DOMRect()}
          title="Runs in"
          chosen={draft.root}
          choices={shownProjects(chat.settings).map((one) => ({ value: one, label: projectName(one) }))}
          onPick={(root) => change({ root })}
          onClose={() => setPicking(undefined)}
        />
      ) : picking === 'mode' ? (
        <Menu
          anchor={new DOMRect()}
          title="Mode"
          explained
          chosen={draft.mode}
          choices={SESSION_MODES.map((one) => ({ value: one.mode, label: one.label, says: one.why }))}
          onPick={(mode) => change({ mode: mode as SessionMode })}
          onClose={() => setPicking(undefined)}
        />
      ) : picking === 'repeats' ? (
        <Menu
          anchor={new DOMRect()}
          title="Repeats"
          chosen={repeats}
          choices={REPEATS.map((one) => ({ value: one.value, label: one.label }))}
          onPick={(value) => {
            const kind = value as Repeats
            setRepeats(kind)
            if (kind === 'never') {
              const { cron: _, ...rest } = draft
              setDraft(rest)
            } else setDraft({ ...draft, cron: cronOf(turned(whenOf(cron), kind)) })
          }}
          onClose={() => setPicking(undefined)}
        />
      ) : picking === 'weekday' && shape.kind === 'week' ? (
        <Menu
          anchor={new DOMRect()}
          title="On"
          chosen={String(shape.weekday)}
          choices={WEEKDAYS.map((day, at) => ({ value: String(at), label: day }))}
          onPick={(value) => setWhen({ ...shape, weekday: Number(value) })}
          onClose={() => setPicking(undefined)}
        />
      ) : picking === 'delete' && kept !== undefined ? (
        <Menu
          anchor={new DOMRect()}
          title={`Delete "${kept.name}"?`}
          choices={[{ value: 'delete', label: 'Delete', danger: true }]}
          onPick={() => {
            window.geckit.shortcuts.remove(kept.id)
            onClose()
          }}
          onClose={() => setPicking(undefined)}
        />
      ) : null}
    </>
  )
}
