import { describe, expect, it } from 'vitest'

import { carryOut, listing, ordersOf } from '../src/main/orders'
import type { Doing, Told } from '../src/main/orders'

/**
 * What somebody said out loud, read as orders and carried out.
 *
 * The model's answer is the untrusted part: it is asked for a bare array and
 * may give one wrapped in a fence, with a word in front of it, or with an
 * order this application does not have. None of that may reach the window.
 */

const CHATS: Told[] = [
  { id: 'a1', title: 'Radar push notifications', root: '/work/radar63', state: 'idle' },
  { id: 'b2', title: 'Phone edit looks weird', root: '/work/time2you', state: 'working' },
]
const PROJECTS = ['/work/radar63', '/work/time2you']

function watch(): { doing: Doing; did: string[] } {
  const did: string[] = []
  const doing: Doing = {
    start: async (root, text) => {
      did.push(`start ${root} ${text}`)
      return 'new'
    },
    say: async (id, text) => {
      did.push(`say ${id} ${text}`)
    },
    stop: (id) => did.push(`stop ${id}`),
    mark: (id, status) => did.push(`mark ${id} ${status}`),
    open: (id) => did.push(`open ${id}`),
  }
  return { doing, did }
}

describe('reading what the model answered', () => {
  it('takes the orders out of a bare array', () => {
    expect(ordersOf('[{"do":"stop","chat":"a1"},{"do":"open","chat":"b2"}]')).toEqual([
      { do: 'stop', chat: 'a1' },
      { do: 'open', chat: 'b2' },
    ])
  })

  it('reads one wrapped in a fence, or with a word in front of it', () => {
    const fenced = '```json\n[{"do":"mark","chat":"a1","status":"review"}]\n```'
    expect(ordersOf(fenced)).toEqual([{ do: 'mark', chat: 'a1', status: 'review' }])
    expect(ordersOf('Sure, here you go: [{"do":"open","chat":"a1"}]')).toEqual([{ do: 'open', chat: 'a1' }])
  })

  it('leaves out what this application does not do, and keeps the rest', () => {
    const said =
      '[{"do":"delete","chat":"a1"},{"do":"mark","chat":"a1","status":"archived"},{"do":"start","project":"radar63","text":"look at the map"},{"do":"say","chat":"b2"}]'
    expect(ordersOf(said)).toEqual([{ do: 'start', project: 'radar63', text: 'look at the map' }])
  })

  it('is nothing where the answer is not an array at all', () => {
    expect(ordersOf('I could not tell what you meant.')).toEqual([])
    expect(ordersOf('[')).toEqual([])
    expect(ordersOf('[not json]')).toEqual([])
    expect(ordersOf('{"do":"open","chat":"a1"}')).toEqual([])
  })
})

describe('carrying the orders out', () => {
  it('does them in the order they were given, and says what it did', async () => {
    const { doing, did } = watch()
    const done = await carryOut(
      [
        { do: 'start', project: 'radar63', text: 'add a push when a drone is near' },
        { do: 'say', chat: 'b2', text: 'yes, go ahead' },
        { do: 'mark', chat: 'a1', status: 'review' },
      ],
      PROJECTS,
      CHATS,
      doing,
    )
    expect(did).toEqual([
      'start /work/radar63 add a push when a drone is near',
      'say b2 yes, go ahead',
      'mark a1 review',
    ])
    expect(done).toEqual([
      'Started in radar63: add a push when a drone is near',
      'Said in Phone edit looks weird: yes, go ahead',
      'Marked Radar push notifications as review',
    ])
  })

  it('drops one naming a conversation or a project that is not there', async () => {
    const { doing, did } = watch()
    const done = await carryOut(
      [
        { do: 'open', chat: 'gone' },
        { do: 'start', project: 'nowhere', text: 'do a thing' },
      ],
      PROJECTS,
      CHATS,
      doing,
    )
    expect(did).toEqual([])
    expect(done).toEqual([])
  })
})

describe('what the model is told there is', () => {
  it('names every project and conversation, by the folder rather than the path', () => {
    expect(listing(PROJECTS, CHATS)).toBe(
      [
        'Projects:',
        '- radar63',
        '- time2you',
        '',
        'Conversations, as id | project | how it stands | what it is about:',
        '- a1 | radar63 | idle | Radar push notifications',
        '- b2 | time2you | working | Phone edit looks weird',
      ].join('\n'),
    )
  })
})
