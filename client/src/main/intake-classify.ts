import type { Answered, CorrectRequest, Settings } from '../shared/api'
import type { ManagerConfig } from '../shared/manager'
import type { IntakeClassification } from '../shared/manager-intake'
import { INTAKE_CLASSIFICATION_INSTRUCTION, intakeClassification } from './manager-intake'

export interface IntakeClassifierDeps {
  readonly config: () => Pick<ManagerConfig, 'provider' | 'chatModel'>
  readonly settings: () => Pick<Settings, 'chatProviders'>
  readonly check: () => Promise<void>
  readonly correct: (request: CorrectRequest) => Promise<Answered>
}

export async function classifyIntake(text: string, deps: IntakeClassifierDeps): Promise<IntakeClassification> {
  const config = deps.config()
  if ((config.provider !== 'claude' && config.provider !== 'codex') || !deps.settings().chatProviders.includes(config.provider)) throw new Error('This Manager assistant does not support restricted classification. Choose enabled built-in Codex or Claude. No provider was enabled or substituted.')
  await deps.check()
  if (deps.config().provider !== config.provider || deps.config().chatModel !== config.chatModel || !deps.settings().chatProviders.includes(config.provider)) throw new Error('Manager assistant changed during verification. No recording was sent.')
  const result = await deps.correct({ provider: config.provider, model: config.chatModel, action: 'custom', custom: INTAKE_CLASSIFICATION_INSTRUCTION, text })
  if (deps.config().provider !== config.provider || deps.config().chatModel !== config.chatModel || !deps.settings().chatProviders.includes(config.provider)) throw new Error('Manager assistant changed during classification. This result was not accepted.')
  if (!result.ok || result.text === undefined) throw new Error(result.error ?? 'Restricted classification failed.')
  return intakeClassification(result.text)
}
