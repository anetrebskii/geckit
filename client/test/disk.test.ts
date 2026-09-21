import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { claudeFile, deleteClaude, listClaude, readClaudeSession } from '../src/main/sessions/disk'

/**
 * Reading the tool's own conversations off disk.
 *
 * `CLAUDE_CONFIG_DIR` is what the tool itself honours, so a real folder of
 * real `.jsonl` files can stand in for `~/.claude` and nothing here touches
 * the person's own conversations.
 */

const ROOT = '/work/an app'
const SLUG = '-work-an-app'

let config = ''
let before: string | undefined

const line = (entry: Record<string, unknown>): string => JSON.stringify(entry)

const conversation = (id: string, lines: readonly string[]): void => {
  writeFileSync(join(config, 'projects', SLUG, `${id}.jsonl`), `${lines.join('\n')}\n`)
}

const said = (uuid: string, text: string): string =>
  line({ type: 'user', uuid, message: { role: 'user', content: text } })

const answered = (uuid: string, text: string, model = 'claude-opus-5'): string =>
  line({ type: 'assistant', uuid, message: { role: 'assistant', model, content: [{ type: 'text', text }] } })

beforeEach(() => {
  before = process.env['CLAUDE_CONFIG_DIR']
  config = mkdtempSync(join(tmpdir(), 'geckit-disk-'))
  process.env['CLAUDE_CONFIG_DIR'] = config
  mkdirSync(join(config, 'projects', SLUG), { recursive: true })
})

afterEach(() => {
  if (before === undefined) delete process.env['CLAUDE_CONFIG_DIR']
  else process.env['CLAUDE_CONFIG_DIR'] = before
  rmSync(config, { recursive: true, force: true })
})

describe('the conversations about a folder', () => {
  it('names one after the first thing that was asked', async () => {
    conversation('aaa', [said('u1', 'Rename the button'), answered('a1', 'Done, it is renamed.')])
    const found = await listClaude(ROOT)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({
      id: 'aaa',
      title: 'Rename the button',
      stands: 'Done, it is renamed.',
      driven: false,
      model: 'claude-opus-5',
    })
  })

  it('prefers a title somebody set over one the tool wrote', async () => {
    conversation('bbb', [
      said('u1', 'Rename the button'),
      line({ type: 'ai-title', aiTitle: 'Button renaming' }),
      line({ type: 'custom-title', customTitle: 'The button job' }),
    ])
    expect((await listClaude(ROOT))[0]?.title).toBe('The button job')
  })

  it('falls back to the title the tool wrote', async () => {
    conversation('ccc', [said('u1', 'Rename the button'), line({ type: 'ai-title', aiTitle: 'Button renaming' })])
    expect((await listClaude(ROOT))[0]?.title).toBe('Button renaming')
  })

  it('says which ones a program started', async () => {
    conversation('ddd', [line({ type: 'user', uuid: 'u1', entrypoint: 'sdk-ts', message: { role: 'user', content: 'go' } })])
    expect((await listClaude(ROOT))[0]?.driven).toBe(true)
  })

  it('leaves out what nobody said anything in', async () => {
    conversation('eee', [line({ type: 'summary', summary: 'nothing' })])
    expect(await listClaude(ROOT)).toEqual([])
  })

  it('does not take the tool speaking for itself as the model', async () => {
    conversation('fff', [
      said('u1', 'Carry on'),
      answered('a1', 'Here it is', 'claude-opus-5'),
      answered('a2', 'You are out of messages', '<synthetic>'),
    ])
    expect((await listClaude(ROOT))[0]?.model).toBe('claude-opus-5')
  })

  it('finds nothing for a folder the tool has never been run in', async () => {
    expect(await listClaude('/somewhere/else')).toEqual([])
  })
})

describe('one conversation', () => {
  it('is found by its id and read back whole', async () => {
    conversation('ggg', [said('u1', 'What does this do'), answered('a1', 'It renames things.')])
    expect(await claudeFile(ROOT, 'ggg')).toBe(join(config, 'projects', SLUG, 'ggg.jsonl'))
    const read = await readClaudeSession(ROOT, 'ggg')
    expect(read?.items.map((item) => item.kind)).toEqual(['mine', 'theirs'])
    expect(read?.cost).toBeUndefined()
  })

  it('adds up what every run of the tool cost, each by the last total it wrote', async () => {
    const run = (startTime: number, totalCostUSD: number): string =>
      line({ type: 'cost-state', sessionId: 'hhh', startTime, totalCostUSD })
    conversation('hhh', [
      said('u1', 'Rename it'),
      answered('a1', 'Done.'),
      run(1, 0.25),
      run(1, 0.5),
      said('u2', 'And the tests'),
      answered('a2', 'Done too.'),
      run(2, 0.125),
    ])
    expect((await readClaudeSession(ROOT, 'hhh'))?.cost).toBe(0.625)
  })

  it('is nothing where the tool has no file for it', async () => {
    expect(await claudeFile(ROOT, 'never-written')).toBeUndefined()
    expect(await readClaudeSession(ROOT, 'never-written')).toBeUndefined()
  })

  it('refuses an id that is a path', async () => {
    expect(await claudeFile(ROOT, '../../../etc/passwd')).toBeUndefined()
  })

  it('is gone from disk once it is deleted', async () => {
    conversation('hhh', [said('u1', 'Throw this away')])
    expect(await deleteClaude(ROOT, 'hhh')).toBe(true)
    expect(await claudeFile(ROOT, 'hhh')).toBeUndefined()
    expect(await listClaude(ROOT)).toEqual([])
    expect(await deleteClaude(ROOT, 'hhh')).toBe(false)
  })
})
