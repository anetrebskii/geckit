import { describe, expect, it } from 'vitest'

import { collapse } from '../src/shared/steps'
import type { SessionItem } from '../src/shared/api'

describe('a conversation folded for the phone', () => {
  it('keeps what was said and makes each run of steps one line, named after its first step', () => {
    const items: SessionItem[] = [
      { kind: 'mine', id: 'm1', text: 'Fix it' },
      { kind: 'did', id: 'd1', what: 'Read a.ts' },
      { kind: 'thought', id: 'h1', text: '' },
      { kind: 'did', id: 'd2', what: 'Ran npm test' },
      { kind: 'theirs', id: 't1', text: 'Tests fail' },
      { kind: 'card', id: 'c1', card: { kind: 'permission', title: 'Run it?', answered: 'Allowed' } },
      { kind: 'card', id: 'c2', card: { kind: 'permission', title: 'Push it?' } },
    ]
    expect(collapse(items)).toEqual([
      items[0],
      { kind: 'steps', id: 'steps:d1', ids: ['d1', 'h1', 'd2'], latest: 'Ran npm test' },
      items[4],
      { kind: 'steps', id: 'steps:c1', ids: ['c1'] },
      items[6],
    ])
  })
})
