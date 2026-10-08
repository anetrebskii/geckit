import type { ProviderQuota, ProviderUsage } from '../../../shared/api'
import { quotaPart } from '../../../shared/provider-usage'
import { Cell } from './PhoneKit'
import { Meter, until } from './UsageMeter'

export function quotaValue(quota: ProviderQuota): string {
  const part = quotaPart(quota)
  if (quota.used !== undefined) return `${quota.used.toLocaleString()}${quota.limit === undefined ? '' : ` of ${quota.limit.toLocaleString()}`}${quota.unit === undefined ? '' : ` ${quota.unit}`}`
  return part === undefined ? 'Not reported' : `${String(Math.round(part * 100))}%`
}

export function QuotaRows({ usage, now }: { readonly usage: ProviderUsage | undefined; readonly now: number }): React.JSX.Element {
  return <div className="phone-group provider-quotas">{usage?.quotas === undefined || usage.quotas.length === 0 ? <Cell label="Limits" value="Unavailable" /> : usage.quotas.map((quota) => {
    const part = quotaPart(quota)
    return <Cell key={quota.id} label={quota.name} says={quota.resetsAt === undefined ? undefined : `Resets in ${until(quota.resetsAt, now)}`} value={<span className={`phone-meter${quota.used === undefined ? '' : ' quota-count'}`}>{part === undefined ? null : <Meter part={part} />}<span>{quotaValue(quota)}</span></span>} />
  })}</div>
}

export function QuotaStats({ usage, now }: { readonly usage: ProviderUsage | undefined; readonly now: number }): React.JSX.Element | null {
  if (usage?.quotas === undefined || usage.quotas.length === 0) return null
  return <>{usage.quotas.map((quota) => {
    const part = quotaPart(quota)
    const reset = quota.resetsAt === undefined ? '' : `, resets in ${until(quota.resetsAt, now)}`
    return <span key={quota.id} className="stat" title={`${quota.name}: ${quotaValue(quota)}${reset}`}><span>{quota.name}</span>{part === undefined ? null : <Meter part={part} />}<span className="value">{quotaValue(quota)}<span className="resets">{reset}</span></span></span>
  })}</>
}
