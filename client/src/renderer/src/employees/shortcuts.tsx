import { memo, useState } from 'react'
import type { ChatSession, Settings, Shortcut, ShortcutDraft } from '../../../shared/api'
import { describeCron, describeTime, nextTimed } from '../../../shared/schedule'
import { describeRecurrence } from '../../../shared/recurrence'
import { projectColor } from '../../../shared/project-color'
import { saveShortcut } from '../../../shared/shortcut-save'
import { Icon } from '../ui/Icon'
import { projectLabel, tint } from '../chat/project'

export type ShortcutRowChat = { readonly settings: Pick<Settings, 'calendarTimeZone' | 'calendarRecurrenceVersion' | 'projectColors'>; readonly everyone: readonly ChatSession[] }

export const shortcutDraft = ({ since: _since, lastRun: _lastRun, lastSession: _lastSession, ...draft }: Shortcut): ShortcutDraft => draft

export const shortcutRunning = (everyone: readonly ChatSession[], one: Pick<Shortcut, 'lastSession'>): boolean =>
  one.lastSession !== undefined && everyone.some((session) => session.id === one.lastSession && (session.state === 'working' || session.state === 'asks'))

const scheduled = (one: Shortcut): boolean => one.recurrence !== undefined || one.cron !== undefined

export function shortcutWhen(one: Shortcut, settings: Pick<Settings, 'calendarTimeZone'>, now: number, archived: boolean): string {
  if (!scheduled(one)) return 'By hand'
  const rule = one.recurrence !== undefined ? describeRecurrence(one.recurrence) : describeCron(one.cron ?? '')
  if (archived) return `${rule} · Paused while archived`
  if (!one.on) return `${rule} · Paused`
  const next = nextTimed(one, now, settings.calendarTimeZone)
  return next === undefined ? `${rule} · Timetable ended` : `${rule} · Next ${describeTime(next, now, one.recurrence === undefined ? undefined : settings.calendarTimeZone)}`
}

export const EmployeeShortcut = memo(function EmployeeShortcut({ shortcut, chat, archived, now, onEdit, onGive, onOpen }: {
  readonly shortcut: Shortcut
  readonly chat: ShortcutRowChat
  readonly archived: boolean
  readonly now: number
  readonly onEdit?: ((id: Shortcut['id']) => void) | undefined
  readonly onGive?: ((anchor: DOMRect, id: Shortcut['id']) => void) | undefined
  readonly onOpen?: ((id: ChatSession['id']) => void) | undefined
}): React.JSX.Element {
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const running = shortcutRunning(chat.everyone, shortcut)
  const timed = scheduled(shortcut)
  const run = (): void => {
    setBusy(true)
    setFailed(false)
    void window.geckit.shortcuts.run(shortcut.id).then((session) => { if (session === undefined) setFailed(true) }).catch(() => setFailed(true)).finally(() => setBusy(false))
  }
  const toggle = (): void => {
    setFailed(false)
    void saveShortcut(window.geckit.shortcuts, chat.settings, { ...shortcutDraft(shortcut), on: !shortcut.on }).catch(() => setFailed(true))
  }
  const words = <>
    <strong>{shortcut.name}</strong>
    <span>
      <span>{shortcutWhen(shortcut, chat.settings, now, archived)}</span>
      {shortcut.lastRun === undefined ? null : <span>{`Last run ${describeTime(shortcut.lastRun, now)}`}</span>}
      <span className="tinted" style={tint(projectColor(shortcut.root, chat.settings))}>{projectLabel(shortcut.root)}</span>
    </span>
    {failed ? <span className="employee-alert" role="alert">Could not run. Check the assistant and folder.</span> : null}
  </>
  return <div className={`team-shortcut${timed && shortcut.on && !archived ? ' timed' : ''}`}>
    <span className="team-shortcut-icon"><Icon name={timed ? 'todo' : 'bolt'} size={13} /></span>
    {onEdit === undefined ? <span className="team-shortcut-words">{words}</span> : <button type="button" className="team-shortcut-words" title="Edit shortcut" onClick={() => onEdit(shortcut.id)}>{words}</button>}
    {running && shortcut.lastSession !== undefined ? <button type="button" className="team-running" onClick={() => { if (shortcut.lastSession !== undefined) onOpen?.(shortcut.lastSession) }}>Running</button> : null}
    {onGive === undefined ? null : <button type="button" className="quiet team-give" onClick={(event) => onGive(event.currentTarget.getBoundingClientRect(), shortcut.id)}>Give to...<Icon name="down" size={10} /></button>}
    <button type="button" className="quiet team-run" disabled={busy || running || archived} title="Start a new task with this prompt" onClick={run}><Icon name="send" size={10} />Run</button>
    {timed ? <button type="button" className={`team-switch${shortcut.on && !archived ? ' on' : ''}`} role="switch" aria-checked={shortcut.on && !archived} aria-label={`Timetable for ${shortcut.name}`} disabled={archived} onClick={toggle} /> : <span className="team-switch-slot" />}
  </div>
})

export function EmployeeShortcutsRead({ shortcuts, chat, archived }: { readonly shortcuts: readonly Shortcut[]; readonly chat: ShortcutRowChat; readonly archived: boolean }): React.JSX.Element {
  const [now] = useState(() => Date.now())
  return <section className="employee-tasks" aria-label="Shortcuts">
    <div className="employee-section-head"><h3>Shortcuts</h3><span className="employee-count">{shortcuts.length}</span></div>
    <div className="team-box">{shortcuts.map((one) => <EmployeeShortcut key={one.id} shortcut={one} chat={chat} archived={archived} now={now} />)}</div>
  </section>
}
