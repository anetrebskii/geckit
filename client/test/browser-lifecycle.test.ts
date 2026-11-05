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

  it('enforces ownership, including popup inheritance, and releases only Done conversations', () => {
    const folder = temporary()
    for (const id of ['a', 'b', 'c']) registerBrowserConversation(id, '/shop', false, folder)
    registerBrowserConversation('other-project', '/elsewhere', false, folder)
    const owners = new TestTabOwners(projectTestName('/shop'), folder, true)
    owners.acquire('a')
    owners.acquire('b')
    owners.tabs.set('first', 'a')
    owners.tabs.set('second', 'b')
    owners.inherit('popup', 'first')
    expect(() => owners.authorize('a', 'first')).not.toThrow()
    expect(() => owners.authorize('c', 'first')).toThrow('another conversation')
    expect(owners.conversations.has('c')).toBe(false)
    expect(() => owners.acquire('other-project')).toThrow('another project')
    expect(() => owners.authorize(undefined, 'first')).toThrow('registered conversation')
    registerBrowserConversation('a', '/shop', true, folder)
    expect(owners.released()).toEqual(['first', 'popup'])
    for (const target of ['first', 'popup']) owners.tabs.delete(target)
    expect([...owners.conversations]).toEqual(['b'])
    expect(() => owners.acquire('a')).toThrow('Done')
    expect(() => owners.authorize('b', 'second')).not.toThrow()
    registerBrowserConversation('b', '/shop', true, folder)
    expect(owners.released()).toEqual(['second'])
    expect(owners.conversations.size).toBe(0)
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

  it('preserves manual browsers with unknown ownership instead of adopting and later closing them', () => {
    const folder = temporary()
    registerBrowserConversation('a', '/shop', false, folder)
    const owners = new TestTabOwners(projectTestName('/shop'), folder, false)
    expect(() => owners.acquire('a')).toThrow('ownership is unknown')
    expect(() => owners.acquire(undefined)).not.toThrow()
    registerBrowserConversation('a', '/shop', true, folder)
    expect(owners.released()).toEqual([])
    expect(owners.managed).toBe(false)
  })
})
