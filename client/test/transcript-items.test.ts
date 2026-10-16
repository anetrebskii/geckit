import { describe, expect, it } from 'vitest'

import type { SessionItem } from '../src/shared/api'
import { updatedItems } from '../src/shared/transcript-items'

const message: SessionItem = { kind: 'mine', id: 'mine', text: 'Add sign-in' }
const question: Extract<SessionItem, { kind: 'card' }> = {
  kind: 'card', id: 'card:question', card: { kind: 'question', title: 'Who can sign in?', choices: ['Organization', 'Everyone'] },
}

describe('transcript snapshots with live changes', () => {
  it('keeps a question that arrived while an earlier snapshot was loading', () => {
    expect(updatedItems([message], [{ items: [question] }])).toEqual([message, question])
  })

  it('keeps an answer instead of restoring the snapshot question', () => {
    const answered: SessionItem = { ...question, card: { ...question.card, answered: 'Organization' } }
    expect(updatedItems([message, question], [{ items: [answered] }])).toEqual([message, answered])
  })

  it('does not revive a question withdrawn before loading finished', () => {
    expect(updatedItems([message, question], [{ items: [], gone: [question.id] }])).toEqual([message])
  })

  it('applies arrivals, withdrawals and replacements in order without duplicates', () => {
    const replacement: SessionItem = { ...question, id: 'card:next' }
    expect(updatedItems([message, question], [
      { items: [question] },
      { items: [], gone: [question.id] },
      { items: [replacement] },
    ])).toEqual([message, replacement])
  })

  it('keeps the latest streamed text and preserves unrelated item identity', () => {
    const before: SessionItem = { kind: 'theirs', id: 'reply', text: 'Checking' }
    const after: SessionItem = { ...before, text: 'Checking sign-in settings' }
    const result = updatedItems([message, before], [{ items: [after] }])
    expect(result).toEqual([message, after])
    expect(result[0]).toBe(message)
    expect(before.text).toBe('Checking')
  })
})
