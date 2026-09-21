import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { app } from 'electron'

import type { AIProvider, Settings } from '../shared/api'

/**
 * The keys and languages the old build left behind.
 *
 * It kept them in `localStorage`, under `userContext`, and the renderer cannot
 * reach them any more: the pages are served from a different origin now, so its
 * own `localStorage` is empty and the old one is only a file. That file is in
 * this application's userData folder, so the main process reads it once, on the
 * first run, and then never again.
 */

const PROVIDERS: readonly AIProvider[] = ['openai', 'anthropic', 'openrouter']

const MOVED: Readonly<Record<string, string>> = {
  openAiKey: 'openAiKey',
  anthropicKey: 'anthropicKey',
  openRouterKey: 'openRouterKey',
  // The old build spelled this one wrong.
  nativateLanguage: 'nativeLanguage',
  secondLanguage: 'secondLanguage',
  microphoneDeviceId: 'microphoneDeviceId',
}

/** The `{...}` that starts at `from`, by counting braces outside strings. */
function object(text: string, from: number): string | undefined {
  let depth = 0
  let inString = false
  let escaped = false
  for (let at = from; at < text.length; at += 1) {
    const one = text[at]
    if (escaped) {
      escaped = false
    } else if (one === '\\') {
      escaped = true
    } else if (one === '"') {
      inString = !inString
    } else if (!inString) {
      if (one === '{') depth += 1
      else if (one === '}') {
        depth -= 1
        if (depth === 0) return text.slice(from, at + 1)
      }
    }
  }
  return undefined
}

function oldSettings(): Record<string, unknown> | undefined {
  const where = join(app.getPath('userData'), 'Local Storage', 'leveldb')
  let text = ''
  try {
    for (const name of readdirSync(where)) {
      if (name.endsWith('.ldb') || name.endsWith('.log')) {
        text += readFileSync(join(where, name), 'latin1')
      }
    }
  } catch {
    return undefined
  }
  const named = text.indexOf('userContext')
  if (named === -1) return undefined
  const opens = text.indexOf('{', named)
  const raw = opens === -1 ? undefined : object(text, opens)
  if (raw === undefined) return undefined
  try {
    const held = JSON.parse(raw) as { settings?: Record<string, unknown> }
    return held.settings
  } catch {
    return undefined
  }
}

const said = (held: Record<string, unknown>, key: string): string | undefined => {
  const value = held[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

export function carriedOver(): Partial<Settings> {
  const held = oldSettings()
  if (held === undefined) return {}
  const change: Record<string, string> = {}
  for (const [was, now] of Object.entries(MOVED)) {
    const value = said(held, was)
    if (value !== undefined) change[now] = value
  }
  const provider = said(held, 'aiProvider')
  if (provider !== undefined && PROVIDERS.includes(provider as AIProvider)) change['provider'] = provider
  return change as Partial<Settings>
}
