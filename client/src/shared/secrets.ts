export type SecretKind = 'website' | 'http' | 'command' | 'ssh'
export type SecretLifetime = 'task' | 'once' | '15m' | '1h' | '1d' | 'keep'

export interface SecretMetadata {
  readonly name: string
  readonly kind: SecretKind
  readonly places: readonly string[]
  readonly field?: string
  readonly note?: string
  readonly lifetime: SecretLifetime
  readonly expiresAt?: number
  readonly taskId?: string
  readonly cleaned: boolean
  readonly createdAt: number
  readonly lastUsedAt?: number
}

export interface SecretUse {
  readonly at: number
  readonly name: string
  readonly taskId?: string
  readonly kind: string
  readonly place?: string
  readonly result: string
}
