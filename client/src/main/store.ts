import { assertProviderSettingsWritable } from './provider-changes'
import { existsSync, mkdirSync, readFileSync, renameSync, watch, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { dataDirectory } from '../core/platform'
import { readPreferences, writePreferences } from '../core/configuration'

import { DEFAULT_SETTINGS, sessionMode } from '../shared/api'
import { newKey } from '../shared/pairing'
import type { Settings } from '../shared/api'
import { NO_CRASHES } from '../shared/reporting'
import type { CrashRecord } from '../shared/reporting'
import { withColors } from '../shared/project-color'
import { validateVpnIps, VPN_IP_CONFIGURATION_ERROR } from '../shared/vpn-ip'
import { localCalendarZone, recurrenceError } from '../shared/recurrence'
import { startWindowError } from '../shared/schedule'
import { carriedOver } from './carry-over'
import { withMoves } from './sessions'
import { setBrowserConversationDone } from '../cli/browser-lifecycle'
import type { NotesStore, SessionNote } from './sessions'

const folder = (): string => {
  const path = dataDirectory()
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

const readSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...readPreferences(folder()) })

let settings: Settings | undefined
interface SettingsClient {
  get(): Settings
  set(change: Partial<Settings>): Settings
  on(watcher: (settings: Settings) => void): () => void
}
let client: SettingsClient | undefined
export function configureSettingsClient(next: SettingsClient): void { client = next }
let settingsWatcher: ReturnType<typeof watch> | undefined
const watchers = new Set<(settings: Settings) => void>()

export function getSettings(): Settings {
  if (client !== undefined) return client.get()
  const loaded = settings === undefined
  // No file yet means a first run, and the old build's keys are worth keeping.
  if (settings === undefined) {
    const firstRun = !existsSync(join(folder(), SETTINGS))
    const persisted = readPreferences(folder())
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
      vpnStopOnFailure: _legacyVpnStop,
      calendarTimeZone: _storedZone,
      calendarRecurrenceVersion: _storedRecurrenceVersion,
      cronStartWindowVersion: _storedWindowVersion,
      managerShortcutsVersion: _storedManagerVersion,
      boardColumn: _boardColumn,
      ...found
    } = { ...DEFAULT_SETTINGS, ...(firstRun ? carriedOver() : {}), ...persisted } as Settings & Readonly<Record<string, unknown>>
    // A build from before the welcome kept no answer, and anyone with a project has already set up.
    const welcomed = persisted?.welcomed
    const chromeChosen = persisted?.chromeBridgeDefault === 1
    settings = {
      ...found,
      chromeBridge: chromeChosen ? found.chromeBridge : true,
      chromeBridgeDefault: 1,
      vpnIpCheck: found.vpnIpCheck !== false,
      vpnAllowedIps: validateVpnIps(found.vpnAllowedIps).ips,
      chatTransport: found.chatTransport === 'tmux' ? 'tmux' : 'stream',
      providerPlugins: found.providerPlugins ?? [],
      channels: found.channels ?? [],
      projectAssistants: found.projectAssistants ?? [],
      employeeFilter: typeof found.employeeFilter === 'string' ? found.employeeFilter : '',
      providerAutoUpdate: found.providerAutoUpdate ?? true,
      providerUpdatesReady: found.providerUpdatesReady ?? [],
      providerRemovalPending: found.providerRemovalPending ?? false,
      welcomed: welcomed ?? found.projects.length > 0,
      chatMode: sessionMode(found.chatMode),
      projectColors: withColors(found),
      phoneKey: found.phoneKey === '' ? newKey() : found.phoneKey,
      // One column chosen on its own by an earlier build is that column ticked; In review, gone now, is every column.
      boardColumns: found.boardColumns.length === 0 && (_boardColumn === 'progress' || _boardColumn === 'done') ? [_boardColumn] : found.boardColumns,
    }
    // Projects listed before colours were, and the phone's key, given once and for all.
    if (
      _legacyVpnStop !== undefined ||
      _boardColumn !== undefined ||
      Object.keys(settings.projectColors).length !== Object.keys(found.projectColors).length ||
      settings.phoneKey !== found.phoneKey ||
      settings.welcomed !== welcomed
    ) {
      writePreferences(folder(), settings)
    }
  }
  const calendarTimeZone = localCalendarZone()
  if (settings.calendarTimeZone !== calendarTimeZone || settings.calendarRecurrenceVersion !== 1 || settings.cronStartWindowVersion !== 1 || settings.managerShortcutsVersion !== 1) {
    settings = { ...settings, calendarTimeZone, calendarRecurrenceVersion: 1, cronStartWindowVersion: 1, managerShortcutsVersion: 1 }
    if (!loaded) for (const watcher of watchers) watcher(settings)
  }
  return settings
}

export function setSettings(change: Partial<Settings>): Settings {
  assertProviderSettingsWritable(change)
  if (client !== undefined) return client.set(change)
  const current = getSettings()
  let validated = { ...change }
  Reflect.deleteProperty(validated, 'vpnStopOnFailure')
  Reflect.deleteProperty(validated, 'calendarTimeZone')
  Reflect.deleteProperty(validated, 'calendarRecurrenceVersion')
  Reflect.deleteProperty(validated, 'cronStartWindowVersion')
  Reflect.deleteProperty(validated, 'managerShortcutsVersion')
  if (change.shortcuts !== undefined) {
    for (const shortcut of change.shortcuts) {
      const before = current.shortcuts.find((one) => one.id === shortcut.id)
      if (before === undefined || before.cron !== shortcut.cron || before.startWindowMinutes !== shortcut.startWindowMinutes || !isDeepStrictEqual(before.recurrence, shortcut.recurrence)) {
        const error = startWindowError(shortcut)
        if (error !== undefined) throw new Error(error)
      }
      if (shortcut.recurrence === undefined) continue
      if (before !== undefined && before.cron === shortcut.cron && isDeepStrictEqual(before.recurrence, shortcut.recurrence)) continue
      if (shortcut.cron !== undefined) throw new Error('Choose one timetable.')
      const error = recurrenceError(shortcut.recurrence, current.calendarTimeZone)
      if (error !== undefined) throw new Error(error)
    }
  }
  const vpnChange = Object.hasOwn(change, 'vpnIpCheck') || Object.hasOwn(change, 'vpnAllowedIps')
  if (vpnChange) {
    if (Object.hasOwn(change, 'vpnIpCheck') && typeof change.vpnIpCheck !== 'boolean') throw new Error(VPN_IP_CONFIGURATION_ERROR)
    if (Object.hasOwn(change, 'vpnAllowedIps') && !Array.isArray(change.vpnAllowedIps)) throw new Error(VPN_IP_CONFIGURATION_ERROR)
    const allowed = validateVpnIps(Object.hasOwn(change, 'vpnAllowedIps') ? change.vpnAllowedIps ?? [] : current.vpnAllowedIps)
    if (allowed.error !== undefined) throw new Error(allowed.error)
    if ((change.vpnIpCheck ?? current.vpnIpCheck) && allowed.ips.length === 0) throw new Error(VPN_IP_CONFIGURATION_ERROR)
    validated = { ...validated, vpnAllowedIps: allowed.ips }
  }
  const next = { ...current, ...validated }
  const { calendarTimeZone: _zone, calendarRecurrenceVersion: _recurrenceVersion, cronStartWindowVersion: _windowVersion, managerShortcutsVersion: _managerVersion, ...persisted } = next
  writePreferences(folder(), persisted)
  settings = next
  for (const watcher of watchers) watcher(settings)
  return settings
}

const reloadSettings = (): void => {
  let found: Settings
  try { found = readSettings() } catch { return }
  const { calendarTimeZone: _foundZone, calendarRecurrenceVersion: _foundRecurrenceVersion, cronStartWindowVersion: _foundWindowVersion, managerShortcutsVersion: _foundManagerVersion, ...disk } = found
  const { calendarTimeZone: _currentZone, calendarRecurrenceVersion: _currentRecurrenceVersion, cronStartWindowVersion: _currentWindowVersion, managerShortcutsVersion: _currentManagerVersion, ...current } = getSettings()
  if (isDeepStrictEqual(disk, current)) return
  const previous = settings
  settings = undefined
  let changed: Settings
  try { changed = getSettings() } catch { settings = previous; return }
  for (const watcher of watchers) watcher(changed)
}

/** Told whenever anything changes, so a second window is never out of date. */
export function onSettings(watcher: (settings: Settings) => void): () => void {
  if (client !== undefined) return client.on(watcher)
  getSettings()
  watchers.add(watcher)
  if (watchers.size === 1) {
    settingsWatcher = watch(folder(), { encoding: 'utf8', persistent: false }, (_event, name) => {
      if (name === SETTINGS || name === 'local-state.json') reloadSettings()
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
  // In review is gone: a card an earlier build put there stands in In progress.
  let notes: ReturnType<NotesStore['all']> = Object.fromEntries(Object.entries(read<Record<string, SessionNote>>(NOTES, {}) ?? {}).map(([id, note]) => {
    if ((note.status as string | undefined) !== 'review') return [id, note]
    const { status: _review, ...rest } = note
    return [id, rest]
  }))
  let soon: NodeJS.Timeout | undefined
  return {
    all: () => notes,
    set: (id, note, attribution) => {
      const next = { ...notes, [id]: withMoves(notes[id], note, Date.now(), attribution) }
      if (note.status !== notes[id]?.status) setBrowserConversationDone(id, note.status === 'done')
      clearTimeout(soon)
      if (note.status !== notes[id]?.status || note.employeeId !== notes[id]?.employeeId || note.employeeRoot !== notes[id]?.employeeRoot || note.hidden !== notes[id]?.hidden || note.managerPrompt !== undefined || note.managerPrompt !== notes[id]?.managerPrompt || note.managerOwner !== undefined || note.managerOwner !== notes[id]?.managerOwner || (note.prepared !== undefined && notes[id] === undefined)) {
        const path = join(folder(), NOTES)
        writeFileSync(`${path}.new`, JSON.stringify(next, undefined, 2))
        renameSync(`${path}.new`, path)
        notes = next
        return
      }
      notes = next
      soon = setTimeout(() => write(NOTES, notes), 250)
    },
    replace: (next) => {
      clearTimeout(soon)
      for (const [id, note] of Object.entries(next)) if (note.status !== notes[id]?.status) setBrowserConversationDone(id, note.status === 'done')
      notes = { ...next }
      write(NOTES, notes)
    },
  }
}

/** The errors held until somebody says they may be sent, redacted already. */
export const readErrors = (): CrashRecord => read(ERRORS, NO_CRASHES) ?? NO_CRASHES
export const writeErrors = (record: CrashRecord): void => write(ERRORS, record)
