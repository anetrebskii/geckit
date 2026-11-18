import { memo, useState } from 'react'
import type { ChatSession, Settings, Shortcut, ShortcutDraft } from '../../../shared/api'
import { describeTime, nextSet } from '../../../shared/schedule'
import { kindOf, problemLine, scheduledLead } from '../../../shared/prompt-kinds'
import type { PromptKind } from '../../../shared/prompt-kinds'
import { projectColor } from '../../../shared/project-color'
import { saveShortcut } from '../../../shared/shortcut-save'
import { Icon } from '../ui/Icon'
import { projectLabel, tint } from '../chat/project'
import { timetableSaid } from '../chat/PromptEditor'
import type { ShortcutRun } from '../../../shared/shortcut-runs'
import { destinationSummary, ShortcutDelivery, useShortcutRuns } from '../chat/ShortcutDestinations'

export type ShortcutRowChat = { readonly settings: Pick<Settings, 'calendarTimeZone' | 'calendarRecurrenceVersion' | 'cronStartWindowVersion' | 'managerShortcutsVersion' | 'promptKindsVersion' | 'projectColors' | 'shortcuts' | 'shortcutDestinationsVersion'>; readonly everyone: readonly ChatSession[] }

export const shortcutDraft = ({ since: _since, lastRun: _lastRun, lastSession: _lastSession, outcome: _outcome, postponedFrom: _postponedFrom, ...draft }: Shortcut): ShortcutDraft => draft

export const shortcutRunning = (everyone: readonly ChatSession[], one: Pick<Shortcut, 'lastSession'>): boolean =>
  one.lastSession !== undefined && everyone.some((session) => session.id === one.lastSession && (session.state === 'working' || session.state === 'asks'))

const scheduled = (one: Shortcut): boolean => kindOf(one) === 'repeating'

export const KIND_HEADS: readonly { readonly kind: PromptKind; readonly title: string; readonly icon: string }[] = [
  { kind: 'repeating', title: 'Repeating', icon: 'refresh' },
  { kind: 'scheduled', title: 'Scheduled', icon: 'clock' },
  { kind: 'shortcut', title: 'Shortcuts', icon: 'bolt' },
]

export function shortcutWhen(one: Shortcut, settings: Pick<Settings, 'calendarTimeZone'>, now: number, archived: boolean): string {
  if (one.at !== undefined) return problemLine(one) ?? (one.outcome?.state === 'ran' ? `Ran ${scheduledLead(one.outcome.started, now, settings.calendarTimeZone)}` : `Once ${scheduledLead(one.at, now, settings.calendarTimeZone)}`)
  if (!scheduled(one)) return 'By hand'
  const rule = timetableSaid(one)
  if (archived) return `${rule} · Paused while archived`
  if (!one.on) return `${rule} · Paused`
  const next = nextSet(one, now, one.recurrence === undefined ? undefined : settings.calendarTimeZone)
  return next === undefined ? `${rule} · Timetable ended` : `${rule} · Next ${describeTime(next, now, one.recurrence === undefined ? undefined : settings.calendarTimeZone)}`
}

export const EmployeeShortcut = memo(function EmployeeShortcut({ shortcut, chat, archived, now, onEdit, onGive, onOpen, lastRun }: {
  readonly shortcut: Shortcut
  readonly lastRun?: ShortcutRun | undefined
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
      {shortcut.destination === undefined ? null : <span className="shortcut-destination-summary">{destinationSummary(shortcut.destination)}</span>}
      {shortcut.lastRun === undefined ? null : <span>{`Last run ${describeTime(shortcut.lastRun, now)}`}</span>}
      <span className="tinted" style={tint(projectColor(shortcut.root, chat.settings))}>{projectLabel(shortcut.root)}</span>
    </span>
    {failed ? <span className="employee-alert" role="alert">Could not run. Check the assistant and folder.</span> : null}
  </>
  return <div className={`team-shortcut${timed && shortcut.on && !archived ? ' timed' : ''}`}>
    <span className="team-shortcut-icon"><Icon name={KIND_HEADS.find((head) => head.kind === kindOf(shortcut))?.icon ?? 'bolt'} size={13} /></span>
    {onEdit === undefined ? <span className="team-shortcut-words">{words}</span> : <button type="button" className="team-shortcut-words" title="Edit shortcut" onClick={() => onEdit(shortcut.id)}>{words}</button>}
    <ShortcutDelivery run={lastRun} />
    {running && shortcut.lastSession !== undefined ? <button type="button" className="team-running" onClick={() => { if (shortcut.lastSession !== undefined) onOpen?.(shortcut.lastSession) }}>Running</button> : null}
    {onGive === undefined ? null : <button type="button" className="quiet team-give" onClick={(event) => onGive(event.currentTarget.getBoundingClientRect(), shortcut.id)}>Give to...<Icon name="down" size={10} /></button>}
    <button type="button" className="quiet team-run" disabled={busy || running || archived} title={shortcut.target === 'manager' ? 'Send this prompt to Manager' : 'Start a new task with this prompt'} onClick={run}><Icon name="send" size={10} />Run</button>
    {timed ? <button type="button" className={`team-switch${shortcut.on && !archived ? ' on' : ''}`} role="switch" aria-checked={shortcut.on && !archived} aria-label={`Timetable for ${shortcut.name}`} disabled={archived} onClick={toggle} /> : <span className="team-switch-slot" />}
  </div>
})

export function EmployeeShortcutsRead({ shortcuts, chat, archived }: { readonly shortcuts: readonly Shortcut[]; readonly chat: ShortcutRowChat; readonly archived: boolean }): React.JSX.Element {
  const [now] = useState(() => Date.now())
  const lastRuns = useShortcutRuns(chat.settings)
  return <section className="employee-tasks" aria-label="Shortcuts">
    <div className="employee-section-head"><h3>Shortcuts</h3><span className="employee-count">{shortcuts.length}</span></div>
    {KIND_HEADS.map((head) => {
      const list = shortcuts.filter((one) => kindOf(one) === head.kind)
      return list.length === 0 ? null : <div key={head.kind} className="team-kind"><div className="team-kind-head">{head.title}</div><div className="team-box">{list.map((one) => <EmployeeShortcut key={one.id} shortcut={one} lastRun={lastRuns.get(one.id)} chat={chat} archived={archived} now={now} />)}</div></div>
    })}
  </section>
}
