import { execFile } from 'node:child_process'
import { unlinkSync, writeFileSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

import type { Answered, TranscribeRequest } from '../shared/api'
import { fetchSpeechModel, whisperCli } from './whisper'

const run = promisify(execFile)

/** What whisper-cli prints, one line a segment, as one run of text, less its mark for silence. */
const heard = (printed: string): string =>
  printed
    .split('\n')
    .map((line) => line.replace(/\[BLANK_AUDIO\]/g, '').trim())
    .filter((line) => line !== '')
    .join(' ')

/**
 * Speech to text, on this computer with whisper.cpp.
 *
 * The recording arrives from a window as base64, already decoded into a WAV
 * at 16 kHz mono. It goes to disk because whisper-cli wants a file, and the
 * file goes as soon as it has been read.
 */
export async function transcribe(request: TranscribeRequest): Promise<Answered> {
  const path = join(tmpdir(), `geckit-${String(Date.now())}.wav`)
  try {
    writeFileSync(path, request.audio, 'base64')
    const model = await fetchSpeechModel()
    const threads = String(Math.min(8, availableParallelism()))
    const language = /^[a-z]{2}$/.test(request.language ?? '') ? (request.language ?? 'auto') : 'auto'
    const { stdout } = await run(whisperCli(), ['-m', model, '-f', path, '-l', language,'-t', threads, '-nt', '-np'], { maxBuffer: 16 * 1024 * 1024 })
    return { ok: true, text: heard(stdout) }
  } catch (error) {
    const failed = error as { code?: string }
    if (failed.code === 'ENOENT') return { ok: false, error: 'whisper-cli is missing: run scripts/whisper.sh in client/' }
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    try {
      unlinkSync(path)
    } catch {
      // Already gone, or never written.
    }
  }
}
