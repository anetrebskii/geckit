/**
 * Other computers, reached over SSH, that conversations run on.
 *
 * The interface calls every one of them a host, and the computer GeckIt runs
 * on Local, the same on every system. A project on a host is named by an
 * address rather than a path, `ssh://devbox/home/leo/trailmap`, so everything
 * that already keys by a project's root - lists, colours, profiles,
 * favourites - keeps working, and only the places that reach the outside world
 * need to know the difference.
 */

/** How a host is signed in to: the keys the SSH setup already has or a file of one, or a password. */
export type HostAuth = 'key' | 'password'

/** A host as Settings keeps it. Never a secret: a remembered password is in the system's credential store. */
export interface HostConfig {
  /** Made from the name when it was added and never changed, since project roots carry it. */
  readonly id: string
  readonly name: string
  /** A name, an address, or a `Host` from the SSH config. */
  readonly address: string
  /** Empty is the SSH config's, or this computer's account name. */
  readonly user: string
  readonly port: number
  readonly auth: HostAuth
  /** A key file of its own; absent is the default keys and the agent. */
  readonly keyFile?: string
  /** A password is kept for it. */
  readonly remember?: boolean
  /** What it last said about itself, shown while it is not connected. */
  readonly seen?: { readonly version?: string; readonly plan?: string }
}

/** What the Add a host sheet sends: a host not yet reached, and the password typed, if any. */
export interface HostDraft {
  readonly name: string
  readonly address: string
  readonly user: string
  readonly port: number
  readonly auth: HostAuth
  readonly keyFile?: string
  readonly password?: string
  readonly remember?: boolean
}

/**
 * Where a host stands, as the dot beside its name says it.
 *
 * `idle` Not connected, `connecting`, `up` Connected, `lost` out of reach and
 * retrying, `needs` waiting on the person (a password, a key, or a failure),
 * `missing` no Claude Code there, `signin` Claude Code there and not signed in.
 */
export type HostState = 'idle' | 'connecting' | 'up' | 'lost' | 'needs' | 'missing' | 'signin'

/** A host as the windows see it. */
export interface HostView {
  readonly id: string
  readonly name: string
  readonly address: string
  readonly user: string
  readonly port: number
  readonly auth: HostAuth
  readonly keyFile?: string
  readonly state: HostState
  /** When it was last connected, in milliseconds. */
  readonly since?: number
  readonly version?: string
  readonly plan?: string
  /** The line for a state that needs the person, as it is shown. */
  readonly problem?: string
  readonly remembered: boolean
  /** Whether a password can be remembered on this computer at all. */
  readonly canRemember: boolean
}

/** Something a host asked while connecting, shown as a card. */
export interface HostPrompt {
  readonly id: string
  readonly host: string
  readonly kind: 'password' | 'passphrase' | 'code' | 'trust' | 'other'
  /** The card's words. */
  readonly text: string
  /** The key file, or the fingerprints. */
  readonly detail?: string
}

/** The answer to a card; nothing in `answer` is Not now. */
export interface HostAnswer {
  readonly id: string
  readonly answer?: string
  readonly remember?: boolean
}

/** One line of what Connect is checking, in the sheet. */
export interface HostCheck {
  readonly text: string
  readonly done: boolean
  readonly failed?: boolean
}

/** A Host from the SSH config, offered as the address is typed. */
export interface KnownHost {
  readonly host: string
  readonly address?: string
  readonly user?: string
  readonly port?: number
}

const SCHEME = 'ssh://'

/** The host a project is on, or nothing for a local one. */
export function hostOf(root: string): string | undefined {
  if (!root.startsWith(SCHEME)) return undefined
  const rest = root.slice(SCHEME.length)
  const slash = rest.indexOf('/')
  const id = slash < 0 ? rest : rest.slice(0, slash)
  return id === '' ? undefined : id
}

export const isRemote = (root: string): boolean => hostOf(root) !== undefined

/** The folder a root names on its own computer: the path itself for a local one. */
export function pathOf(root: string): string {
  const id = hostOf(root)
  if (id === undefined) return root
  const path = root.slice(SCHEME.length + id.length)
  return path === '' ? '/' : path
}

/** A folder on a host, as a project root. */
export function remoteRoot(id: string, path: string): string {
  const absolute = path.startsWith('/') ? path : `/${path}`
  const trimmed = absolute.length > 1 ? absolute.replace(/\/+$/, '') : absolute
  return `${SCHEME}${id}${trimmed === '' ? '/' : trimmed}`
}

/**
 * What was typed into Address, read the way ssh reads it: `leo@devbox.local:2222`
 * is the user, the address and the port. Only what was typed is given back.
 */
export function parseTarget(typed: string): { readonly address: string; readonly user?: string; readonly port?: number } {
  let rest = typed.trim().replace(/^ssh\s+/, '').replace(/^ssh:\/\//, '')
  let user: string | undefined
  const at = rest.lastIndexOf('@')
  if (at > 0) {
    user = rest.slice(0, at)
    rest = rest.slice(at + 1)
  }
  let port: number | undefined
  // An address in brackets is IPv6 and keeps its colons: [fe80::1]:2222.
  const bracket = /^\[([^\]]+)\](?::(\d+))?$/.exec(rest)
  if (bracket !== null) {
    rest = bracket[1] ?? ''
    if (bracket[2] !== undefined) port = Number(bracket[2])
  } else {
    const colon = /^([^:]+):(\d+)$/.exec(rest)
    if (colon !== null) {
      rest = colon[1] ?? ''
      port = Number(colon[2])
    }
  }
  return {
    address: rest.replace(/\/+$/, ''),
    ...(user === undefined || user === '' ? {} : { user }),
    ...(port === undefined || !Number.isInteger(port) || port < 1 || port > 65535 ? {} : { port }),
  }
}

/** An id for a new host, from its name, that no other host has. */
export function hostIdFor(name: string, taken: readonly string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'host'
  if (!taken.includes(base)) return base
  for (let n = 2; ; n++) {
    const next = `${base.slice(0, 36)}-${String(n)}`
    if (!taken.includes(next)) return next
  }
}

/** Why a draft cannot be connected, or nothing where it can. */
export function draftProblem(draft: Pick<HostDraft, 'address' | 'port' | 'name'>): string | undefined {
  if (draft.address.trim() === '') return 'Type the address of the host.'
  if (/\s/.test(draft.address.trim())) return 'The address has a space in it.'
  if (!Number.isInteger(draft.port) || draft.port < 1 || draft.port > 65535) return 'The port is a number from 1 to 65535.'
  if (draft.name.trim().length > 40) return 'The name is at most 40 characters.'
  return undefined
}

/** How a host is signed in to, written the way ssh writes it: `leo@devbox.local`, with the port where it is not 22. */
export const targetLine = (host: Pick<HostConfig, 'address' | 'user' | 'port'>): string =>
  `${host.user === '' ? '' : `${host.user}@`}${host.address}${host.port === 22 ? '' : `:${String(host.port)}`}`

/** The words for a state, as Settings and the chip's menu say them. */
export function stateLine(view: Pick<HostView, 'state' | 'problem' | 'since'>, now: number): string {
  switch (view.state) {
    case 'idle':
      return 'Not connected'
    case 'connecting':
      return 'Connecting'
    case 'up':
      return view.since === undefined ? 'Connected' : `Connected for ${forHowLong(now - view.since)}`
    case 'lost':
      return 'Out of reach, reconnecting'
    case 'needs':
    case 'missing':
    case 'signin':
      return view.problem ?? 'Needs you'
  }
}

/** A stretch of time the way the chip's menu says it: "a moment", "12 min", "2 h", "3 d". */
export function forHowLong(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'a moment'
  if (minutes < 60) return `${String(minutes)} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${String(hours)} h`
  return `${String(Math.floor(hours / 24))} d`
}

/** A host out of reach, so what was working on it cannot be seen right now. */
export const outOfReach = (state: HostState | undefined): boolean => state === 'lost' || state === 'needs'

/** The second line of a working or asking conversation whose host is out of reach. */
export const outOfReachLine = (name: string): string => `${name} is out of reach. Still working there`
