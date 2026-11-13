import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { createRendererApi } from '../shared/renderer-api'
import type { RendererArgument, RendererTransport } from '../shared/renderer-api'
import type { Pairing } from '../shared/pairing'
import type { ConnectionStorage } from '../shared/remote/storage'

const connectionStorage: ConnectionStorage = {
  publicKey: () => ipcRenderer.invoke('remote:storage', 'publicKey'),
  sign: (text) => ipcRenderer.invoke('remote:storage', 'sign', text),
  list: () => ipcRenderer.invoke('remote:storage', 'list'),
  remember: (trust) => ipcRenderer.invoke('remote:storage', 'remember', trust),
  forget: (id) => ipcRenderer.invoke('remote:storage', 'forget', id),
  name: (id, label) => ipcRenderer.invoke('remote:storage', 'name', id, label),
}

const transport: RendererTransport = {
  invoke: <Result>(channel: string, ...args: readonly RendererArgument[]): Promise<Result> => ipcRenderer.invoke(channel, ...args) as Promise<Result>,
  send: (channel, ...args) => { ipcRenderer.send(channel, ...args) },
  listen: <Value>(channel: string, said: (value: Value) => void): (() => void) => {
    const on = (_event: Electron.IpcRendererEvent, value: Value): void => said(value)
    ipcRenderer.on(channel, on)
    return () => { ipcRenderer.off(channel, on) }
  },
}

const geckit = {
  connectionStorage,
  ...createRendererApi(transport, {
    platform: process.platform,
    home: process.env['HOME'] ?? '',
    pathFor: (file) => webUtils.getPathForFile(file),
  }),
  /** The hidden window the phone is answered in, and nothing else, uses these. */
  peer: {
    pairing: (): Promise<Pairing | undefined> => ipcRenderer.invoke('peer:pairing'),
    call: (name: string, args: readonly unknown[]): Promise<unknown> => ipcRenderer.invoke('peer:call', name, args),
    onTell: (said: (channel: string, value: unknown) => void): (() => void) => {
      const on = (_event: unknown, channel: string, value: unknown): void => said(channel, value)
      ipcRenderer.on('peer:tell', on)
      return () => {
        ipcRenderer.off('peer:tell', on)
      }
    },
    state: (count: number, trouble: string | undefined): void => ipcRenderer.send('peer:state', count, trouble ?? null),
    /** The rooms of the links shared now, each with its own key. */
    shares: (): Promise<readonly { readonly id: string; readonly key: string }[]> => ipcRenderer.invoke('peer:shares'),
    onShares: (said: (rooms: readonly { readonly id: string; readonly key: string }[]) => void): (() => void) => transport.listen('peer:shares', said),
    /** A call from a link page, answered for its own link only. */
    share: (id: string, name: string, args: readonly unknown[]): Promise<unknown> => ipcRenderer.invoke('peer:share', id, name, args),
    /** Which screen to capture for a phone, or why this Mac will not let it be. */
    screen: (): Promise<{ readonly id?: string; readonly error?: string }> => ipcRenderer.invoke('peer:screen'),
  },

}

contextBridge.exposeInMainWorld('geckit', geckit)

export type Geckit = Omit<typeof geckit, 'connectionStorage'> & Partial<Pick<typeof geckit, 'connectionStorage'>>
