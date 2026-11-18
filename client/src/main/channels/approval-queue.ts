import type { ChannelActor, ChannelContext, ManagerDecision } from './channel-api'

export interface ApprovalPrompt extends Pick<ManagerDecision, 'id' | 'title' | 'choices'> {
  readonly message: string
}

interface ApprovalQueueOptions {
  readonly context: ChannelContext
  readonly thread: string
  readonly key: string
  readonly current: () => boolean
  readonly post: (decision: ManagerDecision) => Promise<string>
  readonly close: (prompt: ApprovalPrompt, note: string) => Promise<void>
  readonly notify: (text: string) => Promise<void>
  readonly failed: (error: Error) => void
}

const CLOSED = 'This request is no longer pending.'
const choiceOf = (decision: Pick<ManagerDecision, 'choices'>, text: string): string | undefined => {
  const exact = decision.choices.find((one) => one.value === text)
  if (exact !== undefined) return exact.value
  const matches = decision.choices.filter((one) => one.value.toLowerCase() === text.toLowerCase())
  return matches.length === 1 ? matches[0]?.value : undefined
}

export class ApprovalQueue {
  readonly #options: ApprovalQueueOptions
  readonly #answered = new Set<string>()
  #decisions: readonly ManagerDecision[] = []
  #prompt: ApprovalPrompt | undefined
  #answering = false
  #serial: Promise<void> = Promise.resolve()
  #loaded = false

  constructor(options: ApprovalQueueOptions) {
    this.#options = options
    const saved = options.context.store.get(`approval:${options.key}`)
    if (saved !== null && typeof saved === 'object' && 'id' in saved && 'title' in saved && 'message' in saved && 'choices' in saved && typeof saved['id'] === 'string' && typeof saved['title'] === 'string' && typeof saved['message'] === 'string' && Array.isArray(saved['choices'])) {
      const choices = saved['choices'].flatMap((one) => one !== null && typeof one === 'object' && 'label' in one && 'value' in one && typeof one['label'] === 'string' && typeof one['value'] === 'string' ? [{ label: one['label'], value: one['value'] }] : [])
      this.#prompt = { id: saved['id'], title: saved['title'], message: saved['message'], choices }
    }
  }

  get prompt(): ApprovalPrompt | undefined { return this.#loaded ? this.#prompt : undefined }

  matches(text: string): boolean { return this.#decisions.some((one) => choiceOf(one, text) !== undefined) }

  update(decisions: readonly ManagerDecision[]): void {
    const open = decisions.filter((one) => !this.#answered.has(one.id))
    this.#decisions = [...this.#decisions.flatMap((one) => open.find((next) => next.id === one.id) ?? []), ...open.filter((one) => !this.#decisions.some((previous) => previous.id === one.id))]
    this.#loaded = true
    this.#enqueue(() => this.#sync())
  }

  refresh(): void {
    const decisions = this.#options.context.conversations.decisions?.(this.#options.thread)
    if (decisions !== undefined) this.update(decisions)
  }

  clear(): void {
    this.#decisions = []
    this.#loaded = true
    const prompt = this.#prompt
    this.#save(undefined)
    this.#enqueue(async () => { if (prompt !== undefined) await this.#options.close(prompt, CLOSED) })
  }

  reply(text: string, received: ApprovalPrompt | undefined, by: ChannelActor, authorized: () => boolean): Promise<boolean> {
    const value = received === undefined ? undefined : choiceOf(received, text)
    if (value === undefined && !this.matches(text)) return Promise.resolve(false)
    if (received === undefined || value === undefined || this.#prompt?.id !== received.id || this.#prompt.message !== received.message || this.#answering || !this.#decisions.some((one) => one.id === received.id)) {
      return this.#options.notify(received === undefined ? 'Please wait for the next request before answering.' : CLOSED).then(() => true)
    }
    this.#answering = true
    const run = async (): Promise<void> => {
      let outcome: Awaited<ReturnType<NonNullable<ChannelContext['conversations']['decide']>>>
      try {
        if (!this.#options.current() || !authorized()) return
        const decide = this.#options.context.conversations.decide
        if (decide === undefined) throw new Error('Manager decision replies are unavailable.')
        outcome = await decide(this.#options.thread, received.id, value, { by, authorized: () => this.#options.current() && authorized() })
        if (outcome === undefined) throw new Error('Manager did not confirm this answer.')
      } catch (error) {
        this.#options.failed(error instanceof Error ? error : new Error(String(error)))
        await this.#options.notify('Could not record this answer. Try again.')
        return
      } finally { this.#answering = false }
      this.#answered.add(received.id)
      this.#decisions = this.#decisions.filter((one) => one.id !== received.id)
      this.#save(undefined)
      const closed = outcome === 'This request is no longer pending. Use /status to see current requests.'
      const label = received.choices.find((one) => one.value === value)?.label || value
      const note = closed ? CLOSED : `${by.name ?? by.id} chose ${label}. ${outcome}`
      await this.#options.close(received, note).catch(async (error: Error) => { this.#options.failed(error); await this.#options.notify(note) })
      await this.#sync()
    }
    const done = this.#serial.then(run)
    this.#serial = done.catch((error: Error) => this.#options.failed(error))
    return done.then(() => true)
  }

  async #sync(): Promise<void> {
    if (this.#answering || !this.#options.current()) return
    if (this.#prompt !== undefined && !this.#decisions.some((one) => one.id === this.#prompt?.id)) {
      const prompt = this.#prompt
      this.#save(undefined)
      await this.#options.close(prompt, CLOSED)
    }
    if (this.#prompt !== undefined || !this.#options.current()) return
    const decision = this.#decisions[0]
    if (decision === undefined) return
    const message = await this.#options.post(decision)
    const prompt = { id: decision.id, title: decision.title, choices: decision.choices, message }
    if (!this.#options.current() || !this.#decisions.some((one) => one.id === decision.id)) {
      await this.#options.close(prompt, CLOSED)
      if (this.#options.current()) await this.#sync()
      return
    }
    this.#save(prompt)
  }

  #save(prompt: ApprovalPrompt | undefined): void {
    const previous = this.#prompt
    this.#prompt = prompt
    const key = `approval:${this.#options.key}`
    if (prompt !== undefined) this.#options.context.store.set(key, { id: prompt.id, title: prompt.title, choices: prompt.choices.map((one) => ({ label: one.label, value: one.value })), message: prompt.message })
    else {
      const saved = this.#options.context.store.get(key)
      if (saved !== null && typeof saved === 'object' && 'message' in saved && saved.message === previous?.message) this.#options.context.store.set(key, undefined)
    }
  }

  #enqueue(run: () => Promise<void>): void {
    this.#serial = this.#serial.then(run).catch((error: Error) => this.#options.failed(error))
  }
}
