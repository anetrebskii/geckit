import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Link } from '../src/renderer/src/link'
import type { Installed } from '../src/renderer/src/phone'
import type { LinkMessage } from '../src/shared/pairing'
import type { SessionItem, SessionItems } from '../src/shared/api'
import { collapse } from '../src/shared/steps'

const theirs = (id: string): SessionItem => ({ kind: 'theirs', id, text: id })

/** A Mac holding one conversation, answering over a link as the peer window does. */
function macWith(
  all: SessionItem[],
  old = false,
): { readonly link: Link; readonly asked: string[]; readonly tell: (value: SessionItems) => void } {
  const hearers: ((message: LinkMessage) => void)[] = []
  const asked: string[] = []
  const answer = (id: number, value: unknown, error?: string): void =>
    void Promise.resolve().then(() => hearers.forEach((hear) => hear({ t: 'reply', id, ...(error === undefined ? { value } : { error }) })))
  const link: Link = {
    send: (message) => {
      if (message.t !== 'call') return
      asked.push(message.name)
      const [, second, third] = message.args as [string, unknown, unknown]
      if (old && (message.name === 'chat.turns' || message.name === 'chat.turnsBefore' || message.name === 'chat.steps')) return answer(message.id, undefined, `No such call: ${message.name}`)
      if (message.name === 'chat.items') return answer(message.id, all)
      if (message.name === 'chat.steps') return answer(message.id, all.filter((one) => (second as string[]).includes(one.id)))
      if (message.name === 'chat.turns') {
        const folded = collapse(all)
        return answer(message.id, { items: folded.slice(-(second as number)), left: Math.max(0, folded.length - (second as number)) })
      }
      if (message.name === 'chat.turnsBefore') {
        const at = all.findIndex((one) => one.id === second)
        const start = Math.max(0, at - (third as number))
        return answer(message.id, { items: all.slice(start, at), left: start })
      }
      answer(message.id, null)
    },
    onMessage: (heard) => hearers.push(heard),
    onClose: () => undefined,
    close: () => undefined,
    screen: () => undefined,
    share: () => Promise.resolve(),
    compress: () => undefined,
  }
  const tell = (value: SessionItems): void => hearers.forEach((hear) => hear({ t: 'tell', channel: 'chat:items', value }))
  return { link, asked, tell }
}

describe('the phone over the link', () => {
  let install: (first: Link | undefined) => Installed

  beforeEach(async () => {
    vi.resetModules()
    vi.stubGlobal('window', { setTimeout, clearTimeout })
    vi.stubGlobal('document', { querySelector: () => null })
    const { installGeckit } = await import('../src/renderer/src/phone')
    install = (first) => installGeckit(first, { home: '/Users/a', platform: 'darwin' }, 'mac')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens a conversation on its end, and says how much is before it', async () => {
    const all = Array.from({ length: 100 }, (_one, at) => theirs(`m${String(at)}`))
    const { link } = macWith(all)
    install(link)
    const earlier: unknown[] = []
    window.geckit.chat.onEarlier((said) => earlier.push(said))
    const items = await window.geckit.chat.items('s1')
    expect(items).toEqual(all.slice(40))
    await new Promise((done) => setTimeout(done, 5))
    expect(earlier).toEqual([{ id: 's1', left: 40 }])
    const piece = await window.geckit.chat.before('s1', 'm40')
    expect(piece).toEqual({ items: all.slice(0, 40), left: 0 })
  })

  it('asks a Mac from before the pieces for all of it and cuts it here', async () => {
    const all = Array.from({ length: 70 }, (_one, at) => theirs(`m${String(at)}`))
    const { link, asked } = macWith(all, true)
    install(link)
    expect(await window.geckit.chat.items('s1')).toEqual(all.slice(10))
    expect(await window.geckit.chat.before('s1', 'm10')).toEqual({ items: all.slice(0, 10), left: 0 })
    expect(asked).toContain('chat.items')
  })

  it('keeps a run of steps open as it grows, asking only for the steps it has not got', async () => {
    const all: SessionItem[] = [{ kind: 'mine', id: 'm1', text: 'Fix it' }, { kind: 'did', id: 'd1', what: 'Read a.ts' }]
    const mac = macWith(all)
    install(mac.link)
    const told: SessionItems[] = []
    window.geckit.chat.onItems((said) => told.push(said))
    const items = await window.geckit.chat.items('s1')
    const run = items[1]
    expect(run?.kind).toBe('steps')
    if (run?.kind !== 'steps') return
    expect(await window.geckit.chat.steps('s1', run.ids)).toEqual([all[1]])
    all.push({ kind: 'did', id: 'd2', what: 'Ran npm test' })
    mac.tell({ id: 's1', items: [{ kind: 'steps', id: 'steps:d1', ids: ['d1', 'd2'], latest: 'Ran npm test' }] })
    await new Promise((done) => setTimeout(done, 5))
    expect(told.at(-1)).toEqual({ id: 's1', items: [all[1], all[2]] })
    expect(mac.asked.filter((name) => name === 'chat.steps')).toHaveLength(2)
  })

  it('brings the open conversation up to date after a new link, keeping what was before its end in order', async () => {
    const all = Array.from({ length: 100 }, (_one, at) => theirs(`m${String(at)}`))
    const first = macWith(all)
    const { swap } = install(first.link)
    await window.geckit.chat.items('s1')
    await window.geckit.chat.before('s1', 'm40')
    // The page holds all 100; while the link was down the conversation went on.
    const page = new Map(all.map((one) => [one.id, one]))
    const later = [...all, theirs('m100'), theirs('m101')]
    const told: SessionItems[] = []
    window.geckit.chat.onItems((said) => told.push(said))
    swap(macWith(later).link)
    await new Promise((done) => setTimeout(done, 5))
    const [said] = told
    expect(said).toBeDefined()
    for (const id of said?.gone ?? []) page.delete(id)
    for (const item of said?.items ?? []) page.set(item.id, item)
    expect([...page.keys()]).toEqual(later.map((one) => one.id))
  })

  it('puts what it had out of order back where the Mac has it after a new link', async () => {
    const all: SessionItem[] = [{ kind: 'mine', id: 'm1', text: 'Fix it' }, theirs('t1')]
    const first = macWith([theirs('t1'), { kind: 'mine', id: 'm1', text: 'Fix it' }])
    const { swap } = install(first.link)
    const page = new Map((await window.geckit.chat.items('s1')).map((one) => [one.id, one]))
    window.geckit.chat.onItems((said) => {
      for (const id of said.gone ?? []) page.delete(id)
      for (const item of said.items) page.set(item.id, item)
    })
    swap(macWith(all).link)
    await new Promise((done) => setTimeout(done, 5))
    expect([...page.keys()]).toEqual(['m1', 't1'])
  })
})
