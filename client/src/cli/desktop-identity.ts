import { existsSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import base from './desktop/ubuntu-intel.json'

export type DesktopBase = typeof base
export type Presentation = 'desktop' | 'previous'
export interface DesktopIdentity {
  readonly version: 1
  readonly base: 'ubuntu-intel'
  readonly made: string
  readonly screen: { readonly width: number; readonly height: number }
  readonly cores: number
  readonly language: string
  readonly timezone: string
}
interface PresentationFile { readonly version: 1; readonly profiles: Readonly<Record<string, Presentation>> }

export const DESKTOP_BASE: DesktopBase = base
export const identityFile = (folder: string): string => join(folder, 'device.json')
const presentationFile = (folder: string): string => join(folder, 'presentation.json')

/** A Linux computer with no screen of its own: GeckIt gives its test browsers a virtual display and one desktop identity. */
export { camoufoxHeadless as isServer } from './camoufox'

const weighted = <T extends { readonly weight: number }>(items: readonly T[], random: () => number): T => {
  let left = random() * items.reduce((sum, one) => sum + one.weight, 0)
  for (const one of items) { left -= one.weight; if (left < 0) return one }
  return items[items.length - 1] as T
}

/** The language a server's LANG names, as a browser says it: en_GB.UTF-8 is en-GB; C, POSIX or nothing is en-US. */
export function languageOf(lang: string | undefined): string {
  const tag = (lang ?? '').split('.')[0]?.split('@')[0]?.replace('_', '-') ?? ''
  return /^[a-z]{2,3}(-[A-Z]{2})?$/.test(tag) ? tag : 'en-US'
}

export function makeIdentity(env: NodeJS.ProcessEnv, timezone: string, random: () => number = Math.random, now: Date = new Date()): DesktopIdentity {
  const screen = weighted(base.screens, random)
  return { version: 1, base: 'ubuntu-intel', made: now.toISOString(), screen: { width: screen.width, height: screen.height }, cores: weighted(base.cores, random).value, language: languageOf(env['LC_ALL'] || env['LANG']), timezone }
}

export function parseIdentity(text: string): DesktopIdentity {
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('it is not valid JSON') }
  const one = value as Partial<DesktopIdentity> | null
  const whole = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n > 0
  if (one === null || typeof one !== 'object' || one.version !== 1) throw new Error('its version is not 1')
  if (one.base !== 'ubuntu-intel') throw new Error('its base is not ubuntu-intel')
  if (!whole(one.screen?.width) || !whole(one.screen?.height)) throw new Error('its screen size is missing')
  if (!whole(one.cores)) throw new Error('its cores are missing')
  if (typeof one.language !== 'string' || one.language === '') throw new Error('its language is missing')
  if (typeof one.timezone !== 'string' || one.timezone === '') throw new Error('its timezone is missing')
  if (typeof one.made !== 'string') throw new Error('the date it was made is missing')
  return one as DesktopIdentity
}

const writeAtomic = (file: string, value: object): void => {
  const part = `${file}.${process.pid}.part`
  writeFileSync(part, `${JSON.stringify(value, undefined, 2)}\n`, { mode: 0o600 })
  renameSync(part, file)
}

/** This server's desktop identity, made at the first start and never replaced: a new one is a new device for every signed-in site. */
export function serverIdentity(folder: string, env: NodeJS.ProcessEnv = process.env): DesktopIdentity {
  const file = identityFile(folder)
  if (!existsSync(file)) {
    const made = makeIdentity(env, Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
    writeAtomic(file, made)
    return made
  }
  try { return parseIdentity(readFileSync(file, 'utf8')) } catch (error) {
    throw new Error(`This server's desktop identity in ${file} cannot be read: ${error instanceof Error ? error.message : String(error)}. Fix or restore it; GeckIt does not make a new one, since every signed-in site would see a new device.`, { cause: error })
  }
}

const readPresentation = (folder: string): PresentationFile | undefined => {
  try { const value = JSON.parse(readFileSync(presentationFile(folder), 'utf8')) as PresentationFile; return value.version === 1 && typeof value.profiles === 'object' ? value : undefined } catch { return undefined }
}

/** Profiles that were on this server before the desktop identity keep what they showed; every other profile shows the desktop. */
export function presentationOf(folder: string, profiles: string, name: string): Presentation {
  let known = readPresentation(folder)
  if (known === undefined) {
    const before = existsSync(profiles) ? readdirSync(profiles, { withFileTypes: true }).filter((one) => one.isDirectory() && existsSync(join(profiles, one.name, 'prefs.js'))).map((one) => one.name) : []
    known = { version: 1, profiles: Object.fromEntries(before.map((one) => [one, 'previous' as const])) }
    writeAtomic(presentationFile(folder), known)
  }
  return known.profiles[name] ?? 'desktop'
}

/** What a profile shows, read without recording anything, for listing. */
export function presentationNow(folder: string, profiles: string, name: string): Presentation {
  const known = readPresentation(folder)
  if (known !== undefined) return known.profiles[name] ?? 'desktop'
  return existsSync(join(profiles, name, 'prefs.js')) ? 'previous' : 'desktop'
}

export function setPresentation(folder: string, name: string, presentation: Presentation): void {
  const known = readPresentation(folder) ?? { version: 1, profiles: {} }
  writeAtomic(presentationFile(folder), { version: 1, profiles: { ...known.profiles, [name]: presentation } })
}
