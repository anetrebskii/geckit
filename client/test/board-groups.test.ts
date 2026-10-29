import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { BackgroundTask, ChatSession } from '../src/shared/api'

import { byDay } from '../src/renderer/src/chat/time'

vi.stubGlobal('window', { geckit: { platform: 'darwin' } })
vi.stubGlobal('document', { documentElement: { classList: { contains: () => false } } })
vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined })

const { Board } = await import('../src/renderer/src/chat/Board')
const { PhoneBoard } = await import('../src/renderer/src/chat/PhoneBoard')
const { useChat } = await import('../src/renderer/src/chat/useChat')

const session: ChatSession = { id: 'session', root: '/work/project', title: 'Fixture conversation', stands: 'Ready', state: 'idle', at: 1, here: true, mode: 'auto' }
const task: BackgroundTask = { id: 'command', kind: 'local_bash', status: 'running', what: 'Checking', started: 1 }

function drawn(phone: boolean, rows: readonly ChatSession[]): string {
  function Fixture(): React.JSX.Element {
    const defaults = useChat()
    const chat = { ...defaults, settings: { ...DEFAULT_SETTINGS, projects: [session.root] }, sessions: rows, everyone: rows, listed: true, lineup: { working: rows.filter((row) => row.state === 'working').length, limit: 6 } }
    return phone
      ? createElement(PhoneBoard, { chat, onNew: () => undefined, onScreen: () => undefined, onSay: () => undefined, onShortcut: () => undefined, onShortcuts: () => undefined })
      : createElement(Board, { chat, onShortcutFrom: () => undefined })
  }
  return renderToStaticMarkup(createElement(Fixture))
}

for (const phone of [false, true]) {
  describe(`${phone ? 'phone' : 'desktop'} work groups`, () => {
    const inGroup = (html: string, title: string): string => {
      const heading = phone ? `<div class="phone-head">${title}</div>` : `${title}<span class="spacer"`
      const start = html.indexOf(heading)
      if (start === -1) return ''
      const next = html.indexOf(phone ? '<div class="phone-head">' : '<div class="board-day"', start + heading.length)
      return html.slice(start, next === -1 ? html.length : next)
    }

    it('keeps three active turns separate from a fourth conversation with background work', () => {
      const rows = [1, 2, 3].map((id): ChatSession => ({ ...session, id: String(id), title: `Active ${String(id)}`, state: 'working' }))
      const html = drawn(phone, [...rows, { ...session, title: 'Background command', tasks: [task] }])
      expect(inGroup(html, 'Working')).toContain('Active 1')
      expect(inGroup(html, 'Working')).toContain('Active 3')
      expect(inGroup(html, 'Working')).not.toContain('Background command')
      expect(inGroup(html, 'In the background')).toContain('Background command')
      expect(html.match(/Background command/g)).toHaveLength(1)
      expect(html).toContain(phone ? '3/6' : '3 of 6 working')
    })

    it('moves an active turn through background work back to its saved order', () => {
      expect(inGroup(drawn(phone, [{ ...session, state: 'working', tasks: [task] }]), 'Working')).toContain(session.title)
      expect(inGroup(drawn(phone, [{ ...session, tasks: [task] }]), 'In the background')).toContain(session.title)
      const idle = drawn(phone, [{ ...session, tasks: [{ ...task, status: 'completed' }] }])
      expect(inGroup(idle, 'Working')).toBe('')
      expect(inGroup(idle, 'In the background')).toBe('')
      expect(idle).toContain(session.title)
    })

    it('groups helpers and shell commands as background while keeping input requests under Needs you', () => {
      for (const change of [{ tasks: [{ ...task, kind: 'local_agent' }] }, { tasks: [{ ...task, kind: 'monitor' }] }, { runs: 'build' }] satisfies readonly Partial<ChatSession>[]) {
        expect(inGroup(drawn(phone, [{ ...session, ...change }]), 'In the background')).toContain(session.title)
      }
      const typing = drawn(phone, [{ ...session, runs: 'login', typing: true }])
      expect(inGroup(typing, 'Needs you')).toContain(session.title)
      expect(inGroup(typing, 'In the background')).toBe('')
      const asking = drawn(phone, [{ ...session, state: 'asks', tasks: [task] }])
      expect(inGroup(asking, 'Needs you')).toContain(session.title)
      expect(inGroup(asking, 'In the background')).toBe('')
    })
  })
}

describe('Done by the day', () => {
  const card = (id: string, since: number | undefined, at = 0): ChatSession => ({ id, root: '/work', title: id, stands: '', state: 'idle', at, here: true, mode: 'auto', ...(since === undefined ? {} : { since }) })
  const now = new Date(2026, 9, 29, 15).getTime()
  const day = (date: number, hour = 12): number => new Date(2026, 9, date, hour).getTime()

  it('stands each card under the day it was closed, the newest day first, keeping the order by hand within a day', () => {
    const days = byDay([card('a', day(27)), card('b', day(29, 9)), card('c', day(28)), card('d', day(29, 14)), card('e', undefined, day(28, 8))], now)
    expect(days.map((one) => one.heading)).toEqual(['Today', 'Yesterday', new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(day(27))])
    expect(days.map((one) => one.rows.map((row) => row.id))).toEqual([['b', 'd'], ['c', 'e'], ['a']])
  })
})
