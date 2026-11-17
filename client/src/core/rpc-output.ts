interface OutputSocket {
  readonly writableLength: number
  write(bytes: Buffer, callback: (error?: Error | null) => void): boolean
  on(event: 'drain' | 'close', listener: () => void): unknown
}

interface Pending {
  bytes: Buffer
  readonly key: string | undefined
  readonly flushed: (() => void) | undefined
}

/** A key is only for replaceable display snapshots, never requests or replies. */
export class RpcOutput {
  readonly #socket: OutputSocket
  readonly #failed: (error: unknown) => void
  readonly #limit: number
  readonly #updates = new Map<string, Pending>()
  #pending: Pending[] = []
  #bytes = 0
  #blocked = false
  #closed = false

  constructor(socket: OutputSocket, failed: (error: unknown) => void, limit = 64 * 1024 * 1024) {
    this.#socket = socket
    this.#failed = failed
    this.#limit = limit
    socket.on('close', () => {
      this.#closed = true
      this.#pending = []
      this.#updates.clear()
      this.#bytes = 0
    })
    socket.on('drain', () => {
      if (this.#closed) return
      this.#blocked = false
      let sent = 0
      try {
        while (sent < this.#pending.length && !this.#blocked) {
          const next = this.#pending[sent++]!
          this.#bytes -= next.bytes.length
          if (next.key !== undefined && this.#updates.get(next.key) === next) this.#updates.delete(next.key)
          this.#write(next)
        }
      } catch (error) { this.#failed(error) }
      this.#pending.splice(0, sent)
    })
  }

  send(bytes: Buffer, key?: string, flushed?: () => void): void {
    if (this.#closed) return
    if (!this.#blocked) {
      this.#write({ bytes, key, flushed })
      return
    }
    const previous = key === undefined || flushed !== undefined ? undefined : this.#updates.get(key)
    const size = this.#bytes - (previous?.bytes.length ?? 0) + bytes.length
    if (size + this.#socket.writableLength > this.#limit) throw new Error('GeckIt service output queue is full.')
    this.#bytes = size
    if (previous !== undefined) {
      previous.bytes = bytes
      return
    }
    const next = { bytes, key, flushed }
    this.#pending.push(next)
    // An ordered event or reply is a barrier: a later snapshot must not move before it.
    if (key === undefined || flushed !== undefined) this.#updates.clear()
    else this.#updates.set(key, next)
  }

  #write(next: Pending): void {
    this.#blocked = !this.#socket.write(next.bytes, (error) => {
      if (error === undefined || error === null) next.flushed?.()
    })
  }
}
