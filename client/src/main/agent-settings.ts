import { PROJECT_COLORS } from '../shared/project-color'
import { isDeepStrictEqual } from 'node:util'
import type { Settings } from '../shared/api'
import { assistantsIn } from '../shared/api'
import { AGENT_SETTING_RULES, AGENT_SETTINGS_SCHEMA } from '../shared/agent-settings'
import type { AgentSettings, AgentSettingsPatch } from '../shared/agent-settings'
import { validateVpnIps, VPN_IP_CONFIGURATION_ERROR } from '../shared/vpn-ip'

type Json = string | number | boolean | null | readonly Json[] | JsonObject
interface JsonObject { readonly [key: string]: Json }
const object = (value: Json | undefined): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value)
const strings = (value: Json): value is readonly string[] => Array.isArray(value) && value.every((one) => typeof one === 'string')

export function agentSettings(settings: Settings): AgentSettings & Pick<Settings, 'projects' | 'chatProviders'> & { readonly hosts: readonly Pick<Settings['hosts'][number], 'id' | 'name'>[]; readonly schedules: readonly Pick<Settings['shortcuts'][number], 'id' | 'name' | 'on'>[]; readonly defaultProvider: Settings['chatProvider'] } {
  const preferences = Object.fromEntries(Object.keys(AGENT_SETTING_RULES).map((key) => [key, settings[key as keyof AgentSettings]])) as AgentSettings
  return { ...preferences, defaultProvider: settings.chatProvider, projects: settings.projects, chatProviders: settings.chatProviders, hosts: settings.hosts.map(({ id, name }) => ({ id, name })), schedules: settings.shortcuts.map(({ id, name, on }) => ({ id, name, on })) }
}

function patch(text: string, settings: Settings): AgentSettingsPatch {
  let parsed: Json
  try { parsed = JSON.parse(text) as Json } catch { throw new Error('Settings patch must be valid JSON.') }
  if (!object(parsed) || Object.keys(parsed).length === 0) throw new Error('Settings patch must be a nonempty JSON object. Run settings schema.')
  const projects = (value: readonly string[]): boolean => value.every((one) => settings.projects.includes(one))
  const enabled = (value: Json | undefined): boolean => typeof value === 'string' && assistantsIn(settings).some((one) => one === value)
  for (const [key, value] of Object.entries(parsed)) {
    if (!Object.hasOwn(AGENT_SETTING_RULES, key)) throw new Error(`Setting ${key} is unavailable to agents. Run settings schema for supported fields and boundaries.`)
    const rule = AGENT_SETTING_RULES[key as keyof AgentSettings]
    let valid = false
    if (Array.isArray(rule)) valid = key === 'anywhereOff' ? strings(value) && value.every((one) => rule.includes(one)) : typeof value === 'string' && rule.includes(value)
    else if (rule === 'string' || rule === 'boolean') valid = typeof value === rule
    else if (rule === 'nonnegative integer') valid = typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    else if (rule === 'enabled provider') valid = enabled(value)
    else if (rule === 'string array') valid = strings(value)
    else if (rule === 'registered project array') valid = strings(value) && projects(value)
    else if (rule === 'registered project or empty') valid = typeof value === 'string' && (value === '' || projects([value]))
    else if (rule === 'column array') valid = strings(value) && value.every((one) => ['todo', 'progress', 'done'].includes(one))
    else if (rule === 'portrait or empty') valid = typeof value === 'string' && (value === '' || /^employee-(?:0[1-9]|1[0-2])$/.test(value))
    else if (rule === 'profile id or empty') valid = typeof value === 'string'
    else if (rule === 'string map' || rule === 'boolean map' || rule === 'project color map') {
      valid = object(value) && Object.entries(value).every(([name, one]) => !['__proto__', 'constructor', 'prototype'].includes(name) && (rule === 'project color map' ? projects([name]) && typeof one === 'number' && Number.isInteger(one) && one >= 0 && one < PROJECT_COLORS.length : typeof one === (rule === 'string map' ? 'string' : 'boolean')))
    } else if (rule === 'provider/model array') valid = Array.isArray(value) && value.every((one) => object(one) && Object.keys(one).length === 2 && enabled(one.provider) && typeof one.model === 'string')
    else if (rule === 'root/provider array') valid = Array.isArray(value) && value.every((one) => object(one) && Object.keys(one).length === 2 && typeof one.root === 'string' && projects([one.root]) && enabled(one.provider))
    else if (rule === 'open rule array') valid = Array.isArray(value) && value.every((one) => object(one) && Object.keys(one).length === 2 && typeof one.kinds === 'string' && typeof one.app === 'string')
    else if (rule === 'profile array') valid = Array.isArray(value) && value.every((one) => object(one) && Object.keys(one).length === 3 && typeof one.id === 'string' && one.id.trim() !== '' && typeof one.name === 'string' && one.name.trim() !== '' && Array.isArray(one.projects) && strings(one.projects) && projects(one.projects)) && new Set(value.filter(object).map((one) => one.id)).size === value.length
    if (!valid) throw new Error(`Invalid ${key}: expected ${Array.isArray(rule) ? rule.join(', ') : rule}. No settings were changed.`)
  }
  const change = parsed as AgentSettingsPatch
  if (change.profile !== undefined && change.profile !== '' && !(change.profiles ?? settings.profiles).some((one) => one.id === change.profile)) throw new Error('Unknown profile. Read settings show before selecting it.')
  if (change.profiles !== undefined && (change.profile ?? settings.profile) !== '' && !change.profiles.some((one) => one.id === (change.profile ?? settings.profile))) throw new Error('The selected profile must remain available, or set profile to an empty string.')
  if (change.vpnAllowedIps !== undefined || change.vpnIpCheck !== undefined) {
    const allowed = validateVpnIps(change.vpnAllowedIps ?? settings.vpnAllowedIps)
    if (allowed.error !== undefined) throw new Error(allowed.error)
    if ((change.vpnIpCheck ?? settings.vpnIpCheck) && allowed.ips.length === 0) throw new Error(VPN_IP_CONFIGURATION_ERROR)
  }
  return change
}

export function settingsCommand(args: readonly string[], read: () => Settings, save: (change: Partial<Settings>) => Settings): string {
  const [command, ...rest] = args
  if ((command === 'show' || command === 'schema') && (rest.length === 0 || rest.length === 1 && rest[0] === '--json')) return JSON.stringify(command === 'schema' ? AGENT_SETTINGS_SCHEMA : agentSettings(read()))
  if (command !== 'edit') throw new Error('Use settings show, settings schema or settings edit --patch <JSON object> [--expected <JSON object>].')
  const flags = new Map<string, string>()
  for (let at = 0; at < rest.length; at += 2) {
    const flag = rest[at]
    const value = rest[at + 1]
    if (flag === undefined || !['--patch', '--expected'].includes(flag) || value === undefined || flags.has(flag)) throw new Error('Use --patch once and optionally --expected once, each with a JSON object.')
    flags.set(flag, value)
  }
  const text = flags.get('--patch')
  if (text === undefined) throw new Error('Missing --patch. Run settings schema.')
  const current = read()
  const change = patch(text, current)
  const expected = flags.get('--expected')
  if (expected !== undefined) {
    let before: Json
    try { before = JSON.parse(expected) as Json } catch { throw new Error('--expected must be valid JSON.') }
    if (!object(before) || Object.keys(before).length === 0 || Object.keys(before).some((key) => !Object.hasOwn(AGENT_SETTING_RULES, key))) throw new Error('--expected must be a nonempty object of supported settings fields.')
    for (const key of Object.keys(before) as (keyof AgentSettings)[]) if (!isDeepStrictEqual(current[key], before[key])) throw new Error(`Setting ${key} changed. Read settings show and merge before retrying.`)
  }
  const merged: AgentSettingsPatch = {
    ...change,
    ...(change.browserNames === undefined ? {} : { browserNames: { ...current.browserNames, ...change.browserNames } }),
    ...(change.projectColors === undefined ? {} : { projectColors: { ...current.projectColors, ...change.projectColors } }),
    ...(change.guidePlugins === undefined ? {} : { guidePlugins: { ...current.guidePlugins, ...change.guidePlugins } }),
  }
  return JSON.stringify({ saved: true, settings: agentSettings(save(change.analytics === false ? { ...merged, client: '' } : merged)) })
}
