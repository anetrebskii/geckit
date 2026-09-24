import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { AGAIN, claudeState, contextOf, goalOf, lastContext, lastSaid, planOf, readClaude, REFUSED, replayClaude, tasksOf, typed } from '../src/main/sessions/claude-read'
import type { ClaudeSignal } from '../src/main/sessions/claude-read'
import { within } from '../src/main/sessions/rule'
import { modelName } from '../src/shared/api'
import type { SessionItem } from '../src/shared/api'

/**
 * The reader, against what `claude` 2.1.278 really printed.
 *
 * The fixtures are recorded turns: `>` is what was sent to the tool, `<` is
 * what it printed back. Nothing here starts a process, so these run offline
 * and spend nothing.
 */

const ROOT = '/work/docs'

function recorded(name: string): Record<string, unknown>[] {
  return readFileSync(join(import.meta.dirname, 'fixtures', name), 'utf8')
    .split('\n')
    .filter((line) => line.startsWith('< '))
    .map((line) => JSON.parse(line.slice(2)) as Record<string, unknown>)
}

function play(name: string): { items: SessionItem[]; signals: ClaudeSignal[] } {
  const state = claudeState(ROOT)
  const items = new Map<string, SessionItem>()
  const signals: ClaudeSignal[] = []
  for (const message of recorded(name)) {
    const read = readClaude(state, message)
    for (const id of read.gone) items.delete(id)
    for (const item of read.items) items.set(item.id, item)
    signals.push(...read.signals)
  }
  return { items: [...items.values()], signals }
}

const ended = (signals: readonly ClaudeSignal[]): string | undefined =>
  signals.flatMap((one) => (one.kind === 'ended' ? [one.how] : []))[0]

describe('reading what claude prints', () => {
  it('says which session started, and that it is on a plan', () => {
    const { signals } = play('claude-command.jsonl')
    const started = signals.find((one) => one.kind === 'started')
    expect(started).toMatchObject({ kind: 'started', key: false })
  })

  it('turns a command into a line anybody can read, and asks before running it', () => {
    const { items, signals } = play('claude-command.jsonl')
    const asks = signals.filter((one) => one.kind === 'asks')
    expect(asks).toHaveLength(1)
    expect(asks[0]).toMatchObject({ request: { tool: 'Bash', wanted: { kind: 'command' } } })
    const did = items.filter((one) => one.kind === 'did')
    expect(did.some((one) => one.what.includes('curl'))).toBe(true)
    expect(ended(signals)).toBe('done')
  })

  it('says once, at the end of a turn, which files were changed', () => {
    const { items, signals } = play('claude-edit.jsonl')
    const wrote = items.filter((one) => one.kind === 'wrote')
    expect(wrote).toHaveLength(1)
    expect(wrote[0]?.kind === 'wrote' && wrote[0].paths.length).toBeGreaterThan(0)
    expect(signals.some((one) => one.kind === 'writing')).toBe(true)
    expect(ended(signals)).toBe('done')
  })

  it('draws a plan as something to start, not as a tool that ran', () => {
    const { items, signals } = play('claude-plan.jsonl')
    const asks = signals.flatMap((one) => (one.kind === 'asks' ? [one.request] : []))
    expect(asks.some((one) => one.wanted.kind === 'start')).toBe(true)
    expect(items.some((one) => one.kind === 'did' && /ExitPlanMode/.test(one.what))).toBe(false)
  })

  it('reads a question with its choices', () => {
    const { signals } = play('claude-question.jsonl')
    const wanted = signals.flatMap((one) => (one.kind === 'asks' ? [one.request.wanted] : []))
    const question = wanted.find((one) => one.kind === 'question')
    expect(question).toBeDefined()
    expect(question?.kind === 'question' && question.choices.length).toBeGreaterThan(0)
  })

  it('keeps the card and drops the line when something was refused', () => {
    const { items } = play('claude-refused.jsonl')
    const cards = items.filter((one) => one.kind === 'card')
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.some((one) => one.kind === 'card' && one.card.answered?.startsWith('Not allowed'))).toBe(true)
  })

  it('draws nothing for what was handed back to be tried again', () => {
    const state = claudeState(ROOT)
    const items = new Map<string, SessionItem>()
    for (const message of recorded('claude-refused.jsonl')) {
      const read = readClaude(state, JSON.parse(JSON.stringify(message).replaceAll(REFUSED, AGAIN)) as Record<string, unknown>)
      for (const id of read.gone) items.delete(id)
      for (const item of read.items) items.set(item.id, item)
    }
    expect([...items.values()].filter((one) => one.kind === 'card' || one.kind === 'did')).toEqual([])
  })

  it('knows a turn that was interrupted from one that finished', () => {
    expect(ended(play('claude-stop.jsonl').signals)).toBe('stopped')
  })

  it('keeps a picture a tool handed back, where the line for it is', () => {
    const state = claudeState(ROOT)
    const use = { type: 'tool_use', id: 'toolu_2', name: 'Read', input: { file_path: `${ROOT}/shot.png` } }
    const back = {
      type: 'tool_result',
      tool_use_id: 'toolu_2',
      content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' } }],
    }
    readClaude(state, { type: 'assistant', message: { content: [use] } })
    const items = readClaude(state, { type: 'user', message: { content: [back] } }).items
    expect(items).toEqual([
      expect.objectContaining({ kind: 'did', images: [{ media: 'image/png', data: 'iVBORw0KGgo=' }] }),
    ])
  })

  it('draws no line for looking up a tool', () => {
    const state = claudeState(ROOT)
    const use = { type: 'tool_use', id: 'toolu_1', name: 'ToolSearch', input: { query: 'select:ExitPlanMode' } }
    const back = { type: 'tool_result', tool_use_id: 'toolu_1', content: [{ type: 'tool_reference', tool_name: 'ExitPlanMode' }] }
    const items = [
      ...readClaude(state, { type: 'assistant', message: { content: [use] } }).items,
      ...readClaude(state, { type: 'user', message: { content: [back] } }).items,
    ]
    expect(items).toEqual([])
  })
})

describe('the line under a conversation', () => {
  const said = (text: string): Record<string, unknown>[] => [
    { type: 'assistant', message: { content: [{ type: 'text', text }] } },
  ]

  it('leaves the Markdown out', () => {
    expect(lastSaid(said('It is not missing - the **Active** tab shows `open` ones.'))).toBe(
      'It is not missing - the Active tab shows open ones.',
    )
    expect(lastSaid(said('I created the ticket: [FOR-1056](https://linear.app/formula/issue/FOR-1056) for it.'))).toBe(
      'I created the ticket: FOR-1056 for it.',
    )
    expect(lastSaid(said('```ts\nconst a = 1\n```'))).toBe('const a = 1')
    expect(lastSaid(said('## Done\n\n- [x] shipped'))).toBe('Done')
  })
})

describe('where a path is', () => {
  it('names a path the way the project names it', () => {
    expect(within(ROOT, `${ROOT}/src/a.ts`)).toBe('src/a.ts')
    expect(within(ROOT, '../elsewhere')).toBeUndefined()
  })
})

describe('naming a model the way a person says it', () => {
  it('reads the ids the tool uses', () => {
    expect(modelName('claude-opus-5')).toBe('Opus 5')
    expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
    expect(modelName('claude-sonnet-5')).toBe('Sonnet 5')
  })
})

describe('pictures sent with a message', () => {
  const said = (content: unknown): Record<string, unknown> => ({
    type: 'user',
    uuid: 'u1',
    message: { role: 'user', content },
  })

  it('reads them back out of the session file', () => {
    const items = replayClaude(ROOT, [
      said([
        { type: 'text', text: 'what is this' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
      ]),
    ], 0)
    expect(items).toEqual([{ kind: 'mine', id: 'u1', text: 'what is this', images: [{ media: 'image/png', data: 'AAAA' }] }])
  })

  it('keeps a message that is a picture and nothing else', () => {
    const items = replayClaude(ROOT, [
      said([{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'BBBB' } }]),
    ], 0)
    expect(items).toEqual([{ kind: 'mine', id: 'u1', text: '', images: [{ media: 'image/jpeg', data: 'BBBB' }] }])
  })

  it('leaves a plain message alone', () => {
    expect(replayClaude(ROOT, [said('just words')], 0)).toEqual([{ kind: 'mine', id: 'u1', text: 'just words' }])
  })
})

describe('a goal set with /goal', () => {
  // As claude 2.1.278 wrote them into the session file, cut down to what is read.
  const condition = 'a file named done.txt that contains the word ok exists in the current folder'
  const status = (said: Record<string, unknown>): Record<string, unknown> => ({
    type: 'attachment',
    attachment: { type: 'goal_status', condition, ...said },
  })
  const set = status({ met: false, sentinel: true })
  const notYet = status({ met: false, reason: 'There is no done.txt yet.' })
  const met = status({ met: true, reason: 'The Write result confirms done.txt was created with ok in it.', iterations: 2 })
  const typedGoal = {
    type: 'user',
    uuid: 'u1',
    message: {
      role: 'user',
      content: `<command-name>/goal</command-name>\n            <command-message>goal</command-message>\n            <command-args>${condition}</command-args>`,
    },
  }

  it('holds from the line that sets it, counting the checks that found it does not hold yet', () => {
    expect(goalOf([set])).toEqual({ goal: { condition, checks: 0 } })
    expect(goalOf([set, notYet])).toEqual({ goal: { condition, checks: 1, reason: 'There is no done.txt yet.' } })
  })

  it('is gone once met, and says so with what the check found', () => {
    expect(goalOf([set, notYet, met])).toEqual({
      met: true,
      ended: {
        kind: 'note',
        id: '',
        note: 'goal',
        text: `Goal met: ${condition}`,
        detail: 'The Write result confirms done.txt was created with ok in it.',
      },
    })
  })

  it('says when a check sends it back to work, which happens inside the one turn', () => {
    const feedback = `Stop hook feedback:\n[${condition}]: There is no done.txt yet.`
    const read = readClaude(claudeState(ROOT), { type: 'user', message: { role: 'user', content: [{ type: 'text', text: feedback }] } })
    expect(read.signals).toEqual([{ kind: 'held', hook: condition, reason: 'There is no done.txt yet.' }])
    expect(read.items).toEqual([])
  })

  it('is gone without a word when cleared by hand', () => {
    expect(goalOf([set, status({ met: true, sentinel: true })])).toEqual({})
  })

  it('reads back as the command that was typed and the line saying how it ended', () => {
    const items = replayClaude(ROOT, [set, typedGoal, met], 0)
    expect(items).toEqual([
      { kind: 'mine', id: 'u1', text: `/goal ${condition}` },
      expect.objectContaining({ kind: 'note', note: 'goal', text: `Goal met: ${condition}` }),
    ])
  })
})

describe('commands run with !', () => {
  const said = (uuid: string, content: unknown): Record<string, unknown> => ({ type: 'user', uuid, message: { role: 'user', content } })

  it('reads the two entries a terminal writes as one command with what it printed', () => {
    const items = replayClaude(ROOT, [
      said('u1', '<bash-input> git status</bash-input>'),
      said('u2', '<bash-stdout>On branch main</bash-stdout><bash-stderr></bash-stderr>'),
      said('u3', '<bash-input>true</bash-input>'),
      said('u4', '<bash-stdout>(Bash completed with no output)</bash-stdout><bash-stderr></bash-stderr>'),
    ], 0)
    expect(items).toEqual([
      { kind: 'shell', id: 'u1:shell:0', command: 'git status', output: 'On branch main' },
      { kind: 'shell', id: 'u3:shell:0', command: 'true', output: '' },
    ])
  })

  it('reads the blocks GeckIt sends ahead of a message as the command and then the message', () => {
    const items = replayClaude(ROOT, [
      said('u1', [
        { type: 'text', text: '<bash-input>npm test</bash-input>' },
        { type: 'text', text: '<bash-stdout>1 failed\n</bash-stdout><bash-stderr>Exit code 1</bash-stderr>' },
        { type: 'text', text: 'why does it fail?' },
      ]),
    ], 0)
    expect(items).toEqual([
      { kind: 'shell', id: 'u1:shell:0', command: 'npm test', output: '1 failed\nExit code 1' },
      { kind: 'mine', id: 'u1', text: 'why does it fail?' },
    ])
  })

  it('names a conversation by the message and not by the command ahead of it', () => {
    expect(
      typed(said('u1', [
        { type: 'text', text: '<bash-input>ls</bash-input>' },
        { type: 'text', text: '<bash-stdout>a</bash-stdout><bash-stderr></bash-stderr>' },
        { type: 'text', text: 'what are these?' },
      ])),
    ).toBe('what are these?')
    expect(typed(said('u1', '<bash-input>ls</bash-input>'))).toBe('')
  })
})

describe('when things were said', () => {
  it('dates a message and an answer read back from disk by the file', () => {
    const items = replayClaude(ROOT, [
      { type: 'user', uuid: 'u1', timestamp: '2026-09-21T10:00:00.000Z', message: { role: 'user', content: 'hi' } },
      {
        type: 'assistant',
        uuid: 'a1',
        timestamp: '2026-09-21T10:00:05.000Z',
        message: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'hello' }] },
      },
    ], 0)
    expect(items).toEqual([
      { kind: 'mine', id: 'u1', text: 'hi', at: Date.parse('2026-09-21T10:00:00.000Z') },
      { kind: 'theirs', id: 'a1:0', text: 'hello', at: Date.parse('2026-09-21T10:00:05.000Z') },
    ])
  })
})

describe('what the status line is drawn from', () => {
  // The shapes are what `claude` printed for a one-word answer on the plan.
  const answer = {
    type: 'assistant',
    uuid: 'a1',
    message: {
      model: 'claude-haiku-4-5-20251001',
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 9, cache_creation_input_tokens: 15686, cache_read_input_tokens: 13689, output_tokens: 37 },
    },
  }
  const limits = {
    type: 'rate_limit_event',
    rate_limit_info: {
      status: 'allowed',
      resetsAt: 1789994400,
      rateLimitType: 'five_hour',
      unifiedWindows: {
        five_hour: { utilization: 0.03, resetsAt: 1789994400 },
        seven_day: { utilization: 0.16, resetsAt: 1790452800 },
      },
    },
  }
  const result = {
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'ok',
    total_cost_usd: 0.0326,
    modelUsage: { 'claude-haiku-4-5-20251001': { contextWindow: 200000 } },
  }

  it('counts the context an answer was given, cached or not', () => {
    const read = readClaude(claudeState(ROOT), answer)
    expect(read.signals).toContainEqual({ kind: 'spend', used: 29421 })
    expect(contextOf(answer)).toBe(29421)
  })

  it('says the conversation was summarised, and how much of the context is left in use', () => {
    // As claude 2.1.278 wrote it after /compact, cut down to what is read.
    const read = readClaude(claudeState(ROOT), {
      type: 'system',
      subtype: 'compact_boundary',
      compact_metadata: { trigger: 'manual', pre_tokens: 40516, post_tokens: 4779 },
    })
    expect(read.items).toMatchObject([{ kind: 'note', note: 'summarised' }])
    expect(read.signals).toContainEqual({ kind: 'spend', used: 4779 })
  })

  it('puts the summary under that line, from the stream and from the file', () => {
    const boundary = { type: 'system', subtype: 'compact_boundary', compact_metadata: { post_tokens: 4779 } }
    const summary = 'This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion of the conversation.\n\nSummary:\n1. Primary Request and Intent:\n   - A sentence about blue.'
    const said = { kind: 'note', id: 'summarised:1', note: 'summarised', text: 'Earlier messages were summarised by Claude Code.', detail: '1. Primary Request and Intent:\n   - A sentence about blue.' }

    const state = claudeState(ROOT)
    readClaude(state, boundary)
    // As claude 2.1.278 streamed it after /compact.
    const streamed = readClaude(state, { type: 'user', isReplay: true, isSynthetic: true, message: { role: 'user', content: summary } })
    expect(streamed.items).toEqual([said])

    const replayed = replayClaude(ROOT, [boundary, { type: 'user', uuid: 'u1', isCompactSummary: true, isVisibleInTranscriptOnly: true, message: { role: 'user', content: summary } }], 0)
    expect(replayed).toEqual([said])
  })

  it('takes what this run has cost from the end of the turn', () => {
    const read = readClaude(claudeState(ROOT), result)
    expect(read.signals).toContainEqual({ kind: 'spend', cost: 0.0326 })
  })

  it('reads the windows out of the answer to get_usage, asked without a turn', () => {
    // As claude 2.1.278 answered it, cut down to what is read.
    const answer = {
      subscription_type: 'max',
      rate_limits_available: true,
      rate_limits: {
        five_hour: { utilization: 13, resets_at: '2026-09-21T12:40:00.476750+00:00' },
        seven_day: { utilization: 19, resets_at: '2026-09-26T20:00:00.476769+00:00' },
        seven_day_opus: null,
      },
    }
    expect(planOf(answer)).toEqual({
      fiveHour: { part: 0.13, resetsAt: Date.parse('2026-09-21T12:40:00.476Z') },
      sevenDay: { part: 0.19, resetsAt: Date.parse('2026-09-26T20:00:00.476Z') },
    })
    expect(planOf({ rate_limits_available: false, rate_limits: null })).toBeUndefined()
  })

  it('reads the five-hour and weekly windows even when nothing is refused', () => {
    const read = readClaude(claudeState(ROOT), limits)
    expect(read.signals).toEqual([
      {
        kind: 'plan',
        plan: {
          fiveHour: { part: 0.03, resetsAt: 1789994400_000 },
          sevenDay: { part: 0.16, resetsAt: 1790452800_000 },
        },
      },
    ])
  })

  it('finds the context of a conversation read from disk in its last real answer', () => {
    const limit = { type: 'assistant', message: { model: '<synthetic>', usage: { input_tokens: 1 } } }
    expect(lastContext([answer, { type: 'user', message: { content: 'next' } }, limit])).toBe(29421)
    expect(lastContext([{ type: 'user', message: { content: 'nothing yet' } }])).toBeUndefined()
  })
})

describe('what runs in the background', () => {
  it('says what was started in the background, what is running, and how it ended', () => {
    const { items, signals } = play('claude-background.jsonl')
    expect(items.find((one) => one.kind === 'did')).toMatchObject({ what: 'Started in the background: sleep 6; echo background-done' })
    const tasks = signals.flatMap((one) => (one.kind === 'task' ? [one.task] : []))
    expect(tasks[0]).toEqual({
      id: 'bic0gbvbq',
      kind: 'local_bash',
      what: 'Background sleep and echo command',
      status: 'running',
      started: expect.any(Number),
    })
    expect(tasks.at(-1)).toEqual({
      id: 'bic0gbvbq',
      kind: 'local_bash',
      what: 'Background sleep and echo command',
      command: 'sleep 6; echo background-done',
      use: 'toolu_01MroXjCkSq1HxAV3wpPzokU',
      status: 'completed',
      started: expect.any(Number),
      ended: 1790063416055,
      exit: 0,
      output: '/tmp/claude/-work-docs/e821feff-0a68-4cf1-8e47-55ff92ce7115/tasks/bic0gbvbq.output',
    })
    expect(items).toContainEqual({
      kind: 'note',
      id: 'task:bic0gbvbq',
      note: 'task',
      text: 'Background command "Background sleep and echo command" completed (exit code 0)',
    })
    // The tool starts a turn of its own to read what the command printed.
    expect(signals.filter((one) => one.kind === 'started')).toHaveLength(2)
    expect(items.some((one) => one.kind === 'did' && one.what === 'Read what a background task printed')).toBe(true)
    expect(items.at(-1)).toMatchObject({ kind: 'theirs', text: 'background-done' })
  })

  it('offers to send a command on in the background once it is a task, and says it was moved there', () => {
    const state = claudeState(ROOT)
    const items = new Map<string, SessionItem>()
    const lasting: SessionItem[] = []
    for (const message of recorded('claude-moved.jsonl')) {
      for (const item of readClaude(state, message).items) {
        items.set(item.id, item)
        if (item.kind === 'did' && item.lasting === true) lasting.push(item)
      }
    }
    expect(lasting).toEqual([expect.objectContaining({ what: 'Running ping -c 40 127.0.0.1', live: true })])
    const ping = items.get(lasting[0]?.id ?? '')
    expect(ping).toMatchObject({ what: 'Moved to the background: ping -c 40 127.0.0.1' })
    expect(ping).not.toHaveProperty('lasting')
    expect([...items.values()].some((one) => one.kind === 'did' && one.what === 'Watching in the background: Wait for ping output to complete and display results')).toBe(true)
    // The watch was stopped, which whoever stopped it knows; the command ran to its end.
    expect(items.has('task:bmyyo5x9p')).toBe(false)
    expect(items.get('task:b707zqkka')).toMatchObject({ note: 'task', text: expect.stringContaining('completed (exit code 0)') })
  })

  it('keeps a command moved to the background as a task, and how each one ended', () => {
    const { signals } = play('claude-moved.jsonl')
    const last = new Map(signals.flatMap((one) => (one.kind === 'task' ? [[one.task.id, one.task] as const] : [])))
    expect(last.get('b707zqkka')).toMatchObject({
      kind: 'local_bash',
      command: 'ping -c 40 127.0.0.1',
      status: 'completed',
      exit: 0,
      output: '/tmp/claude/-work-docs/c9145bd9-f97d-49f7-9fb2-793ab68d8831/tasks/b707zqkka.output',
    })
    expect(last.get('bmyyo5x9p')).toMatchObject({ kind: 'monitor', status: 'stopped', ended: 1790063615797 })
  })

  it('follows a helper in the background: what it is doing, how much it has done, and where it writes', () => {
    const { signals } = play('claude-helper.jsonl')
    const tasks = signals.flatMap((one) => (one.kind === 'task' ? [one.task] : []))
    expect(tasks.map((one) => one.progress?.doing)).toContain('Reading record.mjs')
    expect(tasks.at(-1)).toMatchObject({
      id: 'ab35a47f982b8a7c2',
      kind: 'local_agent',
      what: 'Count lines in record.mjs',
      status: 'completed',
      output: '/tmp/claude/-work-docs/02e15529-b920-4046-8377-2fe62015b09c/tasks/ab35a47f982b8a7c2.output',
      progress: { doing: 'Reading record.mjs', tools: 2, tokens: 20556 },
    })
  })

  it('tells a watch from a command, though the tool counts both as one', () => {
    const { signals } = play('claude-monitor.jsonl')
    expect(signals.flatMap((one) => (one.kind === 'task' ? [one.task] : [])).at(-1)).toMatchObject({
      id: 'bx3vlmxij',
      kind: 'monitor',
      what: 'monitoring tick counter',
      command: 'for i in 1 2 3 4; do echo tick $i; sleep 3; done',
      status: 'completed',
      output: '/tmp/claude/-work-docs/a45f7970-d275-45fb-828d-4c80eee29fc8/tasks/bx3vlmxij.output',
    })
  })

  it('reads back the line for what ended in the background, and nothing for what was stopped', () => {
    const told = (id: string, status: string, summary: string): string =>
      `<task-notification>\n<task-id>${id}</task-id>\n<status>${status}</status>\n<summary>${summary}</summary>\n</task-notification>`
    const finished = told('b1', 'completed', 'Background command "sleep" completed (exit code 0)')
    const items = replayClaude(ROOT, [
      { type: 'user', uuid: 'u1', message: { role: 'user', content: 'run it in the background' } },
      { type: 'assistant', uuid: 'a1', message: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'started' }] } },
      { type: 'user', uuid: 'u2', origin: { kind: 'task-notification' }, message: { role: 'user', content: finished } },
      { type: 'assistant', uuid: 'a2', message: { stop_reason: 'end_turn', content: [{ type: 'text', text: 'done' }] } },
      { type: 'user', uuid: 'u3', message: { role: 'user', content: told('b2', 'killed', 'Task "watch" was stopped by the user') } },
    ], 0)
    expect(items).toEqual([
      { kind: 'mine', id: 'u1', text: 'run it in the background' },
      { kind: 'theirs', id: 'a1:0', text: 'started' },
      { kind: 'note', id: 'task:b1', note: 'task', text: 'Background command "sleep" completed (exit code 0)' },
      { kind: 'theirs', id: 'a2:0', text: 'done' },
    ])
    expect(typed({ type: 'user', message: { role: 'user', content: finished } })).toBe('')
  })
})

describe('what a conversation put in the background, read back out of its file', () => {
  // As claude 2.1.280 wrote them, cut down to what is read.
  const use = (id: string, name: string, input: Record<string, unknown>): Record<string, unknown> => ({
    type: 'assistant',
    timestamp: '2026-09-22T18:00:00.000Z',
    message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
  })
  const backgrounded = (use: string, task: string): Record<string, unknown> => ({
    type: 'user',
    timestamp: '2026-09-22T18:00:01.000Z',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: use, content: `Command running in background with ID: ${task}.` }] },
    toolUseResult: { stdout: '', stderr: '', backgroundTaskId: task },
  })
  const told = (task: string, status: string, summary: string): Record<string, unknown> => ({
    type: 'user',
    timestamp: '2026-09-22T18:05:00.000Z',
    message: {
      role: 'user',
      content: `<task-notification>\n<task-id>${task}</task-id>\n<output-file>/tmp/${task}.output</output-file>\n<status>${status}</status>\n<summary>${summary}</summary>\n</task-notification>`,
    },
  })

  it('takes the command, what it was for and where it wrote from the lines about it', () => {
    expect(
      tasksOf([
        use('toolu_1', 'Bash', { command: 'npm run build', description: 'Build the app', run_in_background: true }),
        backgrounded('toolu_1', 'b1'),
        told('b1', 'completed', 'Background command "Build the app" completed (exit code 0)'),
      ]),
    ).toEqual([
      {
        id: 'b1',
        kind: 'local_bash',
        what: 'Build the app',
        command: 'npm run build',
        use: 'toolu_1',
        status: 'completed',
        started: Date.parse('2026-09-22T18:00:00.000Z'),
        ended: Date.parse('2026-09-22T18:05:00.000Z'),
        exit: 0,
        output: '/tmp/b1.output',
      },
    ])
  })

  it('has one that was never said to have ended stopped, because the process that held it is gone', () => {
    expect(
      tasksOf([use('toolu_2', 'Monitor', { command: 'tail -f log', description: 'Watch the log' }), backgrounded('toolu_2', 'b2')]),
    ).toMatchObject([{ id: 'b2', kind: 'monitor', status: 'stopped', what: 'Watch the log' }])
  })

  it('keeps how one failed, and passes over a conversation with nothing in the background', () => {
    expect(
      tasksOf([
        use('toolu_3', 'Bash', { command: 'npm test', description: 'Run the tests' }),
        backgrounded('toolu_3', 'b3'),
        told('b3', 'failed', 'Background command "Run the tests" failed with exit code 1'),
      ]),
    ).toMatchObject([{ id: 'b3', status: 'failed', exit: 1 }])
    expect(tasksOf([use('toolu_4', 'Bash', { command: 'ls', description: 'List' })])).toEqual([])
  })
})
