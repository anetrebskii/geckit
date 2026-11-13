import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import { unzip } from './unzip'
import { acquireTestLock } from './browser-lifecycle'

export const CAMOUFOX_VERSION = '158.0.1-beta.41'
const CAMOUFOX_RELEASE = `camoufox-${CAMOUFOX_VERSION}-no-fonts.1`
export const testingFolder = (root: string = homedir()): string => join(root, '.geckit', 'camoufox')
export const profilesFolder = (root?: string): string => join(testingFolder(root), 'profiles')
const programFolder = (root?: string): string => join(testingFolder(root), 'browser')
const downloadFile = (root?: string): string => join(testingFolder(root), 'download.json')
const assets = [
  { platform: 'darwin', arch: 'arm64', name: 'mac.arm64', sha256: '3d166323d4a469b8dad84a169fd4f80616b1243e69ab08cc8822dc0e31893cb4' },
  { platform: 'darwin', arch: 'x64', name: 'mac.x86_64', sha256: '65b204a40f8f11625cbb514488b365e063e2f516089cd3ee5a353f40855a8f32' },
  { platform: 'linux', arch: 'arm64', name: 'lin.arm64', sha256: '01793f11bd88503a287b0bfdf18d5242ac8140cefc21c84541b1c89572360e0b' },
  { platform: 'linux', arch: 'x64', name: 'lin.x86_64', sha256: 'edf7120f63916c6e83b0a666a8032dca2cf22baa9c505982be48377bbd0ede47' },
  { platform: 'win32', arch: 'x64', name: 'win.x86_64', sha256: 'b7620426d9175114b099d4060ba8612f410b39b71df2d1c2c54f29e2079eafba' },
] as const

export const camoufoxSupported = (): boolean => assets.some((one) => one.platform === process.platform && one.arch === process.arch)
export const alive = (pid: number): boolean => { try { process.kill(pid, 0); return true } catch { return false } }
export const camoufoxHeadless = (platform: NodeJS.Platform = process.platform, env: NodeJS.ProcessEnv = process.env): boolean => platform === 'linux' && !env['DISPLAY'] && !env['WAYLAND_DISPLAY']
export const bundledFont = (path: string): boolean => path.replaceAll('\\', '/').split('/').some((part) => ['fonts', 'fontconfig', 'fontconfigs'].includes(part.toLowerCase()))

function binaryIn(folder: string): string {
  return process.platform === 'darwin' ? join(folder, 'Camoufox.app', 'Contents', 'MacOS', 'camoufox') : join(folder, process.platform === 'win32' ? 'camoufox.exe' : 'camoufox')
}

export function testingCamoufox(root: string = homedir()): { readonly path: string; readonly version: string } | undefined {
  const named = process.env['GECKIT_CAMOUFOX']
  if (named !== undefined && existsSync(named)) return { path: named, version: 'custom' }
  const folder = join(programFolder(root), CAMOUFOX_VERSION)
  const path = binaryIn(folder)
  return existsSync(join(folder, 'installed.json')) && existsSync(path) ? { path, version: CAMOUFOX_VERSION } : undefined
}

export interface CamoufoxDownload { readonly pid: number; readonly t: number; readonly received: number; readonly total: number; readonly phase: 'downloading' | 'installing'; readonly error?: string }
export function downloading(root?: string): CamoufoxDownload | undefined {
  try {
    const state = JSON.parse(readFileSync(downloadFile(root), 'utf8')) as CamoufoxDownload
    if (state.error !== undefined) return state
    if (alive(state.pid) && Date.now() - state.t < 30_000) return state
    return { ...state, error: 'The installation was interrupted.' }
  } catch { return undefined }
}

function noteDownload(root: string, state: CamoufoxDownload): void {
  const file = downloadFile(root)
  writeFileSync(`${file}.part`, JSON.stringify(state))
  renameSync(`${file}.part`, file)
}

export async function installCamoufoxArchive(zip: string, into: string): Promise<void> {
  await unzip(zip, into, (name) => !bundledFont(name))
  if (!existsSync(binaryIn(into))) throw new Error('The Camoufox archive does not contain its browser program.')
  writeFileSync(join(into, 'installed.json'), JSON.stringify({ version: CAMOUFOX_VERSION, fonts: false }))
}

export async function fetchCamoufox(root: string = homedir()): Promise<{ readonly path: string; readonly version: string }> {
  const asset = assets.find((one) => one.platform === process.platform && one.arch === process.arch)
  if (asset === undefined) throw new Error('Camoufox is not available for this operating system and architecture.')
  mkdirSync(programFolder(root), { recursive: true })
  let unlock: (() => void) | undefined
  for (;;) {
    const ready = testingCamoufox(root)
    if (ready !== undefined) return ready
    unlock = acquireTestLock('installation', testingFolder(root))
    if (unlock !== undefined) break
    await new Promise((done) => setTimeout(done, 1_000))
  }
  let state: CamoufoxDownload = { pid: process.pid, t: Date.now(), received: 0, total: 0, phase: 'downloading' }
  const zip = join(programFolder(root), 'download.zip.part')
  const unpacked = join(programFolder(root), `${CAMOUFOX_VERSION}.part`)
  const timer = setInterval(() => noteDownload(root, { ...state, t: Date.now() }), 1_000)
  try {
    noteDownload(root, state)
    const url = `https://github.com/anetrebskii/geckit-browser-assets/releases/download/${CAMOUFOX_RELEASE}/camoufox-${CAMOUFOX_VERSION}-${asset.name}-no-fonts.zip`
    const response = await fetch(url, { signal: AbortSignal.timeout(15 * 60_000) })
    if (!response.ok || response.body === null) throw new Error(`The Camoufox download answered ${response.status}.`)
    state = { ...state, total: Number(response.headers.get('content-length') ?? 0) }
    const hash = createHash('sha256')
    const count = new Transform({ transform(chunk: Buffer, _encoding, done) { hash.update(chunk); state = { ...state, received: state.received + chunk.length }; done(null, chunk) } })
    await pipeline(response.body, count, createWriteStream(zip))
    if (hash.digest('hex') !== asset.sha256) throw new Error('The Camoufox download checksum did not match. Retry the installation.')
    state = { ...state, phase: 'installing' }
    noteDownload(root, { ...state, t: Date.now() })
    rmSync(unpacked, { recursive: true, force: true })
    await installCamoufoxArchive(zip, unpacked)
    const installed = join(programFolder(root), CAMOUFOX_VERSION)
    rmSync(installed, { recursive: true, force: true })
    renameSync(unpacked, installed)
    rmSync(downloadFile(root), { force: true })
    return { path: binaryIn(installed), version: CAMOUFOX_VERSION }
  } catch (error) {
    noteDownload(root, { ...state, t: Date.now(), error: error instanceof Error ? error.message : String(error) })
    throw error
  } finally {
    clearInterval(timer)
    rmSync(zip, { force: true })
    rmSync(unpacked, { recursive: true, force: true })
    unlock()
  }
}

export function migrateChromeProfiles(root: string = homedir()): boolean {
  const migrated = join(testingFolder(root), 'chrome-profiles.json')
  if (existsSync(migrated)) return (JSON.parse(readFileSync(migrated, 'utf8')) as string[]).length > 0
  const old = join(root, '.geckit', 'chrome-for-testing', 'profiles')
  if (!existsSync(old)) return false
  const names = readdirSync(old, { withFileTypes: true }).filter((one) => one.isDirectory() && /^[a-z0-9][a-z0-9-]{0,39}$/.test(one.name)).map((one) => one.name)
  for (const name of names) mkdirSync(join(profilesFolder(root), name), { recursive: true, mode: 0o700 })
  mkdirSync(testingFolder(root), { recursive: true })
  writeFileSync(`${migrated}.${process.pid}.part`, JSON.stringify(names))
  renameSync(`${migrated}.${process.pid}.part`, migrated)
  return names.length > 0
}
