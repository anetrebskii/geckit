import assert from 'node:assert/strict'
import { test } from 'node:test'

import { containsSecret, create } from '../index.mjs'

class FakeSocket {
  static last
  constructor(url) { this.url = url; this.sent = []; this.listeners = {}; FakeSocket.last = this }
  addEventListener(name, listener) { this.listeners[name] = listener }
  send(text) { this.sent.push(JSON.parse(text)) }
  close() {}
  emit(envelope) { this.listeners.message({ data: JSON.stringify(envelope) }) }
}

function harness({ manager } = {}) {
  const posted = []
  const started = []
  const sent = []
  const answered = []
  const watchers = new Map()
  const store = new Map()
  const statuses = []
  const context = {
    id: 'channel:slack',
    log: { path: '', write: () => undefined },
    config: () => ({ allow: ['U1'], folder: '', checkSecrets: true }),
    secret: (key) => ({ botToken: 'xoxb-test', appToken: 'xapp-test' })[key],
    store: { get: (key) => store.get(key), set: (key, value) => value === undefined ? store.delete(key) : store.set(key, value) },
    status: (state, says) => statuses.push([state, says]),
    projects: () => [{ root: '/work/app', name: 'app' }],
    providers: () => ['claude'],
    employees: () => [],
    conversations: {
      manager: () => manager,
      start: async (request) => { started.push(request); return 'conversation-1' },
      send: async (id, message) => { sent.push([id, message]) },
      get: (id) => id === 'conversation-1' ? { id } : undefined,
      list: () => [],
      items: async () => [],
      watch: (id, listener) => { watchers.set(id, listener); return () => watchers.delete(id) },
      answer: async (id, card, answer) => { answered.push([id, card, answer]); return true },
      stop: async () => undefined,
    },
  }
  const fetch = async (url, init) => {
    const method = url.split('/').at(-1)
    if (method === 'chat.postMessage') posted.push(JSON.parse(init.body))
    return { json: async () => method === 'apps.connections.open' ? { ok: true, url: 'wss://example' } : { ok: true } }
  }
  const channel = create(context, { fetch, WebSocket: FakeSocket })
  const event = (body) => FakeSocket.last.emit({ type: 'events_api', envelope_id: 'e1', payload: { event: body } })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))
  return { channel, event, settle, posted, started, sent, answered, watchers, statuses }
}

test('spots tokens and keys', () => {
  assert.equal(containsSecret('use xoxb-1234567890-abcdef please'), true)
  assert.equal(containsSecret('deploy the app'), false)
})

test('answers only allowed people and refuses secrets before anything reaches GeckIt', async () => {
  const run = harness()
  await run.channel.start()
  FakeSocket.last.emit({ type: 'hello' })
  assert.deepEqual(run.statuses.at(-1), ['connected', 'Listening'])
  run.event({ type: 'app_mention', user: 'U9', channel: 'C1', ts: '1.0', text: '<@B1> fix it' })
  run.event({ type: 'app_mention', user: 'U1', channel: 'C1', ts: '2.0', text: '<@B1> token xoxb-1234567890-abcdef' })
  await run.settle()
  assert.equal(run.started.length, 0)
  assert.match(run.posted[0].text, /not on the list/)
  assert.match(run.posted[1].text, /token or key/)
  assert.deepEqual(FakeSocket.last.sent, [{ envelope_id: 'e1' }, { envelope_id: 'e1' }])
})

test('a mention starts a Claude conversation per thread, posts the answer and takes a card answer', async () => {
  const run = harness()
  await run.channel.start()
  run.event({ type: 'app_mention', user: 'U1', channel: 'C1', ts: '3.0', text: '<@B1> fix the build' })
  await run.settle()
  assert.deepEqual(run.started, [{ root: '/work/app', text: 'fix the build', provider: 'claude' }])
  const listen = run.watchers.get('conversation-1')
  listen({ kind: 'items', items: [{ kind: 'card', id: 'card:1', card: { title: 'Wants to run a command', detail: 'npm test' } }], gone: [] })
  await run.settle()
  assert.match(run.posted.at(-1).text, /allow always/)
  run.event({ type: 'app_mention', user: 'U1', channel: 'C1', ts: '3.1', thread_ts: '3.0', text: '<@B1> allow' })
  await run.settle()
  assert.deepEqual(run.answered, [['conversation-1', 'card:1', 'once']])
  listen({ kind: 'items', items: [{ kind: 'theirs', id: 'a', text: 'Fixed.', phase: 'final_answer' }], gone: [] })
  listen({ kind: 'state', conversation: { id: 'conversation-1', state: 'idle' } })
  await run.settle()
  assert.deepEqual(run.posted.at(-1), { channel: 'C1', thread_ts: '3.0', text: 'Fixed.' })
  run.event({ type: 'app_mention', user: 'U1', channel: 'C1', ts: '3.2', thread_ts: '3.0', text: '<@B1> and the tests' })
  await run.settle()
  assert.deepEqual(run.sent, [['conversation-1', { text: 'and the tests' }]])
})

test('a direct message goes to Manager when GeckIt allows it', async () => {
  const closed = harness()
  await closed.channel.start()
  closed.event({ type: 'message', channel_type: 'im', user: 'U1', channel: 'D1', ts: '4.0', text: 'plan the week' })
  await closed.settle()
  assert.match(closed.posted.at(-1).text, /Manager is not available/)
  const open = harness({ manager: 'manager-1' })
  await open.channel.start()
  open.event({ type: 'message', channel_type: 'im', user: 'U1', channel: 'D1', ts: '4.0', text: 'plan the week' })
  await open.settle()
  assert.deepEqual(open.sent, [['manager-1', { text: 'plan the week', from: 'U1' }]])
})
