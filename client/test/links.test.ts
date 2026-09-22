import { describe, expect, it } from 'vitest'

import { linksIn, shortUrl, workItem } from '../src/shared/links'
import type { SessionItem } from '../src/shared/api'

describe('the links in a conversation', () => {
  it('lists what was said, the newest first and each once, and leaves out what tools printed', () => {
    const items: SessionItem[] = [
      { kind: 'mine', id: 'm1', text: 'Look at https://github.com/twins-ai/Twins-AI/issues/3914.' },
      { kind: 'did', id: 'd1', what: 'Ran curl', detail: 'https://example.com/noise' },
      {
        kind: 'theirs',
        id: 't1',
        text: 'Opened [PR #199](https://github.com/akva-it/aqua-crm/pull/199) for [#3914](https://github.com/twins-ai/Twins-AI/issues/3914), CI at <https://github.com/akva-it/aqua-crm/actions/runs/35706022733>',
      },
    ]
    expect(linksIn(items)).toEqual([
      { url: 'https://github.com/akva-it/aqua-crm/pull/199', text: 'PR #199' },
      { url: 'https://github.com/twins-ai/Twins-AI/issues/3914', text: '#3914' },
      { url: 'https://github.com/akva-it/aqua-crm/actions/runs/35706022733' },
    ])
  })

  it('says an address without what every address has', () => {
    expect(shortUrl('https://www.example.com/')).toBe('example.com')
    expect(shortUrl('https://github.com/akva-it/aqua-crm/pull/199')).toBe('github.com/akva-it/aqua-crm/pull/199')
  })
})

describe('what a conversation is about', () => {
  it('is the first tracker link in its first message', () => {
    expect(workItem('Review https://github.com/twins-ai/Twins-AI/pull/3908 then https://linear.app/formula/issue/FOR-1067')).toEqual({
      label: '#3908',
      url: 'https://github.com/twins-ai/Twins-AI/pull/3908',
      says: 'twins-ai/Twins-AI pull request 3908',
    })
    expect(workItem('Take [FOR-1067](https://linear.app/formula/issue/FOR-1067/publish-the-design-system), then #3914')).toEqual({
      label: 'FOR-1067',
      url: 'https://linear.app/formula/issue/FOR-1067/publish-the-design-system',
      says: 'FOR-1067',
    })
    expect(workItem('See https://acme.atlassian.net/browse/OPS-12.')?.label).toBe('OPS-12')
    expect(workItem('https://github.com/twins-ai/Twins-AI/issues/3914#issuecomment-1')?.says).toBe('twins-ai/Twins-AI issue 3914')
  })

  it('is nothing where the message names no tracker item it can open', () => {
    expect(workItem('Fix #3914 and look at https://github.com/twins-ai/Twins-AI')).toBeUndefined()
  })
})
