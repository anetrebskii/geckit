/** A request from a page the phone shows off the Mac's localhost, as the phone's web view made it. */
export interface LocalAsk {
  readonly url: string
  readonly method: string
  readonly headers: readonly (readonly [string, string])[]
  /** Base64, or empty for none. */
  readonly body: string
}

/** What the Mac's localhost answered, for the phone's web view. */
export interface LocalAnswer {
  readonly status: number
  readonly headers: readonly (readonly [string, string])[]
  readonly body: string
  /** Where redirects ended, when that is not where it was asked. */
  readonly moved?: string
}

/** The scheme the phone's web view hands to GeckIt; http cannot be taken over there. */
export const LOCAL_SCHEME = 'geckit-local'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]'])

const parsed = (url: string): URL | undefined => {
  try {
    return new URL(url)
  } catch {
    return undefined
  }
}

/** An address on the computer it is opened on, which from the phone means the Mac. */
export function isLocal(url: string): boolean {
  const at = parsed(url)
  return at !== undefined && at.protocol === 'http:' && LOOPBACK.has(at.hostname)
}

/** `http://localhost:5173/a` as the phone's web view asks for it. */
export const toPhone = (url: string): string => url.replace(/^http:/, `${LOCAL_SCHEME}:`)

/** The phone's address back as the Mac asks for it. */
export const toMac = (url: string): string => url.replace(`${LOCAL_SCHEME}:`, 'http:')
