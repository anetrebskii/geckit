import type { ChatSession } from './api'

export type SessionListStatus = Required<Pick<ChatSession, 'provider'>> & {
  readonly roots: readonly ChatSession['root'][]
} & (
  | { readonly state: 'loading' }
  | { readonly state: 'failed'; readonly problem: string }
)
