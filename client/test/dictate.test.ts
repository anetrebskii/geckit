import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Voice } from '../src/renderer/src/dictate'
import type { Geckit } from '../src/preload'

vi.mock('../src/renderer/src/kept', () => ({
  keep: vi.fn(async () => undefined),
  readKept: vi.fn(async () => undefined),
}))

beforeEach(() => vi.resetModules())
afterEach(() => vi.unstubAllGlobals())

function microphone(): { voice: Voice; ready: () => void } {
  let ready = (): void => { throw new Error('Microphone was not started') }
  const voice: Voice = {
    start: vi.fn(() => new Promise<void>((resolve) => { ready = resolve })),
    stop: vi.fn(async () => 'recorded audio'),
    drop: vi.fn(),
  }
  const host: Pick<Geckit, 'transcribe'> = { transcribe: vi.fn(async () => ({ ok: true, text: 'Words' })) }
  vi.stubGlobal('localStorage', { getItem: () => null })
  vi.stubGlobal('window', { geckitVoice: voice, geckit: host })
  return { voice, ready: () => ready() }
}

describe('phone dictation starting', () => {
  it('honors one Stop while the native microphone is still starting', async () => {
    const mic = microphone()
    const { dictate } = await import('../src/renderer/src/dictate')
    const heard = vi.fn()
    const ended = vi.fn()
    const ears = dictate()
    expect(ears).toBeDefined()
    const begun = ears!.start('English', heard, ended, 'session')
    const stopped = ears!.stop()
    expect(mic.voice.stop).not.toHaveBeenCalled()
    mic.ready()
    await Promise.all([begun, stopped])
    expect(mic.voice.stop).toHaveBeenCalledOnce()
    expect(heard).toHaveBeenCalledWith('Words')
    expect(ended).toHaveBeenCalledOnce()
  })

  it('releases the microphone when the conversation closes during startup', async () => {
    const mic = microphone()
    const { dictate } = await import('../src/renderer/src/dictate')
    const heard = vi.fn()
    const ears = dictate()
    const begun = ears!.start('English', heard, vi.fn(), 'session')
    ears!.cancel()
    mic.ready()
    await begun
    expect(mic.voice.stop).toHaveBeenCalledOnce()
    expect(heard).not.toHaveBeenCalled()
  })
})
