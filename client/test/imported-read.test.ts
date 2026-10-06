import { describe, expect, it } from 'vitest'

import { codexHistory, codexItem } from '../src/main/sessions/codex-read'
import type { CodexItem, CodexTurn } from '../src/main/sessions/codex-protocol'

const ROOT = '/work/app'
const call = (tool: string, input: string): string => `[external_agent_tool_call: ${tool}]\n${input}\n[/external_agent_tool_call]`
const result = (output: string): string => `[external_agent_tool_result]\n${output}\n[/external_agent_tool_result]`
const reply = (id: string, text: string): CodexItem => ({ type: 'agentMessage', id, text })
const turn = (items: CodexItem[]): CodexTurn => ({ id: 'turn', status: 'completed', error: null, startedAt: 100, items })
const history = (items: CodexItem[]): ReturnType<typeof codexHistory> => codexHistory([turn(items)], ROOT)

describe('imported Codex history', () => {
  it('pairs the screenshot format across separate assistant records and keeps ordinary replies', () => {
    expect(history([
      { type: 'userMessage', id: 'user', content: [{ type: 'text', text: 'Inspect the files', text_elements: [] }] },
      reply('call', call('Bash', 'description: Inspect files\ncommand: ls -la')),
      reply('result', result('package.json\nsrc/')),
      reply('answer', 'Found the files.'),
    ])).toEqual([
      { kind: 'mine', id: 'codex:user', text: 'Inspect the files', at: 100000 },
      { kind: 'did', id: 'codex:call:imported:0:call', what: 'Ran ls -la', detail: 'description: Inspect files\ncommand: ls -la\n\npackage.json\nsrc/' },
      { kind: 'theirs', id: 'codex:answer', text: 'Found the files.' },
    ])
  })

  it('splits mixed prose and several records without losing order or repeating IDs', () => {
    const items = [reply('all', `Checking.\n\n${call('Read', 'file: /work/app/package.json')}\n\n${result('{"name":"app"}')}\n\n${call('Edit', 'file: /work/app/main.ts')}\n\n${result('Updated.')}\n\nDone.`)]
    const read = history(items)
    expect(read.map((item) => item.kind === 'did' ? item.what : item.kind === 'theirs' ? item.text : '')).toEqual(['Checking.', 'Read package.json', 'Changed main.ts', 'Done.'])
    expect(new Set(read.map((item) => item.id)).size).toBe(read.length)
    expect(history(items)).toEqual(read)
  })

  it('keeps multiple historical questions and descriptions readable without active answer cards', () => {
    const input = { questions: [
      { question: 'What should the file be called?', options: [{ label: 'paths.md', description: 'Keep the file rule here' }, { label: 'output.md', description: 'Keep the output rule here' }] },
      { question: 'Which repository?', options: [{ label: 'Personal skills', description: 'Use my repository' }] },
    ] }
    const read = history([reply('questions', call('AskUserQuestion', `input: ${JSON.stringify(input)}`))])
    expect(read).toEqual([{ kind: 'did', id: 'codex:questions:imported:0:call', what: 'Asked: What should the file be called?', detail: 'What should the file be called?\n- paths.md: Keep the file rule here\n- output.md: Keep the output rule here\n\nWhich repository?\n- Personal skills: Use my repository' }])
    expect(read.some((item) => item.kind === 'card' || item.kind === 'did' && item.live)).toBe(false)
  })

  it('retains unknown tools, malformed question input and orphan or empty results', () => {
    expect(history([
      reply('orphan', result('Unmatched output')),
      reply('unknown', call('CustomTool', 'input: {"setting":true}')),
      reply('empty', result('')),
      reply('question', call('AskUserQuestion', 'input: invalid json')),
    ])).toEqual([
      { kind: 'did', id: 'codex:orphan:imported:0:result', what: 'Imported tool result', detail: 'Unmatched output' },
      { kind: 'did', id: 'codex:unknown:imported:0:call', what: 'Used CustomTool', detail: 'input: {"setting":true}\n\n' },
      { kind: 'did', id: 'codex:question:imported:0:call', what: 'Asked you a question', detail: 'input: invalid json' },
    ])
  })

  it('does not pair results across prose, user messages, native tools or turns', () => {
    const use = reply('call', call('Bash', 'command: pwd'))
    const back = reply('result', result('/work/app'))
    for (const between of [
      reply('prose', 'Next step.'),
      { type: 'userMessage' as const, id: 'user', content: [{ type: 'text' as const, text: 'Continue', text_elements: [] as [] }] },
      { type: 'webSearch' as const, id: 'search', query: 'docs' },
    ]) {
      const read = history([use, between, back])
      expect(read.at(-1)).toMatchObject({ kind: 'did', what: 'Imported tool result', detail: '/work/app' })
      expect(read[0]).toMatchObject({ detail: 'command: pwd' })
    }
    expect(codexHistory([turn([use]), turn([back])], ROOT)).toHaveLength(2)
  })

  it('preserves incomplete wrappers, user input, fenced examples and ordinary message metadata', () => {
    const example = call('Bash', 'command: npm test')
    const literal = reply('example', `Here is the format:\n\n\`\`\`text\n${example}\n\`\`\``)
    const partial = reply('partial', '[external_agent_tool_call: Bash]\ncommand: pwd')
    const user: CodexItem = { type: 'userMessage', id: 'user', content: [{ type: 'text', text: example, text_elements: [] }] }
    const phase: CodexItem = { type: 'agentMessage', id: 'phase', phase: 'commentary', text: 'Checking.' }
    expect(history([literal, partial, user, phase])).toEqual([codexItem(literal, ROOT)[0], codexItem(partial, ROOT)[0], { ...codexItem(user, ROOT)[0], at: 100000 }, codexItem(phase, ROOT)[0]])
  })

  it('decodes valid records after a fenced example and preserves CRLF output', () => {
    const example = `~~~text\n${call('Bash', 'command: literal')}\n~~~`
    const read = history([reply('mixed', `${example}\n\n${call('Bash', 'command: pwd')}\n\n${result('line1\nline2').replaceAll('\n', '\r\n')}`)])
    expect(read[0]).toMatchObject({ kind: 'theirs', text: example })
    expect(read[1]).toMatchObject({ kind: 'did', what: 'Ran pwd', detail: 'command: pwd\n\nline1\r\nline2' })
  })

  it('hides the standalone import boundary while retaining adjacent prose', () => {
    expect(history([reply('boundary', '<EXTERNAL SESSION IMPORTED>')])).toEqual([])
    expect(history([reply('boundary', 'Done.\n\n<EXTERNAL SESSION IMPORTED>')])).toMatchObject([{ kind: 'theirs', text: 'Done.' }])
  })

  it('keeps malformed nested wrappers literal instead of discarding their input', () => {
    const item = reply('broken', `[external_agent_tool_call: Bash]\ncommand: unfinished\n${call('Read', 'file: /work/app/main.ts')}`)
    expect(history([item])).toEqual(codexItem(item, ROOT))
  })

  it('leaves live events unchanged', () => {
    const item = reply('live', call('Bash', 'command: pwd'))
    expect(codexItem(item, ROOT, true)).toEqual([{ kind: 'theirs', id: 'codex:live', text: call('Bash', 'command: pwd') }])
  })

})
