import { once } from 'node:events'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { connect } from 'node:net'
import type { Socket } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { serialize } from 'node:v8'

import { afterEach, expect, it, vi } from 'vitest'

import { connectRpc, listenRpc, rpcEndpoint } from '../src/core/rpc'
import type { RpcEvent } from '../src/core/rpc'

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
