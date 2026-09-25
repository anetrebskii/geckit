import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { createInterface } from 'node:readline'

import type { PlanUsage } from '../../shared/api'
import { planOf } from './claude-read'
import { claudeCommand, planOnly } from './account'

/**
 * How much of the plan is spent, and how much context each model may hold,
 * asked of Claude Code without a turn.
 *
 * The plan's windows are what `/usage` shows, from the tool's `get_usage`
 * request on the channel the permission requests arrive on; how much a model
 * may hold is what `/context` measures against, which is the model's window or
 * the smaller one the person set for summarising, from `get_context_usage`
 * once the tool has been switched to that model. Both are answered by a
 * process that is given no message, so nothing is sent to a model and nothing
 * is spent. The person's hooks and MCP servers are not started for it: it
 * runs every few minutes and is about nothing.
 */

type Json = Readonly<Record<string, unknown>>

export interface Usage {
  readonly plan?: PlanUsage
  /** How much context each model asked about may hold, in tokens. Nothing for one the tool would not say. */
  readonly windows: ReadonlyMap<string, number | undefined>
}

const PATIENCE = 20_000

export function readUsage(models: readonly string[]): Promise<Usage> {
  return new Promise((done) => {
    const child = spawn(
      claudeCommand(),
      [
        '-p',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--verbose',
        '--no-session-persistence',
        '--strict-mcp-config',
        '--settings',
        JSON.stringify({ disableAllHooks: true }),
      ],
      { cwd: homedir(), stdio: ['pipe', 'pipe', 'ignore'], env: planOnly(), windowsHide: true },
    )
    let plan: PlanUsage | undefined
    const windows = new Map<string, number | undefined>(models.map((model) => [model, undefined]))
    // Asked one at a time: which model a window is for is the one switched to before it.
    const asks: { readonly id: string; readonly request: Json }[] = [
      { id: 'usage', request: { subtype: 'get_usage', skip_behaviors: true } },
      ...models.flatMap((model, index) => [
        { id: `model:${String(index)}`, request: { subtype: 'set_model', model } },
        { id: `window:${String(index)}`, request: { subtype: 'get_context_usage', detail: 'summary' } },
      ]),
    ]
    let next = 0

    let over = false
    const finish = (): void => {
      if (over) return
      over = true
      clearTimeout(patience)
      child.stdin.end()
      child.kill()
      done({ ...(plan === undefined ? {} : { plan }), windows })
    }
    const patience = setTimeout(finish, PATIENCE)
    const ask = (): void => {
      const one = asks[next++]
      if (one === undefined) return finish()
      child.stdin.write(`${JSON.stringify({ type: 'control_request', request_id: one.id, request: one.request })}\n`)
    }

    createInterface({ input: child.stdout }).on('line', (line) => {
      let message: Json
      try {
        message = JSON.parse(line) as Json
      } catch {
        return
      }
      if (message['type'] !== 'control_response') return
      const response = (message['response'] ?? {}) as Json
      const answer = (response['response'] ?? {}) as Json
      const id = typeof response['request_id'] === 'string' ? response['request_id'] : ''
      if (response['subtype'] === 'success') {
        if (id === 'usage') plan = planOf(answer)
        const model = id.startsWith('window:') ? models[Number(id.slice('window:'.length))] : undefined
        const most = answer['maxTokens']
        if (model !== undefined && typeof most === 'number' && most > 0) windows.set(model, most)
      } else if (id.startsWith('model:')) {
        // Still on the model before it, so what it would measure is not this one's.
        next += 1
      }
      ask()
    })
    child.on('error', finish)
    child.on('close', finish)
    child.stdin.on('error', () => undefined)
    ask()
  })
}
