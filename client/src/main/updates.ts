import { app } from 'electron'
import updater from 'electron-updater'

import type { UpdateChannel, UpdateView } from '../shared/api'

const { autoUpdater, CancellationToken } = updater

/**
 * Keeping GeckIt current, as Notula Collect does.
 *
 * Checked on launch and every hour; a newer version downloads in the background
 * and installs when the app restarts. A restart asked for while Claude is still
 * working in a conversation waits for it to finish.
 *
 * Every build is published as a prerelease, which is Development; the one
 * promoted is marked Latest, which is Stable and what the website links at.
 */

// Squirrel.Mac refuses to swap in a bundle without a Developer ID signature; the NSIS updater and the AppImage check none.
const SIGNED = __SIGNED__ || process.platform !== 'darwin'
const FIRST_CHECK = 10_000
const EVERY = 60 * 60 * 1000

let view: UpdateView = {
  state: app.isPackaged ? 'fresh' : 'off',
  version: app.getVersion(),
  offered: '',
  channel: 'stable',
  percent: 0,
  message: app.isPackaged ? '' : 'Updates are off in a development build.',
  waitingFor: [],
}
let changed: (view: UpdateView) => void = () => undefined
let running: () => readonly string[] = () => []
let round = 0
let started = false

export const updateView = (): UpdateView => view

function tell(next: Partial<UpdateView>): void {
  view = { ...view, ...next }
  changed(view)
}

function order(a: string, b: string): number {
  const x = a.split('.').map(Number)
  const y = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0)
  return 0
}

function failure(error: unknown): Partial<UpdateView> {
  const text = `${(error as { code?: string }).code ?? ''} ${error instanceof Error ? error.message : String(error)}`
  if (/ERR_UPDATER_CHANNEL_FILE_NOT_FOUND|ERR_UPDATER_LATEST_VERSION_NOT_FOUND|ERR_UPDATER_NO_PUBLISHED_VERSIONS/.test(text)) {
    return { state: 'empty' }
  }
  if (/sha512 checksum mismatch/i.test(text)) {
    return { state: 'failed', message: `Could not update: the download of ${view.offered} was damaged. It downloads again at the next check.` }
  }
  if (/ERR_INTERNET_DISCONNECTED|ERR_NAME_NOT_RESOLVED|ERR_NETWORK_CHANGED|ERR_CONNECTION|ERR_TIMED_OUT|ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ETIMEDOUT/.test(text)) {
    return { state: 'failed', message: 'Could not check for updates: the network is offline.' }
  }
  const status = /HttpError: (\d{3})/.exec(text)?.[1]
  if (status !== undefined) return { state: 'failed', message: `Could not check for updates: GitHub answered ${status}.` }
  return { state: 'failed', message: `Could not check for updates: ${text.trim().split('\n')[0] ?? ''}` }
}

export async function checkForUpdates(): Promise<UpdateView> {
  if (['off', 'checking', 'downloading', 'waiting'].includes(view.state)) return view
  const ready = view.state === 'ready'
  const mine = ++round
  if (!ready) tell({ state: 'checking', message: '' })
  try {
    const offered = (await autoUpdater.checkForUpdates())?.updateInfo.version ?? ''
    if (mine !== round) return view
    const newer = order(offered, view.version) > 0
    if (ready && (!newer || offered === view.offered)) return view
    if (!newer) {
      tell({ state: order(offered, view.version) === 0 ? 'current' : 'behind', offered })
      return view
    }
    if (!SIGNED) {
      tell({ state: 'failed', offered, message: 'Could not update: this copy is not signed with a Developer ID.' })
      return view
    }
    if (process.platform === 'darwin' && !app.isInApplicationsFolder()) {
      tell({ state: 'failed', offered, message: 'Could not update: move GeckIt to Applications first.' })
      return view
    }
    tell({ state: 'downloading', offered, percent: 0 })
    await autoUpdater.downloadUpdate(new CancellationToken())
    if (mine === round) tell({ state: 'ready', percent: 100 })
  } catch (error) {
    if (mine === round) tell(failure(error))
  }
  return view
}

export function restartToUpdate(): void {
  if (view.state !== 'ready') return
  const now = running()
  if (now.length === 0) {
    autoUpdater.quitAndInstall(true, true)
    return
  }
  tell({ state: 'waiting', waitingFor: now })
  const timer = setInterval(() => {
    const still = running()
    if (still.length > 0) {
      if (still.length !== view.waitingFor.length) tell({ waitingFor: still })
      return
    }
    clearInterval(timer)
    autoUpdater.quitAndInstall(true, true)
  }, 2000)
}

/** Read this channel from now on, and look at once, because the person is looking at the menu they changed it in. */
export function follow(channel: UpdateChannel): void {
  if (!started || channel === view.channel) return
  if (view.state !== 'off') autoUpdater.allowPrerelease = channel === 'dev'
  // A check already out is asking the old channel, so its answer is dropped and the question asked again.
  if (view.state === 'checking') {
    round++
    view = { ...view, state: 'fresh' }
  }
  tell({ channel })
  void checkForUpdates()
}

export function startUpdates(hooks: {
  readonly changed: (view: UpdateView) => void
  readonly channel: UpdateChannel
  /** The conversations a restart would stop, by name. */
  readonly running: () => readonly string[]
  readonly wanted: () => boolean
}): void {
  ;({ changed, running } = hooks)
  view = { ...view, channel: hooks.channel }
  started = true
  if (view.state === 'off') return
  autoUpdater.allowPrerelease = hooks.channel === 'dev'
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = SIGNED
  autoUpdater.logger = null
  // Every failure is caught where it is asked for; without a listener the emitter throws it again.
  autoUpdater.on('error', () => undefined)
  autoUpdater.on('download-progress', (progress) => {
    if (view.state === 'downloading') tell({ percent: Math.floor(progress.percent) })
  })
  const scheduled = (): void => {
    if (hooks.wanted()) void checkForUpdates()
  }
  setTimeout(scheduled, FIRST_CHECK)
  setInterval(scheduled, EVERY)
}
