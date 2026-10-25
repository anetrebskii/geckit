import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { delimiter, isAbsolute, join } from 'node:path'

import type { VoiceMemosConnection } from '../shared/manager-intake'

type TranscriptionReadiness = NonNullable<VoiceMemosConnection['transcription']>
interface LocalTranscriptionFiles { readonly cli: string; readonly model: string | undefined; readonly path?: string }

export async function localTranscriptionReadiness(files: LocalTranscriptionFiles): Promise<TranscriptionReadiness> {
  const missing: TranscriptionReadiness = { ready: false, detail: 'Local transcription is not ready. Open GeckIt Transcribe to finish setup.' }
  if (files.model === undefined) return missing
  try {
    const model = await stat(files.model)
    if (!model.isFile() || model.size === 0) return missing
    await access(files.model, constants.R_OK)
    const candidates = isAbsolute(files.cli) ? [files.cli] : (files.path ?? process.env['PATH'] ?? '').split(delimiter).filter((path) => path !== '').map((path) => join(path, files.cli))
    for (const candidate of candidates) {
      try { if ((await stat(candidate)).isFile()) { await access(candidate, constants.X_OK); return { ready: true, detail: 'Local transcription is ready.' } } } catch { continue }
    }
  } catch { return missing }
  return missing
}
