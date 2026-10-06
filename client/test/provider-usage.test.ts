import { describe, expect, it, vi } from 'vitest'
import { ProviderMeasurements } from '../src/main/sessions/provider-usage'
import { llmProvider } from '../src/main/sessions/provider'
import type { LlmProvider, ProviderLimits } from '../src/main/sessions/provider'
import { memoryNotes, Sessions } from '../src/main/sessions'
import type { Heard } from '../src/main/sessions/heard'
import { accountUsage, providerQuotas, quotaPart } from '../src/shared/provider-usage'
import { modelDetailRows, pricingRows, resolvedModel } from '../src/shared/model-details'

const plugin = (over: Partial<LlmProvider> = {}): LlmProvider => ({
  ...llmProvider({ claudeAccount: async () => ({ here: true, signedIn: true }), claudeProgram: async () => undefined, usage: async () => ({ windows: new Map() }) }, 'claude'),
  id: 'plugin:test', family: 'plugin:test', name: 'Test provider', ...over,
})

it('normalizes old Claude and Codex limits while preserving custom quota units', () => {
  expect(providerQuotas({ plan: { fiveHour: { part: 0.3, resetsAt: 1234 } } })).toEqual([{ id: 'five-hour', name: '5h', part: 0.3, resetsAt: 1234 }])
  expect(providerQuotas({ limits: [{ limitId: 'codex', limitName: null, primary: { usedPercent: 42, windowDurationMins: 300, resetsAt: 2 }, secondary: null }] })).toEqual([{ id: 'codex:0', name: '5h', part: 0.42, resetsAt: 2000 }])
  const quotas = [{ id: 'requests', name: 'Daily requests', used: 25, limit: 100, unit: 'requests' }]
  expect(providerQuotas({ quotas })).toBe(quotas)
  expect(quotaPart({ id: 'requests', name: 'Daily requests', used: 25, limit: 100 })).toBe(0.25)
  expect(quotaPart({ id: 'unknown', name: 'Unknown' })).toBeUndefined()
  expect(quotaPart({ id: 'zero', name: 'Zero', used: 0, limit: 0 })).toBeUndefined()
  expect(accountUsage({ here: true, signedIn: true, limits: [] })).toEqual({ quotas: [] })
})

it('keeps resolved model metadata, zero prices and unknown rates distinct', () => {
  const model = { value: 'alias', id: 'resolved', name: 'Custom model', version: '1.2', contextWindow: 12345, maxOutputTokens: 1000, supportsFastMode: false, isDefault: true }
  expect(resolvedModel([model], 'resolved')).toBe(model)
  expect(resolvedModel([model], undefined)).toBe(model)
  expect(resolvedModel([model], 'another')).toBeUndefined()
  expect(modelDetailRows(model)).toContainEqual({ label: 'Fast mode', value: 'Unsupported' })
  expect(pricingRows({ currency: 'USD', input: 0, output: 2 })).toEqual([{ label: 'Input', value: '$0.00' }, { label: 'Output', value: '$2.00' }])
  expect(pricingRows({ currency: 'USD' })).toEqual([])
})

describe('provider-scoped measurements', () => {
  it('isolates equal model IDs and coalesces requests within a minute', async () => {
    let now = 1000
    const cache = new ProviderMeasurements(() => now, () => {})
    const oneLimits = vi.fn<LlmProvider['limits']>().mockResolvedValue({ windows: new Map([['same', 100_000]]), quotas: [{ id: 'daily', name: 'Daily', part: 0.1 }] })
    const twoLimits = vi.fn<LlmProvider['limits']>().mockResolvedValue({ windows: new Map([['same', 500_000]]), quotas: [{ id: 'daily', name: 'Daily', part: 0.9 }] })
    const one = plugin({ limits: oneLimits })
    const two = plugin({ id: 'plugin:other', family: 'plugin:other', limits: twoLimits })
    await Promise.all([cache.measure(one, ['same']), cache.measure(one, ['same']), cache.measure(two, ['same'])])
    expect(oneLimits).toHaveBeenCalledTimes(1)
    expect(cache.window(one.family, 'same')).toBe(100_000)
    expect(cache.window(two.family, 'same')).toBe(500_000)
    expect(cache.usage(one.family).quotas?.[0]?.part).toBe(0.1)
    now += 60_001
    await cache.measure(one, ['same'])
    expect(oneLimits).toHaveBeenCalledTimes(2)
  })

  it('keeps catalog capacities and live usage while a slow poll completes', async () => {
    let release: ((limits: ProviderLimits) => void) | undefined
    const changed = vi.fn<(provider: LlmProvider['family'], limits: ProviderLimits) => void>()
    const cache = new ProviderMeasurements(() => 1000, changed)
    const provider = plugin({ limits: () => new Promise((resolve) => { release = resolve }) })
    const pending = cache.measure(provider, ['alias'])
    cache.models(provider.family, [{ value: 'alias', id: 'resolved', name: 'Model', contextWindow: 700_000 }])
    cache.setUsage(provider.family, { quotas: [{ id: 'day', name: 'Day', part: 0.8 }] })
    release?.({ windows: new Map(), quotas: [{ id: 'day', name: 'Day', part: 0.1 }], plan: { fiveHour: { part: 0.1, resetsAt: 1000 } } })
    await pending
    expect(cache.window(provider.family, 'alias')).toBe(700_000)
    expect(cache.window(provider.family, 'resolved')).toBe(700_000)
    expect(cache.usage(provider.family).quotas?.[0]?.part).toBe(0.8)
    expect(changed).toHaveBeenCalledWith(provider.family, { windows: new Map() })
  })

  it('keeps successful measurements on errors and discards invalidated responses', async () => {
    let now = 1
    let release: ((limits: ProviderLimits) => void) | undefined
    const cache = new ProviderMeasurements(() => now, () => {})
    const limits = vi.fn<LlmProvider['limits']>().mockResolvedValueOnce({ windows: new Map(), quotas: [{ id: 'day', name: 'Day', part: 0.4 }] }).mockRejectedValueOnce(new Error('Offline')).mockImplementationOnce(() => new Promise((resolve) => { release = resolve }))
    const provider = plugin({ limits })
    await cache.measure(provider, [])
    now += 60_001
    await cache.measure(provider, [])
    expect(cache.usage(provider.family)).toMatchObject({ measuredAt: 1, quotas: [{ part: 0.4 }] })
    now += 60_001
    const pending = cache.measure(provider, ['same'])
    cache.invalidate(provider.family)
    release?.({ windows: new Map([['same', 100]]) })
    await pending
    expect(cache.window(provider.family, 'same')).toBeUndefined()
  })
})

it('returns plugin quotas/CLI metadata and routes spend/usage without changing Claude plan', async () => {
  let hear: ((heard: Heard) => void) | undefined
  const provider = plugin({
    account: async () => ({ here: true, signedIn: true }),
    program: async () => ({ version: '1.2.3' }),
    limits: async () => ({ windows: new Map([['custom', 100_000]]), quotas: [{ id: 'daily', name: 'Daily requests', used: 25, limit: 100 }] }),
    list: async () => [], create: async () => 'plugin:test:one', read: async () => undefined,
    hold: (_options, callback) => { hear = callback; return { send: () => {}, stop: () => {}, end: async () => {}, answer: () => {} } },
  })
  const sessions = new Sessions({ notes: memoryNotes(), changed: () => {}, items: () => {}, account: () => {}, notify: () => {}, there: async () => true, plugins: [provider] })
  const account = await sessions.account(provider.family)
  expect(account).toMatchObject({ provider: provider.family, program: { version: '1.2.3' }, usage: { quotas: [{ name: 'Daily requests' }] } })
  const id = await sessions.send({ provider: provider.family, root: '/work', mode: 'manual', text: 'Hello' })
  await vi.waitFor(() => expect(hear).toBeDefined())
  hear?.({ items: [], gone: [], signals: [
    { kind: 'started', session: id, key: false, model: 'custom' },
    { kind: 'spend', used: 2000, window: 50000, cost: 0.5, currency: 'EUR', costKind: 'billed' },
    { kind: 'usage', usage: { quotas: [{ id: 'week', name: 'Week', part: 0.7 }] } },
    { kind: 'ended', how: 'done' },
  ] })
  expect((await sessions.list(['/work'])).find((row) => row.id === id)?.spend).toMatchObject({ used: 2000, window: 50000, cost: 0.5, currency: 'EUR', costKind: 'billed' })
  expect((await sessions.account(provider.family)).usage?.quotas?.[0]?.id).toBe('week')
  expect(sessions.plan()).toBeUndefined()
  sessions.dispose()
})
