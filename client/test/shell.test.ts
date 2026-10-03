import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { asksToType, plain, runShell, toldClaude, wantsKeyboard } from '../src/main/sessions/shell'
import type { Ran } from '../src/main/sessions/shell'

describe('which commands want a keyboard', () => {
  it('sends editors, pagers, passwords and logins to a terminal', () => {
    for (const command of ['vim README.md', 'sudo rm x', 'git log | less', 'ssh box', 'gh auth login', 'python3', 'EDITOR=vi git commit', 'git rebase -i HEAD~3', 'git add -p', 'git commit --amend', 'gcloud auth login --no-browser'])
      expect(wantsKeyboard(command), command).toBe(true)
  })

  it('runs everything else here, a sign-in done in the browser too', () => {
    for (const command of ['git status', 'npm run watch', 'python3 script.py', 'git commit -m "x"', 'git commit -am x', 'git commit --amend --no-edit', 'ls -la | grep more', 'node -e 1', 'gcloud auth login', 'gcloud auth application-default login', 'az login', 'aws sso login --profile dev'])
      expect(wantsKeyboard(command), command).toBe(false)
  })
})

describe('a command waiting for an answer', () => {
  it('stops on a question left open', () => {
    for (const output of ['Select a subscription and tenant (Type a number or Enter for no changes): ', 'Continue (Y/n)?', 'Overwrite? [y/N]', 'Password:'])
      expect(asksToType(`[Tenant and subscription selection]\n${output}`), output).toBe(true)
  })

  it('goes on after a line that is ended, or one that is not a question', () => {
    for (const output of ['Password:\n', 'Downloading 40%', 'Opening a browser.\n', ''])
      expect(asksToType(output), output).toBe(false)
  })
})

describe('what a command printed', () => {
  it('leaves out colours and what a progress bar wrote over', () => {
    expect(plain('\u001b[32mok\u001b[0m\n10%\r50%\r100%\ndone\r\n')).toBe('ok\n100%\ndone\n')
  })

  it('is handed to Claude in the shape the terminal writes', () => {
    expect(toldClaude('ls', { stdout: '', stderr: '', output: '', code: 0, stopped: false })).toEqual([
      '<bash-input>ls</bash-input>',
      '<bash-stdout>(Bash completed with no output)</bash-stdout><bash-stderr></bash-stderr>',
    ])
    expect(toldClaude('false', { stdout: 'a\n', stderr: 'b', output: 'a\nb', code: 1, stopped: false })[1]).toBe(
      '<bash-stdout>a\n</bash-stdout><bash-stderr>b\nExit code 1</bash-stderr>',
    )
  })
})

describe('running a command', () => {
  // Windows runs a command with cmd.exe, so each one is said in its words there.
  const windows = process.platform === 'win32'
  const was = process.env['SHELL']
  beforeEach(() => {
    process.env['SHELL'] = '/bin/sh'
  })
  afterEach(() => {
    process.env['SHELL'] = was
  })

  it('runs in the folder, keeps what it printed, and says how it exited', async () => {
    const seen: string[] = []
    const ran = await runShell(import.meta.dirname, windows ? 'cd& echo oops>&2& exit 3' : 'pwd; echo oops >&2; exit 3', (output) => seen.push(output)).done
    // On a terminal of its own, as on macOS, the two come on one stream in the order printed; on two pipes either may arrive first.
    if (process.platform === 'darwin') expect(ran.output).toBe(`${import.meta.dirname}\noops\n`)
    else {
      expect(ran.stdout).toBe(`${import.meta.dirname}\n`)
      expect(ran.stderr).toBe('oops\n')
    }
    expect(ran.code).toBe(3)
    expect(ran.stopped).toBe(false)
    expect(seen.at(-1)).toBe(ran.output)
  })

  it('waits for what is typed when it asks', async () => {
    const seen: string[] = []
    const running = runShell(
      import.meta.dirname,
      // cmd expands %answer% as it reads the line, before set /p has filled it; call expands it again after.
      windows ? 'set /p answer=Continue (Y/n)? & call echo got %answer%' : 'printf "Continue (Y/n)? "; read -r answer; echo "got $answer"',
      (output) => seen.push(output),
    )
    await vi.waitFor(() => expect(seen.at(-1)).toBe('Continue (Y/n)? '), { timeout: 5000 })
    running.write?.('n\n')
    const ran = await running.done
    expect(ran.output).toMatch(/got n\n$/)
    expect(ran.code).toBe(0)
  })

  it.skipIf(process.platform !== 'darwin')('shows a zsh startup prompt before the command starts and accepts its answer', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'geckit-shell-startup-'))
    const seen: string[] = []
    await writeFile(join(folder, '.zshrc'), 'printf "Startup update? [Y/n] "; read -r answer\n')
    vi.stubEnv('SHELL', '/bin/zsh')
    vi.stubEnv('ZDOTDIR', folder)
    const running = runShell(folder, 'printf "%s\\n" command-finished', (output) => seen.push(output))
    try {
      await vi.waitFor(() => expect(seen.at(-1)).toBe('Startup update? [Y/n] '), { timeout: 1000 })
      running.write?.('n\n')
      const ran = await running.done
      expect(ran.output).toBe('command-finished\n')
      expect(ran.code).toBe(0)
      expect(ran.stopped).toBe(false)
    } finally {
      running.stop()
      await running.done
      vi.unstubAllEnvs()
      await rm(folder, { recursive: true, force: true })
    }
  })

  it.skipIf(process.platform !== 'darwin')('disables startup maintenance prompts while preserving the zsh environment and aliases', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'geckit-shell-maintenance-'))
    await writeFile(join(folder, '.zshrc'), [
      'if [[ "$DISABLE_AUTO_UPDATE" != true ]]; then',
      '  printf "Startup update? [Y/n] "; read -r answer',
      'fi',
      'export GECKIT_SHELL_FIXTURE="${GECKIT_SHELL_FIXTURE}:loaded"',
      'alias fixture_status=\'printf "%s\\n" "$GECKIT_SHELL_FIXTURE"\'',
      '',
    ].join('\n'))
    vi.stubEnv('SHELL', '/bin/zsh')
    vi.stubEnv('ZDOTDIR', folder)
    vi.stubEnv('DISABLE_AUTO_UPDATE', 'false')
    vi.stubEnv('GECKIT_SHELL_FIXTURE', 'inherited')
    const running = runShell(folder, 'fixture_status', () => undefined)
    let finished: Ran | undefined
    void running.done.then((ran) => { finished = ran })
    try {
      await vi.waitFor(() => expect(finished).toBeDefined(), { timeout: 1000 })
      const ran = await running.done
      expect(ran.output).toBe('inherited:loaded\n')
      expect(ran.code).toBe(0)
      expect(ran.stopped).toBe(false)
      expect(process.env['DISABLE_AUTO_UPDATE']).toBe('false')
    } finally {
      running.stop()
      await running.done
      vi.unstubAllEnvs()
      await rm(folder, { recursive: true, force: true })
    }
  })

  it('stops what it started', async () => {
    const running = runShell(import.meta.dirname, windows ? 'echo started& ping -n 30 127.0.0.1 >nul' : 'echo started; sleep 30', () => undefined)
    await new Promise((done) => setTimeout(done, 300))
    running.stop()
    const ran = await running.done
    expect(ran.stopped).toBe(true)
    // bash says something of its own on the way out, which zsh does not.
    expect(ran.output).toMatch(/^started\n/)
  })
})
