import { afterEach, expect, it, vi } from 'vitest'
import { PNG } from 'pngjs'
import { askTest } from '../src/cli/browser'
import { tabHandoffs } from '../src/service/remote/tab-handoff'
import { nodeListen } from '../src/service/remote/transport'
import { readTabHandoff, TAB_HANDOFF_TTL, tabHandoffRequest } from '../src/shared/live-view'
import type { TabHandoffAction, TabHandoffReply } from '../src/shared/live-view'
import type { RemoteChannel } from '../src/shared/remote/protocol'

vi.mock('../src/cli/browser', () => ({ askTest: vi.fn() }))
vi.mock('../src/service/remote/transport', () => ({ nodeListen: vi.fn() }))

const browser = vi.mocked(askTest)
const listen = vi.mocked(nodeListen)
const target = { name: 'test', tab: 42, conversation: 'a' }
let handoffs: ReturnType<typeof tabHandoffs> | undefined
afterEach(() => { handoffs?.dispose(); handoffs = undefined; vi.useRealTimers(); vi.resetAllMocks() })

function visitor() {
  let receive: Parameters<RemoteChannel['onMessage']>[0] | undefined
  let close: Parameters<RemoteChannel['onClose']>[0] | undefined
  let id = 0
  const replies: TabHandoffReply[] = []
  const channel: RemoteChannel = {
    binding: Promise.resolve('fixture'),
    onMessage: (listener) => { receive = listener },
    onClose: (listener) => { close = listener },
    close: () => close?.(),
    send: (text) => replies.push(JSON.parse(text) as TabHandoffReply),
  }
  listen.mock.calls[0]?.[1](channel)
  return { replies, ask: (action: TabHandoffAction) => receive?.(JSON.stringify({ ...action, id: ++id })), close: channel.close }
}

it('gives only the first viewer the existing tab and returns it on window close', async () => {
  listen.mockReturnValue(vi.fn())
  browser.mockResolvedValue({ ok: true })
  handoffs = tabHandoffs()
  const done = vi.fn()
  const made = await handoffs.issue(target, done)
  const url = new URL(made.link)
  expect(url.pathname).toBe('/browser')
  expect(url.searchParams.get('view')).toMatch(/^[0-9a-f-]{36}$/)
  expect(url.search.includes(readTabHandoff(url.hash)?.key ?? '')).toBe(false)
  expect(readTabHandoff(url.hash)?.expires).toBe(made.expires)
  expect(browser).toHaveBeenCalledTimes(1)

  const first = visitor()
  const second = visitor()
  first.ask({ type: 'open' })
  second.ask({ type: 'open' })
  await vi.waitFor(() => expect(first.replies[0]).toMatchObject({ ok: true, profile: target.name }))
  expect(second.replies[0]).toMatchObject({ ok: false, error: expect.stringContaining('already used') })
  expect(browser.mock.calls[1]?.[1]).toMatchObject({ cmd: 'view-handoff', tab: target.tab, conversation: target.conversation })
  first.close()
  await vi.waitFor(() => expect(browser.mock.calls[2]?.[1]).toMatchObject({ cmd: 'view-close' }))
  second.ask({ type: 'open' })
  expect(second.replies[1]).toMatchObject({ ok: false, error: expect.stringContaining('already used') })
  expect(browser).toHaveBeenCalledTimes(3)
  expect(done).not.toHaveBeenCalled()
})

it.each([true, false])('signals Done once only when release succeeds (%s)', async (released) => {
  listen.mockReturnValue(vi.fn())
  browser.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: released })
  const done = vi.fn()
  handoffs = tabHandoffs()
  await handoffs.issue(target, done)
  const view = visitor()
  view.ask({ type: 'open' })
  await vi.waitFor(() => expect(view.replies[0]).toMatchObject({ ok: true }))
  expect(done).not.toHaveBeenCalled()
  view.ask({ type: 'end' })
  view.ask({ type: 'end' })
  await vi.waitFor(() => expect(view.replies[1]).toMatchObject({ ok: released }))
  view.close()
  expect(done).toHaveBeenCalledTimes(released ? 1 : 0)
  expect(browser.mock.calls[2]?.[1]).toMatchObject({ cmd: 'view-close' })
})

it('refuses a foreign tab and never starts a view for an expired link', async () => {
  const now = Date.now()
  const stop = vi.fn()
  listen.mockReturnValue(stop)
  browser.mockResolvedValueOnce({ ok: false, error: 'This tab belongs to another conversation.' }).mockResolvedValue({ ok: true })
  handoffs = tabHandoffs()
  await expect(handoffs.issue(target)).rejects.toThrow('another conversation')
  expect(listen).not.toHaveBeenCalled()
  vi.useFakeTimers()
  vi.setSystemTime(now)
  await handoffs.issue(target)
  const late = visitor()
  vi.setSystemTime(now + TAB_HANDOFF_TTL)
  late.ask({ type: 'open' })
  expect(late.replies[0]).toMatchObject({ ok: false, error: expect.stringContaining('expired') })
  expect(browser).toHaveBeenCalledTimes(2)
})

it('releases an expired view without a completion signal', async () => {
  vi.useFakeTimers()
  const now = Date.now()
  listen.mockReturnValue(vi.fn())
  browser.mockResolvedValue({ ok: true })
  const done = vi.fn()
  handoffs = tabHandoffs()
  await handoffs.issue(target, done)
  const view = visitor()
  view.ask({ type: 'open' })
  await vi.waitFor(() => expect(view.replies[0]).toMatchObject({ ok: true }))
  vi.setSystemTime(now + TAB_HANDOFF_TTL)
  view.ask({ type: 'end' })
  await vi.waitFor(() => expect(browser.mock.calls[2]?.[1]).toMatchObject({ cmd: 'view-close' }))
  expect(done).not.toHaveBeenCalled()
})

it('restricts incoming controls to typed text, page keys, clicks and scrolling', () => {
  const read = (input: object) => tabHandoffRequest(JSON.stringify({ id: 1, type: 'input', input }))
  expect(read({ type: 'key', key: 'Enter' })).toMatchObject({ input: { key: 'Enter' } })
  expect(read({ type: 'click', x: 230, y: 444 })).toMatchObject({ input: { x: 230, y: 444 } })
  expect(read({ type: 'key', key: 'Control+L' })).toBeUndefined()
  expect(read({ type: 'go', url: 'https://example.com' })).toBeUndefined()
})

it('sends pixels only when the frame changes for a viewer that accepts cached frames', async () => {
  listen.mockReturnValue(vi.fn())
  const frame = { jpeg: 'frame', url: 'https://example.com', title: 'Example', width: 1280, height: 800 }
  const moved = { ...frame, caret: { x: 10, y: 20, height: 15 } }
  browser.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({ ok: true, result: frame })
    .mockResolvedValueOnce({ ok: true, result: { ...frame } })
    .mockResolvedValueOnce({ ok: true, result: moved })
    .mockResolvedValueOnce({ ok: true, result: moved })
  handoffs = tabHandoffs()
  await handoffs.issue(target)
  const viewer = visitor()
  viewer.ask({ type: 'open' })
  viewer.ask({ type: 'frame', acceptUnchanged: true })
  viewer.ask({ type: 'frame', acceptUnchanged: true })
  viewer.ask({ type: 'frame', acceptUnchanged: true })
  viewer.ask({ type: 'frame' })
  await vi.waitFor(() => expect(viewer.replies.slice(1)).toEqual([
    { id: 2, ok: true, frame },
    { id: 3, ok: true, unchanged: true },
    { id: 4, ok: true, frame: moved },
    { id: 5, ok: true, frame: moved },
  ]))
})

it('sends a lossless rectangle for small changes and a full image for navigation or large changes', async () => {
  listen.mockReturnValue(vi.fn())
  const pixels = new PNG({ width: 30, height: 20 })
  for (let i = 0; i < pixels.data.length; i++) pixels.data[i] = (i * 17 + (i >> 3)) % 256
  const frame = { width: pixels.width, height: pixels.height, url: 'https://example.com/', title: 'Example', png: PNG.sync.write(pixels).toString('base64') }
  const at = (10 * pixels.width + 5) * 4
  pixels.data[at] = (pixels.data[at]! + 1) % 256
  const typed = { ...frame, png: PNG.sync.write(pixels).toString('base64') }
  const blank = new PNG({ width: pixels.width, height: pixels.height })
  blank.data.fill(255)
  const scrolled = { ...frame, png: PNG.sync.write(blank).toString('base64') }
  const navigated = { ...scrolled, url: 'https://example.com/next' }
  browser.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: true })
    .mockResolvedValueOnce({ ok: true, result: frame }).mockResolvedValueOnce({ ok: true, result: typed })
    .mockResolvedValueOnce({ ok: true, result: typed }).mockResolvedValueOnce({ ok: true, result: scrolled }).mockResolvedValueOnce({ ok: true, result: navigated })
  handoffs = tabHandoffs()
  await handoffs.issue(target)
  const viewer = visitor()
  viewer.ask({ type: 'open' })
  for (let i = 0; i < 5; i++) viewer.ask({ type: 'frame', acceptPatches: true, acceptUnchanged: true })
  await vi.waitFor(() => expect(viewer.replies).toHaveLength(6))
  expect(browser.mock.calls[2]?.[1]).toMatchObject({ cmd: 'view-frame', patches: true })
  expect(viewer.replies[1]).toEqual({ id: 2, ok: true, frame })
  const changed = viewer.replies[2]
  if (!changed?.ok || changed.patch === undefined) throw new Error('Expected a patch')
  expect(changed.frame).toEqual({ ...typed, png: '' })
  expect(changed.patch).toMatchObject({ x: 5, y: 10 })
  const decoded = PNG.sync.read(Buffer.from(changed.patch.png, 'base64'))
  expect(decoded).toMatchObject({ width: 1, height: 1 })
  const restored = PNG.sync.read(Buffer.from(frame.png, 'base64')).data
  decoded.data.copy(restored, at)
  expect(restored.equals(pixels.data)).toBe(true)
  expect(viewer.replies[3]).toEqual({ id: 4, ok: true, unchanged: true })
  expect(viewer.replies[4]).toEqual({ id: 5, ok: true, frame: scrolled })
  expect(viewer.replies[5]).toEqual({ id: 6, ok: true, frame: navigated })
})
