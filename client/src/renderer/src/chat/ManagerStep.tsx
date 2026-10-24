import { Icon } from '../ui/Icon'

/** One answer of the setup: open and asking, answered and folded, or still locked behind an earlier one. */
export function ManagerStep({ number, title, value, state, locked, onOpen, children }: {
  readonly number: number
  readonly title: string
  readonly value?: string
  readonly state: 'open' | 'answered' | 'locked'
  readonly locked?: string
  readonly onOpen?: () => void
  readonly children?: React.ReactNode
}): React.JSX.Element {
  const head = <>
    <span className="manager-step-mark">{state === 'answered' ? <Icon name="check" size={12} /> : number}</span>
    <span className="manager-step-title">{title}</span>
    {value === undefined || state !== 'answered' ? null : <span className="manager-step-value">{value}</span>}
  </>
  return <li className={`manager-step is-${state}`}>
    {state === 'answered' && onOpen !== undefined
      ? <button type="button" className="manager-step-head" onClick={onOpen}>{head}<Icon name="pencil" size={12} /></button>
      : <div className="manager-step-head">{head}</div>}
    {state === 'locked' ? <p className="manager-step-locked">{locked}</p> : null}
    {state === 'open' ? <div className="manager-step-body"><div className="manager-step-fold">{children}</div></div> : null}
  </li>
}
