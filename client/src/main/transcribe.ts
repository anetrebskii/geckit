import { createReadStream, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import OpenAI from 'openai'

import type { Answered, TranscribeRequest } from '../shared/api'
import { getSettings } from './store'

/**
 * Speech to text, through OpenRouter's Whisper.
 *
 * Claude Code cannot hear, so this one thing still needs a key. The recording
 * arrives from a window as base64, goes to disk because the API wants a file,
 * and the file goes as soon as it has been read.
 */
export async function transcribe(request: TranscribeRequest): Promise<Answered> {
  const key = getSettings().openRouterKey
  if (key === '') return { ok: false, error: 'Transcription needs an OpenRouter key in Settings' }

  const path = join(tmpdir(), `geckit-${String(Date.now())}-${request.fileName}`)
  try {
    writeFileSync(path, request.audio, 'base64')
    const openrouter = new OpenAI({ apiKey: key, baseURL: 'https://openrouter.ai/api/v1' })
    const said = await openrouter.audio.transcriptions.create({
      model: 'openai/whisper-1',
      file: createReadStream(path),
    })
    return { ok: true, text: said.text }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  } finally {
    try {
      unlinkSync(path)
    } catch {
      // Already gone, or never written.
    }
  }
}
