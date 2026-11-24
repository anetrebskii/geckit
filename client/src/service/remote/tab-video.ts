import { randomBytes } from 'node:crypto'
import { WebSocketServer } from 'ws'
import { newKey } from '../../shared/pairing'
import type { TabVideoEvent } from '../../shared/live-view'

export async function tabVideo(emit: (event: TabVideoEvent) => boolean) {
  const key = newKey()
  const path = `/${randomBytes(32).toString('hex')}`
  if (!emit({ type: 'start', key })) return undefined

  const server = new WebSocketServer({ host: '127.0.0.1', port: 0, path, maxPayload: 2_000_000, perMessageDeflate: false })
  let active = true
  let connected = false
  const stop = (): void => {
    if (!active) return
    active = false
    for (const socket of server.clients) socket.terminate()
    server.close()
    emit({ type: 'stop', key })
  }
  server.on('connection', (socket) => {
    if (!active || connected) { socket.terminate(); return }
    connected = true
    socket.on('close', stop)
    socket.on('error', stop)
    socket.on('message', (bytes, binary) => {
      if (!active) return
      if (!binary || !Buffer.isBuffer(bytes) || bytes[0] !== 255 || bytes[1] !== 216 ||
        !emit({ type: 'frame', key, jpeg: bytes.toString('base64') })) stop()
    })
  })
  try {
    await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject) })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('No loopback address')
    return { key, endpoint: `ws://127.0.0.1:${address.port}${path}`, stop }
  } catch {
    stop()
    return undefined
  }
}
