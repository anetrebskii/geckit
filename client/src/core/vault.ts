import { spawnSync } from 'node:child_process'
import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import type { TelegramVault } from '../main/telegram'

export interface VaultStorage {
  isEncryptionAvailable(): boolean
  encryptString(text: string): Buffer
  decryptString(bytes: Buffer): string
}

export interface VaultCommand {
  readonly executable: string
  readonly args: readonly string[]
  readonly input?: string
}

export interface VaultCommandResult {
  readonly status: number | null
  readonly stdout: string
}

export interface VaultOptions {
  readonly platform?: NodeJS.Platform
  readonly key?: string
  readonly run?: (command: VaultCommand) => VaultCommandResult
}

const PREFIX = Buffer.from('GECKITVAULT1\0')
const KEY_BYTES = 32
const NONCE_BYTES = 12
const TAG_BYTES = 16

export const isVaultEnvelope = (bytes: Buffer): boolean => bytes.subarray(0, PREFIX.length).equals(PREFIX)

function commandRun(command: VaultCommand): VaultCommandResult {
  const result = spawnSync(command.executable, command.args, { encoding: 'utf8', input: command.input, timeout: 15_000, maxBuffer: 32_768, windowsHide: true })
  return { status: result.status, stdout: result.stdout ?? '' }
}

function keyOf(text: string): Buffer | undefined {
  const encoded = text.trim()
  if (!/^[A-Za-z0-9+/]{43}=$/.test(encoded)) return undefined
  const key = Buffer.from(encoded, 'base64')
  return key.length === KEY_BYTES && key.toString('base64') === encoded ? key : undefined
}

function systemKey(directory: string, platform: NodeJS.Platform, run: NonNullable<VaultOptions['run']>, existing: boolean): Buffer | undefined {
  const account = createHash('sha256').update(resolve(directory)).digest('hex')
  if (platform === 'darwin') {
    const read = (): VaultCommandResult => run({ executable: '/usr/bin/security', args: ['find-generic-password', '-a', account, '-s', 'org.anetrebskii.geckit.service-vault', '-w'] })
    const found = read()
    if (found.status === 0) return keyOf(found.stdout)
    if (found.status !== 44 || existing) return undefined
    const key = randomBytes(KEY_BYTES)
    const stored = run({ executable: '/usr/bin/security', args: ['-i'], input: `add-generic-password -a "${account}" -s "org.anetrebskii.geckit.service-vault" -w "${key.toString('base64')}"\n` })
    if (stored.status !== 0) return undefined
    const confirmed = read()
    const kept = confirmed.status === 0 ? keyOf(confirmed.stdout) : undefined
    return kept !== undefined && timingSafeEqual(key, kept) ? kept : undefined
  }
  if (platform === 'linux') {
    const attrs = ['application', 'geckit', 'vault', account]
    const found = run({ executable: 'secret-tool', args: ['lookup', ...attrs] })
    if (found.status === 0) return keyOf(found.stdout)
    if (found.status !== 1 || existing) return undefined
    const key = randomBytes(KEY_BYTES)
    const stored = run({ executable: 'secret-tool', args: ['store', '--label=GeckIt service vault', ...attrs], input: `${key.toString('base64')}\n` })
    if (stored.status !== 0) return undefined
    const confirmed = run({ executable: 'secret-tool', args: ['lookup', ...attrs] })
    const kept = confirmed.status === 0 ? keyOf(confirmed.stdout) : undefined
    return kept !== undefined && timingSafeEqual(key, kept) ? kept : undefined
  }
  if (platform === 'win32') {
    const file = join(directory, 'vault-key.dpapi')
    const decode = existsSync(file)
    if (!decode && existing) return undefined
    const key = decode ? undefined : randomBytes(KEY_BYTES)
    const input = decode ? readFileSync(file, 'utf8') : key?.toString('base64') ?? ''
    const transform = decode ? 'Unprotect' : 'Protect'
    const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $inputBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); $outputBytes=[Security.Cryptography.ProtectedData]::${transform}($inputBytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($outputBytes))`
    const result = run({ executable: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', script], input })
    if (result.status !== 0) return undefined
    if (decode) return keyOf(result.stdout)
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(result.stdout.trim())) return undefined
    writeFileSync(`${file}.new`, result.stdout.trim(), { mode: 0o600 })
    renameSync(`${file}.new`, file)
    return key
  }
  return undefined
}

export function initializeVault(directory: string, options: VaultOptions = {}): { readonly vault: TelegramVault; readonly storage: VaultStorage } {
  const configured = options.key ?? process.env['GECKIT_VAULT_KEY']
  const identityFile = join(directory, 'vault-key-id')
  const existing = existsSync(identityFile)
  let key: Buffer | undefined
  if (configured !== undefined) {
    key = keyOf(configured)
    if (key === undefined) throw new Error('GECKIT_VAULT_KEY must be a base64-encoded 32-byte key.')
  } else {
    try {
      mkdirSync(directory, { recursive: true, mode: 0o700 })
      key = systemKey(directory, options.platform ?? process.platform, options.run ?? commandRun, existing)
    } catch {
      key = undefined
    }
  }
  if (key !== undefined) {
    const identity = createHash('sha256').update(key).digest('hex')
    if (existing && readFileSync(identityFile, 'utf8').trim() !== identity) throw new Error('The GeckIt vault key does not match this data directory.')
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    if (!existing) writeFileSync(identityFile, identity, { mode: 0o600, flag: 'wx' })
  }
  const requireKey = (): Buffer => {
    if (key === undefined) throw new Error('Secure storage is unavailable. Unlock the system credential store or configure GECKIT_VAULT_KEY.')
    return key
  }
  const vault: TelegramVault = {
    available: () => key !== undefined,
    encrypt: (text) => {
      const nonce = randomBytes(NONCE_BYTES)
      const cipher = createCipheriv('aes-256-gcm', requireKey(), nonce)
      cipher.setAAD(PREFIX)
      const bytes = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
      return Buffer.concat([PREFIX, nonce, cipher.getAuthTag(), bytes])
    },
    decrypt: (bytes) => {
      const held = requireKey()
      if (!isVaultEnvelope(bytes) || bytes.length < PREFIX.length + NONCE_BYTES + TAG_BYTES) throw new Error('This secret needs migration from desktop secure storage.')
      const nonceAt = PREFIX.length
      const tagAt = nonceAt + NONCE_BYTES
      const dataAt = tagAt + TAG_BYTES
      const decipher = createDecipheriv('aes-256-gcm', held, bytes.subarray(nonceAt, tagAt))
      decipher.setAAD(PREFIX)
      decipher.setAuthTag(bytes.subarray(tagAt, dataAt))
      return Buffer.concat([decipher.update(bytes.subarray(dataAt)), decipher.final()]).toString('utf8')
    },
  }
  return { vault, storage: { isEncryptionAvailable: vault.available, encryptString: vault.encrypt, decryptString: vault.decrypt } }
}
