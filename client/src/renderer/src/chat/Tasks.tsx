import type { BackgroundTask } from '../../../shared/api'
import { Picker } from '../ui/Menu'

/** The tool's word for what is running, as the menu says it. */
const KINDS: Readonly<Record<string, string>> = {
  local_bash: 'a command',
  local_agent: 'a helper',
  remote_agent: 'a helper in the cloud',
  local_workflow: 'a workflow',
}

/**
 * What Claude Code has running in the background for the conversation, under
 * the field while there is any. Pressing one stops it, as x does in /tasks.
 */
export function Tasks({
  tasks,
  onStop,
}: {
  readonly tasks: readonly BackgroundTask[]
  readonly onStop: (task: string) => void
}): React.JSX.Element {
  return (
    <Picker
      label={`${String(tasks.length)} in the background`}
      tip="What Claude Code has running in the background"
      title="In the background"
      explained
      choices={tasks.map((one) => ({ value: one.id, label: one.what || one.id, says: KINDS[one.kind] ?? 'a task' }))}
      note="Press one to stop it. Claude hears how each one ended."
      onPick={onStop}
    />
  )
}
