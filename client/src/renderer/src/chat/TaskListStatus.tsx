import { llmProviderInfo } from '../../../shared/providers'
import { Icon } from '../ui/Icon'
import type { Chat } from './useChat'

type ListState = Pick<Chat, 'listed' | 'listLoading' | 'listProblem' | 'listStatus'>

export function taskListSettled(chat: ListState): boolean {
  return chat.listed && !chat.listLoading && chat.listProblem === undefined && chat.listStatus.length === 0
}

export function TaskListStatus({ chat }: { readonly chat: ListState & Pick<Chat, 'refresh' | 'everyone'> }): React.JSX.Element | null {
  const loading = [...new Set(chat.listStatus.filter((one) => one.state === 'loading').map((one) => llmProviderInfo(one.provider).name))]
  const failed = chat.listStatus.filter((one) => one.state === 'failed')
  const providers = [...new Set(failed.map((one) => llmProviderInfo(one.provider).name))].join(', ')
  const busy = chat.listLoading || loading.length > 0
  const problem = chat.listProblem !== undefined || failed.length > 0
  if (!busy && !problem) return null
  return (
    <div className="task-list-status" role="status" aria-live="polite">
      {busy ? <div className="task-list-progress"><Icon name="spinner" /><span>{!chat.listed ? 'Loading tasks…' : loading.length === 0 ? 'Updating tasks…' : `Updating ${loading.join(', ')}…`}</span></div> : null}
      {problem ? <div className="task-list-problem">
        <span title={[chat.listProblem, ...failed.map((one) => one.problem)].filter(Boolean).join('\n')}>
          {chat.listProblem === undefined ? `Could not update ${providers}.` : 'Could not load tasks.'}
          <small>{chat.everyone.length === 0 ? 'Some tasks may be missing.' : 'Showing last loaded tasks.'}</small>
        </span>
        <button type="button" className="quiet" disabled={busy} onClick={chat.refresh}>Retry</button>
      </div> : null}
    </div>
  )
}
