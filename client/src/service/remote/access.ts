import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { hostname } from 'node:os'
import { join } from 'node:path'
import type { ServiceSecurity } from '../application'
import { getSettings } from '../../main/store'
import { managerProjects } from '../../shared/manager'
import { newKey, SIGNAL } from '../../shared/pairing'
import { identity, phraseOf, sign, transcript, trustProof, verify } from '../../shared/remote/identity'
import { CODE_TTL, invitationLink, REMOTE_PROTOCOL, requestOf, validSignal } from '../../shared/remote/protocol'
import type { RemoteChannel, RemoteIdentity, RemoteResponse, RemoteServer, RemoteTrust } from '../../shared/remote/protocol'
import { observation } from './gateway'
import type { ObservationRuntime } from './gateway'
import { disposeTransport, nodeListen } from './transport'
interface Device { readonly id: string; readonly name: string; readonly publicKey: string; readonly key: string; readonly projects: readonly string[]; readonly manager: boolean; readonly created: number; readonly revoked?: number }
interface AccessRecord { readonly server: RemoteServer; readonly identity: RemoteIdentity; readonly enabled: boolean; readonly signal: string; readonly devices: readonly Device[] }
interface Invitation { readonly id: string; readonly key: string; readonly expires: number; readonly projects: readonly string[]; readonly manager: boolean; consumed: string | undefined; readonly stop: () => void }
interface Pending { readonly id: string; readonly name: string; readonly publicKey: string; readonly phrase: string; readonly invitation: Invitation; readonly approve: (device: Device) => Promise<void>; readonly close: () => void }
export async function remoteAccess(runtime: ObservationRuntime, directory: string, security: ServiceSecurity) {
  const path = join(directory, 'remote-access.sealed')
  let record: AccessRecord | undefined
  if (existsSync(path)) {
    try { record = JSON.parse(security.vault.decrypt(readFileSync(path))) as AccessRecord }
    catch { console.warn('Remote access is locked; existing trust was preserved.') }
  }
  const pending = new Map<string, Pending>()
  const invitations = new Map<string, Invitation>()
  const listeners = new Map<string, () => void>()
  const channels = new Map<string, Set<RemoteChannel>>()
  let gateway: ReturnType<typeof observation> | undefined
  let disposed = false
  const save = (): void => {
    if (record === undefined) throw new Error('Remote access is not initialized.')
    writeFileSync(`${path}.new`, security.vault.encrypt(JSON.stringify(record)), { mode: 0o600 })
    renameSync(`${path}.new`, path)
  }
  const active = (): AccessRecord => { if (record === undefined || !record.enabled) throw new Error('Enable remote access first.'); return record }
  const send = (channel: RemoteChannel, message: RemoteResponse): void => channel.send(JSON.stringify(message))
  const refuse = (channel: RemoteChannel, code: Extract<RemoteResponse, { type: 'error' }>['code'], message: string): void => { send(channel, { type: 'error', code, message }); setTimeout(() => channel.close(), 100) }
  const serve = (channel: RemoteChannel, invitation?: Invitation, trusted?: Device): void => {
    const server = record?.server
    if (server === undefined || disposed) { channel.close(); return }
    const challenge = newKey()
    let device: Device | undefined
    let authenticating = false
    let ended = false
    let requests = 0
    let stopChanges: (() => void) | undefined
    let requestId: string | undefined
    let updateTimer: ReturnType<typeof setTimeout> | undefined
    const timeout = setTimeout(() => { if (device === undefined) refuse(channel, 'expired', 'Code expired. Create a new code on the server.') }, invitation === undefined ? 15_000 : Math.max(1, invitation.expires - Date.now()))
    const end = (): void => { if (ended) return; ended = true; clearTimeout(timeout); if (updateTimer !== undefined) clearTimeout(updateTimer); stopChanges?.(); if (requestId !== undefined) pending.delete(requestId); if (device !== undefined) channels.get(device.id)?.delete(channel) }
    channel.onClose(end)
    const establish = async (one: Device, text: string): Promise<void> => {
      if (ended) return
      device = one
      clearTimeout(timeout)
      const held = channels.get(one.id) ?? new Set<RemoteChannel>()
      held.add(channel); channels.set(one.id, held)
      const trust: RemoteTrust = { server, device: one.id, key: one.key, signal: active().signal, projects: one.projects, manager: one.manager }
      const proof = await sign(active().identity, trustProof(text, trust))
      if (ended || !record?.enabled || record.devices.find((device) => device.id === one.id)?.revoked !== undefined) { channel.close(); return }
      send(channel, { type: 'trusted', trust, proof })
      stopChanges = gateway?.changed((seq) => {
        if (updateTimer !== undefined) return
        updateTimer = setTimeout(() => { updateTimer = undefined; if (!ended) send(channel, { type: 'changed', epoch: gateway?.epoch ?? '', seq }) }, 300)
      })
    }
    channel.onMessage((raw) => {
      void (async () => {
        if (ended || !record?.enabled || requests >= 4) { channel.close(); return }
        requests++
        try {
          const request = requestOf(raw)
          if (request.type === 'hello') {
            if (device !== undefined || authenticating) throw new Error('Already authenticated')
            authenticating = true
            if (request.protocol !== REMOTE_PROTOCOL) { refuse(channel, 'incompatible', 'Server version is not compatible with this client.'); return }
            const text = transcript(server.id, challenge, request.publicKey, request.nonce, await channel.binding)
            if (!await verify(request.publicKey, text, request.proof)) throw new Error('Device proof rejected')
            if (ended) return
            if (trusted !== undefined) {
              if (trusted.publicKey !== request.publicKey || active().devices.find((one) => one.id === trusted.id)?.revoked !== undefined) { refuse(channel, 'revoked', 'Device access revoked. Pair again with a new code.'); return }
              await establish(trusted, text); return
            }
            if (invitation === undefined || Date.now() >= invitation.expires) { refuse(channel, 'expired', 'Code expired. Create a new code on the server.'); return }
            if (invitation.consumed !== undefined) {
              const enrolled = active().devices.find((one) => one.id === invitation.consumed && one.publicKey === request.publicKey && one.revoked === undefined)
              if (enrolled !== undefined) { await establish(enrolled, text); return }
              refuse(channel, 'reused', 'Code already used. Create a new code on the server.'); return
            }
            if (pending.size >= 16) throw new Error('Too many pending devices')
            requestId = randomUUID()
            const phrase = await phraseOf(text)
            if (ended || Date.now() >= invitation.expires || invitation.consumed !== undefined) { channel.close(); return }
            pending.set(requestId, { id: requestId, name: request.name, publicKey: request.publicKey, phrase, invitation, close: () => channel.close(), approve: (one) => establish(one, text) })
            send(channel, { type: 'pending', request: requestId, phrase }); return
          }
          if (device === undefined) throw new Error('Confirm this device on the server first.')
          const current = active().devices.find((one) => one.id === device?.id)
          if (current === undefined || current.revoked !== undefined) { refuse(channel, 'revoked', 'Device access revoked. Pair again with a new code.'); return }
          if (gateway === undefined) throw new Error('Remote data is unavailable')
          const response: RemoteResponse = request.type === 'snapshot' ? { type: 'snapshot', id: request.id, snapshot: await gateway.snapshot(current.projects, current.manager) } : { type: 'history', id: request.id, history: await gateway.history(current.projects, request.session, request.before, current.manager) }
          if (!ended && record.enabled && record.devices.find((one) => one.id === current.id)?.revoked === undefined) send(channel, response)
        } catch (error) { refuse(channel, 'denied', error instanceof Error ? error.message : 'Remote operation denied.') }
        finally { requests-- }
      })()
    })
    send(channel, { type: 'challenge', server, nonce: challenge, protocol: REMOTE_PROTOCOL, expires: invitation?.expires ?? 0 })
  }
  const listenDevice = (device: Device): void => {
    if (record === undefined || !record.enabled || listeners.has(device.id)) return
    listeners.set(device.id, nodeListen({ key: device.key, signal: record.signal }, (channel) => serve(channel, undefined, device), (error) => console.warn(`Remote signaling unavailable: ${error.message}`)))
  }
  const start = (): void => {
    if (record === undefined || !record.enabled) return
    gateway ??= observation(runtime, record.server)
    for (const device of record.devices) listenDevice(device)
  }
  const stop = (): void => {
    for (const listener of listeners.values()) listener(); listeners.clear()
    for (const invitation of invitations.values()) invitation.stop(); invitations.clear()
    for (const request of pending.values()) request.close(); pending.clear()
    for (const links of channels.values()) for (const channel of links) channel.close(); channels.clear()
    gateway?.dispose(); gateway = undefined
  }
  start()
  const sweep = setInterval(() => {
    for (const [id, invitation] of invitations) if (Date.now() >= invitation.expires + 60_000) { invitation.stop(); invitations.delete(id) }
    for (const request of pending.values()) if (Date.now() >= request.invitation.expires) { request.close(); pending.delete(request.id) }
  }, 1000)
  return {
    enable: async (signal = SIGNAL) => {
      if (!validSignal(signal)) throw new Error('Use the managed signaling service or a localhost test endpoint.')
      if (!security.vault.available()) throw new Error('Secure storage is unavailable.')
      if (record === undefined) {
        if (existsSync(path)) throw new Error('Existing remote trust could not be unlocked. It was not overwritten.')
        const keys = await identity()
        record = { server: { id: randomUUID(), name: hostname(), publicKey: keys.publicKey }, identity: keys, enabled: true, signal, devices: [] }
      } else { stop(); record = { ...record, enabled: true, signal } }
      save(); start(); return { server: record.server, enabled: true, signal }
    },
    disable: () => { const current = active(); record = { ...current, enabled: false }; save(); stop(); return { enabled: false } },
    create: (projects: readonly string[], manager = false, ttl = CODE_TTL) => {
      const current = active()
      if (projects.length === 0 || projects.some((root) => !managerProjects(getSettings()).includes(root))) throw new Error('Choose registered projects for this device.')
      if (!Number.isInteger(ttl) || ttl < 1000 || ttl > CODE_TTL) throw new Error('Invitation lifetime must be between 1 second and 5 minutes.')
      if (manager && managerProjects(getSettings()).some((root) => !projects.includes(root))) throw new Error('Manager history requires all registered projects.')
      if (invitations.size >= 16) throw new Error('Cancel an outstanding invitation first.')
      const key = newKey(); const id = randomUUID(); const expires = Date.now() + ttl
      const invitation: Invitation = { id, key, expires, projects: [...projects], manager, consumed: undefined, stop: nodeListen({ key, signal: current.signal }, (channel) => serve(channel, invitation), (error) => console.warn(`Invitation signaling unavailable: ${error.message}`)) }
      invitations.set(id, invitation)
      return { id, code: key, link: invitationLink(key, current.signal), expires, server: current.server, projects, manager }
    },
    pending: () => [...pending.values()].map(({ id, name, phrase, invitation }) => ({ id, name, phrase, expires: invitation.expires, projects: invitation.projects, manager: invitation.manager })),
    approve: async (id: string, phrase: string) => {
      const request = pending.get(id)
      if (request === undefined || Date.now() >= request.invitation.expires) throw new Error('Enrollment expired or disconnected.')
      if (phrase !== request.phrase) throw new Error('Verification phrase does not match.')
      if (request.invitation.consumed !== undefined) throw new Error('Code already used.')
      const current = active()
      const device: Device = { id: randomUUID(), name: request.name, publicKey: request.publicKey, key: newKey(), projects: request.invitation.projects, manager: request.invitation.manager, created: Date.now() }
      record = { ...current, devices: [...current.devices, device] }
      try { save() } catch (error) { record = current; throw error }
      request.invitation.consumed = device.id
      pending.delete(id)
      listenDevice(device)
      await request.approve(device)
      return { id: device.id, name: device.name }
    },
    cancel: (id: string) => { const invitation = invitations.get(id); invitation?.stop(); invitations.delete(id); for (const request of pending.values()) if (request.invitation.id === id) { request.close(); pending.delete(request.id) }; return { cancelled: invitation !== undefined } },
    devices: () => (record?.devices ?? []).map(({ key: _key, publicKey: _publicKey, ...device }) => device),
    revoke: (id: string) => {
      const current = active()
      if (!current.devices.some((one) => one.id === id)) throw new Error('Device not found.')
      record = { ...current, devices: current.devices.map((one) => one.id === id ? { ...one, revoked: Date.now() } : one) }; save()
      for (const channel of channels.get(id) ?? []) refuse(channel, 'revoked', 'Device access revoked. Pair again with a new code.')
      // Keep a deny-only listener so this device gets an explicit revoked state rather than a timeout.
      return { revoked: id }
    },
    dispose: () => { disposed = true; clearInterval(sweep); stop(); disposeTransport() },
  }
}
export type RemoteAccess = Awaited<ReturnType<typeof remoteAccess>>
