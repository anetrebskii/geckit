import type { Geckit } from '../preload'
import type { LlmProviderInfo } from './providers'

const RESTART = 'Restart GeckIt to finish updating library management, then try again.'

export async function removeProviderLibrary(api: Partial<Pick<Geckit['chat'], 'uninstallProvider'>>, provider: Pick<LlmProviderInfo, 'id' | 'name'>): Promise<string | undefined> {
  if (typeof api.uninstallProvider !== 'function') return RESTART
  try {
    await api.uninstallProvider(provider.id)
    return undefined
  } catch (error) {
    const message = error instanceof Error ? error.message : typeof error === 'string' ? error : typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string' ? error.message : ''
    const reason = message.replace(/^Error invoking remote method '[^']+':\s*/, '').replace(/^(?:[A-Za-z]*Error:\s*)+/, '').trim()
    if (/^No handler registered for ['"]chat:uninstallProvider['"]/.test(reason)) return RESTART
    return `Could not remove ${provider.name}. ${reason || 'Try again.'}`
  }
}
