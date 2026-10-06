import { execFile } from 'node:child_process'

import type { CodexBrowser } from '../../shared/api'
import { codexEnvironment } from './codex-rpc'

export async function readCodexBrowsers(): Promise<CodexBrowser[] | undefined> {
  try {
    const stdout = await new Promise<string>((resolve, reject) => {
      const child = execFile('codex', [
        'exec', '--ephemeral', '--sandbox', 'read-only', '--color', 'never',
        '-c', 'model_reasoning_effort="low"',
        'Call cua_repl.js with exactly this code: await cua.listBrowsers(); Return only the JSON array from that tool result. Do not call any other tool.',
      ], { env: codexEnvironment(), timeout: 60_000, maxBuffer: 1024 * 1024 }, (error, output) => {
        if (error !== null) reject(error)
        else resolve(output)
      })
      child.stdin?.end()
    })
    const parsed: unknown = JSON.parse(stdout.trim())
    if (!Array.isArray(parsed)) return undefined
    return parsed.flatMap((entry: unknown): CodexBrowser[] => {
      if (typeof entry !== 'object' || entry === null || !('type' in entry) || entry.type !== 'extension' || !('family' in entry) || entry.family !== 'chrome' || !('metadata' in entry)) return []
      const metadata = entry.metadata
      if (typeof metadata !== 'object' || metadata === null || !('extensionInstanceId' in metadata) || typeof metadata.extensionInstanceId !== 'string') return []
      const name = 'profileName' in entry && typeof entry.profileName === 'string' && entry.profileName !== '' ? entry.profileName : `Chrome ${metadata.extensionInstanceId.slice(0, 4)}`
      return [{ id: metadata.extensionInstanceId, name }]
    })
  } catch {
    return undefined
  }
}
