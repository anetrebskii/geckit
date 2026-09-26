import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { claudeModelsFrom } from '../src/main/sessions/models'

/**
 * Claude Code's answer to the greeting, as 2.1.274 gave it: every model it
 * can run, and one it names and cannot, with its own reason why.
 */
const answer = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'claude-initialize-2.1.274.json'), 'utf8')) as Record<string, unknown>

describe('the models the tool says it has', () => {
  it('lists what it can run, without its own Default', () => {
    const models = claudeModelsFrom(answer) ?? []
    expect(models.filter((one) => one.disabled !== true).map((one) => one.value)).toEqual([
      'opus[1m]',
      'claude-fable-5-1[1m]',
      'sonnet',
      'haiku',
    ])
    expect(models[0]).toMatchObject({ name: 'Opus (1M context)', id: 'claude-opus-5[1m]' })
  })

  it('lists what it cannot run yet, in its own words and with no id of a model', () => {
    const models = claudeModelsFrom(answer) ?? []
    expect(models.filter((one) => one.disabled === true)).toEqual([
      {
        value: 'cc-update-required-1',
        name: 'Opus 5.5 (disabled)',
        says: 'Update to 2.1.280+ to use Opus 5.5',
        disabled: true,
      },
    ])
  })

  it('says nothing where the answer names no models', () => {
    expect(claudeModelsFrom({})).toBeUndefined()
  })
})
