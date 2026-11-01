import type { ChatSession, SessionItem } from './api'

export interface Employee {
  readonly id: string
  readonly name: string
  readonly role: string
  readonly description: string
  readonly avatar: string
  readonly archived: boolean
  readonly revision: number
}

export type EmployeeDraft = Pick<Employee, 'name' | 'role' | 'description' | 'avatar'> & Partial<Pick<Employee, 'id' | 'revision'>>

export interface EmployeesView {
  readonly employees: readonly Employee[]
  readonly error?: string
}

export type EmployeeConversation = {
  readonly session: Pick<ChatSession, 'id' | 'root' | 'title' | 'at' | 'status' | 'provider'>
  readonly hidden: boolean
  readonly items: readonly Extract<SessionItem, { kind: 'mine' | 'theirs' }>[]
  readonly unavailable?: string
  readonly more?: true
  readonly attachmentsOmitted?: true
}

export interface EmployeeMemory {
  readonly employee: Employee
  readonly conversations: readonly EmployeeConversation[]
  readonly availability: 'complete' | 'partial' | 'unavailable'
  readonly next?: string
}

export interface EmployeesApi {
  list(): Promise<EmployeesView>
  save(draft: EmployeeDraft): Promise<EmployeesView>
  archive(id: Employee['id'], revision: Employee['revision']): Promise<EmployeesView>
  restore(id: Employee['id'], revision: Employee['revision']): Promise<EmployeesView>
  retryInstructions(): Promise<EmployeesView>
  memory(id: Employee['id'], cursor?: string): Promise<EmployeeMemory>
  on(said: (view: EmployeesView) => void): () => void
}

export interface EmployeesCliAsked {
  readonly action: 'employees'
  readonly args: readonly string[]
  readonly session?: ChatSession['id']
}

export type EmployeesCliAnswered = { readonly ok: true; readonly result: string } | { readonly ok: false; readonly error: string }
