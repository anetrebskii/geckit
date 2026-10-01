import type { CodexRateLimit, ReasoningEffort, SessionMode } from '../../shared/api'

export type RpcId = string | number
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json }

export interface CodexThread {
  id: string
  cwd: string
  preview: string
  name: string | null
  model: string | null
  reasoningEffort?: ReasoningEffort | null
  path: string | null
  updatedAt: number
  turns: CodexTurn[]
}

export interface CodexTurn {
  id: string
  status: 'inProgress' | 'completed' | 'interrupted' | 'failed'
  error: { message: string } | null
  startedAt: number | null
  items: CodexItem[]
}

export type CodexInput = { type: 'text'; text: string; text_elements: [] } | { type: 'image'; url: string }

export type CodexItem =
  | { type: 'userMessage'; id: string; content: CodexInput[] }
  | { type: 'agentMessage'; id: string; text: string; phase?: 'commentary' | 'final_answer' | null }
  | { type: 'plan'; id: string; text: string }
  | { type: 'reasoning'; id: string; summary: string[]; content: string[] }
  | { type: 'commandExecution'; id: string; command: string; cwd: string; aggregatedOutput: string | null; status: string; exitCode: number | null }
  | { type: 'fileChange'; id: string; changes: { path: string; diff: string }[]; status: string }
  | { type: 'mcpToolCall'; id: string; server: string; tool: string; arguments: Json; result: Json; error: { message: string } | null; status: string }
  | { type: 'webSearch'; id: string; query: string }
  | { type: 'contextCompaction'; id: string }

export interface ThreadOptions {
  cwd: string
  model?: string
  modelProvider: 'openai'
  approvalPolicy: 'untrusted' | 'on-request'
  approvalsReviewer: 'user' | 'auto_review'
  sandbox: 'read-only' | 'workspace-write'
}

export function codexOptions(root: string, mode: SessionMode, model?: string): ThreadOptions {
  return {
    cwd: root,
    ...(model === undefined ? {} : { model }),
    modelProvider: 'openai',
    approvalPolicy: mode === 'manual' ? 'untrusted' : 'on-request',
    approvalsReviewer: mode === 'auto' ? 'auto_review' : 'user',
    sandbox: mode === 'plan' ? 'read-only' : 'workspace-write',
  }
}

export interface RpcParams {
  initialize: { clientInfo: { name: string; title: string; version: string }; capabilities: { experimentalApi: boolean } }
  'account/read': { refreshToken: boolean }
  'account/rateLimits/read': Record<string, never>
  'model/list': { cursor?: string | null }
  'thread/start': ThreadOptions & { ephemeral?: boolean; baseInstructions?: string; config?: { web_search: 'disabled'; features: { shell_tool: false; unified_exec: false } } }
  'thread/resume': ThreadOptions & { threadId: string; excludeTurns: boolean }
  'thread/fork': ThreadOptions & { threadId: string; lastTurnId?: string; excludeTurns: boolean }
  'thread/list': { cwd: string[]; cursor?: string | null; limit: number; sortKey: 'updated_at'; sourceKinds: string[] }
  'thread/read': { threadId: string; includeTurns: boolean }
  'thread/turns/list': { threadId: string; cursor?: string | null; limit: number; sortDirection: 'asc'; itemsView: 'full' }
  'thread/name/set': { threadId: string; name: string }
  'thread/delete': { threadId: string }
  'thread/unsubscribe': { threadId: string }
  'thread/compact/start': { threadId: string }
  'turn/start': { threadId: string; input: CodexInput[]; cwd: string; model?: string; effort?: ReasoningEffort | null; approvalPolicy: ThreadOptions['approvalPolicy']; approvalsReviewer: ThreadOptions['approvalsReviewer']; sandboxPolicy: { type: 'readOnly'; networkAccess: boolean } | { type: 'workspaceWrite'; writableRoots: string[]; networkAccess: boolean; excludeTmpdirEnvVar: boolean; excludeSlashTmp: boolean } }
  'turn/interrupt': { threadId: string; turnId: string }
}

export interface RpcResults {
  initialize: { userAgent: string }
  'account/read': { account: { type: 'chatgpt'; email: string | null; planType: string } | { type: 'apiKey' | 'amazonBedrock' } | null }
  'account/rateLimits/read': { rateLimits: CodexRateLimit; rateLimitsByLimitId?: Record<string, CodexRateLimit> | null }
  'model/list': { data: { model: string; displayName: string; description: string; hidden: boolean; supportedReasoningEfforts?: { reasoningEffort: ReasoningEffort; description: string }[]; defaultReasoningEffort?: ReasoningEffort; isDefault?: boolean }[]; nextCursor: string | null }
  'thread/start': { thread: CodexThread; model: string; reasoningEffort?: ReasoningEffort | null }
  'thread/resume': RpcResults['thread/start']
  'thread/fork': RpcResults['thread/start']
  'thread/list': { data: CodexThread[]; nextCursor: string | null }
  'thread/read': { thread: CodexThread }
  'thread/turns/list': { data: CodexTurn[]; nextCursor: string | null }
  'thread/name/set': object
  'thread/delete': object
  'thread/unsubscribe': object
  'thread/compact/start': object
  'turn/start': { turn: CodexTurn }
  'turn/interrupt': object
}

export interface CodexQuestion {
  id: string
  question: string
  options: { label: string; description: string }[] | null
}

export type CodexEvent =
  | { method: 'account/rateLimits/updated'; params: { rateLimits: CodexRateLimit; threadId?: never } }
  | { method: 'item/started' | 'item/completed'; params: { threadId: string; item: CodexItem } }
  | { method: 'item/agentMessage/delta' | 'item/reasoning/summaryTextDelta' | 'item/commandExecution/outputDelta'; params: { threadId: string; itemId: string; delta: string; summaryIndex?: number } }
  | { method: 'turn/started' | 'turn/completed'; params: { threadId: string; turn: CodexTurn } }
  | { method: 'thread/tokenUsage/updated'; params: { threadId: string; tokenUsage: { last: { inputTokens: number; outputTokens: number }; modelContextWindow: number | null } } }
  | { method: 'item/commandExecution/requestApproval'; id: RpcId; params: { threadId: string; itemId: string; command?: string; reason?: string } }
  | { method: 'item/fileChange/requestApproval'; id: RpcId; params: { threadId: string; itemId: string; reason?: string; grantRoot?: string } }
  | { method: 'item/tool/requestUserInput'; id: RpcId; params: { threadId: string; itemId: string; questions: CodexQuestion[] } }
  | { method: 'item/permissions/requestApproval'; id: RpcId; params: { threadId: string; itemId: string; reason: string | null; permissions: { network: { enabled: boolean | null } | null; fileSystem: { read: string[] | null; write: string[] | null; entries?: Json[] } | null } } }
  | { method: 'serverRequest/resolved'; params: { threadId: string; requestId: RpcId } }
  | { method: 'error'; params: { threadId: string; error: { message: string }; willRetry: boolean } }

export type ApprovalEvent = Extract<CodexEvent, { id: RpcId }>
