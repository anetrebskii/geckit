import type { ClaudeModel, ModelPricing } from './api'
import { money } from './provider-usage'

export interface ModelDetailRow {
  readonly label: string
  readonly value: string
}

export const resolvedModel = (models: readonly ClaudeModel[] | undefined, value: string | undefined): ClaudeModel | undefined =>
  value === undefined || value === '' ? models?.find((one) => one.isDefault) : models?.find((one) => one.value === value || one.id === value)

export function modelDetailRows(model: ClaudeModel): readonly ModelDetailRow[] {
  return [
    { label: 'Model ID', value: model.id ?? model.value },
    ...(model.version === undefined ? [] : [{ label: 'Version', value: model.version }]),
    ...(model.contextWindow === undefined ? [] : [{ label: 'Context capacity', value: `${model.contextWindow.toLocaleString()} tokens` }]),
    ...(model.maxOutputTokens === undefined ? [] : [{ label: 'Maximum output', value: `${model.maxOutputTokens.toLocaleString()} tokens` }]),
    ...(model.reasoning === undefined || model.reasoning.length === 0 ? [] : [{ label: 'Reasoning', value: model.reasoning.map((one) => one.value).join(', ') }]),
    ...([
      ['Adaptive thinking', model.supportsAdaptiveThinking],
      ['Fast mode', model.supportsFastMode],
      ['Auto mode', model.supportsAutoMode],
    ] as const).flatMap(([label, supported]) => supported === undefined ? [] : [{ label, value: supported ? 'Supported' : 'Unsupported' }]),
  ]
}

export function pricingRows(pricing: ModelPricing): readonly ModelDetailRow[] {
  return ([['Input', pricing.input], ['Output', pricing.output], ['Cache read', pricing.cacheRead], ['Cache write', pricing.cacheWrite]] as const)
    .flatMap(([label, rate]) => rate === undefined ? [] : [{ label, value: money(rate, pricing.currency) }])
}
