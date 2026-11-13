import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { homedir, userInfo } from 'node:os'
import { join } from 'node:path'

import { brokerFolder, type BrokerEndpoint } from '../core/broker'

export { brokerFolder }

const TEAM = 'MQKD7Z7V2L'
const IDENTIFIER = 'org.anetrebskii.geckit.broker'
const BACKOFF = [1_000, 5_000, 30_000]

const osName = (): string => process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : process.platform
const fileName = (): string => process.platform === 'win32' ? 'geckit-broker.exe' : 'geckit-broker'

/** Where the shipped broker is: GECKIT_BROKER, the packaged resources, or the source checkout's build. */
export function brokerPath(appHome: string | undefined = process.env['GECKIT_APP_HOME']): string | undefined {
  const named = process.env['GECKIT_BROKER']
  if (named !== undefined && named !== '') return named
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  const packaged = resources === undefined ? undefined : join(resources, 'broker', fileName())
  if (packaged !== undefined && existsSync(packaged)) return packaged
  const built = appHome === undefined ? undefined : join(appHome, 'broker', 'bin', `${osName()}-${process.arch}`, fileName())
  return built !== undefined && existsSync(built) ? built : undefined
}


export function brokerSocket(folder: string, source: boolean): string {
  if (process.platform !== 'win32') return join(folder, 'broker.sock')
  return `\\\\.\\pipe\\geckit-broker-${createHash('sha256').update(`${userInfo().username}:${source ? 'local' : 'app'}`).digest('hex').slice(0, 16)}`
}

/** Why the broker at this path is not the one GeckIt shipped, or undefined when it is. */
export function brokerMismatch(path: string, signed: boolean): string | undefined {
  if (process.platform === 'darwin' && signed) {
    const checked = spawnSync('/usr/bin/codesign', ['--verify', '--strict', `-R=anchor apple generic and certificate leaf[subject.OU] = "${TEAM}" and identifier "${IDENTIFIER}"`, path], { encoding: 'utf8' })
    return checked.status === 0 ? undefined : `its signature is not GeckIt's (${checked.stderr.trim() || 'codesign failed'})`
  }
  const recorded = `${path}.sha256`
  if (!existsSync(recorded)) return signed ? 'its checksum file is missing' : undefined
  const expected = readFileSync(recorded, 'utf8').trim()
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex')
  return actual === expected ? undefined : 'it changed after GeckIt was built'
}

export interface BrokerProcess {
  readonly endpoint: () => BrokerEndpoint
  readonly state: () => { readonly running: boolean; readonly reason?: string }
  readonly stop: () => void
}

/** Starts the broker, keeps it running with backoff, and stops it with the service. */
export function superviseBroker(options: { readonly source: boolean; readonly path?: string; readonly signed?: boolean; readonly log?: (line: string) => void }): BrokerProcess {
  const folder = brokerFolder(options.source)
  const socket = brokerSocket(folder, options.source)
  let token = randomBytes(32).toString('hex')
  let child: ChildProcess | undefined
  let running = false
  let reason: string | undefined
  let failures = 0
  let stopped = false
  let timer: NodeJS.Timeout | undefined
  const say = options.log ?? (() => undefined)
  const start = (): void => {
    if (stopped) return
    const path = options.path ?? brokerPath()
    if (path === undefined) { reason = 'this GeckIt has no secrets broker'; return }
    const mismatch = brokerMismatch(path, options.signed ?? !options.source)
    if (mismatch !== undefined) { reason = `the secrets broker was not started: ${mismatch}`; say(reason); return }
    mkdirSync(folder, { recursive: true, mode: 0o700 })
    token = randomBytes(32).toString('hex')
    const started = spawn(path, ['--dir', folder, '--socket', socket], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, env: { PATH: process.env['PATH'] ?? '', HOME: homedir(), LOCALAPPDATA: process.env['LOCALAPPDATA'] ?? '', XDG_RUNTIME_DIR: process.env['XDG_RUNTIME_DIR'] ?? '', DBUS_SESSION_BUS_ADDRESS: process.env['DBUS_SESSION_BUS_ADDRESS'] ?? '' } })
    child = started
    started.stdin.write(`${token}\n`)
    started.stdin.on('error', () => undefined)
    let out = ''
    started.stdout.setEncoding('utf8')
    started.stdout.on('data', (part: string) => {
      out += part
      if (!running && /^ready /m.test(out)) { running = true; reason = undefined; failures = 0; say('Secrets broker ready.') }
    })
    started.stderr.setEncoding('utf8')
    started.stderr.on('data', (part: string) => { say(`broker: ${part.trim()}`) })
    started.on('exit', (code) => {
      running = false
      child = undefined
      if (stopped) return
      const wait = BACKOFF[failures]
      failures++
      if (wait === undefined) { reason = `the secrets broker stopped (exit ${String(code)}) and was not restarted after ${BACKOFF.length} tries`; say(reason); return }
      reason = `the secrets broker stopped (exit ${String(code)}); restarting`
      timer = setTimeout(start, wait)
    })
  }
  start()
  return {
    endpoint: () => {
      if (!running) throw new Error(`Secrets are unavailable: ${reason ?? 'the secrets broker is starting'}.`)
      return { socket, token }
    },
    state: () => ({ running, ...(reason === undefined ? {} : { reason }) }),
    stop: () => { stopped = true; if (timer !== undefined) clearTimeout(timer); child?.stdin?.end(); child?.kill() },
  }
}
