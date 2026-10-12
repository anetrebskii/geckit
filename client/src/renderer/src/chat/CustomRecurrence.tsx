import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import type { CalendarRecurrence } from '../../../shared/api'
import { describeRecurrence, monthlyLabels, nextRecurrence, RECURRENCE_DAYS, recurrenceError } from '../../../shared/recurrence'
import { describeTime, WEEKDAYS } from '../../../shared/schedule'
import { Picker } from '../ui/Menu'
import { Icon } from '../ui/Icon'
import { Cell } from './PhoneKit'

export function CustomRecurrence({ given, now, zone, phone = false, onDone, onCancel }: {
  readonly given: CalendarRecurrence
  readonly now: number
  readonly zone?: string
  readonly phone?: boolean
  readonly onDone: (rule: CalendarRecurrence) => void
  readonly onCancel: () => void
}): React.JSX.Element {
  const [draft, setDraft] = useState(given)
  const [interval, setInterval] = useState(String(given.interval))
  const [count, setCount] = useState(given.end.kind === 'after' ? String(given.end.count) : '1')
  const [endDate, setEndDate] = useState(given.end.kind === 'on' ? given.end.date : given.start)
  const rule = useMemo<CalendarRecurrence>(() => ({ ...draft, interval: Number(interval), end: draft.end.kind === 'never' ? draft.end : draft.end.kind === 'on' ? { kind: 'on', date: endDate } : { kind: 'after', count: Number(count) } }), [draft, interval, count, endDate])
  const error = useMemo(() => recurrenceError(rule, zone), [rule, zone])
  const next = useMemo(() => error === undefined ? nextRecurrence(rule, now, zone) : undefined, [rule, now, zone, error])
  const form = useRef<HTMLDivElement>(null)
  const first = useRef<HTMLInputElement>(null)
  const menuOpener = useRef<HTMLElement | null>(null)
  const latest = useRef({ onCancel, onDone, rule, error })
  useEffect(() => { latest.current = { onCancel, onDone, rule, error } }, [onCancel, onDone, rule, error])
  const id = useId()
  const errorId = `${id}-error`
  const field = error === 'Choose a start date and time.' ? 'start' : error === 'Enter a whole number of 1 or more.' ? 'interval' : error === 'Choose at least one day.' ? 'weekdays' : error === 'Choose an end date on or after the start date.' ? 'endDate' : error === 'Enter a whole number from 1 to 10,000.' ? 'count' : 'summary'
  const invalid = (name: string): { readonly 'aria-invalid': boolean; readonly 'aria-describedby'?: string } => ({ 'aria-invalid': error !== undefined && field === name, ...(error !== undefined && field === name ? { 'aria-describedby': errorId } : {}) })
  const message = (name: string): React.ReactNode => error !== undefined && field === name ? <span id={errorId} className="recurrence-error" role="alert">{error}</span> : null
  const change = (value: Partial<CalendarRecurrence>): void => setDraft({ ...draft, ...value })
  const done = (): void => { if (error === undefined) onDone(rule) }
  const openMenu = (): void => {
    menuOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[role="menu"] button:not(:disabled)')?.focus())
  }

  useEffect(() => {
    if (phone) form.current?.focus()
    else first.current?.focus()
    const key = (event: KeyboardEvent): void => {
      const menu = document.querySelector<HTMLElement>('[role="menu"]')
      if (menu !== null) {
        if (event.key === 'Escape') requestAnimationFrame(() => menuOpener.current?.focus())
        const controls = (menu.closest('.sheet') ?? menu).querySelectorAll<HTMLElement>('button:not(:disabled)')
        const index = Array.from(controls).findIndex((one) => one === document.activeElement)
        const direction = event.key === 'ArrowDown' || (event.key === 'Tab' && !event.shiftKey) ? 1 : event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey) ? -1 : 0
        if (direction !== 0 && controls.length > 0) {
          event.preventDefault()
          event.stopImmediatePropagation()
          controls[(index + direction + controls.length) % controls.length]?.focus()
        }
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        latest.current.onCancel()
      } else if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault()
        event.stopImmediatePropagation()
        if (latest.current.error === undefined) latest.current.onDone(latest.current.rule)
      } else if (event.key === 'Tab') {
        const controls = Array.from(form.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? []).filter((control) => !(control instanceof HTMLInputElement && control.type === 'radio' && !control.checked))
        const start = controls?.[0]
        const end = controls?.[controls.length - 1]
        if (document.activeElement === form.current) { event.preventDefault(); (event.shiftKey ? end : start)?.focus() }
        else if (event.shiftKey && document.activeElement === start) { event.preventDefault(); end?.focus() }
        else if (!event.shiftKey && document.activeElement === end) { event.preventDefault(); start?.focus() }
      }
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [phone])

  const startInput = <input id={`${id}-start`} className={phone ? 'phone-time' : undefined} type="date" value={draft.start} {...invalid('start')} onChange={(event) => change({ start: event.target.value })} />
  const timeInput = <input id={`${id}-time`} className={phone ? 'phone-time' : undefined} type="time" value={draft.time} {...invalid('start')} onChange={(event) => change({ time: event.target.value })} />
  const repeatControls = <div className="recurrence-interval"><input ref={first} id={`${id}-interval`} className={phone ? 'phone-number' : undefined} type="number" inputMode={phone ? 'numeric' : undefined} min={1} step={1} value={interval} {...invalid('interval')} onChange={(event) => setInterval(event.target.value)} /><Picker onOpen={openMenu} className={phone ? 'recurrence-picker' : 'select'} label={`${draft.unit}${Number(interval) === 1 ? '' : 's'}`} choices={(['day', 'week', 'month', 'year'] as const).map((unit) => ({ value: unit, label: `${unit}${Number(interval) === 1 ? '' : 's'}` }))} chosen={draft.unit} onPick={(unit) => { if (unit === 'day' || unit === 'week' || unit === 'month' || unit === 'year') { change({ unit }); requestAnimationFrame(() => menuOpener.current?.focus()) } }} /></div>
  const monthlyPicker = <Picker onOpen={openMenu} className={phone ? 'recurrence-picker' : 'select'} label={phone ? <span>{monthlyLabels(draft)[draft.monthly === 'day' ? 0 : draft.monthly === 'ordinal' ? 1 : 2]}</span> : monthlyLabels(draft)[draft.monthly === 'day' ? 0 : draft.monthly === 'ordinal' ? 1 : 2]} choices={(['day', 'ordinal', 'last'] as const).map((value, index) => ({ value, label: monthlyLabels(draft)[index] ?? '' }))} chosen={draft.monthly} onPick={(monthly) => { if (monthly === 'day' || monthly === 'ordinal' || monthly === 'last') { change({ monthly }); requestAnimationFrame(() => menuOpener.current?.focus()) } }} />

  return createPortal(<div className={`dialog-scrim recurrence-scrim${phone ? ' phone' : ''}`} onMouseDown={(event) => event.stopPropagation()}>
    <div ref={form} tabIndex={phone ? -1 : undefined} className={`dialog recurrence-dialog${phone ? ' phone-recurrence' : ''}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
      {phone ? <div className="phone-task-bar"><button type="button" onClick={onCancel}>Cancel</button><b id={`${id}-title`}>Custom recurrence</b><button type="button" className="strong" disabled={error !== undefined} onClick={done}>Done</button></div> : <h2 id={`${id}-title`}>Custom recurrence</h2>}
      <div className="recurrence-body">
        <div className={`recurrence-start${phone ? ' phone-group' : ''}`}>
          {phone ? <><Cell label={<label htmlFor={`${id}-start`}>Starts</label>}>{startInput}</Cell><Cell label={<label htmlFor={`${id}-time`}>At</label>}>{timeInput}</Cell></> : <><div className="field"><label htmlFor={`${id}-start`}>Starts</label>{startInput}</div><div className="field"><label htmlFor={`${id}-time`}>At</label>{timeInput}</div></>}
        </div>
        {message('start')}
        <div className={phone ? 'phone-group phone-form-group recurrence-frequency' : 'field'}>{phone ? <Cell label={<label htmlFor={`${id}-interval`}>Repeat every</label>}>{repeatControls}</Cell> : <><label htmlFor={`${id}-interval`}>Repeat every</label>{repeatControls}</>}{message('interval')}</div>
        {draft.unit === 'week' ? <fieldset className="recurrence-week"><legend className={phone ? 'phone-head' : undefined}>Repeat on</legend><div className="recurrence-days">{RECURRENCE_DAYS.map((day) => <button key={day} type="button" className={`recurrence-day${draft.weekdays.includes(day) ? ' on' : ''}`} aria-label={WEEKDAYS[day]} aria-pressed={draft.weekdays.includes(day)} {...invalid('weekdays')} onClick={() => change({ weekdays: draft.weekdays.includes(day) ? draft.weekdays.filter((one) => one !== day) : [...draft.weekdays, day] })}>{WEEKDAYS[day]?.charAt(0)}</button>)}</div>{message('weekdays')}</fieldset> : draft.unit === 'month' ? <div className={phone ? 'phone-group phone-form-group recurrence-pattern' : 'field'}>{phone ? <Cell label="Repeat on">{monthlyPicker}</Cell> : <><label>Repeat on</label>{monthlyPicker}</>}</div> : null}
        <fieldset className="recurrence-ends"><legend className={phone ? 'phone-head' : undefined}>Ends</legend>
          <div className={`recurrence-end-group${phone ? ' phone-group' : ''}`}>
            <label className={`recurrence-end${phone ? ' phone-cell' : ''}`}><input id={`${id}-never`} type="radio" name={`${id}-end`} checked={draft.end.kind === 'never'} onChange={() => change({ end: { kind: 'never' } })} /><span className={phone ? 'phone-cell-words' : undefined}>Never</span>{phone ? <span className={`recurrence-selection${draft.end.kind === 'never' ? ' on' : ''}`} aria-hidden="true"><Icon name="check" size={18} /></span> : null}</label>
            <div className={`recurrence-end-item${phone ? ' phone-cell-pair' : ''}`}><div className={`recurrence-end${phone ? ' phone-cell' : ''}`}><label className="recurrence-option"><input id={`${id}-on`} type="radio" name={`${id}-end`} checked={draft.end.kind === 'on'} onChange={() => change({ end: { kind: 'on', date: endDate } })} /><span>On</span></label><input className={phone ? 'phone-time' : undefined} type="date" aria-label="End date" min={draft.start} value={endDate} disabled={draft.end.kind !== 'on'} {...invalid('endDate')} onChange={(event) => setEndDate(event.target.value)} />{phone ? <label htmlFor={`${id}-on`} className={`recurrence-selection${draft.end.kind === 'on' ? ' on' : ''}`} aria-hidden="true"><Icon name="check" size={18} /></label> : null}</div>{message('endDate')}</div>
            <div className={`recurrence-end-item${phone ? ' phone-cell-pair' : ''}`}><div className={`recurrence-end${phone ? ' phone-cell' : ''}`}><label className="recurrence-option"><input id={`${id}-after`} type="radio" name={`${id}-end`} checked={draft.end.kind === 'after'} onChange={() => change({ end: { kind: 'after', count: Number(count) } })} /><span>After</span></label><div className="recurrence-count"><input className={phone ? 'phone-number' : undefined} type="number" inputMode={phone ? 'numeric' : undefined} aria-label="Occurrences" min={1} max={10_000} step={1} value={count} disabled={draft.end.kind !== 'after'} {...invalid('count')} onChange={(event) => setCount(event.target.value)} /><span>occurrences</span></div>{phone ? <label htmlFor={`${id}-after`} className={`recurrence-selection${draft.end.kind === 'after' ? ' on' : ''}`} aria-hidden="true"><Icon name="check" size={18} /></label> : null}</div>{message('count')}</div>
          </div>
        </fieldset>
        <div className={`recurrence-summary${phone ? ' phone-note' : ''}`} aria-live="polite">{error === undefined ? <><span>{describeRecurrence(rule)}</span><span>{next === undefined ? 'Timetable ended' : `Next ${describeTime(next, now, zone)}`}</span></> : message('summary')}</div>
        {phone ? <p className="recurrence-zone phone-note">Times use the connected computer's time zone.</p> : null}
      </div>
      {phone ? null : <div className="dialog-actions"><button type="button" className="quiet" onClick={onCancel}>Cancel</button><button type="button" className="primary" disabled={error !== undefined} onClick={done}>Done</button></div>}
    </div>
  </div>, document.body)
}
