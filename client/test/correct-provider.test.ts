import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { correct } from '../src/main/correct'
import { CodexSessions } from '../src/main/sessions/codex'
import { getSettings } from '../src/main/store'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import { agentAdmission } from '../src/main/vpn/admission'
import { VPN_REQUIRED_MESSAGE } from '../src/shared/vpn'

const fakes = vi.hoisted(() => ({ claude: vi.fn(async () => ({ ok: true, text: 'Claude answer' })) }))
vi.mock('../src/main/store', () => ({ getSettings: vi.fn() }))
vi.mock('../src/main/correct-session', () => ({ correctKeeper: () => ({ ask: fakes.claude, stop: vi.fn() }) }))

beforeEach(() => { agentAdmission.update({ required: false }); fakes.claude.mockClear() })
afterEach(() => { agentAdmission.update({ required: true }); vi.restoreAllMocks() })

it('uses the saved Codex correction model when Claude is disabled', async () => {
  vi.mocked(getSettings).mockReturnValue({ ...DEFAULT_SETTINGS, chatProviders: ['codex'], correctCodexModel: 'codex-model' })
  const ask = vi.spyOn(CodexSessions.prototype, 'correct').mockResolvedValue({ ok: true, text: 'Codex answer' })
  expect(await correct({ provider: 'claude', text: 'teh cat', action: 'grammar', model: 'haiku' })).toEqual({ ok: true, text: 'Codex answer' })
  expect(ask).toHaveBeenCalledWith('teh cat', expect.stringContaining('Correct any grammar'), 'codex-model')
})

it('uses the saved Claude correction model when Codex is disabled', async () => {
  vi.mocked(getSettings).mockReturnValue({ ...DEFAULT_SETTINGS, chatProviders: ['claude'], correctProvider: 'codex', correctPlanModel: 'sonnet' })
  const ask = vi.spyOn(CodexSessions.prototype, 'correct').mockResolvedValue({ ok: true, text: 'Wrong provider' })
  expect(await correct({ provider: 'codex', text: 'teh cat', action: 'grammar', model: 'codex-model' })).toEqual({ ok: true, text: 'Claude answer' })
  expect(fakes.claude).toHaveBeenCalledWith('teh cat', expect.stringContaining('Correct any grammar'), 'sonnet')
  expect(ask).not.toHaveBeenCalled()
})

it('uses the selected model for an enabled Codex correction', async () => {
  vi.mocked(getSettings).mockReturnValue({ ...DEFAULT_SETTINGS, correctProvider: 'codex' })
  const ask = vi.spyOn(CodexSessions.prototype, 'correct').mockResolvedValue({ ok: true, text: 'Answer' })
  await correct({ provider: 'codex', text: 'teh cat', action: 'custom', custom: 'Fix spelling.', model: 'selected-model' })
  expect(ask).toHaveBeenCalledWith('teh cat', expect.stringContaining('Fix spelling.'), 'selected-model')
})


it('blocks correction before either provider when VPN is required', async () => {
  agentAdmission.update({ required: true })
  const ask = vi.spyOn(CodexSessions.prototype, 'correct').mockResolvedValue({ ok: true, text: 'Must not run' })
  expect(await correct({ provider: 'codex', text: 'teh cat', action: 'grammar', model: '' })).toEqual({ ok: false, error: VPN_REQUIRED_MESSAGE })
  expect(ask).not.toHaveBeenCalled()
  expect(fakes.claude).not.toHaveBeenCalled()
})
