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
  const instructions = []
  const provider = create({ codex: { account: () => { throw new Error('Builtin account must not be used') }, hold: () => { throw new Error('Builtin hold must not be used') }, setInstructions: async (...args) => instructions.push(args) } })
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
    driver.stop()
    for (let i = 0; i < 100 && !ended; i += 1) await setTimeout(10)
    assert.ok(signals.some((signal) => signal.kind === 'ended' && signal.how === 'stopped'))
    await driver.end()
    assert.ok(left)
    await provider.setInstructions(true, {})
    assert.deepEqual(instructions, [[true, {}]])
    modelOverrides.set('gpt-5.4', { contextWindow: 12345, pricing: { currency: 'USD', input: 0, output: 2 } })
    const custom = sourceCreate({ codex: { setInstructions: async () => {} } })
    try {
      assert.deepEqual((await custom.models())[0].pricing, { currency: 'USD', input: 0, output: 2 })
      assert.equal((await custom.limits(['gpt-5.4'])).windows.get('gpt-5.4'), 12345)
    } finally { custom.dispose(); modelOverrides.clear() }
    assert.equal(await provider.delete('/work', id), true)
    const log = await readFile(join(folder, 'rpc.jsonl'), 'utf8')
    assert.ok(log.includes('Fixture message'))
    assert.ok(!log.includes('plugin:codex-mirror:test-native-thread'), 'native RPC must not receive plugin IDs')
  } finally {
    provider.dispose()
    for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
    await rm(folder, { recursive: true, force: true })
  }
})
