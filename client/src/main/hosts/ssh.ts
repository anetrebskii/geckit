import { execFile, spawn } from 'node:child_process'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough, Writable } from 'node:stream'

import type { HostConfig } from '../../shared/hosts'
import { isAsking } from './asking'
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

/** The ssh that is started: Windows keeps its own OpenSSH where the path may not reach it, falling back to whatever `ssh` is on the path where that build is missing. */
export function sshProgram(): string {
  if (!WINDOWS) return 'ssh'
  const system = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'OpenSSH', 'ssh.exe')
  try {
    return existsSync(system) ? system : 'ssh'
  } catch {
    return 'ssh'
  }
}

/** `ssh-keygen`, found the same way `sshProgram` finds `ssh` itself. */
export function sshKeygenProgram(): string {
  if (!WINDOWS) return 'ssh-keygen'
  const system = join(process.env['SystemRoot'] ?? 'C:\\Windows', 'System32', 'OpenSSH', 'ssh-keygen.exe')
  try {
    return existsSync(system) ? system : 'ssh-keygen'
  } catch {
    return 'ssh-keygen'
  }
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

/** A word that would be read as an option of ssh's own rather than the value it is, had it gone in unguarded. */
const looksLikeOption = (word: string): boolean => word.startsWith('-')

/** Everything before the command: how to reach the host, and how the connection should behave. */
export function sshArgs(host: Pick<HostConfig, 'address' | 'user' | 'port' | 'auth' | 'keyFile'>, setup: Pick<SshSetup, 'control'>, options: SshOptions = {}): string[] {
  if (looksLikeOption(host.address)) throw new Error('Not a host address.')
  if (looksLikeOption(host.user)) throw new Error('Not a user name.')
  if (host.keyFile !== undefined && looksLikeOption(host.keyFile)) throw new Error('Not a key file.')
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
  // Ends ssh's own option parsing, so an address that somehow still began with a dash could never be read as one.
  args.push('--', host.address)
  return args
}

/** The command given to ssh for a script: `sh -c '<script>'`, read by whichever shell the account logs in with. */
export const remoteCommand = (script: string): string => `sh -c ${quote(script)}`

/**
 * A running ssh, told apart from any other by `conn` rather than by its own
 * pid: on Windows the pid an askpass question arrives with is the launcher's
 * cmd.exe, not ssh's, so identity is carried instead in an id minted before
 * ssh is even spawned and handed to it in `GECKIT_ASKPASS_CONN` (see
 * `askpass.ts`), which crosses that hop unharmed.
 */
export type SshChild = ChildProcessWithoutNullStreams & { readonly conn: string }

/** Where `ssh-keygen -R` is told to forget a host: its address, and `[address]:port` too where the port is not 22, since that is the form ssh itself keeps such an entry under in `known_hosts`. A guess only, kept for where `sshConfigTarget` itself could not be asked; an alias, a `HostKeyAlias` or a config port can put the real entry somewhere this never looks. */
export function knownHostsTargets(host: Pick<HostConfig, 'address' | 'port'>): string[] {
  return host.port === 22 ? [host.address] : [host.address, `[${host.address}]:${String(host.port)}`]
}

/** What ssh itself would use to reach a host: the hostname and port an alias in the config resolves to, the `HostKeyAlias` it looks a key up under instead where one is set, and every `known_hosts` file it would look in. */
export interface SshTarget {
  readonly hostname: string
  readonly port: number
  readonly hostKeyAlias?: string
  readonly knownHostsFiles: readonly string[]
}

/** What `ssh -G` printed, read into the parts that decide where a host's key is kept: never guessed, since that is what lets an alias, a `HostKeyAlias`, a config port or a `UserKnownHostsFile` of the person's own be read exactly as ssh reads them. */
export function readSshConfigTarget(out: string): SshTarget {
  const hostname = /^hostname (.+)$/im.exec(out)?.[1]?.trim() ?? ''
  const port = Number(/^port (\d+)$/im.exec(out)?.[1] ?? '22')
  const hostKeyAlias = /^hostkeyalias (.+)$/im.exec(out)?.[1]?.trim()
  const home = process.env['HOME'] ?? process.env['USERPROFILE'] ?? ''
  const files = [...out.matchAll(/^userknownhostsfile (.+)$/gim)].flatMap((one) => (one[1] ?? '').trim().split(/\s+/)).filter((one) => one !== '' && one.toLowerCase() !== 'none')
  const knownHostsFiles = files.map((one) => (one.startsWith('~') && home !== '' ? join(home, one.slice(1)) : one))
  return {
    hostname,
    port: Number.isInteger(port) && port > 0 ? port : 22,
    ...(hostKeyAlias === undefined || hostKeyAlias === '' ? {} : { hostKeyAlias }),
    knownHostsFiles,
  }
}

/**
 * Asks ssh itself where it would reach a host and where it keeps its key,
 * with `ssh -G`, which prints its configuration for the very same arguments
 * `sshArgs` would connect with rather than leave it guessed from the address
 * and port alone. Nothing where ssh could not even be asked - a bad config,
 * say - for a caller to fall back to a guess of its own.
 */
export function sshConfigTarget(host: HostConfig, setup: SshSetup): Promise<SshTarget | undefined> {
  let args: string[]
  try {
    args = sshArgs(host, setup)
  } catch {
    return Promise.resolve(undefined)
  }
  return new Promise((done) => {
    execFile(sshProgram(), ['-G', ...args], { env: { ...process.env, ...setup.env }, timeout: 5_000 }, (error, stdout) => {
      done(error === null ? readSshConfigTarget(stdout) : undefined)
    })
  })
}

/** The exact `ssh-keygen -f "<file>" -R "<target>"` line or lines ssh itself printed under "remove with:" for a changed key: read where it said one, rather than worked out again from the config, which is the more exact of the two. */
export function removeWithLines(err: string): { readonly file: string; readonly target: string }[] {
  return [...err.matchAll(/ssh-keygen -f "([^"]+)" -R "([^"]+)"/g)]
    .map((one) => ({ file: one[1] ?? '', target: one[2] ?? '' }))
    .filter((one) => one.file !== '' && one.target !== '')
}

/** What a thrown `sshArgs` message becomes for a person, named for the host it was about. */
export function badArgsProblem(reason: string, name: string): string | undefined {
  if (reason === 'Not a host address.') return `The address of ${name} starts with a dash.`
  if (reason === 'Not a user name.') return `The user name of ${name} starts with a dash.`
  if (reason === 'Not a key file.') return `The key file of ${name} starts with a dash.`
  return undefined
}

/**
 * Stands in for ssh where `sshArgs` refused the config outright (an address,
 * user or key file that would be read as one of ssh's own options): closes at
 * once with the reason on stderr, so a caller in a timer (a reconnect, a
 * retry) sees an ordinary failed run rather than a thrown exception it has no
 * chance to catch.
 */
class FailedChild extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly stdin: Writable
  readonly conn = ''
  readonly pid: number | undefined = undefined
  exitCode: number | null = null

  constructor(reason: string) {
    super()
    this.stdin = new Writable({ write: (_chunk, _encoding, done) => done() })
    setImmediate(() => {
      this.stderr.end(reason)
      this.stdout.end()
      this.exitCode = 1
      this.emit('close', 1)
    })
  }

  kill(): boolean {
    return true
  }
}

/** One ssh running a script on a host, its streams left to the caller. Never throws: a config `sshArgs` refuses is instead a child that fails at once, its reason on stderr. */
export function spawnOn(host: HostConfig, setup: SshSetup, script: string, options: SshOptions = {}): SshChild {
  let args: string[]
  try {
    args = sshArgs(host, setup, options)
  } catch (error) {
    return new FailedChild(error instanceof Error ? error.message : 'Not a usable host config.') as unknown as SshChild
  }
  if (options.forward === undefined) args.push(remoteCommand(script))
  const conn = randomUUID()
  const child = spawn(sshProgram(), args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ...setup.env, GECKIT_HOST: host.id, GECKIT_ASKPASS_CONN: conn },
    windowsHide: true,
  })
  return Object.assign(child, { conn })
}

export interface Ran {
  readonly code: number | null
  readonly out: Buffer
  readonly err: string
  /** Its own timeout ended it, rather than something else closing it. */
  readonly timedOut?: boolean
}

/** How long a connection that is itself waiting on a card is given beyond its own timeout, in total, before it is killed anyway. */
const MAX_ASKING_EXTENSION = 5 * 60_000

export interface RunOnOptions {
  readonly input?: string | Buffer
  readonly timeout?: number
  /** No shared connection: for probing fresh credentials, which must not ride on an already-authenticated master. */
  readonly alone?: boolean
  /** The ssh process's own connection id and pid, told as soon as it is spawned, for telling apart which connection an askpass question came from (the id crosses platforms; the pid does not, see askpass.ts). */
  readonly onConnection?: (conn: string, pid: number | undefined) => void
}

/** A script run to its end on a host: what it printed and how it exited. */
export function runOn(host: HostConfig, setup: SshSetup, script: string, { input, timeout = 60_000, alone, onConnection }: RunOnOptions = {}): Promise<Ran> {
  return new Promise((done) => {
    const child = spawnOn(host, setup, script, alone === undefined ? {} : { alone })
    onConnection?.(child.conn, child.pid)
    const out: Buffer[] = []
    let err = ''
    let timer: NodeJS.Timeout
    let extended = 0
    let timedOut = false
    // A card up for the connection itself is not idle time: someone may still be typing into it, so the clock waits for them rather than killing it out from under them - but only it, and only for so long.
    const arm = (): void => {
      timer = setTimeout(() => {
        if (isAsking(child.conn) && extended < MAX_ASKING_EXTENSION) {
          extended += timeout
          arm()
        } else {
          timedOut = true
          child.kill()
        }
      }, timeout)
    }
    arm()
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
      done({ code, out: Buffer.concat(out), err: err.trim(), ...(timedOut ? { timedOut } : {}) })
    })
    if (input !== undefined) child.stdin.end(input)
    else child.stdin.end()
  })
}

/**
 * What ssh said when it could not connect, as the person is told it. Anything
 * else is ssh's own words, which are more use than a guess.
 */
export function sshProblem(err: string, name: string, user: string): string {
  const said = err.trim()
  if (/Could not resolve hostname|nodename nor servname|Name or service not known/i.test(said)) return `Could not reach ${name}: no host by that name.`
  if (/timed out|Operation timed out|Connection timed out/i.test(said)) return `Could not reach ${name}: timed out after 20 s.`
  if (/Connection refused/i.test(said)) return `Could not reach ${name}: it refused the connection.`
  if (/No route to host|Network is unreachable|Host is down/i.test(said)) return `Could not reach ${name}: the network cannot get to it.`
  if (/Permission denied/i.test(said)) {
    return user === '' ? `${name} did not accept the sign-in. Check the password or key, then Try again.` : `${name} did not accept the sign-in for ${user}. Check the password or key, then Try again.`
  }
  if (/REMOTE HOST IDENTIFICATION HAS CHANGED|Host key verification failed/i.test(said)) return `${name}'s key could not be trusted.`
  const last = said.split('\n').filter((line) => line.trim() !== '').pop()
  return last === undefined ? `Could not reach ${name}.` : `Could not reach ${name}: ${last}`
}

/** Whether ssh refused a host outright because its key changed since the last time, rather than any other reason. */
export const isChangedKeyProblem = (err: string): boolean => /REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(err)

/** The fingerprint ssh printed for the key it found this time, where it said one. */
export const changedKeyPrint = (err: string): string | undefined => /(SHA256:[A-Za-z0-9+/=]+)/.exec(err)?.[1]

/** The line for a host whose key has changed, named for it. */
export const changedKeyProblem = (name: string): string =>
  `${name}'s key has changed since the last connection. That can mean the host was set up again, or that something is in the way.`

/**
 * ssh's own failure to reach a host at all, rather than the script it ran
 * failing on the host: a host thought to be up that answers this way has
 * gone quiet underneath (sleep, a network change) rather than had a command
 * go wrong on it.
 */
export function isConnectionFailure(code: number | null, err: string): boolean {
  if (code !== 255) return false
  return /Could not resolve hostname|nodename nor servname|Name or service not known|timed out|Operation timed out|Connection timed out|Connection refused|No route to host|Network is unreachable|Host is down|Broken pipe|Connection reset|Connection closed by remote host/i.test(
    err,
  )
}
