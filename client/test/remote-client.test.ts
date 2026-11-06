import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectRemote } from '../src/renderer/src/remote/client'
import { remoteDial } from '../src/renderer/src/remote/transport'
import { deviceIdentity, rememberServer } from '../src/renderer/src/remote/storage'
import { identity, sign, transcript, trustProof } from '../src/shared/remote/identity'
import { stringifyRemote } from '../src/shared/remote/codec'
import { REMOTE_PROTOCOL, requestOf } from '../src/shared/remote/protocol'
import type { RemoteChannel, RemoteIdentity, RemoteRequest, RemoteResponse, RemoteTrust } from '../src/shared/remote/protocol'

vi.mock('../src/renderer/src/remote/transport', () => ({ remoteDial: vi.fn() }))
vi.mock('../src/renderer/src/remote/storage', () => ({ deviceIdentity: vi.fn(), rememberServer: vi.fn(async () => undefined) }))

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
  link.deliver({ type: 'trusted', trust, proof: await sign(server, trustProof(proof, trust)) })
  await vi.waitFor(() => expect(link.requests.some((request) => request.type === 'snapshot')).toBe(true))
  link.deliver({ type: 'snapshot', id: 1, snapshot: { server: trust.server, epoch: 'epoch', seq: 1, projects: [], sessions: [], manager: { state: 'off', queued: 0, threads: [] } } })
}

afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

describe('remote workspace calls', () => {
  it('rejects an uncertain action on disconnect and never replays it after reconnecting', async () => {
    const server = await identity()
    const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    vi.mocked(deviceIdentity).mockResolvedValue({ publicKey: btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('spki', keys.publicKey)))), privateKey: keys.privateKey, wrapping: await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']), servers: [] })
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
      const rejection = expect(uncertain).rejects.toThrow('Connection lost. Check the server before retrying this action.')
      first.link.close()
      await rejection
      await expect(connection.call('chat:rename', 'session', 'Another title')).rejects.toThrow('Connect to this server')
      await vi.advanceTimersByTimeAsync(2000)
      expect(remoteDial).toHaveBeenCalledTimes(2)
      vi.useRealTimers()
      await authenticate(second, server, trust)
      expect(first.requests.filter((request) => request.type === 'core-call')).toHaveLength(1)
      expect(second.requests.filter((request) => request.type === 'core-call')).toHaveLength(0)
      const next = connection.call('chat:rename', 'session', 'New explicit action')
      const request = second.requests.find((one) => one.type === 'core-call')
      if (request?.type !== 'core-call') throw new Error('Explicit action was not sent')
      second.deliver({ type: 'core-result', id: request.id, value: undefined })
      await expect(next).resolves.toBeUndefined()
      expect(second.requests.filter((one) => one.type === 'core-call')).toHaveLength(1)
    } finally { connection.close() }
  })
})
