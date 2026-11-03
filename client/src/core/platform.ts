import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export function defaultDataDirectory(): string {
  const configured = process.env['GECKIT_DATA']
  if (configured) return resolve(configured)
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'geckit')
  if (process.platform === 'win32') return join(process.env['APPDATA'] ?? homedir(), 'geckit')
  return join(process.env['XDG_CONFIG_HOME'] ?? join(homedir(), '.config'), 'geckit')
}

export interface CorePlatform {
  readonly directory: () => string
  readonly source: () => boolean
  readonly headless?: boolean
  readonly command?: () => string
  readonly launcher?: () => { readonly executable: string; readonly script: string }
  readonly whisper?: () => string
  readonly trash?: (path: string) => Promise<void>
}

let platform: CorePlatform = { directory: defaultDataDirectory, source: () => false }
export const corePlatform = (): CorePlatform => platform
export const dataDirectory = (): string => platform.directory()
export function configureCorePlatform(next: CorePlatform): void { platform = next }
