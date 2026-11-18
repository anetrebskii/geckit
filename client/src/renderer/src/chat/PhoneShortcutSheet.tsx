import { useEffect, useMemo, useRef, useState } from 'react'

import { shownProjects } from '../../../shared/api'
import type { ShortcutDraft } from '../../../shared/api'
import { cronOf, isCron, nextRun, WEEKDAYS, whenOf } from '../../../shared/schedule'
import type { When } from '../../../shared/schedule'
import { defaultRecurrence, describeRecurrence, nextRecurrence, recurrenceError } from '../../../shared/recurrence'
import { civilDay, clockText, dateField, dayText, kindOf, onceError, onceFrom } from '../../../shared/prompt-kinds'
import { saveShortcut } from '../../../shared/shortcut-save'
import { shortcutChecklist } from '../../../shared/checklists'
import { ChecklistField } from './ChecklistField'
import { CustomRecurrence } from './CustomRecurrence'
import { ShortcutDestinationFields, useShortcutDestination } from './ShortcutDestinations'
import { Menu } from '../ui/Menu'
import { Cell, FullSheet, Switch } from './PhoneKit'
import { projectLabel } from './project'
import { FIRST_CRON, KIND_NAME, NEW_LABEL, REPEATS, timetableSaid, turned } from './PromptEditor'
import type { Repeats, ShortcutChat } from './PromptEditor'

export function ShortcutSheet({ chat, given, onClose }: { readonly chat: ShortcutChat; readonly given: ShortcutDraft; readonly onClose: () => void }): React.JSX.Element {
  const kind = kindOf(given)
  const [draft, setDraft] = useState<ShortcutDraft>(() => {
    const { goal: _goal, checklist: _checklist, startWindowMinutes: legacyWindow, ...rest } = given
    const checklist = shortcutChecklist(given)
    return { ...rest, ...(kind === 'shortcut' ? {} : { vary: rest.vary ?? (legacyWindow !== undefined && legacyWindow > 0) }), ...(checklist === undefined ? {} : { checklist }) }
  })
  useEffect(() => {
    const id = given.id
    if (id === undefined || kind !== 'scheduled') return
    window.geckit.shortcuts.hold(id, true)
    return () => window.geckit.shortcuts.hold(id, false)
  }, [given.id, kind])
  const destination = useShortcutDestination(chat.settings, draft.destination, (destination) => {
    const { destination: _destination, ...rest } = draft
    setDraft(destination === undefined ? rest : { ...rest, destination })
  })
  const manager = draft.target === 'manager'
  const [repeats, setRepeats] = useState<Repeats>(() => given.recurrence !== undefined ? 'custom' : whenOf(given.cron ?? FIRST_CRON).kind)
  const [custom, setCustom] = useState(false)
  const trigger = useRef<HTMLElement | null>(null)
  const [saving, setSaving] = useState(false)
  const [failedDraft, setFailedDraft] = useState<ShortcutDraft>()
  const saveError = failedDraft === draft
  const [now] = useState(() => Date.now())
  const [picking, setPicking] = useState<'target' | 'project' | 'employee' | 'repeats' | 'weekday' | 'delete' | undefined>()
  const change = (next: Partial<ShortcutDraft>): void => setDraft({ ...draft, ...next })
  const cron = draft.cron ?? FIRST_CRON
  const shape: When = repeats === 'cron' ? { kind: 'cron', cron } : turned(whenOf(cron), repeats === 'custom' ? 'weekdays' : repeats)
  const setWhen = (next: When): void => change({ cron: cronOf(next) })
  const zone = chat.settings.calendarTimeZone
  const ruleError = useMemo(() => draft.recurrence === undefined ? undefined : recurrenceError(draft.recurrence, zone), [draft.recurrence, zone])
  const kept = draft.id === undefined ? undefined : chat.settings.shortcuts.find((one) => one.id === draft.id)
  const next = useMemo(() => {
    if (draft.recurrence !== undefined) return nextRecurrence(draft.recurrence, now, zone)
    return draft.cron === undefined ? undefined : nextRun(draft.cron, now)
  }, [draft.recurrence, draft.cron, now, zone])
  const [onceDate, setOnceDate] = useState(() => dateField(given.at ?? now, zone))
  const [onceTime, setOnceTime] = useState(() => clockText(given.at ?? now, zone))
  const once = kind === 'scheduled' ? onceFrom(onceDate, onceTime, zone) : Number.NaN
  const wrongOnce = kind === 'scheduled' && !(given.id !== undefined && once === given.at) ? onceError(once, now) : undefined
  const name = draft.name.trim() || (draft.prompt.trim().split('\n')[0] ?? '').slice(0, 60)
  const timingReady = kind === 'shortcut' ? true : kind === 'scheduled' ? Number.isFinite(once) && wrongOnce === undefined : draft.recurrence !== undefined ? ruleError === undefined : next !== undefined
  const ready = destination.valid && !saving && name !== '' && draft.root !== '' && draft.prompt.trim() !== '' && timingReady
  const owner = draft.employeeId === undefined ? undefined : chat.employees.find((one) => one.id === draft.employeeId)

  const save = (): void => {
    if (!ready) return
    setSaving(true)
    setFailedDraft(undefined)
    void saveShortcut(window.geckit.shortcuts, chat.settings, { ...draft, mode: 'auto', ...(kind === 'scheduled' ? { at: once, on: true } : {}), name, prompt: draft.prompt.trim() }).then(onClose).catch(() => setFailedDraft(draft)).finally(() => setSaving(false))
  }
  const closeCustom = (): void => { setCustom(false); trigger.current?.focus() }
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
  const vary = <Cell label="Vary start time"><Switch on={draft.vary === true} label="Vary start time" onChange={(on) => change({ vary: on })} /></Cell>

  return (
    <>
      <FullSheet title={given.id === undefined ? NEW_LABEL[kind] : given.name || KIND_NAME[kind]} action={saving ? 'Saving...' : 'Save'} ready={ready} onAction={save} onClose={onClose}>
        <div className="phone-task-label">Name</div>
        <input className="phone-task-goal" autoFocus={given.id === undefined && given.name === ''} aria-label="Name" value={draft.name} placeholder={name === '' ? 'Morning check' : name} onChange={(event) => change({ name: event.target.value })} />
        <div className="phone-task-label">Prompt</div>
        <textarea className="phone-task-text" value={draft.prompt} placeholder="What to ask each time" onChange={(event) => change({ prompt: event.target.value })} />
        {manager ? null : <ChecklistField checklists={chat.settings.checklists ?? []} root={draft.root} value={draft.checklist ?? { items: [] }} onChange={(checklist) => change({ checklist })} />}
        <div className="phone-group phone-form-group">
          <Cell label="Target" value={manager ? 'Manager' : 'New task'} onPress={() => setPicking('target')} />
          {manager || chat.employees.length === 0 && draft.employeeId === undefined ? null : <Cell label="Employee" value={owner?.name ?? 'None'} says={owner === undefined ? 'Runs start unassigned' : owner.archived ? 'Paused while archived' : 'Runs start assigned to them'} onPress={() => setPicking('employee')} />}
          <Cell label="Folder" value={draft.root === '' ? 'None' : projectLabel(draft.root)} onPress={() => setPicking('project')} />
        </div>
        <ShortcutDestinationFields editor={destination} phone />
        {kind === 'scheduled' ? (
          <div className="phone-group phone-form-group">
            <Cell label="Date"><input type="date" className="phone-time" aria-label="Date" value={onceDate} onChange={(event) => setOnceDate(event.target.value)} /></Cell>
            <Cell label="Time"><input type="time" className="phone-time" aria-label="Time" value={onceTime} onChange={(event) => setOnceTime(event.target.value)} /></Cell>
            {vary}
          </div>
        ) : kind === 'repeating' ? (
          <div className="phone-group phone-form-group">
            <Cell label="Repeats" value={REPEATS.find((one) => one.value === repeats)?.label} onPress={() => { trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setPicking('repeats') }} />
            {repeats === 'custom' ? <Cell label="Edit recurrence" says={draft.recurrence === undefined ? '' : describeRecurrence(draft.recurrence)} onPress={() => { trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setCustom(true) }} /> : shape.kind === 'hour' ? (
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
            {vary}
            <Cell label="Timetable on" says={!draft.on ? 'Paused' : draft.recurrence !== undefined ? ruleError ?? (next === undefined ? 'Timetable ended' : timetableSaid(draft)) : next === undefined ? (isCron(cron) ? 'It never comes round' : 'Not a cron line') : timetableSaid(draft)}>
              <Switch on={draft.on} label="Timetable on" onChange={(on) => change({ on })} />
            </Cell>
          </div>
        ) : null}
        {wrongOnce === undefined ? null : <p className="recurrence-error" role="alert">{wrongOnce}</p>}
        <p className="phone-note">{kind === 'shortcut' ? 'Run it from Shortcuts, Team or the gecko in the menu bar.' : kind === 'scheduled' ? Number.isFinite(once) ? `Runs once on ${dayText(civilDay(once, zone))} ${draft.vary === true ? 'around' : 'at'} ${clockText(once, zone)}.` : '' : manager ? `Sends this prompt to Manager with ${draft.root === '' ? 'the folder you choose' : projectLabel(draft.root)} as context.` : ''}</p>
        {saveError ? <p className="recurrence-error" role="alert">Couldn't save. Try again.</p> : null}
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
            <Cell label="Delete" danger onPress={() => setPicking('delete')} />
          </div>
        )}
      </FullSheet>
      {picking === 'target' ? <Menu anchor={new DOMRect()} title="Target" chosen={manager ? 'manager' : 'task'} choices={[{ value: 'task', label: 'New task' }, { value: 'manager', label: 'Manager' }]} onPick={(value) => {
        const { target: _target, employeeId: _employee, provider: _provider, model: _model, reasoning: _reasoning, checklist: _checklist, ...rest } = draft
        setDraft(value === 'manager' ? { ...rest, target: 'manager' } : rest)
      }} onClose={() => setPicking(undefined)} /> : picking === 'project' ? (
        <Menu
          anchor={new DOMRect()}
          title="Runs in"
          chosen={draft.root}
          choices={shownProjects(chat.settings).map((one) => ({ value: one, label: projectLabel(one) }))}
          onPick={(root) => change({ root })}
          onClose={() => setPicking(undefined)}
        />
      ) : picking === 'employee' ? (
        <Menu
          anchor={new DOMRect()}
          title="Employee"
          chosen={draft.employeeId ?? ''}
          choices={[{ value: '', label: 'None' }, ...chat.employees.filter((one) => !one.archived || one.id === draft.employeeId).map((one) => ({ value: one.id, label: one.name, says: one.role, disabled: one.archived }))]}
          onPick={(id) => {
            const { employeeId: _employeeId, ...rest } = draft
            setDraft(id === '' ? rest : { ...rest, employeeId: id })
          }}
          onClose={() => setPicking(undefined)}
        />
      ) : picking === 'repeats' ? (
        <Menu
          anchor={new DOMRect()}
          title="Repeats"
          chosen={repeats}
          choices={REPEATS.map((one) => ({ value: one.value, label: one.label }))}
          onPick={(value) => {
            const picked = value as Repeats
            if (picked === 'custom') { setCustom(true); return }
            setRepeats(picked)
            const { recurrence: _recurrence, ...rest } = draft
            setDraft({ ...rest, cron: cronOf(turned(whenOf(cron), picked)) })
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
      {custom ? <CustomRecurrence given={draft.recurrence !== undefined && ruleError === undefined ? draft.recurrence : defaultRecurrence(now, 'hour' in shape ? `${String(shape.hour).padStart(2, '0')}:${String(shape.minute).padStart(2, '0')}` : '09:00', zone)} now={now} phone {...(zone === undefined ? {} : { zone })} onCancel={closeCustom} onDone={(recurrence) => {
        const { cron: _cron, ...rest } = draft
        setDraft({ ...rest, recurrence })
        setRepeats('custom')
        closeCustom()
      }} /> : null}
    </>
  )
}
