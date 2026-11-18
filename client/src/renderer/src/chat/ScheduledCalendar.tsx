import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { ScheduledView, Shortcut, ShortcutDraft } from '../../../shared/api'
import { asDraft, civilDay, clockText, dayText, duplicateDraft, isProblem, monthGrid, MONTH_LONG, movedTo, onceError, onDay, problemLine, sameDay, scheduledLead, shiftDays, shiftMonths, UNDO_FOR, WEEKDAY_HEADS, weekHeading, weekOf } from '../../../shared/prompt-kinds'
import { projectColor } from '../../../shared/project-color'
import { saveShortcut } from '../../../shared/shortcut-save'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import { MOD } from '../ui/Shortcuts'
import { assigneeOf, modelShown, WhenMenu, WhoMark } from './PromptRow'
import type { ShortcutChat } from './PromptEditor'
import { projectLabel, tint } from './project'

type Open =
  | { readonly kind: 'chip'; readonly id: string; readonly anchor: DOMRect }
  | { readonly kind: 'postpone'; readonly id: string; readonly anchor: DOMRect }
  | { readonly kind: 'day'; readonly day: Date; readonly anchor: DOMRect }

interface Note {
  readonly text: string
  readonly wrong?: boolean
  readonly undo?: { readonly before: Shortcut }
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Scheduled as a week of columns or a month like Apple Calendar's: click a run for its menu, drag it to another day to postpone, Option-drag to copy. */
export function ScheduledCalendar({
  chat,
  prompts,
  view,
  now,
  onEdit,
  onRun,
  onDuplicate,
  onDelete,
  onNew,
}: {
  readonly chat: ShortcutChat
  /** The Scheduled prompts, soonest first. */
  readonly prompts: readonly Shortcut[]
  readonly view: Exclude<ScheduledView, 'list'>
  readonly now: number
  readonly onEdit: (prompt: Shortcut | ShortcutDraft) => void
  readonly onRun: (prompt: Shortcut) => void
  readonly onDuplicate: (draft: ShortcutDraft) => void
  readonly onDelete: (prompt: Shortcut) => void
  readonly onNew: (at: number) => void
}): React.JSX.Element {
  const zone = chat.settings.calendarTimeZone
  const today = civilDay(now, zone)
  const [day, setDay] = useState(today)
  const [month, setMonth] = useState(() => shiftMonths(today, 0))
  const [open, setOpen] = useState<Open>()
  const [note, setNote] = useState<Note>()
  const [dragging, setDragging] = useState<string>()
  const [over, setOver] = useState<number>()
  const grid = useRef<HTMLDivElement>(null)
  const focusDay = useRef(false)
  useEffect(() => {
    if (note?.undo === undefined) return
    const timer = setTimeout(() => setNote(undefined), UNDO_FOR)
    return () => clearTimeout(timer)
  }, [note])
  useLayoutEffect(() => {
    if (!focusDay.current) return
    focusDay.current = false
    grid.current?.querySelector<HTMLElement>(`[data-day="${String(day.getTime())}"]`)?.focus()
  }, [day, month, view])

  const runsOn = (date: Date): readonly Shortcut[] => prompts.filter((one) => one.at !== undefined && sameDay(civilDay(one.at, zone), date))
  const select = (next: Date, focus = true): void => {
    focusDay.current = focus
    setDay(next)
    setMonth(shiftMonths(next, 0))
  }
  const opened = (id: string): boolean => (open?.kind === 'chip' || open?.kind === 'postpone') && open.id === id

  const moveTo = (id: string, date: Date, copy: boolean): void => {
    const prompt = prompts.find((one) => one.id === id)
    if (prompt?.at === undefined) return
    const at = movedTo(prompt.at, date, zone)
    if (!copy && sameDay(civilDay(prompt.at, zone), date)) return
    if (onceError(at, now) !== undefined) {
      setNote({ wrong: true, text: `${clockText(prompt.at, zone)} on ${dayText(date)} has passed. Drop it on a later day or use Postpone.` })
      return
    }
    if (copy) { onDuplicate({ ...duplicateDraft(prompt, now, zone), at }); return }
    select(date, false)
    void window.geckit.shortcuts.postpone(id, at).then(() => setNote({ text: `Moved ${prompt.name} to ${dayText(date)}.`, undo: { before: prompt } })).catch(() => setNote({ wrong: true, text: `${clockText(prompt.at ?? at, zone)} on ${dayText(date)} has passed. Drop it on a later day or use Postpone.` }))
  }
  const undo = (before: Shortcut): void => {
    setNote(undefined)
    if (before.at !== undefined) select(civilDay(before.at, zone), false)
    if (before.postponedFrom !== undefined && before.at !== undefined) void window.geckit.shortcuts.postpone(before.id, before.at).catch(() => undefined)
    else void saveShortcut(window.geckit.shortcuts, chat.settings, asDraft(before)).catch(() => undefined)
  }

  const chipProps = (prompt: Shortcut): React.ButtonHTMLAttributes<HTMLButtonElement> & { 'data-chip': string } => ({
    type: 'button',
    'data-chip': prompt.id,
    'aria-haspopup': 'menu',
    'aria-expanded': opened(prompt.id),
    draggable: !isProblem(prompt),
    style: tint(projectColor(prompt.root, chat.settings)),
    onClick: (event) => {
      event.stopPropagation()
      if (prompt.at !== undefined) select(civilDay(prompt.at, zone), false)
      setOpen(opened(prompt.id) ? undefined : { kind: 'chip', id: prompt.id, anchor: event.currentTarget.getBoundingClientRect() })
    },
    onContextMenu: (event) => {
      event.preventDefault()
      event.stopPropagation()
      setOpen({ kind: 'chip', id: prompt.id, anchor: event.currentTarget.getBoundingClientRect() })
    },
    onKeyDown: (event) => {
      if (event.key.toLowerCase() === 'd' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); event.stopPropagation(); onDuplicate(duplicateDraft(prompt, now, zone)) }
      if (event.key === 'Enter' || event.key === ' ') event.stopPropagation()
    },
    onDragStart: (event) => {
      setDragging(prompt.id)
      event.dataTransfer.effectAllowed = 'copyMove'
      event.dataTransfer.setData('text/plain', prompt.id)
    },
    onDragEnd: () => { setDragging(undefined); setOver(undefined) },
  })

  const chip = (prompt: Shortcut, inPopover = false): React.JSX.Element => {
    const who = assigneeOf(chat, prompt)
    const model = modelShown(prompt)
    const props = chipProps(prompt)
    return (
      <button
        key={prompt.id}
        {...props}
        className={`cal-chip${isProblem(prompt) ? ' problem' : ''}${dragging === prompt.id ? ' dragging' : ''}`}
        title={`${prompt.name}, ${clockText(prompt.at ?? 0, zone)} · ${who.name}${model === undefined ? '' : ` · ${model}`}`}
        {...(inPopover ? { draggable: false, onClick: (event: React.MouseEvent<HTMLButtonElement>) => { event.stopPropagation(); if (open !== undefined) setOpen({ kind: 'chip', id: prompt.id, anchor: open.anchor }) } } : {})}
      >
        <i />
        <span>{prompt.name}</span>
        <time>{clockText(prompt.at ?? 0, zone)}</time>
      </button>
    )
  }

  const card = (prompt: Shortcut): React.JSX.Element => {
    const who = assigneeOf(chat, prompt)
    const model = modelShown(prompt)
    return (
      <button key={prompt.id} {...chipProps(prompt)} className={`wk-card${isProblem(prompt) ? ' problem' : ''}${dragging === prompt.id ? ' dragging' : ''}`}>
        <time>{clockText(prompt.at ?? 0, zone)}</time>
        <b className="t">{prompt.name}</b>
        <span className="who"><WhoMark chat={chat} prompt={prompt} size={18} /><span>{who.name}</span></span>
        {model === undefined ? null : <small>{model}</small>}
        {prompt.outcome?.state === 'missed' ? <small className="trouble">Missed</small> : prompt.outcome?.state === 'didnt-start' ? <small className="trouble">Didn't start</small> : null}
      </button>
    )
  }

  const dayCell = (date: Date, className: string, children: React.ReactNode): React.JSX.Element => {
    const runs = runsOn(date)
    const past = date.getTime() < today.getTime()
    const weekday = date.getUTCDay()
    const selected = sameDay(date, day)
    return (
      <div
        key={date.getTime()}
        className={[className, sameDay(date, today) ? 'today' : '', selected ? 'on' : '', weekday === 0 || weekday === 6 ? 'weekend' : '', over === date.getTime() ? 'drop' : ''].filter(Boolean).join(' ')}
        role="gridcell"
        tabIndex={selected ? 0 : -1}
        aria-selected={selected}
        aria-label={`${dayText(date)}${sameDay(date, today) ? ', today' : ''}${runs.length === 0 ? '' : `, ${String(runs.length)} scheduled`}`}
        data-day={date.getTime()}
        onClick={(event) => {
          if (event.detail >= 2) {
            if (!past) onNew(onDay(date, Date.now(), zone))
            return
          }
          setOpen(undefined)
          if (note?.wrong === true) setNote(undefined)
          select(date)
        }}
        onDragOver={(event) => {
          if (dragging === undefined) return
          event.preventDefault()
          event.dataTransfer.dropEffect = event.altKey ? 'copy' : 'move'
          if (!past && over !== date.getTime()) setOver(date.getTime())
        }}
        onDragLeave={() => { if (over === date.getTime()) setOver(undefined) }}
        onDrop={(event) => {
          event.preventDefault()
          const id = dragging ?? event.dataTransfer.getData('text/plain')
          setDragging(undefined)
          setOver(undefined)
          moveTo(id, date, event.altKey)
        }}
      >
        {children}
      </div>
    )
  }

  const step = (days: number, months: number): void => {
    setOpen(undefined)
    setNote(undefined)
    if (months !== 0) {
      const next = shiftMonths(month, months)
      setMonth(next)
      setDay(next)
      return
    }
    select(shiftDays(day, days), false)
  }

  const onKey = (event: React.KeyboardEvent): void => {
    if (!(event.target instanceof HTMLElement) || !event.target.matches('[role="gridcell"]')) return
    const by = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number | undefined>)[event.key]
    if (by !== undefined) { event.preventDefault(); select(shiftDays(day, by)); return }
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      const back = event.key === 'PageUp' ? -1 : 1
      if (view === 'week') select(shiftDays(day, 7 * back))
      else select(shiftMonths(month, back))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const cell = event.target.getBoundingClientRect()
      setOpen({ kind: 'day', day, anchor: view === 'week' ? new DOMRect(cell.left, cell.top, cell.width, Math.min(cell.height, 40)) : cell })
    }
  }

  const head = view === 'week' ? (() => {
    const week = weekOf(day)
    const heading = weekHeading(week)
    const year = heading.slice(heading.lastIndexOf(' ') + 1)
    return <div className="cal-head">
      <h2>{heading.slice(0, heading.lastIndexOf(' '))} <span>{year}</span></h2>
      <span className="spacer" />
      <button type="button" className="icon-button" aria-label="Previous week" title="Previous week" onClick={() => step(-7, 0)}><Icon name="left" /></button>
      <button type="button" className="quiet" onClick={() => { setOpen(undefined); setNote(undefined); select(today, false) }}>Today</button>
      <button type="button" className="icon-button" aria-label="Next week" title="Next week" onClick={() => step(7, 0)}><Icon name="right" /></button>
    </div>
  })() : <div className="cal-head">
    <h2>{MONTH_LONG[month.getUTCMonth()]} <span>{month.getUTCFullYear()}</span></h2>
    <span className="spacer" />
    <button type="button" className="icon-button" aria-label="Previous month" title="Previous month" onClick={() => step(0, -1)}><Icon name="left" /></button>
    <button type="button" className="quiet" onClick={() => { setOpen(undefined); setNote(undefined); select(today, false) }}>Today</button>
    <button type="button" className="icon-button" aria-label="Next month" title="Next month" onClick={() => step(0, 1)}><Icon name="right" /></button>
  </div>

  const body = view === 'week' ? (() => {
    const week = weekOf(day)
    const total = week.reduce((sum, date) => sum + runsOn(date).length, 0)
    return <div ref={grid} className="cal wk" role="grid" aria-label="Scheduled runs this week" onKeyDown={onKey}>
      {week.map((date) => <div key={`h${String(date.getTime())}`} className={`wk-head${sameDay(date, today) ? ' today' : ''}`} role="columnheader"><span>{DAY_NAMES[date.getUTCDay()]}</span><b className="n">{date.getUTCDate()}</b></div>)}
      {week.map((date) => dayCell(date, 'cal-day wk-col', runsOn(date).map(card)))}
      {total === 0 ? <p className="wk-empty">Nothing scheduled this week. Double-click a day to plan a run.</p> : null}
    </div>
  })() : <div ref={grid} className="cal" role="grid" aria-label="Scheduled runs by day" onKeyDown={onKey}>
    {WEEKDAY_HEADS.map((name) => <div key={name} className="cal-wd" role="columnheader">{name}</div>)}
    {monthGrid(month).map((date) => {
      const runs = runsOn(date)
      const fit = runs.length > 3 ? 2 : 3
      return dayCell(date, `cal-day${date.getUTCMonth() === month.getUTCMonth() ? '' : ' other'}`, <>
        <span className="n">{date.getUTCDate()}</span>
        {runs.slice(0, fit).map((one) => chip(one))}
        {runs.length > fit ? <button type="button" className="cal-more" aria-haspopup="dialog" onClick={(event) => {
          event.stopPropagation()
          select(date, false)
          const cell = event.currentTarget.closest('.cal-day')
          setOpen({ kind: 'day', day: date, anchor: (cell ?? event.currentTarget).getBoundingClientRect() })
        }}>{`${String(runs.length - fit)} more`}</button> : null}
      </>)
    })}
  </div>

  const menuOf = (id: string): Shortcut | undefined => prompts.find((one) => one.id === id)
  const chipMenu = open?.kind === 'chip' ? menuOf(open.id) : undefined
  const postponing = open?.kind === 'postpone' ? menuOf(open.id) : undefined
  const chipHead = (prompt: Shortcut): React.JSX.Element => {
    const who = assigneeOf(chat, prompt)
    const model = modelShown(prompt)
    const problem = problemLine(prompt)
    return <div className="menu-head"><b>{prompt.name}</b>{problem === undefined ? <small>{[scheduledLead(prompt.at ?? 0, now, zone), who.name, projectLabel(prompt.root), ...(model === undefined ? [] : [model])].join(' · ')}</small> : <small className="trouble">{problem}</small>}</div>
  }

  return (
    <div className="cal-view">
      {head}
      {body}
      <div className={`cal-note${note?.wrong === true ? ' wrong' : ''}`} role="status">
        {note === undefined ? null : <>{note.text}{note.undo === undefined ? null : <button type="button" onClick={() => { if (note.undo !== undefined) undo(note.undo.before) }}>Undo</button>}</>}
      </div>
      {chipMenu === undefined || open?.kind !== 'chip' ? null : <Menu
        anchor={open.anchor}
        autoFocus
        head={chipHead(chipMenu)}
        choices={[
          { value: 'edit', label: 'Edit' },
          { value: 'run', label: 'Run now' },
          { value: 'postpone', label: 'Postpone...' },
          { value: 'duplicate', label: 'Duplicate', says: `${MOD}+D` },
          { value: 'delete', label: 'Delete', danger: true, divided: true },
        ]}
        onPick={(value) => {
          if (value === 'edit') onEdit(chipMenu)
          else if (value === 'run') onRun(chipMenu)
          else if (value === 'duplicate') onDuplicate(duplicateDraft(chipMenu, now, zone))
          else if (value === 'delete') onDelete(chipMenu)
          else if (value === 'postpone') setOpen({ kind: 'postpone', id: chipMenu.id, anchor: open.anchor })
        }}
        onClose={() => setOpen((was) => was?.kind === 'chip' ? undefined : was)}
      />}
      {postponing === undefined || open?.kind !== 'postpone' ? null : <WhenMenu anchor={open.anchor} head={chipHead(postponing)} zone={zone} action="Postpone" now={now} onPick={(at) => { void window.geckit.shortcuts.postpone(postponing.id, at).then(() => select(civilDay(at, zone), false)).catch(() => undefined) }} onClose={() => setOpen(undefined)} />}
      {open?.kind === 'day' ? <Menu
        anchor={open.anchor}
        autoFocus
        head={<div className="day-pop">
          <div className="menu-head"><b>{dayText(open.day)}</b></div>
          {runsOn(open.day).length === 0 ? <div className="none">Nothing scheduled.</div> : runsOn(open.day).map((one) => chip(one, true))}
        </div>}
        choices={open.day.getTime() < today.getTime() ? [] : [{ value: 'new', label: 'New scheduled on this day', divided: runsOn(open.day).length > 0 }]}
        onPick={() => onNew(onDay(open.day, Date.now(), zone))}
        onClose={() => setOpen((was) => was?.kind === 'day' ? undefined : was)}
      /> : null}
    </div>
  )
}
