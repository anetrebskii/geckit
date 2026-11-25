import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isServer, presentationOf, serverIdentity } from './desktop-identity'
import { desktopFonts, knownSettings, launchSettings, type LaunchSettings } from './launch-settings'
import { startVirtualDisplay, type VirtualDisplay } from './virtual-display'
import type { BrowserLocationOverrides } from '../shared/api'

/** A file Camoufox keeps beside its program, or in Resources inside Camoufox.app on macOS. */
const besideBinary = (binary: string, ...parts: string[]): string | undefined =>
  [join(dirname(binary), ...parts), join(dirname(binary), '..', 'Resources', ...parts)].find((one) => existsSync(one))

const installedFamilies = (): string[] => {
  try { return execFileSync('fc-list', [':', 'family'], { encoding: 'utf8', timeout: 10_000 }).split('\n').flatMap((line) => line.split(',')) } catch { return [] }
}

export interface Launch extends LaunchSettings { readonly virtual: VirtualDisplay | undefined }

/** Everything a test browser starts with: uBlock Origin from Camoufox's own folder, and on a Linux server a virtual display and the server's desktop. */
export async function prepareLaunch(binary: string, folder: string, profiles: string, name: string, say: (line: string) => void, location: BrowserLocationOverrides = {}): Promise<Launch> {
  const addonFolder = besideBinary(binary, 'addons', 'UBO')
  const addon = addonFolder !== undefined && existsSync(join(addonFolder, 'manifest.json')) ? addonFolder : undefined
  if (addon === undefined) say(`uBlock Origin is not in this Camoufox (${join(dirname(binary), 'addons', 'UBO')}). The browser started without it.`)
  const properties = besideBinary(binary, 'properties.json')
  const known = properties === undefined ? undefined : knownSettings(readFileSync(properties, 'utf8'))
  if (!isServer()) {
    const settings = launchSettings({ addon, server: undefined, known, location })
    if (settings.dropped.length > 0) say(`Dropped settings this Camoufox does not know: ${settings.dropped.join(', ')}.`)
    return { ...settings, virtual: undefined }
  }
  const identity = serverIdentity(folder)
  const presentation = presentationOf(folder, profiles, name)
  const virtual = await startVirtualDisplay(identity.screen, join(folder, 'test-locks', `${name}.xvfb`))
  const settings = launchSettings({ addon, server: { identity, presentation, display: virtual.display, fonts: desktopFonts(installedFamilies()) }, known, location })
  if (settings.dropped.length > 0) say(`Dropped desktop identity settings this Camoufox does not know: ${settings.dropped.join(', ')}.`)
  return { ...settings, virtual }
}
