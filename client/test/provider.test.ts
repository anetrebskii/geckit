import { describe, expect, it } from 'vitest'

import { llmProvider } from '../src/main/sessions/provider'
import type { LlmProvider } from '../src/main/sessions/provider'
import type { Driver } from '../src/main/sessions/heard'
import { LLM_PROVIDERS } from '../src/shared/providers'

const driver: Driver = {
  send: () => undefined,
  answer: () => undefined,
  stop: () => undefined,
  end: async () => undefined,
}

describe('LLM providers', () => {
  it('provides metadata and capabilities for all three implementations', () => {
    const stream = llmProvider({}, 'claude')
    const tmux = { ...llmProvider({}, 'claude'), id: 'claude-tmux', name: 'Claude Code (tmux)', transport: 'tmux', localOnly: true, images: false, remoteControl: false, idleMs: 120_000 }
    const codex = llmProvider({}, 'codex')

    expect([stream.id, codex.id]).toEqual(LLM_PROVIDERS.map((one) => one.id))
    expect(stream).toMatchObject({ name: 'Claude Code', icon: 'claude', browser: 'claude', images: true, remoteControl: true, localOnly: false })
    expect(tmux).toMatchObject({ name: 'Claude Code (tmux)', icon: 'claude', browser: 'claude', images: false, remoteControl: false, localOnly: true, idleMs: 120_000 })
    expect(codex).toMatchObject({ name: 'Codex', icon: 'codex', browser: 'codex', images: true, nativeGoals: true, localOnly: true })
  })

  it('routes a Claude conversation to the selected live transport while sharing its storage', async () => {
    const called: string[] = []
    const deps = {
      claude: () => { called.push('stream'); return driver },
      disk: {
        list: async () => [],
        read: async () => undefined,
        has: async () => true,
      },
    }
    const stream = llmProvider(deps, 'claude')
    const tmux: LlmProvider = { ...stream, hold: () => { called.push('tmux'); return driver } }
    const id = await stream.create({ root: '/work', mode: 'manual' })
    expect(await tmux.has('/work', id)).toBe(true)
    stream.hold({ id, root: '/work', resume: true, mode: 'manual' }, () => undefined, () => undefined)
    tmux.hold({ id, root: '/work', resume: true, mode: 'manual' }, () => undefined, () => undefined)
    expect(called).toEqual(['stream', 'tmux'])
  })

  it('lists browsers through the same provider method', async () => {
    const claude = llmProvider({ browsers: async () => [{ id: 'chrome-1', name: 'Work', current: true }] }, 'claude')
    expect(await claude.browsers('/work')).toEqual([{ id: 'chrome-1', name: 'Work', current: true }])
  })
})
