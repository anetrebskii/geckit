import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { ManagerOperations } from '../src/main/manager-operations'
import type { NotesStore, Sessions } from '../src/main/sessions'
import { Shares } from '../src/main/shares'
import { DEFAULT_SETTINGS } from '../src/shared/api'
import { managerCommand } from '../src/cli/manage'

function fixture(team = false) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'geckit-links-')))
  mkdirSync(join(root, 'out'))
  writeFileSync(join(root, 'out', 'report.md'), '# Report')
  writeFileSync(join(root, '.env'), 'KEY=1')
  const settings = { ...DEFAULT_SETTINGS, projects: [root] }
  const shares = new Shares({ changed: () => undefined, home: '/nonexistent-home' })
  const operations = new ManagerOperations({ shares, sessions: {} as Sessions, notes: { all: () => ({}) } as unknown as NotesStore, settings: () => settings, saveSettings: () => settings, owner: 'manager', managed: () => true, managerSession: () => 'manager', sharedThread: () => team })
  return { root, shares, operations }
}

describe('Manager links', () => {
  it('shares a project file or folder as a link, lists and stops it', async () => {
    const { root, operations } = fixture()
    const folder = JSON.parse(await operations.run(['links', 'share', '--project', root, '--path', 'out'], 'a')) as { id: string; link: string; title: string }
    expect(folder.link).toMatch(/^https:\/\/geckit-signal\.web\.app\/#[A-Za-z0-9_-]{32,}\.[0-9a-z]+$/)
    expect(folder.title).toBe('out/')
    const file = JSON.parse(await operations.run(['links', 'share', '--project', root, '--path', 'out/report.md'], 'b')) as { id: string; title: string }
    expect(file.title).toBe('report.md')
    expect(JSON.parse(await operations.run(['links', 'list'], 'c'))).toHaveLength(2)
    await operations.run(['links', 'stop', '--id', folder.id], 'd')
    expect(JSON.parse(await operations.run(['links', 'list'], 'e'))).toHaveLength(1)
  })

  it('refuses credentials, paths outside the project and project links from team threads', async () => {
    const { root, operations } = fixture()
    await expect(operations.run(['links', 'share', '--project', root, '--path', '.env'], 'a')).rejects.toThrow('Credential')
    await expect(operations.run(['links', 'share', '--project', root, '--path', '../'], 'b')).rejects.toThrow('outside')
    const team = fixture(true)
    await expect(team.operations.run(['links', 'share', '--project', team.root, '--path', 'out'], 'c')).rejects.toThrow('Team topics')
    await expect(team.operations.run(['links', 'list'], 'd')).rejects.toThrow('Team topics')
  })

  it('is a Manager command', () => {
    expect(managerCommand(['links', 'share'], { GECKIT_MANAGER_SESSION: 'manager' })).toBe(true)
  })
})
