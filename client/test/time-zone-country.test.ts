import { afterEach, describe, expect, it, vi } from 'vitest'

import { whereAbouts } from '../src/shared/time-zone-country'

describe('the country of the time zone', () => {
  afterEach(() => { vi.restoreAllMocks() })

  const at = (timeZone: string): void => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone } as Intl.ResolvedDateTimeFormatOptions)
  }

  it('reads current and older zone names', () => {
    at('Europe/Berlin')
    expect(whereAbouts()).toEqual({ zone: 'Europe/Berlin', country: 'DE' })
    at('Asia/Calcutta')
    expect(whereAbouts().country).toBe('IN')
    at('Europe/Kyiv')
    expect(whereAbouts().country).toBe('UA')
  })

  it('names no country for a zone that has none', () => {
    at('UTC')
    expect(whereAbouts()).toEqual({ zone: 'UTC', country: undefined })
  })

  it('knows every zone this runtime reports', () => {
    for (const zone of Intl.supportedValuesOf('timeZone').filter((one) => one !== 'UTC')) {
      at(zone)
      expect(whereAbouts().country, zone).toMatch(/^[A-Z]{2}$/)
    }
  })
})
