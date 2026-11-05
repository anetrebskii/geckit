import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { join, resolve } from 'node:path'

import { OPERATOR_HELP } from '../shared/service'
import type { OperatorAsked, OperatorAnswered } from '../shared/service'
import { askedEndpoint } from './endpoint'
import { requestingSession } from './start'
import { connectRpc } from '../core/rpc'
import type { CoreMethods } from '../core/application'
import type { ServiceMethods, ServiceEvents } from '../service/application'

async function callService(args: readonly string[], directory: string, token: string): Promise<{ readonly ok: boolean; readonly said: string }> {
  let client: Awaited<ReturnType<typeof connectRpc<ServiceMethods, ServiceEvents>>> | undefined
  let timeout: NodeJS.Timeout | undefined
  try {
    const expired = new Promise<never>((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('GeckIt service did not answer within 30 seconds.')), 30_000) })
    const connecting = connectRpc<ServiceMethods, ServiceEvents>(directory, token)
    let abandoned = false
    void connecting.then((connection) => { if (abandoned) connection.close() }, () => undefined)
    try { client = await Promise.race([connecting, expired]) } catch (error) { abandoned = true; throw error }
    const hello = await Promise.race([client.call('desktop:hello'), expired])
    const methods = hello.methods.filter((method) => !method.startsWith('desktop:') && method !== 'service:shutdownForUpdate')
    if (args[0] === 'methods') return { ok: true, said: methods.join('\n') }
    const method = args[1]
    if (method === undefined || !methods.includes(method)) throw new Error('Choose a method from geckit service methods.')
    const parsed: unknown = JSON.parse(args[2] ?? '[]')
    if (!Array.isArray(parsed)) throw new Error('Method arguments must be a JSON array.')
    const name = method as keyof CoreMethods
    const parameters = parsed as Parameters<CoreMethods[typeof name]>
    const value = await Promise.race([client.call(name, ...parameters), expired])
    return { ok: true, said: JSON.stringify(value ?? null, undefined, 2) }
  } catch (error) { return { ok: false, said: error instanceof Error ? error.message : String(error) } }
  finally { if (timeout !== undefined) clearTimeout(timeout); client?.close() }
}

export async function service(args: readonly string[], directory: string): Promise<{ readonly ok: boolean; readonly said: string }> {
  if (args.length === 0 || args[0] === 'help' || args[0] === '--help') return { ok: true, said: OPERATOR_HELP }
  if (requestingSession() !== undefined || process.env['GECKIT_MANAGER_SESSION'] || process.env['CLAUDECODE']) return { ok: false, said: 'Operator access denied. Use the conversation commands to request changes.' }
  if (args[0] === 'run') {
    if (args.length !== 1 && (args.length !== 3 || args[1] !== '--data' || !args[2] || args[2].startsWith('--'))) return { ok: false, said: 'Use geckit service run [--data <directory>].' }
    const target = args[2] === undefined ? directory : resolve(args[2])
    return new Promise((done) => {
      const child = spawn(process.execPath, [join(import.meta.dirname, 'service.js'), '--data', target], { stdio: 'inherit', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } })
      const stop = (): void => { child.kill('SIGTERM') }
      process.on('SIGTERM', stop); process.on('SIGINT', stop)
      const finish = (ok: boolean, said: string): void => { process.off('SIGTERM', stop); process.off('SIGINT', stop); done({ ok, said }) }
      child.once('error', (error) => finish(false, error.message))
      child.once('exit', (code) => finish(code === 0, code === 0 ? 'GeckIt service stopped.' : `GeckIt service exited (${code ?? 'signal'}).`))
    })
  }
  let token: string
  try { token = readFileSync(join(directory, 'operator-token'), 'utf8').trim() }
  catch { return { ok: false, said: 'GeckIt service is not running for this data directory.' } }
  if (args[0] === 'call' || args[0] === 'methods') return callService(args, directory, token)
  return new Promise((resolve) => {
    const socket = connect(askedEndpoint(directory))
    let rest = ''
    let finished = false
    const done = (ok: boolean, said: string): void => { if (finished) return; finished = true; socket.destroy(); resolve({ ok, said }) }
    socket.setEncoding('utf8')
    socket.setTimeout(30_000, () => done(false, 'GeckIt service did not answer within 30 seconds.'))
    socket.on('connect', () => { const ask: OperatorAsked = { action: 'operator', token, args }; socket.write(`${JSON.stringify(ask)}\n`) })
    socket.on('data', (part: string) => {
      rest += part
      const end = rest.indexOf('\n')
      if (end < 0) return
      try {
        const answer = JSON.parse(rest.slice(0, end)) as OperatorAnswered
        done(answer.ok, answer.ok ? answer.result : answer.error)
      } catch { done(false, 'GeckIt service returned an unreadable response.') }
    })
    socket.on('error', () => done(false, 'GeckIt service is not running for this data directory.'))
    socket.on('close', () => done(false, 'GeckIt service closed before answering.'))
  })
}
