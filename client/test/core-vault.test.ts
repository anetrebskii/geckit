import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { initializeVault, isVaultEnvelope } from '../src/core/vault'
import type { VaultCommand, VaultOptions } from '../src/core/vault'
import { secretsAt } from '../src/main/hosts/secrets'

const directories: string[] = []
const key = Buffer.alloc(32, 123).toString('base64')
const directory = (): string => {
  const path = mkdtempSync(join(tmpdir(), 'geckit-vault-'))
  directories.push(path)
  return path
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true })
})

describe('service secure storage', () => {
  it('uses an injected key without a credential command and keeps only a key fingerprint on disk', () => {
    const path = directory()
    vi.stubEnv('GECKIT_VAULT_KEY', key)
    const run = vi.fn<NonNullable<VaultOptions['run']>>()
    const { vault, storage } = initializeVault(path, { run })
    expect(run).not.toHaveBeenCalled()
    expect(vault.available()).toBe(true)
    expect(storage.isEncryptionAvailable()).toBe(true)
    const first = vault.encrypt('a bot token and password')
    const second = storage.encryptString('a bot token and password')
    expect(isVaultEnvelope(first)).toBe(true)
    expect(first.equals(second)).toBe(false)
    expect(first.includes('a bot token and password')).toBe(false)
    expect(storage.decryptString(first)).toBe('a bot token and password')
    expect(initializeVault(path).vault.decrypt(second)).toBe('a bot token and password')
    expect(readdirSync(path)).toEqual(['vault-key-id'])
    expect(readFileSync(join(path, 'vault-key-id'), 'utf8')).not.toContain(key)
    if (process.platform !== 'win32') expect(statSync(join(path, 'vault-key-id')).mode & 0o777).toBe(0o600)
  })

  it('rejects changed keys, malformed keys, altered ciphertext, and legacy ciphertext', () => {
    const path = directory()
    const { vault } = initializeVault(path, { key })
    expect(() => initializeVault(path, { key: Buffer.alloc(32, 1).toString('base64') })).toThrow('does not match')
    expect(() => initializeVault(directory(), { key: 'a password' })).toThrow('32-byte')
    const encrypted = vault.encrypt('secret')
    const last = encrypted.length - 1
    encrypted[last] = (encrypted[last] ?? 0) ^ 1
    expect(() => vault.decrypt(encrypted)).toThrow()
    expect(() => vault.decrypt(Buffer.from('legacy safeStorage bytes'))).toThrow('migration')
    expect(() => vault.decrypt(encrypted.subarray(0, 20))).toThrow('migration')
  })

  it('does not fall back to a file key when the OS credential service is unavailable', () => {
    vi.stubEnv('GECKIT_VAULT_KEY', undefined)
    const path = directory()
    const run = vi.fn<NonNullable<VaultOptions['run']>>(() => ({ status: null, stdout: '' }))
    const { vault } = initializeVault(path, { platform: 'linux', run })
    expect(vault.available()).toBe(false)
    expect(() => vault.encrypt('secret')).toThrow('unavailable')
    expect(() => vault.decrypt(Buffer.from('secret'))).toThrow('unavailable')
    expect(readdirSync(path)).toEqual([])
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('creates and reuses a macOS Keychain key through stdin without putting it in process arguments', () => {
    vi.stubEnv('GECKIT_VAULT_KEY', undefined)
    const path = directory()
    const calls: VaultCommand[] = []
    let kept: string | undefined
    const run: NonNullable<VaultOptions['run']> = (command) => {
      calls.push(command)
      if (command.args[0] === '-i') { kept = /-w "([^"]+)"/.exec(command.input ?? '')?.[1]; return { status: 0, stdout: '' } }
      return kept === undefined ? { status: 44, stdout: '' } : { status: 0, stdout: `${kept}\n` }
    }
    const vault = initializeVault(path, { platform: 'darwin', run }).vault
    const encrypted = vault.encrypt('macOS secret')
    expect(initializeVault(path, { platform: 'darwin', run }).vault.decrypt(encrypted)).toBe('macOS secret')
    expect(calls.filter((command) => command.args[0] === '-i')).toHaveLength(1)
    expect(kept).toBeDefined()
    expect(calls.every((command) => !command.args.some((arg) => arg === kept))).toBe(true)
    expect(readFileSync(join(path, 'vault-key-id'), 'utf8')).not.toContain(kept)
  })

  it('uses libsecret on Linux and never replaces an established key after credential loss', () => {
    vi.stubEnv('GECKIT_VAULT_KEY', undefined)
    const path = directory()
    let kept: string | undefined
    const calls: VaultCommand[] = []
    const run: NonNullable<VaultOptions['run']> = (command) => {
      calls.push(command)
      if (command.args[0] === 'store') { kept = command.input?.trim(); return { status: 0, stdout: '' } }
      return kept === undefined ? { status: 1, stdout: '' } : { status: 0, stdout: kept }
    }
    const first = initializeVault(path, { platform: 'linux', run }).vault
    expect(first.available()).toBe(true)
    const encrypted = first.encrypt('Linux secret')
    expect(initializeVault(path, { platform: 'linux', run }).vault.decrypt(encrypted)).toBe('Linux secret')
    kept = undefined
    expect(initializeVault(path, { platform: 'linux', run }).vault.available()).toBe(false)
    expect(calls.filter((command) => command.args[0] === 'store')).toHaveLength(1)
  })

  it('stores a DPAPI-wrapped key on Windows and supplies secrets only through stdin', () => {
    vi.stubEnv('GECKIT_VAULT_KEY', undefined)
    const path = directory()
    const calls: VaultCommand[] = []
    const wrapper = Buffer.from('fake-dpapi-envelope:')
    const run: NonNullable<VaultOptions['run']> = (command) => {
      calls.push(command)
      const input = Buffer.from(command.input ?? '', 'base64')
      const output = command.args.at(-1)?.includes('::Unprotect') === true ? input.subarray(wrapper.length) : Buffer.concat([wrapper, input])
      return { status: 0, stdout: output.toString('base64') }
    }
    const vault = initializeVault(path, { platform: 'win32', run }).vault
    const encrypted = vault.encrypt('Windows secret')
    expect(initializeVault(path, { platform: 'win32', run }).vault.decrypt(encrypted)).toBe('Windows secret')
    const wrapped = readFileSync(join(path, 'vault-key.dpapi'), 'utf8')
    expect(wrapped).not.toBe(calls[0]?.input)
    expect(calls.every((command) => !command.args.some((arg) => arg === command.input))).toBe(true)
  })

  it('keeps undecryptable legacy host entries intact until a separate migration', () => {
    const path = directory()
    const file = join(path, 'secrets.json')
    const legacy = Buffer.from('legacy safeStorage bytes').toString('base64')
    writeFileSync(file, JSON.stringify({ legacy }))
    const { storage } = initializeVault(path, { key })
    const secrets = secretsAt(file, storage)
    expect(secrets.has('legacy')).toBe(true)
    expect(secrets.get('legacy')).toBeUndefined()
    expect(readFileSync(file, 'utf8')).toBe(JSON.stringify({ legacy }))
    secrets.set('new-host', 'a new password')
    expect(secretsAt(file, storage).get('new-host')).toBe('a new password')
    expect(readFileSync(file, 'utf8')).toContain(legacy)
    expect(readFileSync(file, 'utf8')).not.toContain('a new password')
  })
})
