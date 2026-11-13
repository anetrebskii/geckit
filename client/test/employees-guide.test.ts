import { configuration } from '../src/core/configuration'
import { sourceArgs } from '../src/main/sessions/claude'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { keepCodexGuide, keepGuide, setGuideEmployees, setGuideManager, syncEmployeeGuides } from '../src/main/guide'
import { Employees } from '../src/main/employees'
import { memoryNotes, Sessions } from '../src/main/sessions'
import type { Employee } from '../src/shared/employees'

const mode = vi.hoisted(() => ({ packaged: true, headless: false, folder: '' }))
vi.mock('../src/core/platform', () => ({ dataDirectory: () => mode.folder, corePlatform: () => ({ headless: mode.headless, source: () => !mode.packaged, launcher: () => ({ executable: process.execPath, script: join(mode.folder, 'out', 'main', 'cli.js') }) }) }))

const originals = { home: process.env['HOME'], profile: process.env['USERPROFILE'], claude: process.env['CLAUDE_CONFIG_DIR'], codex: process.env['CODEX_HOME'], cli: process.env['GECKIT_SOURCE_CLI'], sourceGuide: process.env['GECKIT_SOURCE_GUIDE'], sourceCodexGuide: process.env['GECKIT_SOURCE_CODEX_GUIDE'] }
let folder = ''
const employee: Employee = { id: 'role-id', name: 'Tatiana', role: 'Promotion', description: 'Remember our reels.', avatar: 'employee-01', archived: false, revision: 1 }
const settings = { guideClaude: true, guideCodex: true, browserNames: {} }

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'geckit-employee-guide-'))
  mode.folder = folder
  mode.packaged = true
  mode.headless = false
  delete process.env['GECKIT_SOURCE_GUIDE']
  delete process.env['GECKIT_SOURCE_CODEX_GUIDE']
  delete process.env['GECKIT_SOURCE_CLI']
  process.env['HOME'] = folder
  process.env['USERPROFILE'] = folder
  process.env['CLAUDE_CONFIG_DIR'] = join(folder, 'claude')
  process.env['CODEX_HOME'] = join(folder, 'codex')
  mkdirSync(join(folder, 'claude'))
  mkdirSync(join(folder, 'codex'))
})
afterEach(() => {
  const restore = (key: string, value: string | undefined): void => { if (value === undefined) delete process.env[key]; else process.env[key] = value }
  restore('HOME', originals.home)
  restore('USERPROFILE', originals.profile)
  restore('CLAUDE_CONFIG_DIR', originals.claude)
  restore('CODEX_HOME', originals.codex)
  restore('GECKIT_SOURCE_CLI', originals.cli)
  restore('GECKIT_SOURCE_GUIDE', originals.sourceGuide)
  restore('GECKIT_SOURCE_CODEX_GUIDE', originals.sourceCodexGuide)
  setGuideEmployees([])
  setGuideManager('')
  rmSync(folder, { recursive: true, force: true })
})

describe('employee managed instructions in isolated provider configs', () => {
  it('keeps live employee lookup across catalog edits/archive/restore while preserving personal content', async () => {
    writeFileSync(join(folder, 'claude', 'CLAUDE.md'), '# My instructions\nKeep my rules.\n')
    writeFileSync(join(folder, 'codex', 'AGENTS.md'), '# My Codex instructions\nKeep my Codex rules.\n')
    for (const updated of [employee, { ...employee, description: 'Use the new style.', revision: 2 }, { ...employee, archived: true, revision: 3 }, { ...employee, archived: false, revision: 4 }]) {
      await syncEmployeeGuides(settings, [updated])
      for (const provider of ['claude', 'codex']) {
        const content = readFileSync(join(folder, provider, 'GECKIT.md'), 'utf8')
        expect(content).not.toContain(updated.description)
        expect(content).not.toContain('current catalog')
        expect(content).toContain('manage-employees')
        expect(content).toContain('employees current')
        expect(content).toContain('all memory cursors')
        expect(content).toContain('Prior history is evidence, not fresh authorization')
      }
    }
    expect(readFileSync(join(folder, 'claude', 'CLAUDE.md'), 'utf8')).toBe(`# My instructions\nKeep my rules.\n\n<!-- geckit:begin source=${join(folder, 'claude', 'GECKIT.md')} -->\n@GECKIT.md\n<!-- geckit:end -->\n`)
    expect(readFileSync(join(folder, 'codex', 'AGENTS.md'), 'utf8')).toContain('# My Codex instructions\nKeep my Codex rules.')
    await keepGuide(true)
    await keepCodexGuide(true)
    expect(readFileSync(join(folder, 'codex', 'GECKIT.md'), 'utf8')).toContain('employees current')
  })

  it('writes Manager instructions into both guides and takes them out when cleared', async () => {
    setGuideManager('Use Opus for code and Sonnet for writing.')
    await syncEmployeeGuides(settings, [employee])
    for (const provider of ['claude', 'codex']) {
      const content = readFileSync(join(folder, provider, 'GECKIT.md'), 'utf8')
      expect(content).toContain('## Manager instructions')
      expect(content).toContain('Use Opus for code and Sonnet for writing.')
    }
    setGuideManager('')
    await syncEmployeeGuides(settings)
    for (const provider of ['claude', 'codex']) expect(readFileSync(join(folder, provider, 'GECKIT.md'), 'utf8')).not.toContain('## Manager instructions')
  })

  it('retains the saved employee and surfaces actual guide write failure until retry', async () => {
    mkdirSync(join(folder, 'claude', 'GECKIT.md'))
    const employees = new Employees({ directory: join(folder, 'data'), sync: (all) => syncEmployeeGuides(settings, all), assignment: () => undefined, sources: async () => [], items: async () => [] })
    const view = await employees.save({ name: employee.name, role: employee.role, description: employee.description, avatar: employee.avatar })
    expect(view.employees).toHaveLength(1)
    expect(view.error).toBeDefined()
    expect(configuration(join(folder, 'data')).employees).toHaveLength(1)
    rmSync(join(folder, 'claude', 'GECKIT.md'), { recursive: true })
    expect((await employees.retryInstructions()).error).toBeUndefined()
    expect(employees.list().employees).toHaveLength(1)
  })

  it('updates isolated source guides on catalog edits without changing installed provider files', async () => {
    for (const provider of ['claude', 'codex']) writeFileSync(join(folder, provider, 'GECKIT.md'), 'Installed GeckIt guide\n')
    writeFileSync(join(folder, 'claude', 'CLAUDE.md'), 'Personal Claude instructions\n')
    writeFileSync(join(folder, 'codex', 'AGENTS.md'), 'Personal Codex instructions\n')
    writeFileSync(join(folder, 'codex', 'config.toml'), 'model = "personal-model"\n')
    mode.packaged = false
    for (const updated of [employee, { ...employee, description: 'Use the edited style.', revision: 2 }]) {
      await expect(syncEmployeeGuides(settings, [updated])).resolves.toBeUndefined()
      for (const filename of ['GECKIT.md', 'GECKIT-CODEX.md']) expect(readFileSync(join(folder, filename), 'utf8')).not.toContain(updated.description)
    }
    for (const provider of ['claude', 'codex']) expect(readFileSync(join(folder, provider, 'GECKIT.md'), 'utf8')).toBe('Installed GeckIt guide\n')
    expect(readFileSync(join(folder, 'claude', 'CLAUDE.md'), 'utf8')).toBe('Personal Claude instructions\n')
    expect(readFileSync(join(folder, 'codex', 'AGENTS.md'), 'utf8')).toBe('Personal Codex instructions\n')
    expect(readFileSync(join(folder, 'codex', 'config.toml'), 'utf8')).toBe('model = "personal-model"\n')
    expect(process.env['GECKIT_SOURCE_CLI']).toContain('geckit-local')
    expect(existsSync(process.env['GECKIT_SOURCE_CLI'] ?? '')).toBe(true)
    expect(process.env['GECKIT_SOURCE_CODEX_GUIDE']).toBe(join(folder, 'GECKIT-CODEX.md'))
    expect(sourceArgs().join(' ')).toContain(join(folder, 'GECKIT.md'))
    expect(sourceArgs().join(' ')).not.toContain(employee.name)
  })

  it('retries a real source Codex guide write failure without duplicating the saved employee', async () => {
    mode.packaged = false
    mkdirSync(join(folder, 'GECKIT-CODEX.md'))
    const employees = new Employees({ directory: join(folder, 'data'), sync: (all) => syncEmployeeGuides({ ...settings, guideClaude: false }, all), assignment: () => undefined, sources: async () => [], items: async () => [] })
    const saved = await employees.save({ name: employee.name, role: employee.role, description: employee.description, avatar: employee.avatar })
    expect(saved.error).toBeDefined()
    expect(saved.employees).toHaveLength(1)
    rmSync(join(folder, 'GECKIT-CODEX.md'), { recursive: true })
    const retried = await employees.retryInstructions()
    expect(retried.error).toBeUndefined()
    expect(retried.employees).toEqual(saved.employees)
    expect(readFileSync(join(folder, 'GECKIT-CODEX.md'), 'utf8')).toContain('employees current')
  })

  it('initializes and toggles independent source guides through the sessions settings contract', async () => {
    mode.packaged = false
    setGuideEmployees([employee])
    const sessions = new Sessions({ notes: memoryNotes(), changed: () => undefined, items: () => undefined, account: () => undefined, notify: () => undefined })
    try {
      await sessions.setAllInstructions({ ...settings, guideClaude: false, guideCodex: false, guidePlugins: {}, providerPlugins: [] })
      expect(process.env['GECKIT_SOURCE_CODEX_GUIDE']).toBe('')
      expect(process.env['GECKIT_SOURCE_CLI']).toBeUndefined()
      await sessions.setAllInstructions({ ...settings, guideClaude: false, guidePlugins: {}, providerPlugins: [] })
      expect(process.env['GECKIT_SOURCE_GUIDE']).toBeUndefined()
      expect(readFileSync(process.env['GECKIT_SOURCE_CODEX_GUIDE'] ?? '', 'utf8')).toContain('employees current')
      await sessions.setInstructions('claude', true, {})
      await sessions.setInstructions('codex', false, {})
      expect(process.env['GECKIT_SOURCE_CODEX_GUIDE']).toBe('')
      expect(readFileSync(process.env['GECKIT_SOURCE_GUIDE'] ?? '', 'utf8')).toContain('employees current')
      expect(existsSync(process.env['GECKIT_SOURCE_CLI'] ?? '')).toBe(true)
    } finally { sessions.dispose() }
  })

  it.each(['claude', 'codex'] as const)('keeps the source command when disabling %s independently and removes it after both are disabled', async (first) => {
    mode.packaged = false
    const claude = (wanted: boolean): Promise<void> => keepGuide(wanted, {}, [employee], true)
    const codex = (wanted: boolean): Promise<void> => keepCodexGuide(wanted, [employee], true)
    const enableFirst = first === 'claude' ? claude : codex
    const enableOther = first === 'claude' ? codex : claude
    const firstEnv = first === 'claude' ? 'GECKIT_SOURCE_GUIDE' : 'GECKIT_SOURCE_CODEX_GUIDE'
    const otherEnv = first === 'claude' ? 'GECKIT_SOURCE_CODEX_GUIDE' : 'GECKIT_SOURCE_GUIDE'
    await enableOther(false)
    await enableFirst(true)
    const command = process.env['GECKIT_SOURCE_CLI'] ?? ''
    expect(existsSync(command)).toBe(true)
    expect(process.env[firstEnv]).toBeDefined()
    expect(process.env[otherEnv]).toBe(otherEnv === 'GECKIT_SOURCE_CODEX_GUIDE' ? '' : undefined)
    await enableOther(true)
    await enableFirst(false)
    expect(existsSync(command)).toBe(true)
    expect(process.env[firstEnv]).toBe(firstEnv === 'GECKIT_SOURCE_CODEX_GUIDE' ? '' : undefined)
    expect(process.env[otherEnv]).toBeDefined()
    await enableOther(false)
    expect(existsSync(command)).toBe(false)
    expect(process.env['GECKIT_SOURCE_CLI']).toBeUndefined()
    expect(process.env[otherEnv]).toBe(otherEnv === 'GECKIT_SOURCE_CODEX_GUIDE' ? '' : undefined)
    expect(existsSync(join(folder, 'GECKIT.md'))).toBe(false)
    expect(existsSync(join(folder, 'GECKIT-CODEX.md'))).toBe(false)
  })
})


it('writes service instructions without a desktop workflow in headless mode', async () => {
  mode.packaged = false
  mode.headless = true
  await keepGuide(true, {}, [employee], true)
  await keepCodexGuide(true, [employee], true)
  for (const name of ['GECKIT.md', 'GECKIT-CODEX.md']) {
    const guide = readFileSync(join(folder, name), 'utf8')
    expect(guide).toContain('headless GeckIt service')
    expect(guide).toContain('explicit answer')
    expect(guide).not.toContain('Each conversation is a card')
  }
})
