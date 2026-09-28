import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { app } from 'electron'

/**
 * Run from the source, GeckIt keeps a folder of its own, so it can run beside
 * the installed one: two apps on one folder would write over each other's
 * settings and take each other's socket. It starts as a copy of the installed
 * one's settings and notes; the conversations are Claude Code's and shared
 * anyway. The phone stays with the installed one, since both would answer it.
 *
 * Imported before anything else, so nothing reads the folder before it is moved.
 */
if (!app.isPackaged) {
  const installed = app.getPath('userData')
  const local = join(app.getPath('appData'), 'geckit-local')
  if (!existsSync(join(local, 'settings.json'))) {
    mkdirSync(local, { recursive: true })
    if (existsSync(join(installed, 'sessions.json'))) copyFileSync(join(installed, 'sessions.json'), join(local, 'sessions.json'))
    try {
      const settings = JSON.parse(readFileSync(join(installed, 'settings.json'), 'utf8')) as Record<string, unknown>
      writeFileSync(join(local, 'settings.json'), JSON.stringify({ ...settings, phone: false }, undefined, 2))
    } catch {
      // Nothing installed to copy, so it starts empty.
    }
  }
  app.setPath('userData', local)
}

