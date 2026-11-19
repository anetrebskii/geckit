import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { savedServers } from '../src/renderer/src/remote/storage'
import { roomOf } from '../src/shared/pairing'
import type { RemoteTrust } from '../src/shared/remote/protocol'

vi.mock('../src/renderer/src/remote/storage', () => ({ savedServers: vi.fn() }))

const token = 'a'.repeat(64)
const trust: RemoteTrust = {
  server: { id: 'a', name: 'Computer A', publicKey: 'key' },
  device: 'phone', key: 'b'.repeat(43), signal: '', projects: [], manager: true, full: true,
}
const other: RemoteTrust = { ...trust, server: { ...trust.server, id: 'b', name: 'Computer B' }, key: 'c'.repeat(43) }

const post = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.resetModules()
  post.mockReset().mockResolvedValue(new Response(null, { status: 204 }))
  vi.mocked(savedServers).mockResolvedValue([trust, other])
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  })
  vi.stubGlobal('fetch', post)
})
afterEach(() => { vi.unstubAllGlobals() })

describe('iPhone push selection', () => {
  it('keeps the successful source across launches, switches it and clears it only on removal', async () => {
    const first = await import('../../mobile/src/push-route')
    first.setPushRouteToken(token.toUpperCase())
    expect(post).not.toHaveBeenCalled()
    await first.selectPushComputer(trust.server.id)
    const roomA = await roomOf(trust.key)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]?.[1]?.body).toContain(`"token":"${token}"`)
    expect(post.mock.calls[0]?.[1]?.body).toContain(`"room":"${roomA}"`)

    vi.resetModules()
    const reopened = await import('../../mobile/src/push-route')
    reopened.setPushRouteToken(token)
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(2))
    expect(post.mock.calls[1]?.[1]?.body).toBe(post.mock.calls[0]?.[1]?.body)
    await reopened.selectPushComputer(other.server.id)
    const roomB = await roomOf(other.key)
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(3))
    expect(post.mock.calls[2]?.[1]?.body).toContain(roomB)
    reopened.forgetPushComputer(trust.server.id)
    expect(post).toHaveBeenCalledTimes(3)
    reopened.forgetPushComputer(other.server.id)
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(4))
    expect(post.mock.calls[3]?.[1]?.body).toContain('"room":null')
  })

  it('keeps the newest selection when a previously selected computer resolves later', async () => {
    const phone = await import('../../mobile/src/push-route')
    let finish: (servers: RemoteTrust[]) => void = () => undefined
    vi.mocked(savedServers).mockReturnValueOnce(new Promise((resolve) => { finish = resolve }))
    phone.setPushRouteToken(token)
    const earlier = phone.selectPushComputer(trust.server.id)
    await phone.selectPushComputer(other.server.id)
    const room = await roomOf(other.key)
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    expect(post.mock.calls[0]?.[1]?.body).toContain(room)
    finish([trust])
    await earlier
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('resends a pending selection on reconnect after a relay error', async () => {
    const phone = await import('../../mobile/src/push-route')
    post.mockResolvedValueOnce(new Response(null, { status: 503 }))
    await phone.selectPushComputer(trust.server.id)
    phone.setPushRouteToken(token)
    await vi.waitFor(() => expect(post).toHaveBeenCalledTimes(1))
    await phone.syncPushRoute()
    expect(post).toHaveBeenCalledTimes(2)
    expect(post.mock.calls[1]?.[1]?.body).toBe(post.mock.calls[0]?.[1]?.body)
    await phone.syncPushRoute()
    expect(post).toHaveBeenCalledTimes(2)
  })
})
