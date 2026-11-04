import { timingSafeEqual } from 'node:crypto'
import { chmodSync, mkdirSync } from 'node:fs'
import { connect, createServer } from 'node:net'
import type { Socket } from 'node:net'
import { join } from 'node:path'
import { deserialize, serialize } from 'node:v8'

import { askedEndpoint } from '../cli/endpoint'

const VERSION = 1
const MAX_FRAME = 64 * 1024 * 1024
const HANDSHAKE_TIMEOUT = 5_000

type MethodsOf<T> = { [K in keyof T]: (...args: never[]) => void }
type Value = object | string | number | boolean | bigint | null | undefined
type EventName<T> = Extract<keyof T, string>

export type RpcEvent<Events extends MethodsOf<Events>> = {
  [K in EventName<Events>]: { readonly name: K; readonly args: Parameters<Events[K]> }
}[EventName<Events>]

interface RequestFrame { readonly kind: 'request'; readonly id: number; readonly name: string; readonly args: Value[] }
type ReplyFrame = Pick<RequestFrame, 'id'> & ({ readonly kind: 'result'; readonly value: Value } | { readonly kind: 'failure'; readonly error: string })
type EventFrame = Pick<RequestFrame, 'name' | 'args'> & { readonly kind: 'event' }
type Frame = RequestFrame | ReplyFrame | EventFrame | { readonly kind: 'hello'; readonly version: number; readonly token: string } | { readonly kind: 'accepted' } | { readonly kind: 'rejected'; readonly error: string }

export interface RpcClient<Methods extends MethodsOf<Methods>> {
  call<K extends EventName<Methods>>(method: K, ...args: Parameters<Methods[K]>): Promise<Awaited<ReturnType<Methods[K]>>>
  close(): void
  readonly closed: Promise<void>
}

export interface RpcServer<Events extends MethodsOf<Events>> {
  readonly ready: Promise<void>
  readonly connections: number
  broadcast<K extends EventName<Events>>(event: K, ...args: Parameters<Events[K]>): void
  close(): Promise<void>
}

export function rpcEndpoint(directory: string): string {
  return process.platform === 'win32' ? `${askedEndpoint(directory)}-control` : join(directory, 'control.sock')
}

function frame(bytes: Buffer): Frame {
  const value: unknown = deserialize(bytes)
  if (value === null || typeof value !== 'object' || !('kind' in value)) throw new Error('Invalid GeckIt service frame.')
  if (value.kind === 'accepted') return { kind: value.kind }
  if (value.kind === 'hello' && 'version' in value && typeof value.version === 'number' && 'token' in value && typeof value.token === 'string') return { kind: value.kind, version: value.version, token: value.token }
  if (value.kind === 'rejected' && 'error' in value && typeof value.error === 'string') return { kind: value.kind, error: value.error }
  if ((value.kind === 'request' || value.kind === 'event') && 'name' in value && typeof value.name === 'string' && 'args' in value && Array.isArray(value.args)) {
    if (value.kind === 'event') return { kind: value.kind, name: value.name, args: value.args as Value[] }
    if ('id' in value && typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id > 0) return { kind: value.kind, id: value.id, name: value.name, args: value.args as Value[] }
  }
  if ('id' in value && typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id > 0) {
    if (value.kind === 'result' && 'value' in value) return { kind: value.kind, id: value.id, value: value.value as Value }
    if (value.kind === 'failure' && 'error' in value && typeof value.error === 'string') return { kind: value.kind, id: value.id, error: value.error }
  }
  throw new Error('Invalid GeckIt service frame.')
}

function send(socket: Socket, value: Frame, flushed?: () => void): boolean {
  if (socket.destroyed || !socket.writable) return false
  try {
    const body = serialize(value)
    if (body.length > MAX_FRAME || socket.writableLength > MAX_FRAME) throw new Error('GeckIt service frame is too large.')
    const size = Buffer.allocUnsafe(4)
    size.writeUInt32BE(body.length)
    socket.write(Buffer.concat([size, body]), (error) => { if (error === undefined || error === null) flushed?.() })
    return true
  } catch (error) {
    socket.destroy(error instanceof Error ? error : new Error(String(error)))
    return false
  }
}

function receive(socket: Socket, accept: (message: Frame) => void): void {
  let rest: Buffer = Buffer.alloc(0)
  socket.on('data', (part: Buffer) => {
    rest = rest.length ? Buffer.concat([rest, part]) : part
    try {
      while (rest.length >= 4 && !socket.destroyed) {
        const length = rest.readUInt32BE()
        if (length === 0 || length > MAX_FRAME) throw new Error('Invalid GeckIt service frame size.')
        if (rest.length < length + 4) break
        const body = rest.subarray(4, length + 4)
        rest = rest.subarray(length + 4)
        accept(frame(body))
      }
    } catch (error) {
      socket.destroy(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

function matches(actual: string, expected: string): boolean {
  const left = Buffer.from(actual)
  const right = Buffer.from(expected)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function listenRpc<Methods extends MethodsOf<Methods>, Events extends MethodsOf<Events>>(directory: string, token: string, methods: Methods, onConnect?: () => void, onAnswered?: (name: EventName<Methods>) => void): RpcServer<Events> {
  const sockets = new Set<Socket>()
  const authenticated = new Set<Socket>()
  let closing: Promise<void> | undefined
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const server = createServer((socket) => {
    sockets.add(socket)
    const timer = setTimeout(() => socket.destroy(new Error('GeckIt service authentication timed out.')), HANDSHAKE_TIMEOUT)
    const pending = new Set<number>()
    socket.on('error', () => undefined)
    socket.on('close', () => { clearTimeout(timer); sockets.delete(socket); authenticated.delete(socket) })
    receive(socket, (message) => {
      if (!authenticated.has(socket)) {
        if (message.kind !== 'hello' || message.version !== VERSION || !matches(message.token, token)) {
          send(socket, { kind: 'rejected', error: 'GeckIt service authentication failed.' })
          socket.end()
          return
        }
        clearTimeout(timer)
        authenticated.add(socket)
        send(socket, { kind: 'accepted' })
        onConnect?.()
        return
      }
      if (message.kind !== 'request' || pending.has(message.id)) { socket.destroy(new Error('Invalid GeckIt service request.')); return }
      if (!Object.hasOwn(methods, message.name) || Object.hasOwn(Object.prototype, message.name)) { send(socket, { kind: 'failure', id: message.id, error: 'Unknown GeckIt service method.' }); return }
      const method = methods[message.name as keyof Methods]
      if (typeof method !== 'function') { send(socket, { kind: 'failure', id: message.id, error: 'Unknown GeckIt service method.' }); return }
      pending.add(message.id)
      void Promise.resolve().then(() => method(...message.args as never[]) as Value | Promise<Value>).then(
        (value) => { send(socket, { kind: 'result', id: message.id, value }, () => onAnswered?.(message.name as EventName<Methods>)) },
        (error: Error) => { send(socket, { kind: 'failure', id: message.id, error: error instanceof Error ? error.message : String(error) }) },
      ).finally(() => pending.delete(message.id))
    })
  })
  const ready = new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(rpcEndpoint(directory), () => {
      try {
        if (process.platform !== 'win32') chmodSync(rpcEndpoint(directory), 0o600)
        resolve()
      } catch (error) { reject(error) }
    })
  })
  return {
    ready,
    get connections() { return authenticated.size },
    broadcast: (name, ...args) => {
      for (const socket of authenticated) send(socket, { kind: 'event', name, args: args as Value[] })
    },
    close: () => {
      if (closing) return closing
      closing = ready.catch(() => undefined).then(() => new Promise<void>((resolve, reject) => {
        if (!server.listening) { resolve(); return }
        server.close((error) => error ? reject(error) : resolve())
        for (const socket of sockets) socket.destroy()
      }))
      return closing
    },
  }
}

export function connectRpc<Methods extends MethodsOf<Methods>, Events extends MethodsOf<Events>>(directory: string, token: string, onEvent?: (event: RpcEvent<Events>) => void): Promise<RpcClient<Methods>> {
  return new Promise((resolve, reject) => {
    const socket = connect(rpcEndpoint(directory))
    let accepted = false
    let nextId = 0
    let failure = new Error('GeckIt service disconnected.')
    const pending = new Map<number, { resolve: (value: Value) => void; reject: (error: Error) => void }>()
    let finish: () => void = () => undefined
    const closed = new Promise<void>((done) => { finish = done })
    const timer = setTimeout(() => socket.destroy(new Error('GeckIt service authentication timed out.')), HANDSHAKE_TIMEOUT)
    socket.once('connect', () => { send(socket, { kind: 'hello', version: VERSION, token }) })
    socket.on('error', (error: NodeJS.ErrnoException) => { failure = accepted && error.code !== undefined ? new Error('GeckIt service disconnected.', { cause: error }) : error })
    socket.on('close', () => {
      clearTimeout(timer)
      if (!accepted) reject(failure)
      for (const request of pending.values()) request.reject(failure)
      pending.clear()
      finish()
    })
    receive(socket, (message) => {
      if (!accepted) {
        if (message.kind === 'rejected') { socket.destroy(new Error(message.error)); return }
        if (message.kind !== 'accepted') { socket.destroy(new Error('Invalid GeckIt service handshake.')); return }
        accepted = true
        clearTimeout(timer)
        resolve({
          closed,
          close: () => { socket.destroy() },
          call: (name, ...args) => new Promise((done, failed) => {
            if (socket.destroyed) { failed(failure); return }
            const id = ++nextId
            pending.set(id, { resolve: (value) => done(value as Awaited<ReturnType<Methods[typeof name]>>), reject: failed })
            send(socket, { kind: 'request', id, name, args: args as Value[] })
          }),
        })
        return
      }
      if (message.kind === 'event') { onEvent?.({ name: message.name, args: message.args } as never); return }
      if (message.kind !== 'result' && message.kind !== 'failure') { socket.destroy(new Error('Invalid GeckIt service response.')); return }
      const request = pending.get(message.id)
      if (!request) { socket.destroy(new Error('Unexpected GeckIt service response.')); return }
      pending.delete(message.id)
      if (message.kind === 'failure') request.reject(new Error(message.error))
      else request.resolve(message.value)
    })
  })
}
