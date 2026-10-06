import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, safeStorage } from 'electron'
import log from 'electron-log/main'
import type { AgentVpnResult, AgentVpnView } from '../../shared/vpn'
import { checkVpnConfig, VPN_CONFIG_LIMIT } from './config'
import { VpnStore } from './store'
import { agentAdmission } from './admission'

let vpnStore: VpnStore | undefined
export function agentVpnView(): AgentVpnView {
  if (vpnStore === undefined) throw new Error('Agent VPN settings are not ready.')
  return vpnStore.view()
}

export function wireAgentVpn(onChanged: (view: AgentVpnView) => void, onBlocked: () => void, onReleased: () => void): void {
  const store = new VpnStore(join(app.getPath('userData'), 'agent-vpn', 'servers.encrypted'), safeStorage)
  vpnStore = store
  agentAdmission.update(store.view())
  let required = store.view().required
  const changed = (result: AgentVpnResult): AgentVpnResult => {
    if (result.ok) {
      if (agentAdmission.update(result.view)) {
        try { onBlocked() } catch { log.warn('VPN admission is blocked; cancellation of an owned provider failed.') }
      }
      if (required && !result.view.required) {
        try { onReleased() } catch { log.warn('VPN admission was released; provider restoration failed.') }
      }
      required = result.view.required
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send('vpn:changed', result.view)
      onChanged(result.view)
    }
    return result
  }
  ipcMain.handle('vpn:view', () => store.view())
  ipcMain.handle('vpn:select', (_event, id: string) => changed(store.select(id)))
  ipcMain.handle('vpn:rename', (_event, id: string, name: string) => changed(store.rename(id, name)))
  ipcMain.handle('vpn:remove', (_event, id: string) => changed(store.remove(id)))
  ipcMain.handle('vpn:check', (_event, id: string) => store.check(id))
  ipcMain.handle('vpn:import', async (): Promise<AgentVpnResult> => {
    try {
      const picked = await dialog.showOpenDialog({ title: 'Import AmneziaWG configuration', properties: ['openFile'], filters: [{ name: 'AmneziaWG configuration', extensions: ['conf'] }] })
      const path = picked.filePaths[0]
      if (picked.canceled || path === undefined) return { ok: true, view: store.view() }
      if (extname(path).toLowerCase() !== '.conf') return { ok: false, view: store.view(), error: 'Choose a native AmneziaWG .conf file.' }
      const file = await open(path, constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW))
      let text: string
      try {
        const stat = await file.stat()
        if (!stat.isFile() || stat.size > VPN_CONFIG_LIMIT) return { ok: false, view: store.view(), error: 'Choose an AmneziaWG configuration smaller than 64 KB.' }
        const bytes = Buffer.alloc(VPN_CONFIG_LIMIT + 1)
        const { bytesRead } = await file.read(bytes, 0, bytes.length, 0)
        if (bytesRead > VPN_CONFIG_LIMIT) return { ok: false, view: store.view(), error: 'Choose an AmneziaWG configuration smaller than 64 KB.' }
        text = bytes.subarray(0, bytesRead).toString('utf8')
      } finally { await file.close() }
      let checked
      try { checked = checkVpnConfig(text) } catch { return { ok: false, view: store.view(), error: 'Invalid or unsupported AmneziaWG configuration. Use a native single-server .conf without scripts or unsupported parameters.' } }
      const name = [...basename(path, extname(path))].filter((character) => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127).join('').trim().slice(0, 120) || 'AmneziaWG server'
      return changed(store.add(name, checked))
    } catch { return { ok: false, view: store.view(), error: 'The configuration could not be imported. Your saved servers and selection have been kept.' } }
  })
}
