import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bundledFont, CAMOUFOX_VERSION, downloading, fetchCamoufox, installCamoufoxArchive, libraryFolders, migrateChromeProfiles, missingLibraries, profilesFolder, testingCamoufox, testingFolder } from '../src/cli/camoufox'
import { deleteTestProfile, launchFailure, testBrowsersState, updateTestProfile } from '../src/cli/testing'
import { saveTestAccount } from '../src/cli/browser-lifecycle'

const roots: string[] = []
const temporary = (): string => { const root = mkdtempSync(join(tmpdir(), 'geckit-camoufox-')); roots.push(root); return root }
afterEach(() => { vi.restoreAllMocks(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

describe('Camoufox installation', () => {
  it('extracts its executable but never extracts bundled fonts or fontconfig plugins', async () => {
    const root = temporary()
    const source = join(root, 'source')
    const executable = process.platform === 'darwin' ? 'Camoufox.app/Contents/MacOS/camoufox' : process.platform === 'win32' ? 'camoufox.exe' : 'camoufox'
    const parent = executable.split('/').slice(0, -1).join('/')
    mkdirSync(join(source, parent), { recursive: true })
    writeFileSync(join(source, executable), 'browser')
    chmodSync(join(source, executable), 0o755)
    for (const name of ['fonts/windows/private.ttf', 'fonts/macos/private.otf', 'fontconfig/linux/fonts.conf']) {
      mkdirSync(join(source, name.split('/').slice(0, -1).join('/')), { recursive: true })
      writeFileSync(join(source, name), 'excluded')
    }
    const zip = join(root, 'browser.zip')
    execFileSync('zip', ['-qr', zip, '.'], { cwd: source })
    const into = join(testingFolder(root), 'browser', CAMOUFOX_VERSION)
    await installCamoufoxArchive(zip, into)
    expect(testingCamoufox(root)?.path).toBe(join(into, executable))
    expect(existsSync(join(into, 'fonts'))).toBe(false)
    expect(existsSync(join(into, 'fontconfig'))).toBe(false)
    expect(bundledFont('Camoufox.app/Contents/Resources/fonts/windows/a.ttf')).toBe(true)
    expect(bundledFont('Camoufox.app/Contents/Resources/browser/features/x.xpi')).toBe(false)
  })

  it('publishes no installation when a download is corrupt, and retries after failure', async () => {
    const root = temporary()
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('not the expected browser'))
    await expect(fetchCamoufox(root)).rejects.toThrow('checksum')
    expect(request.mock.calls[0]?.[0]).toMatch(/^https:\/\/github.com\/anetrebskii\/geckit-browser-assets\/releases\/download\/camoufox-158\.0\.1-beta\.41-no-fonts\.1\/camoufox-158\.0\.1-beta\.41-.*-no-fonts\.zip$/)
    expect(testingCamoufox(root)).toBeUndefined()
    expect(downloading(root)?.error).toContain('checksum')
    expect(readdirSync(join(testingFolder(root), 'browser'))).toEqual([])
    request.mockResolvedValue(new Response('', { status: 503 }))
    await expect(fetchCamoufox(root)).rejects.toThrow('503')
    expect(downloading(root)?.error).toContain('503')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('reports interrupted installation instead of silently becoming absent', () => {
    const root = temporary()
    mkdirSync(testingFolder(root), { recursive: true })
    writeFileSync(join(testingFolder(root), 'download.json'), JSON.stringify({ pid: 2147483647, t: Date.now(), received: 40, total: 100, phase: 'installing' }))
    expect(downloading(root)?.error).toBe('The installation was interrupted.')
  })
})

describe('Chrome profile preservation', () => {
  it('keeps names and notes once, without copying Chrome data or reviving renamed/deleted profiles', () => {
    const root = temporary()
    const old = join(root, '.geckit', 'chrome-for-testing', 'profiles', 'work')
    mkdirSync(old, { recursive: true })
    writeFileSync(join(old, 'Cookies'), 'keep old encrypted Chrome data')
    saveTestAccount('work', 'GitHub as work', join(root, '.geckit', 'browser'))
    expect(migrateChromeProfiles(root)).toBe(true)
    expect(testBrowsersState(root).profiles).toEqual([{ name: 'work', note: 'GitHub as work', open: false }])
    expect(readdirSync(join(profilesFolder(root), 'work'))).toEqual([])
    updateTestProfile('work', 'renamed', 'GitHub as work', root)
    expect(testBrowsersState(root).profiles.map((one) => one.name)).toEqual(['renamed'])
    deleteTestProfile('renamed', root)
    expect(testBrowsersState(root).profiles).toEqual([])
    expect(readFileSync(join(old, 'Cookies'), 'utf8')).toBe('keep old encrypted Chrome data')
  })
})

describe('launchFailure', () => {
  it('names the browser error and exit, not the closing line', () => {
    const message = 'browserType.launchPersistentContext: Target page, context or browser has been closed\nBrowser logs:\n\n<launching> /x/camoufox -no-remote\n<launched> pid=71372\n[pid=71372][err] Error: no DISPLAY environment variable specified\n[pid=71372] <process did exit: exitCode=1, signal=null>\n[pid=71372] starting temporary directories cleanup\n- [pid=71372] <gracefully close end>'
    expect(launchFailure(message)).toBe('Target page, context or browser has been closed / Error: no DISPLAY environment variable specified / exited with exitCode=1, signal=null')
  })
})

describe('Linux libraries', () => {
  it('reads what ldd could not find', () => {
    const said = './libxul.so:\n\tlibgtk-3.so.0 => not found\n\tlibc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x7f)\n./libmozgtk.so:\n\tlibgtk-3.so.0 => not found\n\tlibXcursor.so.1 => not found\n'
    expect(missingLibraries(said)).toEqual(['libXcursor.so.1', 'libgtk-3.so.0'])
  })
  it('finds the folders of unpacked libraries', () => {
    const root = temporary()
    mkdirSync(join(root, 'usr', 'lib', 'x86_64-linux-gnu'), { recursive: true })
    mkdirSync(join(root, 'usr', 'share', 'doc'), { recursive: true })
    writeFileSync(join(root, 'usr', 'lib', 'x86_64-linux-gnu', 'libgtk-3.so.0.2409.32'), '')
    writeFileSync(join(root, 'usr', 'share', 'doc', 'copyright'), '')
    mkdirSync(join(root, 'usr', 'lib', 'x86_64-linux-gnu', 'gtk-3.0', 'immodules'), { recursive: true })
    writeFileSync(join(root, 'usr', 'lib', 'x86_64-linux-gnu', 'gtk-3.0', 'immodules', 'im-ipa.so'), '')
    expect(libraryFolders(root)).toEqual([join(root, 'usr', 'lib', 'x86_64-linux-gnu')])
    expect(libraryFolders(join(root, 'none'))).toEqual([])
  })
})
