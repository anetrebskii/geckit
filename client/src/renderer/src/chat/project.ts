import { profileOf, shownProjects } from '../../../shared/api'
import type { Settings } from '../../../shared/api'
import { hostOf, outOfReach, outOfReachLine, pathOf } from '../../../shared/hosts'
import type { HostState } from '../../../shared/hosts'

/** A project folder by its last part, which is what anybody calls it. On a host, the folder's own last part. */
export const projectName = (root: string): string => pathOf(root).split(hostOf(root) === undefined ? /[\\/]/ : '/').filter((part) => part !== '').pop() ?? root

/** The names hosts go by and how each stands, as the windows were last told them. */
let hostNames = new Map<string, string>()
let hostStates = new Map<string, HostState>()

/** What each host is called and how it stands, from the list main keeps sending. */
export function knowHosts(hosts: readonly { readonly id: string; readonly name: string; readonly state: HostState }[]): void {
  hostNames = new Map(hosts.map((one) => [one.id, one.name]))
  hostStates = new Map(hosts.map((one) => [one.id, one.state]))
}

/** The line a working or asking conversation shows while its host is out of reach, or nothing. */
export function awayLine(session: { readonly root: string; readonly state: string }): string | undefined {
  const id = hostOf(session.root)
  if (id === undefined || !outOfReach(hostStates.get(id)) || (session.state !== 'working' && session.state !== 'asks')) return undefined
  return outOfReachLine(hostNames.get(id) ?? id)
}

/** The name of the host a project is on, or nothing for a local one. */
export function hostName(root: string): string | undefined {
  const id = hostOf(root)
  return id === undefined ? undefined : (hostNames.get(id) ?? id)
}

/** A project as one line of words: `trailmap`, or `trailmap · devbox` on a host. */
export const projectLabel = (root: string): string => {
  const host = hostName(root)
  return host === undefined ? projectName(root) : `${projectName(root)} · ${host}`
}

/** A folder under the home folder, written from it: ~/Projects/mine/geckit. On a host, its path there. */
export const homePath = (path: string): string => {
  if (hostOf(path) !== undefined) return pathOf(path)
  const home = window.geckit.home
  return home !== '' && (path === home || path.startsWith(`${home}/`)) ? `~${path.slice(home.length)}` : path
}

/** A root as one readable line, never the raw `ssh://` address: its path, or `host · path` on a host. */
export const rootLabel = (root: string): string => {
  const host = hostName(root)
  return host === undefined ? homePath(root) : `${host} · ${homePath(root)}`
}

/** The project's colour as a variable the `tinted` rule reads, so a row that is open can say its own colour over it. */
export const tint = (color: number): React.CSSProperties => ({ ['--tint']: `var(--project-${String(color)})` }) as React.CSSProperties

/** The profile in use, by name, where it has no projects to show. */
export function emptyProfile(settings: Settings): string | undefined {
  const profile = profileOf(settings)
  return profile !== undefined && shownProjects(settings).length === 0 ? profile.name : undefined
}
