import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { safeStorage } from 'electron'
import { afterEach, describe, expect, it } from 'vitest'
import { VpnStore } from '../src/main/vpn/store'
import type { VpnDisk } from '../src/main/vpn/store'
import { checkVpnConfig } from '../src/main/vpn/config'

const privateKey = Buffer.alloc(32, 13).toString('base64')
const config = `[Interface]\nPrivateKey=${privateKey}\nAddress=10.0.0.2/32\nJc=4\nJmin=20\nJmax=40\nS1=0\nS2=0\nH1=101\nH2=201\nH3=301\nH4=401\n[Peer]\nPublicKey=${Buffer.alloc(32, 18).toString('base64')}\nEndpoint=vpn.example.test:443\nAllowedIPs=0.0.0.0/0\n`
type Encryption = Pick<typeof safeStorage, 'isEncryptionAvailable' | 'encryptString' | 'decryptString' | 'getSelectedStorageBackend'>
const secret = randomBytes(32)
const encryption: Encryption = {
  isEncryptionAvailable: () => true,
  getSelectedStorageBackend: () => 'gnome_libsecret',
  encryptString: (text) => {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', secret, iv)
    const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
    return Buffer.concat([iv, cipher.getAuthTag(), data])
  },
  decryptString: (bytes) => {
    const decipher = createDecipheriv('aes-256-gcm', secret, bytes.subarray(0, 12))
    decipher.setAuthTag(bytes.subarray(12, 28))
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8')
  },
}
const folders: string[] = []
const path = (): string => { const folder = mkdtempSync(join(tmpdir(), 'geckit-vpn-test-')); folders.push(folder); return join(folder, 'servers.encrypted') }
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })

describe('encrypted VPN profiles', () => {
  it('requires VPN for every saved server, even without selection, and releases only after the final removal', () => {
    const store = new VpnStore(path(), encryption)
    expect(store.view()).toMatchObject({ required: false, blocked: false })
    const first = store.add('First', checkVpnConfig(config)).view.servers[0]!
    const second = store.add('Second', checkVpnConfig(config)).view.servers[1]!
    expect(store.view()).toMatchObject({ required: true, blocked: true })
    store.remove(first.id)
    expect(store.view()).toMatchObject({ selected: null, required: true, blocked: true })
    store.remove(second.id)
    expect(store.view()).toMatchObject({ required: false, blocked: false })
  })

  it('fails admission closed for retained unreadable or encryption-locked files', () => {
    const file = path()
    writeFileSync(file, 'unreadable encrypted configuration')
    expect(new VpnStore(file, encryption).view()).toMatchObject({ required: true, blocked: true })
    expect(new VpnStore(file, { ...encryption, isEncryptionAvailable: () => false }).view()).toMatchObject({ required: true, blocked: true })
    expect(new VpnStore(path(), { ...encryption, isEncryptionAvailable: () => false }).view()).toMatchObject({ required: false, blocked: false })
  })
  it.each(['darwin', 'win32'] as const)('supports the %s safeStorage API without its Linux-only backend method', (platform) => {
    const { getSelectedStorageBackend: _backend, ...native } = encryption
    const file = path()
    const store = new VpnStore(file, native, undefined, platform)
    expect(store.view().secureStorage).toBe(true)
    expect(store.add('First', checkVpnConfig(config)).ok).toBe(true)
    expect(new VpnStore(file, native, undefined, platform).view()).toEqual(store.view())
  })
  it('refuses Linux secure storage if the backend method is missing', () => {
    const { getSelectedStorageBackend: _backend, ...native } = encryption
    const file = path()
    const store = new VpnStore(file, native, undefined, 'linux')
    expect(store.view().secureStorage).toBe(false)
    expect(store.add('First', checkVpnConfig(config)).ok).toBe(false)
    expect(() => readFileSync(file)).toThrow()
  })
  it('persists multiple profiles and selection without exposing keys in storage or view', () => {
    const file = path()
    const store = new VpnStore(file, encryption)
    expect(store.add('First', checkVpnConfig(config)).ok).toBe(true)
    expect(store.add('Second', checkVpnConfig(config)).ok).toBe(true)
    const second = store.view().servers[1]!
    expect(store.select(second.id).ok).toBe(true)
    expect(store.rename(second.id, 'Renamed').ok).toBe(true)
    const restarted = new VpnStore(file, encryption)
    expect(restarted.view()).toEqual(store.view())
    expect(JSON.stringify(store.view())).not.toContain(privateKey)
    expect(JSON.stringify(store.check(second.id))).not.toContain(privateKey)
    expect(readFileSync(file).toString()).not.toContain(privateKey)
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600)
    expect(restarted.remove(second.id).ok).toBe(true)
    expect(restarted.view().selected).toBeNull()
    expect(new VpnStore(file, encryption).view().selected).toBeNull()
  })
  it('refuses unavailable encryption and basic_text without creating plaintext files', () => {
    for (const incapable of [{ ...encryption, isEncryptionAvailable: () => false }, { ...encryption, getSelectedStorageBackend: () => 'basic_text' as const }]) {
      const file = path()
      const store = new VpnStore(file, incapable)
      expect(store.view().secureStorage).toBe(false)
      expect(store.add('Server', checkVpnConfig(config)).ok).toBe(false)
      expect(() => readFileSync(file)).toThrow()
    }
  })
  it('keeps existing file and memory selection after atomic replacement failure', () => {
    const file = path()
    const normal = new VpnStore(file, encryption)
    normal.add('First', checkVpnConfig(config))
    normal.add('Second', checkVpnConfig(config))
    const before = readFileSync(file)
    const failing: VpnDisk = { mkdirSync, writeFileSync, unlinkSync, renameSync: () => { throw new Error(privateKey) } }
    const store = new VpnStore(file, encryption, failing)
    const previous = store.view()
    const result = store.select(previous.servers[1]!.id)
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result)).not.toContain(privateKey)
    expect(store.view()).toEqual(previous)
    expect(readFileSync(file)).toEqual(before)
    expect(readdirSync(dirname(file))).toEqual(['servers.encrypted'])
  })
  it('never overwrites unreadable or malformed saved data', () => {
    const file = path()
    const before = Buffer.from('corrupt PRIVATE-SECRET')
    writeFileSync(file, before)
    const store = new VpnStore(file, encryption)
    expect(store.view().problem).toContain('existing file has been kept')
    expect(store.add('New', checkVpnConfig(config)).ok).toBe(false)
    expect(readFileSync(file)).toEqual(before)
    expect(JSON.stringify(store.view())).not.toContain('PRIVATE-SECRET')
  })
  it('rejects stale selections and names while keeping the selected server', () => {
    const store = new VpnStore(path(), encryption)
    store.add('First', checkVpnConfig(config))
    const selected = store.view().selected!
    expect(store.select('missing').ok).toBe(false)
    expect(store.rename(selected, ' ').ok).toBe(false)
    expect(store.rename(selected, 'secret\nvalue').ok).toBe(false)
    expect(store.remove('missing').ok).toBe(false)
    expect(store.view().selected).toBe(selected)
  })
  it('retains encrypted files when credential storage becomes unavailable', () => {
    const file = path()
    new VpnStore(file, encryption).add('First', checkVpnConfig(config))
    const before = readFileSync(file)
    const unavailable = new VpnStore(file, { ...encryption, isEncryptionAvailable: () => false })
    expect(unavailable.view().problem).toContain('Secure storage is unavailable')
    expect(unavailable.add('New', checkVpnConfig(config)).ok).toBe(false)
    expect(readFileSync(file)).toEqual(before)
  })
  it.each([
    '{"schema":2,"servers":[],"selected":null}',
    '{"schema":1,"servers":[],"selected":"missing"}',
    '{"schema":1,"servers":[{"config":"PRIVATE-SECRET"}],"selected":null}',
  ])('does not overwrite an invalid decrypted schema', (document) => {
    const file = path()
    const before = encryption.encryptString(document)
    writeFileSync(file, before)
    const store = new VpnStore(file, encryption)
    expect(store.view().problem).toContain('existing file has been kept')
    expect(store.add('New', checkVpnConfig(config)).ok).toBe(false)
    expect(JSON.stringify(store.view())).not.toContain('PRIVATE-SECRET')
    expect(readFileSync(file)).toEqual(before)
  })
})
