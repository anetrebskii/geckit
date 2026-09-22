import { open, readFile, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { TaskOutput } from '../../shared/api'
import { replayClaude } from './claude-read'

type Line = Extract<TaskOutput, { kind: 'helper' }>['lines'][number]

/** As much of the end of what a command printed as is worth reading in a window. */
const TAIL = 64_000

/**
 * Where the tool writes what a task prints, for one it has not named the file
 * of, which a watch never does: its own folder in the temp directory, under
 * the project's real path made a name, the conversation and the task.
 */
export async function taskFile(root: string, session: string, task: string): Promise<string> {
  const temp = process.env['CLAUDE_CODE_TMPDIR'] ?? (process.platform === 'win32' ? tmpdir() : '/tmp')
  const base = await realpath(temp).catch(() => temp)
  const real = await realpath(root).catch(() => root)
  const folder = real.replace(/[^A-Za-z0-9]/g, '-')
  return join(base, `claude-${String(process.getuid?.() ?? 0)}`, folder, session, 'tasks', `${task}.output`)
}

/**
 * What a task has to show. A command's file is what it printed, less the
 * line the tool adds when it exits; a helper's is its own conversation, read
 * the way one on disk is and put in a line each.
 */
export async function taskOutput(root: string, file: string, kind: string): Promise<TaskOutput> {
  if (kind === 'local_agent') {
    const entries = (await readFile(file, 'utf8').catch(() => ''))
      .split('\n')
      .flatMap((line): Record<string, unknown>[] => {
        try {
          // Every line is marked as the side conversation it is, which a conversation on disk is read without.
          const { isSidechain: _side, ...entry } = JSON.parse(line) as Record<string, unknown>
          return [entry]
        } catch {
          return []
        }
      })
    const lines = replayClaude(root, entries, 0).flatMap((item): Line[] =>
      item.kind === 'mine' || item.kind === 'theirs'
        ? [{ id: item.id, who: item.kind === 'mine' ? 'asked' : 'said', text: item.text }]
        : item.kind === 'did'
          ? [{ id: item.id, who: 'did', text: item.what }]
          : [],
    )
    return { kind: 'helper', lines }
  }

  const handle = await open(file, 'r').catch(() => undefined)
  if (handle === undefined) return { kind: 'printed', text: '' }
  try {
    const { size } = await handle.stat()
    const from = Math.max(0, size - TAIL)
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(size - from), 0, size - from, from)
    const read = buffer.subarray(0, bytesRead).toString('utf8')
    // Cut into the middle of it, it starts at the next whole line.
    const text = from === 0 ? read : read.slice(read.indexOf('\n') + 1)
    return { kind: 'printed', text: text.replace(/\n*\[exited with code -?\d+\]\s*$/, '') }
  } finally {
    await handle.close()
  }
}
