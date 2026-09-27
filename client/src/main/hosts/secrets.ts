import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { safeStorage } from 'electron'

/**
 * Passwords the person asked GeckIt to remember, and nothing else.
 *
 * Each is encrypted by the system's credential store (Keychain, the Windows
 * data protection, libsecret) before it is written, in a file of its own and
 * never in the settings, which windows are sent whole.
 */

export interface Secrets {
  readonly can: () => boolean
  get(host: string): string | undefined
  set(host: string, password: string): void
  forget(host: string): void
  has(host: string): boolean
}

export function secretsAt(path: string): Secrets {
  let kept: Record<string, string> = {}
  try {
    kept = JSON.parse(readFileSync(path, 'utf8')) as Record<string, string>
  } catch {
    kept = {}
  }
  const write = (): void => {
    try {
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
      writeFileSync(`${path}.new`, JSON.stringify(kept), { mode: 0o600 })
      renameSync(`${path}.new`, path)
    } catch {
      // Not written is not remembered; the next connection asks again.
    }
  }
  const can = (): boolean => {
    try {
      return safeStorage.isEncryptionAvailable()
    } catch {
      return false
    }
  }
  return {
    can,
    get(host) {
      const sealed = kept[host]
      if (sealed === undefined || !can()) return undefined
      try {
        return safeStorage.decryptString(Buffer.from(sealed, 'base64'))
      } catch {
        return undefined
      }
    },
    set(host, password) {
      if (!can()) return
      kept = { ...kept, [host]: safeStorage.encryptString(password).toString('base64') }
      write()
    },
    forget(host) {
      if (kept[host] === undefined) return
      const { [host]: _gone, ...rest } = kept
      kept = rest
      write()
    },
    has: (host) => kept[host] !== undefined,
  }
}
