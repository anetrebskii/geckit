import { DESKTOP_BASE, type DesktopIdentity, type Presentation } from './desktop-identity'
import type { BrowserLocationOverrides } from '../shared/api'

type ConfigValue = string | number | boolean | readonly string[] | readonly object[]
export interface ServerLaunch { readonly identity: DesktopIdentity; readonly presentation: Presentation; readonly display: string; readonly fonts: readonly string[] }
export interface LaunchInput { readonly addon: string | undefined; readonly server: ServerLaunch | undefined; readonly known: ReadonlySet<string> | undefined; readonly location?: BrowserLocationOverrides }
export interface LaunchSettings { readonly config: Readonly<Record<string, ConfigValue>>; readonly headless: boolean; readonly display: string | undefined; readonly dropped: readonly string[] }

/** Firefox's own Accept-Language for one language: en-GB,en;q=0.5, and en-US,en;q=0.5 for American English. */
export const acceptLanguage = (language: string): string => {
  const primary = language.split('-')[0] ?? language
  return primary === language ? language : `${language},${primary};q=0.5`
}

const localeSettings = (tag: string): Record<string, ConfigValue> => {
  const { baseName, language, region, script } = new Intl.Locale(tag)
  return {
    'navigator.language': baseName,
    'headers.Accept-Language': acceptLanguage(baseName),
    'locale:language': language,
    ...(region === undefined ? {} : { 'locale:region': region }),
    ...(script === undefined ? {} : { 'locale:script': script }),
  }
}

const desktop = (server: ServerLaunch): Record<string, ConfigValue> => {
  const { identity, fonts } = server
  const { media } = DESKTOP_BASE
  return {
    'navigator.hardwareConcurrency': identity.cores,
    'webGl:vendor': DESKTOP_BASE.webGl.vendor,
    'webGl:renderer': DESKTOP_BASE.webGl.renderer,
    'mediaDevices:enabled': true,
    'mediaDevices:micros': media.microphones.length,
    'mediaDevices:webcams': media.webcams.length,
    'mediaDevices:speakers': media.speakers.length,
    'mediaDevices:microphoneLabels': media.microphones.map((one) => one[0] ?? ''),
    'mediaDevices:microphoneGroups': media.microphones.map((one) => one[1] ?? ''),
    'mediaDevices:webcamLabels': media.webcams.map((one) => one[0] ?? ''),
    'mediaDevices:webcamGroups': media.webcams.map((one) => one[1] ?? ''),
    'mediaDevices:speakerLabels': media.speakers.map((one) => one[0] ?? ''),
    'mediaDevices:speakerGroups': media.speakers.map((one) => one[1] ?? ''),
    voices: DESKTOP_BASE.voices,
    ...(fonts.length === 0 ? {} : { fonts }),
  }
}

/** What the driver hands Camoufox: the same everywhere, plus a virtual display and, for a desktop profile, this server's desktop. */
export function launchSettings(input: LaunchInput): LaunchSettings {
  const { server, location } = input
  const identity = server?.presentation === 'desktop' ? server.identity : undefined
  const timezone = location?.timezone ?? identity?.timezone
  const overridesLocale = location?.language !== undefined || location?.region !== undefined
  let locale = identity?.language
  if (overridesLocale) {
    const fallback = new Intl.Locale(identity?.language ?? 'en-US')
    const language = location.language ?? [fallback.language, fallback.script].filter(Boolean).join('-')
    const region = location.region ?? (location.language === undefined ? fallback.region : undefined)
    locale = region === undefined ? language : `${language}-${region}`
  }
  const wanted: Record<string, ConfigValue> = {
    humanize: true,
    'humanize:maxTime': 1.5,
    allowMainWorld: true,
    ...(input.addon === undefined ? {} : { addons: [input.addon] }),
    ...(server?.presentation === 'desktop' ? desktop(server) : {}),
    ...(locale === undefined ? {} : localeSettings(locale)),
    ...(overridesLocale && locale !== undefined ? { 'locale:all': locale } : {}),
    ...(timezone === undefined ? {} : { timezone }),
  }
  const config: Record<string, ConfigValue> = {}
  const dropped: string[] = []
  for (const [key, value] of Object.entries(wanted)) {
    if (input.known === undefined || input.known.has(key)) config[key] = value
    else dropped.push(key)
  }
  return { config, headless: false, display: server?.display, dropped }
}

/** The settings this Camoufox still has, from its own properties.json; a removed one is left out. */
export function knownSettings(properties: string): ReadonlySet<string> | undefined {
  try {
    const list = JSON.parse(properties) as { property?: unknown; removed?: unknown }[]
    return new Set(list.filter((one) => typeof one.property === 'string' && one.removed === undefined).map((one) => one.property as string))
  } catch { return undefined }
}

/** Of the font families on this server, those a Linux desktop's Firefox shows, so server-only fonts stay out of sight. */
export const desktopFonts = (installed: readonly string[]): string[] => {
  const desktopOnes = new Set(DESKTOP_BASE.fonts)
  return [...new Set(installed.map((one) => one.trim()).filter((one) => desktopOnes.has(one)))].sort()
}

export type MediaSetting = 'ask' | 'allow' | 'block'
export const MEDIA_FILE = 'geckit-media.json'

/** Firefox asks for the camera and microphone in its own panel, out of a page's reach, so a profile allows or blocks them for every site from its start. */
export function mediaPrefs(saved: string | undefined): Record<string, number> {
  let media: Partial<Record<'camera' | 'microphone', MediaSetting>> = {}
  try { media = JSON.parse(saved ?? '{}') as typeof media } catch { media = {} }
  const value = { ask: 0, allow: 1, block: 2 } as const
  return Object.fromEntries((['camera', 'microphone'] as const).filter((kind) => media[kind] !== undefined && media[kind] !== 'ask').map((kind) => [`permissions.default.${kind}`, value[media[kind] as MediaSetting]]))
}
