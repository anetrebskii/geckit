import { spawn } from 'node:child_process'
import { corePlatform } from './platform'

/** Commands only the person runs on the computer itself: pairing, access, the service and the computers this one reaches. */
const OPERATOR = new Set(['service', 'pair', 'devices', 'access', 'computers', 'browser-host', 'browser-test', 'migrate-codex'])

export function refusedCli(args: readonly string[]): string | undefined {
  if (args.length === 0) return 'Give the command to run.'
  if (args.some((one) => typeof one !== 'string' || one.length > 20_000)) return 'Give the command as words.'
  if (OPERATOR.has(args[0] ?? '')) return `geckit ${args[0]} runs only on that computer itself, by the person.`
  if (args.includes('--computer')) return 'Name one computer.'
  return undefined
}

/** Runs one GeckIt command on this computer for a paired device, as an assistant's command: what it prints and whether it worked. */
export function runCli(args: readonly string[]): Promise<{ readonly ok: boolean; readonly said: string }> {
  const refused = refusedCli(args)
  if (refused !== undefined) return Promise.resolve({ ok: false, said: refused })
  const launcher = corePlatform().launcher?.()
  if (launcher === undefined) return Promise.resolve({ ok: false, said: 'This GeckIt cannot run commands for other computers.' })
  return new Promise((done) => {
    const child = spawn(launcher.executable, [launcher.script, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', CLAUDECODE: '1' } })
    let said = ''
    const take = (part: Buffer): void => { if (said.length < 1_000_000) said += part.toString('utf8') }
    child.stdout.on('data', take)
    child.stderr.on('data', take)
    const timer = setTimeout(() => { child.kill(); done({ ok: false, said: `${said}\nStopped after 100 seconds.`.trim() }) }, 100_000)
    child.once('error', (error) => { clearTimeout(timer); done({ ok: false, said: error.message }) })
    child.once('exit', (code) => { clearTimeout(timer); done({ ok: code === 0, said: said.trimEnd() }) })
  })
}
