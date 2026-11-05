import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { app, shell } from 'electron'

import { configureCorePlatform } from '../core/platform'
import { copyConfiguration } from '../core/configuration'

/**
 * Run from the source, GeckIt keeps a folder of its own, so it can run beside
 * the installed one: two apps on one folder would write over each other's
 * settings and take each other's socket. It starts as a copy of the installed
 * one's settings and notes; the conversations are Claude Code's and shared
 * anyway. The phone stays with the installed one, since both would answer it.
 *
 * Imported before anything else, so nothing reads the folder before it is moved.
 */
if (process.env['GECKIT_DATA']) {
  const directory = resolve(process.env['GECKIT_DATA'])
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  app.setPath('userData', directory)
} else if (!app.isPackaged) {
  const installed = app.getPath('userData')
  const local = join(app.getPath('appData'), 'geckit-local')
  if (!existsSync(join(local, 'settings.json')) && !existsSync(join(local, 'service-owner.json'))) {
    mkdirSync(local, { recursive: true })
    if (existsSync(join(installed, 'sessions.json'))) copyFileSync(join(installed, 'sessions.json'), join(local, 'sessions.json'))
    try {
      copyConfiguration(installed, local)
    } catch {
      // Nothing installed to copy, so it starts empty.
    }
  }
  app.setPath('userData', local)
}


configureCorePlatform({
  directory: () => app.getPath('userData'),
  source: () => !app.isPackaged,
  launcher: () => ({ executable: process.execPath, script: join(app.getAppPath(), 'out', 'main', 'cli.js') }),
  trash: (path) => shell.trashItem(path),
})
