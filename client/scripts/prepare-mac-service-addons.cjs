const { execFileSync } = require('node:child_process')
const { mkdirSync, mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { packages } = require('../package-lock.json')

if (process.platform !== 'darwin') return

const root = resolve(__dirname, '..')
const scratch = mkdtempSync(join(tmpdir(), 'geckit-mac-addons-'))
try {
  for (const architecture of ['arm64', 'x64']) {
    const name = `@node-datachannel/darwin-${architecture}`
    const locked = packages[`node_modules/${name}`]
    const [packed] = JSON.parse(execFileSync('npm', ['pack', `${name}@${locked.version}`, '--ignore-scripts', '--json', '--pack-destination', scratch], { cwd: root, encoding: 'utf8' }))
    if (packed.integrity !== locked.integrity) throw new Error(`Lockfile integrity mismatch for ${name}.`)
    const target = join(root, 'node_modules', name)
    mkdirSync(target, { recursive: true })
    execFileSync('tar', ['-xzf', join(scratch, packed.filename), '--strip-components=1', '-C', target])
    console.log(`Prepared ${name}@${locked.version}`)
  }
} finally {
  rmSync(scratch, { recursive: true })
}
