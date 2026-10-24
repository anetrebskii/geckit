import { TelegramFailure } from './telegram-bot'

/** Telegram expires an action after five seconds and clears it when a bot message arrives. */
export class TelegramTyping {
  private pending = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private request: AbortController | undefined
  private reassert = false
  private retryAt = 0
  private backoff = 4_000

  constructor(private readonly send: (signal: AbortSignal) => Promise<void>, private readonly signal: AbortSignal, private readonly now: () => number = Date.now) {
    signal.addEventListener('abort', () => this.update(false), { once: true })
  }

  update(pending: boolean): void {
    this.pending = pending && !this.signal.aborted
    if (!this.pending) {
      clearTimeout(this.timer)
      this.timer = undefined
      this.request?.abort()
      this.request = undefined
      this.reassert = false
      return
    }
    if (this.timer === undefined && this.request === undefined) this.schedule(0)
  }

  sent(): void {
    if (!this.pending) return
    clearTimeout(this.timer)
    this.timer = undefined
    if (this.request === undefined) this.schedule(0)
    else this.reassert = true
  }

  private schedule(delay: number): void {
    if (!this.pending) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.refresh()
    }, Math.max(delay, this.retryAt - this.now()))
    this.timer.unref()
  }

  private async refresh(): Promise<void> {
    if (!this.pending || this.signal.aborted) return
    const request = new AbortController()
    this.request = request
    let delay = 4_000
    try {
      await this.send(AbortSignal.any([this.signal, request.signal]))
      this.backoff = 4_000
      this.retryAt = 0
    } catch (error) {
      if (request.signal.aborted || this.signal.aborted) return
      delay = Math.max(this.backoff, error instanceof TelegramFailure ? (error.retryAfter ?? 0) * 1_000 : 0)
      this.backoff = Math.min(this.backoff * 2, 60_000)
      this.retryAt = this.now() + delay
    } finally {
      if (this.request === request) {
        this.request = undefined
        const next = this.reassert ? 0 : delay
        this.reassert = false
        this.schedule(next)
      }
    }
  }
}
