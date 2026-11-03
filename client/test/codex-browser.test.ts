import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chromeOptions } from '../src/main/sessions/codex-browser'

describe('bundled Chrome launch', () => {
  it('runs the bundled entry directly with consent and privacy flags', () => {
    const server = chromeOptions(join('/installed', 'service')).config.mcp_servers?.['geckit-chrome']
    expect(server).toEqual({
      command: process.execPath,
      args: [join('/installed', 'service', 'browser', 'build', 'src', 'bin', 'chrome-devtools-mcp.js'), '--autoConnect', '--no-usage-statistics', '--no-performance-crux'],
      env: { ELECTRON_RUN_AS_NODE: '1', CHROME_DEVTOOLS_MCP_NO_UPDATE_CHECKS: '1' },
    })
  })

  it('addresses the unpacked desktop resource without changing standalone paths', () => {
    const directory = join('/Applications', 'GeckIt.app', 'Contents', 'Resources', 'app.asar', 'out', 'service')
    const server = chromeOptions(directory).config.mcp_servers?.['geckit-chrome']
    expect(server?.args[0]).toBe(join('/Applications', 'GeckIt.app', 'Contents', 'Resources', 'app.asar.unpacked', 'out', 'service', 'browser', 'build', 'src', 'bin', 'chrome-devtools-mcp.js'))
    expect(chromeOptions(join('/home', 'app.asar-project', 'service')).config.mcp_servers?.['geckit-chrome'].args[0]).toContain('app.asar-project')
  })
})
