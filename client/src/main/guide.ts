import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

import { app } from 'electron'

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

/** Where the command is written, and what it is called from a shell. */
export const cliPath = (): string => join(homedir(), '.geckit', 'bin', 'geckit')

/**
 * The command, as a line that runs the application's own Node on the script
 * built beside the main process. Nothing has to be installed for it, and it
 * finds GeckIt's own folder because the path is written into the line.
 */
function launcher(): string {
  const script = join(app.getAppPath(), 'out', 'main', 'cli.js')
  return [
    '#!/bin/sh',
    '# Written by GeckIt when it starts. Anything changed here is written over.',
    `GECKIT_DATA=${JSON.stringify(app.getPath('userData'))} ELECTRON_RUN_AS_NODE=1 exec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)} "$@"`,
    '',
  ].join('\n')
}

const COMMAND = (path: string): string => `
## Asking GeckIt about the work itself

\`${path}\` answers about the conversations, and is the way to find out what was done today rather than reading Claude Code's own files. It only reads.

\`\`\`
${path} sessions --today
${path} sessions --since 2d --project formula-business --status review
${path} sessions --today --json
${path} sessions --favorites
${path} show <id>
\`\`\`

\`sessions\` prints one line each, newest first: a \\* for a favorite, the id, when it last changed, the project, how it stands - in progress, review, blocked or done - and the title. \`--today\` and \`--since\` also count one moved between columns in that time, and \`--favorites\` keeps only the favorites. \`show\` prints when it was created and each time it moved to another column, then what was said in it, the person and Claude, without what the tools printed. \`--json\` gives the same for reading with a program, with that history in \`history\` and \`favorite\` true or false.
`

export const GUIDE = `# Working in GeckIt

This session is being run by GeckIt, a desktop app, rather than by somebody at a terminal. GeckIt writes this file and rewrites it when it starts, so nothing added here is kept; put your own instructions in CLAUDE.md beside it.

## What the person is looking at

Each conversation is a card, and the cards stand in three columns: In progress, In review, Done. A card shows its title, the project it is in, the first line of the last thing you said, the goal if it has one, and how much is running in the background. The conversation itself opens over the board when the card is pressed.

So the first line of an answer is the line the person reads without opening anything. Say where the work stands in it - what is done, what is left, what you need from them - and keep the explanation for the lines after it.

## Goals

The person sets a goal with \`/goal <condition>\`, and the condition is a description of what being finished means. A goal holds the session open: when you stop, the condition is checked, and you are sent back to work until it holds. Once it holds, GeckIt moves the card to In review by itself, and a goal given up on marks the card Blocked. Neither happens if they have already moved the card by hand.

You do not set or clear goals. Say so instead: if the goal cannot be met, say what stands in the way, and if it is already met, say what proves it.

## Links

Every web address written in a conversation is collected on its card, newest first, so the person reaches the pull request, the issue, the document or the deployment from the board without opening anything. Write the whole address of anything you produce or change - a file path is not enough for this, since a path is not a link.

## What runs in the background

Commands, watches and helpers you leave running are listed on the card while they run, and stay there once they end until the person clears them. Nothing is hidden, so say what you have started and what it is waiting for.
`

/**
 * Writes the file and the one line in `CLAUDE.md` that reads it, or takes both
 * away again. Anything that cannot be written is left: this is worth doing when
 * it works and worth nothing at all when it does not.
 */
export async function keepGuide(wanted: boolean): Promise<void> {
  const folder = where()
  const guide = join(folder, 'GECKIT.md')
  const command = cliPath()
  const claude = join(folder, 'CLAUDE.md')
  const was = await readFile(claude, 'utf8').catch(() => '')
  const linked = was.split('\n').some((line) => line.trim() === IMPORT)
  if (!wanted) {
    await rm(guide, { force: true }).catch(() => undefined)
    await rm(command, { force: true }).catch(() => undefined)
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
  // A shell line, so Windows is left with the guide alone until there is one it can run.
  const told = await (process.platform === 'win32'
    ? Promise.resolve(false)
    : mkdir(join(command, '..'), { recursive: true })
        .then(() => writeFile(command, launcher()))
        .then(() => chmod(command, 0o755))
        .then(() => true)
        .catch(() => false))
  await writeFile(guide, told ? `${GUIDE}${COMMAND(command)}` : GUIDE).catch(() => undefined)
  if (linked) return
  const next = was.trim() === '' ? `${IMPORT}\n` : `${was.replace(/\s*$/, '')}\n\n${IMPORT}\n`
  await writeFile(claude, next).catch(() => undefined)
}
