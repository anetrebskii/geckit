import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import type { ChatSession } from '../src/shared/api'
import type { CoreMethods } from '../src/core/application'
import type { RemoteChannel, RemoteIdentity, RemoteResponse, RemoteSignal } from '../src/shared/remote/protocol'
import type { RemoteAccess } from '../src/service/remote/access'
import type { ObservationRuntime } from '../src/service/remote/gateway'

const transport = vi.hoisted(() => ({ listeners: [] as { pairing: RemoteSignal; joined: (channel: RemoteChannel) => void; stopped: boolean }[] }))
vi.mock('../src/service/remote/transport', () => ({ disposeTransport: () => undefined, nodeListen: (pairing: RemoteSignal, joined: (channel: RemoteChannel) => void) => { const listener = { pairing, joined, stopped: false }; transport.listeners.push(listener); return () => { listener.stopped = true } } }))
vi.mock('../src/main/store', () => ({ getSettings: () => ({ projects: ['/srv/allowed', '/srv/private'], profiles: [] }) }))
vi.mock('../src/core/application', () => ({ application: () => ({}) }))

import { remoteAccess } from '../src/service/remote/access'
import { serviceSecurity } from '../src/service/application'
import { coreEvents } from '../src/core/events'
import { DEFAULT_MANAGER_CONFIG } from '../src/shared/manager'
import { identity, sign, transcript } from '../src/shared/remote/identity'
import { REMOTE_PROTOCOL, remoteRef, requestOf } from '../src/shared/remote/protocol'

const folders: string[] = []
const opened: RemoteAccess[] = []
const runtime: ObservationRuntime = {
  sessions: { list: async () => [], items: async () => [] },
  manager: { view: async () => ({ config: DEFAULT_MANAGER_CONFIG, state: 'off', workers: [], activity: [], providers: [], decisions: [], queued: 0 }), inspect: async (id) => ({ id, items: [] }) },
  subscribe: coreEvents().subscribe,
}
async function access(source: ObservationRuntime = runtime) {
  const directory = mkdtempSync(join(tmpdir(), 'geckit-remote-access-'))
  folders.push(directory)
  const security = serviceSecurity(directory, { key: Buffer.alloc(32, 97).toString('base64') })
  const result = await remoteAccess(source, directory, security)
  opened.push(result)
  await result.enable('http://127.0.0.1:47932')
  return { result, directory, security }
}
function channel(key: string) {
  const responses: RemoteResponse[] = []
  let heard: ((text: string) => void) | undefined
  const closers: (() => void)[] = []
  let closed = false
  const link: RemoteChannel = {
    binding: Promise.resolve('test-binding'),
    send: (text) => responses.push(JSON.parse(text) as RemoteResponse),
    onMessage: (listener) => { heard = listener },
    onClose: (listener) => closers.push(listener),
    close: () => { if (closed) return; closed = true; for (const listener of closers) listener() },
  }
  const listener = transport.listeners.findLast((one) => one.pairing.key === key && !one.stopped)
  if (listener === undefined) throw new Error('No active listener for this test device')
  listener.joined(link)
  return { responses, send: (value: object) => heard?.(JSON.stringify(value)), close: link.close, closed: () => closed }
}
async function enroll(key: string, client?: RemoteIdentity) {
  const device = client ?? await identity()
  const link = channel(key)
  const challenge = link.responses.find((one) => one.type === 'challenge')
  if (challenge?.type !== 'challenge') throw new Error('No server challenge')
  const text = transcript(challenge.server.id, challenge.nonce, device.publicKey, 'test-client-nonce', 'test-binding')
  link.send({ type: 'hello', protocol: REMOTE_PROTOCOL, publicKey: device.publicKey, name: 'Isolated test client', nonce: 'test-client-nonce', proof: await sign(device, text) })
  return { ...link, device }
}
async function pending(result: RemoteAccess) {
  await vi.waitFor(() => expect(result.pending()).toHaveLength(1))
  const request = result.pending()[0]
  if (request === undefined) throw new Error('No pending enrollment')
  return request
}
afterEach(() => {
  for (const result of opened.splice(0)) result.dispose()
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true })
  transport.listeners.length = 0
})

it('denies task control, native capabilities and generic service RPC at the remote boundary', () => {
  for (const type of ['chat:send', 'manager:configure', 'manager:history', 'manager.history', 'core:trash', 'settings:set', 'desktop:hello', 'answer']) expect(() => requestOf(JSON.stringify({ type, id: 1, args: [] }))).toThrow()
  expect(() => requestOf('{')).toThrow()
  expect(() => requestOf(JSON.stringify({ type: 'history', id: 1, session: 'remote', before: -1 }))).toThrow()
})

it('requires device proof and operator phrase, consumes once, persists encrypted trust and revokes an individual device', async () => {
  const { result, directory, security } = await access()
  const invitation = result.create(['/srv/allowed'])
  const first = await enroll(invitation.code)
  const request = await pending(result)
  await expect(result.approve(request.id, 'wrong-phrase')).rejects.toThrow('phrase')
  expect(result.devices()).toHaveLength(0)
  const approved = await result.approve(request.id, request.phrase)
  await vi.waitFor(() => expect(first.responses.some((one) => one.type === 'trusted')).toBe(true))
  const trust = first.responses.find((one) => one.type === 'trusted')
  if (trust?.type !== 'trusted') throw new Error('Missing trust')
  const persisted = readFileSync(join(directory, 'remote-access.sealed')).toString('utf8')
  expect(persisted).not.toContain(trust.trust.key)
  expect(persisted).not.toContain(invitation.code)
  const recovered = await enroll(invitation.code, first.device)
  await vi.waitFor(() => expect(recovered.responses).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'trusted', trust: expect.objectContaining({ device: approved.id }) })])))
  expect(result.devices()).toHaveLength(1)
  const attacker = await enroll(invitation.code)
  await vi.waitFor(() => expect(attacker.responses).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'error', code: 'reused' })])))
  const returning = await enroll(trust.trust.key, first.device)
  await vi.waitFor(() => expect(returning.responses.some((one) => one.type === 'trusted')).toBe(true))
  returning.send({ type: 'snapshot', id: 10 })
  await vi.waitFor(() => expect(returning.responses).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'snapshot', id: 10 })])))
  result.revoke(approved.id)
  await vi.waitFor(() => expect(returning.responses).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'error', code: 'revoked' })])))
  const denied = await enroll(trust.trust.key, first.device)
  await vi.waitFor(() => expect(denied.responses).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'error', code: 'revoked' })])))
  expect(result.devices()).toEqual([expect.objectContaining({ id: approved.id, revoked: expect.any(Number) })])
  result.dispose()
  const restarted = await remoteAccess(runtime, directory, security)
  opened.push(restarted)
  const persistedDenial = await enroll(trust.trust.key, first.device)
  await vi.waitFor(() => expect(persistedDenial.responses).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'error', code: 'revoked' })])))
})

it('rejects expired enrollment approval and denies scopes outside registered projects', async () => {
  const { result } = await access()
  expect(() => result.create(['/srv/unregistered'])).toThrow('registered')
  expect(() => result.create(['/srv/allowed'], true)).toThrow('all registered')
  const everything = result.create([], true)
  expect(everything.projects.length).toBeGreaterThan(1)
  expect(everything.manager).toBe(true)
  result.cancel(everything.id)
  const invitation = result.create(['/srv/allowed'], false, 1000)
  const one = await enroll(invitation.code)
  const request = await pending(result)
  await new Promise((resolve) => setTimeout(resolve, 1050))
  await expect(result.approve(request.id, request.phrase)).rejects.toThrow('expired')
  expect(result.devices()).toHaveLength(0)
  await vi.waitFor(() => expect(one.responses.some((response) => response.type === 'error' && response.code === 'expired') || one.closed()).toBe(true))
})

it('rejects forged device signatures and incompatible clients before creating an approval request', async () => {
  const { result } = await access()
  const invitation = result.create(['/srv/allowed'])
  const device = await identity()
  const forged = channel(invitation.code)
  forged.send({ type: 'hello', protocol: REMOTE_PROTOCOL, publicKey: device.publicKey, name: 'Forged', nonce: 'forged', proof: 'invalid' })
  await vi.waitFor(() => expect(forged.responses).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'error', code: 'denied' })])))
  const incompatible = channel(invitation.code)
  incompatible.send({ type: 'hello', protocol: REMOTE_PROTOCOL + 1, publicKey: device.publicKey, name: 'Future', nonce: 'future', proof: '' })
  await vi.waitFor(() => expect(incompatible.responses).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'error', code: 'incompatible' })])))
  expect(result.pending()).toEqual([])
  expect(result.devices()).toEqual([])
})

it('cancels pending invitations without granting trust and denies reads before operator approval', async () => {
  const { result } = await access()
  const invitation = result.create(['/srv/allowed'])
  const first = await enroll(invitation.code)
  const request = await pending(result)
  result.cancel(invitation.id)
  expect(first.closed()).toBe(true)
  await expect(result.approve(request.id, request.phrase)).rejects.toThrow('expired')
  expect(result.devices()).toEqual([])
  const another = result.create(['/srv/allowed'])
  const unapproved = await enroll(another.code)
  await pending(result)
  unapproved.send({ type: 'snapshot', id: 3 })
  await vi.waitFor(() => expect(unapproved.responses).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'error', code: 'denied' })])))
  expect(unapproved.responses.some((one) => one.type === 'snapshot')).toBe(false)
})


it('scopes snapshots and history on the server and qualifies identifiers with server identity', async () => {
  const allowed: ChatSession = { id: 'same-provider-id', root: '/srv/allowed', title: 'Allowed conversation', stands: 'Visible', state: 'idle', at: 1, here: false, mode: 'manual' }
  const hidden: ChatSession = { ...allowed, id: 'private-id', root: '/srv/private', title: 'Private conversation' }
  const source: ObservationRuntime = { ...runtime, sessions: { list: async () => [allowed, hidden], items: async () => [{ id: 'message-id', kind: 'theirs', text: 'Server-owned history', at: 1 }] } }
  const { result } = await access(source)
  const invitation = result.create(['/srv/allowed'])
  const client = await enroll(invitation.code)
  const request = await pending(result)
  await result.approve(request.id, request.phrase)
  client.send({ type: 'snapshot', id: 21 })
  await vi.waitFor(() => expect(client.responses.some((one) => one.type === 'snapshot')).toBe(true))
  const snapshot = client.responses.find((one) => one.type === 'snapshot')
  if (snapshot?.type !== 'snapshot') throw new Error('Missing snapshot')
  expect(snapshot.snapshot.projects.map((one) => one.path)).toEqual(['/srv/allowed'])
  expect(snapshot.snapshot.sessions).toEqual([expect.objectContaining({ id: remoteRef(invitation.server.id, 'session', allowed.id), title: allowed.title })])
  expect(JSON.stringify(snapshot.snapshot)).not.toContain(hidden.title)
  client.send({ type: 'history', id: 22, session: snapshot.snapshot.sessions[0]?.id, before: 0 })
  await vi.waitFor(() => expect(client.responses.some((one) => one.type === 'history')).toBe(true))
  const history = client.responses.find((one) => one.type === 'history')
  expect(history?.type === 'history' && history.history.items[0]?.text).toBe('Server-owned history')
  client.send({ type: 'history', id: 23, session: remoteRef(invitation.server.id, 'session', hidden.id), before: 0 })
  await vi.waitFor(() => expect(client.responses).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'error', code: 'denied' })])))
  expect(client.responses.some((one) => one.type === 'history' && one.id === 23)).toBe(false)
})

it('binds client authentication to the negotiated transport and suppresses data that completes after revocation', async () => {
  let finish: ((items: Awaited<ReturnType<ObservationRuntime['sessions']['items']>>) => void) | undefined
  let reading = false
  const one: ChatSession = { id: 'in-flight', root: '/srv/allowed', title: 'In flight', stands: '', state: 'idle', at: 1, here: false, mode: 'manual' }
  const source: ObservationRuntime = { ...runtime, sessions: { list: async () => [one], items: () => { reading = true; return new Promise((resolve) => { finish = resolve }) } } }
  const { result } = await access(source)
  const invitation = result.create(['/srv/allowed'])
  const attacker = await identity()
  const forged = channel(invitation.code)
  const challenge = forged.responses.find((response) => response.type === 'challenge')
  if (challenge?.type !== 'challenge') throw new Error('No challenge')
  forged.send({ type: 'hello', protocol: REMOTE_PROTOCOL, publicKey: attacker.publicKey, name: 'MITM', nonce: 'attack', proof: await sign(attacker, transcript(challenge.server.id, challenge.nonce, attacker.publicKey, 'attack', 'different-transport')) })
  await vi.waitFor(() => expect(forged.responses).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'error', code: 'denied' })])))
  const client = await enroll(invitation.code)
  const request = await pending(result)
  const approved = await result.approve(request.id, request.phrase)
  client.send({ type: 'history', id: 31, session: remoteRef(invitation.server.id, 'session', one.id), before: 0 })
  await vi.waitFor(() => expect(reading).toBe(true))
  result.revoke(approved.id)
  finish?.([{ id: 'secret', kind: 'theirs', text: 'Should not escape after revoke', at: 1 }])
  await new Promise((resolve) => setTimeout(resolve, 30))
  expect(client.responses.some((response) => response.type === 'history')).toBe(false)
})

it('pairs an empty server without enable or approval and grants live whole-server control', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'geckit-full-access-'))
  folders.push(directory)
  const security = serviceSecurity(directory, { key: Buffer.alloc(32, 97).toString('base64') })
  const rename = vi.fn<(id: string, title: string) => void>()
  const answer = vi.fn<CoreMethods['chat:answer']>().mockResolvedValue(true)
  const result = await remoteAccess(runtime, directory, security, { 'chat:rename': rename, 'chat:answer': answer })
  opened.push(result)
  const invitation = await result.pair()
  const first = await enroll(invitation.code)
  await vi.waitFor(() => expect(first.responses.some((one) => one.type === 'trusted')).toBe(true))
  expect(result.pending()).toEqual([])
  const trusted = first.responses.find((one) => one.type === 'trusted')
  if (trusted?.type !== 'trusted') throw new Error('No full trust')
  expect(trusted.trust.full).toBe(true)
  first.send({ type: 'core-call', id: 40, call: { method: 'chat:rename', args: ['remote-id', 'Changed remotely'] } })
  await vi.waitFor(() => expect(rename).toHaveBeenCalledWith('remote-id', 'Changed remotely'))
  await vi.waitFor(() => expect(first.responses.some((one) => one.type === 'core-result' && one.id === 40)).toBe(true))
  first.send({ type: 'core-call', id: 41, call: { method: 'chat:answer', args: ['remote-id', 'approval-id', 'allow'] } })
  await vi.waitFor(() => expect(answer).toHaveBeenCalledWith('remote-id', 'approval-id', 'allow'))
  const attacker = await enroll(invitation.code)
  await vi.waitFor(() => expect(attacker.responses.some((one) => one.type === 'error' && one.code === 'reused')).toBe(true))
  first.send({ type: 'snapshot', id: 42 })
  await vi.waitFor(() => expect(first.responses.some((one) => one.type === 'snapshot' && one.id === 42)).toBe(true))
  const snapshot = first.responses.find((one) => one.type === 'snapshot')
  expect(snapshot?.type === 'snapshot' && snapshot.snapshot.projects.map((one) => one.path)).toEqual(['/srv/allowed', '/srv/private'])
  first.send({ type: 'core-call', id: 43, call: { method: 'desktop:hello', args: [] } })
  await vi.waitFor(() => expect(first.responses.some((one) => one.type === 'core-failure' && one.id === 43)).toBe(true))
  expect(first.closed()).toBe(false)
  first.send({ type: 'core-call', id: 44, call: { method: 'chat:rename', args: ['remote-id', 'Still connected'] } })
  await vi.waitFor(() => expect(rename).toHaveBeenCalledWith('remote-id', 'Still connected'))
  result.revoke(trusted.trust.device)
  const rejected = await enroll(trusted.trust.key, first.device)
  await vi.waitFor(() => expect(rejected.responses.some((one) => one.type === 'error' && one.code === 'revoked')).toBe(true))
})

it('does not silently upgrade an existing scoped device to full control', async () => {
  const { result } = await access()
  const invitation = result.create(['/srv/allowed'])
  const first = await enroll(invitation.code)
  const request = await pending(result)
  await result.approve(request.id, request.phrase)
  first.send({ type: 'core-call', id: 50, call: { method: 'chat:rename', args: ['remote-id', 'No upgrade'] } })
  await vi.waitFor(() => expect(first.responses.some((one) => one.type === 'core-failure' && one.id === 50)).toBe(true))
  expect(first.closed()).toBe(false)
})
