import { describe, expect, it, vi } from 'vitest'

import { nativeIdle } from '../src/service/application'

describe('asking the desktop whether anyone is at this computer', () => {
  it('takes the desktop answer', async () => {
    const asked: string[] = []
    const idler = nativeIdle((id) => { asked.push(id); return true })
    const idle = idler.idle()
    idler.answered(asked[0] ?? '', false)
    expect(await idle).toBe(false)
  })

  it('counts nobody there without a desktop, or when it does not answer', async () => {
    expect(await nativeIdle(() => false).idle()).toBe(true)
    vi.useFakeTimers()
    const idle = nativeIdle(() => true).idle()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(await idle).toBe(true)
    vi.useRealTimers()
  })
})
