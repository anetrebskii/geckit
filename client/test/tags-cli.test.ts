import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ChatSession, Settings, TagChange, TaskTag } from '../src/shared/api'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { CoreMethods } from '../src/core/application'

const state = vi.hoisted(() => ({ settings: undefined as unknown as Settings }))
vi.mock('../src/main/store', () => ({ getSettings: () => state.settings }))

const { productSessions } = await import('../src/core/product-sessions')

const urgent: TaskTag = { id: 'a', name: 'Urgent', color: 0, used: 1 }
const client: TaskTag = { id: 'b', name: 'Client', color: 1, used: 2 }
const row = (id: string, tags?: readonly string[]): ChatSession => ({ id, root: '/project', title: id, stands: '', state: 'idle', at: 0, here: true, mode: 'auto', ...(tags === undefined ? {} : { tags }) }) as ChatSession

function api(rows: ChatSession[]): { readonly api: CoreMethods; readonly tagged: [readonly string[], TagChange][] } {
  const tagged: [readonly string[], TagChange][] = []
  const methods = {
    'chat:list': async () => rows,
    'chat:tag': async (ids: readonly string[], change: TagChange) => {
      tagged.push([ids, change])
      const made = (change.create ?? []).map((name) => state.settings.taskTags.find((one) => one.name.toLowerCase() === name.toLowerCase()) ?? { id: 'new', name, color: 2, used: 3 })
      state.settings = { ...state.settings, taskTags: [...state.settings.taskTags, ...made.filter((one) => !state.settings.taskTags.includes(one))] }
      for (const one of rows) if (ids.includes(one.id)) Object.assign(one, { tags: [...(one.tags ?? []).filter((id) => !(change.remove ?? []).includes(id)), ...made.map((tag) => tag.id).filter((id) => !(one.tags ?? []).includes(id))] })
      return made
    },
  }
  return { api: methods as unknown as CoreMethods, tagged }
}

beforeEach(() => {
  state.settings = { ...DEFAULT_SETTINGS, taskTags: [urgent, client] }
})

describe('sessions list with tags', () => {
  it('names the tags of each row and narrows by a tag name ignoring case', async () => {
    const { api: methods } = api([row('one', ['a', 'b']), row('two', ['b']), row('three')])
    const all = JSON.parse(await productSessions(methods, ['list'], 'operator')) as { id: string; tags: string[] }[]
    expect(all.map((one) => one.tags)).toEqual([['Urgent', 'Client'], ['Client'], []])
    const narrowed = JSON.parse(await productSessions(methods, ['list', '--tag', 'urgent'], 'operator')) as { id: string }[]
    expect(narrowed.map((one) => one.id)).toEqual(['one'])
  })

  it('refuses a tag that does not exist', async () => {
    const { api: methods } = api([row('one')])
    await expect(productSessions(methods, ['list', '--tag', 'Later'], 'operator')).rejects.toThrow('No tag named "Later".')
  })
})

describe('sessions tag', () => {
  it('adds by name, making the tag when it does not exist, and removes by name', async () => {
    const rows = [row('one', ['a'])]
    const { api: methods, tagged } = api(rows)
    expect(JSON.parse(await productSessions(methods, ['tag', '--id', 'one', '--add', 'Later', '--remove', 'Urgent'], 'operator'))).toEqual({ id: 'one', tags: ['Later'] })
    expect(tagged).toEqual([[['one'], { remove: ['a'], create: ['Later'] }]])
  })

  it('refuses removing an unknown tag and asks for a change', async () => {
    const { api: methods } = api([row('one')])
    await expect(productSessions(methods, ['tag', '--id', 'one', '--remove', 'Nope'], 'operator')).rejects.toThrow('No tag named "Nope".')
    await expect(productSessions(methods, ['tag', '--id', 'one'], 'operator')).rejects.toThrow('Supply --add')
  })

  it('is a write a remote Manager cannot make', async () => {
    const { api: methods } = api([row('one')])
    await expect(productSessions(methods, ['tag', '--id', 'one', '--add', 'Urgent'], 'manager')).rejects.toThrow('Remote Manager session writes')
  })
})
