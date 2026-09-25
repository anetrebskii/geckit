// macOS draws a notification's icon from the sending bundle, so the Electron.app a local run starts from is renamed, given the Local icon and its own id.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

if (process.platform !== 'darwin') process.exit(0)

const root = resolve(import.meta.dirname, '..')
const bundle = join(root, 'node_modules/electron/dist/Electron.app')
const source = join(root, 'assets/icon-dev.png')
const set = join(tmpdir(), 'geckit-local.iconset')
const run = (command, ...args) => execFileSync(command, args, { stdio: 'ignore' })

rmSync(set, { recursive: true, force: true })
mkdirSync(set)
for (const size of [16, 32, 128, 256, 512]) {
  run('sips', '-z', `${size}`, `${size}`, source, '--out', join(set, `icon_${size}x${size}.png`))
  run('sips', '-z', `${size * 2}`, `${size * 2}`, source, '--out', join(set, `icon_${size}x${size}@2x.png`))
}
run('iconutil', '-c', 'icns', set, '-o', join(bundle, 'Contents/Resources/electron.icns'))
rmSync(set, { recursive: true, force: true })

const plist = join(bundle, 'Contents/Info.plist')
run('plutil', '-replace', 'CFBundleIdentifier', '-string', 'com.geckit.local', plist)
run('plutil', '-replace', 'CFBundleName', '-string', 'GeckIt Local', plist)
run('plutil', '-replace', 'CFBundleDisplayName', '-string', 'GeckIt Local', plist)
run('codesign', '--force', '--deep', '--sign', '-', bundle)
run('touch', bundle)
run('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', '-f', bundle)
