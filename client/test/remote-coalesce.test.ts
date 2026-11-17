import { describe, expect, it } from 'vitest'
import { coalesceEvents } from '../src/shared/remote/coalesce'
import { updatedItems } from '../src/shared/transcript-items'
import type { CoreEvent } from '../src/core/events'
import type { SessionItem, SessionItems } from '../src/shared/api'

const text = (id: string, said: string): SessionItem => ({ id, kind: 'theirs', text: said }) as SessionItem
const items = (update: SessionItems): CoreEvent => ({ name: 'chat:items', args: [update] }) as CoreEvent

describe('coalesceEvents', () => {
  it('leaves a transcript where every single update would have', () => {
    const held = [text('a', 'hello'), text('b', 'old')]
    const updates: SessionItems[] = [
      { id: 's', items: [text('p', 'Wor')] },
      { id: 's', items: [text('p', 'Working')] },
      { id: 's', items: [text('c', 'Working on it')], gone: ['p'] },
      { id: 's', items: [text('b', 'new')], gone: ['a'] },
      { id: 's', items: [text('a', 'back')] },
    ]
    const batch = coalesceEvents(updates.map(items))
    expect(batch).toHaveLength(1)
    const merged = batch.map((event) => event.args[0] as SessionItems)
    expect(updatedItems(held, merged)).toEqual(updatedItems(held, updates))
  })

  it('keeps the last whole-state event and the order of the rest', () => {
    const first = { name: 'chat:sessions', args: [[]] } as unknown as CoreEvent
    const notice = { name: 'chat:show', args: ['x'] } as CoreEvent
    const last = { name: 'chat:sessions', args: [[{ id: 'y' }]] } as unknown as CoreEvent
    const other = items({ id: 't', items: [text('q', 'hi')] })
    expect(coalesceEvents([first, notice, other, last])).toEqual([notice, other, last])
  })
})
