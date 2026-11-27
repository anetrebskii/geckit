import { once } from 'node:events'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { connect } from 'node:net'
import type { Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { deserialize, serialize } from 'node:v8'

import { afterEach, expect, it, vi } from 'vitest'

import { connectRpc, listenRpc, rpcEndpoint } from '../src/core/rpc'
import type { RpcEvent } from '../src/core/rpc'
import type { SessionItems } from '../src/shared/api'

interface Methods {
  echo(value: { bytes: Buffer; view: Uint8Array; absent: undefined }): Promise<{ bytes: Buffer; view: Uint8Array; absent: undefined }>
  increment(): number
  fail(): never
  wait(): Promise<string>
}
interface Events { changed(value: { count: number; extra: undefined }): void }

const cleanup: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose()
})

async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'geckit-rpc-'))
  cleanup.push(() => rm(path, { recursive: true, force: true }))
  return path
}

function methods(): Methods {
  let count = 0
  return {
    echo: async (value) => value,
    increment: () => ++count,
    fail: () => { throw new Error('A task failed.') },
    wait: () => new Promise<string>(() => undefined),
  }
}

function send(socket: Socket, message: object): void {
  const body = serialize(message)
  const header = Buffer.alloc(4)
  header.writeUInt32BE(body.length)
  socket.write(Buffer.concat([header, body]))
}

it('authenticates a private persistent socket and preserves bytes, typed events and undefined', async () => {
  const path = await directory()
  const server = listenRpc<Methods, Events>(path, 'secret', methods())
  cleanup.push(server.close)
  await server.ready
  if (process.platform !== 'win32') expect((await stat(rpcEndpoint(path))).mode & 0o777).toBe(0o600)
  const events: RpcEvent<Events>[] = []
  const client = await connectRpc<Methods, Events>(path, 'secret', (event) => events.push(event))
  cleanup.push(async () => { client.close(); await client.closed })
  const value = { bytes: Buffer.from([0, 128, 255]), view: new Uint8Array([7, 9]), absent: undefined }
  const result = await client.call('echo', value)
  expect(result).toEqual(value)
  expect(Buffer.isBuffer(result.bytes)).toBe(true)
  expect(result.view).toBeInstanceOf(Uint8Array)
  expect(Object.hasOwn(result, 'absent')).toBe(true)
  expect(await client.call('increment')).toBe(1)
  expect(await client.call('increment')).toBe(2)
  await expect(client.call('fail')).rejects.toThrow('A task failed.')
  server.broadcast('changed', { count: 2, extra: undefined })
  await expect.poll(() => events).toEqual([{ name: 'changed', args: [{ count: 2, extra: undefined }] }])
})

it('round-trips large fragmented frames without repeatedly copying the accumulated payload', async () => {
  const path = await directory()
  const server = listenRpc<Methods, Events>(path, 'secret', methods())
  cleanup.push(server.close)
  await server.ready
  const client = await connectRpc<Methods, Events>(path, 'secret')
  cleanup.push(async () => { client.close(); await client.closed })
  const value: Parameters<Methods['echo']>[0] = { bytes: Buffer.alloc(8 * 1024 * 1024, 123), view: new Uint8Array([7, 9]), absent: undefined }
  const concat = vi.spyOn(Buffer, 'concat')
  try {
    const result = await client.call('echo', value)
    const copied = concat.mock.calls.reduce((total, [buffers]) => total + buffers.reduce((sum, bytes) => sum + bytes.byteLength, 0), 0)
    expect(result).toEqual(value)
    expect(copied).toBeLessThan(value.bytes.length * 6)
    expect(await client.call('increment')).toBe(1)
  } finally { concat.mockRestore() }
})

it('rejects wrong credentials, incompatible versions and prototype methods without affecting the owner', async () => {
  const path = await directory()
  const server = listenRpc<Methods, Events>(path, 'secret', methods())
  cleanup.push(server.close)
  await server.ready
  await expect(connectRpc<Methods, Events>(path, 'wrong')).rejects.toThrow('authentication failed')
  const client = await connectRpc<Methods & { toString(): string }, Events>(path, 'secret')
  cleanup.push(async () => { client.close(); await client.closed })
  await expect(client.call('toString')).rejects.toThrow('Unknown GeckIt service method.')
  const incompatible = connect(rpcEndpoint(path))
  incompatible.on('error', () => undefined)
  await once(incompatible, 'connect')
  send(incompatible, { kind: 'hello', version: 9000, token: 'secret' })
  incompatible.resume()
  await once(incompatible, 'close')
  expect(await client.call('increment')).toBe(1)
  const duplicate = listenRpc<Methods, Events>(path, 'secret', methods())
  await expect(duplicate.ready).rejects.toMatchObject({ code: 'EADDRINUSE' })
  await duplicate.close()
  expect(await client.call('increment')).toBe(2)
})

it('accepts byte-split headers and bodies followed by multiple frames in one packet', async () => {
  const path = await directory()
  const table = methods()
  const increment = vi.spyOn(table, 'increment')
  const server = listenRpc<Methods, Events>(path, 'secret', table)
  cleanup.push(server.close)
  await server.ready
  const socket = connect(rpcEndpoint(path))
  socket.on('error', () => undefined)
  await once(socket, 'connect')
  const hello = serialize({ kind: 'hello', version: 1, token: 'secret' })
  const header = Buffer.alloc(4)
  header.writeUInt32BE(hello.length)
  const accepted = once(socket, 'data')
  for (const byte of Buffer.concat([header, hello])) {
    socket.write(Buffer.from([byte]))
    await setImmediate()
  }
  await accepted
  const requests = [1, 2].map((id) => {
    const body = serialize({ kind: 'request', id, name: 'increment', args: [] })
    const size = Buffer.alloc(4)
    size.writeUInt32BE(body.length)
    return Buffer.concat([size, body])
  })
  socket.write(Buffer.concat(requests))
  await expect.poll(() => increment.mock.calls.length).toBe(2)
  expect(increment).toHaveLastReturnedWith(2)
  socket.destroy()
  await once(socket, 'close')
})

it('rejects pending calls on disconnect without replaying them after reconnect', async () => {
  const path = await directory()
  const table = methods()
  const server = listenRpc<Methods, Events>(path, 'secret', table)
  cleanup.push(server.close)
  await server.ready
  const client = await connectRpc<Methods, Events>(path, 'secret')
  expect(await client.call('increment')).toBe(1)
  const pending = expect(client.call('wait')).rejects.toThrow('disconnected')
  client.close()
  await pending
  await client.closed
  await expect(client.call('increment')).rejects.toThrow('disconnected')
  const next = await connectRpc<Methods, Events>(path, 'secret')
  expect(await next.call('increment')).toBe(2)
  const disconnected = expect(next.call('wait')).rejects.toThrow('disconnected')
  await server.close()
  await disconnected
  await next.closed
})

it('rejects an oversized reply without disconnecting other calls', async () => {
  const path = await directory()
  const table = { ...methods(), history: () => Buffer.alloc(64 * 1024 * 1024) }
  const server = listenRpc<typeof table, Events>(path, 'secret', table)
  cleanup.push(server.close)
  await server.ready
  const client = await connectRpc<typeof table, Events>(path, 'secret')
  cleanup.push(async () => { client.close(); await client.closed })
  await Promise.all([
    expect(client.call('history')).rejects.toThrow('GeckIt service frame is too large.'),
    expect(client.call('increment')).resolves.toBe(1),
  ])
  await expect(client.call('increment')).resolves.toBe(2)
})

it('rejects malformed and oversized frames and accepts split frames on another connection', async () => {
  const path = await directory()
  const server = listenRpc<Methods, Events>(path, 'secret', methods())
  cleanup.push(server.close)
  await server.ready
  for (const bytes of [Buffer.from([0, 0, 0, 1, 0]), Buffer.from([4, 0, 0, 1])]) {
    const socket = connect(rpcEndpoint(path))
    socket.on('error', () => undefined)
    await once(socket, 'connect')
    socket.write(bytes)
    await once(socket, 'close')
  }
  const socket = connect(rpcEndpoint(path))
  socket.on('error', () => undefined)
  await once(socket, 'connect')
  const body = serialize({ kind: 'hello', version: 1, token: 'secret' })
  const header = Buffer.alloc(4)
  header.writeUInt32BE(body.length)
  socket.write(header.subarray(0, 2))
  socket.write(Buffer.concat([header.subarray(2), body.subarray(0, 3)]))
  socket.write(body.subarray(3))
  await once(socket, 'data')
  socket.destroy()
  await once(socket, 'close')
  const client = await connectRpc<Methods, Events>(path, 'secret')
  expect(await client.call('increment')).toBe(1)
  client.close()
  await client.closed
})

it('delivers the final large streamed message without disconnecting a slow reader', async () => {
  const path = await directory()
  interface StreamingEvents { 'chat:items'(value: { id: string; items: { id: string; kind: string; text: string }[] }): void }
  const server = listenRpc<Methods, StreamingEvents>(path, 'secret', methods())
  cleanup.push(server.close)
  await server.ready
  const socket = connect(rpcEndpoint(path))
  socket.on('error', () => undefined)
  cleanup.push(async () => { socket.destroy() })
  await once(socket, 'connect')
  send(socket, { kind: 'hello', version: 1, token: 'secret' })
  await once(socket, 'data')
  socket.pause()
  const messages: { kind: string; args?: { items: { text: string }[] }[]; value?: number }[] = []
  let rest: Buffer = Buffer.alloc(0)
  socket.on('data', (part: Buffer) => {
    rest = Buffer.concat([rest, part])
    while (rest.length >= 4 && rest.length >= rest.readUInt32BE() + 4) {
      const length = rest.readUInt32BE()
      messages.push(deserialize(rest.subarray(4, length + 4)) as typeof messages[number])
      rest = rest.subarray(length + 4)
    }
  })
  const text = 'x'.repeat(100_000)
  for (let i = 0; i < 1000; i++) server.broadcast('chat:items', { id: 'session-a', items: [{ id: 'message-a', kind: 'theirs', text: `${text}${i}` }] })
  // The reply must stay behind the final snapshot and remain callable on the same connection.
  send(socket, { kind: 'request', id: 1, name: 'increment', args: [] })
  socket.resume()
  await expect.poll(() => messages.some((message) => message.kind === 'result' && message.value === 1)).toBe(true)
  expect(socket.destroyed).toBe(false)
  const events = messages.filter((message) => message.kind === 'event')
  expect(events.length).toBeLessThan(10)
  expect(events.at(-1)?.args?.[0]?.items[0]?.text).toBe(`${text}999`)
  expect(messages.at(-1)).toMatchObject({ kind: 'result', value: 1 })
})

it('preserves deletions, permission cards, independent sessions and payload snapshots while coalescing', async () => {
  const path = await directory()
  interface Updates {
    'chat:items'(value: { id: string; items: { id: string; kind: string; text: string }[]; gone?: string[] }): void
  }
  const server = listenRpc<Methods, Updates>(path, 'secret', methods())
  cleanup.push(server.close)
  await server.ready
  const events: RpcEvent<Updates>[] = []
  const client = await connectRpc<Methods, Updates>(path, 'secret', (event) => events.push(event))
  cleanup.push(async () => { client.close(); await client.closed })
  const update = (session: string, text: string): Parameters<Updates['chat:items']>[0] => ({ id: session, items: [{ id: 'same-message-id', kind: 'thought', text }] })
  // Large enough to fill the socket buffer on every platform, so the following snapshots queue behind it.
  const large = 'x'.repeat(8_000_000)
  server.broadcast('chat:items', update('a', large))
  server.broadcast('chat:items', update('a', 'old'))
  server.broadcast('chat:items', update('b', 'other session'))
  server.broadcast('chat:items', update('a', 'before deletion'))
  server.broadcast('chat:items', { id: 'a', items: [], gone: ['same-message-id'] })
  server.broadcast('chat:items', { id: 'a', items: [{ id: 'permission', kind: 'card', text: 'ask' }] })
  server.broadcast('chat:items', { id: 'a', items: [{ id: 'permission', kind: 'card', text: 'answered' }] })
  const mutable = update('a', 'after deletion')
  server.broadcast('chat:items', mutable)
  mutable.items[0]!.text = 'mutated after broadcast'
  await expect.poll(() => events.length).toBe(7)
  expect(events.map((event) => event.args[0])).toEqual([
    update('a', large), update('a', 'before deletion'), update('b', 'other session'),
    { id: 'a', items: [], gone: ['same-message-id'] },
    { id: 'a', items: [{ id: 'permission', kind: 'card', text: 'ask' }] },
    { id: 'a', items: [{ id: 'permission', kind: 'card', text: 'answered' }] },
    update('a', 'after deletion'),
  ])
  expect(await client.call('increment')).toBe(1)
})

it.each(['chat:items', 'manager:items'] as const)('keeps the latest item when its display kind changes on %s', async (channel) => {
  const path = await directory()
  interface Updates {
    'chat:items'(value: SessionItems): void
    'manager:items'(value: SessionItems): void
  }
  const server = listenRpc<Methods, Updates>(path, 'secret', methods())
  cleanup.push(server.close)
  await server.ready
  const events: RpcEvent<Updates>[] = []
  const client = await connectRpc<Methods, Updates>(path, 'secret', (event) => events.push(event))
  cleanup.push(async () => { client.close(); await client.closed })
  server.broadcast(channel, { id: 'session', items: [{ id: 'item', kind: 'theirs', text: 'x'.repeat(100_000) }] })
  server.broadcast(channel, { id: 'session', items: [{ id: 'item', kind: 'thought', text: 'old' }] })
  server.broadcast(channel, { id: 'session', items: [{ id: 'item', kind: 'did', what: 'intermediate' }] })
  server.broadcast(channel, { id: 'session', items: [{ id: 'item', kind: 'thought', text: 'latest' }] })
  await expect.poll(() => events.at(-1)?.args[0].items[0]).toEqual({ id: 'item', kind: 'thought', text: 'latest' })
  expect(await client.call('increment')).toBe(1)
})
