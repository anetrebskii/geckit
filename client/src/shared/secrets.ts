export type SecretKind = 'website' | 'http' | 'command' | 'ssh'
export type SecretLifetime = 'task' | 'once' | '15m' | '1h' | '1d' | 'keep'

export interface SecretMetadata {
  readonly name: string
  readonly kind: SecretKind
  readonly places: readonly string[]
  readonly field?: string
  readonly note?: string
  readonly user?: string
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

/** What Settings saves: a new secret, or a change to one whose name and kind stay. */
export interface SecretEntry {
  readonly name: string
  readonly kind: SecretKind
  readonly places: readonly string[]
  readonly note: string
  readonly user: string
  readonly lifetime: SecretLifetime
  readonly editing: boolean
}

export const SECRET_NAME = /^[a-z0-9][a-z0-9-]{1,47}$/

export function placesValid(kind: SecretKind, places: readonly string[]): string | undefined {
  if (places.length === 0) return 'Say where the secret may be used with --for.'
  for (const one of places) {
    if (kind === 'website' && !/^https?:\/\/[^/\s]+$/.test(one)) return `${one} is not a site: give it as https://example.com.`
    if (kind === 'http' && !/^(\*\.)?[a-z0-9.-]+(:\d+)?$/i.test(one)) return `${one} is not a host: give it as api.example.com or *.example.com.`
    if (kind === 'command' && !/^[^\s/]+$|^\/\S+$/.test(one)) return `${one} is not a program: give its name, such as psql, or its full path.`
    if (kind === 'ssh' && !/^[a-z0-9.*?-]+$/i.test(one)) return `${one} is not an SSH host pattern.`
  }
  return undefined
}
