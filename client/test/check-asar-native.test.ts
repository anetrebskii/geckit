import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, it } from 'vitest'

type AsarEntry = { files?: Record<string, AsarEntry>; unpacked?: boolean; size?: number; offset?: string }
type AfterPack = ((context: object) => Promise<void>) & { packedNativeFiles: (header: AsarEntry) => string[]; readAsarHeader: (archive: string) => AsarEntry }

const check = createRequire(import.meta.url)('../scripts/check-asar-native.cjs') as AfterPack
const folders: string[] = []

afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })

function writeAsar(path: string, header: AsarEntry): void {
  const json = Buffer.from(JSON.stringify(header))
  const padded = Math.ceil(json.length / 4) * 4
  const pickle = Buffer.alloc(8 + padded)
  pickle.writeUInt32LE(4 + padded, 0)
  pickle.writeUInt32LE(json.length, 4)
  json.copy(pickle, 8)
  const size = Buffer.alloc(8)
  size.writeUInt32LE(4, 0)
  size.writeUInt32LE(pickle.length, 4)
  writeFileSync(path, Buffer.concat([size, pickle]))
}

function header(serviceAddonUnpacked: boolean): AsarEntry {
  const addon = (unpacked: boolean): AsarEntry => ({ files: { 'node_datachannel.node': unpacked ? { size: 1, unpacked: true } : { size: 1, offset: '0' } } })
  return {
    files: {
      node_modules: { files: { '@node-datachannel': { files: { 'darwin-arm64': addon(true) } } } },
      out: { files: { service: { files: { 'service.js': { size: 1, offset: '0' }, node_modules: { files: { '@node-datachannel': { files: { 'darwin-arm64': addon(serviceAddonUnpacked) } } } } } } } },
    },
  }
}

function packedApp(serviceAddonUnpacked: boolean): string {
  const appOutDir = mkdtempSync(join(tmpdir(), 'geckit-asar-'))
  folders.push(appOutDir)
  const resources = join(appOutDir, 'GeckIt.app', 'Contents', 'Resources')
  mkdirSync(resources, { recursive: true })
  writeAsar(join(resources, 'app.asar'), header(serviceAddonUnpacked))
  return appOutDir
}

const context = (appOutDir: string) => ({ appOutDir, electronPlatformName: 'darwin', packager: { appInfo: { productFilename: 'GeckIt' } } })

it('lists native addons left inside the archive', () => {
  expect(check.packedNativeFiles(header(false))).toEqual(['out/service/node_modules/@node-datachannel/darwin-arm64/node_datachannel.node'])
  expect(check.packedNativeFiles(header(true))).toEqual([])
})

it('reads the header electron-builder writes', () => {
  const appOutDir = packedApp(false)
  expect(check.readAsarHeader(join(appOutDir, 'GeckIt.app', 'Contents', 'Resources', 'app.asar'))).toEqual(header(false))
})

it('fails packaging when the service addon stays packed', async () => {
  await expect(check(context(packedApp(false)))).rejects.toThrow('out/service/node_modules/@node-datachannel/darwin-arm64/node_datachannel.node')
  await expect(check(context(packedApp(true)))).resolves.toBeUndefined()
})
