import { describe, expect, it } from 'vitest'

import type { ChatSession } from '../src/shared/api'
import { canDoze, DOZE, GECKO_MAX, GECKO_MIN, geckoItems, geckoRing, geckoShown, geckoSide, geckoState, keptIn } from '../src/shared/gecko'

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

describe('what the gecko is drawn doing', () => {
  const now = { pose: 'asleep', done: false, dozing: false, menu: false, drag: false, got: false, camera: false, listen: false } as const

  it('shows its state, waiting first, then working, then the happy look after a hop', () => {
    expect(geckoShown(now)).toBe('asleep')
    expect(geckoShown({ ...now, pose: 'working', done: true })).toBe('working')
    expect(geckoShown({ ...now, pose: 'waiting', done: true })).toBe('waiting')
    expect(geckoShown({ ...now, done: true })).toBe('done')
  })

  it('puts waiting and the happy look to sleep when it dozes, but keeps working', () => {
    expect(geckoShown({ ...now, pose: 'waiting', dozing: true })).toBe('asleep')
    expect(geckoShown({ ...now, done: true, dozing: true })).toBe('asleep')
    expect(geckoShown({ ...now, pose: 'working', dozing: true })).toBe('working')
  })

  it('shows what the person does with it over any state', () => {
    expect(geckoShown({ ...now, pose: 'waiting', menu: true })).toBe('look')
    expect(geckoShown({ ...now, pose: 'working', listen: true, menu: true })).toBe('listen')
    expect(geckoShown({ ...now, camera: true, listen: true })).toBe('camera')
    expect(geckoShown({ ...now, got: true, camera: true })).toBe('got')
    expect(geckoShown({ ...now, drag: true, got: true })).toBe('catch')
    expect(geckoShown({ ...now, pose: 'waiting', dozing: true, menu: true })).toBe('look')
  })

  it('dozes after five minutes, only from waiting or the happy look, and not while it is in use', () => {
    expect(DOZE).toBe(300_000)
    expect(canDoze({ ...now, pose: 'waiting' })).toBe(true)
    expect(canDoze({ ...now, done: true })).toBe(true)
    expect(canDoze(now)).toBe(false)
    expect(canDoze({ ...now, pose: 'working', done: true })).toBe(false)
    expect(canDoze({ ...now, pose: 'waiting', menu: true })).toBe(false)
    expect(canDoze({ ...now, pose: 'waiting', listen: true })).toBe(false)
    expect(canDoze({ ...now, pose: 'waiting', drag: true })).toBe(false)
  })
})

describe('the gecko menu', () => {
  const actions = (waiting: number, screenshot: boolean): string[] => geckoItems({ waiting, screenshot }).map((one) => one.action)

  it('offers the screenshot only where one can be taken, and the waiting conversation only while one waits', () => {
    expect(actions(0, true)).toEqual(['screenshot', 'task', 'voice', 'open'])
    expect(actions(0, false)).toEqual(['task', 'voice', 'open'])
    expect(actions(2, true)).toEqual(['screenshot', 'task', 'voice', 'waiting', 'open'])
    expect(geckoItems({ waiting: 2, screenshot: true }).map((one) => one.label)).toEqual(['Screenshot', 'New task', 'Voice task', 'Waiting', 'Open GeckIt'])
    expect(geckoItems({ waiting: 3, screenshot: false }).find((one) => one.action === 'waiting')?.count).toBe(3)
  })

  const area = { x: 0, y: 25, width: 1440, height: 875 }
  const inside = (box: { x: number; y: number; width: number; height: number }): boolean =>
    box.x >= area.x && box.y >= area.y && box.x + box.width <= area.x + area.width && box.y + box.height <= area.y + area.height

  it('stands round the gecko in a full circle, the first at the top, where the screen has room', () => {
    const gecko = { x: 600, y: 400, width: 120, height: 120 }
    const ring = geckoRing(gecko, area, 6)
    expect(ring.items).toHaveLength(6)
    expect(inside(ring.window)).toBe(true)
    const centre = { x: ring.gecko.x + 60, y: ring.gecko.y + 60 }
    const [first] = ring.items
    expect(first?.x).toBe(Math.round(centre.x))
    expect(first?.y).toBeLessThan(centre.y)
    const far = ring.items.map((one) => Math.round(Math.hypot(one.x - centre.x, one.y - centre.y)))
    expect(new Set(far).size).toBeLessThanOrEqual(2)
    expect(Math.min(...far)).toBeGreaterThan(60)
  })

  it('stays on the gecko screen in a corner, spread over the part of the circle that is on it', () => {
    for (const gecko of [
      { x: 1296, y: 49, width: 120, height: 120 },
      { x: 0, y: 25, width: 72, height: 72 },
      { x: 1120, y: 580, width: 320, height: 320 },
    ]) {
      const ring = geckoRing(gecko, area, 6)
      expect(ring.items).toHaveLength(6)
      expect(inside(ring.window)).toBe(true)
      for (const one of ring.items) {
        expect(one.x).toBeGreaterThanOrEqual(0)
        expect(one.y).toBeGreaterThanOrEqual(0)
        expect(one.x).toBeLessThanOrEqual(ring.window.width)
        expect(one.y).toBeLessThanOrEqual(ring.window.height)
      }
      for (const [at, one] of ring.items.entries())
        for (const other of ring.items.slice(at + 1)) expect(Math.hypot(one.x - other.x, one.y - other.y)).toBeGreaterThan(60 * ring.scale)
    }
  })

  it('scales with the gecko, between three quarters and full size', () => {
    expect(geckoRing({ x: 600, y: 400, width: 72, height: 72 }, area, 5).scale).toBe(0.75)
    expect(geckoRing({ x: 600, y: 300, width: 320, height: 320 }, area, 5).scale).toBe(1)
  })
})

describe('the gecko size and place', () => {
  it('keeps its side between 72 and 320 px', () => {
    expect([GECKO_MIN, GECKO_MAX]).toEqual([72, 320])
    expect(geckoSide(10)).toBe(72)
    expect(geckoSide(150.4)).toBe(150)
    expect(geckoSide(900)).toBe(320)
  })

  it('is moved, not shrunk, until all of it is on the screen it was dropped on', () => {
    const area = { x: 1440, y: 0, width: 1920, height: 1055 }
    expect(keptIn({ x: 1400, y: -20, width: 120, height: 120 }, area)).toEqual({ x: 1440, y: 0, width: 120, height: 120 })
    expect(keptIn({ x: 3300, y: 1000, width: 120, height: 120 }, area)).toEqual({ x: 3240, y: 935, width: 120, height: 120 })
    expect(keptIn({ x: 2000, y: 500, width: 120, height: 120 }, area)).toEqual({ x: 2000, y: 500, width: 120, height: 120 })
  })
})
