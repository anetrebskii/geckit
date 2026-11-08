import { isDeepStrictEqual } from 'node:util'
import type { Json, JsonObject } from '../shared/elicitation'
import { jsonObject } from '../shared/elicitation'
import type { ManagerIntakeConfig } from '../shared/manager-intake'
import { validateIntakeConfig } from '../main/manager-intake'

export function flagsFrom(args: readonly string[], allowed: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>()
  for (let at = 0; at < args.length; at += 2) {
    const key = args[at]
    const value = args[at + 1]
    if (key === undefined || !allowed.includes(key) || value === undefined || flags.has(key)) throw new Error('Unsupported or repeated arguments. Run capabilities on this target.')
    flags.set(key, value)
  }
  return flags
}
export function required(flags: Map<string, string>, key: string): string {
  const value = flags.get(key)
  if (value === undefined || value.trim() === '') throw new Error(`Missing ${key}.`)
  return value
}
export function jsonInput(text: string): JsonObject {
  let parsed: Json
  try { parsed = JSON.parse(text) as Json } catch { throw new Error('Supply a valid JSON object.') }
  const result = jsonObject(parsed)
  if (result === undefined || Object.keys(result).some((key) => ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error('Supply a JSON object with ordinary field names.')
  return result
}
export function onlyFields(value: JsonObject, keys: readonly string[]): void {
  if (Object.keys(value).length === 0 || Object.keys(value).some((key) => !keys.includes(key))) throw new Error(`Supported fields: ${keys.join(', ')}. Native credentials and permissions cannot be supplied here.`)
}
export function expectedValues<T extends object>(current: T, text: string, keys: readonly (keyof T & string)[]): void {
  const expected = jsonInput(text)
  onlyFields(expected, keys)
  for (const key of Object.keys(expected)) if (!isDeepStrictEqual(current[key as keyof T], expected[key])) throw new Error(`${key} changed. Read current target state and merge before retrying.`)
}
export const stringList = (value: Json | undefined): value is string[] => Array.isArray(value) && value.every((one) => typeof one === 'string')

export function intakeInput(value: Json): ManagerIntakeConfig {
  const input = jsonObject(value)
  if (input === undefined) throw new Error('Intake must be a JSON object.')
  onlyFields(input, ['enabled', 'timeZone', 'windows', 'sources'])
  if (input.enabled !== false) throw new Error('Automatic Voice Memos intake was removed. Create a Manager shortcut instead.')
  if (typeof input.timeZone !== 'string' || !Array.isArray(input.windows) || !Array.isArray(input.sources)) throw new Error('Supply intake timezone, windows and sources.')
  const windows = input.windows.map((one) => {
    const window = jsonObject(one)
    if (window === undefined) throw new Error('Invalid intake window.')
    onlyFields(window, ['days', 'start', 'end'])
    if (!Array.isArray(window.days) || !window.days.every((day) => typeof day === 'number') || typeof window.start !== 'string' || typeof window.end !== 'string') throw new Error('Invalid intake window.')
    return { days: window.days as number[], start: window.start, end: window.end }
  })
  const sources = input.sources.map((one) => {
    const source = jsonObject(one)
    if (source === undefined) throw new Error('Invalid intake source.')
    onlyFields(source, ['id', 'kind', 'enabled', 'directory'])
    if (typeof source.id !== 'string' || source.kind !== 'voice-memos' || typeof source.enabled !== 'boolean' || source.directory !== undefined && typeof source.directory !== 'string') throw new Error('Invalid intake source.')
    return { id: source.id, kind: source.kind, enabled: source.enabled, ...(typeof source.directory === 'string' ? { directory: source.directory } : {}) } as ManagerIntakeConfig['sources'][number]
  })
  const config: ManagerIntakeConfig = { enabled: false, timeZone: input.timeZone, windows, sources }
  validateIntakeConfig(config)
  return config
}
