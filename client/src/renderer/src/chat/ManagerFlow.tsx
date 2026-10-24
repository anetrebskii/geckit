import type { ManagerConfig } from '../../../shared/manager'
import { Icon } from '../ui/Icon'

export type ManagerStepName = 'assistant' | 'delegation' | 'telegram' | 'enable'

const NODES = [
  { key: 'you', icon: 'chat', label: 'Telegram' },
  { key: 'manager', icon: 'terminal', label: 'Manager' },
  { key: 'workers', icon: 'board', label: 'Workers' },
] as const

function lit(step: ManagerStepName, delegation: ManagerConfig['delegation']): readonly string[] {
  if (step === 'assistant') return ['manager']
  if (step === 'delegation') return delegation === 'approve' ? ['you', 'manager', 'workers'] : ['manager', 'workers']
  if (step === 'telegram') return ['you', 'manager']
  return ['you', 'manager', 'workers']
}

function say(step: ManagerStepName, delegation: ManagerConfig['delegation']): string {
  if (step === 'assistant') return 'One GeckIt session is the manager. The assistant you pick here is the one that runs it.'
  if (step === 'delegation') return delegation === 'approve' ? 'Manager asks you in Telegram before each new worker starts.' : 'Manager starts a worker session for each task and follows it up.'
  if (step === 'telegram') return 'Telegram is where you talk to Manager, through a bot that is yours.'
  return 'You write in Telegram, Manager puts workers on it, and the answers come back to you.'
}

/** What the open step is about, drawn as the three parts it joins and the direction it adds. */
export function ManagerFlow({ step, delegation }: { readonly step: ManagerStepName; readonly delegation: ManagerConfig['delegation'] }): React.JSX.Element {
  const shown = lit(step, delegation)
  return <div className={`manager-flow step-${step}`} data-delegation={delegation}>
    <div className="manager-flow-stage" aria-hidden="true">
      <span className="manager-flow-line" />
      <span className="manager-flow-mark"><span className="manager-flow-dot" /></span>
      <ol className="manager-flow-nodes">
        {NODES.map((node) => <li key={node.key} className={`manager-flow-node node-${node.key}${shown.includes(node.key) ? ' lit' : ''}`}>
          <span className="manager-flow-badge"><span className="manager-flow-ring" /><Icon name={node.icon} /></span>
          <span className="manager-flow-name">{node.label}</span>
        </li>)}
      </ol>
    </div>
    <p className="manager-flow-say">{say(step, delegation)}</p>
  </div>
}
