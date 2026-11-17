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
