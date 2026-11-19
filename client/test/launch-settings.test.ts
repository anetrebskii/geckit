import { describe, expect, it } from 'vitest'
import { DESKTOP_BASE, type DesktopIdentity } from '../src/cli/desktop-identity'
import { acceptLanguage, desktopFonts, knownSettings, launchSettings, mediaPrefs } from '../src/cli/launch-settings'

const identity: DesktopIdentity = { version: 1, base: 'ubuntu-intel', made: '2026-11-19T00:00:00.000Z', screen: { width: 1366, height: 768 }, cores: 4, language: 'en-GB', timezone: 'Europe/London' }

describe('what a test browser starts with', () => {
  it('adds only uBlock Origin on a computer with a screen, and shows that computer as it is', () => {
    const settings = launchSettings({ addon: '/c/addons/UBO', server: undefined, known: undefined })
    expect(settings.config).toEqual({ humanize: true, 'humanize:maxTime': 1.5, allowMainWorld: true, addons: ['/c/addons/UBO'] })
    expect(settings).toMatchObject({ headless: false, display: undefined, dropped: [] })
    expect(launchSettings({ addon: undefined, server: undefined, known: undefined }).config).not.toHaveProperty('addons')
  })

  it('presents the server desktop to a desktop profile', () => {
    const settings = launchSettings({ addon: undefined, server: { identity, presentation: 'desktop', display: ':99', fonts: ['DejaVu Sans'] }, known: undefined })
    expect(settings).toMatchObject({ headless: false, display: ':99' })
    expect(settings).not.toHaveProperty('args')
    expect(settings.config).toMatchObject({
      'navigator.hardwareConcurrency': 4, 'navigator.language': 'en-GB', 'headers.Accept-Language': 'en-GB,en;q=0.5', 'locale:language': 'en', 'locale:region': 'GB', timezone: 'Europe/London',
      'webGl:vendor': 'Intel', 'webGl:renderer': 'Intel(R) HD Graphics, or similar',
      'mediaDevices:enabled': true, 'mediaDevices:micros': 2, 'mediaDevices:webcams': 1, 'mediaDevices:speakers': 1, fonts: ['DejaVu Sans'],
    })
    const voices = settings.config['voices'] as { voiceUri: string; isDefault: boolean }[]
    expect(voices).toHaveLength(DESKTOP_BASE.voices.length)
    expect(voices.every((one) => one.voiceUri.startsWith('urn:moz-tts:speechd:') && !one.isDefault)).toBe(true)
  })

  it('keeps a profile from before as it was, still in the virtual display', () => {
    const settings = launchSettings({ addon: '/u', server: { identity, presentation: 'previous', display: ':7', fonts: [] }, known: undefined })
    expect(settings.config).toEqual({ humanize: true, 'humanize:maxTime': 1.5, allowMainWorld: true, addons: ['/u'] })
    expect(settings.display).toBe(':7')
  })

  it('leaves out settings the installed Camoufox no longer has', () => {
    const known = knownSettings(JSON.stringify([{ property: 'humanize', type: 'bool' }, { property: 'allowMainWorld', type: 'bool' }, { property: 'humanize:maxTime', type: 'double' }, { property: 'canvas:seed', type: 'uint', removed: '156.0.1-beta.32' }]))
    expect(known?.has('canvas:seed')).toBe(false)
    const settings = launchSettings({ addon: '/u', server: undefined, known })
    expect(settings.dropped).toEqual(['addons'])
    expect(knownSettings('not json')).toBeUndefined()
  })

  it('says languages and fonts the way a Linux desktop Firefox does', () => {
    expect(acceptLanguage('en-US')).toBe('en-US,en;q=0.5')
    expect(acceptLanguage('fr')).toBe('fr')
    expect(desktopFonts([' DejaVu Sans', 'DejaVu Sans', 'Some Server Font', 'Liberation Mono'])).toEqual(['DejaVu Sans', 'Liberation Mono'])
  })
})

describe('camera and microphone for a profile', () => {
  it('turns the saved choice into Firefox defaults, leaving ask to Firefox', () => {
    expect(mediaPrefs(JSON.stringify({ camera: 'allow', microphone: 'block' }))).toEqual({ 'permissions.default.camera': 1, 'permissions.default.microphone': 2 })
    expect(mediaPrefs(JSON.stringify({ camera: 'ask' }))).toEqual({})
    expect(mediaPrefs(undefined)).toEqual({})
    expect(mediaPrefs('broken')).toEqual({})
  })
})
