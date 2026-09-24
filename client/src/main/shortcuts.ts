import { randomUUID } from 'node:crypto'

import { powerMonitor } from 'electron'
import log from 'electron-log'

import type { SessionMessage, Shortcut, ShortcutDraft } from '../shared/api'
import { isDue } from '../shared/schedule'
import { getSettings, setSettings } from './store'

/** How often the timetables are looked at: a timed run starts within this of its minute. */
const LOOK_EVERY = 20_000

export interface ShortcutDeps {
  readonly start: (message: SessionMessage) => Promise<string>
  readonly rename: (id: string, title: string) => void
  readonly busy: (id: string) => boolean
}

let deps: ShortcutDeps | undefined

const put = (id: string, change: Partial<Shortcut>): void => {
  setSettings({ shortcuts: getSettings().shortcuts.map((one) => (one.id === id ? { ...one, ...change } : one)) })
}

function look(): void {
  const now = Date.now()
  for (const one of getSettings().shortcuts) {
    if (!isDue(one, now)) continue
    // The last run still going is left to finish, and this one is let go rather than piled up behind it.
    if (one.lastSession !== undefined && deps?.busy(one.lastSession) === true) {
      log.info(`Shortcut "${one.name}" skipped a timed run: the last one is still going`)
      put(one.id, { since: now })
      continue
    }
    void runShortcut(one.id, 'timetable')
  }
}

export function startShortcuts(given: ShortcutDeps): void {
  deps = given
  setInterval(look, LOOK_EVERY)
  powerMonitor.on('resume', look)
  look()
}

/** The conversation it started, or nothing where it could not. */
export async function runShortcut(id: string, by: 'hand' | 'timetable'): Promise<string | undefined> {
  const one = getSettings().shortcuts.find((shortcut) => shortcut.id === id)
  if (one === undefined || deps === undefined) return undefined
  const now = Date.now()
  // Counted before the conversation starts, so the next look does not start it again; a run by hand leaves the timetable where it was.
  put(id, { lastRun: now, ...(by === 'timetable' ? { since: now } : {}) })
  try {
    const session = await deps.start({
      root: one.root,
      mode: one.mode,
      text: one.prompt,
      ...(one.model === undefined ? {} : { model: one.model }),
    })
    deps.rename(session, one.name)
    put(id, { lastSession: session })
    // The goal goes after the work, so it holds from the first turn without the run beginning with a condition and no task.
    if (one.goal !== undefined && one.goal !== '') {
      await deps.start({ session, root: one.root, mode: one.mode, text: `/goal ${one.goal}` })
    }
    return session
  } catch (error) {
    log.warn(`Shortcut "${one.name}" did not start: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

export function saveShortcut(draft: ShortcutDraft): Shortcut {
  const now = Date.now()
  const all = getSettings().shortcuts
  const was = all.find((one) => one.id === draft.id)
  // A new time, or one turned back on, counts from now: a run it would have had before is not owed.
  const since = was === undefined || was.cron !== draft.cron || (!was.on && draft.on) ? now : was.since
  const saved: Shortcut = {
    id: was?.id ?? randomUUID(),
    name: draft.name,
    root: draft.root,
    prompt: draft.prompt,
    ...(draft.goal === undefined || draft.goal.trim() === '' ? {} : { goal: draft.goal.trim() }),
    mode: draft.mode,
    ...(draft.model === undefined || draft.model === '' ? {} : { model: draft.model }),
    ...(draft.cron === undefined || draft.cron.trim() === '' ? {} : { cron: draft.cron.trim() }),
    on: draft.on,
    since,
    ...(was?.lastRun === undefined ? {} : { lastRun: was.lastRun }),
    ...(was?.lastSession === undefined ? {} : { lastSession: was.lastSession }),
  }
  setSettings({ shortcuts: was === undefined ? [...all, saved] : all.map((one) => (one.id === was.id ? saved : one)) })
  return saved
}

export function removeShortcut(id: string): void {
  setSettings({ shortcuts: getSettings().shortcuts.filter((one) => one.id !== id) })
}
