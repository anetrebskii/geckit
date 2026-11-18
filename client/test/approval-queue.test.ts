import { expect, it, vi } from 'vitest'
import { ApprovalQueue } from '../src/main/channels/approval-queue'
import type { ApprovalPrompt } from '../src/main/channels/approval-queue'
import type { ChannelContext, Json, ManagerDecision } from '../src/main/channels/channel-api'

const decision = (id: string, values = ['allow', 'refuse']): ManagerDecision => ({ id, title: `Request ${id}`, choices: values.map((value) => ({ label: value, value })) })

function fixture() {
  const store = new Map<string, Json>()
  let open: readonly ManagerDecision[] = []
  let current = true
  const post = vi.fn(async (one: ManagerDecision) => `message:${one.id}`)
  const close = vi.fn(async (_prompt: ApprovalPrompt, _note: string) => undefined)
  const notify = vi.fn(async (_text: string) => undefined)
  const failed = vi.fn()
  const decide = vi.fn<NonNullable<ChannelContext['conversations']['decide']>>(async (_thread, id, _choice, options) => {
    if (options?.authorized?.() === false) throw new Error('Not authorized')
    if (!open.some((one) => one.id === id)) return 'This request is no longer pending. Use /status to see current requests.'
    open = open.filter((one) => one.id !== id)
    return 'Answer sent.'
  })
  const context: ChannelContext = {
    id: 'channel:test',
    config: () => ({}), secret: () => undefined,
    store: { get: (key) => store.get(key), set: (key, value) => { if (value === undefined) store.delete(key); else store.set(key, value) } },
    sealed: { available: () => true, read: () => undefined, write: () => undefined },
    status: () => undefined, log: { path: '', write: () => undefined },
    projects: () => [], providers: () => ['claude'], employees: () => [],
    conversations: {
      manager: () => 'thread', label: () => undefined, start: async () => 'thread', send: async () => 'thread', get: () => undefined, list: () => [], items: async () => [], watch: () => () => undefined, answer: async () => false, stop: async () => undefined,
      decide, decisions: () => open,
    },
  }
  const make = (key = 'thread') => new ApprovalQueue({ context, thread: key, key, current: () => current, post, close, notify, failed })
  const queue = make()
  const update = (...decisions: readonly ManagerDecision[]): void => { open = decisions; queue.update(open) }
  const settle = async (): Promise<void> => { for (let i = 0; i < 12; i++) await Promise.resolve() }
  const reply = (text: string, prompt = queue.prompt) => queue.reply(text, prompt, { id: 'person', name: 'Person' }, () => current)
  return { queue, make, update, settle, reply, context, store, post, close, notify, failed, decide, inactive: () => { current = false } }
}

it('posts one request, confirms its answer, then posts the next without sharing a reply', async () => {
  const run = fixture()
  run.update(decision('first'), decision('second'))
  await run.settle()
  expect(run.post.mock.calls.map(([one]) => one.id)).toEqual(['first'])
  const first = run.queue.prompt
  await run.reply('ALLOW')
  expect(run.decide.mock.calls.map(([, id, choice]) => [id, choice])).toEqual([['first', 'allow']])
  expect(run.close).toHaveBeenCalledWith(first, 'Person chose allow. Answer sent.')
  expect(run.post.mock.calls.map(([one]) => one.id)).toEqual(['first', 'second'])
  await run.reply('allow', first)
  expect(run.decide).toHaveBeenCalledTimes(1)
  expect(run.notify).toHaveBeenLastCalledWith('This request is no longer pending.')
  await run.reply('refuse')
  expect(run.decide.mock.calls.map(([, id, choice]) => [id, choice])).toEqual([['first', 'allow'], ['second', 'refuse']])
})

it('claims a prompt synchronously against concurrent answers and preserves choice values', async () => {
  const run = fixture()
  run.update(decision('first', ['Proceed Once']), decision('second', ['Proceed Once']))
  await run.settle()
  const prompt = run.queue.prompt
  await Promise.all([run.reply('proceed once', prompt), run.reply('Proceed Once', prompt)])
  expect(run.decide).toHaveBeenCalledTimes(1)
  expect(run.decide.mock.calls[0]?.[2]).toBe('Proceed Once')
  expect(run.queue.prompt?.id).toBe('second')
})

it('does not accept a queued choice before its prompt is delivered or while another request is displayed', async () => {
  const run = fixture()
  run.update(decision('first', ['once']), decision('second', ['allow']))
  expect(await run.reply('allow')).toBe(true)
  await run.settle()
  expect(await run.reply('allow')).toBe(true)
  expect(run.decide).not.toHaveBeenCalled()
  expect(run.queue.prompt?.id).toBe('first')
  expect(await run.reply('ordinary message')).toBe(false)
})

it('recovers old shown-only requests and keeps confirmed pending prompts across restart', async () => {
  const run = fixture()
  run.store.set('decisions:thread', [{ id: 'first', values: ['allow'] }])
  run.update(decision('first'), decision('second'))
  await run.settle()
  expect(run.post).toHaveBeenCalledTimes(1)
  const restarted = run.make()
  restarted.refresh()
  await run.settle()
  expect(restarted.prompt?.id).toBe('first')
  expect(run.post).toHaveBeenCalledTimes(1)
  const independent = run.make('other')
  independent.refresh()
  await run.settle()
  expect(run.post).toHaveBeenCalledTimes(2)
})

it('retries failed posts on refresh and never records a missing delivery receipt', async () => {
  const run = fixture()
  run.post.mockRejectedValueOnce(new Error('Offline'))
  run.update(decision('first'))
  await run.settle()
  expect(run.queue.prompt).toBeUndefined()
  expect(run.store.has('approval:thread')).toBe(false)
  expect(run.failed).toHaveBeenCalledTimes(1)
  run.queue.refresh()
  await run.settle()
  expect(run.queue.prompt?.id).toBe('first')
  expect(run.post).toHaveBeenCalledTimes(2)
})

it('closes a request resolved during posting and advances to the current request', async () => {
  const run = fixture()
  let delivered: ((message: string) => void) | undefined
  run.post.mockImplementationOnce(() => new Promise((resolve) => { delivered = resolve }))
  run.update(decision('first'), decision('second'))
  await run.settle()
  run.update(decision('second'))
  delivered?.('message:first')
  await run.settle()
  expect(run.close).toHaveBeenCalledWith(expect.objectContaining({ id: 'first' }), 'This request is no longer pending.')
  expect(run.queue.prompt?.id).toBe('second')
})

it('reports a failed answer without advancing or claiming success, and permits retry', async () => {
  const run = fixture()
  run.update(decision('first'), decision('second'))
  await run.settle()
  run.decide.mockRejectedValueOnce(new Error('Not accepted'))
  await run.reply('allow')
  expect(run.close).not.toHaveBeenCalled()
  expect(run.queue.prompt?.id).toBe('first')
  expect(run.notify).toHaveBeenLastCalledWith('Could not record this answer. Try again.')
  await run.reply('refuse')
  expect(run.queue.prompt?.id).toBe('second')
})

it('reports the stale Manager outcome without success and does not replay an answered ID', async () => {
  const run = fixture()
  run.update(decision('first'), decision('second'))
  await run.settle()
  run.decide.mockResolvedValueOnce('This request is no longer pending. Use /status to see current requests.')
  await run.reply('allow')
  expect(run.close.mock.calls[0]?.[1]).toBe('This request is no longer pending.')
  run.update(decision('first'), decision('second'))
  await run.settle()
  expect(run.queue.prompt?.id).toBe('second')
  expect(run.post.mock.calls.map(([one]) => one.id)).toEqual(['first', 'second'])
})

it('removes old controls on history reset and rejects answers after authorization changes', async () => {
  const run = fixture()
  run.update(decision('first'))
  await run.settle()
  const prompt = run.queue.prompt
  run.inactive()
  await run.reply('allow', prompt)
  expect(run.decide).not.toHaveBeenCalled()
  run.queue.clear()
  await run.settle()
  expect(run.close).toHaveBeenCalledWith(prompt, 'This request is no longer pending.')
  expect(run.store.has('approval:thread')).toBe(false)
})

it('confirms an accepted answer even when editing its prompt fails', async () => {
  const run = fixture()
  run.update(decision('first'), decision('second'))
  await run.settle()
  run.close.mockRejectedValueOnce(new Error('Message deleted'))
  await run.reply('allow')
  expect(run.notify).toHaveBeenLastCalledWith('Person chose allow. Answer sent.')
  expect(run.queue.prompt?.id).toBe('second')
  expect(run.decide).toHaveBeenCalledTimes(1)
})

it('does not let a late answer from a cleared queue delete its replacement receipt', async () => {
  const run = fixture()
  run.update(decision('first'))
  await run.settle()
  let finish: ((outcome: 'Answer sent.') => void) | undefined
  run.decide.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const answering = run.reply('allow')
  await run.settle()
  run.queue.clear()
  const replacement = run.make()
  replacement.update([decision('replacement')])
  await run.settle()
  finish?.('Answer sent.')
  await answering
  await run.settle()
  expect(run.store.get('approval:thread')).toMatchObject({ id: 'replacement' })
})
