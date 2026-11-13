import { connect } from 'node:net'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { SecretKind, SecretLifetime, SecretMetadata, SecretUse } from '../shared/secrets'

export const BROKER_PROTOCOL = 1

export type { SecretKind, SecretLifetime, SecretMetadata, SecretUse } from '../shared/secrets'

export interface Sealed { readonly epk: string; readonly iv: string; readonly data: string }

export interface BrokerStatus { readonly store: string; readonly version: string; readonly locked: boolean }

export class BrokerRefusal extends Error {
  constructor(readonly code: string, say: string) { super(say) }
}

export interface BrokerOps {
  prepare(request: { requestId: string; name: string; kind: SecretKind; places: readonly string[]; field?: string; note?: string; taskId: string }): Promise<{ brokerKey: string }>
  accept(request: { requestId: string; ciphertext: Sealed; lifetime: SecretLifetime }): Promise<{ name: string; expiresAt?: number }>
  list(): Promise<{ secrets: SecretMetadata[] }>
  history(request: { name?: string; limit?: number }): Promise<{ records: SecretUse[] }>
  revoke(request: { name: string } | { all: true }): Promise<{ removed: number }>
  taskEnded(request: { taskId: string }): Promise<{ removed: number }>
  fill(request: { name: string; taskId: string; origin: string; field: string; endpointKey: string }): Promise<{ sealed: Sealed }>
  clean(request: { text: string }): Promise<{ text: string }>
  status(): Promise<BrokerStatus>
}

export interface RunRequest { readonly taskId: string; readonly secrets: readonly string[]; readonly env: readonly string[]; readonly argv: readonly string[]; readonly cwd: string }
export interface RunChunk { readonly out?: string; readonly err?: string }

type Answer = { ok?: boolean; code?: string; say?: string; out?: string; err?: string } & Record<string, unknown>

export interface BrokerEndpoint { readonly socket: string; readonly token: string }

/** One connection per operation: hello, one op, then answers until a line carrying "ok". */
export function brokerCall(endpoint: BrokerEndpoint, op: string, body: object, onChunk?: (chunk: RunChunk) => void, timeoutMs = 30_000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const socket = connect(endpoint.socket)
    let rest = ''
    let greeted = false
    let done = false
    const finish = (error: Error | undefined, value?: Record<string, unknown>): void => {
      if (done) return
      done = true
      socket.destroy()
      if (error !== undefined) reject(error)
      else resolve(value ?? {})
    }
    if (timeoutMs > 0) socket.setTimeout(timeoutMs, () => finish(new BrokerRefusal('timeout', 'The secrets broker did not answer in time.')))
    socket.setEncoding('utf8')
    socket.on('error', (error) => finish(new BrokerRefusal('unavailable', `The secrets broker is not reachable: ${error.message}`)))
    socket.on('close', () => finish(new BrokerRefusal('unavailable', 'The secrets broker closed the connection.')))
    socket.on('connect', () => { socket.write(`${JSON.stringify({ op: 'hello', token: endpoint.token, protocol: BROKER_PROTOCOL })}\n`) })
    socket.on('data', (part: string) => {
      rest += part
      for (let end = rest.indexOf('\n'); end >= 0; end = rest.indexOf('\n')) {
        const line = rest.slice(0, end)
        rest = rest.slice(end + 1)
        let answer: Answer
        try { answer = JSON.parse(line) as Answer } catch { finish(new BrokerRefusal('protocol', 'The secrets broker answered something GeckIt does not read.')); return }
        if (!greeted) {
          if (answer.ok !== true) { finish(new BrokerRefusal(answer.code ?? 'protocol', answer.say ?? 'The secrets broker refused the connection.')); return }
          greeted = true
          socket.write(`${JSON.stringify({ op, ...body })}\n`)
          continue
        }
        if (answer.ok === undefined) { if (onChunk !== undefined) onChunk({ ...(answer.out === undefined ? {} : { out: answer.out }), ...(answer.err === undefined ? {} : { err: answer.err }) }); continue }
        if (answer.ok === false) { finish(new BrokerRefusal(answer.code ?? 'unknown', answer.say ?? 'The secrets broker refused.')); return }
        const { ok: _ok, ...value } = answer
        finish(undefined, value)
        return
      }
    })
  })
}

export function brokerOps(endpoint: () => BrokerEndpoint): BrokerOps & { run(request: RunRequest, onChunk: (chunk: RunChunk) => void): Promise<{ exit: number }> } {
  const call = <T>(op: string, body: object = {}): Promise<T> => brokerCall(endpoint(), op, body) as Promise<T>
  return {
    prepare: (request) => call('prepare', request),
    accept: (request) => call('accept', request),
    list: () => call('list'),
    history: (request) => call('history', request),
    revoke: (request) => call('revoke', request),
    taskEnded: (request) => call('taskEnded', request),
    fill: (request) => call('fill', request),
    clean: (request) => call('clean', request),
    status: () => call('status'),
    run: (request, onChunk) => brokerCall(endpoint(), 'run', request, onChunk, 0) as Promise<{ exit: number }>,
  }
}

/** The broker's own folder, kept apart from GeckIt's data so agent sessions can be told not to read it. */
export function brokerFolder(source: boolean): string {
  const configured = process.env['GECKIT_BROKER_DIR']
  if (configured !== undefined && configured !== '') return configured
  const name = source ? 'GeckIt Broker Local' : 'GeckIt Broker'
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', name)
  if (process.platform === 'win32') return join(process.env['LOCALAPPDATA'] ?? homedir(), name)
  return join(process.env['XDG_DATA_HOME'] ?? join(homedir(), '.local', 'share'), source ? 'geckit-broker-local' : 'geckit-broker')
}
