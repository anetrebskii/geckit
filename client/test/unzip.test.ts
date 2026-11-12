import { execFileSync } from 'node:child_process'
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { unzip } from '../src/cli/unzip'

const folders: string[] = []
afterEach(() => { for (const one of folders.splice(0)) rmSync(one, { recursive: true, force: true }) })

describe('unzip', () => {
  it('unpacks files, folders, modes and symlinks without an unzip program', async () => {
    const home = mkdtempSync(join(tmpdir(), 'unzip-'))
    folders.push(home)
    const source = join(home, 'source')
    mkdirSync(join(source, 'chrome-linux64', 'locales'), { recursive: true })
    writeFileSync(join(source, 'chrome-linux64', 'chrome'), 'binary '.repeat(5000))
    chmodSync(join(source, 'chrome-linux64', 'chrome'), 0o755)
    writeFileSync(join(source, 'chrome-linux64', 'locales', 'en-US.pak'), 'x')
    writeFileSync(join(source, 'chrome-linux64', 'empty'), '')
    symlinkSync('chrome', join(source, 'chrome-linux64', 'link'))
    execFileSync('zip', ['-qry', join(home, 'chrome.zip'), 'chrome-linux64'], { cwd: source })
    const out = join(home, 'out')
    await unzip(join(home, 'chrome.zip'), out)
    const chrome = join(out, 'chrome-linux64', 'chrome')
    expect(readFileSync(chrome, 'utf8')).toBe('binary '.repeat(5000))
    expect(statSync(chrome).mode & 0o777).toBe(0o755)
    expect(readFileSync(join(out, 'chrome-linux64', 'locales', 'en-US.pak'), 'utf8')).toBe('x')
    expect(readFileSync(join(out, 'chrome-linux64', 'empty'), 'utf8')).toBe('')
    expect(lstatSync(join(out, 'chrome-linux64', 'link')).isSymbolicLink()).toBe(true)
    expect(readlinkSync(join(out, 'chrome-linux64', 'link'))).toBe('chrome')
  })

  it('refuses a file that is not a zip', async () => {
    const home = mkdtempSync(join(tmpdir(), 'unzip-'))
    folders.push(home)
    writeFileSync(join(home, 'not.zip'), 'hello')
    await expect(unzip(join(home, 'not.zip'), join(home, 'out'))).rejects.toThrow('not a zip')
  })
})
