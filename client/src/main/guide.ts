import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { corePlatform, dataDirectory } from '../core/platform'

import { forwardSlashes } from '../cli/endpoint'
import { browserBridgeOn, installBrowserBridge, removeBrowserBridge, setBrowserBridgeOn } from '../cli/browser'
import { serveTestLaunches } from '../cli/testing'
import { knownComputers } from '../cli/computer'
import { fetchFindModel, findModelServer } from '../cli/find-model'
import type { Employee } from '../shared/employees'
import type { Settings } from '../shared/api'
import type { BrowserBridge } from './sessions/provider'
import { fill, PROMPTS } from '../prompts/prompts'

/**
 * What Claude Code is told about being run by GeckIt.
 *
 * A conversation here answers into a window with a board behind it, and none
 * of that is in the tool's own instructions: the person who installs GeckIt
 * would have to write it themselves, and most of them never will. GeckIt keeps
 * `GECKIT.md` beside the tool's own `CLAUDE.md` and one line in `CLAUDE.md`
 * that reads it, and leaves everything else in that file alone.
 */

let guideEmployees: readonly Employee[] = []

export function setGuideEmployees(employees: readonly Employee[]): void { guideEmployees = employees }

let guideManager = ''

export function setGuideManager(instructions: string): void { guideManager = instructions.trim() }

/** The person's own instructions for Manager, read only by the Manager session. */
export function MANAGER(instructions: string = guideManager): string {
  if (instructions === '') return ''
  return `\n${fill(PROMPTS.guide.manager, { instructions })}\n`
}

export function EMPLOYEES(employees: readonly Employee[], command = cliPath()): string {
  const said = command.includes(' ') ? `"${command}"` : command
  const catalog = JSON.stringify(employees.map(({ id, name, role, description, archived }) => ({ id, name, role, description, archived })), undefined, 2)
  return `\n${fill(PROMPTS.guide.employees, { said, catalog })}\n`
}

/** Turns Chrome through GeckIt on or off: the extension and its native host, the download of the find model, and what the guides and Codex's sandbox say about it. */
let stopLaunches: (() => void) | undefined

export function keepBrowserBridge(on: boolean): void {
  setBrowserBridgeOn(on)
  try {
    keepBrowserSkills(on)
    if (!on) { stopLaunches?.(); stopLaunches = undefined; removeBrowserBridge(); return }
    const launcher = corePlatform().launcher?.()
    if (launcher !== undefined) installBrowserBridge(launcher.executable, launcher.script)
    if (launcher !== undefined && stopLaunches === undefined) stopLaunches = serveTestLaunches(launcher.executable, launcher.script)
    if (findModelServer()) void fetchFindModel()
  } catch { /* the bridge is worth having when it can be written and nothing when it cannot */ }
}

/** The browser skill: in GeckIt's own Claude plugin for its Claude sessions, and among Codex's skills for the installed GeckIt. */
function keepBrowserSkills(on: boolean): void {
  const plugin = browserPluginFolder()
  const codex = join(codexWhere(), 'skills', 'geckit-browser')
  if (!on) {
    rmSync(plugin, { recursive: true, force: true })
    if (!fromSource()) rmSync(codex, { recursive: true, force: true })
    return
  }
  mkdirSync(join(plugin, '.claude-plugin'), { recursive: true })
  writeFileSync(join(plugin, '.claude-plugin', 'plugin.json'), `${JSON.stringify({ name: 'geckit', version: '1.0.0', description: 'What GeckIt gives the Claude conversations it runs.' }, undefined, 2)}\n`)
  mkdirSync(join(plugin, 'skills', 'browser'), { recursive: true })
  writeFileSync(join(plugin, 'skills', 'browser', 'SKILL.md'), BROWSER_SKILL(cliPath(), 'browser'))
  if (fromSource()) return
  mkdirSync(codex, { recursive: true })
  writeFileSync(join(codex, 'SKILL.md'), BROWSER_SKILL(cliPath(), 'geckit-browser'))
}

const guideWrite = async (file: string, content: string, strict: boolean): Promise<void> => {
  try { await writeFile(file, content) } catch (error) { if (strict) throw error }
}

export async function syncEmployeeGuides(settings: Pick<Settings, 'guideClaude' | 'guideCodex' | 'browserNames'>, employees: readonly Employee[] = guideEmployees): Promise<void> {
  setGuideEmployees(employees)
  if (settings.guideClaude) await keepGuide(true, settings.browserNames, employees, true)
  if (settings.guideCodex) await keepCodexGuide(true, employees, true)
}

const IMPORT = '@GECKIT.md'

const where = (): string => process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude')
const codexWhere = (): string => process.env['CODEX_HOME'] ?? join(homedir(), '.codex')

/** Run from the source rather than installed; outside Electron, as in the tests, it is taken as installed. */
const fromSource = (): boolean => corePlatform().source()

/**
 * Where the command is written, and what it is called from a shell. Run from
 * the source it is `geckit-local`, which reaches that copy. Forward slashes on
 * Windows too: every shell there reads them, and a backslash in a line of
 * GECKIT.md would be read as an escape by the one Claude Code runs.
 */
export const cliPath = (): string => forwardSlashes(corePlatform().command?.() ?? join(homedir(), '.geckit', 'bin', fromSource() ? 'geckit-local' : 'geckit'))

/**
 * The command, as lines that run the application's own Node on the script
 * built beside the main process. Nothing has to be installed for it, and it
 * finds GeckIt's own folder because the path is written into the line. A
 * shell script everywhere; on Windows a `.cmd` beside it as well, for cmd and
 * PowerShell, since the script there is for Git Bash, which Claude Code runs.
 * cmd reads a batch file in the console's code page, so a path under the
 * person's profile is written as `%USERPROFILE%` and the rest, which cmd
 * expands itself; `setlocal` keeps the variables out of the shell it ran in.
 */
export function launchers(execPath: string, script: string, data: string, platform: NodeJS.Platform = process.platform, home: string = homedir()): { readonly sh: string; readonly cmd?: string } {
  const forSh = (path: string): string => `"${(platform === 'win32' ? forwardSlashes(path) : path).replace(/(["\\$`])/g, '\\$1')}"`
  const sh = [
    '#!/bin/sh',
    '# Written by GeckIt when it starts. Anything changed here is written over.',
    `GECKIT_DATA=${forSh(data)} ELECTRON_RUN_AS_NODE=1 exec ${forSh(execPath)} ${forSh(script)} "$@"`,
    '',
  ].join('\n')
  if (platform !== 'win32') return { sh }
  const profile = home.replace(/[\\/]+$/, '')
  const forCmd = (path: string): string => {
    const under = path.toLowerCase().startsWith(profile.toLowerCase()) && /[\\/]/.test(path.charAt(profile.length))
    const rest = under ? path.slice(profile.length) : path
    return `${under ? '%USERPROFILE%' : ''}${rest.replace(/%/g, '%%')}`
  }
  const cmd = [
    '@echo off',
    'setlocal',
    'rem Written by GeckIt when it starts. Anything changed here is written over.',
    `set "GECKIT_DATA=${forCmd(data)}"`,
    'set "ELECTRON_RUN_AS_NODE=1"',
    `"${forCmd(execPath)}" "${forCmd(script)}" %*`,
    '',
  ].join('\r\n')
  return { sh, cmd }
}

/** Writes the command where `cliPath` says, and the `.cmd` beside it on Windows; false when it could not be, or outside Electron. */
async function writeLaunchers(command: string): Promise<boolean> {
  const launcher = corePlatform().launcher?.()
  if (launcher === undefined) return false
  const made = launchers(launcher.executable, launcher.script, dataDirectory())
  try {
    await mkdir(join(command, '..'), { recursive: true })
    await writeFile(command, made.sh)
    await chmod(command, 0o755)
    if (made.cmd !== undefined) await writeFile(`${command}.cmd`, made.cmd)
    return true
  } catch {
    return false
  }
}

async function removeLaunchers(command: string): Promise<void> {
  await rm(command, { force: true }).catch(() => undefined)
  await rm(`${command}.cmd`, { force: true }).catch(() => undefined)
}

/** How a batch of conversations is sent: fed to the command by a heredoc, or from a file where the shell has no heredoc (PowerShell, which Codex runs on Windows). */
type Batch = 'heredoc' | 'file'

const SEND = (said: string, batch: Batch): string =>
  fill(batch === 'heredoc' ? PROMPTS.guide.sendHeredoc : PROMPTS.guide.sendFile, { said, example: PROMPTS.guide.example })

const OTHER_COMPUTERS = (said: string): string => {
  const known = knownComputers()
  return fill(PROMPTS.guide.otherComputers, { said, paired: known.length === 0 ? 'None is paired now.' : `Paired now: ${known.map((one) => one.name).join(', ')}.` })
}

const COMMAND = (path: string, batch: Batch = 'heredoc', exact = true): string => {
  const said = path.includes(' ') ? `"${path}"` : path
  return `\n${fill(PROMPTS.guide.command, { said, otherComputers: OTHER_COMPUTERS(said), send: SEND(said, batch), exactForm: exact ? `${PROMPTS.guide.exactForm} ` : '' })}\n`
}

export const GUIDE = `${fill(PROMPTS.guide.claude, { instructions: 'CLAUDE.md' })}\n`

const currentGuide = (instructions = 'CLAUDE.md'): string => `${fill(corePlatform().headless === true ? PROMPTS.guide.headless : PROMPTS.guide.claude, { instructions })}\n`

/** The names given in GeckIt to the Chromes the extension calls Browser 1, Browser 2, or nothing while none is named. */
export const BROWSERS = (names: Readonly<Record<string, string>>): string => {
  const named = Object.entries(names).filter(([, name]) => name.trim() !== '')
  if (named.length === 0) return ''
  return `\n${fill(PROMPTS.guide.browsers, { list: named.map(([id, name]) => `- \`${id}\`: ${name.replace(/\s+/g, ' ').trim()}`).join('\n') })}\n`
}

/**
 * Writes the file and the one line in `CLAUDE.md` that reads it, or takes both
 * away again. Anything that cannot be written is left: this is worth doing when
 * it works and worth nothing at all when it does not.
 */
export async function keepGuide(wanted: boolean, browsers: Readonly<Record<string, string>> = {}, employees: readonly Employee[] = guideEmployees, strict = false): Promise<void> {
  const folder = where()
  const guide = join(folder, 'GECKIT.md')
  const command = cliPath()
  const claude = join(folder, 'CLAUDE.md')
  const was = await readFile(claude, 'utf8').catch(() => '')
  const linked = was.split('\n').some((line) => line.trim() === IMPORT)
  // Source uses its own guide and command while preserving the installed global files.
  if (fromSource()) {
    const localGuide = join(dataDirectory(), 'GECKIT.md')
    if (!wanted) {
      await rm(localGuide, { force: true }).catch(() => undefined)
      delete process.env['GECKIT_SOURCE_GUIDE']
      if (!process.env['GECKIT_SOURCE_CODEX_GUIDE']) {
        await removeLaunchers(command)
        delete process.env['GECKIT_SOURCE_CLI']
      }
      return
    }
    if (await writeLaunchers(command)) {
      process.env['GECKIT_SOURCE_CLI'] = command
      await guideWrite(localGuide, `${currentGuide()}${BROWSERS(browsers)}${COMMAND(command)}${BROWSER(command, true)}${EMPLOYEES(employees, command)}${MANAGER()}`, strict)
      process.env['GECKIT_SOURCE_GUIDE'] = localGuide
    } else if (strict) throw new Error('The source GeckIt command could not be updated.')
    return
  }
  if (!wanted) {
    await rm(guide, { force: true }).catch(() => undefined)
    await removeLaunchers(command)
    if (!linked) return
    const without = was
      .split('\n')
      .filter((line) => line.trim() !== IMPORT)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/\s*$/, '\n')
    await writeFile(claude, without).catch(() => undefined)
    return
  }
  await mkdir(folder, { recursive: true }).catch(() => undefined)
  const told = await writeLaunchers(command)
  if (strict && !told) throw new Error('The GeckIt command could not be updated.')
  await guideWrite(guide, `${currentGuide()}${BROWSERS(browsers)}${told ? COMMAND(command) + BROWSER(command, true) + EMPLOYEES(employees, command) : ''}${MANAGER()}`, strict)
  if (linked) return
  const next = was.trim() === '' ? `${IMPORT}\n` : `${was.replace(/\s*$/, '')}\n\n${IMPORT}\n`
  await guideWrite(claude, next, strict)
}

/** Keep Codex's global instructions linked to GeckIt's guide without changing the person's other instructions. */
export async function keepCodexGuide(wanted: boolean, employees: readonly Employee[] = guideEmployees, strict = false): Promise<void> {
  if (fromSource()) {
    const command = cliPath()
    const localGuide = join(dataDirectory(), 'GECKIT-CODEX.md')
    if (!wanted) {
      await rm(localGuide, { force: true }).catch(() => undefined)
      process.env['GECKIT_SOURCE_CODEX_GUIDE'] = ''
      if (process.env['GECKIT_SOURCE_GUIDE'] === undefined) {
        await removeLaunchers(command)
        delete process.env['GECKIT_SOURCE_CLI']
      }
      return
    }
    if (await writeLaunchers(command)) {
      process.env['GECKIT_SOURCE_CLI'] = command
      await guideWrite(localGuide, codexGuide(employees), strict)
      process.env['GECKIT_SOURCE_CODEX_GUIDE'] = localGuide
    } else if (strict) throw new Error('The source GeckIt command could not be updated.')
    return
  }
  const folder = codexWhere()
  const guide = join(folder, 'GECKIT.md')
  const agents = join(folder, 'AGENTS.md')
  const importLine = `Read ${guide} for how GeckIt works when this conversation runs in GeckIt.`
  const was = await readFile(agents, 'utf8').catch(() => '')
  const linked = was.split('\n').some((line) => line.trim() === importLine)
  if (!wanted) {
    await rm(guide, { force: true }).catch(() => undefined)
    if (!linked) return
    const without = was.split('\n').filter((line) => line.trim() !== importLine).join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n')
    await writeFile(agents, without).catch(() => undefined)
    return
  }
  await mkdir(folder, { recursive: true }).catch(() => undefined)
  const content = codexGuide(employees)
  await guideWrite(guide, content, strict)
  if (linked) return
  const next = was.trim() === '' ? `${importLine}\n` : `${was.replace(/\s*$/, '')}\n\n${importLine}\n`
  await guideWrite(agents, next, strict)
}

/** The Claude plugin GeckIt hands its own local Claude sessions with --plugin-dir, holding the browser skill while Chrome through GeckIt is on. */
export const browserPluginFolder = (): string => join(dataDirectory(), 'claude-plugin')

const browserRules = (said: string): string => fill(PROMPTS.browser.rules, { said })

const browserHow = (said: string): string => `${fill(PROMPTS.browser.how, { said })}\n`

/** The skill that holds how to work in Chrome, loaded only when a conversation needs it. */
export const BROWSER_SKILL = (command: string, name: string): string => {
  const said = command.includes(' ') ? `"${command}"` : command
  return `${fill(PROMPTS.browser.skill, { name, rules: browserRules(said), how: fill(PROMPTS.browser.how, { said }) })}\n`
}

/** What a provider library is handed while Chrome through GeckIt is on, to start Claude with the skill and the rule and without Claude in Chrome. */
export const browserBridge = (): BrowserBridge | undefined =>
  browserBridgeOn() && existsSync(browserPluginFolder()) ? { pluginDir: browserPluginFolder(), rule: BROWSER(cliPath(), true).trim() } : undefined

/** What the main guide says while Chrome through GeckIt is on: the rule, and where the skill is, or the whole of it where no skill can be given. */
export const BROWSER = (command: string, claude = false, inline = false): string => {
  if (!browserBridgeOn()) return ''
  const said = command.includes(' ') ? `"${command}"` : command
  const how = inline ? `\n${browserHow(said)}` : ` ${fill(PROMPTS.browser.loadSkill, { skill: claude ? 'geckit:browser' : 'geckit-browser' })}\n`
  return `\n${fill(PROMPTS.browser.section, { rules: browserRules(said) })}${how}`
}

const codexGuide = (employees: readonly Employee[]): string => {
  const command = (process.platform === 'win32' ? COMMAND(`${cliPath()}.cmd`, 'file', false) : COMMAND(cliPath(), 'heredoc', false))
    .replaceAll('Claude Code', 'Codex')
    .replaceAll('Claude', 'Codex')
  return currentGuide('AGENTS.md') + command + BROWSER(process.platform === 'win32' ? `${cliPath()}.cmd` : cliPath(), false, fromSource()) + EMPLOYEES(employees, process.platform === 'win32' ? `${cliPath()}.cmd` : cliPath()) + MANAGER()
}
