import { connect } from 'node:net'
import type { SettingsCliAsked, SettingsCliAnswered } from '../shared/agent-settings'
import { askedEndpoint } from './endpoint'

export function readSettings(args: readonly string[], directory: string): Promise<{ readonly said: string; readonly ok: boolean }> {
  const request: SettingsCliAsked = { action: 'settings', args }
  return new Promise((resolve) => {
    const socket = connect(askedEndpoint(directory))
    let received = ''
    socket.setEncoding('utf8')
    socket.setTimeout(55_000, () => socket.destroy(new Error('GeckIt did not answer. Read settings show before retrying a change.')))
    socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`))
    socket.on('data', (part: string) => { received += part })
    socket.on('error', (error: Error) => resolve({ ok: false, said: error.message }))
    socket.on('end', () => {
      try {
        const answer = JSON.parse(received) as SettingsCliAnswered
        resolve(answer.ok ? { ok: true, said: answer.result } : { ok: false, said: answer.error })
      } catch { resolve({ ok: false, said: 'GeckIt closed before answering. Read settings show before retrying.' }) }
    })
  })
}
