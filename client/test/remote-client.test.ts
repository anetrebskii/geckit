import { afterEach, describe, expect, it, vi } from 'vitest'
import { HOLD, LINK_DOWN, connectRemote } from '../src/renderer/src/remote/client'
import { remoteDial } from '../src/renderer/src/remote/transport'
import { devicePublicKey, rememberServer, signDevice } from '../src/renderer/src/remote/storage'
import { identity, sign, transcript, trustProof, verify } from '../src/shared/remote/identity'
import { stringifyRemote } from '../src/shared/remote/codec'
import { REMOTE_PROTOCOL, requestOf } from '../src/shared/remote/protocol'
import type { RemoteChannel, RemoteIdentity, RemoteRequest, RemoteResponse, RemoteTrust } from '../src/shared/remote/protocol'

vi.mock(import('../src/renderer/src/remote/transport'), async (original) => ({ ...await original(), remoteDial: vi.fn() }))
vi.mock('../src/renderer/src/remote/storage', () => ({ devicePublicKey: vi.fn(), signDevice: vi.fn(), rememberServer: vi.fn(async () => undefined) }))

function channel() {
  const requests: RemoteRequest[] = []
  let received: (text: string) => void = () => undefined
  const closed = new Set<() => void>()
  const binding = 'test transport binding'
  const link: RemoteChannel = {
    binding: Promise.resolve(binding),
    send: (text) => { requests.push(requestOf(text)) },
    onMessage: (heard) => { received = heard },
    onClose: (heard) => { closed.add(heard) },
    close: () => { for (const heard of closed) heard() },
  }
  const deliver = (response: RemoteResponse): void => received(stringifyRemote(response))
  return { link, requests, binding, deliver }
}

async function authenticate(link: ReturnType<typeof channel>, server: RemoteIdentity, trust: RemoteTrust): Promise<void> {
  link.deliver({ type: 'challenge', server: trust.server, nonce: 'server challenge', protocol: REMOTE_PROTOCOL, expires: 0 })
  await vi.waitFor(() => expect(link.requests.some((request) => request.type === 'hello')).toBe(true))
  const hello = link.requests.find((request) => request.type === 'hello')
  if (hello?.type !== 'hello') throw new Error('Client did not authenticate')
  const proof = transcript(trust.server.id, 'server challenge', hello.publicKey, hello.nonce, link.binding)
  expect(await verify(hello.publicKey, proof, hello.proof)).toBe(true)
  link.deliver({ type: 'trusted', trust, proof: await sign(server, trustProof(proof, trust)) })
  await vi.waitFor(() => expect(link.requests.some((request) => request.type === 'snapshot')).toBe(true))
  link.deliver({ type: 'snapshot', id: 1, snapshot: { server: trust.server, epoch: 'epoch', seq: 1, projects: [], sessions: [], manager: { state: 'off', queued: 0, threads: [] } } })
}

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

describe('remote workspace calls', () => {
  it('rejects an uncertain action on disconnect and never replays it after reconnecting', async () => {
    const server = await identity()
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    vi.mocked(devicePublicKey).mockResolvedValue(btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey)))))
    vi.mocked(signDevice).mockImplementation(async (text) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, new TextEncoder().encode(text))))))
    const trust: RemoteTrust = { server: { id: 'server', name: 'Server', publicKey: server.publicKey }, device: 'device', key: 'a'.repeat(43), signal: 'http://127.0.0.1:47932', projects: [], manager: true, full: true }
    const first = channel()
    const second = channel()
    vi.mocked(remoteDial).mockResolvedValueOnce(first.link).mockResolvedValueOnce(second.link)
    const connection = connectRemote(trust, 'Client', () => undefined, trust)
    try {
      await vi.waitFor(() => expect(remoteDial).toHaveBeenCalledTimes(1))
      await authenticate(first, server, trust)
      expect(rememberServer).toHaveBeenCalledWith(trust)
      vi.useFakeTimers()
      const uncertain = connection.call('chat:rename', 'session', 'Changed title')
      const rejection = expect(uncertain).rejects.toThrow(LINK_DOWN)
      first.link.close()
      await rejection
      const waiting = connection.call('chat:rename', 'session', 'Asked while down')
      await vi.advanceTimersByTimeAsync(2000)
      expect(remoteDial).toHaveBeenCalledTimes(2)
      vi.useRealTimers()
      await authenticate(second, server, trust)
      expect(first.requests.filter((request) => request.type === 'core-call')).toHaveLength(1)
      const renames = (requests: readonly RemoteRequest[]) => requests.filter((one) => one.type === 'core-call' && one.call.method === 'chat:rename')
      await vi.waitFor(() => expect(renames(second.requests)).toHaveLength(1))
      const held = renames(second.requests)[0]
      if (held?.type !== 'core-call') throw new Error('The held action was not sent')
      expect(held.call.args).toEqual(['session', 'Asked while down'])
      second.deliver({ type: 'core-result', id: held.id, value: undefined })
      await expect(waiting).resolves.toBeUndefined()
      const next = connection.call('chat:rename', 'session', 'New explicit action')
      const request = renames(second.requests)[1]
      if (request?.type !== 'core-call') throw new Error('Explicit action was not sent')
      second.deliver({ type: 'core-result', id: request.id, value: undefined })
      await expect(next).resolves.toBeUndefined()
      expect(renames(second.requests)).toHaveLength(2)
    } finally { connection.close() }
  })

  it('dials a saved computer again when it refuses or drops, and catches up on what was missed', async () => {
    const server = await identity()
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    vi.mocked(devicePublicKey).mockResolvedValue(btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey)))))
    vi.mocked(signDevice).mockImplementation(async (text) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, new TextEncoder().encode(text))))))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const trust: RemoteTrust = { server: { id: 'server', name: 'Server', publicKey: server.publicKey }, device: 'device', key: 'a'.repeat(43), signal: 'http://127.0.0.1:47932', projects: [], manager: true, full: true }
    const first = channel()
    const second = channel()
    vi.mocked(remoteDial).mockResolvedValueOnce(first.link).mockResolvedValueOnce(second.link)
    const states: string[] = []
    const connection = connectRemote(trust, 'Client', (view) => states.push(view.state), trust)
    const heard: string[] = []
    connection.on((event) => heard.push(event.name))
    try {
      await vi.waitFor(() => expect(remoteDial).toHaveBeenCalledTimes(1))
      await authenticate(first, server, trust)
      vi.useFakeTimers()
      first.deliver({ type: 'error', code: 'denied', message: 'GeckIt on the server is busy.' })
      await vi.advanceTimersByTimeAsync(2000)
      expect(remoteDial).toHaveBeenCalledTimes(2)
      vi.useRealTimers()
      expect(states).not.toContain('error')
      await authenticate(second, server, trust)
      const asked = second.requests.flatMap((one) => one.type === 'core-call' ? [one.call.method] : [])
      expect(asked).toEqual(expect.arrayContaining(['chat:list', 'manager:view', 'settings:get', 'lineup:state']))
      const list = second.requests.find((one) => one.type === 'core-call' && one.call.method === 'chat:list')
      if (list?.type !== 'core-call') throw new Error('No catch-up')
      second.deliver({ type: 'core-result', id: list.id, value: [] })
      await vi.waitFor(() => expect(heard).toContain('chat:sessions'))
    } finally { connection.close() }
  })

  it('says why a first connection failed', async () => {
    vi.mocked(devicePublicKey).mockResolvedValue('device key')
    vi.mocked(remoteDial).mockRejectedValueOnce(new Error('the server did not answer. Check that GeckIt is running there and the code is new.'))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const views: string[] = []
    const signal = { id: 'room', key: 'k', signal: 'http://127.0.0.1:47932' } as unknown as Parameters<typeof connectRemote>[0]
    connectRemote(signal, 'Client', (view) => views.push(`${view.state}: ${view.message}`))
    await vi.waitFor(() => expect(views.at(-1)).toBe('error: Could not connect: the server did not answer. Check that GeckIt is running there and the code is new.'))
  })
})

describe('a call made while the link is down', () => {
  it('fails with the link-down error after a minute', async () => {
    const server = await identity()
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    vi.mocked(devicePublicKey).mockResolvedValue(btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey)))))
    vi.mocked(signDevice).mockImplementation(async (text) => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, keys.privateKey, new TextEncoder().encode(text))))))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const trust: RemoteTrust = { server: { id: 'server', name: 'Server', publicKey: server.publicKey }, device: 'device', key: 'a'.repeat(43), signal: 'http://127.0.0.1:47932', projects: [], manager: true, full: true }
    const first = channel()
    vi.mocked(remoteDial).mockResolvedValueOnce(first.link).mockImplementation(() => new Promise(() => undefined))
    const connection = connectRemote(trust, 'Client', () => undefined, trust)
    try {
      await vi.waitFor(() => expect(remoteDial).toHaveBeenCalledTimes(1))
      await authenticate(first, server, trust)
      vi.useFakeTimers()
      first.link.close()
      const waiting = connection.call('chat:rename', 'session', 'Asked while down')
      const failed = expect(waiting).rejects.toThrow(LINK_DOWN)
      await vi.advanceTimersByTimeAsync(HOLD)
      await failed
    } finally { connection.close() }
  })
})
