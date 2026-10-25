export interface ManagerWorkingWindow {
  readonly days: readonly number[]
  readonly start: string
  readonly end: string
}

export interface ManagerSourceConfig {
  readonly id: string
  readonly kind: 'voice-memos'
  readonly enabled: boolean
  readonly directory?: string
}

export interface ManagerIntakeConfig {
  readonly enabled: boolean
  readonly timeZone: string
  readonly windows: readonly ManagerWorkingWindow[]
  readonly sources: readonly ManagerSourceConfig[]
}

export interface SourceItem {
  readonly id: string
  readonly revision: string
  readonly title: string
  readonly createdAt: number
  readonly location: string
}

export type IntakeSuggestion = 'task' | 'note' | 'ignore'
export interface IntakeClassification {
  readonly suggestion: IntakeSuggestion
  readonly summary: string
}

export type IntakeItem = Pick<SourceItem, 'revision' | 'title' | 'createdAt'> & Partial<IntakeClassification> & {
  readonly id: string
  readonly sourceId: ManagerSourceConfig['id']
  readonly state: 'waiting-sync' | 'transcribing' | 'classifying' | 'awaiting-user' | 'claiming' | 'claimed' | 'note' | 'ignored' | 'failed'
  readonly error?: string
  readonly notePath?: string
}

export type SourceStatus = Pick<ManagerSourceConfig, 'id' | 'kind'> & {
  readonly state: 'disabled' | 'baseline' | 'ready' | 'blocked'
  readonly detail?: string
}

export interface ManagerIntakeView {
  readonly detail?: string
  readonly state: 'off' | 'outside-hours' | 'ready' | 'blocked'
  readonly sources: readonly SourceStatus[]
  readonly items: readonly IntakeItem[]
  readonly notesDirectory: string
}

export const DEFAULT_MANAGER_INTAKE: ManagerIntakeConfig = { enabled: false, timeZone: 'UTC', windows: [{ days: [1, 2, 3, 4, 5], start: '09:00', end: '18:00' }], sources: [] }

export interface TaskSource {
  readonly id: ManagerSourceConfig['id']
  readonly capabilities: { readonly audio: boolean; readonly transcript: boolean }
  status(): Promise<Omit<SourceStatus, 'id' | 'kind'>>
  list(cursor?: string): Promise<{ readonly items: readonly SourceItem[]; readonly cursor: string }>
  read(item: SourceItem): Promise<{ readonly transcript: string }>
}

export interface VoiceMemosConnection {
  readonly state: 'connected' | 'access' | 'missing' | 'unsupported' | 'failed'
  readonly detail: string
  readonly transcription?: { readonly ready: boolean; readonly detail: string }
}
