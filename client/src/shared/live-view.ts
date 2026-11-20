import type { ViewFrame, ViewInput } from './api'

/** A sign-in link: which computer, which profile, and the one-time token. */
export interface SignInLink { readonly computer: string; readonly name: string; readonly profile: string; readonly token: string }

export function readSignIn(text: string): SignInLink | undefined {
  try {
    const url = new URL(text.trim())
    if (url.protocol !== 'geckit:' || url.hostname !== 'signin') return undefined
    const computer = url.searchParams.get('computer') ?? ''
    const profile = url.searchParams.get('profile') ?? ''
    const token = url.searchParams.get('t') ?? ''
    if (computer === '' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(profile) || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return undefined
    return { computer, name: (url.searchParams.get('name') ?? '').slice(0, 80) || 'the computer', profile, token }
  } catch { return undefined }
}

export const TAB_HANDOFF_PATH = '/browser'
export const TAB_HANDOFF_HOST = 'https://geckit-signal.web.app'
export const TAB_HANDOFF_TTL = 15 * 60_000
export const TAB_HANDOFF_LEASE = 45_000
export const TAB_HANDOFF_KEYS = new Set(['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'])

export const tabHandoffUrl = (key: string, expires: number, view: string): string => `${TAB_HANDOFF_HOST}${TAB_HANDOFF_PATH}?view=${encodeURIComponent(view)}#${key}.${expires}`
export const hasTabHandoffLink = (text: string): boolean => /https:\/\/geckit-signal\.web\.app\/browser(?:\.html|\/)?(?:\?[^#\s]*)?#[A-Za-z0-9_-]{43}\.\d{13}/i.test(text)

export function readTabHandoff(hash: string): { readonly key: string; readonly expires: number } | undefined {
  const match = /^#([A-Za-z0-9_-]{43})\.(\d{13})$/.exec(hash)
  return match?.[1] === undefined ? undefined : { key: match[1], expires: Number(match[2]) }
}

export type TabHandoffAction =
  | { readonly type: 'open'; readonly acceptVideo?: true }
  | { readonly type: 'end' }
  | { readonly type: 'video-stop' }
  | { readonly type: 'frame'; readonly acceptUnchanged?: true; readonly acceptPatches?: true }
  | { readonly type: 'metadata' }
  | { readonly type: 'input'; readonly input: ViewInput }
export type TabHandoffRequest = { readonly id: number } & TabHandoffAction
export type TabHandoffPngFrame = Omit<ViewFrame, 'jpeg'> & { readonly png: string }
export type TabHandoffPatch = Pick<NonNullable<ViewFrame['pointer']>, 'x' | 'y'> & Pick<TabHandoffPngFrame, 'png'>
export type TabVideoEvent = { readonly key: string } & (
  | { readonly type: 'start' | 'stop' }
  | { readonly type: 'frame'; readonly jpeg: string }
)
export type TabHandoffReply = Pick<TabHandoffRequest, 'id'> & (
  | ({ readonly ok: true; readonly frame?: ViewFrame | TabHandoffPngFrame; readonly patch?: TabHandoffPatch; readonly unchanged?: true; readonly videoKey?: string } & Partial<Pick<SignInLink, 'profile' | 'computer'>>)
  | { readonly ok: false; readonly error: string }
)

export function tabHandoffRequest(text: string): TabHandoffRequest | undefined {
  if (text.length > 16_000) return undefined
  const value: unknown = JSON.parse(text)
  if (value === null || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'number' || !Number.isSafeInteger(value.id) || !('type' in value)) return undefined
  const { id, type } = value
  if (type === 'open') return { id, type, ...('acceptVideo' in value && value.acceptVideo === true ? { acceptVideo: true } : {}) }
  if (type === 'end' || type === 'metadata' || type === 'video-stop') return { id, type }
  if (type === 'frame') return { id, type, ...('acceptUnchanged' in value && value.acceptUnchanged === true ? { acceptUnchanged: true } : {}), ...('acceptPatches' in value && value.acceptPatches === true ? { acceptPatches: true } : {}) }
  if (type !== 'input' || !('input' in value) || value.input === null || typeof value.input !== 'object' || !('type' in value.input)) return undefined
  const input = value.input
  if (input.type === 'key' && 'key' in input && typeof input.key === 'string' && TAB_HANDOFF_KEYS.has(input.key)) return { id, type, input: { type: 'key', key: input.key } }
  if (input.type === 'text' && 'text' in input && typeof input.text === 'string' && input.text.length <= 2000) return { id, type, input: { type: 'text', text: input.text } }
  if ((input.type === 'click' || input.type === 'wheel') && 'x' in input && 'y' in input && typeof input.x === 'number' && typeof input.y === 'number' && Number.isSafeInteger(input.x) && Number.isSafeInteger(input.y) && input.x >= 0 && input.y >= 0 && input.x <= 10000 && input.y <= 10000) {
    if (input.type === 'click') return { id, type, input: { type: 'click', x: input.x, y: input.y } }
    if ('dy' in input && typeof input.dy === 'number' && Number.isSafeInteger(input.dy) && Math.abs(input.dy) <= 100000) return { id, type, input: { type: 'wheel', x: input.x, y: input.y, dy: input.dy } }
  }
  return undefined
}

const LOCAL = /^(localhost|[^/:]+\.(localhost|local|test|internal)|127(\.\d{1,3}){3}|0\.0\.0\.0|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|\[[0-9a-f:]+\])(:\d+)?$/i
const HOST = /^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?$|^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/i

/** What the address field means: an address as typed, a host given its scheme (http for this computer and the local network), or words to search for. */
export function addressOf(typed: string): string {
  const text = typed.trim()
  if (text === '' || /^[a-z][a-z0-9+.-]*:\/\//i.test(text) || /^(about|data|file):/i.test(text)) return text
  const host = text.split(/[/?#]/, 1)[0] ?? ''
  if (!/\s/.test(text) && LOCAL.test(host)) return `http://${text}`
  if (!/\s/.test(text) && HOST.test(host)) return `https://${text}`
  return `https://duckduckgo.com/?q=${encodeURIComponent(text)}`
}
