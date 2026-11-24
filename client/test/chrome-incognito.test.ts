import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterEach, expect, it, vi } from 'vitest'
import type { Reply } from '../src/cli/browser'
import type { TestBrowserRequest } from '../src/cli/testing'

const worker = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8')
const site = 'https://example.com/'
const newTab = 'chrome://newtab/'
const tabId = 12

function extension(url: string, incognito: boolean, paused = false) {
  const current = { id: tabId, url, incognito, windowId: 2, active: true, title: 'Test tab' }
  const regular = { id: 5, url: site, incognito: false, windowId: 1, active: true, title: 'Regular tab' }
  const noop = vi.fn()
  const event = { addListener: noop, removeListener: noop }
  const updates = new Set<(id: number, info: { status: string }) => void>()
  const update = vi.fn(async (_id: number, change: Pick<typeof current, 'url'>) => {
    current.url = change.url
    for (const notify of updates) notify(tabId, { status: 'complete' })
  })
  const attach = vi.fn(async () => {
    if (current.url.startsWith('chrome://')) throw new Error('Cannot access a chrome:// URL')
  })
  const detach = vi.fn(async () => {})
  const executeScript = vi.fn(async () => [{ result: { text: 'Example Domain' } }])
  let receive: ((request: TestBrowserRequest) => void) | undefined
  const port = {
    onMessage: { addListener(listener: typeof receive) { receive = listener } },
    onDisconnect: event,
    postMessage: vi.fn<(reply: Reply) => void>(),
  }
  runInNewContext(worker, {
    chrome: {
      storage: { session: { get: async () => ({}), set: noop }, local: { get: async () => ({ paused }) }, onChanged: event },
      runtime: { onMessage: event, onStartup: event, onInstalled: event, connectNative: () => port },
      alarms: { create: noop, onAlarm: event },
      windows: { onFocusChanged: event },
      tabs: {
        get: async (id: number) => id === tabId ? current : regular, query: async () => [regular, current], update,
        onRemoved: event, onCreated: event, onReplaced: event,
        onUpdated: { addListener: updates.add.bind(updates), removeListener: updates.delete.bind(updates) },
      },
      action: { setBadgeText: noop, setBadgeBackgroundColor: noop, setTitle: noop },
      debugger: { attach, detach, sendCommand: async () => ({}), onDetach: event, onEvent: event },
      scripting: { executeScript },
    },
    navigator: { userAgent: 'Chrome' },
    setTimeout, clearTimeout,
  })
  return { update, attach, detach, send(request: TestBrowserRequest) {
    return new Promise<Reply>((resolve) => {
      port.postMessage.mockImplementationOnce(resolve)
      receive?.(request)
    })
  } }
}

afterEach(() => vi.useRealTimers())

it('lists the incognito tab, navigates it in place, and can read the loaded website', async () => {
  vi.useFakeTimers()
  const chrome = extension(newTab, true)
  const listed = await chrome.send({ cmd: 'pages' })
  expect(await chrome.send({ cmd: 'text', tab: tabId })).toMatchObject({ ok: false, error: expect.stringContaining('does not let extensions read') })
  expect(await chrome.send({ cmd: 'go', tab: tabId, url: site })).toMatchObject({ ok: true, result: { id: tabId, url: site } })
  expect(chrome.update).toHaveBeenCalledExactlyOnceWith(tabId, { url: site })
  expect(chrome.attach).not.toHaveBeenCalled()
  expect(listed).toMatchObject({ ok: true, result: [{ id: 5 }, { id: tabId, incognito: true, url: newTab }] })
  expect(await chrome.send({ cmd: 'text', tab: tabId })).toMatchObject({ ok: true, result: { text: 'Example Domain' } })
})

it('keeps debugger-backed navigation for websites and refuses navigation from other privileged pages', async () => {
  vi.useFakeTimers()
  const chrome = extension(site, true)
  expect(await chrome.send({ cmd: 'go', tab: tabId, url: 'https://example.org/' })).toMatchObject({ ok: true })
  expect(chrome.attach).toHaveBeenCalledExactlyOnceWith({ tabId }, '1.3')
  expect(chrome.detach).toHaveBeenCalledExactlyOnceWith({ tabId })

  const settings = extension('chrome://settings/', true)
  expect(await settings.send({ cmd: 'go', tab: tabId, url: site })).toMatchObject({ ok: false, error: expect.stringContaining('Cannot access a chrome:// URL') })
  expect(settings.update).not.toHaveBeenCalled()
})

it('honors the Chrome pause switch for a new Incognito tab', async () => {
  vi.useFakeTimers()
  const chrome = extension(newTab, true, true)
  expect(await chrome.send({ cmd: 'go', tab: tabId, url: site })).toMatchObject({ ok: false, error: expect.stringContaining('paused GeckIt') })
  expect(chrome.update).not.toHaveBeenCalled()
})
