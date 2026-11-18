import type { RemoteAccess } from './remote/access'
import type { RemoteComputers } from './remote/computers'
import { randomUUID } from 'node:crypto'
import { chmodSync, copyFileSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { version } from '../shared/version'
import { application } from '../core/application'
import { exportConfiguration, stageConfigurationImport } from '../core/configuration-transfer'
import type { CoreEvents } from '../core/events'
import type { CoreRuntime } from '../core/runtime'
import { initializeVault, isVaultEnvelope } from '../core/vault'
import { secretsAt } from '../main/hosts/secrets'
import type { Secrets } from '../main/hosts/secrets'
import type { HostConfig, HostDraft } from '../shared/hosts'
import type { SessionImage } from '../shared/api'

export type ServiceEvents = CoreEvents & { 'core:trash': (id: string, path: string) => void; 'core:scale': (id: string, image: SessionImage, width: number) => void; 'core:idle': (id: string) => void }
export type MigratedHostSecret = Pick<HostConfig, 'id'> & Required<Pick<HostDraft, 'password'>>
export interface SecretMigration {
  readonly hosts: readonly MigratedHostSecret[]
  /** Files a channel sealed with the desktop's storage, by name, as the desktop read them. */
  readonly sealed?: { readonly [name: string]: string }
}
export interface MigrationState {
  readonly available: boolean
  readonly hosts: readonly HostConfig['id'][]
  /** Files channels still need the desktop to read, by name in the data folder. */
  readonly sealed: readonly string[]
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

/** Pictures scaled by the desktop app, which has a window that can draw them; without one, the picture itself. */
export function nativeScaler(emit: (id: string, image: SessionImage, width: number) => boolean) {
  const pending = new Map<string, (image: SessionImage | undefined) => void>()
  // A desktop that did not answer is not asked again for a minute, so a picture waits for it once at most.
  let quietUntil = 0
  return {
    scale: (image: SessionImage, width: number): Promise<SessionImage> => new Promise((resolve) => {
      if (Date.now() < quietUntil) { resolve(image); return }
      const id = randomUUID()
      const timer = setTimeout(() => { quietUntil = Date.now() + 60_000; finish(undefined) }, 3_000)
      const finish = (scaled: SessionImage | undefined): void => {
        if (!pending.delete(id)) return
        clearTimeout(timer)
        resolve(scaled ?? image)
      }
      pending.set(id, finish)
      if (!emit(id, image, width)) finish(undefined)
    }),
    scaled: (id: string, image?: SessionImage): void => { pending.get(id)?.(image) },
    dispose: (): void => { for (const finish of [...pending.values()]) finish(undefined) },
  }
}

/** Whether nobody is at this computer, asked of the desktop app; a computer without it, or one that does not answer, counts as nobody there. */
export function nativeIdle(emit: (id: string) => boolean) {
  const pending = new Map<string, (idle: boolean) => void>()
  return {
    idle: (): Promise<boolean> => new Promise((resolve) => {
      const id = randomUUID()
      const timer = setTimeout(() => finish(true), 2_000)
      const finish = (idle: boolean): void => {
        if (!pending.delete(id)) return
        clearTimeout(timer)
        resolve(idle)
      }
      pending.set(id, finish)
      if (!emit(id)) finish(true)
    }),
    answered: (id: string, idle: boolean): void => { pending.get(id)?.(idle) },
    dispose: (): void => { for (const finish of [...pending.values()]) finish(true) },
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

export function migrationState(directory: string, security: ServiceSecurity, legacy: readonly string[] = []): MigrationState {
  let hosts: MigrationState['hosts'] = []
  let sealed: string[] = []
  let detail: string | undefined
  try { hosts = [...hostSecrets(join(directory, 'hosts', 'secrets.json'))].filter(([, sealed]) => !isVaultEnvelope(Buffer.from(sealed, 'base64'))).map(([id]) => id) }
  catch { detail = 'Saved host secrets could not be read. Existing files were preserved.' }
  try { sealed = legacy.filter((name) => { const path = join(directory, name); return existsSync(path) && !isVaultEnvelope(readFileSync(path)) }) }
  catch { detail = 'Saved channel settings could not be read. Existing files were preserved.' }
  return { available: security.vault.available(), hosts, sealed, ...(detail === undefined ? {} : { detail }) }
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

export function migrateSecrets(directory: string, security: ServiceSecurity, request: SecretMigration, legacy: readonly string[] = []): MigrationState {
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
  for (const name of legacy) {
    const text = request.sealed?.[name]
    const path = join(directory, name)
    if (text === undefined || text === '' || !existsSync(path) || isVaultEnvelope(readFileSync(path))) continue
    replaceSealed(path, security.vault.encrypt(text), (bytes) => { if (security.vault.decrypt(bytes) !== text) throw new Error('Saved channel secret verification failed.') })
  }
  return migrationState(directory, security, legacy)
}

export function serviceApplication(runtime: CoreRuntime, directory: string, security: ServiceSecurity, native: ReturnType<typeof nativeRequests>, remote?: RemoteAccess, computers?: RemoteComputers, scaler?: ReturnType<typeof nativeScaler>, idler?: ReturnType<typeof nativeIdle>) {
  const core = application(runtime)
  const desktop = {
    'remote:pair': () => { if (remote === undefined) throw new Error('Remote access unavailable.'); return remote.pair() },
    'remote:enable': (signal?: string) => { if (remote === undefined) throw new Error('Remote access unavailable.'); return remote.enable(signal) },
    'remote:disable': () => remote?.disable(),
    'remote:create': (projects: readonly string[], manager?: boolean, ttl?: number) => remote?.create(projects, manager, ttl),
    'remote:pending': () => remote?.pending(),
    'remote:approve': (id: string, phrase: string) => remote?.approve(id, phrase),
    'remote:cancel': (id: string) => remote?.cancel(id),
    'remote:devices': () => remote?.devices(),
    'remote:revoke': (id: string) => remote?.revoke(id),
    'computers:product': (name: string, args: readonly string[]) => { if (computers === undefined) throw new Error('Computers unavailable.'); return computers.product(name, args) },
    'computers:add': (code: string) => { if (computers === undefined) throw new Error('Computers unavailable.'); return computers.add(code) },
    'computers:list': () => computers?.list() ?? [],
    'computers:forget': (name: string) => { if (computers === undefined) throw new Error('Computers unavailable.'); return computers.forget(name) },
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
    'desktop:hello': () => ({ protocol: 1, version, methods: [...Object.keys(core), ...Object.keys(desktop)], migration: migrationState(directory, security, runtime.channels.legacySealed()) }),
    'desktop:completeNative': (id: string, error?: string) => native.complete(id, error),
    'desktop:scaled': (id: string, image?: SessionImage) => scaler?.scaled(id, image),
    'desktop:idle': (id: string, idle: boolean) => idler?.answered(id, idle),
    'desktop:migrateSecrets': async (request: SecretMigration) => {
      const legacy = runtime.channels.legacySealed()
      const before = migrationState(directory, security, legacy)
      const result = migrateSecrets(directory, security, request, legacy)
      if (before.sealed.length > result.sealed.length) await runtime.channels.adoptLegacy()
      return result
    },
  }
  return { ...core, ...desktop }
}

export type ServiceMethods = ReturnType<typeof serviceApplication>
