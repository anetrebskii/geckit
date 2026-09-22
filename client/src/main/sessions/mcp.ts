import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'

import type { McpServer } from '../../shared/api'
import { planOnly } from './account'

/**
 * The MCP servers Claude Code has for a folder, and whether each connects,
 * asked of a process in that folder that is given no message, so nothing is
 * sent to a model.
 *
 * A change goes first. `mcp_toggle` is saved where `/mcp` in a terminal saves
 * it, in the project's own settings, so it holds for every conversation there
 * from its next start. Servers take a moment to connect, so the status is asked
 * again until none is still on its way.
 */

type Json = Readonly<Record<string, unknown>>

export interface McpChange {
  readonly name: string
  readonly enabled: boolean
}

const PATIENCE = 20_000
const AGAIN = 500

/** The servers out of the tool's answer to `mcp_status`. */
export const serversOf = (answer: Json): McpServer[] =>
  (Array.isArray(answer['mcpServers']) ? (answer['mcpServers'] as unknown[]) : []).flatMap((one) => {
    const server = (one ?? {}) as Json
    return typeof server['name'] === 'string'
      ? [{ name: server['name'], status: typeof server['status'] === 'string' ? server['status'] : '' }]
      : []
  })

export function readMcp(root: string, change?: McpChange): Promise<McpServer[] | undefined> {
  return new Promise((done) => {
    const child = spawn(
      'claude',
      [
        '-p',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--verbose',
        '--no-session-persistence',
        '--settings',
        JSON.stringify({ disableAllHooks: true }),
      ],
      { cwd: root, stdio: ['pipe', 'pipe', 'ignore'], env: planOnly() },
    )
    let servers: McpServer[] | undefined
    let over = false
    let soon: NodeJS.Timeout | undefined
    const finish = (): void => {
      if (over) return
      over = true
      clearTimeout(patience)
      clearTimeout(soon)
      child.stdin.end()
      child.kill()
      done(servers)
    }
    const patience = setTimeout(finish, PATIENCE)
    const ask = (id: string, request: Json): void => {
      child.stdin.write(`${JSON.stringify({ type: 'control_request', request_id: id, request })}\n`)
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
      // Refused or not, what the servers are now is what is shown.
      if (response['request_id'] === 'change') return ask('status', { subtype: 'mcp_status' })
      if (response['request_id'] !== 'status' || response['subtype'] !== 'success') return finish()
      servers = serversOf((response['response'] ?? {}) as Json)
      if (servers.some((one) => one.status === 'pending')) {
        soon = setTimeout(() => ask('status', { subtype: 'mcp_status' }), AGAIN)
      } else finish()
    })
    child.on('error', finish)
    child.on('close', finish)
    child.stdin.on('error', () => undefined)
    if (change === undefined) ask('status', { subtype: 'mcp_status' })
    else ask('change', { subtype: 'mcp_toggle', serverName: change.name, enabled: change.enabled })
  })
}
