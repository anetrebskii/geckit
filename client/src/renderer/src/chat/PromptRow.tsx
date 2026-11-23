import { useState } from 'react'

import { assistantsIn, modelName } from '../../../shared/api'
import type { ChatSession, Shortcut } from '../../../shared/api'
import { llmProviderInfo } from '../../../shared/providers'
import { isRemote } from '../../../shared/hosts'
import { nextSet } from '../../../shared/schedule'
import { asDraft, dateField, isProblem, kindOf, onceError, onceFrom, postponeChoices, problemLine, scheduledLead, scheduledWhen } from '../../../shared/prompt-kinds'
import type { PromptKind } from '../../../shared/prompt-kinds'
import { projectColor } from '../../../shared/project-color'
import { saveShortcut } from '../../../shared/shortcut-save'
import { EmployeeAvatar } from '../employees/Employees'
import { Icon } from '../ui/Icon'
import { Menu } from '../ui/Menu'
import type { Choice } from '../ui/Menu'
import { MOD } from '../ui/Shortcuts'
import { deliveryMessage, destinationFull, destinationSummary } from './ShortcutDestinations'
import type { ShortcutRun } from '../../../shared/shortcut-runs'
import { projectLabel, tint } from './project'
import { timetableSaid, timetableShort } from './PromptEditor'
import type { ShortcutChat } from './PromptEditor'

/** Who runs it: the employee, Manager, or the assistant itself. */
export function assigneeOf(chat: Pick<ShortcutChat, 'employees' | 'settings'>, prompt: Shortcut): { readonly name: string; readonly tip: string; readonly employee?: ShortcutChat['employees'][number]; readonly icon: string } {
  const assistant = llmProviderInfo(prompt.provider ?? 'claude', 'stream', chat.settings.providerPlugins)
  if (prompt.target === 'manager') return { name: 'Manager', tip: 'Manager', icon: 'manager' }
  const employee = prompt.employeeId === undefined ? undefined : chat.employees.find((one) => one.id === prompt.employeeId)
  if (employee !== undefined) return { name: employee.name, tip: `${employee.name}${employee.role === '' ? '' : ` · ${employee.role}`} · runs on ${assistant.name}`, employee, icon: '' }
  return { name: assistant.name, tip: `${assistant.name}, no employee`, icon: (prompt.provider ?? 'claude').startsWith('codex') ? 'codex' : 'claude' }
}

export function WhoMark({ chat, prompt, size = 28 }: { readonly chat: Pick<ShortcutChat, 'employees' | 'settings'>; readonly prompt: Shortcut; readonly size?: number }): React.JSX.Element {
  const who = assigneeOf(chat, prompt)
  return (
    <span className={`who-mark${who.employee === undefined ? '' : ' person'}`} style={{ '--size': `${String(size)}px` } as React.CSSProperties} title={who.tip} aria-hidden="true">
      {who.employee === undefined ? <Icon name={who.icon} size={Math.round(size / 2)} /> : <EmployeeAvatar employee={who.employee} />}
    </span>
  )
}

const RUN_STATE: Record<ChatSession['state'], string> = { working: 'Running', asks: 'Needs you', unread: 'Done, unread', idle: 'Done', limit: 'Hit the plan limit', failed: 'Failed' }

/** The conversations its runs started, newest first: the ones recorded, the last one, and before runs were recorded, those named after it in its folder. */
export function runsOf(chat: Pick<ShortcutChat, 'everyone'>, prompt: Shortcut): readonly { readonly session: ChatSession; readonly at: number }[] {
  const byId = new Map(chat.everyone.map((one) => [one.id, one]))
  const seen = new Set<string>()
  const found: { readonly session: ChatSession; readonly at: number }[] = []
  const add = (id: string, at: number): void => {
    const session = byId.get(id)
    if (session === undefined || seen.has(id)) return
    seen.add(id)
    found.push({ session, at })
  }
  for (const run of prompt.runSessions ?? []) add(run.session, run.at)
  if (prompt.lastSession !== undefined) add(prompt.lastSession, prompt.lastRun ?? byId.get(prompt.lastSession)?.at ?? 0)
  if (prompt.target !== 'manager') for (const one of chat.everyone) if (one.title === prompt.name && one.root === prompt.root && one.employeeId === prompt.employeeId) add(one.id, one.at)
  return found.sort((a, b) => b.at - a.at)
}

/** The model, when it is not Default. */
export const modelShown = (prompt: Shortcut): string | undefined => prompt.target === 'manager' || prompt.model === undefined || prompt.model === '' ? undefined : modelName(prompt.model)

export const assigneeSearch = (chat: Pick<ShortcutChat, 'employees' | 'settings'>, prompt: Shortcut): string => `${prompt.name} ${prompt.prompt} ${projectLabel(prompt.root)} ${assigneeOf(chat, prompt).name}`.toLowerCase()

export function moreChoices(kind: PromptKind, once: boolean, runs = 0): readonly Choice[] {
  return [
    ...(runs > 0 ? [{ value: 'runs', label: 'Runs...', says: String(runs) }] : []),
    ...(kind === 'shortcut' && once ? [{ value: 'later', label: 'Run later...' }] : []),
    { value: 'duplicate', label: 'Duplicate', says: `${MOD}+D` },
    { value: 'delete', label: 'Delete', danger: true, divided: true },
  ]
}

/** Postpone or Run later: the presets, then Choose... with a date and a time. */
export function WhenMenu({ anchor, title, head, zone, action, now, onPick, onClose }: { readonly anchor: DOMRect; readonly title?: string; readonly head?: React.ReactNode; readonly zone: string | undefined; readonly action: string; readonly now: number; readonly onPick: (at: number) => void; readonly onClose: () => void }): React.JSX.Element {
  const choices = postponeChoices(now, zone)
  const [choosing, setChoosing] = useState(false)
  const [date, setDate] = useState(() => dateField(choices.find((one) => one.label.startsWith('Tomorrow'))?.at ?? now, zone))
  const [time, setTime] = useState('09:00')
  const [wrong, setWrong] = useState(false)
  return (
    <Menu
      anchor={anchor}
      autoFocus
      stays
      {...(title === undefined ? {} : { title })}
      head={head}
      choices={[...choices.map((one) => ({ value: String(one.at), label: one.label })), ...(choosing ? [] : [{ value: 'choose', label: 'Choose...', divided: true }])]}
      onPick={(value) => {
        if (value === 'choose') { setChoosing(true); return }
        onPick(Number(value))
        onClose()
      }}
      onClose={onClose}
    >
      {choosing ? <div className="when-choose">
        <div>
          <input type="date" aria-label="Date" value={date} onChange={(event) => { setWrong(false); setDate(event.target.value) }} />
          <input type="time" aria-label="Time" value={time} onChange={(event) => { setWrong(false); setTime(event.target.value) }} />
        </div>
        {wrong ? <span className="wrong" role="alert">Pick a time from now on.</span> : null}
        <button type="button" className="primary" onClick={() => {
          const at = onceFrom(date, time, zone)
          if (onceError(at, Date.now()) !== undefined) { setWrong(true); return }
          onPick(at)
          onClose()
        }}>{action}</button>
      </div> : null}
    </Menu>
  )
}

export function PromptRow({
  chat,
  prompt,
  now,
  run,
  running,
  starting,
  archived,
  hit,
  note,
  onEdit,
  onRun,
  onDuplicate,
  onDelete,
  onRunLater,
  onPostpone,
  onOpen,
  rowRef,
}: {
  readonly chat: ShortcutChat
  readonly prompt: Shortcut
  readonly now: number
  readonly run: ShortcutRun | undefined
  readonly running: boolean
  readonly starting: boolean
  readonly archived: boolean
  readonly hit: boolean
  readonly note?: React.ReactNode
  readonly onEdit: () => void
  readonly onRun: () => void
  readonly onDuplicate: () => void
  readonly onDelete: () => void
  readonly onRunLater: (at: number) => void
  readonly onPostpone: (at: number) => void
  readonly onOpen: (session: string) => void
  readonly rowRef: (node: HTMLButtonElement | null) => void
}): React.JSX.Element {
  const kind = kindOf(prompt)
  const zone = chat.settings.calendarTimeZone
  const [menu, setMenu] = useState<{ readonly kind: 'more' | 'postpone' | 'later' | 'runs'; readonly anchor: DOMRect }>()
  const runs = kind === 'scheduled' ? [] : prompt.target === 'manager' ? runsOf(chat, prompt).slice(0, 1) : runsOf(chat, prompt)
  const provider = prompt.provider ?? 'claude'
  const info = llmProviderInfo(provider, 'stream', chat.settings.providerPlugins)
  const available = prompt.target === 'manager' || assistantsIn(chat.settings).includes(provider) && (info.localOnly !== true || !isRemote(prompt.root))
  const who = assigneeOf(chat, prompt)
  const model = modelShown(prompt)
  const problem = isProblem(prompt)
  const folder = <span className="tinted" style={tint(projectColor(prompt.root, chat.settings))}>{projectLabel(prompt.root)}</span>
  const next = kind === 'repeating' ? nextSet(prompt, now, prompt.recurrence === undefined ? undefined : zone) : undefined
  const timetable = timetableSaid(prompt)
  const paused = !prompt.on || archived
  const ended = prompt.recurrence !== undefined && next === undefined
  const delivery = run === undefined ? '' : deliveryMessage(run)
  const deliveryProblem = run !== undefined && (run.delivery === 'failed' || run.delivery === 'uncertain' || run.state === 'failed')
  const open = (which: 'more' | 'postpone' | 'runs', anchor: DOMRect): void => setMenu({ kind: which, anchor })
  const pick = (value: string): void => {
    if (value === 'duplicate') onDuplicate()
    else if (value === 'delete') onDelete()
    else if (value === 'later' && menu !== undefined) setMenu({ kind: 'later', anchor: menu.anchor })
    else if (value === 'runs' && menu !== undefined) setMenu({ kind: 'runs', anchor: menu.anchor })
  }
  return (
    <>
      <div
        className={`shortcut-row${running ? ' running' : ''}${hit ? ' hit' : ''}`}
        onContextMenu={(event) => {
          event.preventDefault()
          open('more', new DOMRect(event.clientX, event.clientY, 0, 0))
        }}
        onKeyDown={(event) => {
          if (event.key.toLowerCase() === 'd' && (event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey) { event.preventDefault(); onDuplicate() }
        }}
      >
        {kind === 'scheduled' && prompt.at !== undefined ? (
          <span className={`prompt-lead${problem ? ' problem' : ''}`}>
            <b>{scheduledLead(prompt.at, now, zone)}</b>
            {problem ? null : <small>{scheduledWhen(prompt.at, now, zone)}</small>}
          </span>
        ) : null}
        {kind === 'repeating' ? (
          <span className={`prompt-lead repeating${running ? ' live' : paused || ended ? ' paused' : ''}`} title={timetable}>
            <b>{running ? 'Running now' : archived ? 'Paused while archived' : !prompt.on ? 'Paused' : ended ? 'Timetable ended' : next === undefined ? timetable : scheduledLead(next, now, prompt.recurrence === undefined ? undefined : zone)}</b>
            <small>{timetableShort(prompt)}{prompt.vary === true && !paused && !ended ? ', varies a little' : ''}</small>
          </span>
        ) : null}
        <WhoMark chat={chat} prompt={prompt} size={32} />
        <button type="button" className="shortcut-text" title="Edit" ref={rowRef} onClick={onEdit}>
          <span className="shortcut-title-line">
            <span className="shortcut-name">{prompt.name}</span>
          </span>
          <span className="shortcut-when">
            {problem ? <span className="trouble">{problemLine(prompt)}</span> : <>
              <span className="who">{who.name}</span>
              {folder}
              {model === undefined ? null : <span>{model}</span>}
              {available ? null : <span className="trouble">Assistant unavailable</span>}
              {kind === 'scheduled' && prompt.postponedFrom !== undefined ? <span className="moved">{`Postponed from ${scheduledLead(prompt.postponedFrom, now, zone)}`}</span> : null}
              {running && kind !== 'repeating' ? <span className="live">Running now</span> : null}
              {prompt.destination === undefined ? null : <span className="shortcut-to" title={`Result goes to ${destinationFull(prompt.destination)}`}>{`to ${destinationSummary(prompt.destination).replace(/ · (?:.* \/ )?/, ' ')}`}</span>}
            </>}
          </span>
          <span className="shortcut-prompt">{prompt.prompt}</span>
          {delivery === '' ? null : <span className={`shortcut-status${deliveryProblem ? ' problem' : ''}`}>{delivery}</span>}
        </button>
        <span className="shortcut-actions">
          {runs.length === 0 ? null : prompt.target === 'manager' ? (
            <button type="button" className="icon-button" aria-label="Open Manager" title="Open Manager" onClick={() => onOpen(runs[0]!.session.id)}>
              <Icon name="right" size={13} />
            </button>
          ) : (
            <button type="button" className="icon-button shortcut-runs-button" aria-label={`Runs of ${prompt.name}`} title={`Runs (${String(runs.length)})`} aria-haspopup="menu" aria-expanded={menu?.kind === 'runs'} onClick={(event) => open('runs', event.currentTarget.getBoundingClientRect())}>
              <Icon name="list" size={13} />
            </button>
          )}
          <button type="button" className="icon-button" aria-label={`More for ${prompt.name}`} title="More" aria-haspopup="menu" aria-expanded={menu?.kind === 'more' || menu?.kind === 'later'} onClick={(event) => open('more', event.currentTarget.getBoundingClientRect())}>
            <Icon name="more" size={13} />
          </button>
          {run?.receipt?.link === undefined ? null : (
            <a className="icon-button shortcut-result" href={run.receipt.link} target="_blank" rel="noreferrer" aria-label="Open result thread" title={prompt.destination === undefined ? 'Open result thread' : `Open the result in ${destinationSummary(prompt.destination)}`}>
              <Icon name="external" size={13} />
            </a>
          )}
          {kind === 'scheduled' ? <button type="button" className="quiet" aria-haspopup="menu" aria-expanded={menu?.kind === 'postpone'} onClick={(event) => open('postpone', event.currentTarget.getBoundingClientRect())}>Postpone</button> : null}
          <button type="button" className={`icon-button shortcut-run${starting ? ' starting' : ''}`} aria-label={starting ? 'Starting' : kind === 'shortcut' ? `Run ${prompt.name}` : `Run ${prompt.name} now`} title={starting ? 'Starting...' : kind === 'repeating' ? 'Run now, the timetable stays as it is' : prompt.target === 'manager' ? 'Send this prompt to Manager' : 'Start a new conversation with this prompt'} disabled={starting || !available || archived} onClick={onRun}>
            {starting ? <Icon name="spinner" size={13} /> : <Icon name="play" size={13} />}
          </button>
          {kind === 'repeating' ? <button
            type="button"
            className={`team-switch${prompt.on ? ' on' : ''}`}
            role="switch"
            aria-checked={prompt.on}
            aria-label={`Run ${prompt.name} on its timetable`}
            disabled={archived}
            onClick={() => { void saveShortcut(window.geckit.shortcuts, chat.settings, { ...asDraft(prompt), on: !prompt.on }).catch(() => undefined) }}
          /> : null}
        </span>
      </div>
      {note}
      {menu?.kind === 'runs' ? <Menu
        anchor={menu.anchor}
        autoFocus
        title={runs.length === 1 ? '1 run' : `${String(runs.length)} runs`}
        choices={runs.map((one) => ({ value: one.session.id, label: scheduledLead(one.at, now, zone), says: RUN_STATE[one.session.state] }))}
        onPick={onOpen}
        onClose={() => setMenu((was) => was?.kind === 'runs' ? undefined : was)}
      /> : null}
      {menu?.kind === 'more' ? <Menu anchor={menu.anchor} autoFocus choices={moreChoices(kind, chat.settings.promptKindsVersion === 1, prompt.target === 'manager' ? 0 : runs.length)} onPick={pick} onClose={() => setMenu((was) => was?.kind === 'more' ? undefined : was)} /> : null}
      {menu?.kind === 'later' ? <WhenMenu anchor={menu.anchor} title="Run later" zone={zone} action="Schedule" now={now} onPick={onRunLater} onClose={() => setMenu(undefined)} /> : null}
      {menu?.kind === 'postpone' ? <WhenMenu anchor={menu.anchor} zone={zone} action="Postpone" now={now} onPick={onPostpone} onClose={() => setMenu(undefined)} /> : null}
    </>
  )
}
