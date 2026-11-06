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
