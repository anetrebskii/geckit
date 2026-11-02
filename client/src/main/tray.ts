import { readFileSync } from 'node:fs'
import { basename } from 'node:path'

import { app, Menu, nativeImage, Tray } from 'electron'
import type { MenuItemConstructorOptions, NativeImage } from 'electron'

import appIcon from '../../assets/icons/32x32.png?asset'
import asleep from '../../assets/trayAsleepTemplate.png?asset'
import asleep2x from '../../assets/trayAsleepTemplate@2x.png?asset'
import template from '../../assets/trayTemplate.png?asset'
import template2x from '../../assets/trayTemplate@2x.png?asset'
import waiting from '../../assets/trayWaitingTemplate.png?asset'
import waiting2x from '../../assets/trayWaitingTemplate@2x.png?asset'
import working from '../../assets/trayWorkingTemplate.png?asset'
import working2x from '../../assets/trayWorkingTemplate@2x.png?asset'
import { assistantsIn, shownProjects } from '../shared/api'
import type { Employee } from '../shared/employees'
import type { GeckoPose } from '../shared/gecko'
import { isRemote } from '../shared/hosts'
import { llmProviderInfo } from '../shared/providers'
import { describeTime, nextTimed } from '../shared/schedule'
import { getSettings, setSettings } from './store'

export interface TrayDeps {
  readonly openChat: (session?: string) => void
  readonly openPanel: () => void
  /** The shortcuts in the Chat window: the list, `new`, or one of them by id to edit. */
  readonly manage: (edit: string) => void
  readonly run: (id: string) => void
  readonly busy: (id: string) => boolean
  readonly employees: () => readonly Employee[]
  readonly record: () => void
  /** What the conversations are doing, which the gecko in the tray shows. */
  readonly pose: () => GeckoPose
}

let tray: Tray | undefined
let deps: TrayDeps | undefined
let drawn = ''
let worn: GeckoPose | 'plain' = 'plain'

/** Each image at 1x and 2x: today's icon, and the gecko's three. */
const IMAGES: Record<GeckoPose | 'plain', readonly [string, string]> = {
  plain: [template, template2x],
  asleep: [asleep, asleep2x],
  working: [working, working2x],
  waiting: [waiting, waiting2x],
}

/** The Local orange of the dev Dock icon. */
const LOCAL = { r: 0xf2, g: 0x8c, b: 0x28 }

/** The template painted orange, keeping its shape in the alpha; a bitmap is premultiplied BGRA on a Mac. */
function orange(buffer: Buffer): NativeImage {
  const read = nativeImage.createFromBuffer(buffer)
  const pixels = Buffer.from(read.toBitmap())
  for (let at = 0; at < pixels.length; at += 4) {
    const alpha = (pixels[at + 3] ?? 0) / 255
    pixels[at] = Math.round(LOCAL.b * alpha)
    pixels[at + 1] = Math.round(LOCAL.g * alpha)
    pixels[at + 2] = Math.round(LOCAL.r * alpha)
  }
  return nativeImage.createFromBitmap(pixels, read.getSize())
}

/** On a Mac, black on clear, which the menu bar colours for itself; run from the source, the same in orange; elsewhere the app's own icon. */
function image(which: GeckoPose | 'plain'): NativeImage {
  if (process.platform !== 'darwin') return nativeImage.createFromBuffer(readFileSync(appIcon))
  const [one, two] = IMAGES[which]
  if (!app.isPackaged) {
    const made = orange(readFileSync(one))
    made.addRepresentation({ scaleFactor: 2, buffer: orange(readFileSync(two)).toPNG() })
    return made
  }
  const made = nativeImage.createFromBuffer(readFileSync(one), { scaleFactor: 1 })
  made.addRepresentation({ scaleFactor: 2, buffer: readFileSync(two) })
  made.setTemplateImage(true)
  return made
}

/** The gecko's pose on a Mac while it is shown; today's icon when it is switched off, and on the other systems, whose trays wear the colour icon. */
const wanted = (): GeckoPose | 'plain' => (process.platform === 'darwin' && getSettings().showGecko && deps !== undefined ? deps.pose() : 'plain')

export function startTray(given: TrayDeps): void {
  deps = given
  worn = wanted()
  tray = new Tray(image(worn))
  // Run from the source, it is told apart from the installed GeckIt's beside it by its orange icon, no wider than the other.
  tray.setToolTip(app.isPackaged ? 'GeckIt' : 'GeckIt Local')
  drawTray()
  // "Tomorrow" turns into "Today" with nothing else changing.
  setInterval(drawTray, 60_000)
}

/** Built again only when something it says has changed, since it is asked on every change in any conversation. */
export function drawTray(): void {
  if (tray === undefined || deps === undefined) return
  const wear = wanted()
  if (wear !== worn) {
    worn = wear
    tray.setImage(image(wear))
  }
  const now = Date.now()
  // Another profile's shortcuts run all the same, and are listed only where that profile is in use.
  const settings = getSettings()
  const shown = shownProjects(settings)
  const rows = settings
    .shortcuts.filter((one) => shown.includes(one.root))
    .map((one) => {
      const provider = one.provider ?? 'claude'
      const available = one.target === 'manager' || assistantsIn(settings).includes(provider) && (llmProviderInfo(provider, 'stream', settings.providerPlugins).localOnly !== true || !isRemote(one.root))
      const next = nextTimed(one, now)
      const when =
        one.lastSession !== undefined && deps?.busy(one.lastSession) === true
          ? 'running now'
          : next === undefined
            ? undefined
            : `next ${describeTime(next, now).replace(/^[A-Z]/, (first) => first.toLowerCase())}`
      return { one, available, says: !available ? `${basename(one.root)}, assistant unavailable` : when === undefined ? basename(one.root) : `${basename(one.root)}, ${when}` }
    })
  const team = new Map(deps.employees().map((one) => [one.id, one]))
  const owner = (one: (typeof rows)[number]['one']): Employee | undefined => (one.employeeId === undefined ? undefined : team.get(one.employeeId))
  const groups = [...team.values()].flatMap((employee) => {
    const own = rows.filter(({ one }) => one.employeeId === employee.id)
    return own.length === 0 ? [] : [{ title: employee.archived ? `${employee.name} (archived)` : employee.name, archived: employee.archived, rows: own }]
  })
  const managerRows = rows.filter(({ one }) => one.target === 'manager')
  if (managerRows.length > 0) groups.unshift({ title: 'Manager', archived: false, rows: managerRows })
  const loose = rows.filter(({ one }) => one.target !== 'manager' && owner(one) === undefined)
  const grouped = groups.length === 0 ? [{ title: 'Shortcuts', archived: false, rows: loose }] : [...groups, ...(loose.length === 0 ? [] : [{ title: 'No employee', archived: false, rows: loose }])]
  const key = JSON.stringify([settings.showGecko, grouped.map(({ title, rows: list }) => [title, list.map(({ one, available, says }) => [one.id, one.name, available, says])])])
  if (key === drawn) return
  drawn = key

  const mac = process.platform === 'darwin'
  const items: MenuItemConstructorOptions[] = [
    { label: 'Open Chat', click: () => deps?.openChat() },
    { label: 'Correct and Transcribe', click: () => deps?.openPanel() },
    { label: 'Record the Screen', click: () => deps?.record() },
    // The gecko comes back from here, without opening Settings.
    { label: settings.showGecko ? 'Hide the Gecko' : 'Show the Gecko', click: () => setSettings({ showGecko: !getSettings().showGecko }) },
    { type: 'separator' },
    ...grouped.flatMap(({ title, archived, rows: list }): MenuItemConstructorOptions[] => [
      { label: title, enabled: false },
      ...list.map(
        ({ one, available, says }): MenuItemConstructorOptions => ({
          // A second line is a Mac's only.
          label: mac ? one.name : `${one.name} (${says})`,
          ...(mac ? { sublabel: archived ? 'paused while archived' : says } : {}),
          toolTip: one.prompt,
          enabled: available && !archived,
          click: () => deps?.run(one.id),
        }),
      ),
    ]),
    { label: 'New Shortcut...', click: () => deps?.manage('new') },
    ...(rows.length === 0 ? [] : [{ label: 'Manage Shortcuts...', click: () => deps?.manage('list') }]),
    { type: 'separator' },
    { label: 'Quit GeckIt', role: 'quit' },
  ]
  tray.setContextMenu(Menu.buildFromTemplate(items))
}
