import { execFile } from 'node:child_process'

import type { GitState } from '../shared/api'

/** How many commits each way are named, for the tooltip. */
const NAMED = 10
const FETCH_EVERY = 5 * 60_000

// A remote that wants a password or a passphrase is left unasked rather than waited on.
const UNATTENDED = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', SSH_ASKPASS_REQUIRE: 'never' }

const askedAt = new Map<string, number>()
const fetchedAt = new Map<string, number>()

function git(root: string, args: readonly string[], timeout = 5000): Promise<string | undefined> {
  return new Promise((done) => {
    execFile(
      'git',
      // No index refresh written back, so a status taken here never holds a lock another git is waiting on.
      ['--no-optional-locks', '-C', root, ...args],
      { timeout, maxBuffer: 16 * 1024 * 1024, env: UNATTENDED },
      (error, out) => done(error === null ? out : undefined),
    )
  })
}

/** Reads `git status --porcelain=v2 --branch`. */
export function readGit(status: string): GitState {
  let head = ''
  let commit = ''
  let upstream: string | undefined
  let ahead = 0
  let behind = 0
  let changed = 0
  for (const line of status.split('\n')) {
    if (line.startsWith('# branch.head ')) head = line.slice('# branch.head '.length)
    else if (line.startsWith('# branch.oid ')) commit = line.slice('# branch.oid '.length)
    else if (line.startsWith('# branch.upstream ')) upstream = line.slice('# branch.upstream '.length)
    else if (line.startsWith('# branch.ab ')) {
      const [push, pull] = line.slice('# branch.ab '.length).split(' ')
      ahead = Math.abs(Number(push ?? 0))
      behind = Math.abs(Number(pull ?? 0))
    } else if (line !== '' && !line.startsWith('#') && !line.startsWith('!')) changed += 1
  }
  const branch = head === '(detached)' ? commit.slice(0, 7) : head
  return { branch, changed, ...(upstream === undefined ? {} : { upstream }), ahead, behind, outgoing: [], incoming: [] }
}

/** Where the checkout in this folder stands. Nothing where it is not one, or git is not here. */
export async function gitState(root: string): Promise<GitState | undefined> {
  const status = await git(root, ['status', '--porcelain=v2', '--branch'])
  if (status === undefined) return undefined
  const state = readGit(status)
  const named = async (range: string, count: number): Promise<string[]> =>
    count === 0
      ? []
      : ((await git(root, ['log', '--format=%s', `-n${String(NAMED)}`, range])) ?? '').split('\n').filter((line) => line !== '')
  const [outgoing, incoming] = await Promise.all([
    named('@{upstream}..HEAD', state.ahead),
    named('HEAD..@{upstream}', state.behind),
  ])
  const fetched = fetchedAt.get(root)
  return { ...state, outgoing, incoming, ...(fetched === undefined ? {} : { fetched }) }
}

/**
 * Asks the remote for new commits, so what there is to pull is known: at most
 * every few minutes a checkout, and only the remote's branches are updated,
 * never the one checked out. True where it asked and was answered.
 */
export async function fetchGit(root: string): Promise<boolean> {
  const now = Date.now()
  if (now - (askedAt.get(root) ?? -Infinity) < FETCH_EVERY) return false
  askedAt.set(root, now)
  if ((await git(root, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head'], 60_000)) === undefined) return false
  fetchedAt.set(root, Date.now())
  return true
}

const repos = new Map<string, string | undefined>()

/** The `owner/name` a remote's address points at, where it is GitHub's. */
export function repoOf(url: string): string | undefined {
  return /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?$/.exec(url.trim())?.[1]
}

/** The GitHub repository the checkout pushes to, for turning `#123` in an answer into a link. */
export async function gitRepo(root: string): Promise<string | undefined> {
  if (repos.has(root)) return repos.get(root)
  const repo = repoOf((await git(root, ['remote', 'get-url', 'origin'])) ?? '')
  repos.set(root, repo)
  return repo
}
