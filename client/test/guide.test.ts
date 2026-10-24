import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GUIDE, keepCodexGuide, keepGuide, launchers } from '../src/main/guide'
import { memoryNotes, Sessions } from '../src/main/sessions'
import { llmProvider } from '../src/main/sessions/provider'
import type { LlmProvider } from '../src/main/sessions/provider'

describe('what Claude Code is told about GeckIt', () => {
  let folder = ''
  const was = process.env['CLAUDE_CONFIG_DIR']
  const codexWas = process.env['CODEX_HOME']
  // The command is written under the home folder, and a test that turns the guide off would delete the real one. Windows reads the home from USERPROFILE.
  const home = process.env['HOME']
  const profile = process.env['USERPROFILE']
  const read = (name: string): Promise<string> => readFile(join(folder, name), 'utf8').catch(() => 'gone')

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'geckit-guide-'))
    process.env['CLAUDE_CONFIG_DIR'] = folder
    process.env['CODEX_HOME'] = folder
    process.env['HOME'] = folder
    process.env['USERPROFILE'] = folder
  })

  afterEach(() => {
    if (was === undefined) delete process.env['CLAUDE_CONFIG_DIR']
    else process.env['CLAUDE_CONFIG_DIR'] = was
    if (codexWas === undefined) delete process.env['CODEX_HOME']
    else process.env['CODEX_HOME'] = codexWas
    process.env['HOME'] = home
    if (profile === undefined) delete process.env['USERPROFILE']
    else process.env['USERPROFILE'] = profile
  })

  it('writes the file and one line that reads it, leaving what was there', async () => {
    await writeFile(join(folder, 'CLAUDE.md'), '# Mine\n\nAnswer in English.\n')
    await keepGuide(true)
    expect(await read('GECKIT.md')).toContain(GUIDE)
    expect(await read('CLAUDE.md')).toBe('# Mine\n\nAnswer in English.\n\n@GECKIT.md\n')
  })

  it('starts the file where the tool has none', async () => {
    await keepGuide(true)
    expect(await read('CLAUDE.md')).toBe('@GECKIT.md\n')
  })

  it('says it once, however often it starts', async () => {
    await keepGuide(true)
    await keepGuide(true)
    await keepGuide(true)
    expect((await read('CLAUDE.md')).match(/@GECKIT\.md/g)).toHaveLength(1)
  })

  it('takes both away again when it is turned off', async () => {
    await writeFile(join(folder, 'CLAUDE.md'), '# Mine\n\nAnswer in English.\n')
    await keepGuide(true)
    await keepGuide(false)
    expect(await read('GECKIT.md')).toBe('gone')
    expect(await read('CLAUDE.md')).toBe('# Mine\n\nAnswer in English.\n')
  })

  it('names the browsers the person named, and says nothing of them while none is', async () => {
    await keepGuide(true)
    expect(await read('GECKIT.md')).not.toContain('## Chrome browsers')
    await keepGuide(true, { 'deed75a2-8ca2': 'Work\nChrome', 'e085681a-0f23': ' ' })
    const guide = await read('GECKIT.md')
    expect(guide).toContain('## Chrome browsers')
    expect(guide).toContain('- `deed75a2-8ca2`: Work Chrome\n')
    expect(guide).not.toContain('e085681a-0f23')
  })

  it('links Codex once, then removes only its own files and line', async () => {
    await writeFile(join(folder, 'AGENTS.md'), '# Mine\n\nAnswer in English.\n')
    await keepCodexGuide(true)
    await keepCodexGuide(true)
    const line = `Read ${join(folder, 'GECKIT.md')} for how GeckIt works when this conversation runs in GeckIt.`
    expect(await read('GECKIT.md')).toContain('Codex')
    expect(await read('AGENTS.md')).toBe(`# Mine\n\nAnswer in English.\n\n${line}\n`)
    await keepCodexGuide(false)
    expect(await read('GECKIT.md')).toBe('gone')
    expect(await read('AGENTS.md')).toBe('# Mine\n\nAnswer in English.\n')
  })

  it('sets each built-in provider instructions through the provider contract', async () => {
    await llmProvider({}, 'claude').setInstructions(true, { work: 'Work Chrome' })
    expect(await read('CLAUDE.md')).toContain('@GECKIT.md')
    expect(await read('GECKIT.md')).toContain('Work Chrome')
    await llmProvider({}, 'claude').setInstructions(false, {})
    await llmProvider({}, 'codex').setInstructions(true, {})
    expect(await read('AGENTS.md')).toContain('GECKIT.md')
    await llmProvider({}, 'codex').setInstructions(false, {})
    expect(await read('GECKIT.md')).toBe('gone')
  })

  it('passes independent and shared settings to plugin instruction methods', async () => {
    const called: [string, boolean][] = []
    const kimi: LlmProvider = { ...llmProvider({}, 'claude'), id: 'plugin:kimi', family: 'plugin:kimi', setInstructions: async (enabled) => { called.push(['kimi', enabled]) } }
    const mirror: LlmProvider = { ...llmProvider({}, 'codex'), id: 'plugin:codex-mirror', family: 'plugin:codex-mirror', runtime: 'codex', setInstructions: async (enabled) => { called.push(['mirror', enabled]) } }
    const sessions = new Sessions({ notes: memoryNotes(), changed: () => {}, items: () => {}, account: () => {}, notify: () => {}, plugins: [kimi, mirror] })
    await sessions.setAllInstructions({ guideClaude: true, guideCodex: false, guidePlugins: { 'plugin:kimi': false }, browserNames: {}, providerPlugins: [kimi, mirror] })
    expect(called).toEqual([['kimi', false], ['mirror', false]])
  })

  it('writes the command as a shell script, and on Windows a .cmd beside it that cmd reads whatever the code page', () => {
    const posix = launchers('/Applications/GeckIt.app/Contents/MacOS/GeckIt', '/Applications/GeckIt.app/Contents/Resources/app.asar/out/main/cli.js', '/Users/alex/Library/Application Support/geckit', 'darwin')
    expect(posix.cmd).toBeUndefined()
    expect(posix.sh).toBe([
      '#!/bin/sh',
      '# Written by GeckIt when it starts. Anything changed here is written over.',
      'GECKIT_DATA="/Users/alex/Library/Application Support/geckit" ELECTRON_RUN_AS_NODE=1 exec "/Applications/GeckIt.app/Contents/MacOS/GeckIt" "/Applications/GeckIt.app/Contents/Resources/app.asar/out/main/cli.js" "$@"',
      '',
    ].join('\n'))
    const windows = launchers('C:\\Users\\anton\\AppData\\Local\\Programs\\geckit\\GeckIt.exe', 'C:\\Users\\anton\\AppData\\Local\\Programs\\geckit\\resources\\app.asar\\out\\main\\cli.js', 'C:\\Users\\anton\\AppData\\Roaming\\geckit', 'win32', 'C:\\Users\\anton')
    expect(windows.sh).toContain('GECKIT_DATA="C:/Users/anton/AppData/Roaming/geckit" ELECTRON_RUN_AS_NODE=1 exec "C:/Users/anton/AppData/Local/Programs/geckit/GeckIt.exe" "C:/Users/anton/AppData/Local/Programs/geckit/resources/app.asar/out/main/cli.js" "$@"')
    expect(windows.cmd).toBe([
      '@echo off',
      'setlocal',
      'rem Written by GeckIt when it starts. Anything changed here is written over.',
      'set "GECKIT_DATA=%USERPROFILE%\\AppData\\Roaming\\geckit"',
      'set "ELECTRON_RUN_AS_NODE=1"',
      '"%USERPROFILE%\\AppData\\Local\\Programs\\geckit\\GeckIt.exe" "%USERPROFILE%\\AppData\\Local\\Programs\\geckit\\resources\\app.asar\\out\\main\\cli.js" %*',
      '',
    ].join('\r\n'))
    const elsewhere = launchers('D:\\Tools\\100%\\GeckIt.exe', 'D:\\Tools\\100%\\resources\\app.asar\\out\\main\\cli.js', 'C:\\Users\\antonia\\AppData\\Roaming\\geckit', 'win32', 'C:\\Users\\anton\\')
    expect(elsewhere.cmd).toContain('set "GECKIT_DATA=C:\\Users\\antonia\\AppData\\Roaming\\geckit"')
    expect(elsewhere.cmd).toContain('"D:\\Tools\\100%%\\GeckIt.exe" "D:\\Tools\\100%%\\resources\\app.asar\\out\\main\\cli.js" %*')
  })

  it('on Windows tells Codex the .cmd and a batch from a file instead of a heredoc', async () => {
    const was = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32' })
    try {
      await keepCodexGuide(true)
      const guide = await read('GECKIT.md')
      expect(guide).toContain('.geckit/bin/geckit.cmd start --conversations conversations.json')
      expect(guide).not.toContain("<<'EOF'")
      expect(guide).toContain('with the file holding')
    } finally {
      Object.defineProperty(process, 'platform', { value: was })
      await keepCodexGuide(false)
    }
  })
})
