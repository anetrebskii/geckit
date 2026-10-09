import { readAccount } from './accounts'
import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { assistantsIn, planLine } from '../../../shared/api'
import type { ClaudeAccount, ProviderUsage, SessionProvider } from '../../../shared/api'
import { accountUsage, providerQuotas, quotaPart } from '../../../shared/provider-usage'
import { llmProviderInfo } from '../../../shared/providers'
import { Icon } from '../ui/Icon'
import { Sheet } from '../ui/Sheet'
import { accountsOf, usageOf } from './plans'
import { Cell } from './PhoneKit'
import { quotaValue } from './ProviderUsage'
import { Meter, until } from './UsageMeter'
import type { Chat } from './useChat'
import './phone-home.css'

export type AssistantStatusChat = Pick<Chat, 'provider' | 'settings' | 'hosts' | 'plans' | 'plan' | 'plansAt'>
const measuredTime = new Intl.DateTimeFormat(undefined, { timeStyle: 'short' })

type Snapshot = Required<Pick<ClaudeAccount, 'provider'>> & { readonly account: ClaudeAccount | undefined; readonly state: 'checking' | 'ready' | 'unavailable' }
type Group = Pick<Snapshot, 'account' | 'state'> & { readonly measuredAt: ProviderUsage['measuredAt']; readonly name: string; readonly usage: ProviderUsage | undefined; readonly stale: boolean; readonly remote: boolean }

function useAccounts(providers: readonly SessionProvider[], phone: boolean): readonly Snapshot[] {
  const [held, setHeld] = useState<{ readonly providers: readonly SessionProvider[]; readonly snapshots: readonly Snapshot[] }>({ providers, snapshots: [] })
  useEffect(() => {
    const enabled = providers
    let current = true
    const pending = new Set<SessionProvider>()
    const revisions = new Map<SessionProvider, number>()
    const retries = new Map<SessionProvider, number>()
    const put = (snapshot: Snapshot): void => {
      if (current) setHeld((was) => ({ providers, snapshots: [...(was.providers === providers ? was.snapshots : []).filter((one) => enabled.includes(one.provider) && one.provider !== snapshot.provider), snapshot] }))
    }
    const ask = (targets = enabled): void => {
      for (const provider of targets) {
        if (pending.has(provider)) continue
        pending.add(provider)
        const revision = revisions.get(provider) ?? 0
        void readAccount(provider).then((account) => { if ((revisions.get(provider) ?? 0) !== revision) return; const matches = account === undefined || (account.provider ?? 'claude') === provider; put({ provider, account: matches ? account : undefined, state: account === undefined || !matches ? 'unavailable' : 'ready' }); if (current && phone && account === undefined) { clearTimeout(retries.get(provider)); retries.set(provider, window.setTimeout(() => ask([provider]), 5000)) } }, () => { if ((revisions.get(provider) ?? 0) === revision) put({ provider, account: undefined, state: 'unavailable' }) }).finally(() => pending.delete(provider))
      }
    }
    ask()
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') ask() }, 5 * 60_000)
    const focus = (): void => ask()
    window.addEventListener('focus', focus)
    const off = window.geckit.chat.onAccount((account) => {
      const provider = account.provider ?? 'claude'
      if (enabled.includes(provider)) { clearTimeout(retries.get(provider)); retries.delete(provider); revisions.set(provider, (revisions.get(provider) ?? 0) + 1); put({ provider, account, state: 'ready' }) }
    })
    return () => { current = false; clearInterval(timer); window.removeEventListener('focus', focus); retries.forEach((timer) => clearTimeout(timer)); off() }
  }, [providers, phone])
  return held.providers === providers ? held.snapshots : []
}

function stateLine(group: Group): string | undefined {
  if (group.state === 'checking') return 'Checking...'
  if (group.state === 'unavailable') return 'Unavailable'
  if (group.account?.here === false) return 'Not installed'
  if (group.account?.signedIn === false) return 'Sign in required'
  if (group.stale) return 'Last measured'
  return group.usage?.quotas?.length ? undefined : 'Limits unavailable'
}

function groupsOf(provider: SessionProvider, snapshot: Snapshot | undefined, chat: AssistantStatusChat): Group[] {
  const base = { account: snapshot?.account, state: snapshot?.state ?? 'checking', stale: false } as const
  if (provider !== 'claude') return [{ ...base, name: '', remote: false, usage: accountUsage(base.account), measuredAt: base.account?.usage?.measuredAt }]
  const hostName = (place: string): string => place === '' ? 'Local' : chat.hosts.find((host) => host.id === place)?.name ?? place
  return accountsOf(['', ...chat.plans.map((one) => one.place)], chat.plans, hostName).map((item) => {
    const local = item.places.includes('')
    const place = item.places[0] ?? ''
    const host = chat.hosts.find((one) => one.id === place)
    const account = local ? base.account : host === undefined ? undefined : { here: host.state !== 'missing', signedIn: host.state === 'signin' ? false : undefined, ...(host.plan === undefined ? {} : { plan: host.plan }), ...(host.version === undefined ? {} : { program: { version: host.version } }) }
    const plan = usageOf(item, chat.plan)
    const quotas = providerQuotas(plan === undefined ? {} : { plan })
    const localUsage = chat.plan === undefined ? accountUsage(account) ?? (quotas === undefined ? undefined : { quotas }) : { quotas: providerQuotas({ plan: chat.plan }) ?? [] }
    return { account, remote: !local, state: local ? base.state : host === undefined ? 'unavailable' : host.state === 'connecting' && plan === undefined ? 'checking' : 'ready', name: item.places.map(hostName).join(' · '), usage: local ? localUsage : quotas === undefined ? undefined : { quotas }, stale: !local && host?.state !== 'up', measuredAt: chat.plansAt[place] }
  })
}

function Details({ chat, snapshots, providers, phone, now, onClose }: { readonly chat: AssistantStatusChat; readonly snapshots: readonly Snapshot[]; readonly providers: readonly SessionProvider[]; readonly phone: boolean; readonly now: number; readonly onClose: () => void }): React.JSX.Element {
  const title = useId()
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    const dialog = body.current?.closest('[role="dialog"]')
    dialog?.setAttribute('aria-modal', 'true')
    dialog?.setAttribute('aria-labelledby', title)
    body.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const key = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); onClose(); return }
      if (event.key !== 'Tab') return
      const controls = body.current?.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]')
      const first = controls?.[0]
      const last = controls?.[controls.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('keydown', key, true); opener?.focus() }
  }, [onClose, title])
  const content = <div className="assistant-details" ref={body}>
    <header className="assistant-details-header"><h2 id={title}>Assistants</h2><button type="button" className="assistant-close" aria-label="Close assistants" onClick={onClose}><Icon name="close" size={16} /></button></header>
    <div className="assistant-details-list" tabIndex={0} aria-label="Assistant account details">
      {providers.map((provider) => {
        const info = llmProviderInfo(provider, undefined, chat.settings.providerPlugins)
        const groups = groupsOf(provider, snapshots.find((one) => one.provider === provider), chat)
        return <section className="assistant-section" key={provider}>
          <h3><Icon name={info.icon} size={18} />{info.name}</h3>
          {groups.map((group) => {
            const state = stateLine(group)
            const ready = group.state === 'ready' && group.account?.here !== false && group.account?.signedIn !== false
            const plan = group.account === undefined ? undefined : ready ? group.account.key === true ? 'API key' : group.remote && group.account.plan === undefined ? 'Plan unavailable' : info.planName === '' ? 'On this computer' : [info.planName, group.account.plan, 'plan'].filter((part) => part !== undefined).join(' ') : planLine(group.account, provider)
            const program = group.account?.program
            const metadata = [program === undefined ? undefined : `CLI ${program.version}`, program?.from, group.measuredAt === undefined ? undefined : `Measured ${measuredTime.format(group.measuredAt)}`].filter((part) => part !== undefined).join(' · ')
            return <div className="assistant-account" key={group.name}>
              {group.name === '' || (groups.length === 1 && !group.remote) ? null : <h4>{group.name}</h4>}
              {plan === undefined ? null : <p className="assistant-plan">{plan}</p>}
              {state === undefined ? null : <p className="assistant-state" role="status">{state}</p>}
              {!ready || !group.usage?.quotas?.length ? null : <div className="assistant-quota-grid">{group.usage.quotas.map((quota) => {
                const part = quotaPart(quota)
                const wide = quota.used !== undefined || quota.name.length > 22 || part === undefined
                return <div key={quota.id} className={`assistant-quota-tile${wide ? ' wide' : ''}`}>
                  <div className="assistant-quota-heading"><span>{quota.name}</span><strong>{quotaValue(quota)}</strong></div>
                  {part === undefined ? null : <Meter part={part} />}
                  {quota.resetsAt === undefined ? null : <span className="assistant-quota-reset">Resets in {until(quota.resetsAt, now)}</span>}
                </div>
              })}</div>}
              {metadata === '' ? null : <p className="assistant-metadata" title={program?.path}>{metadata}</p>}
            </div>
          })}
        </section>
      })}
    </div>
  </div>
  if (phone) return <Sheet className="assistant-details-sheet" cancel={false} onClose={onClose}>{content}</Sheet>
  return createPortal(<div className="dialog-scrim" onMouseDown={onClose}><div className="dialog assistant-details-dialog" role="dialog" aria-modal="true" aria-labelledby={title} onMouseDown={(event) => event.stopPropagation()}>{content}</div></div>, document.body)
}

function AssistantStatusView({ chat, phone = false }: { readonly chat: AssistantStatusChat; readonly phone?: boolean }): React.JSX.Element {
  const chatProviders = chat.settings.chatProviders
  const providers = useMemo(() => assistantsIn({ chatProviders }), [chatProviders])
  const snapshots = useAccounts(providers, phone)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(Date.now)
  const close = useCallback(() => setOpen(false), [])
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer) }, [])
  return <>
    {phone ? <Cell label="Account and limits" onPress={() => setOpen(true)} /> : <button type="button" className="quiet" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>Account and limits</button>}
    {open ? <Details chat={chat} providers={providers} snapshots={snapshots} phone={phone} now={now} onClose={close} /> : null}
  </>
}

export const AssistantStatus = memo(AssistantStatusView, (previous, next) => previous.phone === next.phone && previous.chat.provider === next.chat.provider && previous.chat.settings.chatProviders === next.chat.settings.chatProviders && previous.chat.settings.providerPlugins === next.chat.settings.providerPlugins && previous.chat.hosts === next.chat.hosts && previous.chat.plans === next.chat.plans && previous.chat.plan === next.chat.plan && previous.chat.plansAt === next.chat.plansAt)
