import { appendFile, mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { app } from 'electron'

import type { LlmProviderInfo } from '../../shared/providers'
import { redact } from '../../shared/reporting'
import type { PluginLogFields, PluginLogLevel, PluginLogger, PluginLogValue } from './plugin-api'

export interface PluginLogEntry {
  readonly at: string
  readonly level: PluginLogLevel
  readonly plugin: LlmProviderInfo['id']
  readonly event: string
  readonly fields?: PluginLogFields
}

const MAX_BYTES = 2 * 1024 * 1024
const pending = new Map<string, Promise<void>>()
const sensitive = /password|secret|token|credential|authorization|cookie|apikey|prompt|transcript|instruction|argument|environment|^(?:raw|user|assistant|backend|tool)?(?:message|text|input|output|content|response|request|payload|body|image|attachment|answer|command)(?:s|data|text|body|content)?$/i

const safeString = (value: string): string => redact(value)
  .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_=.-]+/gi, '[redacted]')
  .replace(/\b(?:sk-[\w-]{8,}|gh[pousr]_[\w]{12,}|github_pat_[\w]{12,}|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b/g, '[redacted]')
  .replace(/\b(?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*["']?[^,;\s"']+/gi, '[redacted]')
  .slice(0, 512)

function safeFields(fields: PluginLogFields): PluginLogFields {
  const kept: { [key: string]: PluginLogValue } = {}
  for (const [key, value] of Object.entries(fields).slice(0, 48)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/.test(key)) continue
    const normalized = key.replace(/[^a-zA-Z]/g, '')
    if (sensitive.test(normalized)) continue
    if (typeof value === 'string') kept[key] = safeString(value)
    else if (typeof value === 'boolean' || value === null || typeof value === 'number' && Number.isFinite(value)) kept[key] = value
  }
  return kept
}

async function append(path: string, line: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 })
  const size = await stat(path).then((file) => file.size, (error: Error & { code?: string }) => {
    if (error.code === 'ENOENT') return 0
    throw error
  })
  if (size + Buffer.byteLength(line) > MAX_BYTES) {
    await rm(`${path}.1`, { force: true })
    if (size > 0) await rename(path, `${path}.1`)
  }
  await appendFile(path, line, { encoding: 'utf8', mode: 0o600 })
}

export const flushPluginLogs = async (path: string): Promise<void> => { await pending.get(path) }

export function pluginLogger(info: Pick<LlmProviderInfo, 'id'>, scope: PluginLogFields = {}): PluginLogger {
  const id = info.id === 'claude-tmux' ? 'plugin:claude-tmux' : info.id
  let path = ''
  try {
    if (/^plugin:[a-z][a-z0-9-]*$/.test(id)) path = join(app.getPath('userData'), 'provider-logs', `${id.replaceAll(':', '-')}.jsonl`)
  } catch { /* Diagnostics cannot prevent a library from loading. */ }
  return {
    path,
    write: (level, event, fields) => {
      try {
        if (path.length === 0 || !['debug', 'info', 'warn', 'error'].includes(level)) return
        const entry: PluginLogEntry = {
          at: new Date().toISOString(), level, plugin: id,
          event: /^[a-zA-Z][a-zA-Z0-9_.-]{0,95}$/.test(event) ? event : 'plugin.event',
          fields: safeFields({ ...fields, ...scope }),
        }
        const line = `${JSON.stringify(entry)}\n`
        const next = (pending.get(path) ?? Promise.resolve()).then(() => append(path, line)).catch(() => undefined)
        pending.set(path, next)
        void next.then(() => { if (pending.get(path) === next) pending.delete(path) })
      } catch { /* Bad diagnostic fields must not interrupt provider operations. */ }
    },
  }
}
