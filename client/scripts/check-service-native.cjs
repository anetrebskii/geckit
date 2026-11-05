const { existsSync } = require('node:fs')
const { join } = require('node:path')
const { familySync } = require('detect-libc')

module.exports = async ({ arch, electronPlatformName, packager }) => {
  const architecture = ['ia32', 'x64', 'armv7l', 'arm64', 'universal'][arch]
  const target = electronPlatformName === 'darwin' ? `darwin-${architecture}` : electronPlatformName === 'win32' ? `win32-${architecture}-msvc` : `linux-${architecture}-${familySync() === 'musl' ? 'musl' : 'gnu'}`
  if (!existsSync(join(packager.projectDir, 'out/service/node_modules/@node-datachannel', target, 'package.json'))) throw new Error(`Headless WebRTC addon missing for ${target}. Install the matching @node-datachannel/${target}@0.33.6 package and rebuild service on the target platform before packaging. Cross-target packages must never contain the build host's addon alone.`)
}
