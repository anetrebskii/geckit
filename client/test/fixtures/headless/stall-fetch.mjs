// Keep the optional browser model download pending until shutdown aborts it.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

const originalFetch = globalThis.fetch
globalThis.fetch = (input, init) => {
  if (!String(input).startsWith('https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/')) return originalFetch(input, init)
  writeFileSync(join(process.env.GECKIT_DATA, 'find-model-fetch-started'), '')
  return new Promise((_resolve, reject) => {
    const signal = init?.signal
    if (signal?.aborted) { reject(signal.reason); return }
    signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
  })
}
