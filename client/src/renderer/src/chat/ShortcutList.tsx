import { useEffect, useMemo, useRef, useState } from 'react'

import { assistantFor, shownProjects } from '../../../shared/api'
import { isCodexProvider, providerModel } from '../../../shared/providers'
import type { ScheduledView, Shortcut, ShortcutDraft } from '../../../shared/api'
import { againDraft, defaultOnce, duplicateDraft, isProblem, kindOf, ranLine, runLaterDraft, scheduledLead, UNDO_FOR } from '../../../shared/prompt-kinds'
import type { PromptKind } from '../../../shared/prompt-kinds'
import { nextSet } from '../../../shared/schedule'
import { saveShortcut } from '../../../shared/shortcut-save'
import { useShortcutRuns } from './ShortcutDestinations'
import { Icon } from '../ui/Icon'
import { projectLabel } from './project'
import { FIRST_CRON, NEW_LABEL, PromptEditor } from './PromptEditor'
import type { ShortcutChat } from './PromptEditor'
import { assigneeSearch, PromptRow, WhoMark } from './PromptRow'
import { ScheduledCalendar } from './ScheduledCalendar'
import './scheduled.css'

export type { Repeats, ShortcutChat } from './PromptEditor'
export { FIRST_CRON, REPEATS, turned } from './PromptEditor'

const TITLE: Record<PromptKind, string> = { repeating: 'Repeating', scheduled: 'Scheduled', shortcut: 'Shortcuts' }
const ABOUT: Record<PromptKind, string> = {
  repeating: 'Prompts that run by themselves on a timetable while GeckIt is running.',
  scheduled: "Prompts that run once at their time. Postpone one until you're ready for it.",
  shortcut: 'Saved prompts for a new task or Manager. Run them here or from the gecko in the menu bar.',
}
const EMPTY: Record<PromptKind, readonly [string, string]> = {
  repeating: ['No repeating jobs', 'Run a prompt every day, weekday or week, like a morning plan.'],
  scheduled: ['Nothing scheduled', 'Plan a prompt to run once, later. You can postpone it until the time comes.'],
  shortcut: ['No shortcuts yet', 'Save a prompt you send often, like a code review.'],
}
const GLYPH: Record<PromptKind, string> = { repeating: 'refresh', scheduled: 'clock', shortcut: 'bolt' }
const VIEWS: readonly { readonly value: ScheduledView; readonly label: string; readonly icon: string; readonly tip: string }[] = [
  { value: 'week', label: 'Week', icon: 'week', tip: "Week: each day's runs with full names, who runs them and the model" },
  { value: 'month', label: 'Month', icon: 'calendar', tip: 'Month: the runs by day, drag one to another day to postpone it' },
  { value: 'list', label: 'List', icon: 'list', tip: 'List: the runs one under another, soonest first' },
]

const busy = (chat: ShortcutChat, session: string | undefined): boolean =>
  session !== undefined && chat.everyone.some((one) => one.id === session && (one.state === 'working' || one.state === 'asks'))

/** The prompts of one kind, in the order the page lists them. */
export function promptsOf(prompts: readonly Shortcut[], kind: PromptKind, now: number): readonly Shortcut[] {
  const list = prompts.filter((one) => kindOf(one) === kind && one.outcome?.state !== 'ran')
  if (kind === 'scheduled') return [...list].sort((a, b) => Number(isProblem(b)) - Number(isProblem(a)) || (a.at ?? 0) - (b.at ?? 0))
  if (kind === 'repeating') return [...list].sort((a, b) => Number(b.on) - Number(a.on) || (nextSet(a, now) ?? Infinity) - (nextSet(b, now) ?? Infinity))
  return list
}

/** Saved prompts of one kind, each run a new conversation or a message to Manager: Repeating on a timetable, Scheduled once at a set time, Shortcuts by hand. */
export function ShortcutList({
  chat,
  kind: placeKind,
  start,
  only = false,
  onTeam,
  onClose,
  onShowScheduled,
  place = false,
}: {
  readonly chat: ShortcutChat
  /** The page's kind; a prompt opened from elsewhere brings its own. */
  readonly kind?: PromptKind
  /** The list, `new`, a prompt's id to edit, or a new one already filled in. */
  readonly start: string | ShortcutDraft
  /** Opened for one prompt from Team: saving or cancelling closes it rather than showing the list. */
  readonly only?: boolean
  readonly onTeam?: () => void
  readonly onClose: () => void
  /** Run later's Show. */
  readonly onShowScheduled?: () => void
  /** Shown as a place of the Chat window, not over it: no scrim, no Done, and Escape leaves it where it is. */
  readonly place?: boolean
}): React.JSX.Element {
  // Another profile's prompts are kept and run, and listed only where that profile is in use.
  const shortcuts = chat.settings.shortcuts.filter((one) => shownProjects(chat.settings).includes(one.root))
  const startsOn = typeof start !== 'string' ? start : shortcuts.find((one) => one.id === start)
  const kind: PromptKind = startsOn !== undefined ? kindOf(startsOn) : placeKind ?? 'shortcut'
  const zone = chat.settings.calendarTimeZone
  const blank = (at?: number): ShortcutDraft => {
    const root = chat.root ?? shownProjects(chat.settings)[0] ?? ''
    const provider = assistantFor(chat.settings, root)
    return {
      name: '',
      root,
      prompt: '',
      mode: 'auto',
      provider,
      model: providerModel(chat.settings, provider),
      ...(isCodexProvider(provider) ? { reasoning: chat.settings.codexReasoning } : {}),
      on: true,
      ...(kind === 'scheduled' ? { at: at ?? defaultOnce(Date.now(), zone), vary: true } : kind === 'repeating' ? { cron: FIRST_CRON, vary: true } : {}),
    }
  }
  const [editing, setEditing] = useState<ShortcutDraft | undefined>(() => start === 'new' ? blank() : startsOn)
  const opener = useRef(document.activeElement)
  const returnTo = useRef<string | undefined>(undefined)
  const rowButtons = useRef(new Map<string, HTMLButtonElement>())
  useEffect(() => () => { if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus() }, [])
  useEffect(() => { if (editing === undefined && returnTo.current !== undefined) rowButtons.current.get(returnTo.current)?.focus() }, [editing])
  const lastRuns = useShortcutRuns(chat.settings)
  const [search, setSearch] = useState('')
  const [runError, setRunError] = useState('')
  const [runningId, setRunningId] = useState<string>()
  const [deleted, setDeleted] = useState<Shortcut>()
  const [later, setLater] = useState<{ readonly id: string; readonly at: number }>()
  const [now, setNow] = useState(Date.now)
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
  useEffect(() => {
    if (later === undefined) return
    const timer = setTimeout(() => setLater(undefined), 4_000)
    return () => clearTimeout(timer)
  }, [later])

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !place) onClose()
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose, place])

  const settings = chat.settings
  const ordered = useMemo(() => promptsOf(settings.shortcuts.filter((one) => shownProjects(settings).includes(one.root)), kind, now), [settings, kind, now])
  const all = ordered.filter((one) => one.id !== deleted?.id)
  const query = search.trim().toLowerCase()
  const found = query === '' ? all : all.filter((one) => assigneeSearch(chat, one).includes(query))
  const ran = kind === 'scheduled' ? shortcuts.filter((one) => one.at !== undefined && one.outcome?.state === 'ran' && one.id !== deleted?.id) : []
  const view: ScheduledView = chat.settings.scheduledView
  const canAdd = kind !== 'scheduled' || chat.settings.promptKindsVersion === 1
  const calendar = kind === 'scheduled' && canAdd && view !== 'list' && query === ''

  const run = (one: Shortcut): void => {
    const failed = one.target === 'manager' ? 'Could not run. Check Manager in Team.' : 'Could not run. Check the assistant and folder.'
    setRunningId(one.id)
    setRunError('')
    void window.geckit.shortcuts.run(one.id).then((session) => {
      if (session === undefined) { setRunError(failed); return }
      chat.goTo(session)
      onClose()
    }).catch(() => setRunError(failed)).finally(() => setRunningId(undefined))
  }
  const remove = (one: Shortcut): void => {
    if (deleted !== undefined) window.geckit.shortcuts.remove(deleted.id)
    setDeleted(one)
  }
  const edit = (one: Shortcut | ShortcutDraft): void => {
    if (one.id !== undefined) returnTo.current = one.id
    setEditing(one)
  }
  const employeeOf = (one: Shortcut): ShortcutChat['employees'][number] | undefined => one.employeeId === undefined ? undefined : chat.employees.find((employee) => employee.id === one.employeeId)

  const undoRow = deleted === undefined || kindOf(deleted) !== kind ? null : (
    <div className="undo-row" role="status">{`Deleted ${deleted.name}.`}<button type="button" onClick={() => setDeleted(undefined)}>Undo</button></div>
  )

  const rows = (
    <div className="shortcut-rows">
      {found.map((one) => (
        <PromptRow
          key={one.id}
          chat={chat}
          prompt={one}
          now={now}
          run={lastRuns.get(one.id)}
          running={busy(chat, one.lastSession)}
          starting={runningId === one.id}
          archived={employeeOf(one)?.archived === true}
          hit={false}
          rowRef={(node) => { if (node === null) rowButtons.current.delete(one.id); else rowButtons.current.set(one.id, node) }}
          onEdit={() => edit(one)}
          onRun={() => run(one)}
          onOpen={() => { if (one.lastSession !== undefined) chat.goTo(one.lastSession); onClose() }}
          onDuplicate={() => setEditing(duplicateDraft(one, Date.now(), zone))}
          onDelete={() => remove(one)}
          onPostpone={(at) => { void window.geckit.shortcuts.postpone(one.id, at).catch(() => setRunError('Pick a time from now on.')) }}
          onRunLater={(at) => {
            void saveShortcut(window.geckit.shortcuts, chat.settings, { ...runLaterDraft(one, Date.now(), zone), at }).then(() => setLater({ id: one.id, at })).catch(() => setRunError('Pick a time from now on.'))
          }}
          note={later?.id === one.id ? <div className="row-note" role="status">{`Scheduled for ${scheduledLead(later.at, now, zone)}.`}{onShowScheduled === undefined ? null : <button type="button" onClick={onShowScheduled}>Show</button>}</div> : undefined}
        />
      ))}
      {undoRow}
    </div>
  )

  const [emptyTitle, emptyLine] = EMPTY[kind]
  const body = calendar ? (
    <>
      <ScheduledCalendar
        chat={chat}
        prompts={all}
        view={view === 'month' ? 'month' : 'week'}
        now={now}
        onEdit={edit}
        onRun={run}
        onDuplicate={(draft) => setEditing(draft)}
        onDelete={remove}
        onNew={(at) => setEditing(blank(at))}
      />
      {undoRow === null ? null : <div className="shortcut-rows cal-undo">{undoRow}</div>}
    </>
  ) : all.length === 0 && undoRow === null ? (
    <div className="shortcut-empty"><Icon name={GLYPH[kind]} size={18} /><strong>{emptyTitle}</strong><span>{emptyLine}</span>{canAdd ? <button type="button" className="primary" onClick={() => setEditing(blank())}>{NEW_LABEL[kind]}</button> : null}</div>
  ) : found.length === 0 && undoRow === null ? (
    <div className="shortcut-empty"><span>Nothing matches.</span></div>
  ) : rows

  return (
    <div className={place ? 'place-dialog' : 'dialog-scrim'} onMouseDown={place ? undefined : onClose}>
      <div className={`dialog shortcut-list${place ? ' in-place' : ''}${calendar ? ' cal-mode' : ''}`} onMouseDown={(event) => event.stopPropagation()}>
        {editing === undefined ? (
          <>
            <header className="shortcut-list-head board-head">
              {kind === 'scheduled' && canAdd ? <div className="board-views" role="group" aria-label="View controls">
                <div className="views" role="radiogroup" aria-label="View">
                  {VIEWS.map((one) => <button key={one.value} type="button" role="radio" aria-checked={view === one.value} className={view === one.value ? 'on' : undefined} title={one.tip} onClick={() => chat.change?.({ scheduledView: one.value })}><Icon name={one.icon} /><span>{one.label}</span></button>)}
                </div>
              </div> : null}
              {all.length === 0 ? null : <label className="employee-find shortcut-find"><Icon name="search" size={13} /><input type="search" aria-label={`Search ${TITLE[kind].toLowerCase()}`} placeholder="Search" value={search} onChange={(event) => setSearch(event.target.value)} />{search === '' ? null : <button type="button" className="find-clear" aria-label="Clear search" onClick={() => setSearch('')}><Icon name="close" size={8} /></button>}</label>}
              <span className="spacer" />
              {canAdd ? <button type="button" className="primary shortcut-new" onClick={() => setEditing(blank())}><Icon name="plus" size={12} />{NEW_LABEL[kind]}</button> : null}
            </header>
            {calendar ? null : <div className="prompt-page-title">
              <h2>{TITLE[kind]}{all.length === 0 ? null : <span className="employee-count">{all.length}</span>}</h2>
              <p className="shortcut-list-about">{ABOUT[kind]}</p>
            </div>}
            {body}
            {kind !== 'scheduled' || calendar || query !== '' || ran.length === 0 ? null : <>
              <div className="shortcut-group ran">Ran today</div>
              <div className="shortcut-rows ran">
                {ran.map((one) => (
                  <div key={one.id} className="shortcut-row">
                    <WhoMark chat={chat} prompt={one} />
                    <span className="shortcut-text">
                      <span className="shortcut-name">{one.name}</span>
                      <span className="shortcut-when"><span>{projectLabel(one.root)}</span>{one.outcome?.state === 'ran' ? <span>{ranLine(one.outcome, zone)}</span> : null}</span>
                    </span>
                    <span className="shortcut-actions">
                      <button type="button" className="quiet" onClick={() => setEditing(againDraft(one, Date.now(), zone))}>Schedule again</button>
                      {one.outcome?.state === 'ran' && one.outcome.session !== undefined ? <button type="button" className="quiet shortcut-run" onClick={() => { if (one.outcome?.state === 'ran' && one.outcome.session !== undefined) chat.goTo(one.outcome.session); onClose() }}>Open<Icon name="right" size={11} /></button> : null}
                    </span>
                  </div>
                ))}
              </div>
            </>}
            {runError === '' ? null : <p className="shortcut-next wrong" role="alert">{runError}</p>}
            {(onTeam === undefined || calendar) && place ? null : <div className="dialog-actions">
              {onTeam === undefined ? null : <button type="button" className="quiet" onClick={onTeam}>Manage in Team</button>}
              <span className="spacer" />
              {place ? null : <button type="button" className="quiet" onClick={onClose}>Done</button>}
            </div>}
          </>
        ) : (
          <PromptEditor key={editing.id ?? `new-${kindOf(editing)}-${editing.name}`} chat={chat} given={editing} now={now} onDone={only ? onClose : () => setEditing(undefined)} />
        )}
      </div>
    </div>
  )
}
