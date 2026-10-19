import type { SafeStorage } from 'electron'

import type { ManagerConfig, ManagerView } from '../shared/manager'
import type { TelegramAction, TelegramView } from '../shared/telegram'
import type { Manager } from './manager'
import type { ManagerTelegram, TelegramVault } from './telegram'

export function telegramVault(storage: Pick<SafeStorage, 'isEncryptionAvailable' | 'getSelectedStorageBackend' | 'encryptString' | 'decryptString'>, platform: NodeJS.Platform): TelegramVault {
  return {
    available: () => {
      try { return storage.isEncryptionAvailable() && (platform !== 'linux' || storage.getSelectedStorageBackend() !== 'basic_text') } catch { return false }
    },
    encrypt: (text) => storage.encryptString(text),
    decrypt: (bytes) => storage.decryptString(bytes),
  }
}

export async function configureManagerAccess(manager: Pick<Manager, 'configure'>, telegram: Pick<ManagerTelegram, 'action'>, change: Partial<ManagerConfig>): Promise<ManagerView> {
  const view = await manager.configure(change)
  if (!view.config.enabled) await telegram.action({ kind: 'disconnect' })
  return view
}

export function telegramActionAccess(manager: Pick<Manager, 'enabled'>, telegram: Pick<ManagerTelegram, 'action'>, action: TelegramAction, desktop: boolean): Promise<TelegramView> {
  if (!desktop) return Promise.reject(new Error('Manage the Telegram connection on the computer.'))
  if (action.kind !== 'disconnect' && action.kind !== 'cancel-pairing' && !manager.enabled()) return Promise.reject(new Error('Enable Manager in GeckIt before connecting Telegram.'))
  return telegram.action(action)
}

export function phoneTelegramView(view: TelegramView): TelegramView {
  const { pairing: _pairing, candidate: _candidate, ...safe } = view
  return safe
}
