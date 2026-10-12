import { mkdirSync, readFileSync, renameSync, watch, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { app } from 'electron'

import { DEFAULT_SETTINGS, sessionMode } from '../shared/api'
import { newKey } from '../shared/pairing'
import type { Settings } from '../shared/api'
import { NO_CRASHES } from '../shared/reporting'
import type { CrashRecord } from '../shared/reporting'
import { withColors } from '../shared/project-color'
import { localCalendarZone, recurrenceError } from '../shared/recurrence'
import { carriedOver } from './carry-over'
import { withMoves } from './sessions'
import type { NotesStore, SessionNote } from './sessions'

/**
 * What this application remembers, in two files it owns.
 *
 * `localStorage` was where this lived, and a window is the wrong place for it
 * now: three windows and the main process all read the same values, and the
 * main process is the one that has to have the keys.
 */

const folder = (): string => {
  const path = app.getPath('userData')
  mkdirSync(path, { recursive: true })
  return path
}

function read<T>(name: string, fallback: T): T | undefined {
  try {
    return { ...fallback, ...(JSON.parse(readFileSync(join(folder(), name), 'utf8')) as T) }
  } catch {
    return undefined
  }
}

/** Written beside itself and moved into place, so a crash mid-write leaves the old one. */
function write(name: string, value: unknown): void {
  const path = join(folder(), name)
  try {
    writeFileSync(`${path}.new`, JSON.stringify(value, undefined, 2))
    renameSync(`${path}.new`, path)
  } catch {
    // A settings file that cannot be written is not worth taking the window down for.
  }
}

const SETTINGS = 'settings.json'
const NOTES = 'sessions.json'
const ERRORS = 'errors.json'

let settings: Settings | undefined
let settingsWatcher: ReturnType<typeof watch> | undefined
const watchers = new Set<(settings: Settings) => void>()

export function getSettings(): Settings {
  const loaded = settings === undefined
  // No file yet means a first run, and the old build's keys are worth keeping.
  if (settings === undefined) {
    // Correct and dictation no longer run on a key: the keys and the choices that went with them are dropped.
    const {
      openRouterKey: _openRouter,
      openAiKey: _openAi,
      anthropicKey: _anthropic,
      provider: _provider,
      correctEngine: _engine,
      correctKeyModel: _keyModel,
      dictation: _dictation,
      whisperModel: _whisper,
      calendarTimeZone: _storedZone,
      calendarRecurrenceVersion: _storedRecurrenceVersion,
      ...found
    } = (read(SETTINGS, DEFAULT_SETTINGS) ?? { ...DEFAULT_SETTINGS, ...carriedOver() }) as Settings & Readonly<Record<string, unknown>>
    // A build from before the welcome kept no answer, and anyone with a project has already set up.
    const welcomed = read<Partial<Settings>>(SETTINGS, {})?.welcomed
    settings = {
      ...found,
      chatTransport: found.chatTransport === 'tmux' ? 'tmux' : 'stream',
      providerPlugins: found.providerPlugins ?? [],
      providerAutoUpdate: found.providerAutoUpdate ?? true,
      providerUpdatesReady: found.providerUpdatesReady ?? [],
      providerRemovalPending: found.providerRemovalPending ?? false,
      welcomed: welcomed ?? found.projects.length > 0,
      chatMode: sessionMode(found.chatMode),
      projectColors: withColors(found),
      phoneKey: found.phoneKey === '' ? newKey() : found.phoneKey,
    }
    // Projects listed before colours were, and the phone's key, given once and for all.
    if (
      Object.keys(settings.projectColors).length !== Object.keys(found.projectColors).length ||
      settings.phoneKey !== found.phoneKey ||
      settings.welcomed !== welcomed
    ) {
      write(SETTINGS, settings)
    }
  }
  const calendarTimeZone = localCalendarZone()
  if (settings.calendarTimeZone !== calendarTimeZone || settings.calendarRecurrenceVersion !== 1) {
    settings = { ...settings, calendarTimeZone, calendarRecurrenceVersion: 1 }
    if (!loaded) for (const watcher of watchers) watcher(settings)
  }
  return settings
}

export function setSettings(change: Partial<Settings>): Settings {
  const current = getSettings()
  const validated = { ...change }
  Reflect.deleteProperty(validated, 'calendarTimeZone')
  Reflect.deleteProperty(validated, 'calendarRecurrenceVersion')
  if (change.shortcuts !== undefined) {
    for (const shortcut of change.shortcuts) {
      if (shortcut.recurrence === undefined) continue
      const before = current.shortcuts.find((one) => one.id === shortcut.id)
      if (before !== undefined && before.cron === shortcut.cron && isDeepStrictEqual(before.recurrence, shortcut.recurrence)) continue
      if (shortcut.cron !== undefined) throw new Error('Choose one timetable.')
      const error = recurrenceError(shortcut.recurrence, current.calendarTimeZone)
      if (error !== undefined) throw new Error(error)
    }
  }
  const next = { ...current, ...validated }
  const { calendarTimeZone: _zone, calendarRecurrenceVersion: _recurrenceVersion, ...persisted } = next
  if (change.shortcuts !== undefined) {
    const path = join(folder(), SETTINGS)
    writeFileSync(`${path}.new`, JSON.stringify(persisted, undefined, 2))
    renameSync(`${path}.new`, path)
  } else write(SETTINGS, persisted)
  settings = next
  for (const watcher of watchers) watcher(settings)
  return settings
}

const reloadSettings = (): void => {
  const found = read(SETTINGS, DEFAULT_SETTINGS)
  if (found === undefined) return
  const { calendarTimeZone: _foundZone, calendarRecurrenceVersion: _foundRecurrenceVersion, ...disk } = found
  const { calendarTimeZone: _currentZone, calendarRecurrenceVersion: _currentRecurrenceVersion, ...current } = getSettings()
  if (isDeepStrictEqual(disk, current)) return
  settings = undefined
  const changed = getSettings()
  for (const watcher of watchers) watcher(changed)
}

/** Told whenever anything changes, so a second window is never out of date. */
export function onSettings(watcher: (settings: Settings) => void): () => void {
  getSettings()
  watchers.add(watcher)
  if (watchers.size === 1) {
    settingsWatcher = watch(folder(), { encoding: 'utf8', persistent: false }, (_event, name) => {
      if (name === SETTINGS) reloadSettings()
    })
    reloadSettings()
  }
  return () => {
    watchers.delete(watcher)
    if (watchers.size === 0) {
      settingsWatcher?.close()
      settingsWatcher = undefined
    }
  }
}

/** The project folders the chat window offers, this one first. One added while a profile is in use joins that profile too. */
export function rememberProject(root: string): Settings {
  const now = getSettings()
  const projects = [root, ...now.projects.filter((one) => one !== root)].slice(0, 20)
  return setSettings({
    projects,
    profiles: now.profiles.map((one) =>
      one.id !== now.profile || one.projects.includes(root) ? one : { ...one, projects: [...one.projects, root] },
    ),
    projectColors: withColors({ projects, projectColors: now.projectColors }),
  })
}

export function forgetProject(root: string): Settings {
  const now = getSettings()
  return setSettings({
    projects: now.projects.filter((one) => one !== root),
    profiles: now.profiles.map((one) => ({ ...one, projects: one.projects.filter((kept) => kept !== root) })),
  })
}

/**
 * Every trace of every root a test says yes to - a whole host going, say,
 * rather than one project by hand - taken off the list, its place in a
 * profile, its colour, and Chat's own filter: `forgetProject` alone left
 * those last two standing after their root was already gone.
 */
export function forgetRoots(matches: (root: string) => boolean): Settings {
  const now = getSettings()
  return setSettings({
    projects: now.projects.filter((one) => !matches(one)),
    profiles: now.profiles.map((one) => ({ ...one, projects: one.projects.filter((kept) => !matches(kept)) })),
    projectColors: Object.fromEntries(Object.entries(now.projectColors).filter(([root]) => !matches(root))),
    chatProjects: now.chatProjects.filter((one) => !matches(one)),
  })
}

/** What the tool's own session file will not say back, kept beside it. */
export function notesStore(): NotesStore {
  let notes = read<Record<string, SessionNote>>(NOTES, {}) ?? {}
  let soon: NodeJS.Timeout | undefined
  return {
    all: () => notes,
    set: (id, note) => {
      notes = { ...notes, [id]: withMoves(notes[id], note, Date.now()) }
      clearTimeout(soon)
      soon = setTimeout(() => write(NOTES, notes), 250)
    },
    replace: (next) => {
      clearTimeout(soon)
      notes = { ...next }
      write(NOTES, notes)
    },
  }
}

/** The errors held until somebody says they may be sent, redacted already. */
export const readErrors = (): CrashRecord => read(ERRORS, NO_CRASHES) ?? NO_CRASHES
export const writeErrors = (record: CrashRecord): void => write(ERRORS, record)
