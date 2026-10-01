import { appendFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { searchClaude, searchCodex } from '../src/main/sessions/search'

/** Finding a conversation by what was said in it, against files laid out the way the tool writes them. */

const ROOT = '/work/app'

const line = (entry: unknown): string => `${JSON.stringify(entry)}\n`
const asked = (text: string): string => line({ type: 'user', message: { role: 'user', content: text } })
const answered = (text: string): string =>
  line({
    type: 'assistant',
    message: { content: [{ type: 'text', text }, { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'grep -r zebra' } }] },
  })
const printed = (text: string): string =>
  line({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: text }] } })

let file: string

beforeEach(async () => {
  const base = await mkdtemp(join(tmpdir(), 'geckit-search-'))
  process.env['CLAUDE_CONFIG_DIR'] = base
  const folder = join(base, 'projects', '-work-app')
  await mkdir(folder, { recursive: true })
  file = join(folder, 'aaa.jsonl')
})

afterEach(() => {
  delete process.env['CLAUDE_CONFIG_DIR']
})

describe('searching what was said', () => {
  it('finds a conversation by a message holding every word, and says the last such message', async () => {
    await writeFile(
      file,
      asked('How do we deploy the billing service?') + answered('Run the Deploy workflow for billing.') + printed('billing found in 12 files'),
    )
    expect(await searchClaude([ROOT], 'billing DEPLOY')).toEqual([
      { id: 'aaa', root: ROOT, said: 'Run the Deploy workflow for billing.', count: 2 },
    ])
  })

  it('leaves out what a tool was asked and what it printed', async () => {
    await writeFile(file, asked('hello') + answered('Looking.') + printed('12 files'))
    expect(await searchClaude([ROOT], 'files')).toEqual([])
    expect(await searchClaude([ROOT], 'zebra')).toEqual([])
  })

  it('reads on from where it stopped, and a line still being written once it is whole', async () => {
    await writeFile(file, asked('first question'))
    expect(await searchClaude([ROOT], 'first')).toHaveLength(1)
    await appendFile(file, '{"type":"user","message":{"role":"user","content":"a giraffe')
    expect(await searchClaude([ROOT], 'giraffe')).toEqual([])
    await appendFile(file, ' walked in"}}\n')
    expect(await searchClaude([ROOT], 'giraffe walked')).toEqual([
      { id: 'aaa', root: ROOT, said: 'a giraffe walked in', count: 1 },
    ])
    expect(await searchClaude([ROOT], 'first')).toHaveLength(1)
  })

  it('indexes Codex messages once and reads newly appended responses without tool output or duplicate events', async () => {
    const files = [{ id: 'codex:aaa', root: ROOT, path: file }]
    await writeFile(file, line({ type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Deploy billing' }] } }) + line({ type: 'event_msg', payload: { type: 'user_message', message: 'Deploy billing' } }) + line({ type: 'response_item', payload: { type: 'function_call_output', output: 'zebra' } }))
    expect(await searchCodex(files, '')).toEqual([])
    expect(await searchCodex(files, 'deploy billing')).toEqual([{ id: 'codex:aaa', root: ROOT, said: 'Deploy billing', count: 1 }])
    await appendFile(file, line({ type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Billing deploy finished.' }] } }))
    expect(await searchCodex(files, 'billing deploy')).toEqual([{ id: 'codex:aaa', root: ROOT, said: 'Billing deploy finished.', count: 2 }])
    expect(await searchCodex(files, 'zebra')).toEqual([])
  })
})
