import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeAccount, SessionProvider } from '../src/shared/api'

const account = vi.fn<(provider: SessionProvider) => Promise<ClaudeAccount | undefined>>()
beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.stubGlobal('window', { geckit: { chat: { account } }, setTimeout })
  account.mockReset()
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('shared account requests', () => {
  it('shares a pending measurement for one assistant and keeps other assistants independent', async () => {
    let finish: (result: ClaudeAccount) => void = () => undefined
    account.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const { readAccount } = await import('../src/renderer/src/chat/accounts')
    const first = readAccount('claude')
    await vi.advanceTimersByTimeAsync(5000)
    expect(readAccount('claude')).toBe(first)
    expect(readAccount('codex')).not.toBe(first)
    expect(account.mock.calls).toEqual([['claude'], ['codex']])
    finish({ provider: 'codex', here: true, signedIn: true })
  })

  it('always requests a fresh measurement after completion', async () => {
    account.mockResolvedValue({ provider: 'claude', here: true, signedIn: true })
    const { readAccount } = await import('../src/renderer/src/chat/accounts')
    const first = readAccount('claude')
    await first
    await readAccount('claude')
    expect(account).toHaveBeenCalledTimes(2)
  })

  it('allows recovery from a failed measurement', async () => {
    account.mockRejectedValueOnce(new Error('Link unavailable')).mockResolvedValue({ provider: 'codex', here: true, signedIn: true })
    const { readAccount } = await import('../src/renderer/src/chat/accounts')
    await expect(readAccount('codex')).rejects.toThrow('Link unavailable')
    expect((await readAccount('codex'))?.provider).toBe('codex')
    expect(account).toHaveBeenCalledTimes(2)
  })
})
