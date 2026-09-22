import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { plain, runShell, toldClaude, wantsKeyboard } from '../src/main/sessions/shell'

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
  const was = process.env['SHELL']
  beforeEach(() => {
    process.env['SHELL'] = '/bin/sh'
  })
  afterEach(() => {
    process.env['SHELL'] = was
  })

  it('runs in the folder, keeps what it printed, and says how it exited', async () => {
    const seen: string[] = []
    const ran = await runShell(import.meta.dirname, 'pwd; echo oops >&2; exit 3', (output) => seen.push(output)).done
    expect(ran.output).toBe(`${import.meta.dirname}\noops\n`)
    // On a terminal of its own, as on macOS, the two come on one stream, the way a terminal shows them.
    if (process.platform !== 'darwin') {
      expect(ran.stdout).toBe(`${import.meta.dirname}\n`)
      expect(ran.stderr).toBe('oops\n')
    }
    expect(ran.code).toBe(3)
    expect(ran.stopped).toBe(false)
    expect(seen.at(-1)).toBe(ran.output)
  })

  it('waits for what is typed when it asks', async () => {
    const seen: string[] = []
    const running = runShell(import.meta.dirname, 'printf "Continue (Y/n)? "; read -r answer; echo "got $answer"', (output) => seen.push(output))
    await vi.waitFor(() => expect(seen.at(-1)).toBe('Continue (Y/n)? '), { timeout: 5000 })
    running.write?.('n\n')
    const ran = await running.done
    expect(ran.output).toMatch(/got n\n$/)
    expect(ran.code).toBe(0)
  })

  it('stops what it started', async () => {
    const running = runShell(import.meta.dirname, 'echo started; sleep 30', () => undefined)
    await new Promise((done) => setTimeout(done, 300))
    running.stop()
    const ran = await running.done
    expect(ran.stopped).toBe(true)
    // bash says something of its own on the way out, which zsh does not.
    expect(ran.output).toMatch(/^started\n/)
  })
})
