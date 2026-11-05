import process from 'node:process'
import console from 'node:console'
import { build } from 'esbuild'
import { mkdtemp, mkdir, cp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'

if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('This recorded packaging probe targets darwin-arm64; validate the native package for the target platform separately.')
const target = await mkdtemp(join(tmpdir(), 'geckit-native-package-probe-'))
await build({ entryPoints: ['test/remote-transport-probe.mjs'], outfile: join(target, 'probe.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['node-datachannel'] })
for (const name of ['node-datachannel', 'detect-libc', '@node-datachannel/darwin-arm64']) {
  await mkdir(join(target, 'node_modules', name), { recursive: true })
  await cp(join('node_modules', name), join(target, 'node_modules', name), { recursive: true })
}
console.log(`Standalone copy: ${target}`)
const child = spawnSync(process.execPath, [join(target, 'probe.mjs')], { cwd: target, stdio: 'inherit', timeout: 15000 })
if (child.error) throw child.error
if (child.status !== 0) process.exitCode = child.status ?? 1
