import { describe, expect, it } from 'vitest'

import { issuesIn } from '../src/shared/issues'

const cut = (text: string): string[] => issuesIn(text).flatMap((part) => (part.issue ? [part.text] : []))

describe('an issue number in an answer', () => {
  it('finds the ones GitHub would open', () => {
    expect(cut('That is the failure PR #3942 fixes.')).toEqual(['#3942'])
    expect(cut('#1 and #22, then (#333) and [#4444].')).toEqual(['#1', '#22', '#333', '#4444'])
  })

  it('leaves alone what is not one', () => {
    expect(cut('A heading ## 2 and a tag #release and a colour #0088ff.')).toEqual([])
    expect(cut('An id like abc#12 stays as it is.')).toEqual([])
    expect(cut('#1234567 is too long to be one.')).toEqual([])
  })

  it('keeps the sentence around it whole', () => {
    expect(issuesIn('Fixed in #12 today.')).toEqual([
      { text: 'Fixed in ', issue: false },
      { text: '#12', issue: true },
      { text: ' today.', issue: false },
    ])
  })
})
