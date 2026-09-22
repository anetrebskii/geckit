import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { taskFile, taskOutput } from '../src/main/sessions/tasks'

describe('what a task in the background has to show', () => {
  it('reads what a command printed, without the line the tool adds when it exits', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'geckit-')), 'b1.output')
    await writeFile(file, 'tick 1\ntick 2\n\n[exited with code 0]\n')
    expect(await taskOutput('/work/docs', file, 'monitor')).toEqual({ kind: 'printed', text: 'tick 1\ntick 2' })
  })

  it('reads the end of a long one from a whole line', async () => {
    const file = join(await mkdtemp(join(tmpdir(), 'geckit-')), 'b2.output')
    const lines = Array.from({ length: 20_000 }, (_, at) => `line ${String(at)}`)
    await writeFile(file, `${lines.join('\n')}\n`)
    const read = await taskOutput('/work/docs', file, 'local_bash')
    const text = read.kind === 'printed' ? read.text : ''
    expect(text.length).toBeLessThanOrEqual(64_000)
    expect(text.split('\n')[0]).toMatch(/^line \d+$/)
    expect(text.endsWith('line 19999\n')).toBe(true)
  })

  it('reads nothing where nothing was written yet', async () => {
    expect(await taskOutput('/work/docs', '/nowhere/b3.output', 'local_bash')).toEqual({ kind: 'printed', text: '' })
  })

  it('reads a helper as what it was asked, what it did and what it said', async () => {
    const read = await taskOutput('/work/docs', join(import.meta.dirname, 'fixtures', 'claude-helper-transcript.jsonl'), 'local_agent')
    expect(read).toEqual({
      kind: 'helper',
      lines: [
        { id: expect.any(String), who: 'asked', text: expect.stringContaining('read the file record.mjs') },
        { id: expect.any(String), who: 'did', text: 'Ran ls -la' },
        { id: expect.any(String), who: 'did', text: 'Read record.mjs' },
        { id: expect.any(String), who: 'said', text: 'The file `record.mjs` has **43 lines**.' },
      ],
    })
  })

  it('finds where the tool writes for one it has not named the file of', async () => {
    expect(await taskFile('/work/docs', 's1', 'b4')).toMatch(/[\\/]claude-\d+[\\/]-work-docs[\\/]s1[\\/]tasks[\\/]b4\.output$/)
  })
})
