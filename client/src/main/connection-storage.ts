import { join } from 'node:path'
import { BrowserWindow } from 'electron'
import type { ConnectionStorage } from '../shared/remote/storage'

const METHODS = ['publicKey', 'sign', 'list', 'remember', 'forget', 'name'] as const satisfies readonly (keyof ConnectionStorage)[]

export function connectionStorage() {
  let opening: Promise<BrowserWindow> | undefined
  const open = (): Promise<BrowserWindow> => opening ??= (async () => {
    const window = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true } })
    window.on('closed', () => { opening = undefined })
    await window.loadFile(join(import.meta.dirname, '../renderer/connection-storage.html'))
    return window
  })()
  return async <K extends keyof ConnectionStorage>(method: K, ...args: Parameters<ConnectionStorage[K]>): Promise<Awaited<ReturnType<ConnectionStorage[K]>>> => {
    if (!METHODS.includes(method)) throw new Error('Unsupported connection storage operation.')
    const window = await open()
    return window.webContents.executeJavaScript(`window.geckitConnectionStorage[${JSON.stringify(method)}](...${JSON.stringify(args)})`) as Promise<Awaited<ReturnType<ConnectionStorage[K]>>>
  }
}
