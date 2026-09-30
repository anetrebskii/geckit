import { describe, expect, it } from 'vitest'

import { join } from '../src/shared/wav'

// A WAV as AVAudioRecorder writes it: a padding chunk before the samples.
function recorded(samples: readonly number[]): string {
  const pad = 8
  const wav = Buffer.alloc(12 + 24 + 8 + pad + 8 + samples.length)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.write('FLLR', 36)
  wav.writeUInt32LE(pad, 40)
  wav.write('data', 44 + pad)
  wav.writeUInt32LE(samples.length, 48 + pad)
  Buffer.from(samples).copy(wav, 52 + pad)
  return wav.toString('base64')
}

describe('join', () => {
  it('puts the samples of two recordings after each other under one header', () => {
    const wav = Buffer.from(join(recorded([1, 2, 3, 4]), recorded([5, 6])), 'base64')
    expect(wav.subarray(0, 4).toString()).toBe('RIFF')
    expect(wav.readUInt32LE(24)).toBe(16000)
    expect(wav.subarray(36, 40).toString()).toBe('data')
    expect(wav.readUInt32LE(40)).toBe(6)
    expect([...wav.subarray(44)]).toEqual([1, 2, 3, 4, 5, 6])
  })
})
