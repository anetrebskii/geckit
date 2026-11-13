import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GUIDE, BROWSER, browserBridge, browserPluginFolder, codexSkillFolder, keepBrowserBridge, keepCodexGuide, keepGuide, launchers, skillFiles, bundledSkillNames, MANAGER_WORKFLOWS, withGuideBlock } from '../src/main/guide'
import { browserBridgeOn, setBrowserBridgeOn } from '../src/cli/browser'
import { configureCorePlatform, corePlatform } from '../src/core/platform'
import { sourceArgs } from '../src/main/sessions/claude'
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

  const block = (body: string, source = join(folder, 'GECKIT.md')): string => `<!-- geckit:begin source=${source} -->\n${body}\n<!-- geckit:end -->\n`

  it('writes the file and a marked block that reads it, leaving what was there', async () => {
    await writeFile(join(folder, 'CLAUDE.md'), '# Mine\n\nAnswer in English.\n')
    await keepGuide(true)
    expect(await read('GECKIT.md')).toContain(GUIDE)
    expect(await read('CLAUDE.md')).toBe(`# Mine\n\nAnswer in English.\n\n${block('@GECKIT.md')}`)
  })

  it('starts the file where the tool has none', async () => {
    await keepGuide(true)
    expect(await read('CLAUDE.md')).toBe(block('@GECKIT.md'))
  })

  it('turns the bare line of an earlier version into the block where it stands', async () => {
    await writeFile(join(folder, 'CLAUDE.md'), '<!-- personal:begin -->\n@mine.md\n<!-- personal:end -->\n\n@GECKIT.md\n\n@RTK.md\n')
    await keepGuide(true)
    await keepGuide(true)
    expect(await read('CLAUDE.md')).toBe(`<!-- personal:begin -->\n@mine.md\n<!-- personal:end -->\n\n${block('@GECKIT.md')}\n@RTK.md\n`)
  })

  it('leaves a file with a broken block alone', () => {
    const broken = '# Mine\n<!-- geckit:begin source=x -->\n@GECKIT.md\n'
    expect(withGuideBlock(broken, 'x', '@GECKIT.md', '@GECKIT.md')).toBeUndefined()
    expect(withGuideBlock(`${broken}<!-- geckit:end -->\n<!-- geckit:end -->\n`, 'x', '@GECKIT.md', '@GECKIT.md')).toBeUndefined()
  })

  it('refreshes the block when its source moves, keeping one', () => {
    const was = `# Mine\n\n<!-- geckit:begin source=/old/GECKIT.md -->\n@GECKIT.md\n<!-- geckit:end -->\n\n# After\n`
    expect(withGuideBlock(was, '/new/GECKIT.md', '@GECKIT.md', '@GECKIT.md')).toBe('# Mine\n\n<!-- geckit:begin source=/new/GECKIT.md -->\n@GECKIT.md\n<!-- geckit:end -->\n\n# After\n')
    expect(withGuideBlock(was, '/new/GECKIT.md', undefined, '@GECKIT.md')).toBe('# Mine\n\n# After\n')
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
    expect(await read('GECKIT.md')).toContain('AGENTS.md')
    expect(await read('AGENTS.md')).toBe(`# Mine\n\nAnswer in English.\n\n${block(line)}`)
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
    const kimi: LlmProvider = { ...llmProvider({}, 'claude'), id: 'plugin:kimi', family: 'plugin:kimi', setInstructions: async (enabled, _names, browser) => { called.push(['kimi', enabled]); expect(browser).toEqual(browserBridge()) } }
    const mirror: LlmProvider = { ...llmProvider({}, 'codex'), id: 'plugin:codex-mirror', family: 'plugin:codex-mirror', runtime: 'codex', setInstructions: async (enabled) => { called.push(['mirror', enabled]) } }
    const sessions = new Sessions({ notes: memoryNotes(), changed: () => {}, items: () => {}, account: () => {}, notify: () => {}, plugins: [kimi, mirror] })
    await sessions.setAllInstructions({ guideClaude: true, guideCodex: false, guidePlugins: { 'plugin:kimi': false }, browserNames: {}, providerPlugins: [kimi, mirror] })
    expect(called).toEqual([['kimi', false], ['mirror', false]])
  })

  it.each([false, true])('generates mandatory browser instructions and removes them when disabled (source: %s)', async (source) => {
    const platform = corePlatform()
    const bridge = browserBridgeOn()
    const sourceEnvironment = ['GECKIT_SOURCE_CLI', 'GECKIT_SOURCE_GUIDE', 'GECKIT_SOURCE_CODEX_GUIDE', 'GECKIT_LLAMA_SERVER'] as const
    const saved = sourceEnvironment.map((key) => [key, process.env[key]] as const)
    for (const key of sourceEnvironment) delete process.env[key]
    const data = join(folder, 'data')
    const claude = join(folder, 'claude')
    const codex = join(folder, 'codex')
    await Promise.all([data, claude, codex].map((directory) => mkdir(directory)))
    process.env['CLAUDE_CONFIG_DIR'] = claude
    process.env['CODEX_HOME'] = codex
    configureCorePlatform({ directory: () => data, source: () => source })
    const claudeGuide = join(source ? data : claude, 'GECKIT.md')
    const codexGuide = join(source ? data : codex, source ? 'GECKIT-CODEX.md' : 'GECKIT.md')
    const claudeSkill = join(browserPluginFolder(), 'skills', 'use-browser', 'SKILL.md')
    const codexSkill = join(codexSkillFolder(), 'SKILL.md')
    const legacyCodexSkill = join(codex, 'skills', 'geckit-browser', 'SKILL.md')
    const oldClaudeSkill = join(browserPluginFolder(), 'skills', 'browser', 'SKILL.md')
    const required = [
      'for all browser actions and page reading',
      'tab the person named or a new background tab you open for this task',
      'Do not take over unrelated tabs or switch Chrome profiles to find the target tab.',
      'unavailable, disconnected, paused, denied or does not support the requested action',
      'report the specific failure or unsupported action and stop the affected browser work',
      'Do not fall back to other browser tools, direct page fetching, Playwright/CDP, AppleScript or native computer control.',
      "GeckIt's documented test browser is not a way around a refusal or permission denial.",
      'browser profiles` reports no ordinary Chrome profiles, or none has GeckIt Browser',
      'Missing Chrome profiles do not block this fallback on macOS or Linux.',
      'GeckIt automatically downloads Camoufox on first use when it is missing and reuses it afterward',
      'open <url> --profile geckit',
      'Native provider permissions still apply.',
      'do not bypass a denial, change permissions, extract credentials or switch profiles to evade a restriction.',
    ]
    try {
      if (source) {
        await writeFile(join(claude, 'GECKIT.md'), 'Installed Claude guide')
        await writeFile(join(codex, 'GECKIT.md'), 'Installed Codex guide')
        await mkdir(join(codexSkillFolder()), { recursive: true })
        await writeFile(codexSkill, 'Installed Codex skill')
      }
      await mkdir(join(codex, 'skills', 'geckit-browser'), { recursive: true })
      await writeFile(legacyCodexSkill, 'Earlier Codex skill')
      await mkdir(join(browserPluginFolder(), 'skills', 'browser'), { recursive: true })
      await writeFile(oldClaudeSkill, 'Earlier Claude skill')
      keepBrowserBridge(true)
      configureCorePlatform({ ...corePlatform(), launcher: () => ({ executable: process.execPath, script: join(data, 'cli.js') }) })
      await keepGuide(true, {}, [], true)
      await keepCodexGuide(true, [], true)
      const generated = await Promise.all([claudeGuide, codexGuide, claudeSkill, ...(source ? [] : [codexSkill])].map((file) => readFile(file, 'utf8')))
      for (const content of generated.slice(2)) {
        for (const rule of required) expect(content).toContain(rule)
        expect(content).not.toContain('unless the person names one')
        expect(content).toContain(source ? '.geckit/bin/geckit-local' : '.geckit/bin/geckit')
      }
      const claudeContent = generated[0] ?? ''
      expect(browserBridge()?.pluginDir).toBe(browserPluginFolder())
      for (const rule of required) expect(browserBridge()?.rule).toContain(rule)
      const codexContent = generated[1] ?? ''
      for (const claude of [true, false]) {
        const employeeSkillPath = claude ? join(browserPluginFolder(), 'skills', 'manage-employees', 'SKILL.md') : source ? join(data, 'codex-skills', 'geckit-manage-employees', 'SKILL.md') : join(codexSkillFolder('geckit-manage-employees'), 'SKILL.md')
        const employeeReviewPath = claude ? join(browserPluginFolder(), 'skills', 'review-employee-work', 'SKILL.md') : source ? join(data, 'codex-skills', 'geckit-review-employee-work', 'SKILL.md') : join(codexSkillFolder('geckit-review-employee-work'), 'SKILL.md')
        const employeeSkill = await readFile(employeeSkillPath, 'utf8')
        expect(employeeSkill).toContain(employeeReviewPath)
        expect(employeeSkill).toContain(claude ? 'geckit:review-employee-work' : 'geckit-review-employee-work')
        expect(await readFile(employeeReviewPath, 'utf8')).toContain(`name: ${claude ? 'review-employee-work' : 'geckit-review-employee-work'}`)
        const workflows = MANAGER_WORKFLOWS(claude)
        const inline = BROWSER('/bin/geckit', claude, true)
        const profilesPath = claude ? join(browserPluginFolder(), 'skills', 'configure-browser-profile', 'SKILL.md') : source ? join(data, 'codex-skills', 'geckit-configure-browser-profile', 'SKILL.md') : join(codexSkillFolder('geckit-configure-browser-profile'), 'SKILL.md')
        expect(inline).toContain(profilesPath)
        expect(inline).toContain(claude ? 'geckit:configure-browser-profile' : 'geckit-configure-browser-profile')
        expect(inline).toContain('## Test browsers')
        expect(inline).not.toContain('{{')
        for (const name of ['manage-worker-lifecycle', 'review-progress-tasks', 'schedule-tasks']) {
          const path = claude ? join(browserPluginFolder(), 'skills', name, 'SKILL.md') : source ? join(data, 'codex-skills', `geckit-${name}`, 'SKILL.md') : join(codexSkillFolder(`geckit-${name}`), 'SKILL.md')
          expect(workflows).toContain(path)
          expect(workflows).toContain(claude ? `geckit:${name}` : `geckit-${name}`)
          expect(await readFile(path, 'utf8')).toContain(`name: ${claude ? name : `geckit-${name}`}`)
          expect(claude ? claudeContent : codexContent).toContain(path)
        }
      }
      expect(claudeContent).toContain('`geckit:use-browser` skill')
      for (const content of generated.slice(0, 2)) {
        expect(content.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(500)
        expect(content).not.toContain('current catalog')
        expect(content).toContain('employees current')
      }
      for (const name of bundledSkillNames()) {
        const text = await readFile(join(browserPluginFolder(), 'skills', name, 'SKILL.md'), 'utf8')
        for (const content of Object.values(skillFiles('/bin/geckit', name, name))) expect(content).not.toContain('{{')
        for (const link of text.matchAll(/\]\((references\/[^)]+)\)/g)) expect(await readFile(join(browserPluginFolder(), 'skills', name, link[1] ?? ''), 'utf8')).not.toContain('{{')
        expect(text).not.toContain('{{')
        expect(text).toContain(`name: ${name}`)
        expect(text.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(750)
        const description = /\ndescription: (.+)\n/.exec(text)?.[1] ?? ''
        expect(description.split(/\s+/).length).toBeLessThanOrEqual(50)
        for (const part of ['Purpose', 'Inputs', 'Work', 'Unknowns', 'Output', 'Verification']) expect(text).toContain(`## ${part}`)
        const codexPath = source ? join(data, 'codex-skills', `geckit-${name}`, 'SKILL.md') : join(codexSkillFolder(`geckit-${name}`), 'SKILL.md')
        expect(await readFile(codexPath, 'utf8')).toContain(`name: geckit-${name}`)
        if (name.startsWith('configure-')) {
          expect(claudeContent).toContain(join(browserPluginFolder(), 'skills', name, 'SKILL.md'))
          expect(codexContent).toContain(codexPath)
        }
      }
      await expect(readFile(oldClaudeSkill, 'utf8')).rejects.toThrow()
      expect(await readFile(join(browserPluginFolder(), 'skills', 'use-secrets', 'SKILL.md'), 'utf8')).toContain('secrets request')
      expect(await readFile(join(browserPluginFolder(), '.claude-plugin', 'plugin.json'), 'utf8')).toContain('"name": "geckit"')
      if (source) {
        expect(sourceArgs()).toContain('--append-system-prompt')
        expect(sourceArgs().join(' ')).toContain(claudeGuide)
        expect(process.env['GECKIT_SOURCE_CODEX_GUIDE']).toBe(codexGuide)
        expect(codexContent).not.toContain('## Test browsers')
        expect(codexContent).toContain(join(data, 'codex-skills', 'geckit-use-browser', 'SKILL.md'))
        expect(await readFile(join(data, 'codex-skills', 'geckit-use-browser', 'SKILL.md'), 'utf8')).toContain('browser profiles')
        expect(await readFile(join(claude, 'GECKIT.md'), 'utf8')).toBe('Installed Claude guide')
        expect(await readFile(join(codex, 'GECKIT.md'), 'utf8')).toBe('Installed Codex guide')
        expect(await readFile(codexSkill, 'utf8')).toBe('Installed Codex skill')
        expect(await readFile(legacyCodexSkill, 'utf8')).toBe('Earlier Codex skill')
      } else {
        expect(await readFile(join(claude, 'CLAUDE.md'), 'utf8')).toBe(`<!-- geckit:begin source=${claudeGuide} -->\n@GECKIT.md\n<!-- geckit:end -->\n`)
        expect(await readFile(join(codex, 'AGENTS.md'), 'utf8')).toContain(`Read ${codexGuide}`)
        expect(codexContent).toContain('`geckit-use-browser` skill')
        expect(await readFile(join(codexSkillFolder(), 'references', 'test-browsers.md'), 'utf8')).toContain('## Test browsers')
        await expect(readFile(legacyCodexSkill, 'utf8')).rejects.toThrow()
      }
      keepBrowserBridge(false)
      expect(browserBridge()).toBeUndefined()
      await keepGuide(true, {}, [], true)
      await keepCodexGuide(true, [], true)
      for (const file of [claudeGuide, codexGuide]) {
        const content = await readFile(file, 'utf8')
        expect(content).not.toContain('## Chrome through GeckIt')
        expect(content).not.toContain('## Test browsers')
        for (const rule of required) expect(content).not.toContain(rule)
      }
      await expect(readFile(claudeSkill, 'utf8')).rejects.toThrow()
      expect(await readFile(join(browserPluginFolder(), 'skills', 'use-secrets', 'SKILL.md'), 'utf8')).toContain('name: use-secrets')
      if (!source) expect(await readFile(join(codexSkillFolder('geckit-use-secrets'), 'SKILL.md'), 'utf8')).toContain('name: geckit-use-secrets')
      for (const name of bundledSkillNames().filter((name) => name.startsWith('configure-'))) {
        expect(await readFile(join(browserPluginFolder(), 'skills', name, 'SKILL.md'), 'utf8')).toContain(`name: ${name}`)
        const codexPath = source ? join(data, 'codex-skills', `geckit-${name}`, 'SKILL.md') : join(codexSkillFolder(`geckit-${name}`), 'SKILL.md')
        expect(await readFile(codexPath, 'utf8')).toContain(`name: geckit-${name}`)
        expect(await readFile(codexGuide, 'utf8')).toContain(codexPath)
      }
      for (const file of [claudeGuide, codexGuide]) expect(await readFile(file, 'utf8')).toContain('## Secrets')
      if (source) expect(await readFile(codexSkill, 'utf8')).toBe('Installed Codex skill')
      else await expect(readFile(codexSkill, 'utf8')).rejects.toThrow()
    } finally {
      keepBrowserBridge(false)
      setBrowserBridgeOn(bridge)
      configureCorePlatform(platform)
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    }
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

  it.skipIf(process.platform === 'win32')('keeps shell metacharacters literal in service launcher paths', async () => {
    const script = join(folder, 'cli with spaces.mjs')
    const command = join(folder, 'geckit')
    const data = join(folder, 'literal$(printf wrong)`printf wrong`"\\path')
    await writeFile(script, 'process.stdout.write(JSON.stringify(process.env.GECKIT_DATA))')
    await writeFile(command, launchers(process.execPath, script, data).sh)
    expect(JSON.parse(execFileSync('/bin/sh', [command], { encoding: 'utf8' }))).toBe(data)
  })

  it('on Windows tells Codex the .cmd and a batch from a file instead of a heredoc', async () => {
    const was = process.platform
    Object.defineProperty(process, 'platform', { value: 'win32' })
    try {
      await keepCodexGuide(true)
      const guide = await read('GECKIT.md')
      expect(guide).toContain('.geckit/bin/geckit.cmd instructions app')
      const files = skillFiles('/bin/geckit.cmd', 'manage-conversations', 'geckit-manage-conversations')
      const commands = files['references/commands.md'] ?? ''
      expect(commands).toContain('/bin/geckit.cmd start --conversations conversations.json')
      expect(commands).not.toContain("<<'EOF'")
      expect(commands).toContain('with the file holding')
    } finally {
      Object.defineProperty(process, 'platform', { value: was })
      await keepCodexGuide(false)
    }
  })
})
