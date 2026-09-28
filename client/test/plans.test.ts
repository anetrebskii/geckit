import { describe, expect, it } from 'vitest'

import { accountsOf, placesOf } from '../src/renderer/src/chat/plans'
import { hostOf } from '../src/shared/hosts'

const names: Record<string, string> = { '': 'Local', devbox: 'devbox', alpha: 'alpha', studio: 'studio' }
const nameOf = (place: string): string => names[place] ?? place

describe('the plans a bar shows', () => {
  it('names each place a project is on once, this computer as the empty place', () => {
    expect(placesOf(['/home/me/app', 'ssh://devbox/srv/api', 'ssh://devbox/srv/web'], hostOf)).toEqual(['', 'devbox'])
  })

  it('puts places on one account together, and one it could not read on its own', () => {
    const items = accountsOf(
      ['devbox', '', 'alpha', 'studio'],
      [
        { place: '', account: 'a1', plan: 'Team' },
        { place: 'devbox', account: 'a1', plan: 'Team' },
        { place: 'alpha', account: 'b2', plan: 'Max' },
      ],
      nameOf,
    )
    expect(items.map((item) => item.places)).toEqual([['', 'devbox'], ['alpha'], ['studio']])
  })

  it('keeps this computer first and hosts by name, however they came', () => {
    const items = accountsOf(['studio', 'alpha', ''], [], nameOf)
    expect(items.map((item) => item.places[0])).toEqual(['', 'alpha', 'studio'])
  })
})
