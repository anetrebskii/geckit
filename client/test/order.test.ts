import { describe, expect, it } from 'vitest'

import { keptOrder, movedOrder } from '../src/shared/order'

describe('the order of In progress', () => {
  it('puts a conversation coming in on top, newest first, and leaves the rest where they were', () => {
    const all = [
      { id: 'a', at: 1 },
      { id: 'b', at: 5 },
      { id: 'c', at: 3 },
      { id: 'd', at: 4 },
    ]
    expect(keptOrder(['a', 'b'], all)).toEqual(['d', 'c', 'a', 'b'])
  })

  it('takes out one gone to review or done, and keeps one it does not see', () => {
    const all = [
      { id: 'a', at: 1 },
      { id: 'b', at: 2, status: 'review' as const },
    ]
    expect(keptOrder(['x', 'b', 'a'], all)).toEqual(['x', 'a'])
  })

  it('is nothing when nothing changed', () => {
    expect(keptOrder(['a'], [{ id: 'a', at: 1 }])).toBeUndefined()
  })

  it('moves to the top or the bottom', () => {
    expect(movedOrder(['a', 'b', 'c', 'd'], ['c', 'a'], 'top')).toEqual(['c', 'a', 'b', 'd'])
    expect(movedOrder(['a', 'b', 'c', 'd'], ['b'], 'bottom')).toEqual(['a', 'c', 'd', 'b'])
  })
})
