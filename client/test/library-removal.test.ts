import { describe, expect, it, vi } from 'vitest'

import type { Geckit } from '../src/preload'
import type { LlmProviderInfo } from '../src/shared/providers'
import { removeProviderLibrary } from '../src/shared/library-removal'

const provider: Pick<LlmProviderInfo, 'id' | 'name'> = { id: 'plugin:codex-mirror', name: 'Codex Mirror' }

describe('library removal', () => {
  it('calls the installed library ID and reports success', async () => {
    const uninstallProvider = vi.fn<Geckit['chat']['uninstallProvider']>().mockResolvedValue(undefined)
    expect(await removeProviderLibrary({ uninstallProvider }, provider)).toBeUndefined()
    expect(uninstallProvider).toHaveBeenCalledWith('plugin:codex-mirror')
  })

  it('preserves the actionable failure and removes Electron wrappers', async () => {
    const uninstallProvider = vi.fn<Geckit['chat']['uninstallProvider']>().mockRejectedValue(new Error("Error invoking remote method 'chat:uninstallProvider': Error: Permission denied moving library to Trash."))
    expect(await removeProviderLibrary({ uninstallProvider }, provider)).toBe('Could not remove Codex Mirror. Permission denied moving library to Trash.')
  })

  it('asks for restart when the preload has no removal method', async () => {
    expect(await removeProviderLibrary({}, provider)).toBe('Restart GeckIt to finish updating library management, then try again.')
  })

  it('asks for restart when the running main process has no removal handler', async () => {
    const uninstallProvider = vi.fn<Geckit['chat']['uninstallProvider']>().mockRejectedValue(new Error("Error invoking remote method 'chat:uninstallProvider': Error: No handler registered for 'chat:uninstallProvider'"))
    expect(await removeProviderLibrary({ uninstallProvider }, provider)).toBe('Restart GeckIt to finish updating library management, then try again.')
  })

  it.each([new Error(' '), undefined, { code: 'EIO' }])('uses fallback wording when rejection has no message', async (error) => {
    const uninstallProvider = vi.fn<Geckit['chat']['uninstallProvider']>().mockRejectedValue(error)
    expect(await removeProviderLibrary({ uninstallProvider }, provider)).toBe('Could not remove Codex Mirror. Try again.')
  })
})
