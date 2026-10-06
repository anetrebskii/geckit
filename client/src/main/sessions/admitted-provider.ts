import type { AgentAdmission } from '../vpn/admission'
import type { LlmProvider } from './provider'

export function admittedProvider(provider: LlmProvider, admit: AgentAdmission = () => undefined, plugin = false): LlmProvider {
  return {
    ...provider,
    account: () => { admit(); return provider.account() },
    program: () => { admit(); return provider.program() },
    models: (root) => { admit(root); return provider.models(root) },
    limits: (models) => { admit(); return provider.limits(models) },
    create: (options) => { admit(options.root); return provider.create(options) },
    fork: (root, ...args) => { admit(root); return provider.fork(root, ...args) },
    hold: (options, ...args) => { admit(options.root); return provider.hold(options, ...args) },
    setGoal: (...args) => { admit(); return provider.setGoal(...args) },
    clearGoal: (...args) => { admit(); return provider.clearGoal(...args) },
    remote: (...args) => { admit(); return provider.remote(...args) },
    mcp: (root, ...args) => { admit(root); return provider.mcp(root, ...args) },
    browsers: (root, ...args) => { admit(root); return provider.browsers(root, ...args) },
    correct: (...args) => { admit(); return provider.correct(...args) },
    setInstructions: (...args) => { if (plugin) admit(); return provider.setInstructions(...args) },
    list: (...args) => { if (plugin) admit(); return provider.list(...args) },
    search: (...args) => { if (plugin) admit(); return provider.search(...args) },
    hidden: (...args) => { if (plugin) admit(); return provider.hidden(...args) },
    has: (root, ...args) => { if (plugin) admit(root); return provider.has(root, ...args) },
    read: (root, ...args) => { if (plugin) admit(root); return provider.read(root, ...args) },
    links: (root, ...args) => { if (plugin) admit(root); return provider.links(root, ...args) },
    goal: (root, ...args) => { if (plugin) admit(root); return provider.goal(root, ...args) },
    rename: (...args) => { if (plugin || args[2] !== undefined) admit(); return provider.rename(...args) },
    delete: (root, ...args) => { if (plugin) admit(root); return provider.delete(root, ...args) },
  }
}
