import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

import type { AIProvider, Answered } from '../shared/api'
import { getSettings } from './store'

/**
 * The three vendors GeckIt can be given a key for.
 *
 * Called from here rather than from a window because Anthropic's API sends no
 * CORS headers, so a browser cannot reach it at all.
 */

export function keyFor(provider: AIProvider): string {
  const settings = getSettings()
  if (provider === 'anthropic') return settings.anthropicKey
  if (provider === 'openrouter') return settings.openRouterKey
  return settings.openAiKey
}

export const providerName = (provider: AIProvider): string =>
  provider === 'anthropic' ? 'Anthropic' : provider === 'openrouter' ? 'OpenRouter' : 'OpenAI'

/** One question, one answer. There is no conversation on this path any more. */
export async function askProvider(
  provider: AIProvider,
  model: string,
  prompt: string,
): Promise<Answered> {
  const key = keyFor(provider)
  if (key === '') return { ok: false, error: `No ${providerName(provider)} key in Settings` }

  try {
    if (provider === 'anthropic') {
      const anthropic = new Anthropic({ apiKey: key })
      const answer = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      })
      const text = answer.content
        .map((block) => (block.type === 'text' ? block.text : ''))
        .join('')
        .trim()
      return text === '' ? { ok: false, error: 'It answered with nothing' } : { ok: true, text }
    }

    const openai = new OpenAI({
      apiKey: key,
      ...(provider === 'openrouter' ? { baseURL: 'https://openrouter.ai/api/v1' } : {}),
    })
    const answer = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = (answer.choices[0]?.message.content ?? '').trim()
    return text === '' ? { ok: false, error: 'It answered with nothing' } : { ok: true, text }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
