export interface OperatorAsked {
  readonly action: 'operator'
  readonly token: string
  readonly args: readonly string[]
}

export type OperatorAnswered = { readonly ok: true; readonly result: string } | { readonly ok: false; readonly error: string }
export const OPERATOR_HELP = `geckit service status
geckit service projects list|add <absolute-path>
geckit service settings get|set <JSON>
geckit service sessions list|start <SessionMessage JSON>
geckit service sessions items|pending|stop|retry <session-id>
geckit service sessions send <SessionMessage JSON>
geckit service sessions answer <session-id> <card-id> <answer>
geckit service sessions answer-request <session-id> <request-id> <RequestChoice JSON>
geckit service sessions answer-team <session-id> <request-id> allow|decline [note]
geckit service manager view|configure <JSON>|send <text>|pause|resume|answer <id> <choice>
geckit service employees <existing employees command>
geckit service methods
geckit service call <method> [arguments JSON array]
geckit service shutdown`
