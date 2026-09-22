import { execFile, spawn } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

import { dialog, Menu, shell } from 'electron'
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron'
import log from 'electron-log'

import { appName, kindOf, ruleFor, withRule } from '../shared/api'
import type { OpenRule } from '../shared/api'
import { getSettings, setSettings } from './store'

/** Where a path said in a conversation is: in the project, or in the home folder when it starts with ~. */
export const fileAt = (root: string, path: string): string =>
  path === '~' || path.startsWith('~/') ? resolve(homedir(), path.slice(2)) : resolve(root, path)

/** Whether it is there, as a file or a folder. */
export const isThere = (root: string, path: string): Promise<boolean> =>
  stat(fileAt(root, path)).then(
    () => true,
    () => false,
  )

/**
 * A file pressed in a conversation, opened in the application chosen for its
 * kind. Without a rule it goes to whatever the system opens it with, and a
 * file the system has nothing for is shown in the Finder instead.
 */
export function openFile(rules: readonly OpenRule[], root: string, path: string): void {
  const file = fileAt(root, path)
  const fallBack = (): void => {
    void shell.openPath(file).then((failed) => {
      if (failed === '') return
      log.warn(`${file} did not open, so it is shown in the Finder: ${failed}`)
      shell.showItemInFolder(file)
    })
  }
  const rule = ruleFor(rules, file)
  if (rule === undefined) fallBack()
  else openIn(rule.app, file, fallBack)
}

function openIn(app: string, file: string, fallBack: () => void): void {
  if (process.platform === 'darwin') {
    // An application moved or deleted since it was chosen is not a reason to open nothing.
    execFile('open', ['-a', app, file], (error) => {
      if (error === null) return
      log.warn(`${file} did not open in ${app}: ${error.message}`)
      fallBack()
    })
    return
  }
  const started = spawn(app, [file], { detached: true, stdio: 'ignore' })
  started.on('error', fallBack)
  started.unref()
}

/** The system's picker, opened on the Applications folder. */
export async function pickApp(window: BrowserWindow | undefined): Promise<string | undefined> {
  const options = {
    title: 'Choose an application',
    properties: ['openFile' as const],
    ...(process.platform === 'darwin'
      ? { defaultPath: '/Applications', filters: [{ name: 'Applications', extensions: ['app'] }] }
      : {}),
  }
  const picked = await (window === undefined ? dialog.showOpenDialog(options) : dialog.showOpenDialog(window, options))
  return picked.canceled ? undefined : picked.filePaths[0]
}

/**
 * What a file in a conversation offers on a right click: open it, open it
 * once in something else, give every file of its kind to an application from
 * now on, or show it in the Finder. The last is the same rule Settings keeps.
 */
export function fileMenu(window: BrowserWindow, root: string, path: string): void {
  const file = fileAt(root, path)
  const kind = kindOf(file)
  const rule = ruleFor(getSettings().openWith, file)
  const always = async (): Promise<void> => {
    const app = await pickApp(window)
    if (app === undefined) return
    setSettings({ openWith: withRule(getSettings().openWith, kind, app) })
    openFile(getSettings().openWith, root, path)
  }
  const once = async (): Promise<void> => {
    const app = await pickApp(window)
    if (app !== undefined) openIn(app, file, () => shell.showItemInFolder(file))
  }
  const items: MenuItemConstructorOptions[] = [
    { label: rule === undefined ? 'Open' : `Open in ${appName(rule.app)}`, click: () => openFile(getSettings().openWith, root, path) },
    { label: 'Open With...', click: () => void once() },
    ...(kind === '' ? [] : [{ label: `Always Open .${kind} Files With...`, click: () => void always() }]),
    { type: 'separator' },
    { label: process.platform === 'darwin' ? 'Show in Finder' : 'Show in Folder', click: () => shell.showItemInFolder(file) },
  ]
  Menu.buildFromTemplate(items).popup({ window })
}
