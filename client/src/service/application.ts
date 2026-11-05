import type { RemoteAccess } from './remote/access'
import { randomUUID } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { version } from '../../package.json'
import { application } from '../core/application'
import { exportConfiguration, stageConfigurationImport } from '../core/configuration-transfer'
import type { CoreEvents } from '../core/events'
import type { CoreRuntime } from '../core/runtime'
import { initializeVault, isVaultEnvelope } from '../core/vault'
import { secretsAt } from '../main/hosts/secrets'
import type { Secrets } from '../main/hosts/secrets'
import type { HostConfig, HostDraft } from '../shared/hosts'

export type ServiceEvents = CoreEvents & { 'core:trash': (id: string, path: string) => void }
export type MigratedHostSecret = Pick<HostConfig, 'id'> & Required<Pick<HostDraft, 'password'>>
export interface SecretMigration {
  readonly hosts: readonly MigratedHostSecret[]
  readonly telegram?: string
}
export interface MigrationState {
  readonly available: boolean
  readonly hosts: readonly HostConfig['id'][]
  readonly telegram: boolean
  readonly detail?: string
}

export function serviceSecurity(directory: string, options?: Parameters<typeof initializeVault>[1]) {
  const secured = initializeVault(directory, options)
  const path = join(directory, 'hosts', 'secrets.json')
  let current = secretsAt(path, secured.storage)
  const secrets: Secrets = {
    can: () => current.can(),
    get: (id) => current.get(id),
    set: (id, password) => current.set(id, password),
    forget: (id) => current.forget(id),
    has: (id) => current.has(id),
  }
  return { ...secured, secrets, reload: () => { current = secretsAt(path, secured.storage) } }
}

export type ServiceSecurity = ReturnType<typeof serviceSecurity>

export function nativeRequests(emit: (id: string, path: string) => boolean | void) {
  const pending = new Map<string, { readonly finish: (error?: string) => void }>()
  let stopped = false
  return {
    trash: (path: string): Promise<void> => new Promise((resolve, reject) => {
      if (stopped) { reject(new Error('GeckIt service stopped.')); return }
      const id = randomUUID()
      const finish = (error?: string): void => {
        if (!pending.delete(id)) return
        clearTimeout(timer)
        if (error === undefined) resolve()
        else reject(new Error(error))
      }
      const timer = setTimeout(() => finish('Open GeckIt desktop to move this item to Trash.'), 30_000)
      pending.set(id, { finish })
      try { if (emit(id, path) === false) finish('Open GeckIt desktop to move this item to Trash.') } catch (error) { finish(error instanceof Error ? error.message : String(error)) }
    }),
    complete: (id: string, error?: string): void => { pending.get(id)?.finish(error) },
    dispose: (): void => { stopped = true; for (const one of pending.values()) one.finish('GeckIt service stopped.') },
  }
}

function hostSecrets(path: string): Map<string, string> {
  if (!existsSync(path)) return new Map()
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Saved host secrets could not be read.')
  const result = new Map<string, string>()
  for (const [id, value] of Object.entries(parsed)) {
    const sealed: unknown = value
    if (typeof sealed !== 'string') throw new Error('Saved host secrets could not be read.')
    result.set(id, sealed)
  }
  return result
}

export function migrationState(directory: string, security: ServiceSecurity): MigrationState {
  let hosts: MigrationState['hosts'] = []
  let telegram = false
  let detail: string | undefined
  try { hosts = [...hostSecrets(join(directory, 'hosts', 'secrets.json'))].filter(([, sealed]) => !isVaultEnvelope(Buffer.from(sealed, 'base64'))).map(([id]) => id) }
  catch { detail = 'Saved host secrets could not be read. Existing files were preserved.' }
  try { const path = join(directory, 'manager-telegram.sealed'); telegram = existsSync(path) && !isVaultEnvelope(readFileSync(path)) }
  catch { detail = 'Saved Telegram settings could not be read. Existing files were preserved.' }
  return { available: security.vault.available(), hosts, telegram, ...(detail === undefined ? {} : { detail }) }
}

function replaceSealed(path: string, bytes: Buffer, verify: (bytes: Buffer) => void): void {
  const next = `${path}.${randomUUID()}.service-new`
  try {
    writeFileSync(next, bytes, { mode: 0o600, flag: 'wx' })
    verify(readFileSync(next))
    const backup = `${path}.desktop-backup`
    if (!existsSync(backup)) { copyFileSync(path, backup); chmodSync(backup, 0o600) }
    renameSync(next, path)
  } finally { rmSync(next, { force: true }) }
}

export function migrateSecrets(directory: string, security: ServiceSecurity, request: SecretMigration): MigrationState {
  if (!security.vault.available()) throw new Error('Unlock secure storage before migrating saved secrets.')
  const hostPath = join(directory, 'hosts', 'secrets.json')
  const kept = hostSecrets(hostPath)
  const passwords = new Map<string, string>()
  for (const host of request.hosts) {
    const original = kept.get(host.id)
    if (original === undefined || isVaultEnvelope(Buffer.from(original, 'base64'))) continue
    const bytes = security.storage.encryptString(host.password)
    if (security.storage.decryptString(bytes) !== host.password) throw new Error('Saved host secret verification failed.')
    kept.set(host.id, bytes.toString('base64'))
    passwords.set(host.id, host.password)
  }
  if (passwords.size > 0) {
    replaceSealed(hostPath, Buffer.from(JSON.stringify(Object.fromEntries(kept))), (bytes) => {
      const parsed: unknown = JSON.parse(bytes.toString('utf8'))
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Saved host secret verification failed.')
      for (const [id, password] of passwords) {
        if (!(id in parsed)) throw new Error('Saved host secret verification failed.')
        const sealed: unknown = Reflect.get(parsed, id)
        if (typeof sealed !== 'string' || security.storage.decryptString(Buffer.from(sealed, 'base64')) !== password) throw new Error('Saved host secret verification failed.')
      }
    })
    security.reload()
  }
  const telegramPath = join(directory, 'manager-telegram.sealed')
  if (request.telegram !== undefined && existsSync(telegramPath) && !isVaultEnvelope(readFileSync(telegramPath))) {
    let parsed: unknown
    try { parsed = JSON.parse(request.telegram) } catch { throw new Error('Saved Telegram secret could not be read.') }
    if (parsed === null || typeof parsed !== 'object' || !('token' in parsed) || typeof parsed.token !== 'string') throw new Error('Saved Telegram secret could not be read.')
    const text = request.telegram
    const sealed = security.vault.encrypt(text)
    replaceSealed(telegramPath, sealed, (bytes) => { if (security.vault.decrypt(bytes) !== text) throw new Error('Saved Telegram secret verification failed.') })
  }
  return migrationState(directory, security)
}

export function serviceApplication(runtime: CoreRuntime, directory: string, security: ServiceSecurity, native: ReturnType<typeof nativeRequests>, remote?: RemoteAccess) {
  const core = application(runtime)
  const desktop = {
    'remote:enable': (signal?: string) => { if (remote === undefined) throw new Error('Remote access unavailable.'); return remote.enable(signal) },
    'remote:disable': () => remote?.disable(),
    'remote:create': (projects: readonly string[], manager?: boolean, ttl?: number) => remote?.create(projects, manager, ttl),
    'remote:pending': () => remote?.pending(),
    'remote:approve': (id: string, phrase: string) => remote?.approve(id, phrase),
    'remote:cancel': (id: string) => remote?.cancel(id),
    'remote:devices': () => remote?.devices(),
    'remote:revoke': (id: string) => remote?.revoke(id),
    'configuration:export': () => exportConfiguration(directory),
    'service:importConfiguration': async (text: string) => {
      const manager = await runtime.manager.view()
      if (runtime.sessions.hasPendingWork() || manager.queued > 0) throw new Error('Finish or stop active and queued work before importing configuration.')
      stageConfigurationImport(directory, text)
      return { ready: true }
    },
    'service:shutdownForUpdate': () => {
      if (runtime.sessions.working().length > 0) throw new Error('GeckIt is still working. Wait for active tasks to finish before updating.')
      return { ready: true }
    },
    'desktop:hello': () => ({ protocol: 1, version, methods: [...Object.keys(core), ...Object.keys(desktop)], migration: migrationState(directory, security) }),
    'desktop:completeNative': (id: string, error?: string) => native.complete(id, error),
    'desktop:migrateSecrets': async (request: SecretMigration) => {
      const before = migrationState(directory, security)
      const result = migrateSecrets(directory, security, request)
      if (before.telegram && !result.telegram && runtime.manager.enabled()) { runtime.telegram.stop(); await runtime.telegram.start() }
      return result
    },
  }
  return { ...core, ...desktop }
}

export type ServiceMethods = ReturnType<typeof serviceApplication>
