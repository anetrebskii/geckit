import type { ClaudeAccount, PlanUsage, ProviderQuota, ProviderUsage } from './api'

type UsageSource = Pick<ClaudeAccount, 'limits'> & Pick<ProviderUsage, 'quotas'> & { readonly plan?: PlanUsage }

export function providerQuotas(source: UsageSource): readonly ProviderQuota[] | undefined {
  if (source.quotas !== undefined) return source.quotas
  if (source.limits !== undefined) return source.limits.flatMap((limit, index) => [limit.primary, limit.secondary].flatMap((window, at) => {
    if (window === null) return []
    const minutes = window.windowDurationMins
    const duration = minutes === null ? 'Limit' : minutes === 10080 ? 'Week' : minutes % 1440 === 0 ? `${String(minutes / 1440)}d` : minutes % 60 === 0 ? `${String(minutes / 60)}h` : `${String(minutes)}m`
    const prefix = source.limits?.length === 1 || limit.limitId === 'codex' ? '' : `${limit.limitName ?? limit.limitId ?? 'Limit'} `
    return [{ id: `${limit.limitId ?? String(index)}:${String(at)}`, name: `${prefix}${duration}`, part: window.usedPercent / 100, ...(window.resetsAt === null ? {} : { resetsAt: window.resetsAt * 1000 }) }]
  }))
  if (source.plan === undefined) return undefined
  return [
    ...(source.plan.fiveHour === undefined ? [] : [{ id: 'five-hour', name: '5h', ...source.plan.fiveHour }]),
    ...(source.plan.sevenDay === undefined ? [] : [{ id: 'seven-day', name: 'Week', ...source.plan.sevenDay }]),
  ]
}

export const quotaPart = (quota: ProviderQuota): number | undefined => quota.part ?? (quota.used === undefined || quota.limit === undefined || quota.limit <= 0 ? undefined : quota.used / quota.limit)

const moneyFormats = new Map<string, Intl.NumberFormat>()

export function money(value: number, currency = 'USD'): string {
  let format = moneyFormats.get(currency)
  if (format === undefined) {
    try {
      format = new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 4 })
    } catch {
      return `${String(value)} ${currency}`
    }
    moneyFormats.set(currency, format)
  }
  return format.format(value)
}

export function accountUsage(account: ClaudeAccount | undefined): ProviderUsage | undefined {
  if (account?.usage?.quotas !== undefined) return account.usage
  const quotas = providerQuotas(account?.limits === undefined ? {} : { limits: account.limits })
  return quotas === undefined ? account?.usage : { ...account?.usage, quotas }
}
