import { useState } from 'react'

import type { McpServer } from '../../../shared/api'
import { Picker } from '../ui/Menu'

/** The tool's word for how a server stands, as the menu says it. */
const STANDS: Readonly<Record<string, string>> = {
  connected: 'connected',
  failed: 'did not connect',
  'needs-auth': 'needs signing in, with /mcp in a terminal',
  pending: 'connecting',
  disabled: 'off',
}

/**
 * The project's MCP servers, under the field: which are on and how each
 * stands, asked when the menu is opened. Pressing one switches it on or off
 * for every conversation in the project, as /mcp in a terminal does.
 */
export function Mcp({ root, id }: { readonly root: string; readonly id: string | undefined }): React.JSX.Element {
  const [said, setSaid] = useState<{ readonly root: string; readonly servers: readonly McpServer[] | undefined }>()
  const [asking, setAsking] = useState(false)
  const servers = said?.root === root ? said.servers : undefined

  const ask = (change?: { readonly name: string; readonly enabled: boolean }): void => {
    setAsking(true)
    void window.geckit.chat.mcp(root, id, change).then((got) => {
      setSaid({ root, servers: got })
      setAsking(false)
    })
  }

  return (
    <Picker
      label="MCP"
      tip="MCP servers for this project"
      title="MCP servers"
      explained
      choices={
        servers === undefined || servers.length === 0
          ? [
              {
                value: '__asking',
                label: asking ? 'Asking Claude Code...' : servers === undefined ? 'Claude Code did not say' : 'None in this project',
              },
            ]
          : servers.map((one) => ({
              value: one.name,
              label: one.name,
              says: asking ? 'asking...' : (STANDS[one.status] ?? one.status),
              on: one.status !== 'disabled',
            }))
      }
      note="Switched for every conversation in this project, as /mcp does."
      onOpen={() => ask()}
      onPick={(value) => {
        const server = servers?.find((one) => one.name === value)
        if (server !== undefined) ask({ name: server.name, enabled: server.status === 'disabled' })
      }}
    />
  )
}
