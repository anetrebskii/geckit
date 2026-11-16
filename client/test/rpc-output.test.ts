import { EventEmitter } from 'node:events'

import { expect, it, vi } from 'vitest'

import { RpcOutput } from '../src/core/rpc-output'

class SlowSocket extends EventEmitter {
  writableLength = 0
  accepting = false
  readonly writes: Buffer[] = []
  readonly callbacks: ((error?: Error | null) => void)[] = []

  write(bytes: Buffer, callback: (error?: Error | null) => void): boolean {
    this.writes.push(bytes)
    this.callbacks.push(callback)
    return this.accepting
  }

  drain(): void { this.accepting = true; this.emit('drain') }
  get messages(): string[] { return this.writes.map((bytes) => bytes.toString()) }
}

it('waits for drain and retains the latest snapshot of each message in its original position', () => {
  const socket = new SlowSocket()
  const failed = vi.fn()
  const output = new RpcOutput(socket, failed)
  output.send(Buffer.from('in flight'))
  output.send(Buffer.from('a:old'), 'a')
  output.send(Buffer.from('b:old'), 'b')
  output.send(Buffer.from('a:latest'), 'a')
  output.send(Buffer.from('b:latest'), 'b')
  expect(socket.messages).toEqual(['in flight'])
  socket.drain()
  expect(socket.messages).toEqual(['in flight', 'a:latest', 'b:latest'])
  expect(failed).not.toHaveBeenCalled()
})

it('preserves snapshots around ordered events and replies and waits for the actual reply flush', () => {
  const socket = new SlowSocket()
  const output = new RpcOutput(socket, vi.fn())
  const flushed = vi.fn()
  output.send(Buffer.from('in flight'))
  output.send(Buffer.from('before question'), 'a')
  output.send(Buffer.from('question'))
  output.send(Buffer.from('after question'), 'a')
  output.send(Buffer.from('reply'), undefined, flushed)
  output.send(Buffer.from('after reply'), 'a')
  expect(flushed).not.toHaveBeenCalled()
  socket.drain()
  expect(socket.messages).toEqual(['in flight', 'before question', 'question', 'after question', 'reply', 'after reply'])
  expect(flushed).not.toHaveBeenCalled()
  socket.callbacks[4]?.()
  expect(flushed).toHaveBeenCalledOnce()
})

it('keeps replacement snapshots bounded and still rejects an irreducible queue over the limit', () => {
  const socket = new SlowSocket()
  const output = new RpcOutput(socket, vi.fn(), 12)
  output.send(Buffer.from('first'))
  for (let i = 0; i < 1000; i++) output.send(Buffer.from('12345678'), 'a')
  socket.writableLength = 2
  expect(() => output.send(Buffer.from('xxx'))).toThrow('output queue is full')
  socket.writableLength = 0
  output.send(Buffer.from('1234'))
  socket.drain()
  expect(socket.messages).toEqual(['first', '12345678', '1234'])
})

it('stops flushing when the socket blocks again and discards pending work on close', () => {
  const socket = new SlowSocket()
  const output = new RpcOutput(socket, vi.fn())
  output.send(Buffer.from('first'))
  output.send(Buffer.from('second'))
  output.send(Buffer.from('third'))
  socket.emit('drain')
  expect(socket.messages).toEqual(['first', 'second'])
  socket.emit('close')
  socket.drain()
  output.send(Buffer.from('fourth'))
  expect(socket.messages).toEqual(['first', 'second'])
})

it('reports a write failure while draining without letting it escape the event loop', () => {
  const socket = new SlowSocket()
  const failed = vi.fn()
  const output = new RpcOutput(socket, failed)
  output.send(Buffer.from('first'))
  output.send(Buffer.from('second'))
  const error = new Error('write failed')
  vi.spyOn(socket, 'write').mockImplementationOnce(() => { throw error })
  expect(() => socket.drain()).not.toThrow()
  expect(failed).toHaveBeenCalledWith(error)
})
