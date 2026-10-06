import { randomUUID } from 'node:crypto'
import { closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type * as filesystem from 'node:fs'
import type { safeStorage } from 'electron'
import type { AgentVpnResult, AgentVpnServer, AgentVpnView } from '../../shared/vpn'
import { checkVpnConfig } from './config'
import type { CheckedVpnConfig } from './config'

type VpnEncryption = Pick<typeof safeStorage, 'isEncryptionAvailable' | 'encryptString' | 'decryptString'> & Partial<Pick<typeof safeStorage, 'getSelectedStorageBackend'>>
type StoredServer = AgentVpnServer & { readonly config: string }
interface VpnDocument { readonly schema: 1; readonly servers: readonly StoredServer[]; readonly selected: AgentVpnView['selected'] }
export type VpnDisk = Pick<typeof filesystem, 'mkdirSync' | 'writeFileSync' | 'renameSync' | 'unlinkSync'>
const disk: VpnDisk = { mkdirSync, writeFileSync, renameSync, unlinkSync }
const STORAGE_ERROR = 'Saved VPN configurations could not be read. The existing file has been kept; no changes can be saved.'
const ENCRYPTION_ERROR = 'Secure storage is unavailable. Configure your operating system credential store before saving VPN servers.'

export class VpnStore {
  private document: VpnDocument = { schema: 1, servers: [], selected: null }
  private problem: string | undefined

  constructor(private readonly path: string, private readonly encryption: VpnEncryption, private readonly files: VpnDisk = disk, private readonly platform: NodeJS.Platform = process.platform) {
    try { lstatSync(path) } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
      this.problem = STORAGE_ERROR
      return
    }
    try {
      if (!this.secure()) { this.problem = ENCRYPTION_ERROR; return }
      const fd = openSync(path, 'r')
      let encrypted: Buffer
      try {
        const stat = fstatSync(fd)
        if (!stat.isFile() || stat.size > 3 * 1024 * 1024) throw new Error()
        encrypted = readFileSync(fd)
      } finally { closeSync(fd) }
      const value: unknown = JSON.parse(this.encryption.decryptString(encrypted))
      if (typeof value !== 'object' || value === null || !('schema' in value) || value.schema !== 1 || !('servers' in value) || !Array.isArray(value.servers) || value.servers.length > 32 || !('selected' in value) || (value.selected !== null && typeof value.selected !== 'string')) throw new Error()
      const servers: StoredServer[] = []
      for (const item of value.servers) {
        const server: unknown = item
        if (typeof server !== 'object' || server === null || !('id' in server) || typeof server.id !== 'string' || !/^[0-9a-f-]{36}$/.test(server.id) || !('name' in server) || typeof server.name !== 'string' || !this.validName(server.name) || !('config' in server) || typeof server.config !== 'string' || !('version' in server)) throw new Error()
        const checked = checkVpnConfig(server.config)
        if (checked.version !== server.version || servers.some((one) => one.id === server.id)) throw new Error()
        servers.push({ id: server.id, name: server.name, version: checked.version, config: checked.text })
      }
      if (value.selected !== null && !servers.some((one) => one.id === value.selected)) throw new Error()
      this.document = { schema: 1, servers, selected: value.selected }
    } catch { this.problem = STORAGE_ERROR }
  }

  private secure(): boolean {
    try {
      if (!this.encryption.isEncryptionAvailable()) return false
      const backend = this.encryption.getSelectedStorageBackend?.()
      return backend !== 'basic_text' && (this.platform !== 'linux' || backend !== undefined)
    } catch { return false }
  }

  view(): AgentVpnView {
    const required = this.document.servers.length > 0 || this.problem !== undefined
    return { servers: this.document.servers.map(({ id, name, version }) => ({ id, name, version })), selected: this.document.selected, runtime: 'unavailable', required, blocked: required, secureStorage: this.secure(), ...(this.problem === undefined ? {} : { problem: this.problem }) }
  }

  private validName(name: string): boolean { return typeof name === 'string' && name.trim().length > 0 && name.length <= 120 && [...name].every((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127) }
  private error(error: string): AgentVpnResult { return { ok: false, view: this.view(), error } }

  private save(next: VpnDocument): AgentVpnResult {
    if (this.problem !== undefined) return this.error(this.problem)
    if (!this.secure()) return this.error(ENCRYPTION_ERROR)
    const temporary = `${this.path}.${randomUUID()}.new`
    try {
      const encrypted = this.encryption.encryptString(JSON.stringify(next))
      this.files.mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
      this.files.writeFileSync(temporary, encrypted, { mode: 0o600, flag: 'wx' })
      this.files.renameSync(temporary, this.path)
      this.document = next
      return { ok: true, view: this.view() }
    } catch {
      try { this.files.unlinkSync(temporary) } catch { /* The temporary file may not have been created. */ }
      return this.error('VPN changes could not be saved. Your previous servers and selection have been kept.')
    }
  }

  add(name: AgentVpnServer['name'], checked: CheckedVpnConfig): AgentVpnResult {
    if (this.document.servers.length >= 32) return this.error('Save up to 32 VPN servers. Remove a server before importing another.')
    if (!this.validName(name)) return this.error('Use a server name between 1 and 120 characters.')
    const server: StoredServer = { id: randomUUID(), name: name.trim(), version: checked.version, config: checked.text }
    return this.save({ ...this.document, servers: [...this.document.servers, server], selected: this.document.selected ?? server.id })
  }

  select(id: AgentVpnServer['id']): AgentVpnResult {
    if (!this.document.servers.some((one) => one.id === id)) return this.error('This VPN server is no longer saved.')
    return this.save({ ...this.document, selected: id })
  }

  rename(id: AgentVpnServer['id'], name: AgentVpnServer['name']): AgentVpnResult {
    if (!this.document.servers.some((one) => one.id === id)) return this.error('This VPN server is no longer saved.')
    if (!this.validName(name)) return this.error('Use a server name between 1 and 120 characters.')
    return this.save({ ...this.document, servers: this.document.servers.map((one) => one.id === id ? { ...one, name: name.trim() } : one) })
  }

  remove(id: AgentVpnServer['id']): AgentVpnResult {
    if (!this.document.servers.some((one) => one.id === id)) return this.error('This VPN server is no longer saved.')
    return this.save({ ...this.document, servers: this.document.servers.filter((one) => one.id !== id), selected: this.document.selected === id ? null : this.document.selected })
  }

  check(id: AgentVpnServer['id']): AgentVpnResult {
    if (this.problem !== undefined) return this.error(this.problem)
    if (!this.secure()) return this.error(ENCRYPTION_ERROR)
    const server = this.document.servers.find((one) => one.id === id)
    if (server === undefined) return this.error('This VPN server is no longer saved.')
    try { checkVpnConfig(server.config); return { ok: true, view: this.view() } } catch { return this.error('Saved configuration is invalid or unsupported. Import a new native AmneziaWG .conf.') }
  }
}
