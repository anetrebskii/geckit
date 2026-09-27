import type { ClaudeAccount, Folders } from '../../shared/api'
import type { KnownHost } from '../../shared/hosts'
import { accountFrom, versionOf } from '../sessions/account'
import { readCheck } from './run-script'

/**
 * What hosts print, read into shapes. Pure, so the tests read recorded output.
 */

/**
 * The hosts named in an SSH config, for the Add a host sheet to offer: every
 * `Host` without a pattern in it, with what the config says of its address,
 * user and port. `Include` is not followed; what it hides is still reachable
 * by typing its name.
 */
export function readSshConfig(text: string): KnownHost[] {
  const found: { host: string; address?: string; user?: string; port?: number }[] = []
  let current: typeof found = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim()
    if (line === '') continue
    const match = /^(\S+)\s*=?\s*(.*)$/.exec(line)
    if (match === null) continue
    const key = (match[1] ?? '').toLowerCase()
    const value = (match[2] ?? '').trim().replace(/^"(.*)"$/, '$1')
    if (key === 'host') {
      current = value
        .split(/\s+/)
        .filter((name) => name !== '' && !/[*?!]/.test(name))
        .map((host) => ({ host }))
      found.push(...current)
      continue
    }
    if (key === 'match') {
      current = []
      continue
    }
    for (const one of current) {
      if (key === 'hostname' && one.address === undefined) one.address = value
      if (key === 'user' && one.user === undefined) one.user = value
      if (key === 'port' && one.port === undefined && /^\d+$/.test(value)) one.port = Number(value)
    }
  }
  const seen = new Set<string>()
  return found.filter((one) => (seen.has(one.host) ? false : (seen.add(one.host), true)))
}

/** One level of a host's folders, as `foldersScript` printed it. */
export function readFolders(out: string): Folders {
  const lines = out.split('\n').filter((line) => line !== '')
  const path = lines[0] ?? '/'
  const git = lines.includes('@git')
  const folders = lines
    .slice(1)
    .filter((line) => line !== '@git')
    .flatMap((line) => {
      const tab = line.indexOf('\t')
      if (tab < 0) return []
      const name = line.slice(tab + 1)
      return [{ name, path: path === '/' ? `/${name}` : `${path}/${name}`, git: line.slice(0, tab) === '1' }]
    })
    .sort((one, other) => Number(other.name.startsWith('.') ? 0 : 1) - Number(one.name.startsWith('.') ? 0 : 1) || one.name.localeCompare(other.name))
  const up = path === '/' ? undefined : path.slice(0, path.lastIndexOf('/')) || '/'
  return { path, git, folders, ...(up === undefined ? {} : { up }) }
}

/** What a host's check says: whether Claude Code is there, which version, and who is signed in. */
export interface Checked {
  readonly missing: boolean
  readonly version?: string
  readonly account?: ClaudeAccount
}

export function readChecked(out: string): Checked {
  const said = readCheck(out)
  if (said.missing) return { missing: true }
  const version = said.version === undefined ? undefined : versionOf(said.version)
  const account = said.auth === undefined ? undefined : accountFrom(said.auth)
  return { missing: false, ...(version === undefined ? {} : { version }), ...(account === undefined ? {} : { account }) }
}
