import { readFileSync } from 'node:fs'
import { URL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

const worker = readFileSync(new URL('../extension/background.js', import.meta.url), 'utf8')
const localFile = 'file:///D:/Code/design/preview.html'
const website = 'https://example.com/'

function chromeWorker() {
  const tab = { id: 12, url: website, title: 'Preview' }
  const event = { addListener() {}, removeListener() {} }
  const save = vi.fn(async () => {})
  const fileAccess = vi.fn(async () => false)
  const create = vi.fn(async ({ url }) => {
    tab.url = url
    return tab
  })
  const update = vi.fn(async (_id, { url }) => { tab.url = url })
  const run = runInNewContext(`${worker}\nrun`, {
    chrome: {
      storage: { session: { get: async () => ({}), set: save }, local: { get: async () => ({}) }, onChanged: event },
      runtime: { onMessage: event, onStartup: event, onInstalled: event },
      alarms: { create() {}, onAlarm: event },
      windows: { onFocusChanged: event },
      tabs: {
        get: async () => tab, create, update,
        onCreated: event, onRemoved: event, onReplaced: event,
        onUpdated: { ...event, addListener(listener) { listener(tab.id, { status: 'complete' }) } },
      },
      extension: { isAllowedFileSchemeAccess: fileAccess },
      debugger: { attach: async () => {}, detach: async () => {}, sendCommand: async () => ({}), onDetach: event, onEvent: event },
    },
    navigator: { userAgent: 'Chrome' },
    URL,
    setTimeout() {},
    clearTimeout() {},
  })
  return { run, fileAccess, create, update, save }
}

it.each(['open', 'go'])('checks local file access before %s and reads the setting again on retry', async (cmd) => {
  const { run, fileAccess, create, update, save } = chromeWorker()
  const request = { cmd, url: localFile, ...(cmd === 'go' ? { tab: 12 } : {}) }

  await expect(run(request)).rejects.toThrow('turn on Allow access to file URLs')
  expect(create).not.toHaveBeenCalled()
  expect(update).not.toHaveBeenCalled()
  expect(save).toHaveBeenLastCalledWith(expect.objectContaining({
    state: expect.objectContaining({ log: [expect.objectContaining({ error: expect.stringContaining('Chrome profile') })] }),
  }))

  fileAccess.mockResolvedValue(true)
  await expect(run(request)).resolves.toMatchObject({ url: localFile })
  expect(fileAccess).toHaveBeenCalledTimes(2)
  expect(cmd === 'open' ? create : update).toHaveBeenCalledOnce()
})

it('opens a web URL without checking local file access', async () => {
  const { run, fileAccess } = chromeWorker()

  await expect(run({ cmd: 'open', url: website })).resolves.toMatchObject({ url: website })
  expect(fileAccess).not.toHaveBeenCalled()
})
