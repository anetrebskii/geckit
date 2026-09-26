import { execFile } from 'node:child_process'
import { existsSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'

import type { ClaudeAccount, ClaudeProgram } from '../../shared/api'

/**
 * Whether somebody is signed in, as `claude auth status` says for itself.
 *
 * That is the whole of what is asked: nothing here opens a credentials file or
 * a keychain, and nothing here can sign anybody in.
 */

type Json = Readonly<Record<string, unknown>>

/**
 * The variables that take a session off the person's plan. With a key, a token
 * or a cloud switch the tool stops naming a plan, and with a key it says the
 * key is what answers - so a key exported for some script months ago would
 * bill every question here to itself without a word. A gateway address changes
 * nothing the tool reports and sends the plan's sign-in to the gateway, which
 * is worse.
 */
const OFF_PLAN = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
]

/**
 * What the tool is started with: this process's environment without those.
 *
 * Left out by name. Their values are never looked at, kept or sent anywhere,
 * and nothing of the person's is changed: the key is still in their shell.
 */
export function planOnly(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const kept = { ...env }
  for (const name of OFF_PLAN) delete kept[name]
  // A window opened from the Dock has the launch environment, not the shell's,
  // so the place `claude` was installed into has to be put back on the path.
  // Windows spells the variable `Path`, and a second `PATH` beside it would
  // be the only one the child is given.
  const key = pathKey(kept)
  const extra = WINDOWS ? [join(homedir(), '.local', 'bin')] : [join(homedir(), '.local', 'bin'), '/opt/homebrew/bin', '/usr/local/bin']
  const path = (kept[key] ?? '').split(delimiter)
  kept[key] = [...path, ...extra.filter((one) => !path.includes(one))].filter((one) => one !== '').join(delimiter)
  return kept
}

const WINDOWS = process.platform === 'win32'

const pathKey = (env: NodeJS.ProcessEnv): string => Object.keys(env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH'

/**
 * What to start. Windows starts only an `.exe` without a shell, and npm puts
 * `claude.cmd` on the path, a shim over the `claude.exe` in its package, so
 * that one is started instead. A shell is not used: the prompts handed over
 * as arguments would have to survive cmd's quoting.
 */
export function claudeCommand(env: NodeJS.ProcessEnv = planOnly()): string {
  if (!WINDOWS) return 'claude'
  for (const dir of (env[pathKey(env)] ?? '').split(delimiter)) {
    if (dir === '') continue
    const exe = join(dir, 'claude.exe')
    if (existsSync(exe)) return exe
    const shimmed = join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
    if (existsSync(join(dir, 'claude.cmd')) && existsSync(shimmed)) return shimmed
  }
  return 'claude'
}

const string = (value: unknown): string => (typeof value === 'string' ? value : '')

/** "max" as the tool says it, "Max" as a sentence says it. */
const planName = (plan: string): string =>
  plan === '' ? '' : plan.slice(0, 1).toUpperCase() + plan.slice(1).replace(/[_-]+/g, ' ')

/** What a command printed, whatever it exited with: being signed out is an answer and exits 1. */
const printed = (args: readonly string[]): Promise<string | undefined> =>
  new Promise((done) => {
    const env = planOnly()
    execFile(claudeCommand(env), [...args], { cwd: homedir(), timeout: 15_000, env, windowsHide: true }, (error, stdout) => {
      const code = (error as { code?: unknown } | null)?.code
      done(typeof code === 'string' ? undefined : stdout)
    })
  })

export async function claudeAccount(): Promise<ClaudeAccount> {
  const out = await printed(['auth', 'status'])
  if (out === undefined) return { here: false, signedIn: undefined }
  try {
    const said = JSON.parse(out) as Json
    if (said['loggedIn'] !== true) return { here: true, signedIn: false }
    // No plan named is every way of not being on one: a key, a token, a
    // Console account, Bedrock, Vertex. The tool says which; the answer here
    // is the same for all of them, so it is not read.
    const plan = planName(string(said['subscriptionType']))
    return { here: true, signedIn: true, ...(plan === '' ? { key: true } : { plan }) }
  } catch {
    // An older build that answers in a sentence. Here, and unknown.
    return { here: true, signedIn: undefined }
  }
}

/** The version at the start of what `claude --version` prints: `2.1.283 (Claude Code)`. */
export function versionOf(printed: string): string | undefined {
  return /^\s*(\d+\.\d+\.\d+\S*)/.exec(printed)?.[1]
}

/**
 * How Claude Code was put on this machine, from where the program is once its
 * links are followed, which is also what says how it is updated. Homebrew
 * keeps it in its Caskroom or Cellar, npm in its package, and the native
 * installer under `.local`. Anywhere else is not guessed at.
 */
export function installedBy(path: string): string | undefined {
  const where = path.replaceAll('\\', '/')
  if (/\/(Caskroom|Cellar)\//.test(where)) return 'Homebrew'
  if (where.includes('/node_modules/@anthropic-ai/claude-code/')) return 'npm'
  if (/\/\.local\/(share\/claude\/|bin\/claude)/.test(where)) return 'the native installer'
  return undefined
}

/** The program `claudeCommand` names, found on the path it is started with and followed to where it really is. */
function programPath(env: NodeJS.ProcessEnv): string | undefined {
  const command = claudeCommand(env)
  const found = isAbsolute(command)
    ? command
    : (env[pathKey(env)] ?? '')
        .split(delimiter)
        .filter((dir) => dir !== '')
        .map((dir) => join(dir, command))
        .find((one) => existsSync(one))
  if (found === undefined) return undefined
  try {
    return realpathSync(found)
  } catch {
    return found
  }
}

/**
 * Which Claude Code GeckIt starts, as `claude --version` says. Nothing where it
 * did not answer, which is not taken to mean it changed.
 */
export async function claudeProgram(): Promise<ClaudeProgram | undefined> {
  const version = versionOf((await printed(['--version'])) ?? '')
  if (version === undefined) return undefined
  const path = programPath(planOnly())
  const from = path === undefined ? undefined : installedBy(path)
  return { version, ...(from === undefined ? {} : { from }), ...(path === undefined ? {} : { path }) }
}
