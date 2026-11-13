import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { conversationTestName, registerBrowserConversation, saveTestAccount, testAccount, forgetTestAccount } from '../src/cli/browser-lifecycle'
import { computerArg } from '../src/cli/computer'
import { claimSignIn, setLiveServer, signInLink } from '../src/cli/live-view'
import { camoufoxHeadless } from '../src/cli/testing'
import { refusedCli } from '../src/core/cli-run'
import { computerNamed } from '../src/service/remote/computers'
import { readSignIn } from '../src/shared/live-view'

const folders: string[] = []
const temporary = (): string => { const folder = mkdtempSync(join(tmpdir(), 'geckit-accounts-')); folders.push(folder, `${folder}-state`); return folder }
afterEach(() => { for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }); setLiveServer(() => undefined) })

describe('account profiles', () => {
  it('keeps a note per profile and lets any registered conversation use it by name', () => {
    const folder = temporary()
    registerBrowserConversation('a', '/shop', false, folder)
    saveTestAccount('plain', '   ', folder)
    expect(testAccount('plain', folder)?.note).toBe('')
    expect(conversationTestName('a', folder, 'plain')).toBe('plain')
    expect(() => saveTestAccount('GitHub', 'GitHub as alex', folder)).toThrow(/lowercase/)
    const before = conversationTestName('a', folder, 'github-work')
    expect(before).not.toBe('github-work')
    saveTestAccount('github-work', ' GitHub   as alex ', folder)
    expect(testAccount('github-work', folder)?.note).toBe('GitHub as alex')
    expect(conversationTestName('a', folder, 'github-work')).toBe('github-work')
    expect(conversationTestName('a', folder)).toBe(before)
    forgetTestAccount('github-work', folder)
    expect(conversationTestName('a', folder, 'github-work')).toBe(before)
  })
})

describe('computers', () => {
  it('takes --computer out of a command line', () => {
    expect(computerArg(['sessions', '--today'])).toEqual({ args: ['sessions', '--today'] })
    expect(computerArg(['browser', 'profiles', '--computer', 'linux-box'])).toEqual({ computer: 'linux-box', args: ['browser', 'profiles'] })
    expect(computerArg(['sessions', '--computer'])).toMatch(/Give the host/)
    expect(computerArg(['--computer', 'a', 'x', '--computer', 'b'])).toContain('Name one host')
  })
  it('finds a paired computer by id or by name, and says which are paired when none matches', () => {
    const paired = [{ server: { id: 'one', name: 'linux-box', publicKey: '' } }, { server: { id: 'two', name: 'Mac', publicKey: '' } }]
    expect(computerNamed(paired, 'LINUX-BOX')).toBe(paired[0])
    expect(computerNamed(paired, 'two')).toBe(paired[1])
    expect(computerNamed(paired, 'pi')).toBe('No paired computer is called pi. Paired: linux-box, Mac.')
    expect(computerNamed([...paired, { server: { id: 'three', name: 'mac', publicKey: '' } }], 'mac')).toMatch(/More than one/)
  })
  it('refuses the commands only the person runs on the computer itself', () => {
    for (const one of ['pair', 'devices', 'access', 'service', 'computers']) expect(refusedCli([one, 'list'])).toMatch(/by the person/)
    expect(refusedCli([])).toBeDefined()
    expect(refusedCli(['sessions', '--computer', 'x'])).toContain('Nested host selection')
    expect(refusedCli(['browser', 'profiles'])).toBeUndefined()
  })
})

describe('sign-in links', () => {
  it('needs a paired device to open in', () => {
    expect(() => signInLink('github-work')).toThrow(/No device is paired/)
  })
  it('opens once, for its profile, before it expires', () => {
    setLiveServer(() => ({ id: 'server-1', name: 'linux box' }))
    const made = signInLink('github-work', 1_000)
    const link = readSignIn(made.link)
    expect(link).toMatchObject({ computer: 'server-1', name: 'linux box', profile: 'github-work' })
    expect(made.expires).toBe(1_000 + 15 * 60_000)
    expect(() => claimSignIn('other', link?.token ?? '', 2_000)).toThrow(/not known/)
    claimSignIn('github-work', link?.token ?? '', 2_000)
    expect(() => claimSignIn('github-work', link?.token ?? '', 3_000)).toThrow(/already opened/)
    const late = readSignIn(signInLink('github-work', 1_000).link)
    expect(() => claimSignIn('github-work', late?.token ?? '', 1_000 + 15 * 60_000)).toThrow(/expired/)
  })
  it('reads only geckit sign-in links', () => {
    expect(readSignIn('https://example.com/?t=x')).toBeUndefined()
    expect(readSignIn('geckit://signin?computer=a&profile=Bad&t=aaaaaaaaaaaaaaaaaaaa')).toBeUndefined()
    expect(readSignIn('geckit://signin?computer=a&profile=ok&t=aaaaaaaaaaaaaaaaaaaa')).toEqual({ computer: 'a', name: 'the computer', profile: 'ok', token: 'aaaaaaaaaaaaaaaaaaaa' })
  })
})

describe('test browsers on Linux', () => {
  it('run without a window where there is no screen', () => {
    expect(camoufoxHeadless('darwin', {})).toBe(false)
    expect(camoufoxHeadless('linux', { DISPLAY: ':0' })).toBe(false)
    expect(camoufoxHeadless('linux', {})).toBe(true)
  })
})
