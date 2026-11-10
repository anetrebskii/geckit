import { describe, expect, it } from 'vitest'
import { workItem, workItemsInText } from '../src/shared/links'
import { ConversationItems } from '../src/shared/work-items'

const task = 'https://acme.atlassian.net/browse/OPS-12'
const mr = 'https://code.example.org/team/nested/app/-/merge_requests/42'

describe('canonical work links', () => {
  it('recognizes hosted and private GitLab links with useful destinations', () => {
    expect(workItem(`${mr}/diffs?view=parallel#note_1`)).toEqual({ label: '!42', url: mr, says: 'code.example.org/team/nested/app merge request 42' })
    expect(workItem('https://gitlab.com/team/app/-/issues/7')?.label).toBe('#7')
    expect(workItem('http://git.internal:8080/team/app/-/merge_requests/8')?.label).toBe('!8')
  })

  it('keeps message order and canonicalizes repeated links', () => {
    expect(workItemsInText(`[task](${task}) and ${mr} then ${mr}#note_2 and ${task}?x=1`).map((one) => one.url)).toEqual([task, mr])
    expect(workItemsInText('https://code.example.org/team/app/merge_requests/42 https://example.com/plain')).toEqual([])
    expect(workItemsInText('https://bad:port/team/app/-/merge_requests/42 https://code.example.org/team/app/-/merge_requests/42junk')).toEqual([])
  })

  it('uses the last mention when related links repeat in one message', () => {
    expect(workItemsInText(`${task} ${mr} ${mr.replace('/42', '/43')} ${mr}#note_2 ${task}`).map((one) => one.label)).toEqual(['OPS-12', '!43', '!42'])
  })
})

describe('incrementally indexed conversation work', () => {
  it('preserves message order when an earlier streamed message gains its first link', () => {
    const items = new ConversationItems()
    items.set('early', { kind: 'theirs', id: 'early', text: 'Preparing review' })
    items.set('later', { kind: 'mine', id: 'later', text: mr })
    items.set('early', { kind: 'theirs', id: 'early', text: task })
    expect(items.workItems.map((one) => one.label)).toEqual(['OPS-12', '!42'])
  })

  it('retains known metadata while history is unavailable and clears it on a new conversation', () => {
    const saved = workItemsInText(`${task} ${mr}`)
    const items = new ConversationItems([], saved)
    items.set('continued', { kind: 'mine', id: 'continued', text: 'Continue checking' })
    expect(items.workItems).toEqual(saved)
    items.set('new', { kind: 'theirs', id: 'new', text: mr.replace('/42', '/43') })
    expect(items.workItems.map((one) => one.label)).toEqual(['OPS-12', '!43'])
    items.clear()
    expect(items.workItems).toEqual([])
  })
  it('keeps the subject beside the latest distinct related item', () => {
    const items = new ConversationItems()
    items.set('m', { kind: 'mine', id: 'm', text: task })
    items.set('a', { kind: 'theirs', id: 'a', text: `Created ${mr}` })
    expect(items.workItems.map((one) => one.label)).toEqual(['OPS-12', '!42'])
    const shown = items.workItems
    items.set('a', { kind: 'theirs', id: 'a', text: `Created ${mr}; tests passed` })
    items.set('tool', { kind: 'did', id: 'tool', what: 'Ran command', detail: mr.replace('/42', '/99') })
    items.set('unsent', { kind: 'mine', id: 'unsent', text: mr.replace('/42', '/98'), unsent: true })
    expect(items.workItems).toBe(shown)
    items.set('b', { kind: 'mine', id: 'b', text: mr.replace('/42', '/43') })
    expect(items.workItems.map((one) => one.label)).toEqual(['OPS-12', '!43'])
    items.delete('b')
    expect(items.workItems.map((one) => one.label)).toEqual(['OPS-12', '!42'])
    items.clear()
    expect(items.workItems).toEqual([])
  })

  it('rebuilds from history and removes edited links and failed sends', () => {
    const items = new ConversationItems([['m', { kind: 'mine', id: 'm', text: task }], ['a', { kind: 'theirs', id: 'a', text: mr }]])
    items.set('a', { kind: 'theirs', id: 'a', text: 'No review yet' })
    expect(items.workItems.map((one) => one.label)).toEqual(['OPS-12'])
    items.set('m', { kind: 'mine', id: 'm', text: task, unsent: true })
    expect(items.workItems).toEqual([])
    items.set('m', { kind: 'mine', id: 'm', text: task })
    expect(items.workItems[0]?.label).toBe('OPS-12')
  })
})
