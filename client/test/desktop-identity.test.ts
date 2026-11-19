import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DESKTOP_BASE, identityFile, isServer, languageOf, makeIdentity, parseIdentity, presentationOf, serverIdentity, setPresentation } from '../src/cli/desktop-identity'

const scratch = (): string => mkdtempSync(join(tmpdir(), 'geckit-desktop-'))

describe('server desktop identity', () => {
  it('treats only a Linux computer without a display as a server', () => {
    expect(isServer('linux', {})).toBe(true)
    expect(isServer('linux', { DISPLAY: ':0' })).toBe(false)
    expect(isServer('linux', { WAYLAND_DISPLAY: 'wayland-0' })).toBe(false)
    expect(isServer('darwin', {})).toBe(false)
    expect(isServer('win32', {})).toBe(false)
  })

  it('reads the language from LANG the way a browser names it', () => {
    expect(languageOf('en_GB.UTF-8')).toBe('en-GB')
    expect(languageOf('de_DE@euro')).toBe('de-DE')
    expect(languageOf('C.UTF-8')).toBe('en-US')
    expect(languageOf('POSIX')).toBe('en-US')
    expect(languageOf(undefined)).toBe('en-US')
  })

  it('makes a desktop from the common screens and core counts', () => {
    const first = makeIdentity({ LANG: 'en_US.UTF-8' }, 'Europe/Berlin', () => 0, new Date('2026-11-19T00:00:00Z'))
    expect(first).toEqual({ version: 1, base: 'ubuntu-intel', made: '2026-11-19T00:00:00.000Z', screen: { width: 1920, height: 1080 }, cores: 8, language: 'en-US', timezone: 'Europe/Berlin' })
    const last = makeIdentity({}, 'UTC', () => 0.999999)
    expect(DESKTOP_BASE.screens.map((one) => one.width)).toContain(last.screen.width)
    expect(DESKTOP_BASE.cores.map((one) => one.value)).toContain(last.cores)
  })

  it('makes the identity once and then keeps it', () => {
    const folder = scratch()
    const made = serverIdentity(folder, { LANG: 'fr_FR.UTF-8' })
    expect(made.language).toBe('fr-FR')
    expect(serverIdentity(folder, { LANG: 'en_US.UTF-8' })).toEqual(made)
  })

  it('refuses a damaged identity instead of making a new device', () => {
    const folder = scratch()
    writeFileSync(identityFile(folder), '{"version":1}')
    expect(() => serverIdentity(folder)).toThrow(/cannot be read: its base is not ubuntu-intel\. Fix or restore it; GeckIt does not make a new one/)
    expect(readFileSync(identityFile(folder), 'utf8')).toBe('{"version":1}')
    expect(() => parseIdentity('nope')).toThrow('it is not valid JSON')
  })

  it('keeps profiles used before the update as they were, and shows the desktop in every other', () => {
    const folder = scratch()
    const profiles = join(folder, 'profiles')
    mkdirSync(join(profiles, 'zabookni'), { recursive: true })
    writeFileSync(join(profiles, 'zabookni', 'prefs.js'), '')
    mkdirSync(join(profiles, 'made-not-started'), { recursive: true })
    expect(presentationOf(folder, profiles, 'zabookni')).toBe('previous')
    expect(presentationOf(folder, profiles, 'made-not-started')).toBe('desktop')
    mkdirSync(join(profiles, 'later'), { recursive: true })
    writeFileSync(join(profiles, 'later', 'prefs.js'), '')
    expect(presentationOf(folder, profiles, 'later')).toBe('desktop')
    setPresentation(folder, 'zabookni', 'desktop')
    expect(presentationOf(folder, profiles, 'zabookni')).toBe('desktop')
  })
})
