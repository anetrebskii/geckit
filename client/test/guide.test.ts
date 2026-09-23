import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { GUIDE, keepGuide } from '../src/main/guide'

describe('what Claude Code is told about GeckIt', () => {
  let folder = ''
  const was = process.env['CLAUDE_CONFIG_DIR']
  const read = (name: string): Promise<string> => readFile(join(folder, name), 'utf8').catch(() => 'gone')

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'geckit-guide-'))
    process.env['CLAUDE_CONFIG_DIR'] = folder
  })

  afterEach(() => {
    if (was === undefined) delete process.env['CLAUDE_CONFIG_DIR']
    else process.env['CLAUDE_CONFIG_DIR'] = was
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
})
