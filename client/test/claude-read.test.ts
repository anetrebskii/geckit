import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { claudeState, contextOf, lastContext, lastSaid, planOf, readClaude, replayClaude } from '../src/main/sessions/claude-read'
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

  it('knows a turn that was interrupted from one that finished', () => {
    expect(ended(play('claude-stop.jsonl').signals)).toBe('stopped')
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
