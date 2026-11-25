import { afterEach, describe, expect, it } from 'vitest'

import { memoryNotes, Sessions } from '../src/main/sessions'

const cleanup: (() => void)[] = []
afterEach(() => {
  for (const one of cleanup.splice(0)) one()
})

function fixture() {
  const notes = memoryNotes()
  const sessions = new Sessions({
    notes, changed: () => undefined, items: () => undefined, account: () => undefined, notify: () => undefined,
    disk: { list: async () => [], has: async () => false, read: async () => undefined },
    claudeAccount: async () => ({ here: true, signedIn: true }), claudeProgram: async () => undefined,
    claudeModels: async () => undefined, usage: async () => ({ windows: new Map<string, number | undefined>() }),
    claude: () => ({ send: () => undefined, answer: () => undefined, stop: () => undefined, end: async () => undefined }),
  })
  cleanup.push(() => sessions.dispose())
  return { sessions, notes }
}

describe('tags on a task note', () => {
  it('keeps the tags a new task starts with and lists them on its row', async () => {
    const { sessions, notes } = fixture()
    const id = await sessions.send({ root: '/project', mode: 'auto', text: 'Fix the login', tags: ['a', 'b'] })
    expect(notes.all()[id]?.tags).toEqual(['a', 'b'])
    expect((await sessions.list(['/project'])).find((one) => one.id === id)?.tags).toEqual(['a', 'b'])
  })

  it('adds and removes, and leaves no tags field when the last one goes', async () => {
    const { sessions, notes } = fixture()
    const id = await sessions.send({ root: '/project', mode: 'auto', text: 'Work' })
    sessions.setTags([id], ['a', 'b'], [])
    expect(notes.all()[id]?.tags).toEqual(['a', 'b'])
    sessions.setTags([id], [], ['a', 'b'])
    expect(notes.all()[id]).not.toHaveProperty('tags')
    expect((await sessions.list(['/project'])).find((one) => one.id === id)).not.toHaveProperty('tags')
  })

  it('refuses a task that is gone', () => {
    const { sessions } = fixture()
    expect(() => sessions.setTags(['missing'], ['a'], [])).toThrow('This conversation is no longer available.')
  })

  it('takes a deleted tag off every task and counts them', async () => {
    const { sessions, notes } = fixture()
    const one = await sessions.send({ root: '/project', mode: 'auto', text: 'One', tags: ['a', 'b'] })
    const two = await sessions.send({ root: '/project', mode: 'auto', text: 'Two', tags: ['a'] })
    const three = await sessions.send({ root: '/project', mode: 'auto', text: 'Three', tags: ['b'] })
    expect(sessions.stripTag('a')).toBe(2)
    expect(notes.all()[one]?.tags).toEqual(['b'])
    expect(notes.all()[two]).not.toHaveProperty('tags')
    expect(notes.all()[three]?.tags).toEqual(['b'])
  })

  it('carries a prepared task\'s tags to the conversation it becomes', async () => {
    const { sessions } = fixture()
    const prepared = sessions.prepare({ root: '/project', mode: 'auto', text: 'Prepared', tags: ['a'] })
    const id = await sessions.send({ session: prepared, root: '/project', mode: 'auto', text: 'Prepared' })
    expect((await sessions.list(['/project'])).find((one) => one.id === id)?.tags).toEqual(['a'])
  })

  it('keeps a planned task\'s tags', () => {
    const { sessions, notes } = fixture()
    const id = sessions.schedule({ root: '/project', mode: 'auto', text: 'Later', tags: ['a'] })
    expect(notes.all()[id]).toMatchObject({ tags: ['a'], status: 'todo' })
  })
})
