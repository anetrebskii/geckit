const { existsSync, openSync, readSync, closeSync } = require('node:fs')
const { join } = require('node:path')

// A native addon left inside app.asar is copied to a temporary file before it is loaded. That copy is unsigned,
// so on macOS the hardened runtime refuses it and the headless service exits at start.
function packedNativeFiles(header, prefix = '') {
  const found = []
  for (const [name, entry] of Object.entries(header.files ?? {})) {
    const path = prefix ? `${prefix}/${name}` : name
    if (entry.files) found.push(...packedNativeFiles(entry, path))
    else if (name.endsWith('.node') && !entry.unpacked) found.push(path)
  }
  return found
}

function readAsarHeader(archive) {
  const descriptor = openSync(archive, 'r')
  try {
    const size = Buffer.alloc(8)
    readSync(descriptor, size, 0, 8, 0)
    const pickle = Buffer.alloc(size.readUInt32LE(4))
    readSync(descriptor, pickle, 0, pickle.length, 8)
    return JSON.parse(pickle.toString('utf8', 8, 8 + pickle.readUInt32LE(4)))
  } finally {
    closeSync(descriptor)
  }
}

function asarPath({ appOutDir, electronPlatformName, packager }) {
  const resources = electronPlatformName === 'darwin' ? join(appOutDir, `${packager.appInfo.productFilename}.app`, 'Contents', 'Resources') : join(appOutDir, 'resources')
  return join(resources, 'app.asar')
}

module.exports = async (context) => {
  const archive = asarPath(context)
  if (!existsSync(archive)) return
  const packed = packedNativeFiles(readAsarHeader(archive))
  if (packed.length > 0) throw new Error(`Native addons packed inside app.asar cannot be loaded by a signed app: ${packed.join(', ')}. Add them to build.asarUnpack.`)
}
module.exports.packedNativeFiles = packedNativeFiles
module.exports.readAsarHeader = readAsarHeader
