import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
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

const librariesFolder = (root?: string): string => join(testingFolder(root), 'libraries')
const LINUX_PACKAGES: readonly (readonly string[])[] = [['libgtk-3-0t64', 'libgtk-3-0'], ['libdbus-glib-1-2'], ['libxtst6'], ['libxcursor1'], ['libasound2t64', 'libasound2']]

/** Folders holding shared libraries in a tree unpacked from packages. */
export function libraryFolders(folder: string): string[] {
  if (!existsSync(folder)) return []
  const found = new Set<string>()
  const walk = (at: string): void => {
    for (const one of readdirSync(at, { withFileTypes: true })) {
      if (one.isDirectory()) walk(join(at, one.name))
      else if (/^lib.*\.so(\.\d+)*$/.test(one.name) && /^(lib|lib64|[\w]+-linux-gnu\w*)$/.test(basename(at))) found.add(at)
    }
  }
  walk(folder)
  return [...found]
}

/** Libraries the dynamic linker cannot find, read from ldd's "not found" lines. */
export function missingLibraries(said: string): string[] {
  return [...new Set(said.split('\n').map((line) => /^\s*(\S+)\s+=>\s+not found/.exec(line)?.[1]).filter((one): one is string => one !== undefined))].sort()
}

const run = (program: string, args: readonly string[], options: { readonly cwd?: string; readonly env?: NodeJS.ProcessEnv } = {}): string => execFileSync(program, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10 * 60_000, ...options })
const has = (program: string): boolean => { try { run('sh', ['-c', `command -v ${program}`]); return true } catch { return false } }

function stillMissing(binary: string, extra: readonly string[]): string[] {
  const folder = dirname(binary)
  const env = { ...process.env, LD_LIBRARY_PATH: [folder, ...extra, process.env['LD_LIBRARY_PATH'] ?? ''].filter((one) => one !== '').join(':') }
  const files = ['libxul.so', 'libmozgtk.so'].map((one) => join(folder, one)).filter((one) => existsSync(one))
  if (files.length === 0) return []
  let said: string
  try { said = run('ldd', files, { env }) } catch (error) { said = error instanceof Error && 'stdout' in error ? String(error.stdout) : '' }
  return missingLibraries(said)
}

/** Debian package names differ between releases, such as libgtk-3-0t64 and libgtk-3-0; the first one apt knows is used. */
function packagesFor(): string[] {
  return LINUX_PACKAGES.map((names) => names.find((name) => { try { return run('apt-cache', ['show', '--no-all-versions', name]).includes('Package:') } catch { return false } })).filter((one): one is string => one !== undefined)
}

function unpackPackages(roots: readonly string[], into: string): void {
  const depends = run('apt-cache', ['depends', '--recurse', '--no-recommends', '--no-suggests', '--no-conflicts', '--no-breaks', '--no-replaces', '--no-enhances', ...roots])
  const wanted = [...new Set(depends.split('\n').filter((line) => /^lib[\w.+-]+$/.test(line)))].filter((name) => { try { return !run('dpkg-query', ['-W', '-f=${Status}', name]).includes('install ok installed') } catch { return true } })
  if (wanted.length === 0) return
  const scratch = mkdtempSync(join(testingFolder(), 'libraries-'))
  try {
    run('apt-get', ['download', ...wanted], { cwd: scratch })
    const unpacked = `${into}.part`
    rmSync(unpacked, { recursive: true, force: true })
    for (const deb of readdirSync(scratch).filter((one) => one.endsWith('.deb'))) run('dpkg-deb', ['-x', join(scratch, deb), unpacked])
    rmSync(into, { recursive: true, force: true })
    renameSync(unpacked, into)
  } finally { rmSync(scratch, { recursive: true, force: true }) }
}

/**
 * On Linux Camoufox needs GTK and a few X libraries a server often lacks. They are installed with apt when GeckIt may (root or
 * passwordless sudo); otherwise on Debian and Ubuntu they are downloaded and unpacked into GeckIt's own folder, without root.
 * Returns the folders to add to LD_LIBRARY_PATH.
 */
export function camoufoxLibraries(binary: string, root: string = homedir()): string[] {
  if (process.platform !== 'linux' || !has('ldd')) return []
  const folder = librariesFolder(root)
  let extra = libraryFolders(folder)
  let missing = stillMissing(binary, extra)
  if (missing.length === 0) return extra
  const apt = has('apt-get') && has('apt-cache') && has('dpkg-deb')
  if (!apt) throw new Error(`Camoufox needs libraries this computer does not have: ${missing.join(', ')}. Install the GTK 3 libraries with the system package manager (on Fedora: sudo dnf install gtk3 dbus-glib libXtst), then try again.`)
  const roots = packagesFor()
  const root0 = process.getuid?.() === 0
  const sudo = !root0 && (() => { try { run('sudo', ['-n', 'true']); return true } catch { return false } })()
  try {
    if (root0 || sudo) run(root0 ? 'apt-get' : 'sudo', [...(root0 ? [] : ['-n', 'apt-get']), 'install', '-y', '--no-install-recommends', ...roots], { env: { ...process.env, DEBIAN_FRONTEND: 'noninteractive' } })
    else unpackPackages(roots, folder)
  } catch (error) {
    const said = error instanceof Error && 'stderr' in error ? String(error.stderr).trim().split('\n').at(-1) ?? '' : error instanceof Error ? error.message : String(error)
    throw new Error(`Camoufox needs ${missing.join(', ')}, and GeckIt could not install them${said === '' ? '' : `: ${said}`}. Run: sudo apt-get install ${roots.join(' ')}`, { cause: error })
  }
  extra = libraryFolders(folder)
  missing = stillMissing(binary, extra)
  if (missing.length > 0) throw new Error(`Camoufox still lacks ${missing.join(', ')} after installing ${roots.join(', ')}. Run: sudo apt-get install ${roots.join(' ')}`)
  return extra
}
