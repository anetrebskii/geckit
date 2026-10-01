import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GUIDE, keepCodexGuide, keepGuide } from '../src/main/guide'

describe('what Claude Code is told about GeckIt', () => {
  let folder = ''
  const was = process.env['CLAUDE_CONFIG_DIR']
  const codexWas = process.env['CODEX_HOME']
  // The command is written under the home folder, and a test that turns the guide off would delete the real one.
  const home = process.env['HOME']
  const read = (name: string): Promise<string> => readFile(join(folder, name), 'utf8').catch(() => 'gone')

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'geckit-guide-'))
    process.env['CLAUDE_CONFIG_DIR'] = folder
    process.env['CODEX_HOME'] = folder
    process.env['HOME'] = folder
  })

  afterEach(() => {
    if (was === undefined) delete process.env['CLAUDE_CONFIG_DIR']
    else process.env['CLAUDE_CONFIG_DIR'] = was
    if (codexWas === undefined) delete process.env['CODEX_HOME']
    else process.env['CODEX_HOME'] = codexWas
    process.env['HOME'] = home
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
})
