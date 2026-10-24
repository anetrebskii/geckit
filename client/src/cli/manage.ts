import { connect } from 'node:net'
import { askedEndpoint } from './endpoint'

import type { ManagerCliAnswered, ManagerCliAsked } from '../shared/manager'

export const managerCommand = (args: readonly string[], env: NodeJS.ProcessEnv = process.env): boolean => env['GECKIT_MANAGER_SESSION'] !== undefined && ['capabilities', 'providers', 'projects', 'files', 'sessions', 'settings', 'attachments', 'telegram'].includes(args[0] ?? '')

export function manage(args: readonly string[], directory: string, env: NodeJS.ProcessEnv = process.env): Promise<{ readonly said: string; readonly ok: boolean }> {
  const session = env['GECKIT_MANAGER_SESSION']
  const token = env['GECKIT_MANAGER_TOKEN']
  const operation = env['GECKIT_MANAGER_OPERATION']
  if (!session || !token || !operation) return Promise.resolve({ ok: false, said: 'These commands require the current Manager session. Open Manager in GeckIt.' })
  const asked: ManagerCliAsked = { action: 'manage', args, session, token, operation }
  return new Promise((resolve) => {
    const socket = connect(askedEndpoint(directory))
    let received = ''
    socket.setEncoding('utf8')
    socket.setTimeout(55_000, () => socket.destroy(new Error('GeckIt did not answer the Manager command. Delivery may be uncertain; check current state before retrying.')))
    socket.on('connect', () => socket.write(`${JSON.stringify(asked)}\n`))
    socket.on('data', (part: string) => { received += part })
    socket.on('error', (error: Error) => resolve({ ok: false, said: error.message }))
    socket.on('end', () => {
      try {
        const answer = JSON.parse(received) as ManagerCliAnswered
        resolve(answer.ok ? { ok: true, said: answer.result } : { ok: false, said: answer.error })
      } catch { resolve({ ok: false, said: 'GeckIt closed before answering. Delivery is uncertain; check current state before retrying.' }) }
    })
  })
}
