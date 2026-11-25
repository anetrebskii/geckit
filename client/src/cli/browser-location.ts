import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserLocationOverrides } from '../shared/api'

export function normalizeBrowserLocation(input: BrowserLocationOverrides): BrowserLocationOverrides {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new Error('Enter valid browser settings.')
  const { geolocation, language, region, timezone } = input
  if (geolocation !== undefined && (geolocation === null || !Number.isFinite(geolocation.latitude) || Math.abs(geolocation.latitude) > 90 || !Number.isFinite(geolocation.longitude) || Math.abs(geolocation.longitude) > 180)) {
    throw new Error('Enter latitude from −90 to 90 and longitude from −180 to 180.')
  }
  if (language !== undefined && (typeof language !== 'string' || !/^[a-z]{2,3}(?:-[a-z]{4})?$/i.test(language))) throw new Error('Enter a language code such as en or zh-Hant.')
  if (region !== undefined && (typeof region !== 'string' || !/^(?:[a-z]{2}|\d{3})$/i.test(region))) throw new Error('Enter a region code such as US or GB.')
  if (timezone !== undefined) {
    if (typeof timezone !== 'string' || !/^[a-z][a-z0-9_+/-]*$/i.test(timezone)) throw new Error('Enter a time zone such as America/New_York.')
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }) } catch { throw new Error('Enter a time zone such as America/New_York.') }
  }
  const locale = language === undefined ? undefined : new Intl.Locale(language)
  return {
    ...(geolocation === undefined ? {} : { geolocation: { latitude: geolocation.latitude, longitude: geolocation.longitude } }),
    ...(locale === undefined ? {} : { language: [locale.language, locale.script].filter(Boolean).join('-') }),
    ...(region === undefined ? {} : { region: region.toUpperCase() }),
    ...(timezone === undefined ? {} : { timezone }),
  }
}

const fileIn = (directory: string): string => join(directory, 'geckit-location.json')

export function readBrowserLocation(directory: string): BrowserLocationOverrides {
  try { return normalizeBrowserLocation(JSON.parse(readFileSync(fileIn(directory), 'utf8'))) } catch { return {} }
}

export function writeBrowserLocation(directory: string, input: BrowserLocationOverrides): void {
  const settings = normalizeBrowserLocation(input)
  const file = fileIn(directory)
  const part = `${file}.${process.pid}.part`
  writeFileSync(part, JSON.stringify(settings), { mode: 0o600 })
  renameSync(part, file)
}

const acceptLanguagesPref = /^user_pref\("intl\.accept_languages", "(?:[^"\\\r\n]|\\.)*"\);\r?$/m

function optionalFile(file: string): string | undefined {
  try { return readFileSync(file, 'utf8') } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
    throw error
  }
}

export function preserveBrowserLanguage(directory: string, custom: boolean): void {
  const saved = join(directory, 'geckit-previous-language')
  const previous = optionalFile(saved)
  if (custom && previous !== undefined || !custom && previous === undefined) return
  const file = join(directory, 'prefs.js')
  const prefs = optionalFile(file) ?? ''
  const current = prefs.match(acceptLanguagesPref)?.[0]
  if (custom) {
    writeFileSync(saved, current ?? '', { mode: 0o600 })
    return
  }
  const restored = previous?.match(acceptLanguagesPref)?.[0]
  if (restored !== current) {
    const next = current === undefined ? `${prefs}\n${restored}\n` : prefs.replace(acceptLanguagesPref, () => restored ?? '')
    const part = `${file}.${process.pid}.part`
    writeFileSync(part, next, { mode: 0o600 })
    renameSync(part, file)
  }
  rmSync(saved, { force: true })
}
