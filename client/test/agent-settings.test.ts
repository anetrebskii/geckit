import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { Settings } from '../src/shared/api'
import { AGENT_SETTING_RULES } from '../src/shared/agent-settings'
import { agentSettings, settingsCommand } from '../src/main/agent-settings'

function fixture() {
  let current: Settings = { ...DEFAULT_SETTINGS, projects: ['/project'], chatProviders: ['codex'], chatProvider: 'codex', vpnIpCheck: false, browserNames: { first: 'Work' }, guidePlugins: { 'plugin:a': false } }
  const save = vi.fn((change: Partial<Settings>) => current = { ...current, ...change })
  const command = (...args: string[]): string => settingsCommand(args, () => current, save)
  return { command, save, read: () => current }
}

describe('agent preference contract', () => {
  it('shares schema, excludes secrets, applies partial updates, merges maps and compares expected values', () => {
    const f = fixture()
    expect(JSON.parse(f.command('schema')).fields).toEqual(AGENT_SETTING_RULES)
    const shown = agentSettings(f.read())
    expect(shown).not.toHaveProperty('phoneKey')
    expect(shown).not.toHaveProperty('channels')
    expect(shown).toMatchObject({ projects: ['/project'], chatProviders: ['codex'] })
    expect(JSON.parse(f.command('edit', '--patch', JSON.stringify({ theme: 'dark', workingAtOnce: 2, browserNames: { second: 'Personal' } }), '--expected', JSON.stringify({ theme: shown.theme })))).toMatchObject({ saved: true, settings: { theme: 'dark', browserNames: { first: 'Work', second: 'Personal' } } })
    expect(f.read().chatProviders).toEqual(['codex'])
    expect(() => f.command('edit', '--patch', '{"theme":"light"}', '--expected', '{"theme":"system"}')).toThrow('changed')
    expect(f.read().theme).toBe('dark')
    expect(f.save).toHaveBeenCalledTimes(1)
    f.command('edit', '--patch', '{"phrases":["Hello"],"guidePlugins":{"plugin:b":true}}')
    expect(f.read()).toMatchObject({ phrases: ['Hello'], guidePlugins: { 'plugin:a': false, 'plugin:b': true } })
    f.command('edit', '--patch', '{"openWith":[{"kinds":"ts","app":"/Applications/Editor.app"}],"anywhereOff":["correct","search"]}')
    expect(f.read()).toMatchObject({ openWith: [{ kinds: 'ts', app: '/Applications/Editor.app' }], anywhereOff: ['correct', 'search'] })
  })

  it.each([
    'null', '[]', '{}', 'oops', '{"theme":"blue"}', '{"workingAtOnce":-1}', '{"workingAtOnce":1.5}',
    '{"workingAtOnce":1e100}', '{"phone":"yes"}', '{"chatProvider":"claude"}', '{"chatProviders":["claude"]}',
    '{"phoneKey":"secret"}', '{"channels":[]}', '{"hosts":[]}', '{"projects":["/other"]}',
    '{"providerPlugins":[]}', '{"shortcuts":[]}', '{"managerAvatar":"employee-99"}',
    '{"chatProjects":["/other"]}', '{"profile":"missing"}', '{"projectColors":{"/project":8}}',
    '{"providerModels":[{"provider":"claude","model":"x"}]}', '{"browserNames":{"x":false}}',
    '{"guidePlugins":{"x":"true"}}', '{"anywhereOff":["missing"]}', '{"boardColumns":["review"]}',
    '{"profiles":[{"id":"x","name":"X","projects":["/other"]}]}', '{"vpnAllowedIps":["wrong"]}',
    '{"theme":"dark","workingAtOnce":-1}', '{"openWith":[{"kinds":"ts","app":42}]}', '{"browserNames":{"__proto__":"bad"}}',
  ])('rejects invalid or privileged patch atomically: %s', (text) => {
    const f = fixture()
    const before = f.read()
    expect(() => f.command('edit', '--patch', text)).toThrow()
    expect(f.read()).toEqual(before)
    expect(f.save).not.toHaveBeenCalled()
  })

  it('validates dependencies together and rejects malformed flags before saving', () => {
    const f = fixture()
    expect(() => f.command('edit', '--patch', '{"vpnIpCheck":true}')).toThrow()
    f.command('edit', '--patch', '{"vpnIpCheck":true,"vpnAllowedIps":["1.2.3.4"]}')
    f.command('edit', '--patch', '{"profiles":[{"id":"p","name":"P","projects":["/project"]}],"profile":"p"}')
    expect(() => f.command('edit', '--patch', '{"profiles":[]}')).toThrow('selected profile')
    f.command('edit', '--patch', '{"profiles":[],"profile":""}')
    expect(() => f.command('edit', '--patch', '{"theme":"dark"}', '--patch', '{"theme":"light"}')).toThrow('once')
    expect(() => f.command('show', '--patch', '{}')).toThrow('Use settings')
    expect(() => f.command('edit', '--patch', '{"theme":"dark"}', '--expected', 'null')).toThrow('--expected')
  })
})
