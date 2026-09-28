import { describe, expect, it } from 'vitest'

import { startedCount, startedFrom } from '../src/renderer/src/chat/started'
import type { ChatSession } from '../src/shared/api'

const session = (id: string, more: Partial<ChatSession> = {}): ChatSession => ({
  id,
  root: '/p',
  title: id,
  stands: '',
  state: 'idle',
  at: 0,
  here: true,
  mode: 'manual',
  ...more,
})

describe('what a conversation started', () => {
  const sessions = [
    session('late', { parent: 'top', created: 30 }),
    session('grand', { parent: 'early', created: 40 }),
    session('early', { parent: 'top', created: 10 }),
    session('top'),
    session('other', { parent: 'elsewhere', created: 5 }),
  ]

  it('lists them in the order started, with what each started under it, one step in', () => {
    expect(startedFrom(sessions, 'top').map(({ session: one, depth }) => [one.id, depth])).toEqual([
      ['early', 0],
      ['grand', 1],
      ['late', 0],
    ])
  })

  it('counts only the ones it started itself', () => {
    expect(startedCount(sessions, 'top')).toBe(2)
    expect(startedCount(sessions, 'late')).toBe(0)
  })
})
