import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const data = vi.hoisted(() => ({ folder: '' }))
vi.mock('electron', () => ({ app: { getPath: () => data.folder } }))

beforeEach(() => {
  data.folder = mkdtempSync(join(tmpdir(), 'geckit-commands-'))
  vi.resetModules()
})

afterEach(() => rmSync(data.folder, { recursive: true, force: true }))

describe('cached command lists', () => {
  it('keeps an SSH project list private across projects, hosts and restarts', async () => {
    const cache = await import('../src/main/commands')
    cache.keepCommands('ssh://one/work/app', ['compact', 'remote-project'])
    expect(cache.commandsFor('ssh://one/work/app')).toEqual(['compact', 'remote-project'])
    expect(cache.commandsFor('ssh://one/work/other')).toEqual([])
    expect(cache.commandsFor('ssh://two/work/app')).toEqual([])
    expect(cache.commandsFor('/new-local')).toEqual([])
    vi.resetModules()
    const reopened = await import('../src/main/commands')
    expect(reopened.commandsFor('ssh://one/work/app')).toEqual(['compact', 'remote-project'])
    expect(reopened.commandsFor('/new-local')).toEqual([])
  })

  it('preserves the local fallback without sharing project-local skills or commands', async () => {
    const root = join(data.folder, 'project')
    mkdirSync(join(root, '.claude', 'skills', 'local-skill'), { recursive: true })
    mkdirSync(join(root, '.claude', 'commands'), { recursive: true })
    writeFileSync(join(root, '.claude', 'commands', 'local-command.md'), '')
    const cache = await import('../src/main/commands')
    const local = ['compact', 'personal', 'local-skill', 'local-command']
    cache.keepCommands(root, local)
    cache.keepCommands('ssh://one/work/app', ['remote-project'])
    cache.keepCommands('ssh://one/work/app', ['remote-project'])
    expect(cache.commandsFor(root)).toEqual(local)
    expect(cache.commandsFor('/new-local')).toEqual(['compact', 'personal'])
    expect(cache.commandsFor('ssh://one/work/other')).toEqual([])
    expect(readFileSync(join(data.folder, 'commands.json'), 'utf8')).toContain('remote-project')
    vi.resetModules()
    const reopened = await import('../src/main/commands')
    expect(reopened.commandsFor(root)).toEqual(local)
    expect(reopened.commandsFor('/new-local')).toEqual(['compact', 'personal'])
  })

  it('discards an ambiguous old fallback when SSH lists were saved, keeping each root list', async () => {
    writeFileSync(join(data.folder, 'commands.json'), JSON.stringify({
      roots: { 'ssh://one/work/app': ['remote-project'], '/local': ['personal'] },
      last: ['remote-project'],
    }))
    const cache = await import('../src/main/commands')
    expect(cache.commandsFor('/new-local')).toEqual([])
    expect(cache.commandsFor('/local')).toEqual(['personal'])
    expect(cache.commandsFor('ssh://one/work/app')).toEqual(['remote-project'])
    cache.keepCommands('ssh://one/work/app', ['remote-project', 'updated'])
    vi.resetModules()
    const reopened = await import('../src/main/commands')
    expect(reopened.commandsFor('/new-local')).toEqual([])
  })

  it('retains an old local-only fallback until the next local list refresh', async () => {
    writeFileSync(join(data.folder, 'commands.json'), JSON.stringify({ roots: { '/local': ['personal'] }, last: ['personal'] }))
    const cache = await import('../src/main/commands')
    expect(cache.commandsFor('/new-local')).toEqual(['personal'])
    cache.keepCommands('ssh://one/work/app', ['remote-project'])
    vi.resetModules()
    const reopened = await import('../src/main/commands')
    expect(reopened.commandsFor('/new-local')).toEqual(['personal'])
  })
})
