import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import type { Settings } from '../shared/api'
import type { Configuration, LocalSettings } from '../shared/configuration'
import { LOCAL_SETTINGS, PREFERENCE_SECTIONS } from '../shared/configuration'
import type { Employee } from '../shared/employees'
import type { ManagerConfig } from '../shared/manager'

const FILE = 'settings.json'
const LOCAL = 'local-state.json'
const ERROR = 'GeckIt configuration could not be read. Repair settings.json or restore its backup.'
const object = (value: object | null): boolean => value !== null && typeof value === 'object' && !Array.isArray(value)

function read<T>(path: string): T | undefined {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as T : undefined
}

function prepareJson<T>(path: string, value: T): void {
  writeFileSync(`${path}.new`, JSON.stringify(value, undefined, 2), { mode: 0o600 })
  chmodSync(`${path}.new`, 0o600)
}

export function writeJson<T>(path: string, value: T): void {
  prepareJson(path, value)
  renameSync(`${path}.new`, path)
}

function pick<Key extends keyof Settings>(settings: Partial<Settings>, keys: readonly Key[]): Partial<Pick<Settings, Key>> {
  return Object.fromEntries(keys.filter((key) => Object.hasOwn(settings, key)).map((key) => [key, settings[key]])) as Partial<Pick<Settings, Key>>
}

function sections(settings: Partial<Settings>): Configuration {
  const legacy = settings as Partial<Settings> & { readonly boardColumn?: string }
  const board = legacy.boardColumn === 'done' || legacy.boardColumn === 'progress' ? { boardColumns: [legacy.boardColumn] } : {}
  return {
    version: 1,
    ...Object.fromEntries(Object.entries(PREFERENCE_SECTIONS).map(([section, keys]) => [section, pick(settings, keys)])),
    conversation: { ...pick(settings, PREFERENCE_SECTIONS.conversation), ...board },
    ...(settings.hosts === undefined ? {} : { hosts: settings.hosts }),
    ...(settings.shortcuts === undefined ? {} : { shortcuts: settings.shortcuts.map(({ since: _since, lastRun: _lastRun, lastSession: _lastSession, ...shortcut }) => shortcut) }),
    ...(settings.phrases === undefined ? {} : { phrases: settings.phrases }),
  }
}

function localSettings(settings: Partial<Settings>): LocalSettings {
  return { ...pick(settings, LOCAL_SETTINGS), ...(settings.shortcuts === undefined ? {} : { shortcutHistory: settings.shortcuts.map(({ id, since, lastRun, lastSession }) => ({ id, since, ...(lastRun === undefined ? {} : { lastRun }), ...(lastSession === undefined ? {} : { lastSession }) })) }) }
}

function validateEmployees(employees: readonly Partial<Employee>[]): void {
  if (!Array.isArray(employees) || !employees.every((one) => one !== null && typeof one.id === 'string' && typeof one.name === 'string' && one.name.trim() !== '' && typeof one.role === 'string' && typeof one.description === 'string' && typeof one.avatar === 'string' && /^employee-(?:0[1-9]|1[0-2])$/.test(one.avatar) && typeof one.archived === 'boolean' && typeof one.revision === 'number' && Number.isInteger(one.revision) && one.revision > 0)) throw new Error('The employee catalog could not be read.')
}

function validate(config: Configuration): void {
  if (!object(config) || config.version !== 1) throw new Error('Unsupported GeckIt configuration version. Update GeckIt or restore a supported settings.json.')
  for (const section of Object.keys(PREFERENCE_SECTIONS) as (keyof typeof PREFERENCE_SECTIONS)[]) {
    const value = config[section]
    if (value !== undefined && !object(value)) throw new Error(ERROR)
  }
  for (const section of ['hosts', 'shortcuts', 'phrases'] as const) if (config[section] !== undefined && !Array.isArray(config[section])) throw new Error(ERROR)
  if (config.manager !== undefined && !object(config.manager)) throw new Error(ERROR)
  if (config.employees !== undefined) validateEmployees(config.employees)
}

function load(directory: string): Configuration | Partial<Settings> | undefined {
  try {
    const parsed = read<Configuration | Partial<Settings>>(join(directory, FILE))
    if (parsed === undefined) return undefined
    if (!object(parsed)) throw new Error(ERROR)
    if ('version' in parsed || 'general' in parsed || 'assistants' in parsed || 'conversation' in parsed || 'speech' in parsed || 'integrations' in parsed || 'employees' in parsed || 'manager' in parsed || 'projects' in parsed && !Array.isArray(parsed.projects)) validate(parsed as Configuration)
    return parsed
  } catch (error) {
    throw new Error(ERROR, { cause: error })
  }
}

const canonical = (value: Configuration | Partial<Settings>): value is Configuration => 'version' in value

export function configuration(directory: string): Configuration {
  const found = load(directory)
  if (found !== undefined && canonical(found)) {
    const local = read<LocalSettings>(join(directory, LOCAL)) ?? {}
    const missing = found.shortcuts?.filter((shortcut) => !local.shortcutHistory?.some((one) => one.id === shortcut.id)) ?? []
    if (missing.length > 0) writeJson(join(directory, LOCAL), { ...local, shortcutHistory: [...local.shortcutHistory ?? [], ...missing.map(({ id }) => ({ id, since: Date.now() }))] })
    return found
  }
  const employees = read<readonly Employee[]>(join(directory, 'employees.json')) ?? []
  validateEmployees(employees)
  const manager = read<{ readonly config?: Partial<ManagerConfig> }>(join(directory, 'manager.json'))
  if (manager !== undefined && !object(manager)) throw new Error(ERROR)
  const next: Configuration = { ...sections(found ?? {}), employees, manager: manager?.config ?? {} }
  validate(next)
  mkdirSync(directory, { recursive: true })
  const originals = [FILE, 'employees.json', 'manager.json'].filter((name) => existsSync(join(directory, name)))
  if (originals.length > 0) {
    const backup = join(directory, 'backups', 'configuration-v1')
    mkdirSync(backup, { recursive: true, mode: 0o700 })
    for (const name of originals) if (!existsSync(join(backup, name))) {
      copyFileSync(join(directory, name), join(backup, name))
      chmodSync(join(backup, name), 0o600)
    }
  }
  prepareJson(join(directory, FILE), next)
  const state = localSettings(found ?? {})
  if (Object.keys(state).length > 0) writeJson(join(directory, LOCAL), state)
  renameSync(join(directory, `${FILE}.new`), join(directory, FILE))
  return next
}

export function setConfiguration(directory: string, change: Partial<Omit<Configuration, 'version'>>): void {
  const before = configuration(directory)
  const next = { ...before, ...change }
  validate(next)
  if (!isDeepStrictEqual(before, next)) writeJson(join(directory, FILE), next)
}

export function readPreferences(directory: string, migrate = true): Partial<Settings> | undefined {
  const found = migrate ? configuration(directory) : load(directory)
  if (found === undefined || !canonical(found)) return found
  const state = read<LocalSettings>(join(directory, LOCAL)) ?? {}
  const { shortcutHistory: _history, ...local } = state
  const preferences: Partial<Settings> = Object.assign({}, ...Object.entries(PREFERENCE_SECTIONS).map(([section, keys]) => pick(found[section as keyof typeof PREFERENCE_SECTIONS] ?? {}, keys)))
  return {
    ...preferences,
    ...local,
    ...(found.hosts === undefined ? {} : { hosts: found.hosts }),
    ...(found.phrases === undefined ? {} : { phrases: found.phrases }),
    ...(found.shortcuts === undefined ? {} : { shortcuts: found.shortcuts.map((shortcut) => ({ ...shortcut, ...state.shortcutHistory?.find((one) => one.id === shortcut.id), since: state.shortcutHistory?.find((one) => one.id === shortcut.id)?.since ?? Date.now() })) }),
  }
}

export function writePreferences(directory: string, settings: Partial<Settings>): void {
  const before = configuration(directory)
  const grouped = sections(settings)
  const merged = Object.fromEntries((Object.keys(PREFERENCE_SECTIONS) as (keyof typeof PREFERENCE_SECTIONS)[]).map((section) => [section, { ...before[section], ...grouped[section] }]))
  const local = read<LocalSettings>(join(directory, LOCAL)) ?? {}
  const state = { ...local, ...localSettings(settings) }
  const next = { ...before, ...grouped, ...merged }
  const changed = !isDeepStrictEqual(before, next)
  if (changed) prepareJson(join(directory, FILE), next)
  if (!isDeepStrictEqual(local, state)) writeJson(join(directory, LOCAL), state)
  if (changed) renameSync(join(directory, `${FILE}.new`), join(directory, FILE))
}

export function copyConfiguration(source: string, destination: string): void {
  const found = load(source)
  if (found === undefined) return
  mkdirSync(destination, { recursive: true })
  if (canonical(found)) {
    writeJson(join(destination, FILE), { ...found, integrations: { ...found.integrations, phone: false } })
  } else {
    const employees = read<readonly Employee[]>(join(source, 'employees.json')) ?? []
    const manager = read<{ readonly config?: Partial<ManagerConfig> }>(join(source, 'manager.json'))
    if (manager !== undefined && !object(manager)) throw new Error(ERROR)
    const next: Configuration = { ...sections({ ...found, phone: false }), employees, manager: manager?.config ?? {} }
    validate(next)
    writeJson(join(destination, FILE), next)
  }
}
