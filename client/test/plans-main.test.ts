import { describe, expect, it } from 'vitest'

import { hostsWithProjects, placeFor } from '../src/main/plans'

describe('the places every plan is measured for, built here in main', () => {
  const devbox = { id: 'devbox', state: 'up' as const, who: 'k1', plan: 'Team' }
  const alpha = { id: 'alpha', state: 'lost' as const, who: 'k2', plan: 'Max' }

  it('keeps only the hosts a project is on', () => {
    expect(hostsWithProjects([devbox, alpha], ['/home/me/app', 'ssh://devbox/srv/api'])).toEqual([devbox])
    expect(hostsWithProjects([devbox, alpha], ['ssh://devbox/a', 'ssh://alpha/b'])).toEqual([devbox, alpha])
    expect(hostsWithProjects([devbox, alpha], ['/home/me/app'])).toEqual([])
  })

  it('is not thrown off by a host with no project of its own name mixed among others', () => {
    expect(hostsWithProjects([devbox, alpha], ['ssh://devbox/srv/api', 'ssh://devbox/srv/web'])).toEqual([devbox])
  })

  it('folds a host into one place line, its usage where it has been measured and absent where it has not', () => {
    expect(placeFor(devbox, { fiveHour: { part: 0.5, resetsAt: 1_000 } })).toEqual({
      place: 'devbox',
      account: 'k1',
      plan: 'Team',
      usage: { fiveHour: { part: 0.5, resetsAt: 1_000 } },
    })
    expect(placeFor(devbox, undefined)).toEqual({ place: 'devbox', account: 'k1', plan: 'Team' })
  })

  it('says only what it knows: no account or plan named leaves the place bare but for its id', () => {
    expect(placeFor({ id: 'lost', state: 'idle' }, undefined)).toEqual({ place: 'lost' })
  })
})
