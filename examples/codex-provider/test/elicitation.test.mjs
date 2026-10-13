import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { test } from 'node:test'
import { CodexSessions } from '../src/codex-runtime.mjs'

test('exported Codex runtime forwards MCP choices and preserves usage logging', async () => {
  const server = new EventEmitter()
  server.stdout = new PassThrough()
  server.stderr = new PassThrough()
  server.kill = () => { server.emit('close'); return true }
  const requests = []
  const write = (message) => server.stdout.write(`${JSON.stringify(message)}\n`)
  server.stdin = new Writable({ write(chunk, _encoding, done) {
    const request = JSON.parse(chunk.toString())
    requests.push(request)
    if (request.method !== undefined && request.id !== undefined) {
      const result = request.method === 'initialize' ? { userAgent: 'codex/0.159.3' } : request.method === 'account/read' ? { account: { type: 'chatgpt', planType: 'pro' } } : request.method === 'account/rateLimits/read' ? { rateLimits: { limitId: 'codex', primary: null, secondary: null } } : request.method === 'thread/start' || request.method === 'thread/resume' ? { thread: { id: 'thread' }, model: 'model' } : request.method === 'model/list' ? { data: [], nextCursor: null } : request.method === 'turn/start' ? { turn: { id: 'turn' } } : {}
      write({ id: request.id, result })
      if (request.method === 'turn/start') write({ method: 'turn/started', params: { threadId: 'thread', turn: { id: 'turn', status: 'inProgress' } } })
    }
    done()
  } })
  const logged = []
  const runtime = new CodexSessions(() => server, undefined, (_level, event) => logged.push(event))
  try {
    await runtime.account()
    assert(logged.includes('limits.backend.completed'))
    const id = await runtime.create('/work', 'auto')
    const signals = []
    const driver = runtime.hold({ id, root: '/work', resume: true, mode: 'auto' }, (heard) => signals.push(...heard.signals), () => {})
    driver.send('Review the app')
    await new Promise((resolve) => setImmediate(resolve))
    for (const [requestId, action] of [['accept', 'accept'], ['decline', 'decline'], ['cancel', 'cancel']]) {
      write({ id: requestId, method: 'mcpServer/elicitation/request', params: { threadId: 'thread', turnId: null, serverName: 'computer', mode: 'openai/form', message: 'Allow access?', requestedSchema: { type: 'object', properties: {} }, _meta: null } })
      assert(signals.some((one) => one.kind === 'asks' && one.ask === requestId && one.wanted.kind === 'elicitation'))
      assert(!requests.some((one) => one.id === requestId && one.result !== undefined))
      driver.answer(requestId, JSON.stringify({ action, content: {} }))
      assert.deepEqual(requests.find((one) => one.id === requestId && one.result !== undefined)?.result, { action, content: action === 'accept' ? {} : null, _meta: null })
    }
    await driver.end()
  } finally { runtime.dispose() }
})
