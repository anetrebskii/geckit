import { chmodSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import type { Server, Socket } from 'node:net'

import { askedEndpoint, endpointOnDisk } from '../cli/endpoint'

const MAX_REQUEST_BYTES = 2 * 1024 * 1024

export function serveLocal<Request, Answer>(directory: string, answer: (request: Request, gone: AbortSignal) => Promise<Answer>): { readonly server: Server; readonly ready: Promise<void>; readonly close: () => Promise<void> } {
  const path = askedEndpoint(directory)
  const sockets = new Set<Socket>()
  const pending = new Set<Promise<void>>()
  const server = createServer((socket) => {
    sockets.add(socket)
    const gone = new AbortController()
    socket.on('close', () => { gone.abort(); sockets.delete(socket) })
    let rest = ''
    let received = false
    socket.setEncoding('utf8')
    socket.setTimeout(60_000, () => { if (!received) socket.destroy() })
    socket.on('error', () => undefined)
    const fail = (error: string): void => { socket.end(`${JSON.stringify({ ok: false, error })}\n`) }
    socket.on('data', (part: string) => {
      if (received) return
      rest += part
      if (Buffer.byteLength(rest) > MAX_REQUEST_BYTES) { received = true; fail('GeckIt request is too large.'); return }
      const end = rest.indexOf('\n')
      if (end < 0) return
      received = true
      let request: Request
      try { request = JSON.parse(rest.slice(0, end)) as Request }
      catch { fail('That was not a request GeckIt reads.'); return }
      rest = ''
      const work = Promise.resolve().then(() => answer(request, gone.signal)).then(
        (result) => { socket.end(`${JSON.stringify(result)}\n`) },
        (error: Error) => fail(error instanceof Error ? error.message : String(error)),
      ).finally(() => pending.delete(work))
      pending.add(work)
    })
  })
  let listening = false
  const ready = new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(path, () => {
      listening = true
      try {
        if (endpointOnDisk()) chmodSync(path, 0o600)
        resolve()
      } catch (error) { reject(error) }
    })
  })
  return {
    server,
    ready,
    close: async () => {
      const closed = server.listening ? new Promise<void>((resolve, reject) => server.close((error) => error === undefined ? resolve() : reject(error))) : Promise.resolve()
      for (const socket of sockets) socket.destroy()
      await Promise.allSettled(pending)
      await closed
      if (listening && endpointOnDisk()) rmSync(path, { force: true })
    },
  }
}
