import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterAll, expect, it, vi } from 'vitest'
import { QuotaRows, QuotaStats } from '../src/renderer/src/chat/ProviderUsage'
import { quotaPart } from '../src/shared/provider-usage'

vi.hoisted(() => { vi.stubGlobal('window', {}) })
vi.stubGlobal('React', React)
afterAll(() => { vi.unstubAllGlobals() })

it('shows the provider explanation without a fabricated quota meter', () => {
  const usage = { quotas: [], unavailableReason: 'No active Token Plan subscription' }
  const rows = renderToStaticMarkup(<QuotaRows usage={usage} now={0} />)
  const stats = renderToStaticMarkup(<QuotaStats usage={usage} now={0} />)
  expect(rows).toContain(usage.unavailableReason)
  expect(stats).toContain(usage.unavailableReason)
  expect(rows).not.toContain('0%')
  expect(stats).not.toContain('0%')
  expect(renderToStaticMarkup(<QuotaRows usage={undefined} now={0} />)).toContain('Unavailable')
})

it('renders credit balances as remaining amounts, including zero, without a usage meter', () => {
  for (const remaining of [1250, 0]) {
    const quota = { id: 'credits', name: 'Credits', remaining, unit: 'credits' }
    const usage = { quotas: [quota], unavailableReason: 'No active Token Plan subscription' }
    const text = `${remaining.toLocaleString()} credits left`
    const rows = renderToStaticMarkup(<QuotaRows usage={usage} now={0} />)
    const stats = renderToStaticMarkup(<QuotaStats usage={usage} now={0} />)
    expect(rows).toContain(text)
    expect(stats).toContain(text)
    expect(rows).not.toContain(usage.unavailableReason)
    expect(rows).not.toContain('0%')
    expect(stats).not.toContain('0%')
    expect(quotaPart(quota)).toBeUndefined()
  }
})
