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
import { fill, PROMPTS, SKILL_TEMPLATES } from '../prompts/prompts'

/**
 * What Claude Code is told about being run by GeckIt.
 *
 * A conversation here answers into a window with a board behind it, and none
 * of that is in the tool's own instructions: the person who installs GeckIt
 * would have to write it themselves, and most of them never will. GeckIt keeps
 * `GECKIT.md` beside the tool's own `CLAUDE.md` and a marked block in
 * `CLAUDE.md` that reads it, and leaves everything else in that file alone.
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

export function EMPLOYEES(_employees: readonly Employee[], command = cliPath(), claude = true): string {
  const said = command.includes(' ') ? `"${command}"` : command
  return `\n${fill(PROMPTS.guide.employees, { said, employeesSkill: skillSaid('manage-employees', claude), employeesPath: skillPath('manage-employees', claude) })}\n`
}

/** Turns Chrome through GeckIt on or off: the extension and its native host, the download of the find model, and what the guides and Codex's sandbox say about it. */
let stopLaunches: (() => void) | undefined

export function keepBrowserBridge(on: boolean): void {
  setBrowserBridgeOn(on)
  try {
    keepSkills(on)
    if (!on) { stopLaunches?.(); stopLaunches = undefined; removeBrowserBridge(); return }
    const launcher = corePlatform().launcher?.()
    if (launcher !== undefined) installBrowserBridge(launcher.executable, launcher.script)
    if (launcher !== undefined && stopLaunches === undefined) stopLaunches = serveTestLaunches(launcher.executable, launcher.script)
    if (findModelServer()) void fetchFindModel()
  } catch { /* the bridge is worth having when it can be written and nothing when it cannot */ }
}

/** The browser skill's name: `geckit:use-browser` in GeckIt's Claude plugin, `geckit-use-browser` among Codex's skills. */
export const BROWSER_SKILL_NAME = 'use-browser'

/** The secrets skill's name, installed whether or not Chrome through GeckIt is on, since secrets serve commands, HTTP and SSH too. */
export const SECRETS_SKILL_NAME = 'use-secrets'

const codexSkillName = `geckit-${BROWSER_SKILL_NAME}`

/** How a skill is named where a conversation is told to load it. */
const skillSaid = (name: string, claude: boolean): string => claude ? `geckit:${name}` : `geckit-${name}`

/** Where Codex finds the person's own skills, as ai-skills installs them. */
export const codexSkillFolder = (name: string = codexSkillName): string => join(homedir(), '.agents', 'skills', name)

/** Where earlier versions put the Codex skill, taken away when the installed GeckIt starts. */
const legacyCodexSkill = (): string => join(codexWhere(), 'skills', 'geckit-browser')

function writeSkill(folder: string, files: Readonly<Record<string, string>>): void {
  rmSync(folder, { recursive: true, force: true })
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(folder, path, '..'), { recursive: true })
    writeFileSync(join(folder, path), content)
  }
}

/**
 * The skills: in GeckIt's own Claude plugin for its Claude sessions, and among
 * Codex's skills for the installed GeckIt. The secrets skill is always there,
 * the browser skill while Chrome through GeckIt is on. Written whole at every
 * start, so an older name or file does not stay behind.
 */
function keepSkills(browser: boolean): void {
  const plugin = browserPluginFolder()
  const installed = !fromSource()
  if (installed) rmSync(legacyCodexSkill(), { recursive: true, force: true })
  mkdirSync(join(plugin, '.claude-plugin'), { recursive: true })
  writeFileSync(join(plugin, '.claude-plugin', 'plugin.json'), `${JSON.stringify({ name: 'geckit', version: '1.0.0', description: 'What GeckIt gives the Claude conversations it runs.', author: { name: 'Alex Netrebskii' } }, undefined, 2)}\n`)
  rmSync(join(plugin, 'skills'), { recursive: true, force: true })
  for (const name of bundledSkillNames()) {
    const codexFolder = skillDirectory(name, false)
    if (name === BROWSER_SKILL_NAME && !browser) {
      rmSync(codexFolder, { recursive: true, force: true })
      continue
    }
    writeSkill(skillDirectory(name, true), skillFiles(cliPath(), name, name))
    const command = process.platform === 'win32' ? `${cliPath()}.cmd` : cliPath()
    writeSkill(codexFolder, skillFiles(command, name, `geckit-${name}`))
  }
}

export const bundledSkillNames = (): string[] => Object.keys(SKILL_TEMPLATES)
  .filter((path) => path.endsWith('/SKILL.md'))
  .map((path) => path.split('/').at(-2) ?? '')

const skillDirectory = (name: string, claude: boolean): string => claude
  ? join(browserPluginFolder(), 'skills', name)
  : fromSource() ? join(dataDirectory(), 'codex-skills', `geckit-${name}`) : codexSkillFolder(`geckit-${name}`)

const skillPath = (name: string, claude: boolean): string => `\`${join(skillDirectory(name, claude), 'SKILL.md')}\``

export function MANAGER_WORKFLOWS(claude: boolean): string {
  return fill(PROMPTS.guide.managerWorkflows, {
    lifecycleSkill: skillSaid('manage-worker-lifecycle', claude), lifecyclePath: skillPath('manage-worker-lifecycle', claude),
    progressSkill: skillSaid('review-progress-tasks', claude), progressPath: skillPath('review-progress-tasks', claude),
    scheduleSkill: skillSaid('schedule-tasks', claude), schedulePath: skillPath('schedule-tasks', claude),
    employeesSkill: skillSaid('manage-employees', claude), employeesPath: skillPath('manage-employees', claude),
    slackReplySkill: skillSaid('send-slack-reply', claude), slackReplyPath: skillPath('send-slack-reply', claude),
    telegramReplySkill: skillSaid('send-telegram-reply', claude), telegramReplyPath: skillPath('send-telegram-reply', claude),
    discordReplySkill: skillSaid('send-discord-reply', claude), discordReplyPath: skillPath('send-discord-reply', claude),
  })
}

export function skillFiles(command: string, sourceName: string, name: string): ReturnType<typeof browserSkillFiles> {
  const said = command.includes(' ') ? `"${command}"` : command
  const claude = !name.startsWith('geckit-')
  const values = {
    said, name, example: PROMPTS.guide.example,
    paired: knownComputers().length === 0 ? 'None is paired now.' : `Paired now: ${knownComputers().map((one) => one.name).join(', ')}.`,
    send: SEND(said, process.platform === 'win32' && !claude ? 'file' : 'heredoc'),
    otherComputers: OTHER_COMPUTERS(said), exactForm: claude ? `${PROMPTS.guide.exactForm} ` : '',
    secrets: `the \`${skillSaid(SECRETS_SKILL_NAME, claude)}\` skill`,
    employeeReviewSkill: skillSaid('review-employee-work', claude), employeeReviewPath: skillPath('review-employee-work', claude),
    profilesSkill: skillSaid('configure-browser-profile', claude), profilesPath: skillPath('configure-browser-profile', claude),
    lifecycleSkill: skillSaid('manage-worker-lifecycle', claude), lifecyclePath: skillPath('manage-worker-lifecycle', claude),
    scheduleSkill: skillSaid('schedule-tasks', claude), schedulePath: skillPath('schedule-tasks', claude),
  }
  const prefix = `../../../skills/${sourceName}/`
  return Object.fromEntries(Object.entries(SKILL_TEMPLATES)
    .filter(([path]) => path.startsWith(prefix))
    .map(([path, text]) => [path.slice(prefix.length), fill(path.endsWith('/SKILL.md') ? text.replace(/^name: .+$/m, `name: ${name}`) : text, values)]))
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

const BEGIN = '<!-- geckit:begin'
const END = '<!-- geckit:end -->'
const HERE = '\u0000'

/**
 * The person's instructions file with GeckIt's block put in, refreshed in
 * place or taken out, the way ai-skills keeps its profiles: a marked block
 * naming its source, and nothing outside it touched. A bare line left by an
 * earlier version is turned into the block where it stands. Undefined when
 * the markers are broken, so the file is left as it is.
 */
export function withGuideBlock(was: string, source: string, body: string | undefined, legacy: string): string | undefined {
  const lines = was.split('\n')
  const begins = lines.filter((line) => line.startsWith(BEGIN)).length
  const ends = lines.filter((line) => line.trim() === END).length
  const start = lines.findIndex((line) => line.startsWith(BEGIN))
  const end = lines.findIndex((line) => line.trim() === END)
  if (begins !== ends || begins > 1 || end < start) return undefined
  let kept = begins === 1 ? [...lines.slice(0, start), HERE, ...lines.slice(end + 1)] : lines
  let placed = kept.includes(HERE)
  kept = kept.flatMap((line) => {
    if (line.trim() !== legacy) return [line]
    if (placed) return []
    placed = true
    return [HERE]
  })
  const block = body === undefined ? [] : [`${BEGIN} source=${source} -->`, body, END]
  if (placed) kept = kept.flatMap((line) => line === HERE ? block : [line])
  else if (body !== undefined) {
    while (kept.length > 0 && kept[kept.length - 1]?.trim() === '') kept.pop()
    kept = [...kept, ...(kept.length > 0 ? [''] : []), ...block]
  }
  const text = kept.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\s+/, '').replace(/\s*$/, '\n')
  return text.trim() === '' ? '' : text
}

/** Puts the block in or takes it out, writing only when that changes the file; a broken block is reported where it has to be and otherwise left. */
async function keepGuideBlock(file: string, source: string, body: string | undefined, legacy: string, strict: boolean): Promise<void> {
  const was = await readFile(file, 'utf8').catch(() => '')
  const next = withGuideBlock(was, source, body, legacy)
  if (next === undefined) {
    if (strict) throw new Error(`GeckIt's block in ${file} has a missing or repeated marker; the file was left unchanged.`)
    return
  }
  if (next === was) return
  await guideWrite(file, next, strict)
}

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

const COMMAND = (path: string, claude = true): string => {
  const said = path.includes(' ') ? `"${path}"` : path
  return `\n${fill(PROMPTS.guide.command, {
    said, conversationsSkill: skillSaid('manage-conversations', claude), conversationsPath: skillPath('manage-conversations', claude),
    remoteConnectionSkill: skillSaid('configure-remote-connection', claude), remoteConnectionPath: skillPath('configure-remote-connection', claude),
    remoteGeckitSkill: skillSaid('configure-remote-geckit', claude), remoteGeckitPath: skillPath('configure-remote-geckit', claude),
    slackSkill: skillSaid('configure-slack', claude), slackPath: skillPath('configure-slack', claude),
    profilesSkill: skillSaid('configure-browser-profile', claude), profilesPath: skillPath('configure-browser-profile', claude),
    lifecycleSkill: skillSaid('manage-worker-lifecycle', claude), lifecyclePath: skillPath('manage-worker-lifecycle', claude),
    progressSkill: skillSaid('review-progress-tasks', claude), progressPath: skillPath('review-progress-tasks', claude),
    scheduleSkill: skillSaid('schedule-tasks', claude), schedulePath: skillPath('schedule-tasks', claude),
  })}\n`
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
 * Writes the file and the marked block in `CLAUDE.md` that reads it, or takes both
 * away again. Anything that cannot be written is left: this is worth doing when
 * it works and worth nothing at all when it does not.
 */
export async function keepGuide(wanted: boolean, browsers: Readonly<Record<string, string>> = {}, employees: readonly Employee[] = guideEmployees, strict = false): Promise<void> {
  const folder = where()
  const guide = join(folder, 'GECKIT.md')
  const command = cliPath()
  const claude = join(folder, 'CLAUDE.md')
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
      await guideWrite(localGuide, `${currentGuide()}${BROWSERS(browsers)}${COMMAND(command)}${BROWSER(command, true)}${SECRETS(command, true)}${EMPLOYEES(employees, command)}${MANAGER()}`, strict)
      process.env['GECKIT_SOURCE_GUIDE'] = localGuide
    } else if (strict) throw new Error('The source GeckIt command could not be updated.')
    return
  }
  if (!wanted) {
    await rm(guide, { force: true }).catch(() => undefined)
    await removeLaunchers(command)
    await keepGuideBlock(claude, guide, undefined, IMPORT, false)
    return
  }
  await mkdir(folder, { recursive: true }).catch(() => undefined)
  const told = await writeLaunchers(command)
  if (strict && !told) throw new Error('The GeckIt command could not be updated.')
  await guideWrite(guide, `${currentGuide()}${BROWSERS(browsers)}${told ? COMMAND(command) + BROWSER(command, true) + SECRETS(command, true) + EMPLOYEES(employees, command) : ''}${MANAGER()}`, strict)
  await keepGuideBlock(claude, guide, IMPORT, IMPORT, strict)
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
  if (!wanted) {
    await rm(guide, { force: true }).catch(() => undefined)
    await keepGuideBlock(agents, guide, undefined, importLine, false)
    return
  }
  await mkdir(folder, { recursive: true }).catch(() => undefined)
  await guideWrite(guide, codexGuide(employees), strict)
  await keepGuideBlock(agents, guide, importLine, importLine, strict)
}

/** The Claude plugin GeckIt hands its own local Claude sessions with --plugin-dir: the secrets skill, and the browser skill while Chrome through GeckIt is on. */
export const browserPluginFolder = (): string => join(dataDirectory(), 'claude-plugin')

const browserRules = (said: string): string => fill(PROMPTS.browser.rules, { said })

type Reference = keyof typeof PROMPTS.browser.references

const REFERENCES: Readonly<Record<string, Reference>> = { testBrowsers: 'test-browsers', designChecks: 'design-checks' }

const referenceTitle = (text: string): string => text.split('\n')[0]?.replace(/^#+\s*/, '') ?? ''

/** The skill's main text; inline, as in a guide where no skill can be given, its references follow it and are named as sections below. */
const browserHow = (said: string, inline = false, claude = true): string => {
  const named = Object.fromEntries(Object.entries(REFERENCES).map(([key, file]) => {
    const title = referenceTitle(PROMPTS.browser.references[file])
    return [key, inline ? `the ${title} section below` : `[${title.toLowerCase()}](references/${file}.md)`]
  }))
  const secrets = inline ? 'the Secrets section of this guide' : `the \`${skillSaid(SECRETS_SKILL_NAME, claude)}\` skill`
  const template = PROMPTS.browser.how.replace('[test browsers](references/test-browsers.md)', '{{testBrowsers}}').replace('[design checks](references/design-checks.md)', '{{designChecks}}')
  const how = fill(template, { said, ...named, secrets, profilesSkill: skillSaid('configure-browser-profile', claude), profilesPath: skillPath('configure-browser-profile', claude) })
  if (!inline) return how
  return [how, ...Object.values(PROMPTS.browser.references).map((text) => fill(text, { said }))].join('\n\n')
}

/** The skill that holds how to work in Chrome, loaded only when a conversation needs it. */
export const BROWSER_SKILL = (command: string, name: string): string => browserSkillFiles(command, name)['SKILL.md'] ?? ''

export const browserSkillFiles = (command: string, name: string): Readonly<Record<string, string>> => skillFiles(command, BROWSER_SKILL_NAME, name)

export const secretsSkillFiles = (command: string, name: string): ReturnType<typeof browserSkillFiles> => skillFiles(command, SECRETS_SKILL_NAME, name)

/** What every guide says about secrets: the rule, and the skill that says how, or the whole of it where no skill can be given. */
export const SECRETS = (command: string, claude = false, inline = false): string => {
  const said = command.includes(' ') ? `"${command}"` : command
  const section = fill(PROMPTS.secrets.section, { skill: skillSaid(SECRETS_SKILL_NAME, claude), skillPath: skillPath(SECRETS_SKILL_NAME, claude) })
  return `\n${section}${inline ? `\n\n${fill(PROMPTS.secrets.how, { said }).replace(/^## /gm, '### ')}` : ''}\n`
}

/** What a provider library is handed while Chrome through GeckIt is on, to start Claude with the skill and the rule and without Claude in Chrome. */
export const browserBridge = (): BrowserBridge | undefined =>
  browserBridgeOn() && existsSync(browserPluginFolder()) ? { pluginDir: browserPluginFolder(), rule: browserRules(cliPath()).trim() } : undefined

/** What the main guide says while Chrome through GeckIt is on: the rule, and where the skill is, or the whole of it where no skill can be given. */
export const BROWSER = (command: string, claude = false, inline = false): string => {
  if (!browserBridgeOn()) return ''
  const said = command.includes(' ') ? `"${command}"` : command
  const how = inline ? `\n${browserRules(said)}\n${browserHow(said, true, claude)}\n` : ''
  return `\n${fill(PROMPTS.browser.section, { said, skill: skillSaid(BROWSER_SKILL_NAME, claude), skillPath: skillPath(BROWSER_SKILL_NAME, claude) })}${how}\n`
}

const codexGuide = (employees: readonly Employee[]): string => {
  const command = COMMAND(process.platform === 'win32' ? `${cliPath()}.cmd` : cliPath(), false)
  const said = process.platform === 'win32' ? `${cliPath()}.cmd` : cliPath()
  return currentGuide('AGENTS.md') + command + BROWSER(said, false) + SECRETS(said, false) + EMPLOYEES(employees, process.platform === 'win32' ? `${cliPath()}.cmd` : cliPath(), false) + MANAGER()
}
