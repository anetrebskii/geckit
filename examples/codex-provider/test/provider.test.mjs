import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, cp, chmod, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, delimiter } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { create } from '../index.mjs'
import { modelOverrides } from '../src/model-overrides.mjs'
import { create as sourceCreate } from '../src/provider.mjs'

test('built artifact uses its copied Codex CLI code for account, models, limits, sessions and streaming', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'geckit-codex-example-'))
  const before = { PATH: process.env.PATH, CODEX_HOME: process.env.CODEX_HOME, GECKIT_TEST_RPC_LOG: process.env.GECKIT_TEST_RPC_LOG }
  const logs = []
  const provider = create({ log: { write: (level, event, fields) => logs.push({ level, event, fields }) } })
  try {
    await cp(new URL('./fake-codex.mjs', import.meta.url), join(folder, 'codex'))
    await chmod(join(folder, 'codex'), 0o755)
    process.env.PATH = `${folder}${delimiter}${before.PATH}`
    process.env.CODEX_HOME = folder
    process.env.GECKIT_TEST_RPC_LOG = join(folder, 'rpc.jsonl')
    assert.equal((await provider.account()).provider, 'plugin:codex-mirror')
    assert.equal((await provider.program()).version, '1.2.3')
    assert.equal((await provider.models())[0].version, '5.4')
    assert.equal((await provider.limits([])).quotas[0].part, 0.25)
    const id = await provider.create({ root: '/work', mode: 'manual' })
    assert.equal(id, 'plugin:codex-mirror:test-native-thread')
    assert.equal((await provider.list(['/work']))[0].id, id)
    assert.equal((await provider.fork('/work', id, 1, 'manual')).id, id)
    assert.deepEqual((await provider.read('/work', id)).items, [])
    const signals = []
    const items = []
    let ended = false
    let left = false
    const driver = provider.hold({ id, root: '/work', resume: true, mode: 'manual' }, (heard) => {
      signals.push(...heard.signals); items.push(...heard.items)
      for (const signal of heard.signals) if (signal.kind === 'asks') driver.answer(signal.ask, 'once')
      if (heard.signals.some((signal) => signal.kind === 'ended')) ended = true
    }, () => { left = true })
    driver.send('Fixture message')
    for (let i = 0; i < 100 && !ended; i += 1) await setTimeout(10)
    assert.ok(ended, 'turn must complete')
    assert.ok(signals.some((signal) => signal.kind === 'started' && signal.session === id))
    assert.ok(signals.some((signal) => signal.kind === 'spend' && signal.window === 200000))
    assert.ok(items.some((item) => item.kind === 'theirs' && item.text === 'Hello from copied code'))
    assert.ok(signals.some((signal) => signal.kind === 'asks'))
    ended = false
    driver.send('wait for stop')
    await setTimeout(50)
    assert.equal(typeof driver.inject, 'function')
    await driver.inject('Focus on failing tests', [{ media: 'image/png', data: 'aW1hZ2U=' }], ['command output'])
    assert.equal(ended, false, 'injection must not complete the running turn')
    driver.stop()
    for (let i = 0; i < 100 && !ended; i += 1) await setTimeout(10)
    assert.ok(signals.some((signal) => signal.kind === 'ended' && signal.how === 'stopped'))
    await driver.end()
    assert.ok(left)
    await provider.setInstructions(true, {})
    assert.match(await readFile(join(folder, 'AGENTS.md'), 'utf8'), /GECKIT\.md for how GeckIt works/)
    await provider.setInstructions(false, {})
    assert.doesNotMatch(await readFile(join(folder, 'AGENTS.md'), 'utf8'), /GECKIT\.md/)
    modelOverrides.set('gpt-5.4', { contextWindow: 12345, pricing: { currency: 'USD', input: 0, output: 2 } })
    const custom = sourceCreate({ log: { write: (level, event, fields) => logs.push({ level, event, fields }) } })
    try {
      assert.deepEqual((await custom.models())[0].pricing, { currency: 'USD', input: 0, output: 2 })
      assert.equal((await custom.limits(['gpt-5.4'])).windows.get('gpt-5.4'), 12345)
    } finally { custom.dispose(); modelOverrides.clear() }
    assert.equal(await provider.delete('/work', id), true)
    const log = await readFile(join(folder, 'rpc.jsonl'), 'utf8')
    assert.ok(log.includes('Fixture message'))
    const steering = log.trim().split('\n').map((line) => JSON.parse(line)).find((request) => request.method === 'turn/steer')
    assert.equal(steering.params.threadId, 'test-native-thread')
    assert.equal(steering.params.expectedTurnId, 'turn')
    assert.equal(steering.params.input[0].text, 'command output\n\nFocus on failing tests')
    assert.equal(steering.params.input[1].url, 'data:image/png;base64,aW1hZ2U=')
    assert.ok(!log.includes('plugin:codex-mirror:test-native-thread'), 'native RPC must not receive plugin IDs')
    const requests = log.trim().split('\n').map((line) => JSON.parse(line)).filter((request) => request.method === 'account/rateLimits/read')
    assert.equal(logs.filter((one) => one.event === 'limits.backend.requested').length, requests.length)
    assert.equal(logs.filter((one) => one.event === 'limits.backend.completed').length, requests.length)
    for (const event of ['provider.created', 'session.started', 'session.turn.ended', 'message.inject.completed', 'session.closed']) assert(logs.some((one) => one.event === event), event)
    for (const privateText of ['Fixture message', 'Focus on failing tests', 'command output', 'aW1hZ2U=', 'Hello from copied code']) assert.equal(JSON.stringify(logs).includes(privateText), false, privateText)
  } finally {
    provider.dispose()
    for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
    await rm(folder, { recursive: true, force: true })
  }
})
