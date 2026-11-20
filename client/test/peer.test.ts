import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Link } from '../src/renderer/src/link'
import type { LinkMessage } from '../src/shared/pairing'

let joined: (link: Link) => void = () => undefined
const shareJoins = new Map<string, (link: Link) => void>()
const shareCalls: unknown[][] = []
vi.mock('../src/renderer/src/link', () => ({
  listen: (pairing: { readonly key: string }, join: (link: Link) => void) => {
    if (pairing.key === 'k') joined = join
    else shareJoins.set(pairing.key, join)
    return () => undefined
  },
}))

interface Phone {
  readonly link: Link
  readonly sent: LinkMessage[]
  readonly say: (message: LinkMessage) => void
}

function phone(): Phone {
  const sent: LinkMessage[] = []
  const hearers: ((message: LinkMessage) => void)[] = []
  const link: Link = {
    send: (message) => sent.push(message),
    onMessage: (heard) => hearers.push(heard),
    onClose: () => undefined,
    close: () => undefined,
    screen: () => undefined,
    share: () => Promise.resolve(),
    compress: () => undefined,
  }
  return { link, sent, say: (message) => hearers.forEach((hear) => hear(message)) }
}

describe('what the peer window tells phones', () => {
  let tell: (channel: string, value: unknown) => void = () => undefined

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.resetModules()
    vi.stubGlobal('window', {
      setTimeout,
      geckit: {
        peer: {
          state: () => undefined,
          call: () => Promise.resolve(null),
          onTell: (said: (channel: string, value: unknown) => void) => {
            tell = said
          },
          pairing: () => Promise.resolve({ key: 'k', signal: 's' }),
          shares: () => Promise.resolve([{ id: 'link-1', key: 'link-key' }]),
          onShares: () => () => undefined,
          tabVideos: () => Promise.resolve([]),
          onTabVideo: () => () => undefined,
          share: (...args: unknown[]) => {
            shareCalls.push(args)
            return Promise.resolve({ kind: 'file', title: 'report.html', expiresAt: 1 })
          },
        },
      },
    })
    await import('../src/renderer/src/peer/main')
    await vi.runAllTimersAsync()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('answers a link page only about its own link, and nothing a phone may ask', async () => {
    const page = phone()
    shareJoins.get('link-key')?.(page.link)
    page.say({ t: 'call', id: 1, name: 'chat.items', args: ['any'] })
    page.say({ t: 'call', id: 2, name: 'manager.view', args: [] })
    page.say({ t: 'call', id: 3, name: 'share.about', args: [] })
    await vi.runAllTimersAsync()
    expect(page.sent).toEqual([
      { t: 'reply', id: 1, error: 'Not shared' },
      { t: 'reply', id: 2, error: 'Not shared' },
      { t: 'reply', id: 3, value: { kind: 'file', title: 'report.html', expiresAt: 1 } },
    ])
    expect(shareCalls).toEqual([['link-1', 'share.about', []]])
  })

  it('answers the obsolete old phone link only about the screen, and tells it to pair again for anything else', async () => {
    const one = phone()
    joined(one.link)
    one.say({ t: 'call', id: 1, name: 'link.can', args: [['steps']] })
    one.say({ t: 'call', id: 2, name: 'chat.send', args: [{ text: 'hi' }] })
    one.say({ t: 'call', id: 3, name: 'settings.get', args: [] })
    one.say({ t: 'call', id: 4, name: 'screen.control', args: [{ kind: 'move', x: 0.5, y: 0.5 }] })
    one.say({ t: 'call', id: 5, name: 'screen.stop', args: [] })
    await vi.runAllTimersAsync()
    expect(one.sent).toContainEqual({ t: 'reply', id: 1, value: { pairAgain: true } })
    expect(one.sent).toContainEqual({ t: 'reply', id: 2, error: 'Pair this phone again.' })
    expect(one.sent).toContainEqual({ t: 'reply', id: 3, error: 'Pair this phone again.' })
    expect(one.sent).toContainEqual({ t: 'reply', id: 4, value: null })
    expect(one.sent).toContainEqual({ t: 'reply', id: 5, value: null })
  })

  it('tells the old phone link nothing the computer says', () => {
    const one = phone()
    joined(one.link)
    tell('chat:sessions', [])
    tell('chat:notice', { session: 's1', title: 'Done', subtitle: '', body: '', asks: false })
    expect(one.sent).toEqual([])
  })
})
