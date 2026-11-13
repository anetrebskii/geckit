const { execFileSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const { join } = require('node:path')
const checkAsarNative = require('./check-asar-native.cjs')

// The broker is signed here with its own empty entitlements, and build.mac.signIgnore keeps electron-builder from signing it again with the app's inherited ones.
function signBroker({ appOutDir, electronPlatformName, packager }) {
  if (electronPlatformName !== 'darwin') return
  const broker = join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources', 'broker', 'geckit-broker')
  if (!existsSync(broker)) throw new Error(`The secrets broker is missing at ${broker}. Run scripts/broker.sh before packaging.`)
  const identity = packager.platformSpecificBuildOptions.identity ?? process.env['CSC_NAME'] ?? 'Developer ID Application'
  const entitlements = join(__dirname, '..', 'assets', 'entitlements.broker.plist')
  const adHoc = identity === '-' || process.env['CSC_IDENTITY_AUTO_DISCOVERY'] === 'false'
  const args = ['--force', '--sign', adHoc ? '-' : identity, '--identifier', 'org.anetrebskii.geckit.broker', '--entitlements', entitlements]
  if (!adHoc) args.push('--options', 'runtime', '--timestamp')
  execFileSync('codesign', [...args, broker], { stdio: 'inherit' })
}

module.exports = async (context) => {
  await checkAsarNative(context)
  signBroker(context)
}
