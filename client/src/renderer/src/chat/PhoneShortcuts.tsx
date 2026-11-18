import { useEffect, useMemo, useRef, useState } from 'react'

import { shownProjects } from '../../../shared/api'
import type { Shortcut, ShortcutDraft } from '../../../shared/api'
import { projectColor } from '../../../shared/project-color'
import { describeTime, nextSet } from '../../../shared/schedule'
import { asDraft, civilDay, clockText, dayName, dayText, defaultOnce, duplicateDraft, isProblem, kindOf, monthGrid, MONTH_LONG, onDay, postponeChoices, problemLine, ranLine, runLaterDraft, sameDay, scheduledWhen, shiftMonths, UNDO_FOR, WEEKDAY_HEADS } from '../../../shared/prompt-kinds'
import type { PromptKind } from '../../../shared/prompt-kinds'
import { saveShortcut } from '../../../shared/shortcut-save'
import { destinationSummary, ShortcutDelivery, useShortcutRuns } from './ShortcutDestinations'
import { tap } from '../tap'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { Sheet } from '../ui/Sheet'
import { Page, Switch } from './PhoneKit'
import { projectLabel } from './project'
import { FIRST_CRON, NEW_LABEL, timetableSaid } from './PromptEditor'
import type { ShortcutChat } from './PromptEditor'
import { assigneeOf, WhoMark } from './PromptRow'
import { promptsOf } from './ShortcutList'
import type { Chat } from './useChat'
export { ShortcutSheet } from './PhoneShortcutSheet'

/** The phone's Repeating, Scheduled and Shortcuts pages: iOS grouped rows, a long press for the row's actions, Scheduled as a month with the chosen day's runs or a list. See docs/ux/shortcut-kinds.md. */

const TITLE: Record<PromptKind, string> = { repeating: 'Repeating', scheduled: 'Scheduled', shortcut: 'Shortcuts' }
const EMPTY: Record<PromptKind, readonly [string, string]> = {
  repeating: ['No repeating jobs', 'Run a prompt every day, weekday or week, like a morning plan.'],
  scheduled: ['Nothing scheduled', 'Plan a prompt to run once, later. You can postpone it until the time comes.'],
  shortcut: ['No shortcuts yet', 'Save a prompt you send often, like a code review.'],
}
const HOLD = 500

const busy = (chat: ShortcutChat, session: string | undefined): boolean =>
  session !== undefined && chat.everyone.some((one) => one.id === session && (one.state === 'working' || one.state === 'asks'))

/** A press held without moving opens the row's actions. */
function useHold(onHold: () => void): Pick<React.HTMLAttributes<HTMLElement>, 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onContextMenu' | 'onClickCapture'> {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const from = useRef<{ x: number; y: number } | undefined>(undefined)
  const held = useRef(false)
  const stop = (): void => { clearTimeout(timer.current); from.current = undefined }
  return {
    onPointerDown: (event) => {
      held.current = false
      from.current = { x: event.clientX, y: event.clientY }
      timer.current = setTimeout(() => { held.current = true; tap('light'); onHold() }, HOLD)
    },
    onPointerMove: (event) => { if (from.current !== undefined && Math.hypot(event.clientX - from.current.x, event.clientY - from.current.y) > 8) stop() },
    onPointerUp: stop,
    onPointerCancel: stop,
    onContextMenu: (event) => { event.preventDefault(); stop(); held.current = true; onHold() },
    onClickCapture: (event) => { if (held.current) { event.preventDefault(); event.stopPropagation(); held.current = false } },
  }
}

export function PhoneShortcuts({
  chat,
  kind = 'shortcut',
  back,
  onBack,
  onEdit,
}: {
  readonly chat: ShortcutChat
  readonly kind?: PromptKind
  readonly back?: string
  readonly onBack?: () => void
  readonly onEdit: (draft: ShortcutDraft) => void
}): React.JSX.Element {
  const lastRuns = useShortcutRuns(chat.settings)
  const [now, setNow] = useState(Date.now)
  const [running, setRunning] = useState<string | undefined>()
  const [runError, setRunError] = useState('')
  const [acting, setActing] = useState<{ readonly id: string; readonly sheet: 'more' | 'postpone' | 'later' }>()
  const [deleted, setDeleted] = useState<Shortcut>()
  const zone = chat.settings.calendarTimeZone
  const [calendar, setCalendar] = useState(chat.settings.scheduledView !== 'list')
  const today = civilDay(now, zone)
  const [day, setDay] = useState(today)
  const [month, setMonth] = useState(() => shiftMonths(today, 0))
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 20_000)
    return () => clearInterval(tick)
  }, [])
  useEffect(() => {
    if (deleted === undefined) return
    const timer = setTimeout(() => { window.geckit.shortcuts.remove(deleted.id); setDeleted(undefined) }, UNDO_FOR)
    return () => clearTimeout(timer)
  }, [deleted])
  const flushing = useRef<Shortcut | undefined>(undefined)
  useEffect(() => { flushing.current = deleted }, [deleted])
  useEffect(() => () => { if (flushing.current !== undefined) window.geckit.shortcuts.remove(flushing.current.id) }, [])
  const employees = useMemo(() => new Map(chat.employees.map((employee) => [employee.id, employee])), [chat.employees])
  const shown = shownProjects(chat.settings)
  const settings = chat.settings
  const ordered = useMemo(() => promptsOf(settings.shortcuts.filter((one) => shownProjects(settings).includes(one.root)), kind, now), [settings, kind, now])
  const prompts = ordered.filter((one) => one.id !== deleted?.id)
  const ran = kind === 'scheduled' ? chat.settings.shortcuts.filter((one) => shown.includes(one.root) && one.at !== undefined && one.outcome?.state === 'ran') : []
  const blank = (at?: number): ShortcutDraft => ({ name: '', root: chat.root ?? shown[0] ?? '', prompt: '', mode: 'auto', on: true, ...(kind === 'scheduled' ? { at: at ?? defaultOnce(now, zone), vary: true } : kind === 'repeating' ? { cron: FIRST_CRON, vary: true } : {}) })
  const once = chat.settings.promptKindsVersion === 1
  const canAdd = kind !== 'scheduled' || once
  const onCalendar = kind === 'scheduled' && once && calendar
  const listed = onCalendar ? prompts.filter((one) => one.at !== undefined && sameDay(civilDay(one.at, zone), day)) : prompts
  const target = acting === undefined ? undefined : prompts.find((one) => one.id === acting.id)

  const run = (one: Shortcut): void => {
    tap('light')
    setRunning(one.id)
    setRunError('')
    const failed = one.target === 'manager' ? 'Could not run. Check Manager in Team.' : 'Could not run. Check the assistant and folder.'
    void window.geckit.shortcuts
      .run(one.id)
      .then((session) => {
        if (session !== undefined) chat.goTo(session)
        else setRunError(failed)
      })
      .catch(() => setRunError(failed))
      .finally(() => setRunning(undefined))
  }
  const remove = (one: Shortcut): void => {
    if (deleted !== undefined) window.geckit.shortcuts.remove(deleted.id)
    setDeleted(one)
  }

  const row = (one: Shortcut): React.JSX.Element => <Row key={one.id} chat={chat} prompt={one} now={now} archived={one.employeeId !== undefined && employees.get(one.employeeId)?.archived === true} busy={busy(chat, one.lastSession)} starting={running === one.id} run={lastRuns.get(one.id)} onEdit={() => onEdit(one)} onRun={() => run(one)} onHold={() => setActing({ id: one.id, sheet: 'more' })} />

  const [emptyTitle, emptyLine] = EMPTY[kind]
  return (
    <Page
      title={TITLE[kind]}
      {...(back === undefined ? {} : { back })} {...(onBack === undefined ? {} : { onBack })}
      actions={!canAdd ? undefined :
        <button type="button" className="phone-icon" aria-label={NEW_LABEL[kind]} onClick={() => onEdit(blank(onCalendar && day.getTime() > today.getTime() ? onDay(day, now, zone) : undefined))}>
          <Icon name="plus" size={24} />
        </button>
      }
    >
      {kind === 'scheduled' && once ? (
        <div className="phone-seg prompt-views" style={{ '--count': 2, '--at': calendar ? 0 : 1 } as React.CSSProperties} role="radiogroup" aria-label="View">
          <span className="phone-seg-thumb" />
          <button type="button" role="radio" aria-checked={calendar} className={calendar ? 'on' : undefined} onClick={() => { tap('light'); setCalendar(true) }}>Calendar</button>
          <button type="button" role="radio" aria-checked={!calendar} className={calendar ? undefined : 'on'} onClick={() => { tap('light'); setCalendar(false) }}>List</button>
        </div>
      ) : null}
      {onCalendar ? (
        <div className="phone-cal">
          <div className="phone-cal-head">
            <button type="button" className="phone-icon" aria-label="Previous month" onClick={() => setMonth(shiftMonths(month, -1))}><Icon name="left" size={18} /></button>
            <b>{`${MONTH_LONG[month.getUTCMonth()] ?? ''} ${String(month.getUTCFullYear())}`}</b>
            <button type="button" className="phone-icon" aria-label="Next month" onClick={() => setMonth(shiftMonths(month, 1))}><Icon name="right" size={18} /></button>
          </div>
          <div className="phone-cal-grid">
            {WEEKDAY_HEADS.map((name) => <span key={name} className="wd">{name.slice(0, 1)}</span>)}
            {monthGrid(month).map((date) => {
              const runs = prompts.filter((one) => one.at !== undefined && sameDay(civilDay(one.at, zone), date))
              return (
                <button key={date.getTime()} type="button" className={[date.getUTCMonth() === month.getUTCMonth() ? '' : 'other', sameDay(date, today) ? 'today' : '', sameDay(date, day) ? 'on' : ''].filter(Boolean).join(' ')} aria-label={`${dayText(date)}${runs.length === 0 ? '' : `, ${String(runs.length)} scheduled`}`} aria-pressed={sameDay(date, day)} onClick={() => { tap('light'); setDay(date) }}>
                  <span>{date.getUTCDate()}</span>
                  <i className={runs.length === 0 ? 'none' : runs.some(isProblem) ? 'problem' : ''} />
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
      {onCalendar ? <div className="phone-head-line">{dayText(day)}</div> : kind === 'scheduled' && prompts.length > 0 ? <div className="phone-head-line">Next</div> : null}
      {onCalendar && listed.length === 0 ? (
        <div className="phone-empty">
          {`Nothing scheduled on ${dayText(day)}.`}
          {day.getTime() < today.getTime() ? null : <button type="button" className="phone-empty-action" onClick={() => onEdit(blank(onDay(day, now, zone)))}>New scheduled</button>}
        </div>
      ) : !onCalendar && prompts.length === 0 && deleted === undefined ? (
        <div className="phone-empty">
          <strong>{emptyTitle}</strong>
          {emptyLine}
          {canAdd ? <button type="button" className="phone-empty-action" onClick={() => onEdit(blank())}>{NEW_LABEL[kind]}</button> : null}
        </div>
      ) : (
        <div className="phone-group phone-shortcuts">
          {listed.map(row)}
          {deleted === undefined || kindOf(deleted) !== kind ? null : <div className="phone-undo" role="status">{`Deleted ${deleted.name}.`}<button type="button" onClick={() => setDeleted(undefined)}>Undo</button></div>}
        </div>
      )}
      {kind === 'scheduled' && !onCalendar && ran.length > 0 ? <>
        <div className="phone-head-line">Ran today</div>
        <div className="phone-group phone-shortcuts">
          {ran.map((one) => (
            <div key={one.id} className="phone-shortcut">
              <WhoMark chat={chat} prompt={one} size={30} />
              <span className="phone-shortcut-text"><span className="phone-row-title">{one.name}</span><span className="phone-shortcut-when">{one.outcome?.state === 'ran' ? ranLine(one.outcome, zone) : ''}</span></span>
              {one.outcome?.state === 'ran' && one.outcome.session !== undefined ? <button type="button" className="phone-pill" onClick={() => { if (one.outcome?.state === 'ran' && one.outcome.session !== undefined) chat.goTo(one.outcome.session) }}>Open</button> : null}
            </div>
          ))}
        </div>
      </> : null}
      {runError === '' ? null : <p className="recurrence-error" role="alert">{runError}</p>}
      {kind === 'shortcut' ? null : <div className="phone-note">Runs happen on the host while GeckIt is open there.</div>}
      {target !== undefined && acting?.sheet === 'more' ? (
        <Menu
          anchor={new DOMRect()}
          title={target.name}
          choices={[
            ...(kind === 'scheduled' ? [{ value: 'postpone', label: 'Postpone' }] : []),
            ...(kind === 'shortcut' && once ? [{ value: 'later', label: 'Run later...' }] : []),
            ...(kind === 'repeating' ? [{ value: 'pause', label: target.on ? 'Pause' : 'Resume' }] : []),
            { value: 'duplicate', label: 'Duplicate' },
            { value: 'delete', label: 'Delete', danger: true },
          ]}
          stays
          onPick={(value) => {
            if (value === 'postpone' || value === 'later') { setActing({ id: target.id, sheet: value }); return }
            setActing(undefined)
            if (value === 'duplicate') onEdit(duplicateDraft(target, Date.now(), zone))
            else if (value === 'delete') remove(target)
            else if (value === 'pause') void saveShortcut(window.geckit.shortcuts, chat.settings, { ...asDraft(target), on: !target.on }).catch(() => undefined)
          }}
          onClose={() => setActing((was) => was?.sheet === 'more' ? undefined : was)}
        />
      ) : null}
      {target !== undefined && (acting?.sheet === 'postpone' || acting?.sheet === 'later') ? (
        <Menu
          anchor={new DOMRect()}
          title={`${acting.sheet === 'later' ? 'Run later' : 'Postpone'} "${target.name}"`}
          choices={[...postponeChoices(now, zone).map((one) => ({ value: String(one.at), label: one.label })), { value: 'choose', label: 'Choose...' }]}
          onPick={(value) => {
            if (value === 'choose') { onEdit(acting.sheet === 'later' ? runLaterDraft(target, Date.now(), zone) : asDraft(target)); return }
            const at = Number(value)
            if (acting.sheet === 'later') void saveShortcut(window.geckit.shortcuts, chat.settings, { ...runLaterDraft(target, Date.now(), zone), at }).catch(() => setRunError('Pick a time from now on.'))
            else void window.geckit.shortcuts.postpone(target.id, at).catch(() => setRunError('Pick a time from now on.'))
          }}
          onClose={() => setActing(undefined)}
        />
      ) : null}
    </Page>
  )
}

function Row({ chat, prompt, now, archived, busy: working, starting, run, onEdit, onRun, onHold }: { readonly chat: ShortcutChat; readonly prompt: Shortcut; readonly now: number; readonly archived: boolean; readonly busy: boolean; readonly starting: boolean; readonly run: Parameters<typeof ShortcutDelivery>[0]['run']; readonly onEdit: () => void; readonly onRun: () => void; readonly onHold: () => void }): React.JSX.Element {
  const kind = kindOf(prompt)
  const zone = chat.settings.calendarTimeZone
  const hold = useHold(onHold)
  const who = assigneeOf(chat, prompt).name
  const folder = <b style={{ color: `var(--project-${String(projectColor(prompt.root, chat.settings))})` }}>{projectLabel(prompt.root)}</b>
  const next = kind === 'repeating' ? nextSet(prompt, now, prompt.recurrence === undefined ? undefined : zone) : undefined
  const line = working ? <>Running now</>
    : kind === 'scheduled' ? isProblem(prompt) ? <span className="trouble">{problemLine(prompt)}</span> : <>{who} · {folder} · {prompt.postponedFrom === undefined ? scheduledWhen(prompt.at ?? now, now, zone) : `Postponed from ${dayName(prompt.postponedFrom, now, zone)} ${clockText(prompt.postponedFrom, zone)}`}</>
      : kind === 'repeating' ? <>{who} · {archived ? 'Paused while archived' : !prompt.on ? 'Paused' : `${timetableSaid(prompt)}${next === undefined ? '' : ` · Next ${describeTime(next, now, prompt.recurrence === undefined ? undefined : zone)}`}`}</>
        : <>{who} · {folder}</>
  return (
    <div className="phone-shortcut prompt-row" {...hold}>
      <WhoMark chat={chat} prompt={prompt} size={30} />
      <button type="button" className="phone-shortcut-text" onClick={onEdit}>
        <span className="phone-row-title">{prompt.name}</span>
        <span className="phone-shortcut-when">{line}</span>
        {prompt.destination === undefined ? null : <span className="shortcut-destination-summary">{destinationSummary(prompt.destination)}</span>}
      </button>
      <div className="phone-shortcut-side">
        <ShortcutDelivery run={run} />
        {kind === 'scheduled' && prompt.at !== undefined ? (
          <span className={`phone-when${isProblem(prompt) ? ' problem' : ''}`}><b>{clockText(prompt.at, zone)}</b><small>{dayName(prompt.at, now, zone)}</small></span>
        ) : kind === 'repeating' ? (
          <Switch on={prompt.on} label={`Run ${prompt.name} on its timetable`} disabled={archived} onChange={(on) => { tap('light'); void saveShortcut(window.geckit.shortcuts, chat.settings, { ...asDraft(prompt), on }).catch(() => undefined) }} />
        ) : (
          <button type="button" className="phone-pill" disabled={starting || archived} onClick={onRun}>{starting ? <Icon name="spinner" size={14} /> : 'Run'}</button>
        )}
      </div>
    </div>
  )
}

/** One prompt, new or kept, with every field the Mac's editor has; the kind is fixed and only the timing differs. */
const WAYS = [
  { way: 'write', icon: 'pencil', label: 'Write it', says: 'Folder, what to do, a checklist' },
  { way: 'say', icon: 'mic', label: 'Say it', says: 'Tell GeckIt what to start, answer or mark' },
  { way: 'record', icon: 'display', label: 'From a recording', says: 'A screen recording or a video; its words and frames become the task' },
] as const

// Three ways, a heading, six shortcuts and All shortcuts fit a 6.1-inch screen without the sheet scrolling.
const IN_SHEET = 6
// As long as connecting to the Mac is given.
const START = 20_000

/** The sheet a long press on New task opens: the ways to start one, then the shortcuts, each started by a tap. See docs/ux/phone-tabs.md. */
export function Ways({
  chat,
  onWay,
  onShortcuts,
  onClose,
}: {
  readonly chat: Chat
  readonly onWay: (way: (typeof WAYS)[number]['way']) => void
  readonly onShortcuts: () => void
  readonly onClose: () => void
}): React.JSX.Element {
  const [starting, setStarting] = useState<string | undefined>()
  const [failed, setFailed] = useState<string | undefined>()
  const shown = shownProjects(chat.settings)
  const shortcuts = chat.settings.shortcuts.filter((one) => shown.includes(one.root) && kindOf(one) === 'shortcut').slice(0, IN_SHEET)

  const start = (one: Shortcut): void => {
    tap('light')
    setStarting(one.id)
    setFailed(undefined)
    const late = new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), START))
    void Promise.race([window.geckit.shortcuts.run(one.id), late])
      .catch(() => undefined)
      .then((session) => {
        setStarting(undefined)
        if (session === undefined) {
          tap('warning')
          setFailed(one.id)
          return
        }
        onClose()
        chat.goTo(session)
      })
  }

  return (
    <Sheet title="New task" cancel={false} className="phone-ways" onClose={onClose}>
      <div className="sheet-list" role="menu">
        {WAYS.map((one) => (
          <button
            key={one.way}
            type="button"
            role="menuitem"
            className="sheet-option phone-way"
            onClick={() => {
              onClose()
              onWay(one.way)
            }}
          >
            <Icon name={one.icon} size={22} />
            <span className="sheet-words">
              <span className="label">{one.label}</span>
              <span className="says">{one.says}</span>
            </span>
          </button>
        ))}
      </div>
      {shortcuts.length === 0 ? null : (
        <>
          <div className="phone-ways-head">Shortcuts</div>
          <div className="sheet-list" role="menu">
            {shortcuts.map((one) => (
              <button
                key={one.id}
                type="button"
                role="menuitem"
                className="sheet-option"
                disabled={starting !== undefined}
                onClick={() => start(one)}
              >
                <span className="sheet-words">
                  <span className="label">{one.name}</span>
                  {starting === one.id ? (
                    <span className="says phone-ways-starting">
                      <Icon name="spinner" size={12} />
                      Starting
                    </span>
                  ) : failed === one.id ? (
                    <span className="says phone-ways-failed">Did not start. Tap to try again.</span>
                  ) : (
                    <span className="says" style={{ color: `var(--project-${String(projectColor(one.root, chat.settings))})` }}>
                      {projectLabel(one.root)}
                    </span>
                  )}
                </span>
              </button>
            ))}
            <button
              type="button"
              role="menuitem"
              className="sheet-option sheet-cancel"
              onClick={() => {
                onClose()
                onShortcuts()
              }}
            >
              All shortcuts
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}
