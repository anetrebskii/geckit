import { describe, expect, it } from 'vitest'

import { noticeWanted } from '../src/shared/api'

describe('what a notice does beyond showing', () => {
  it('is nothing, only for a question, or for every notice', () => {
    expect(noticeWanted('never', true)).toBe(false)
    expect(noticeWanted('never', false)).toBe(false)
    expect(noticeWanted('asks', true)).toBe(true)
    expect(noticeWanted('asks', false)).toBe(false)
    expect(noticeWanted('all', true)).toBe(true)
    expect(noticeWanted('all', false)).toBe(true)
  })
})
