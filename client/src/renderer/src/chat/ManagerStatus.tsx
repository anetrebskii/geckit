import type { ManagerThread, ManagerView } from '../../../shared/manager'
import { DEFAULT_COMPACT_AT } from '../../../shared/manager'
import { money } from '../../../shared/provider-usage'
import { tokens } from './Status'
import { Meter } from './UsageMeter'

const COUNT = new Intl.NumberFormat('en-US')
export const COMPACT_TITLE = 'Summarise this Manager conversation now, so each answer rereads less'
export const COMPACT_ASK = 'Manager writes a summary of this thread so far and goes on from it, with its saved record of the work it follows. Everything stays here to read.'

/** Why the open thread can't be compacted now, or nothing when it can. */
export function cantCompact(view: ManagerView, thread: ManagerThread | undefined, connected: boolean, assistantName: string): string | undefined {
  if (view.session === undefined) return 'This thread has no Manager session yet.'
  if ((thread === undefined ? view.hold : thread.hold) === 'compacting') return 'Compacting...'
  if (view.providers.find((one) => one.provider === (thread?.provider ?? view.config.provider))?.compacts === false) return `${assistantName} can't compact conversations.`
  if (!connected || view.state !== 'idle' || view.session.state === 'working') return 'Manager can compact once it has finished.'
  return undefined
}

export function contextTitle(view: ManagerView): string {
  const spend = view.session?.spend
  if (spend?.used === undefined) return ''
  const compactAt = view.config.compactAt ?? DEFAULT_COMPACT_AT
  return `${COUNT.format(spend.used)}${spend.window === undefined ? '' : ` of ${COUNT.format(spend.window)}`} tokens in this Manager conversation. ${compactAt === 0 ? 'Automatic compaction is off.' : `Manager compacts it at ${COUNT.format(compactAt)} tokens.`}`
}

/** Under the composer, as under a conversation: how full Manager's context is, Compact, Clear and what it has cost. */
export function ManagerStatus({ view, cant, onCompact, onClear }: { readonly view: ManagerView; readonly cant: string | undefined; readonly onCompact: () => void; readonly onClear: () => void }): React.JSX.Element | null {
  const spend = view.session?.spend
  if (spend?.used === undefined) return null
  return <div className="talk-status">
    <span className="stat" title={contextTitle(view)}>
      <span>Context</span>
      {spend.window === undefined ? null : <Meter part={spend.used / spend.window} />}
      <span className="value">{tokens(spend.used)}{spend.window === undefined ? '' : ` of ${tokens(spend.window)}`}</span>
    </span>
    <button type="button" className="act" disabled={cant !== undefined} title={cant ?? COMPACT_TITLE} onClick={onCompact}>Compact</button>
    <button type="button" className="act" title="Clear history and Manager's context in this thread" onClick={onClear}>Clear</button>
    {spend.cost === undefined ? null : <span className="stat" title={spend.costKind === 'billed' ? 'Cost reported as billed by the provider.' : 'Conversation cost at API prices, reported by the provider. This is not a subscription charge.'}>
      <span>{spend.costKind === 'billed' ? 'Billed cost' : 'API equivalent'}</span>
      <span className="value">{money(spend.cost, spend.currency)}</span>
    </span>}
  </div>
}
