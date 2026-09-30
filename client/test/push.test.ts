import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { newKey, roomOf, unseal } from '../src/shared/pairing'

const folder = mkdtempSync(join(tmpdir(), 'geckit-push-'))
vi.mock('electron', () => ({ app: { getPath: () => folder } }))
vi.mock('electron-log', () => ({ default: { info: vi.fn(), warn: vi.fn() } }))

const { boxFor, keepToken, pushTo } = await import('../src/main/push')

const notice = { session: 's1', title: 'Needs an answer - geckit', subtitle: 'Push', body: 'x'.repeat(1000), asks: true }
const token = 'ab'.repeat(32)

afterEach(() => vi.unstubAllGlobals())

describe('a push to the phone', () => {
  it('is sealed with the pairing key, in the room the phone knows it by, and cut to fit', async () => {
    const key = newKey()
    const { room, box } = await boxFor(key, notice)
    expect(room).toBe(await roomOf(key))
    const opened = await unseal<{ session: string; body: string; asks?: boolean }>(key, box)
    expect(opened?.session).toBe('s1')
    expect(opened?.body).toHaveLength(400)
    expect(opened?.asks).toBeUndefined()
    expect(box.length).toBeLessThan(3000)
  })

  it('goes to each token of this pairing, and drops one Apple says is gone', async () => {
    const key = newKey()
    keepToken(key, token)
    keepToken(key, token.toUpperCase())
    keepToken(key, 'not a token')
    const sent = vi.fn(() => Promise.resolve(new Response('{}', { status: 410 })))
    vi.stubGlobal('fetch', sent)
    await pushTo(key, notice)
    expect(sent).toHaveBeenCalledTimes(1)
    expect(JSON.parse(readFileSync(join(folder, 'push.json'), 'utf8'))).toEqual({ key, tokens: [] })
  })

  it('sends nothing for a new code, whose phones have not said where they are', async () => {
    keepToken(newKey(), token)
    const sent = vi.fn()
    vi.stubGlobal('fetch', sent)
    await pushTo(newKey(), notice)
    expect(sent).not.toHaveBeenCalled()
  })
})
