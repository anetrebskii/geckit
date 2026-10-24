import type { ManagerSaid as Said } from './manager-said'
import { Icon } from '../ui/Icon'

const LABEL: Record<Said['kind'], string> = { telegram: 'From Telegram', worker: 'Worker update', cli: 'GeckIt CLI' }
const ICON: Record<Said['kind'], 'chat' | 'board' | 'terminal'> = { telegram: 'chat', worker: 'board', cli: 'terminal' }
const DETAIL: Record<Said['kind'], string> = { telegram: 'What was sent', worker: 'What the worker sent', cli: 'What it answered' }

/** What GeckIt put into the Manager session, drawn as what it is rather than as the JSON the manager reads. */
export function ManagerSaid({ said }: { readonly said: Said }): React.JSX.Element {
  return <div className={`manager-said is-${said.kind}${said.failed === true ? ' failed' : ''}`}>
    <div className="manager-said-head">
      <Icon name={ICON[said.kind]} size={12} />
      <span className="manager-said-label">{LABEL[said.kind]}</span>
      {said.marks.map((mark) => <span key={mark} className="manager-said-mark">{mark}</span>)}
    </div>
    {said.title === undefined ? null : <p className="manager-said-title">{said.title}</p>}
    {said.command === undefined ? null : <p className="manager-said-command">{said.command}</p>}
    {said.text === '' ? null : <p className="manager-said-text">{said.text}</p>}
    {said.where === undefined ? null : <p className="manager-said-where">{said.where}</p>}
    {said.detail === undefined ? null : <details className="manager-said-detail"><summary>{DETAIL[said.kind]}</summary><pre>{said.detail}</pre></details>}
  </div>
}
