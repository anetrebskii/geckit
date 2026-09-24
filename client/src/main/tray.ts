import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

import { Menu, nativeImage, Tray } from 'electron'
import type { MenuItemConstructorOptions, NativeImage } from 'electron'

import appIcon from '../../assets/icons/32x32.png?asset'
import template from '../../assets/trayTemplate.png?asset'
import template2x from '../../assets/trayTemplate@2x.png?asset'
import { shownProjects } from '../shared/api'
import { describeTime, nextTimed } from '../shared/schedule'
import { getSettings } from './store'

export interface TrayDeps {
  readonly openChat: (session?: string) => void
  readonly openPanel: () => void
  /** The shortcuts in the Chat window: the list, `new`, or one of them by id to edit. */
  readonly manage: (edit: string) => void
  readonly run: (id: string) => void
  readonly busy: (id: string) => boolean
}

let tray: Tray | undefined
let deps: TrayDeps | undefined
let drawn = ''

/** On a Mac, black on clear, which the menu bar colours for itself; elsewhere the app's own icon. */
function image(): NativeImage {
  if (process.platform !== 'darwin') return nativeImage.createFromBuffer(readFileSync(appIcon))
  const made = nativeImage.createFromBuffer(readFileSync(template), { scaleFactor: 1 })
  made.addRepresentation({ scaleFactor: 2, buffer: readFileSync(template2x) })
  made.setTemplateImage(true)
  return made
}

export function startTray(given: TrayDeps): void {
  deps = given
  tray = new Tray(image())
  tray.setToolTip('GeckIt')
  drawTray()
  // "Tomorrow" turns into "Today" with nothing else changing.
  setInterval(drawTray, 60_000)
}

/** Built again only when something it says has changed, since it is asked on every change in any conversation. */
export function drawTray(): void {
  if (tray === undefined || deps === undefined) return
  const now = Date.now()
  // Another profile's shortcuts run all the same, and are listed only where that profile is in use.
  const shown = shownProjects(getSettings())
  const rows = getSettings()
    .shortcuts.filter((one) => shown.includes(one.root))
    .map((one) => {
      const next = nextTimed(one, now)
      const when =
        one.lastSession !== undefined && deps?.busy(one.lastSession) === true
          ? 'running now'
          : next === undefined
            ? undefined
            : `next ${describeTime(next, now).replace(/^[A-Z]/, (first) => first.toLowerCase())}`
      return { one, says: when === undefined ? basename(one.root) : `${basename(one.root)}, ${when}` }
    })
  const key = JSON.stringify(rows.map(({ one, says }) => [one.id, one.name, says]))
  if (key === drawn) return
  drawn = key

  const mac = process.platform === 'darwin'
  const items: MenuItemConstructorOptions[] = [
    { label: 'Open Chat', click: () => deps?.openChat() },
    { label: 'Correct and Transcribe', click: () => deps?.openPanel() },
    { type: 'separator' },
    { label: 'Shortcuts', enabled: false },
    ...rows.map(
      ({ one, says }): MenuItemConstructorOptions => ({
        // A second line is a Mac's only.
        label: mac ? one.name : `${one.name} (${says})`,
        ...(mac ? { sublabel: says } : {}),
        toolTip: one.prompt,
        click: () => deps?.run(one.id),
      }),
    ),
    { label: 'New Shortcut...', click: () => deps?.manage('new') },
    ...(rows.length === 0 ? [] : [{ label: 'Manage Shortcuts...', click: () => deps?.manage('list') }]),
    { type: 'separator' },
    { label: 'Quit GeckIt', role: 'quit' },
  ]
  tray.setContextMenu(Menu.buildFromTemplate(items))
}
