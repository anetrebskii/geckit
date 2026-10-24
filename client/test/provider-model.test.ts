import { expect, it } from 'vitest'

import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { Settings } from '../src/shared/api'
import { modelPreference, providerModel, registerProviderInfo } from '../src/shared/providers'

const legacy = { ...DEFAULT_SETTINGS, chatModel: 'opus', codexModel: 'gpt-5.4' }

it('keeps legacy builtin models separate from independent assistants with the same runtime', () => {
  registerProviderInfo([{ id: 'plugin:codex-library', family: 'plugin:codex-library', name: 'Codex library', shortName: 'Codex library', icon: 'codex', browser: 'none', loginCommand: '', planName: '', runtime: 'codex' }])
  expect(providerModel(legacy, 'claude')).toBe('opus')
  expect(providerModel(legacy, 'codex')).toBe('gpt-5.4')
  expect(providerModel(legacy, 'plugin:claude-tmux')).toBe('')
  expect(providerModel(legacy, 'plugin:opencode-ollama')).toBe('')
  expect(providerModel(legacy, 'plugin:codex-library')).toBe('')
})

it('remembers each assistant selection, including Default, without changing another assistant', () => {
  let settings: Settings = legacy
  settings = { ...settings, ...modelPreference(settings, 'plugin:claude-tmux', 'sonnet') }
  settings = { ...settings, ...modelPreference(settings, 'plugin:opencode-ollama', 'ollama/qwen3:8b') }
  settings = { ...settings, ...modelPreference(settings, 'claude', 'haiku') }
  settings = { ...settings, ...modelPreference(settings, 'codex', 'gpt-5.5') }
  expect(providerModel(settings, 'plugin:claude-tmux')).toBe('sonnet')
  expect(providerModel(settings, 'plugin:opencode-ollama')).toBe('ollama/qwen3:8b')
  expect(providerModel(settings, 'claude')).toBe('haiku')
  expect(providerModel(settings, 'codex')).toBe('gpt-5.5')
  settings = { ...settings, ...modelPreference(settings, 'plugin:claude-tmux', '') }
  expect(settings.providerModels).toEqual([
    { provider: 'plugin:opencode-ollama', model: 'ollama/qwen3:8b' },
    { provider: 'plugin:claude-tmux', model: '' },
  ])
  expect(providerModel(settings, 'plugin:claude-tmux')).toBe('')
  expect(providerModel(settings, 'plugin:opencode-ollama')).toBe('ollama/qwen3:8b')
})

it('keeps custom model IDs independently of catalog availability', () => {
  const settings = { ...legacy, ...modelPreference(legacy, 'plugin:opencode-ollama', 'private/experimental:model') }
  expect(providerModel(settings, 'plugin:opencode-ollama')).toBe('private/experimental:model')
  expect(providerModel(settings, 'plugin:claude-tmux')).toBe('')
})
