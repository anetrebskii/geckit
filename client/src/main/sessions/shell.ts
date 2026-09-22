import { spawn } from 'node:child_process'

/**
 * A command typed after `!` in the composer, run in the project folder the way
 * a terminal runs it: in the person's own shell, logged in and interactive, so
 * the PATH and the aliases their `.zshrc` sets up are there.
 *
 * It has no keyboard. A command that wants one is opened in a terminal instead
 * (`wantsKeyboard`); one that asks anyway reads nothing and goes on or fails.
 */

export interface Ran {
  readonly stdout: string
  readonly stderr: string
  /** Both, in the order they came. */
  readonly output: string
  readonly code: number | undefined
  readonly stopped: boolean
}

export interface Running {
  readonly done: Promise<Ran>
  stop(): void
}

/** Printed before the command, so whatever the shell's own start-up printed is left out. */
const MARK = '<<geckit-shell>>'

/** How much of what it printed is kept, from the end, which is where an error is. */
const MOST = 30_000

const ESCAPES = new RegExp(`${String.fromCharCode(27)}(\\[[0-9;?]*[ -/]*[@-~]|\\][^${String.fromCharCode(7)}]*${String.fromCharCode(7)}|[()][A-Z0-9])`, 'g')

/** What a terminal would show: no colours, and a line a progress bar wrote over shown as it was left. */
export function plain(text: string): string {
  return text.replace(ESCAPES, '').replace(/\r\n/g, '\n').replace(/^.*\r(?!$)/gm, '').replace(/\r$/gm, '')
}

/** How long a command has to stop once asked before it is made to. */
const STOP_FOR = 3_000

/** A shell that takes the same words as sh; fish, say, does not, and gets sh instead. */
const SH_LIKE = /\/(zsh|bash|sh|ksh|dash)$/

const kept = (text: string): string => (text.length > MOST * 2 ? text.slice(-MOST * 2) : text)

const cut = (text: string): string =>
  text.length > MOST ? `(${String(text.length - MOST)} characters before this left out)\n${text.slice(-MOST)}` : text

export function runShell(root: string, command: string, heard: (output: string) => void): Running {
  const windows = process.platform === 'win32'
  const child = windows
    ? spawn(process.env['ComSpec'] ?? 'cmd.exe', ['/d', '/s', '/c', command], {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        windowsVerbatimArguments: true,
      })
    : spawn(
        SH_LIKE.test(process.env['SHELL'] ?? '') ? (process.env['SHELL'] ?? '') : '/bin/sh',
        // No job control, so the command stays in the group Stop reaches; and a subshell, so `exit` in it does not log out.
        ['-ilc', `set +m 2>/dev/null; printf '%s\\n' '${MARK}'; printf '%s\\n' '${MARK}' >&2; (\n${command}\n)`],
        {
          cwd: root,
          stdio: ['ignore', 'pipe', 'pipe'],
          // Its own group, so Stop reaches whatever it started, and no terminal to ask a password on.
          detached: true,
        },
      )
  const streams = { stdout: { seen: windows, text: '' }, stderr: { seen: windows, text: '' } }
  let both = ''
  let stopped = false

  const take = (which: 'stdout' | 'stderr', chunk: Buffer): void => {
    const stream = streams[which]
    let words = chunk.toString('utf8')
    if (!stream.seen) {
      stream.text += words
      const at = stream.text.indexOf(`${MARK}\n`)
      if (at === -1) return
      stream.seen = true
      words = stream.text.slice(at + MARK.length + 1)
      stream.text = ''
    }
    stream.text = kept(stream.text + words)
    both = kept(both + words)
    heard(cut(plain(both)))
  }
  child.stdout.on('data', (chunk: Buffer) => take('stdout', chunk))
  child.stderr.on('data', (chunk: Buffer) => take('stderr', chunk))

  const done = new Promise<Ran>((resolve) => {
    const end = (code: number | undefined): void => {
      // A shell that never got as far as the command: what it said is why.
      for (const which of ['stdout', 'stderr'] as const) {
        if (streams[which].seen) continue
        streams[which].seen = true
        both = kept(both + streams[which].text)
      }
      resolve({
        stdout: cut(plain(streams.stdout.text)),
        stderr: cut(plain(streams.stderr.text)),
        output: cut(plain(both)),
        code,
        stopped,
      })
    }
    child.on('error', (error) => {
      streams.stderr.text += error.message
      end(undefined)
    })
    child.on('close', (code) => end(code ?? undefined))
  })

  return {
    done,
    stop() {
      if (child.pid === undefined || child.exitCode !== null) return
      stopped = true
      const pid = child.pid
      const kill = (signal: NodeJS.Signals): void => {
        try {
          if (windows) child.kill(signal)
          else process.kill(-pid, signal)
        } catch {
          // Gone already.
        }
      }
      kill('SIGTERM')
      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) kill('SIGKILL')
      }, STOP_FOR).unref()
    },
  }
}

/** Programs that are nothing without somebody at a keyboard: an editor, a pager, a password. */
const KEYBOARD = new Set(['sudo', 'su', 'ssh', 'vi', 'vim', 'nvim', 'nano', 'emacs', 'less', 'more', 'man', 'top', 'htop', 'btop', 'tmux', 'screen', 'watch', 'passwd'])

/** Programs that wait to be talked to when they are given nothing to do. */
const TALKS = new Set(['python', 'python3', 'node', 'irb', 'ipython', 'psql', 'mysql', 'sqlite3', 'redis-cli', 'mongosh', 'bash', 'zsh', 'sh', 'fish', 'claude'])

/** Git opens an editor for a commit with no message, and asks line by line for these. */
const GIT = /\bgit\s+(rebase\s+(-i|--interactive)\b|add\s+(-p|-i|--patch|--interactive)\b|commit\b(?!.*\s(-\w*m|-F|--message|--file|--no-edit)))/

/** Whether a command wants a keyboard, and goes to a terminal rather than being run here. */
export function wantsKeyboard(command: string): boolean {
  // Each program in a pipe or a chain, with the variables set in front of it left off.
  const programs = command
    .split(/\|\|?|&&|;/)
    .map((part) => part.trim().split(/\s+/).filter((word, at, words) => !words.slice(0, at + 1).every((one) => /^\w+=/.test(one))))
  if (programs.some((words) => KEYBOARD.has(words[0] ?? ''))) return true
  if (programs.some((words) => words.length === 1 && TALKS.has(words[0] ?? ''))) return true
  return GIT.test(command) || /\b(login|signin)\b/.test(command) || /\baws\s+configure\b/.test(command)
}

/** What Claude is handed with the next message, in the shape the terminal's `!` writes it. */
export function toldClaude(command: string, ran: Ran): readonly [string, string] {
  const said = ran.stdout === '' && ran.stderr === '' ? '(Bash completed with no output)' : ran.stdout
  const how = ran.stopped ? 'Stopped' : ran.code !== undefined && ran.code !== 0 ? `Exit code ${String(ran.code)}` : ''
  const stderr = how === '' ? ran.stderr : `${ran.stderr}${ran.stderr === '' || ran.stderr.endsWith('\n') ? '' : '\n'}${how}`
  return [`<bash-input>${command}</bash-input>`, `<bash-stdout>${said}</bash-stdout><bash-stderr>${stderr}</bash-stderr>`]
}
