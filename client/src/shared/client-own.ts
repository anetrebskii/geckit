import type { Settings } from './api'

/** What a client keeps for itself rather than the computer: how it looks, which projects it shows, and what it sends. */
export const OWN = ['theme', 'profile', 'chatProjects', 'chatAll', 'analytics', 'analyticsAsked', 'sendErrors', 'client'] as const

/**
 * What a client on a link keeps for itself rather than the computer it reads: how it looks, which projects it shows,
 * and whether it counts and sends its errors. A profile the computer no longer has is All projects again.
 */
export function clientOwn(key: string) {
  const read = (): Partial<Settings> => {
    try { return JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<Settings> } catch { return {} }
  }
  let mine = read()
  let last: Settings | undefined
  const write = (): void => { try { localStorage.setItem(key, JSON.stringify(mine)) } catch { /* kept for this launch only */ } }
  const isOwn = (name: string): boolean => (OWN as readonly string[]).includes(name)
  return {
    mine: (): Partial<Settings> => mine,
    /** The computer's settings as this client shows them. */
    own: (settings: Settings): Settings => {
      last = settings
      const kept = { ...settings, analytics: false, analyticsAsked: false, sendErrors: false, client: '', ...mine }
      const gone = mine.profile !== undefined && mine.profile !== '' && !settings.profiles.some((one) => one.id === mine.profile)
      return gone ? { ...kept, profile: '', chatProjects: [], chatAll: true } : kept
    },
    /** The computer's settings as last told, before they were made this client's. */
    last: (): Settings | undefined => last,
    /** A change split into what this client keeps and what goes to the computer; what it keeps is kept. */
    take: (change: Partial<Settings>): { readonly here: Partial<Settings>; readonly there: Partial<Settings> } => {
      const here = Object.fromEntries(Object.entries(change).filter(([name]) => isOwn(name))) as Partial<Settings>
      const there = Object.fromEntries(Object.entries(change).filter(([name]) => !isOwn(name))) as Partial<Settings>
      if (Object.keys(here).length > 0) {
        mine = { ...mine, ...here, ...(change.analytics === false ? { client: '' } : {}) }
        write()
      }
      return { here, there }
    },
    /** Who this client is counted as, made up the first time it counts. */
    client: (): string => {
      if ((mine.client ?? '') === '') {
        mine = { ...mine, client: crypto.randomUUID() }
        write()
      }
      return mine.client ?? ''
    },
  }
}
