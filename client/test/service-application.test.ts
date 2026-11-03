import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, it, vi } from 'vitest'

vi.mock('../src/core/application', () => ({ application: () => ({}) }))

import { migrateSecrets, migrationState, nativeRequests, serviceSecurity } from '../src/service/application'
import { isVaultEnvelope } from '../src/core/vault'

const folders: string[] = []
const key = Buffer.alloc(32, 71).toString('base64')

function directory(): string {
  const path = mkdtempSync(join(tmpdir(), 'geckit-migration-'))
  folders.push(path)
  mkdirSync(join(path, 'hosts'))
  return path
}

afterEach(() => {
  vi.useRealTimers()
  for (const path of folders.splice(0)) rmSync(path, { recursive: true, force: true })
})

it('migrates legacy ciphertext with verified encrypted replacements and ciphertext backups', () => {
  const path = directory()
  const hostPath = join(path, 'hosts', 'secrets.json')
  const telegramPath = join(path, 'manager-telegram.sealed')
  const hostLegacy = JSON.stringify({ box: Buffer.from('legacy host ciphertext').toString('base64') })
  const telegramLegacy = Buffer.from('legacy telegram ciphertext')
  writeFileSync(hostPath, hostLegacy)
  writeFileSync(telegramPath, telegramLegacy)
  const security = serviceSecurity(path, { key })
  expect(migrationState(path, security)).toEqual({ available: true, hosts: ['box'], telegram: true })
  const telegram = JSON.stringify({ token: 'private-bot-token', bot: { id: 1, username: 'fixture' }, offset: 0 })
  expect(migrateSecrets(path, security, { hosts: [{ id: 'box', password: 'private-host-password' }], telegram })).toEqual({ available: true, hosts: [], telegram: false })
  expect(security.secrets.get('box')).toBe('private-host-password')
  expect(readFileSync(`${hostPath}.desktop-backup`, 'utf8')).toBe(hostLegacy)
  expect(readFileSync(`${telegramPath}.desktop-backup`)).toEqual(telegramLegacy)
  expect(isVaultEnvelope(readFileSync(telegramPath))).toBe(true)
  expect(security.vault.decrypt(readFileSync(telegramPath))).toBe(telegram)
  for (const folder of [path, join(path, 'hosts')]) for (const name of readdirSync(folder, { withFileTypes: true })) {
    if (!name.isFile()) continue
    const file = join(folder, name.name)
    const bytes = readFileSync(file)
    expect(bytes.includes('private-host-password')).toBe(false)
    expect(bytes.includes('private-bot-token')).toBe(false)
    if (process.platform !== 'win32') expect(statSync(file).mode & 0o777).toBe(0o600)
  }
  migrateSecrets(path, security, { hosts: [{ id: 'box', password: 'should not overwrite' }], telegram: '{"token":"should not overwrite"}' })
  expect(security.secrets.get('box')).toBe('private-host-password')
  expect(security.vault.decrypt(readFileSync(telegramPath))).toBe(telegram)
})

it('preserves unmigrated hosts and legacy data when secure storage or verification fails', () => {
  const path = directory()
  const file = join(path, 'hosts', 'secrets.json')
  const original = JSON.stringify({ one: 'b25l', two: 'dHdv' })
  writeFileSync(file, original)
  const unavailable = serviceSecurity(path, { platform: 'freebsd' })
  expect(() => migrateSecrets(path, unavailable, { hosts: [{ id: 'one', password: 'password' }] })).toThrow('Unlock secure storage')
  expect(readFileSync(file, 'utf8')).toBe(original)
  const security = serviceSecurity(path, { key })
  const broken = { ...security, storage: { ...security.storage, decryptString: () => 'different' } }
  expect(() => migrateSecrets(path, broken, { hosts: [{ id: 'one', password: 'password' }] })).toThrow('verification failed')
  expect(readFileSync(file, 'utf8')).toBe(original)
  expect(readdirSync(join(path, 'hosts'))).toEqual(['secrets.json'])
  expect(migrateSecrets(path, security, { hosts: [{ id: 'one', password: 'password' }] })).toEqual({ available: true, hosts: ['two'], telegram: false })
  expect(security.secrets.get('one')).toBe('password')
})

it('requires a desktop native completion once and rejects absent or lost native execution', async () => {
  const requests: { id: string; path: string }[] = []
  const native = nativeRequests((id, path) => { requests.push({ id, path }) })
  const completed = native.trash('/plugin')
  const first = requests[0]
  expect(first?.path).toBe('/plugin')
  expect(first).toBeDefined()
  native.complete(first?.id ?? '')
  native.complete(first?.id ?? '', 'stale completion')
  await expect(completed).resolves.toBeUndefined()
  const failed = native.trash('/other')
  native.complete(requests[1]?.id ?? '', 'Trash is unavailable.')
  await expect(failed).rejects.toThrow('Trash is unavailable.')
  await expect(nativeRequests(() => false).trash('/headless')).rejects.toThrow('Open GeckIt desktop')
  const stopped = expect(native.trash('/stopping')).rejects.toThrow('service stopped')
  native.dispose()
  await stopped
  await expect(native.trash('/already-stopped')).rejects.toThrow('service stopped')
  vi.useFakeTimers()
  const timeout = expect(nativeRequests(() => undefined).trash('/disconnected')).rejects.toThrow('Open GeckIt desktop')
  await vi.advanceTimersByTimeAsync(30_000)
  await timeout
})
