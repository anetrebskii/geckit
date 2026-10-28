import { describe, expect, it } from 'vitest'

import type { ChatSession } from '../src/shared/api'
import { geckoState } from '../src/shared/gecko'

const one = (id: string, more: Partial<ChatSession> = {}): ChatSession => ({ id, root: '/work/project', title: id, stands: '', state: 'idle', at: 1, here: true, mode: 'auto', ...more })

describe('the gecko state', () => {
  it('sleeps when nothing works and nothing waits', () => {
    expect(geckoState([])).toEqual({ pose: 'asleep', waiting: [], review: false })
    expect(geckoState([one('a'), one('b', { state: 'failed' }), one('c', { state: 'limit' })]).pose).toBe('asleep')
  })

  it('works while one conversation works', () => {
    expect(geckoState([one('a', { state: 'working' }), one('b')]).pose).toBe('working')
  })

  it('waits when one of five working conversations asks, and waiting wins', () => {
    const rows = [1, 2, 3, 4, 5].map((n) => one(String(n), { state: 'working' }))
    expect(geckoState([...rows, one('asks', { state: 'asks' })])).toEqual({ pose: 'waiting', waiting: ['asks'], review: false })
  })

  it('lists the waiting ones longest first, a reply and a question alike', () => {
    const state = geckoState([one('new', { state: 'asks', at: 30 }), one('old', { state: 'unread', at: 10 }), one('mid', { runs: 'npm init', typing: true, at: 20 })])
    expect(state.waiting).toEqual(['old', 'mid', 'new'])
  })

  it('does not count what the board does not show as needing the person', () => {
    const rows = [
      one('done', { state: 'asks', status: 'done' }),
      one('review', { state: 'unread', status: 'review' }),
      one('question', { state: 'asks', question: true }),
      one('manager', { state: 'working', manager: true }),
      one('slot', { state: 'unread', waits: true }),
      one('helper', { state: 'unread', tasks: [{ id: 't', kind: 'local_agent', what: 'Helping', status: 'running', started: 1 }] }),
      one('shell', { runs: 'npm test' }),
    ]
    expect(geckoState(rows)).toEqual({ pose: 'asleep', waiting: [], review: false })
  })

  it('counts a conversation, not what it runs in the background', () => {
    expect(geckoState([one('a', { tasks: [{ id: 't', kind: 'local_bash', what: 'Watching', status: 'running', started: 1 }] })]).pose).toBe('asleep')
  })

  it('hops once when a card reaches In review, on top of the state below', () => {
    const before = [one('a', { state: 'working' }), one('b', { state: 'working' })]
    const now = [one('a', { status: 'review' }), one('b', { state: 'working' })]
    expect(geckoState(now, before)).toEqual({ pose: 'working', waiting: [], review: true })
    expect(geckoState(now, now).review).toBe(false)
  })

  it('does not hop for a card first seen in review, or while something waits', () => {
    expect(geckoState([one('a', { status: 'review' })], []).review).toBe(false)
    const before = [one('a'), one('b')]
    expect(geckoState([one('a', { status: 'review' }), one('b', { state: 'asks' })], before)).toEqual({ pose: 'waiting', waiting: ['b'], review: false })
  })
})
