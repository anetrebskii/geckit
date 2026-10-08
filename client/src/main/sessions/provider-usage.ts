import type { ClaudeModel, ProviderUsage, SessionProvider } from '../../shared/api'
import { providerQuotas } from '../../shared/provider-usage'
import type { LlmProvider, ProviderLimits } from './provider'

interface Measurement {
  readonly windows: Map<string, number | undefined>
  usage: ProviderUsage
  revision: number
  measured: number
  pending?: Promise<void> | undefined
}

export class ProviderMeasurements {
  readonly #all = new Map<SessionProvider, Measurement>()
  readonly #now: () => number
  readonly #changed: (provider: SessionProvider, limits: ProviderLimits) => void

  constructor(now: () => number, changed: (provider: SessionProvider, limits: ProviderLimits) => void) {
    this.#now = now
    this.#changed = changed
  }

  #entry(provider: SessionProvider): Measurement {
    let entry = this.#all.get(provider)
    if (entry === undefined) {
      entry = { windows: new Map(), usage: {}, revision: 0, measured: -Infinity }
      this.#all.set(provider, entry)
    }
    return entry
  }

  usage(provider: SessionProvider): ProviderUsage {
    return this.#entry(provider).usage
  }

  window(provider: SessionProvider, model: string): number | undefined {
    return this.#entry(provider).windows.get(model)
  }

  has(provider: SessionProvider, model: string): boolean {
    return this.#entry(provider).windows.has(model)
  }

  models(provider: SessionProvider, models: readonly ClaudeModel[] | undefined): void {
    for (const model of models ?? []) {
      if (model.contextWindow === undefined) continue
      this.setWindow(provider, model.value, model.contextWindow)
      if (model.id !== undefined) this.setWindow(provider, model.id, model.contextWindow)
    }
  }

  setWindow(provider: SessionProvider, model: string, size: number): void {
    this.#entry(provider).windows.set(model, size)
  }

  setUsage(provider: SessionProvider, usage: ProviderUsage): void {
    const entry = this.#entry(provider)
    entry.revision += 1
    entry.measured = this.#now()
    entry.usage = { ...usage, measuredAt: usage.measuredAt ?? this.#now() }
  }

  invalidate(provider: SessionProvider): void {
    this.#all.delete(provider)
  }

  async measure(provider: LlmProvider, models: readonly string[]): Promise<void> {
    const entry = this.#entry(provider.family)
    if (entry.pending !== undefined) {
      await entry.pending
      return this.measure(provider, models)
    }
    const missing = models.filter((model) => !entry.windows.has(model))
    if (missing.length === 0 && this.#now() - entry.measured < 60_000) return
    entry.measured = this.#now()
    const revision = entry.revision
    entry.pending = provider.limits(missing).then((limits) => {
      if (this.#all.get(provider.family) !== entry) return
      for (const model of missing) if (!entry.windows.has(model) || limits.windows.get(model) !== undefined) entry.windows.set(model, limits.windows.get(model))
      const quotas = providerQuotas(limits)
      if (entry.revision === revision) entry.usage = { ...(quotas === undefined ? {} : { quotas }), measuredAt: this.#now() }
      this.#changed(provider.family, entry.revision === revision ? limits : { windows: limits.windows })
    }).catch(() => undefined).finally(() => { entry.pending = undefined })
    await entry.pending
  }
}
