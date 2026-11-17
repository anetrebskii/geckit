import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { Channels, type ChannelsDeps } from '../src/main/channels/channels'
import type { ChannelShortcutPublication } from '../src/main/channels/channel-api'
import { DEFAULT_SETTINGS, type Settings } from '../src/shared/api'
import type { ShortcutDestinationReceipt } from '../src/shared/shortcut-destinations'

it('generic hub validates available destinations, scoped binding, receipts and current module generation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'geckit-shortcut-hub-'))
  const info = { id: 'channel:fixture' as const, name: 'Fixture', icon: 'chat', capabilities: ['manager'] as const, fields: [] }
  const legacy = { ...info, id: 'channel:legacy' as const, name: 'Legacy' }
  const setting = { info, enabled: true, projects: [], manager: true, config: {} }
  let settings: Settings = { ...DEFAULT_SETTINGS, channels: [setting, { ...setting, info: legacy }] }
  let retained: ChannelShortcutPublication['bind'] | undefined
  let onResponse: Parameters<ChannelsDeps['manager']['onResponse']>[0] | undefined
  const answers: string[] = []
  let boundKey: string | undefined
  let calls = 0
  let mismatch = false
  let externalRefusal = false
  let pauseDiscovery = false
  let releaseDiscovery: (() => void) | undefined
  const deps: ChannelsDeps = {
    directory, registry: { loaded: [], failures: [] },
    vault: { available: () => true, encrypt: (text) => Buffer.from(text), decrypt: (bytes) => bytes.toString() },
    settings: () => settings, save: (change) => { settings = { ...settings, ...change } },
    sessions: { send: async () => 'unused', answer: async () => false, stop: () => undefined, items: async () => [] },
    conversations: () => [], labelConversation: () => undefined,
    manager: { enabled: () => true, send: async () => 'unused', thread: () => 'unused', label: () => undefined, threadOf: () => undefined, threadRecord: (thread) => thread === 'original-manager-run' && boundKey !== undefined ? { channel: info.id, key: boundKey } : undefined, close: () => undefined, onResponse: (listener) => { onResponse = listener; return () => { onResponse = undefined } }, inspect: async (id) => ({ id, items: [] }), answer: async () => ({ answer: 'Answer sent.' }), answerCard: async () => false },
    managerView: () => undefined, employees: () => [], projectName: (root) => root, subscribe: () => () => undefined, changed: () => undefined,
    builtIns: [{ info, path: 'built-in', module: { create: (context) => ({
      start: async () => { context.status('connected') }, stop: async () => undefined,
      destinations: async () => { if (pauseDiscovery) await new Promise<void>((resolve) => { releaseDiscovery = resolve }); return [{ id: 'place', name: 'Native place', model: 'thread' }] },
      publishShortcut: async (input): Promise<ShortcutDestinationReceipt> => { calls++; if (externalRefusal) throw Object.assign(new Error('Library refused'), { uncertain: false }); retained = input.bind; const thread = input.bind({ key: 'native-thread' }); context.conversations.watch(thread, (event) => { if (event.kind === 'answer') answers.push(event.text) }); return { destination: mismatch ? 'wrong' : input.destination, thread: 'native-thread' } },
    }) } }, { info: legacy, path: 'built-in', module: { create: (context) => ({ start: async () => { context.status('connected') }, stop: async () => undefined }) } }],
  }
  const channels = new Channels(deps)
  try {
    await channels.start()
    const discovered = await channels.shortcutDestinations()
    expect(discovered.find((one) => one.id === info.id)).toMatchObject({ supported: true, destinations: [{ id: 'place' }] })
    expect(discovered.find((one) => one.id === legacy.id)).toEqual({ id: legacy.id, name: legacy.name, supported: false, destinations: [] })
    const input = { runId: 'run-one', text: 'Result', bind: (place: Parameters<ChannelShortcutPublication['bind']>[0]) => { boundKey = place.key; return 'original-manager-run' } }
    await expect(channels.publishShortcut({ channel: info.id, destination: 'missing' }, input)).rejects.toMatchObject({ uncertain: false })
    expect(calls).toBe(0)
    await expect(channels.publishShortcut({ channel: info.id, destination: 'place' }, input)).resolves.toEqual({ destination: 'place', thread: 'native-thread' })
    onResponse?.('Continuation answer', { thread: 'original-manager-run', session: 'original-context', workers: [] })
    expect(answers).toEqual(['Continuation answer'])
    onResponse?.('Other run answer', { thread: 'other-manager-run', session: 'other-context', workers: [] })
    expect(answers).toEqual(['Continuation answer'])
    expect(() => retained?.({ key: 'other-thread' })).toThrow('binding is invalid')
    externalRefusal = true
    await expect(channels.publishShortcut({ channel: info.id, destination: 'place' }, input)).rejects.toMatchObject({ uncertain: false, message: 'Library refused' })
    externalRefusal = false
    mismatch = true
    await expect(channels.publishShortcut({ channel: info.id, destination: 'place' }, input)).rejects.toMatchObject({ uncertain: true })
    pauseDiscovery = true
    const discovering = channels.shortcutDestinations()
    await channels.configure(info.id, { enabled: false })
    releaseDiscovery?.()
    expect((await discovering).find((one) => one.id === info.id)).toMatchObject({ destinations: [], error: 'Channel connection changed.' })
    expect((await channels.shortcutDestinations()).find((one) => one.id === info.id)).toBeUndefined()
    await expect(channels.publishShortcut({ channel: info.id, destination: 'place' }, input)).rejects.toMatchObject({ uncertain: false })
    expect(() => retained?.({ key: 'stale-thread' })).toThrow('unavailable')
  } finally { await channels.dispose(); await rm(directory, { recursive: true, force: true }) }
})
