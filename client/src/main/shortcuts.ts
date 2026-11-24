import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import log from 'electron-log'

import type { SessionMessage, Shortcut, ShortcutDraft } from '../shared/api'
import type { ShortcutRuns } from './shortcut-runs'
import { shortcutDestinationError } from '../shared/shortcut-destination-validation'
import type { Employee } from '../shared/employees'
import { assistantsIn } from '../shared/api'
import { isRemote } from '../shared/hosts'
import { isCodexProvider, llmProviderInfo } from '../shared/providers'
import { dueRun } from '../shared/schedule'
import { catchUp, kindError, kindOf, onceError, RAN_KEPT } from '../shared/prompt-kinds'
import { shortcutChecklist } from '../shared/checklists'
import { recurrenceError } from '../shared/recurrence'
import { getSettings, setSettings } from './store'

/** How often the timetables are looked at: a timed run starts within this of its minute. */
const LOOK_EVERY = 20_000

export interface ShortcutDeps {
  readonly runs?: Pick<ShortcutRuns, 'start'>
  readonly start: (message: SessionMessage) => Promise<string>
  readonly manager?: (shortcut: Shortcut, request: string) => Promise<string>
  readonly rename: (id: string, title: string) => void
  readonly busy: (id: string) => boolean
  /** The employee a shortcut belongs to, or nothing where there is none by that id. */
  readonly employee?: (id: Employee['id']) => Employee | undefined
  /** A GeckIt notice, for a Scheduled run that did not start. */
  readonly notice?: (title: string, body: string) => void
}

/** Why the last start of each prompt was refused, in the words a "Didn't start" line uses. */
const refused = new Map<Shortcut['id'], string>()

let deps: ShortcutDeps | undefined

const put = (id: string, change: Partial<Shortcut>): void => {
  setSettings({ shortcuts: getSettings().shortcuts.map((one) => (one.id === id ? { ...one, ...change } : one)) })
}

const RUNS_KEPT = 50

/** The conversation a run started, as the last one and at the head of the runs kept. */
const started = (id: string, session: string): void => {
  const one = getSettings().shortcuts.find((shortcut) => shortcut.id === id)
  const kept = (one?.runSessions ?? []).filter((run) => run.session !== session)
  put(id, { lastSession: session, runSessions: [{ session, at: Date.now() }, ...kept].slice(0, RUNS_KEPT) })
}

const ownerArchived = (one: Shortcut): boolean => one.target !== 'manager' && one.employeeId !== undefined && deps?.employee?.(one.employeeId)?.archived === true

/** An employee restored: their timetables count from now, so what was missed while archived is not caught up. */
export function resumeOwned(employeeId: Employee['id']): void {
  const now = Date.now()
  const all = getSettings().shortcuts
  if (all.some((one) => one.employeeId === employeeId)) setSettings({ shortcuts: all.map((one) => (one.employeeId === employeeId ? { ...one, since: now } : one)) })
}

function didntStart(one: Shortcut, reason: string): void {
  put(one.id, { outcome: { state: 'didnt-start', reason } })
  deps?.notice?.(`${one.name} didn't start`, `${reason.charAt(0).toUpperCase()}${reason.slice(1)}. Run it or postpone it in Scheduled.`)
}

/** Shortcuts being edited: a Scheduled run waits for Save or Cancel. */
const held = new Set<Shortcut['id']>()
export function holdShortcut(id: string, hold: boolean): void {
  if (hold) held.add(id)
  else held.delete(id)
}

function lookScheduled(one: Shortcut, now: number): void {
  if (one.outcome?.state === 'ran') {
    if (now - one.outcome.started > RAN_KEPT) removeShortcut(one.id)
    return
  }
  if (one.outcome !== undefined || held.has(one.id)) return
  const due = dueRun(one, now)
  if (due === undefined) return
  const verdict = catchUp(due.latest, now)
  if (!verdict.run) {
    put(one.id, { outcome: { state: 'missed' }, since: now })
    return
  }
  if (ownerArchived(one)) {
    put(one.id, { since: now })
    didntStart(one, `${deps?.employee?.(one.employeeId ?? '')?.name ?? 'The employee'} is archived`)
    return
  }
  void runShortcut(one.id, 'timetable', due.anchor).then((session) => {
    const still = getSettings().shortcuts.find((shortcut) => shortcut.id === one.id)
    if (still === undefined || still.outcome !== undefined) return
    if (session === undefined) didntStart(one, refused.get(one.id) ?? 'the folder isn\'t reachable')
    else put(one.id, { outcome: { state: 'ran', started: now, session, ...(verdict.lateMinutes === undefined ? {} : { lateMinutes: verdict.lateMinutes }) } })
  })
}

function look(): void {
  const now = Date.now()
  for (const one of getSettings().shortcuts) {
    if (one.at !== undefined) {
      lookScheduled(one, now)
      continue
    }
    if (ownerArchived(one)) continue
    const due = dueRun(one, now)
    if (due === undefined) continue
    try {
      // The last run still going is left to finish, and this one is let go rather than piled up behind it.
      if (one.lastSession !== undefined && deps?.busy(one.lastSession) === true) {
        log.info(`Shortcut "${one.name}" skipped a timed run: the last one is still going`)
        put(one.id, { since: Math.max(now, due.anchor) })
        continue
      }
      void runShortcut(one.id, 'timetable', due.anchor)
    } catch (error) {
      log.warn(`Shortcut "${one.name}" could not save its timetable: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}

let stopSchedule: (() => void) | undefined

export function startShortcuts(given: ShortcutDeps, resume?: (look: () => void) => () => void): () => void {
  stopSchedule?.()
  deps = given
  const timer = setInterval(look, LOOK_EVERY)
  const stopResume = resume?.(look)
  const stop = (): void => {
    clearInterval(timer)
    stopResume?.()
    if (deps === given) deps = undefined
    if (stopSchedule === stop) stopSchedule = undefined
  }
  stopSchedule = stop
  look()
  return stop
}

/** The conversation it started, or nothing where it could not. */
const running = new Map<Shortcut['id'], Promise<string | undefined>>()

export function runShortcut(id: string, by: 'hand' | 'timetable', anchor?: number): Promise<string | undefined> {
  if (by === 'hand' && getSettings().shortcuts.find((one) => one.id === id)?.at !== undefined) {
    return startShortcut(id, by).then((session) => {
      if (session !== undefined && getSettings().shortcuts.some((one) => one.id === id)) put(id, { outcome: { state: 'ran', started: Date.now(), session } })
      return session
    })
  }
  if (getSettings().shortcuts.find((one) => one.id === id)?.target !== 'manager') return startShortcut(id, by, anchor)
  const pending = running.get(id)
  if (pending !== undefined) return pending
  const result = startShortcut(id, by, anchor).finally(() => { if (running.get(id) === result) running.delete(id) })
  running.set(id, result)
  return result
}

async function startShortcut(id: string, by: 'hand' | 'timetable', anchor?: number): Promise<string | undefined> {
  const settings = getSettings()
  const one = settings.shortcuts.find((shortcut) => shortcut.id === id)
  if (one === undefined || deps === undefined) return undefined
  const given = deps
  refused.delete(id)
  if (ownerArchived(one)) {
    log.info(`Shortcut "${one.name}" did not run: its employee is archived`)
    refused.set(id, `${given.employee?.(one.employeeId ?? '')?.name ?? 'The employee'} is archived`)
    return undefined
  }
  if (by === 'hand' && one.lastSession !== undefined && deps.busy(one.lastSession)) return one.lastSession
  const owner = one.employeeId === undefined ? undefined : deps.employee?.(one.employeeId)
  const provider = one.provider ?? 'claude'
  if (one.target !== 'manager' && !assistantsIn(settings).includes(provider)) {
    refused.set(id, `${llmProviderInfo(provider, 'stream', settings.providerPlugins).shortName} isn't available`)
    return undefined
  }
  if (one.target !== 'manager' && llmProviderInfo(provider, 'stream', settings.providerPlugins).localOnly === true && isRemote(one.root)) {
    refused.set(id, "the folder isn't reachable")
    return undefined
  }
  if (one.target === 'manager' && deps.manager === undefined) {
    refused.set(id, 'Manager is off')
    return undefined
  }
  const now = Date.now()
  // Counted before the conversation starts, so the next look does not start it again; a run by hand leaves the timetable where it was.
  try {
    put(id, { lastRun: now, ...(by === 'timetable' ? { since: Math.max(now, anchor ?? now) } : {}) })
    const destinationError = shortcutDestinationError(one.destination)
    if (destinationError !== undefined) throw new Error(destinationError)
    if (one.destination !== undefined && deps.runs === undefined) throw new Error('Shortcut destination delivery is unavailable.')
    if (one.target === 'manager') {
      const session = one.destination === undefined ? await deps.manager?.(one, `shortcut:${one.id}:${randomUUID()}`) : await deps.runs!.start({ ...one, destination: one.destination }, () => Promise.reject(new Error('Manager starts through its run context.')))
      if (session !== undefined && getSettings().shortcuts.find((shortcut) => shortcut.id === id)?.target === one.target) started(id, session)
      return session
    }
    const checklist = shortcutChecklist(one)
    const start = async (): Promise<string> => {
      const session = await given.start({
        root: one.root,
        mode: 'auto',
        text: one.prompt,
        provider,
        ...(owner === undefined ? {} : { employeeId: owner.id }),
        ...(checklist === undefined ? {} : { checklist }),
        ...(one.model === undefined ? {} : { model: one.model }),
        ...(!isCodexProvider(provider) || one.reasoning === undefined ? {} : { reasoning: one.reasoning }),
      })
      given.rename(session, one.name)
      if (getSettings().shortcuts.find((shortcut) => shortcut.id === id)?.target === one.target) started(id, session)
      return session
    }
    return one.destination === undefined ? await start() : await deps.runs!.start({ ...one, destination: one.destination }, start)
  } catch (error) {
    log.warn(`Shortcut "${one.name}" did not start: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

export function saveShortcut(draft: ShortcutDraft): Shortcut {
  const destinationError = shortcutDestinationError(draft.destination)
  if (destinationError !== undefined) throw new Error(destinationError)
  const now = Date.now()
  const all = getSettings().shortcuts
  const was = all.find((one) => one.id === draft.id)
  if (draft.id !== undefined && was === undefined) throw new Error('This shortcut was deleted.')
  if (draft.target !== undefined && draft.target !== 'manager') throw new Error('Choose a valid shortcut target.')
  if (draft.target === 'manager' && draft.employeeId !== undefined) throw new Error('Manager shortcuts cannot be assigned to an employee.')
  if (draft.employeeId !== undefined && draft.employeeId !== was?.employeeId) {
    const owner = deps?.employee?.(draft.employeeId)
    if (owner === undefined || owner.archived) throw new Error('Choose an active employee or None.')
  }
  const kindProblem = kindError(was, draft)
  if (kindProblem !== undefined) throw new Error(kindProblem)
  if (draft.at !== undefined && draft.at !== was?.at) {
    const error = onceError(draft.at, now)
    if (error !== undefined) throw new Error(error)
  }
  if (draft.recurrence !== undefined) {
    if (draft.cron !== undefined) throw new Error('Choose one timetable.')
    const error = recurrenceError(draft.recurrence)
    if (error !== undefined) throw new Error(error)
  }
  // An older client says a varied start with the minutes of its window.
  const vary = kindOf(draft) === 'shortcut' ? undefined : draft.vary ?? (draft.startWindowMinutes !== undefined && draft.startWindowMinutes > 0 ? true : undefined)
  const timingChanged = was === undefined || was.cron !== draft.cron || was.at !== draft.at || was.vary !== vary || !isDeepStrictEqual(was.recurrence, draft.recurrence)
  // A new time, or one turned back on, counts from now: a run it would have had before is not owed.
  const since = was === undefined || timingChanged || (!was.on && draft.on) ? now : was.since
  const saved: Shortcut = {
    ...(draft.target === undefined ? {} : { target: draft.target }),
    ...(draft.destination === undefined ? {} : { destination: draft.destination }),
    id: was?.id ?? randomUUID(),
    name: draft.name,
    root: draft.root,
    prompt: draft.prompt,
    ...(draft.target === 'manager' ? {} : { provider: draft.provider ?? 'claude' }),
    ...(draft.target === 'manager' || !isCodexProvider(draft.provider ?? 'claude') || draft.reasoning === undefined ? {} : { reasoning: draft.reasoning }),
    ...((checklist) => (draft.target === 'manager' || checklist === undefined ? {} : { checklist }))(shortcutChecklist(draft)),
    mode: 'auto',
    ...(draft.target === 'manager' || draft.model === undefined || draft.model === '' ? {} : { model: draft.model }),
    ...(draft.employeeId === undefined ? {} : { employeeId: draft.employeeId }),
    ...(draft.cron === undefined || draft.cron.trim() === '' ? {} : { cron: draft.cron.trim() }),
    ...(draft.recurrence === undefined ? {} : { recurrence: draft.recurrence }),
    ...(draft.at === undefined ? {} : { at: draft.at }),
    ...(vary === true ? { vary } : {}),
    ...(was?.postponedFrom === undefined || was.at !== draft.at ? {} : { postponedFrom: was.postponedFrom }),
    ...(was?.outcome === undefined || (was.at !== draft.at && was.outcome.state !== 'ran') ? {} : { outcome: was.outcome }),
    on: draft.on,
    since,
    ...(was?.lastRun === undefined ? {} : { lastRun: was.lastRun }),
    ...(was?.lastSession === undefined || was.target !== draft.target ? {} : { lastSession: was.lastSession }),
    ...(was?.runSessions === undefined || was.target !== draft.target ? {} : { runSessions: was.runSessions }),
  }
  setSettings({ shortcuts: was === undefined ? [...all, saved] : all.map((one) => (one.id === was.id ? saved : one)) })
  return saved
}

/** A Scheduled prompt moved to a new set time: a new start is drawn, a run that needed Alex waits again. */
export function postponeShortcut(id: string, at: number): Shortcut {
  const now = Date.now()
  const was = getSettings().shortcuts.find((one) => one.id === id)
  if (was === undefined) throw new Error('This shortcut was deleted.')
  if (was.at === undefined) throw new Error('Only a Scheduled prompt can be postponed.')
  const error = onceError(at, now)
  if (error !== undefined) throw new Error(error)
  const { outcome: _outcome, ...rest } = was
  const saved: Shortcut = { ...rest, at, since: now, postponedFrom: was.postponedFrom ?? was.at, ...(was.outcome?.state === 'ran' ? { outcome: was.outcome } : {}) }
  setSettings({ shortcuts: getSettings().shortcuts.map((one) => (one.id === id ? saved : one)) })
  return saved
}

export function removeShortcut(id: string): void {
  setSettings({ shortcuts: getSettings().shortcuts.filter((one) => one.id !== id) })
}
