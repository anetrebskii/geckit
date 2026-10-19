import { describe, expect, it, vi } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { DEFAULT_SETTINGS } from '../src/shared/api'
import type { ChatSession } from '../src/shared/api'
import { DEFAULT_MANAGER_CONFIG } from '../src/shared/manager'
import type { ManagerView } from '../src/shared/manager'
import { managerAssistant, managerLabel } from '../src/renderer/src/chat/manager-label'

const worker: ChatSession = { id: 'codex:worker', root: '/work/project', title: 'Add provider preferences', stands: 'Working', state: 'working', at: 1, here: true, mode: 'auto' }
const ready: ManagerView = { queued: 0, config: { ...DEFAULT_MANAGER_CONFIG, enabled: true }, state: 'idle', workers: [], activity: [], providers: [{ provider: 'claude', available: true }], decisions: [] }

describe('Manager navigation state', () => {
  it('uses the actual backing assistant while a different saved provider awaits replacement', () => {
    const configured: ManagerView = { ...ready, config: { ...ready.config, provider: 'plugin:library' } }
    expect(managerAssistant(configured)).toBe('plugin:library')
    expect(managerAssistant({ ...configured, session: { ...worker, id: 'claude-backing', manager: true } })).toBe('claude')
    expect(managerAssistant({ ...configured, session: { ...worker, id: 'codex:backing', manager: true } })).toBe('codex')
    expect(managerAssistant({ ...configured, session: { ...worker, id: 'plugin:library:backing', manager: true } })).toBe('plugin:library')
  })

  it('keeps the needed user action ahead of ordinary worker progress', () => {
    expect(managerLabel({ ...ready, workers: [worker] })).toBe('Workers are working')
    expect(managerLabel({ ...ready, workers: [worker], decisions: [{ id: 'approval', title: 'Start worker?', choices: [{ label: 'Start', value: 'allow' }] }] })).toBe('Needs your answer')
    expect(managerLabel({ ...ready, workers: [{ ...worker, state: 'asks' }] })).toBe('Needs your answer')
  })

  it('gives lifecycle recovery precedence while retaining pending questions', () => {
    const asking: ManagerView = { ...ready, workers: [{ ...worker, state: 'asks' }] }
    expect(managerLabel({ ...asking, state: 'paused' })).toBe('Manager paused')
    expect(managerLabel({ ...asking, state: 'blocked' })).toBe('Manager unavailable')
    expect(managerLabel({ ...asking, state: 'working' })).toBe('Needs your answer')
    expect(managerLabel({ ...ready, state: 'working' })).toBe('Coordinating')
  })

  it('distinguishes preserved disabled history from first setup', () => {
    expect(managerLabel(undefined)).toBe('Set up Manager')
    expect(managerLabel({ ...ready, config: DEFAULT_MANAGER_CONFIG, state: 'off' })).toBe('Set up Manager')
    expect(managerLabel({ ...ready, config: DEFAULT_MANAGER_CONFIG, state: 'off', session: { ...worker, manager: true } })).toBe('Manager disabled')
  })
})

vi.stubGlobal('window', { geckit: { platform: 'darwin' } })
vi.stubGlobal('document', { documentElement: { classList: { contains: () => false } } })
const { originFor } = await import('../src/renderer/src/chat/Request')
const managerHook = await import('../src/renderer/src/chat/useManager')
const { ManagerSettings } = await import('../src/renderer/src/chat/Manager')

describe('Manager assistant availability', () => {
  it('keeps configuration and lifecycle in Settings without a chat or task dashboard', () => {
    const hook = vi.spyOn(managerHook, 'useManager').mockReturnValue({ ...ready, session: { ...worker, manager: true }, workers: [worker], decisions: [{ id: 'decision', title: 'Internal decision', choices: [{ label: 'Answer', value: 'answer' }] }] })
    const markup = renderToStaticMarkup(createElement(ManagerSettings, { settings: DEFAULT_SETTINGS }))
    expect(markup).toContain('Manage GeckIt from Telegram.')
    expect(markup).toContain('Pause</button>')
    expect(markup).toContain('Restart session</button>')
    expect(markup).toContain('Disable Manager</button>')
    expect(markup).toContain('Current assistant')
    expect(markup).not.toContain('Open manager')
    expect(markup).not.toContain('Session info')
    expect(markup).not.toContain('Internal decision')
    expect(markup).not.toContain('manager-composer')
    expect(markup).not.toContain(worker.title)
    hook.mockRestore()
  })

  it('keeps enabled Codex and library providers selectable without substituting the saved assistant', () => {
    const settings = { ...DEFAULT_SETTINGS, providerPlugins: [{ id: 'plugin:library', family: 'plugin:library', name: 'Library assistant', shortName: 'Library', icon: 'terminal', browser: 'none', loginCommand: '', planName: '' } satisfies (typeof DEFAULT_SETTINGS.providerPlugins)[number]] }
    for (const provider of ['codex', 'plugin:library'] as const) {
      const hook = vi.spyOn(managerHook, 'useManager').mockReturnValue({ ...ready, config: { ...ready.config, provider }, providers: [{ provider, available: true }] })
      const markup = renderToStaticMarkup(createElement(ManagerSettings, { settings }))
      expect(markup).toContain(provider === 'codex' ? 'Codex' : 'Library assistant')
      expect(markup).toContain('class="primary">Save changes</button>')
      hook.mockRestore()
    }
  })

  it('blocks saving an empty enabled list and a disabled saved selection with explicit recovery', () => {
    const hook = vi.spyOn(managerHook, 'useManager').mockReturnValue({ ...ready, providers: [] })
    const empty = renderToStaticMarkup(createElement(ManagerSettings, { settings: DEFAULT_SETTINGS }))
    expect(empty).toContain('Enable an assistant in Assistants to set up Manager.')
    expect(empty).toContain('class="primary" disabled="">Save changes</button>')
    hook.mockReturnValue({ ...ready, providers: [{ provider: 'codex', available: true }] })
    const disabled = renderToStaticMarkup(createElement(ManagerSettings, { settings: DEFAULT_SETTINGS }))
    expect(disabled).toContain('This assistant is disabled. Choose an enabled assistant or restore it in Assistants.')
    expect(disabled).toContain('Claude Code')
    expect(disabled).toContain('class="primary" disabled="">Save changes</button>')
    hook.mockRestore()
  })
})

describe('Manager guided setup', () => {
  const fresh: ManagerView = { ...ready, config: DEFAULT_MANAGER_CONFIG, state: 'off' }

  it('keeps every later step locked behind the one before it', () => {
    const hook = vi.spyOn(managerHook, 'useManager').mockReturnValue(fresh)
    const markup = renderToStaticMarkup(createElement(ManagerSettings, { settings: DEFAULT_SETTINGS }))
    expect(markup).toContain('The assistant you pick here is the one that runs it.')
    expect(markup).toContain('Loading models...')
    expect(markup).toContain('class="primary" disabled="">Continue</button>')
    expect(markup).toContain('Decide how work starts first.')
    expect(markup).toContain('Connect Telegram first.')
    expect(markup).not.toContain('Enable Manager')
    expect(markup).not.toContain('Delegation policy')
    hook.mockRestore()
  })

  it('cannot be finished while Telegram is unconnected, and keeps lifecycle once it is on', () => {
    const hook = vi.spyOn(managerHook, 'useManager').mockReturnValue({ ...ready, session: { ...worker, id: 'claude-backing', manager: true } })
    const markup = renderToStaticMarkup(createElement(ManagerSettings, { settings: DEFAULT_SETTINGS }))
    expect(markup).toContain('Connect Telegram')
    expect(markup).toContain('Manager is on')
    expect(markup).toContain('All projects, current and future, across every profile.')
    expect(markup).not.toContain('Connect Telegram first.')
    hook.mockRestore()
  })
})

describe('Manager worker origin', () => {
  const backing: ChatSession = { ...worker, id: 'claude-manager-backing-1', manager: true, title: 'Manager' }

  it('never links managed workers to a current or archived Manager backing session', () => {
    expect(originFor({ sessions: [backing, worker] }, { ...worker, parent: backing.id, managerManaged: true })).toBeUndefined()
    expect(originFor({ sessions: [backing, worker] }, { ...worker, parent: backing.id })).toBeUndefined()
    expect(originFor({ sessions: [worker] }, { ...worker, parent: 'manager', managerManaged: true })).toBeUndefined()
  })

  it('preserves ordinary parent navigation and managed workers as normal parent sessions', () => {
    const ordinary: ChatSession = { ...worker, id: 'ordinary-parent', title: 'Ordinary task' }
    expect(originFor({ sessions: [ordinary] }, { ...worker, parent: ordinary.id })).toBe(ordinary)
    const managed: ChatSession = { ...ordinary, managerManaged: true }
    expect(originFor({ sessions: [managed] }, { ...worker, parent: managed.id })).toBe(managed)
    expect(originFor({ sessions: [] }, { ...worker, parent: 'missing-parent' })).toBeUndefined()
  })
})
