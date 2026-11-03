import { beforeAll, describe, expect, it, vi } from 'vitest'

import { DEFAULT_SETTINGS, UPDATE_CHANNELS, channelLabel, updateText } from '../src/shared/api'
import type { UpdateView } from '../src/shared/api'

const feed = vi.hoisted(() => ({
  version: '1.6.0',
  asked: [] as boolean[],
  downloaded: 0,
}))

vi.stubGlobal('__SIGNED__', true)
vi.mock('electron', () => ({
  app: { isPackaged: true, getVersion: () => '1.5.0', isInApplicationsFolder: () => true },
}))
vi.mock('electron-updater', () => {
  const autoUpdater = {
    allowPrerelease: false,
    on: vi.fn(),
    checkForUpdates: vi.fn(() => {
      feed.asked.push(autoUpdater.allowPrerelease)
      return Promise.resolve({ updateInfo: { version: feed.version } })
    }),
    downloadUpdate: vi.fn(() => {
      feed.downloaded++
      return Promise.resolve([])
    }),
    quitAndInstall: vi.fn(),
  }
  return { default: { autoUpdater, CancellationToken: class {} } }
})

const { checkForUpdates, follow, startUpdates, updateView } = await import('../src/main/updates')

const view = (change: Partial<UpdateView>): UpdateView => ({
  state: 'fresh',
  version: '1.6.0',
  offered: '',
  channel: 'stable',
  percent: 0,
  message: '',
  waitingFor: [],
  ...change,
})

describe('the channels', () => {
  it('starts a new copy on Stable', () => {
    expect(DEFAULT_SETTINGS.updateChannel).toBe('stable')
    expect(UPDATE_CHANNELS.map((one) => one.value)).toEqual(['stable', 'dev'])
  })

  it('names them the same way everywhere', () => {
    expect(channelLabel('dev')).toBe('Development')
    expect(channelLabel('nonsense' as never)).toBe('Stable')
  })

  it('says which channel is behind or empty', () => {
    expect(updateText(view({ state: 'behind', offered: '1.5.0' }))).toBe('Stable is on 1.5.0, older than this version.')
    expect(updateText(view({ state: 'empty', channel: 'dev' }))).toBe('There is no development build yet.')
  })
})

describe('following a channel', () => {
  beforeAll(() => {
    vi.useFakeTimers()
    startUpdates({ changed: () => undefined, channel: 'stable', running: () => [], wanted: () => false })
  })

  it('reads Stable without prereleases and downloads a newer build', async () => {
    feed.version = '1.6.0'
    const after = await checkForUpdates()
    expect(feed.asked).toEqual([false])
    expect(after).toMatchObject({ state: 'ready', offered: '1.6.0', channel: 'stable' })
  })

  it('asks again with prereleases the moment Development is chosen', async () => {
    feed.version = '1.7.0'
    follow('dev')
    await vi.waitFor(() => expect(updateView().offered).toBe('1.7.0'))
    expect(feed.asked.at(-1)).toBe(true)
    expect(updateView()).toMatchObject({ state: 'ready', channel: 'dev' })
    expect(feed.downloaded).toBe(2)
  })

  it('does nothing when the channel has not changed', () => {
    const before = feed.asked.length
    follow('dev')
    expect(feed.asked.length).toBe(before)
  })

  it('trades a downloaded development build for Stable, when Stable is still newer than this copy', async () => {
    feed.version = '1.6.0'
    follow('stable')
    await vi.waitFor(() => expect(updateView().offered).toBe('1.6.0'))
    await vi.waitFor(() => expect(updateView().state).toBe('ready'))
    expect(feed.asked.at(-1)).toBe(false)
    expect(feed.downloaded).toBe(3)
  })

  it('never steps back to a channel older than this copy', async () => {
    feed.version = '1.4.0'
    follow('dev')
    await vi.waitFor(() => expect(updateView().channel).toBe('dev'))
    await vi.waitFor(() => expect(feed.asked.at(-1)).toBe(true))
    expect(updateView()).toMatchObject({ state: 'ready', offered: '1.6.0' })
    expect(feed.downloaded).toBe(3)
  })
})

describe('restarting with an independent service', () => {
  async function ready(beforeRestart: () => Promise<void>, running: () => readonly string[] = () => []) {
    vi.resetModules()
    const updates = await import('../src/main/updates')
    const { default: updater } = await import('electron-updater')
    vi.mocked(updater.autoUpdater.quitAndInstall).mockClear()
    feed.version = '1.6.0'
    updates.startUpdates({ changed: () => undefined, channel: 'stable', running, wanted: () => false, beforeRestart })
    await updates.checkForUpdates()
    expect(updates.updateView().state).toBe('ready')
    return { updates, updater: updater.autoUpdater }
  }

  it('awaits service shutdown before installation and prevents plain Quit from bypassing it', async () => {
    let release: () => void = () => undefined
    const stopped = new Promise<void>((resolve) => { release = resolve })
    const beforeRestart = vi.fn(() => stopped)
    const { updates, updater } = await ready(beforeRestart)
    expect(updater.autoInstallOnAppQuit).toBe(false)
    updates.restartToUpdate()
    updates.restartToUpdate()
    expect(beforeRestart).toHaveBeenCalledTimes(1)
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    release()
    await vi.waitFor(() => expect(updater.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true))
  })

  it('leaves desktop open with an error when the service refuses shutdown', async () => {
    const { updates, updater } = await ready(async () => { throw new Error('A conversation is still working.') })
    updates.restartToUpdate()
    await vi.waitFor(() => expect(updates.updateView()).toMatchObject({ state: 'failed', message: 'Could not restart to update: A conversation is still working.', waitingFor: [] }))
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('waits for working conversations before asking the service to stop', async () => {
    let working = ['Task in progress']
    const beforeRestart = vi.fn(async () => undefined)
    const { updates, updater } = await ready(beforeRestart, () => working)
    updates.restartToUpdate()
    expect(updates.updateView()).toMatchObject({ state: 'waiting', waitingFor: ['Task in progress'] })
    await vi.advanceTimersByTimeAsync(2_000)
    expect(beforeRestart).not.toHaveBeenCalled()
    expect(updater.quitAndInstall).not.toHaveBeenCalled()
    working = []
    await vi.advanceTimersByTimeAsync(2_000)
    expect(beforeRestart).toHaveBeenCalledTimes(1)
    expect(updater.quitAndInstall).toHaveBeenCalledExactlyOnceWith(true, true)
  })
})
