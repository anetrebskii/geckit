import { spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { HostConfig } from '../../shared/hosts'
import { quote } from './run-script'

/**
 * The person's own `ssh`, started for one thing on one host.
 *
 * It is the one on the path, so their SSH config, their agent and every jump
 * host they set up hold here as they do in a terminal. What it asks - a
 * password, a passphrase, whether to trust a key - comes to GeckIt through
 * `SSH_ASKPASS` (see `askpass.ts`), since there is no terminal to ask in.
 */

const WINDOWS = process.platform === 'win32'

/** Settings that decide how the connection behaves rather than where it goes. */
export interface SshSetup {
  /** A folder for the sockets that let many commands share one connection. None on Windows, where ssh cannot. */
  readonly control?: string
  /** What every ssh is started with so it asks GeckIt rather than a terminal. */
  readonly env: Readonly<Record<string, string>>
}

/** The ssh that is started: Windows keeps its own OpenSSH where the path may not reach it. */
export function sshProgram(): string {
  if (!WINDOWS) return 'ssh'
  const system = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'OpenSSH', 'ssh.exe')
  return system
}

/** A socket path short enough for the system's limit on them, which a long profile folder can pass. */
export function controlFolder(preferred: string): string | undefined {
  if (WINDOWS) return undefined
  // %C is 40 characters, and a Unix socket path may have at most 104 on macOS.
  const folder = join(preferred, 'cm')
  const chosen = folder.length + 42 <= 100 ? folder : join(tmpdir(), `geckit-cm-${String(process.getuid?.() ?? 0)}`)
  try {
    mkdirSync(chosen, { recursive: true, mode: 0o700 })
  } catch {
    return undefined
  }
  return chosen
}

export interface SshOptions {
  /** A terminal on the far side, for what a person types into. */
  readonly tty?: boolean
  /** No command: the connection is there only to carry a forwarded port. */
  readonly forward?: string
  /** Not shared with the other commands: a forward or a terminal lives on its own. */
  readonly alone?: boolean
}

/** Everything before the command: how to reach the host, and how the connection should behave. */
export function sshArgs(host: Pick<HostConfig, 'address' | 'user' | 'port' | 'auth' | 'keyFile'>, setup: Pick<SshSetup, 'control'>, options: SshOptions = {}): string[] {
  const args = [
    options.tty === true ? '-tt' : '-T',
    '-o',
    'ConnectTimeout=20',
    // Five seconds between checks and two missed: a link that has gone is known in ten.
    '-o',
    'ServerAliveInterval=5',
    '-o',
    'ServerAliveCountMax=2',
    '-o',
    'LogLevel=ERROR',
    // One wrong password is one card: ssh asking three times in a row would show three.
    '-o',
    'NumberOfPasswordPrompts=1',
  ]
  if (host.port !== 22) args.push('-p', String(host.port))
  if (host.user !== '') args.push('-l', host.user)
  if (host.auth === 'key' && host.keyFile !== undefined && host.keyFile !== '') args.push('-i', host.keyFile, '-o', 'IdentitiesOnly=yes')
  if (host.auth === 'password') args.push('-o', 'PasswordAuthentication=yes', '-o', 'KbdInteractiveAuthentication=yes')
  if (setup.control !== undefined && options.alone !== true) {
    args.push('-o', 'ControlMaster=auto', '-o', `ControlPath=${join(setup.control, '%C')}`, '-o', 'ControlPersist=600')
  }
  if (options.forward !== undefined) args.push('-N', '-o', 'ExitOnForwardFailure=yes', '-L', options.forward)
  args.push(host.address)
  return args
}

/** The command given to ssh for a script: `sh -c '<script>'`, read by whichever shell the account logs in with. */
export const remoteCommand = (script: string): string => `sh -c ${quote(script)}`

/** One ssh running a script on a host, its streams left to the caller. */
export function spawnOn(host: HostConfig, setup: SshSetup, script: string, options: SshOptions = {}): ChildProcessWithoutNullStreams {
  const args = sshArgs(host, setup, options)
  if (options.forward === undefined) args.push(remoteCommand(script))
  return spawn(sshProgram(), args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...setup.env, GECKIT_HOST: host.id },
    windowsHide: true,
  })
}

export interface Ran {
  readonly code: number | null
  readonly out: Buffer
  readonly err: string
}

/** A script run to its end on a host: what it printed and how it exited. */
export function runOn(
  host: HostConfig,
  setup: SshSetup,
  script: string,
  { input, timeout = 60_000 }: { readonly input?: string | Buffer; readonly timeout?: number } = {},
): Promise<Ran> {
  return new Promise((done) => {
    const child = spawnOn(host, setup, script)
    const out: Buffer[] = []
    let err = ''
    const timer = setTimeout(() => child.kill(), timeout)
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk))
    child.stderr.on('data', (chunk: Buffer) => {
      err = `${err}${chunk.toString('utf8')}`.slice(-4_000)
    })
    child.stdin.on('error', () => undefined)
    child.on('error', (error) => {
      clearTimeout(timer)
      done({ code: -1, out: Buffer.concat(out), err: error.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      done({ code, out: Buffer.concat(out), err: err.trim() })
    })
    if (input !== undefined) child.stdin.end(input)
    else child.stdin.end()
  })
}

/**
 * What ssh said when it could not connect, as the person is told it. Anything
 * else is ssh's own words, which are more use than a guess.
 */
export function sshProblem(err: string, name: string): string {
  const said = err.trim()
  if (/Could not resolve hostname|nodename nor servname|Name or service not known/i.test(said)) return `Could not reach ${name}: no host by that name.`
  if (/timed out|Operation timed out|Connection timed out/i.test(said)) return `Could not reach ${name}: timed out after 20 s.`
  if (/Connection refused/i.test(said)) return `Could not reach ${name}: it refused the connection.`
  if (/No route to host|Network is unreachable|Host is down/i.test(said)) return `Could not reach ${name}: the network cannot get to it.`
  if (/Permission denied/i.test(said)) return `${name} did not accept the sign-in.`
  if (/REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed/i.test(said)) return `${name}'s key could not be trusted.`
  const last = said.split('\n').filter((line) => line.trim() !== '').pop()
  return last === undefined ? `Could not reach ${name}.` : `Could not reach ${name}: ${last}`
}
