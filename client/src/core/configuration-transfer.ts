import { randomUUID } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { DEFAULT_SETTINGS } from '../shared/api'
import type { Settings } from '../shared/api'
import type { Configuration } from '../shared/configuration'
import { LOCAL_SETTINGS, PREFERENCE_SECTIONS } from '../shared/configuration'
import { DEFAULT_MANAGER_CONFIG } from '../shared/manager'
import { recurrenceError } from '../shared/recurrence'
import { configuration, parseConfiguration, writeJson } from './configuration'

type Json = string | number | boolean | null | readonly Json[] | JsonObject
interface JsonObject { readonly [key: string]: Json }
const object = (value: Json | undefined): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value)
const INVALID = 'This file is not a supported GeckIt configuration. Choose an exported settings file.'
export const IMPORT_PENDING = 'configuration-import.json'

const examples = {
  ...DEFAULT_SETTINGS,
  projects: [''], chatProviders: ['claude'], chatProjects: [''], boardColumns: [''], anywhereOff: ['correct'], vpnAllowedIps: [''],
  chatBounds: { x: 0, y: 0, width: 800, height: 600 }, panelBounds: { x: 0, y: 0, width: 800, height: 600 }, geckoBounds: { x: 0, y: 0, width: 80, height: 80 },
  openWith: [{ kinds: '', app: '' }], profiles: [{ id: '', name: '', projects: [''] }],
  projectAssistants: [{ root: '', provider: 'claude' }], providerModels: [{ provider: 'claude', model: '' }],
  providerPlugins: [{ id: 'plugin:example', family: 'plugin:example', name: '', shortName: '', icon: '', browser: 'none', loginCommand: '', planName: '' }],
  phrases: [''], hosts: [{ id: '', name: '', address: '', user: '', port: 22, auth: 'key' }],
  shortcuts: [{ id: '', name: '', root: '', prompt: '', mode: 'auto', on: true, since: 0 }],
} satisfies Settings
const samples = JSON.parse(JSON.stringify(examples)) as JsonObject
const choices = {
  theme: ['system', 'light', 'dark'], chatMode: ['manual', 'auto', 'plan'], chatTransport: ['stream', 'tmux'],
  chatGrouping: ['time', 'project'], chatView: ['list', 'board'], conversationPlace: ['over', 'below'],
  updateChannel: ['stable', 'dev'], flashFor: ['asks', 'all', 'never'], soundFor: ['asks', 'all', 'never'],
  codexReasoning: ['', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'],
} satisfies Partial<{ readonly [Key in keyof Settings]: readonly Settings[Key][] }>

function sameShape(value: Json, sample: Json): boolean {
  if (Array.isArray(sample)) {
    const first = sample[0]
    return Array.isArray(value) && (first === undefined || value.every((one) => sameShape(one, first)))
  }
  if (object(sample)) return object(value) && Object.entries(sample).every(([key, one]) => value[key] !== undefined && sameShape(value[key], one))
  return typeof value === typeof sample && value !== null && (typeof value !== 'number' || Number.isFinite(value))
}

export function importableConfiguration(text: string): Configuration {
  try {
    const config = parseConfiguration(text)
    const json = JSON.parse(text) as JsonObject
    if (LOCAL_SETTINGS.some((key) => Object.hasOwn(json, key)) || Object.hasOwn(json, 'shortcutHistory')) throw new Error(INVALID)
    for (const [section, keys] of Object.entries(PREFERENCE_SECTIONS)) {
      const group = json[section]
      if (!object(group)) continue
      for (const key of keys) {
        const value = group[key]
        const sample = samples[key]
        if (value !== undefined && sample !== undefined && !sameShape(value, sample)) throw new Error(INVALID)
      }
      for (const [key, allowed] of Object.entries(choices)) if (group[key] !== undefined && !allowed.some((value) => value === group[key])) throw new Error(INVALID)
    }
    for (const key of ['projectColors', 'browserNames', 'guidePlugins'] as const) {
      const group = json[key === 'projectColors' ? 'projects' : 'integrations']
      const value = object(group) ? group[key] : undefined
      const expected = key === 'projectColors' ? 'number' : key === 'browserNames' ? 'string' : 'boolean'
      if (value !== undefined && (!object(value) || !Object.values(value).every((one) => typeof one === expected))) throw new Error(INVALID)
    }
    for (const key of ['hosts', 'phrases'] as const) {
      const sample = samples[key]
      if (json[key] !== undefined && sample !== undefined && !sameShape(json[key], sample)) throw new Error(INVALID)
    }
    if (Array.isArray(json.shortcuts)) for (const shortcut of json.shortcuts) {
      const sample = Array.isArray(samples.shortcuts) ? samples.shortcuts[0] : undefined
      if (!object(shortcut) || sample === undefined || !sameShape({ ...shortcut, since: 0 }, sample)) throw new Error(INVALID)
      if (['since', 'lastRun', 'lastSession'].some((key) => Object.hasOwn(shortcut, key))) throw new Error(INVALID)
      if (['goal', 'model', 'employeeId', 'cron', 'provider', 'reasoning'].some((key) => shortcut[key] !== undefined && typeof shortcut[key] !== 'string')) throw new Error(INVALID)
      if (!['manual', 'auto', 'plan'].includes(String(shortcut.mode)) || shortcut.target !== undefined && shortcut.target !== 'manager') throw new Error(INVALID)
    }
    for (const shortcut of config.shortcuts ?? []) if (shortcut.recurrence !== undefined && recurrenceError(shortcut.recurrence) !== undefined) throw new Error(INVALID)
    if (object(json.manager)) for (const [key, value] of Object.entries(DEFAULT_MANAGER_CONFIG)) {
      if (json.manager[key] !== undefined && typeof json.manager[key] !== typeof value) throw new Error(INVALID)
    }
    if (object(json.manager) && json.manager.intake !== undefined && !object(json.manager.intake)) throw new Error(INVALID)
    return config
  } catch { throw new Error(INVALID) }
}

export function exportConfiguration(directory: string): string {
  return JSON.stringify(configuration(directory), undefined, 2)
}

export function stageConfigurationImport(directory: string, text: string): void {
  const next = importableConfiguration(text)
  if (existsSync(join(directory, IMPORT_PENDING))) throw new Error('A configuration import is already waiting for GeckIt to restart.')
  writeJson(join(directory, IMPORT_PENDING), next)
}

export function applyConfigurationImport(directory: string): void {
  const pending = join(directory, IMPORT_PENDING)
  if (!existsSync(pending)) return
  const next = importableConfiguration(readFileSync(pending, 'utf8'))
  configuration(directory)
  const backup = join(directory, 'backups', `configuration-import-${randomUUID()}`)
  mkdirSync(backup, { recursive: true, mode: 0o700 })
  for (const name of ['settings.json', 'local-state.json', 'employees.json', 'manager.json']) {
    const path = join(directory, name)
    if (existsSync(path)) { copyFileSync(path, join(backup, name)); chmodSync(join(backup, name), 0o600) }
  }
  writeJson(join(directory, 'settings.json'), next)
  rmSync(pending)
}
