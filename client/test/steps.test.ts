import { describe, expect, it } from 'vitest'

import { collapse, pendingLast } from '../src/shared/steps'
import type { SessionItem } from '../src/shared/api'

describe('a conversation folded for the phone', () => {
  it('moves pending forms and handoffs to the end stably while answered items keep their history position', () => {
    const items: SessionItem[] = [
      { kind: 'card', id: 'question', card: { kind: 'question', title: 'Choose measurements' } },
      { kind: 'theirs', id: 'progress', text: 'Continuing work' },
      { kind: 'card', id: 'answered', card: { kind: 'question', title: 'Choose host', answered: 'Mac' } },
      { kind: 'request', id: 'handoff', tasks: [] },
      { kind: 'card', id: 'form', card: { kind: 'elicitation', title: 'Allow browser?', elicitation: { serverName: 'browser', message: 'Allow browser?', fields: [] } } },
      { kind: 'request', id: 'finished', tasks: [], answer: { how: 'answered' } },
      { kind: 'theirs', id: 'last', text: 'Latest progress' },
    ]
    const original = [...items]
    expect(pendingLast(items).map((item) => item.id)).toEqual(['progress', 'answered', 'finished', 'last', 'question', 'handoff', 'form'])
    expect(items).toEqual(original)
  })

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

  it('carries the pictures its steps handed back on the line', () => {
    const shot = { media: 'image/png', data: 'AAAA' }
    const items: SessionItem[] = [
      { kind: 'did', id: 'd1', what: 'Took a screenshot', images: [shot] },
      { kind: 'did', id: 'd2', what: 'Read b.png', images: [shot, shot] },
      { kind: 'theirs', id: 't1', text: 'Done' },
    ]
    expect(collapse(items)[0]).toEqual({ kind: 'steps', id: 'steps:d1', ids: ['d1', 'd2'], latest: 'Read b.png', images: [shot, shot, shot] })
  })
})
