import { describe, expect, it } from 'vitest'

import { installedBy, versionOf } from '../src/main/sessions/account'
import { programLine } from '../src/shared/api'

describe('which Claude Code answers', () => {
  it('reads the version out of what `claude --version` prints', () => {
    expect(versionOf('2.1.274 (Claude Code)\n')).toBe('2.1.274')
    expect(versionOf('2.2.0-beta.1 (Claude Code)')).toBe('2.2.0-beta.1')
    expect(versionOf('')).toBeUndefined()
    expect(versionOf('command not found')).toBeUndefined()
  })

  it('names how it was put on the machine from where it is', () => {
    expect(installedBy('/opt/homebrew/Caskroom/claude-code/2.1.274/claude')).toBe('Homebrew')
    expect(installedBy('/usr/local/Caskroom/claude-code@latest/2.1.283/claude')).toBe('Homebrew')
    expect(installedBy('/home/linuxbrew/.linuxbrew/Cellar/claude-code/2.1.283/bin/claude')).toBe('Homebrew')
    expect(installedBy('/usr/local/lib/node_modules/@anthropic-ai/claude-code/cli.js')).toBe('npm')
    expect(installedBy('C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe')).toBe('npm')
    expect(installedBy('/Users/me/.local/share/claude/versions/2.1.283')).toBe('the native installer')
    expect(installedBy('C:\\Users\\me\\.local\\bin\\claude.exe')).toBe('the native installer')
    expect(installedBy('/usr/bin/claude')).toBeUndefined()
  })

  it('says it in a line, with how it was put there where that is known', () => {
    const account = { here: true, signedIn: true, plan: 'Max' }
    expect(programLine(account)).toBeUndefined()
    expect(programLine({ ...account, program: { version: '2.1.274', from: 'Homebrew' } })).toBe('Claude Code 2.1.274 from Homebrew')
    expect(programLine({ ...account, program: { version: '2.1.274' } })).toBe('Claude Code 2.1.274')
  })
})
