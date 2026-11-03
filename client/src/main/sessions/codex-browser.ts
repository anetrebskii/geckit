import { join, sep } from 'node:path'
import type { ThreadOptions } from './codex-protocol'

export const CHROME_INSTRUCTIONS = `GeckIt supplies the official Chrome DevTools MCP as geckit-chrome. Use its tools for Chrome tasks. Browser permission covers the connected profile's open windows; operate only on the requested URL and explicit pageId. Do not bring tabs to the foreground, switch profiles, or fall back to native Chrome control. Chrome 144+ must run on the service's machine. If connection fails because remote debugging is disabled, ask the user to enable it at chrome://inspect/#remote-debugging in the intended profile and accept Chrome's Allow prompt. Never enable it or bypass consent yourself. If the target URL is absent, ask the user to open it in the connected profile. Report refusal or unavailable Chrome as a blocker; tool inventory alone does not prove browser access. SSH does not forward the user's local browser. Do not copy ChatGPT Desktop browser identities or keys.`

export function chromeOptions(directory: string): Required<Pick<ThreadOptions, 'config' | 'developerInstructions'>> {
  const unpacked = directory.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`)
  return {
    config: {
      mcp_servers: {
        'geckit-chrome': {
          command: process.execPath,
          args: [join(unpacked, 'browser', 'build', 'src', 'bin', 'chrome-devtools-mcp.js'), '--autoConnect', '--no-usage-statistics', '--no-performance-crux'],
          env: { ELECTRON_RUN_AS_NODE: '1', CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1' },
        },
      },
    },
    developerInstructions: CHROME_INSTRUCTIONS,
  }
}
