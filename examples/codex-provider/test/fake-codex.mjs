#!/usr/bin/env node
import { createInterface } from 'node:readline'
import { appendFileSync } from 'node:fs'
const id = 'test-native-thread'
const model = 'gpt-5.4'
const thread = { id, cwd: '/work', name: 'Test', createdAt: 1, updatedAt: 2, source: 'cli', preview: 'Fixture conversation', model, reasoningEffort: 'high', turns: [] }
const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`)
const event = (method, params) => send({ method, params: { threadId: id, ...params } })
for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line)
  if (process.env.GECKIT_TEST_RPC_LOG) appendFileSync(process.env.GECKIT_TEST_RPC_LOG, `${line}\n`)
  if (request.id === undefined) continue
  if (request.method === undefined) {
    if (request.id === 'approval') event('turn/completed', { turn: { id: 'turn', status: 'completed' } })
    continue
  }
  let result = {}
  switch (request.method) {
    case 'initialize': result = { userAgent: 'codex/1.2.3' }; break
    case 'account/read': result = { account: { type: 'chatgpt', planType: 'pro' } }; break
    case 'account/rateLimits/read': result = { rateLimits: { limitId: 'codex', limitName: null, primary: { usedPercent: 25, windowDurationMins: 300, resetsAt: 2000000000 }, secondary: null } }; break
    case 'model/list': result = { data: [{ model, displayName: 'Test GPT', description: 'Fake CLI fixture', hidden: false, isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'high', description: 'Thorough' }] }], nextCursor: null }; break
    case 'thread/list': result = { data: [thread], nextCursor: null }; break
    case 'thread/read': result = { thread }; break
    case 'thread/start': case 'thread/fork': case 'thread/resume': result = { thread, model, reasoningEffort: 'high' }; break
    case 'thread/goal/get': result = { goal: null }; break
    case 'thread/turns/list': result = { data: [], nextCursor: null }; break
    case 'turn/start': result = { turn: { id: 'turn', status: 'inProgress' } }; break
    case 'turn/steer': result = { turnId: 'turn' }; break
  }
  send({ id: request.id, result })
  if (request.method === 'turn/start') {
    event('turn/started', { turn: { id: 'turn', status: 'inProgress' } })
    event('item/agentMessage/delta', { itemId: 'answer', delta: 'Hello from copied code' })
    event('thread/tokenUsage/updated', { tokenUsage: { last: { inputTokens: 100, outputTokens: 20 }, modelContextWindow: 200000 } })
    if (request.params.input[0].text === 'wait for stop') continue
    send({ id: 'approval', method: 'item/commandExecution/requestApproval', params: { threadId: id, itemId: 'command', command: 'git status' } })
  }
  if (request.method === 'turn/interrupt') event('turn/completed', { turn: { id: 'turn', status: 'interrupted' } })
}
