import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { app } from 'electron'

import { forwardSlashes } from '../cli/endpoint'

/**
 * What Claude Code is told about being run by GeckIt.
 *
 * A conversation here answers into a window with a board behind it, and none
 * of that is in the tool's own instructions: the person who installs GeckIt
 * would have to write it themselves, and most of them never will. GeckIt keeps
 * `GECKIT.md` beside the tool's own `CLAUDE.md` and one line in `CLAUDE.md`
 * that reads it, and leaves everything else in that file alone.
 */

const IMPORT = '@GECKIT.md'

const where = (): string => process.env['CLAUDE_CONFIG_DIR'] ?? join(homedir(), '.claude')
const codexWhere = (): string => process.env['CODEX_HOME'] ?? join(homedir(), '.codex')

/** Run from the source rather than installed; outside Electron, as in the tests, it is taken as installed. */
const fromSource = (): boolean => (app as typeof app | undefined)?.isPackaged === false

/**
 * Where the command is written, and what it is called from a shell. Run from
 * the source it is `geckit-local`, which reaches that copy. Forward slashes on
 * Windows too: every shell there reads them, and a backslash in a line of
 * GECKIT.md would be read as an escape by the one Claude Code runs.
 */
export const cliPath = (): string => forwardSlashes(join(homedir(), '.geckit', 'bin', fromSource() ? 'geckit-local' : 'geckit'))

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
  const sh = [
    '#!/bin/sh',
    '# Written by GeckIt when it starts. Anything changed here is written over.',
    `GECKIT_DATA=${JSON.stringify(forwardSlashes(data))} ELECTRON_RUN_AS_NODE=1 exec ${JSON.stringify(forwardSlashes(execPath))} ${JSON.stringify(forwardSlashes(script))} "$@"`,
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
  const electron = app as typeof app | undefined
  if (electron === undefined) return false
  const made = launchers(process.execPath, join(electron.getAppPath(), 'out', 'main', 'cli.js'), electron.getPath('userData'))
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

const EXAMPLE = `[
  {
    "project": "web",
    "title": "Checkout button stays disabled after a failed payment",
    "text": "In src/checkout/PayButton.tsx the button is disabled while a payment runs and never enabled again when the payment fails, so the buyer has to reload the page. Found while fixing the coupon field in another conversation; the failure can be forced with the card 4000 0000 0000 0002 on the test server. Enable the button again on failure and add a test beside PayButton.test.tsx. Done when that test passes and npm test is green.",
    "goal": "a failed payment leaves the pay button enabled, and npm test passes"
  }
]`

const SEND = (said: string, batch: Batch): string =>
  batch === 'heredoc'
    ? ['Send everything in one command, run in the background, since it waits for the person and that can take hours:', '', '```', `${said} start --conversations - <<'EOF'`, EXAMPLE, 'EOF', '```'].join('\n')
    : ['Write the conversations to a file, then send them in one command, run in the background, since it waits for the person and that can take hours:', '', '```', `${said} start --conversations conversations.json`, '```', '', 'with the file holding', '', '```', EXAMPLE, '```'].join('\n')

const COMMAND = (path: string, batch: Batch = 'heredoc'): string => {
  const said = path.includes(' ') ? `"${path}"` : path
  return `
## Asking GeckIt about the work itself

\`${said}\` answers about the conversations, and is the way to find out what was done today rather than reading Claude Code's own files. Everything but \`start\` only reads.

\`\`\`
${said} sessions --today
${said} sessions --since 2d --project formula-business --status review
${said} sessions --today --json
${said} sessions --favorites
${said} show <id>
${said} show <id> --last 10
\`\`\`

\`sessions\` prints one line each, newest first: a \\* for a favorite, the id, when it last changed, the project, how it stands - in progress, review, blocked or done - and the title. \`--today\` and \`--since\` also count one moved between columns in that time, and \`--favorites\` keeps only the favorites. \`show\` prints when it was created and each time it moved to another column, then what was said in it, the person and Claude, without what the tools printed. \`--json\` gives the same for reading with a program, with that history in \`history\` and \`favorite\` true or false.

## Building GeckIt or a provider library

When asked to create or change a provider, run \`${said} instructions providers\` for the contract, example, build and verification instructions. For GeckIt itself, run \`${said} instructions app\`. These commands only read and work with the installed CLI.

## Other conversations

### Asking for new ones

A conversation does the one job it was asked for. Other work that turns up goes to a conversation of its own, started through GeckIt, so this one can finish and the person sees each job as its own card.

Start one when:

- the person asks for work in another project, or asks to split a job into parts;
- you find something worth doing that is not part of what was asked here: a bug beside the one being fixed, a test failing in code nobody touched, a follow-up the change will need later;
- a part of the job can go on without this conversation, and doing it here would hold this one open.

Do not do that work here, and do not only mention it at the end of an answer: a mention is lost once the card moves to Done. You need no leave to send it, since every one asked for is put in front of the person first and they start it or refuse it there. Where you cannot tell whether they want the work at all, ask in your answer and send it once they say yes. Do not send the job you are doing, or a step of it you are about to take yourself. A task, a to-do or a reminder the person asks you to write down is not a conversation either: it goes where their own instructions say such things are kept, and never through this command.

${SEND(said, batch)}

Run it in exactly this form, with the whole path and nothing chained before or after it: GeckIt lets that through without asking, and anything else stops at a permission card. For one short conversation, \`${said} start --project <name> [--title <title>] [--goal <condition>] <text>\` does the same, as long as the text has no quotes, \`$\`, \`;\` or \`&\` in it.

- \`project\` is the folder's name as \`sessions\` prints it. At most 20 at once.
- \`title\` is what the person reads on the card to decide, so say the work in a few words.
- \`text\` is all the new conversation is given, and it knows nothing of this one. Write what to do, where - files, commands, links -, what you already found, and how to tell it is done.
- \`goal\` is optional. Give it when being done can be checked, such as tests passing or a page loading.

The command prints one line per conversation in the order sent - started or queued with its id, or refused - with the person's note on one if there is one, and their reply to you last. A note on a started one was also given to that conversation. A queued one is a conversation already, whose first message waits until fewer of the person's conversations are working. A refusal is an answer: do not send the same thing again, and follow the reply. Then say in your answer what you sent and how it stands.

### Reading linked ones

A conversation started this way remembers the one that asked for it.

\`\`\`
${said} linked
${said} show <id> --last 10
\`\`\`

\`linked\` lists, for this conversation, the one it was started from, the ones it started and how each stands, and what it asked for and was refused. \`show --last\` reads the end of any of them. Look there before starting on anything a linked conversation may already have done or decided, and before telling the person how the work you asked for stands.
`
}

export const GUIDE = `# Working in GeckIt

This session is being run by GeckIt, a desktop app, rather than by somebody at a terminal. GeckIt writes this file and rewrites it when it starts, so nothing added here is kept; put your own instructions in CLAUDE.md beside it.

## What the person is looking at

Each conversation is a card, and the cards stand in three columns: To do, In progress, Done. A card shows its title, the project it is in, the first line of the last thing you said, the goal if it has one, and how much is running in the background. The conversation itself opens over the board when the card is pressed.

So the first line of an answer is the line the person reads without opening anything. Say where the work stands in it - what is done, what is left, what you need from them - and keep the explanation for the lines after it.

## Goals

The person sets a goal with \`/goal <condition>\`, and the condition is a description of what being finished means. A goal holds the session open: when you stop, the condition is checked, and you are sent back to work until it holds. Once it holds, the card stays where it is and shows Goal reached. A goal given up on marks the card Blocked, unless they have already moved the card by hand.

You do not set or clear goals. Say so instead: if the goal cannot be met, say what stands in the way, and if it is already met, say what proves it.

## Links

Every web address written in a conversation is collected on its card, newest first, so the person reaches the pull request, the issue, the document or the deployment from the board without opening anything. Write the whole address of anything you produce or change - a file path is not enough for this, since a path is not a link.

## What runs in the background

Commands, watches and helpers you leave running are listed on the card while they run, and stay there once they end until the person clears them. Nothing is hidden, so say what you have started and what it is waiting for.
`

/** The names given in GeckIt to the Chromes the extension calls Browser 1, Browser 2, or nothing while none is named. */
export const BROWSERS = (names: Readonly<Record<string, string>>): string => {
  const named = Object.entries(names).filter(([, name]) => name.trim() !== '')
  if (named.length === 0) return ''
  return `
## Chrome browsers

The person has named the Chrome browsers Claude in Chrome connects to. The extension calls them Browser 1, Browser 2 and so on; call each by the name below, by its deviceId, in replies and on the options when asking which browser to use.

${named.map(([id, name]) => `- \`${id}\`: ${name.replace(/\s+/g, ' ').trim()}`).join('\n')}
`
}

/**
 * Writes the file and the one line in `CLAUDE.md` that reads it, or takes both
 * away again. Anything that cannot be written is left: this is worth doing when
 * it works and worth nothing at all when it does not.
 */
export async function keepGuide(wanted: boolean, browsers: Readonly<Record<string, string>> = {}): Promise<void> {
  const folder = where()
  const guide = join(folder, 'GECKIT.md')
  const command = cliPath()
  const claude = join(folder, 'CLAUDE.md')
  const was = await readFile(claude, 'utf8').catch(() => '')
  const linked = was.split('\n').some((line) => line.trim() === IMPORT)
  // Run from the source, it has its own command and leaves what Claude Code is told to the installed GeckIt.
  if (fromSource()) {
    if (!wanted) {
      await removeLaunchers(command)
      return
    }
    if (await writeLaunchers(command)) process.env['GECKIT_SOURCE_CLI'] = command
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
  await writeFile(guide, `${GUIDE}${BROWSERS(browsers)}${told ? COMMAND(command) : ''}`).catch(() => undefined)
  if (linked) return
  const next = was.trim() === '' ? `${IMPORT}\n` : `${was.replace(/\s*$/, '')}\n\n${IMPORT}\n`
  await writeFile(claude, next).catch(() => undefined)
}

/** Keep Codex's global instructions linked to GeckIt's guide without changing the person's other instructions. */
export async function keepCodexGuide(wanted: boolean): Promise<void> {
  if (fromSource()) return
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
  const command = (process.platform === 'win32' ? COMMAND(`${cliPath()}.cmd`, 'file') : COMMAND(cliPath()))
    .replaceAll('Claude Code', 'Codex')
    .replaceAll('Claude', 'Codex')
    .replace('Run it in exactly this form, with the whole path and nothing chained before or after it: GeckIt lets that through without asking, and anything else stops at a permission card. ', '')
  const content = GUIDE.replace('CLAUDE.md beside it.', 'AGENTS.md beside it.') + command
  await writeFile(guide, content).catch(() => undefined)
  if (linked) return
  const next = was.trim() === '' ? `${importLine}\n` : `${was.replace(/\s*$/, '')}\n\n${importLine}\n`
  await writeFile(agents, next).catch(() => undefined)
}
