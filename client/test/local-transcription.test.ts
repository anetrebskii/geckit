import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, it } from 'vitest'

import { localTranscriptionReadiness } from '../src/main/local-transcription'

it('checks both installed model and executable without executing, downloading or transcribing', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'geckit-transcription-ready-'))
  try {
    const cli = join(directory, 'whisper-cli'), model = join(directory, 'model.bin')
    writeFileSync(model, 'fixture model')
    expect((await localTranscriptionReadiness({ cli, model })).ready).toBe(false)
    writeFileSync(cli, 'must never be executed'); chmodSync(cli, 0o700)
    expect((await localTranscriptionReadiness({ cli, model })).ready).toBe(true)
    expect((await localTranscriptionReadiness({ cli: 'whisper-cli', path: directory, model })).ready).toBe(true)
    expect(await localTranscriptionReadiness({ cli, model: undefined })).toMatchObject({ ready: false, detail: expect.stringContaining('GeckIt Transcribe') })
    expect((await localTranscriptionReadiness({ cli, model: directory })).ready).toBe(false)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
