import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { acquireTestLock, browserConversation, conversationTestName, projectTestName, registerBrowserConversation, registerProjectBrowserConversation, TestTabOwners } from '../src/cli/browser-lifecycle'

const folders: string[] = []
const temporary = (): string => { const folder = mkdtempSync(join(tmpdir(), 'geckit-browser-policy-')); folders.push(folder, `${folder}-state`); return folder }
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })

describe('project test browser policy', () => {
  it('registers the closest project folder rather than the conversation working subdirectory', () => {
    const folder = temporary()
    registerProjectBrowserConversation({ id: 'a', root: '/shop/client/tmp' }, ['/shop', '/shop/client'], folder)
    expect(browserConversation('a', folder)?.root).toBe('/shop/client')
    registerProjectBrowserConversation({ id: 'unknown', root: '/elsewhere' }, ['/shop'], folder)
    expect(browserConversation('unknown', folder)).toBeUndefined()
  })
  it('uses the registered project for every conversation and separates roots with identical basenames', () => {
    const folder = temporary()
    registerBrowserConversation('a', '/one/shop', false, folder)
    registerBrowserConversation('b', '/one/shop', false, folder)
    registerBrowserConversation('c', '/two/shop', false, folder)
    expect(conversationTestName('a', folder)).toBe(conversationTestName('b', folder))
    expect(conversationTestName('a', folder)).not.toBe(conversationTestName('c', folder))
    expect(conversationTestName('a', folder, 'invented-session-name')).toBe(projectTestName('/one/shop'))
    expect(() => conversationTestName('unregistered', folder)).toThrow('not registered')
  })

  it('finds a plugin conversation by the bare session or Codex thread its CLI knows', () => {
    const folder = temporary()
    registerProjectBrowserConversation({ id: 'plugin:claude-tmux:8a73', root: '/skills', status: 'todo' }, ['/skills'], folder)
    registerBrowserConversation('plugin:codex-tmux:t1', '/shop', false, folder)
    expect(browserConversation('8a73', folder)?.id).toBe('plugin:claude-tmux:8a73')
    expect(conversationTestName('8a73', folder)).toBe(projectTestName('/skills'))
    expect(browserConversation('codex:t1', folder)?.root).toBe('/shop')
    expect(browserConversation('plugin:other:8a73', folder)).toBeUndefined()
    registerBrowserConversation('plugin:claude-tmux:8a73', '/skills', true, folder)
    expect(() => conversationTestName('8a73', folder)).toThrow('Done')
    registerBrowserConversation('8a73', '/native', false, folder)
    expect(browserConversation('8a73', folder)?.root).toBe('/native')
  })

  it('canonicalizes symlinked folders so one physical project keeps one persistent profile', () => {
    const folder = temporary()
    mkdirSync(join(folder, 'project'))
    symlinkSync(join(folder, 'project'), join(folder, 'alias'))
    expect(projectTestName(join(folder, 'project'))).toBe(projectTestName(join(folder, 'alias')))
  })

  it('allows separate accounts only through the explicit project configuration', () => {
    const folder = temporary()
    registerBrowserConversation('a', '/shop', false, folder)
    writeFileSync(join(`${folder}-state`, 'test-project-profiles.json'), JSON.stringify({ '/shop': ['customer', 'merchant'] }))
    expect(conversationTestName('a', folder)).toBe(projectTestName('/shop'))
    expect(conversationTestName('a', folder, 'customer')).toBe('customer')
    expect(conversationTestName('a', folder, 'merchant')).toBe('merchant')
    expect(conversationTestName('a', folder, 'invented')).toBe(projectTestName('/shop'))
    writeFileSync(join(`${folder}-state`, 'test-project-profiles.json'), JSON.stringify({ '/shop': 'customer' }))
    expect(conversationTestName('a', folder)).toBe('customer')
  })

  it('identifies manual and chat owners in a shared browser and releases only the Done chat tabs', () => {
    const folder = temporary()
    registerBrowserConversation('plugin:codex-tmux:a', '/shop', false, folder)
    registerBrowserConversation('b', '/shop', false, folder)
    registerBrowserConversation('other-project', '/elsewhere', false, folder)
    const owners = new TestTabOwners(projectTestName('/shop'), folder)
    owners.tabs.set(1, owners.identify(undefined))
    owners.tabs.set(2, owners.identify('codex:a'))
    owners.tabs.set(3, owners.identify('b'))
    owners.tabs.set(4, owners.identify('plugin:codex-tmux:a'))
    expect(owners.tabs.get(1)).toBeNull()
    expect(owners.tabs.get(2)).toBe(owners.tabs.get(4))
    expect(() => owners.identify('other-project')).toThrow('another project')
    registerBrowserConversation('plugin:codex-tmux:a', '/shop', true, folder)
    expect(owners.released()).toEqual([2, 4])
    owners.tabs.delete(2)
    owners.tabs.delete(4)
    expect(() => owners.identify('codex:a')).toThrow('Done')
    registerBrowserConversation('b', '/shop', true, folder)
    expect(owners.released()).toEqual([3])
  })

  it('admits one driver until release and safely reclaims a departed driver lock', () => {
    const folder = temporary()
    const first = acquireTestLock('shop', folder)
    expect(first).toBeTypeOf('function')
    expect(acquireTestLock('shop', folder)).toBeUndefined()
    first?.()
    const next = acquireTestLock('shop', folder)
    expect(next).toBeTypeOf('function')
    next?.()
    const lock = join(`${folder}-state`, 'test-locks', 'shop.lock')
    writeFileSync(lock, '2147483647')
    const recovered = acquireTestLock('shop', folder)
    expect(recovered).toBeTypeOf('function')
    expect(readFileSync(lock, 'utf8')).toBe(String(process.pid))
    expect(existsSync(`${lock}.reap`)).toBe(false)
    recovered?.()
  })
})
